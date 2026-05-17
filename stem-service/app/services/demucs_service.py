"""
Demucs stem separation service.

Uses the official demucs Python API (demucs.api.Separator) — no reimplementation.
Jobs run in a background thread pool so the FastAPI event loop stays unblocked.
The job store is in-process dict; swap for Redis in multi-worker deployments.
"""

from __future__ import annotations


import logging
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, Optional

import torch
import torchaudio

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-process job store (thread-safe)
# ---------------------------------------------------------------------------
_jobs: Dict[str, Dict[str, Any]] = {}
_jobs_lock = threading.Lock()


def _set_job(job_id: str, **fields: Any) -> None:
    with _jobs_lock:
        if job_id in _jobs:
            _jobs[job_id].update(fields)


# ---------------------------------------------------------------------------
# Thread pool — max_workers=2 keeps RAM usage bounded on consumer hardware.
# Increase for multi-GPU servers.
# ---------------------------------------------------------------------------
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="demucs")


# ---------------------------------------------------------------------------
# DemucsService
# ---------------------------------------------------------------------------
class DemucsService:
    """
    Wraps demucs.api.Separator with:
    - Lazy model loading (first job triggers download/load)
    - Per-job progress tracking
    - Thread-safe singleton model cache
    """

    def __init__(
        self,
        default_model: str = "htdemucs",
        device: str = "auto",
    ) -> None:
        self.default_model = default_model
        self.device = self._resolve_device(device)

        # Separators are expensive to load — cache one per model name
        self._separators: Dict[str, Any] = {}
        self._sep_lock = threading.Lock()

        logger.info(
            "DemucsService created — model=%s  device=%s",
            default_model,
            self.device,
        )

    # ------------------------------------------------------------------
    # Device resolution
    # ------------------------------------------------------------------
    def _resolve_device(self, device: str) -> str:
        if device != "auto":
            return device
        if torch.cuda.is_available():
            logger.info("GPU detected: using CUDA")
            return "cuda"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            logger.info("Apple Silicon detected: using MPS")
            return "mps"
        logger.info("No GPU — falling back to CPU (separation will be slower)")
        return "cpu"

    # ------------------------------------------------------------------
    # Separator cache
    # ------------------------------------------------------------------
    def _get_separator(self, model_name: str) -> Any:
        """
        Lazy-load and cache a Separator for the given model.
        Thread-safe: only one thread loads a given model at a time.
        """
        with self._sep_lock:
            if model_name not in self._separators:
                logger.info("Loading Demucs model '%s' …", model_name)
                # Import here so the service file can be imported without torch installed
                from demucs.api import Separator  # type: ignore

                sep = Separator(
                    model=model_name,
                    device=self.device,
                    # shifts=1 gives a small quality bump at 2× speed cost
                    shifts=1,
                    # split=True lets Demucs process files longer than its
                    # segment length by chunking them automatically
                    split=True,
                    overlap=0.25,
                    progress=False,  # We track progress ourselves
                )
                self._separators[model_name] = sep
                logger.info("Model '%s' loaded and cached", model_name)
            return self._separators[model_name]

    # ------------------------------------------------------------------
    # Public: submit a job
    # ------------------------------------------------------------------
    def submit(
        self,
        input_path: Path,
        output_dir: Path,
        model_name: Optional[str] = None,
    ) -> str:
        """
        Enqueue a separation job. Returns the job_id immediately.
        The caller can poll get_job(job_id) for progress.
        """
        model_name = model_name or self.default_model
        job_id = str(uuid.uuid4())

        with _jobs_lock:
            _jobs[job_id] = {
                "job_id": job_id,
                "status": "pending",
                "progress": 0,
                "stems": {},          # stem_name -> absolute path (when done)
                "error": None,
                "model": model_name,
                "created_at": time.time(),
            }

        _executor.submit(self._run, job_id, input_path, output_dir, model_name)
        logger.info("Job %s submitted — model=%s  file=%s", job_id, model_name, input_path.name)
        return job_id

    # ------------------------------------------------------------------
    # Internal: run separation in worker thread
    # ------------------------------------------------------------------
    def _run(
        self,
        job_id: str,
        input_path: Path,
        output_dir: Path,
        model_name: str,
    ) -> None:
        try:
            _set_job(job_id, status="processing", progress=5)

            # --- Load model (cached after first call) ---
            separator = self._get_separator(model_name)
            _set_job(job_id, progress=15)

            # --- Run separation ---
            logger.info("Job %s: running separation …", job_id)

            # Build a progress callback that maps chunk progress → 15..80 range
            total_chunks: list = [1]  # mutable container for closure

            def _on_progress(data: Dict[str, Any]) -> None:
                state = data.get("state", "")
                if state == "start":
                    total_chunks[0] = max(data.get("total_chunks", 1), 1)
                elif state == "chunk_end":
                    chunk = data.get("chunk", 0)
                    pct = 15 + int(65 * (chunk / total_chunks[0]))
                    _set_job(job_id, progress=min(pct, 79))

            # separate_audio_file is the official high-level entry point.
            # Returns: (origin_waveform, {stem_name: tensor, …})
            origin, separated = separator.separate_audio_file(
                input_path,
                callback=_on_progress,
            )

            _set_job(job_id, progress=80)

            # --- Save stems ---
            output_dir.mkdir(parents=True, exist_ok=True)
            stem_paths: Dict[str, str] = {}

            for stem_name, tensor in separated.items():
                out_path = output_dir / f"{stem_name}.wav"
                # Demucs tensors are (channels, samples) on whatever device was used
                torchaudio.save(
                    str(out_path),
                    tensor.cpu(),          # move to CPU before writing
                    separator.samplerate,
                    encoding="PCM_S",
                    bits_per_sample=16,
                )
                stem_paths[stem_name] = str(out_path)
                logger.debug("Job %s: saved %s.wav", job_id, stem_name)

            _set_job(job_id, status="done", progress=100, stems=stem_paths)
            logger.info(
                "Job %s complete — stems: %s",
                job_id,
                list(stem_paths.keys()),
            )

        except Exception as exc:
            logger.exception("Job %s failed: %s", job_id, exc)
            _set_job(job_id, status="error", error=str(exc))

    # ------------------------------------------------------------------
    # Query helpers (static — no model state needed)
    # ------------------------------------------------------------------
    @staticmethod
    def get_job(job_id: str) -> Optional[Dict[str, Any]]:
        with _jobs_lock:
            job = _jobs.get(job_id)
            return dict(job) if job else None

    @staticmethod
    def list_jobs() -> list:
        with _jobs_lock:
            return [dict(j) for j in _jobs.values()]

    def health(self) -> Dict[str, Any]:
        return {
            "status": "ok",
            "service": "demucs-stem-separator",
            "gpu_available": torch.cuda.is_available(),
            "device": self.device,
            "loaded_models": list(self._separators.keys()),
        }
