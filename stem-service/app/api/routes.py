"""FastAPI route definitions — pure API logic, no ML code here."""

from __future__ import annotations


import logging
from pathlib import Path
from typing import Annotated, Optional

import aiofiles
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.models.schemas import HealthResponse, JobResponse, JobStatus, SeparateResponse
from app.services.demucs_service import DemucsService
from app.utils.audio import get_audio_info, validate_audio_file
from app.utils.storage import get_output_dir, get_upload_path

logger = logging.getLogger(__name__)
router = APIRouter()

# ---------------------------------------------------------------------------
# Singleton service — model weights live in memory between requests.
# Instantiated here (not in main.py) so imports stay clean.
# ---------------------------------------------------------------------------
_svc: Optional[DemucsService] = None


def get_svc() -> DemucsService:
    global _svc
    if _svc is None:
        _svc = DemucsService()
    return _svc


# ---------------------------------------------------------------------------
# POST /separate
# ---------------------------------------------------------------------------
@router.post("/separate", response_model=SeparateResponse, status_code=202)
async def separate(
    file: Annotated[UploadFile, File(description="Audio file (wav/mp3/flac/aiff)")],
    model: Annotated[str, Form()] = "htdemucs",
):
    """
    Upload an audio file and start async stem separation.

    Returns a `job_id` immediately. Poll `GET /jobs/{job_id}` for progress.

    Supported models:
    - `htdemucs`      — default, best overall quality
    - `htdemucs_ft`   — fine-tuned, slightly better on speech/vocals
    - `htdemucs_6s`   — 6-stem variant (adds guitar + piano)
    - `mdx_extra`     — older MDCT-based model, faster on CPU
    """
    # --- Save upload to disk (stream in 1 MB chunks to handle large files) ---
    original_name = file.filename or "audio"
    suffix = Path(original_name).suffix or ".wav"

    svc = get_svc()
    job_id = _reserve_job_id(svc, model)

    upload_path = get_upload_path(job_id, f"input{suffix}")

    try:
        async with aiofiles.open(upload_path, "wb") as fp:
            while chunk := await file.read(1024 * 1024):  # 1 MB chunks
                await fp.write(chunk)
    except Exception as exc:
        logger.error("Upload write failed for job %s: %s", job_id, exc)
        upload_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Failed to save uploaded file.")

    # --- Validate (format + size) ---
    try:
        validate_audio_file(upload_path)
    except ValueError as exc:
        upload_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(exc))

    info = get_audio_info(upload_path)
    logger.info(
        "Job %s: received '%s'  %.1fs  %dHz",
        job_id,
        original_name,
        info.get("duration_seconds") or 0,
        info.get("sample_rate") or 0,
    )

    # --- Submit to background worker ---
    output_dir = get_output_dir(job_id)
    svc.submit(upload_path, output_dir, model_name=model)

    return SeparateResponse(
        job_id=job_id,
        status=JobStatus.PENDING,
        message="Separation job queued. Poll /jobs/{job_id} for progress.",
    )


def _reserve_job_id(svc: DemucsService, model: str) -> str:
    """Submit a dummy pre-job to reserve an ID before writing the file."""
    # We bypass submit() here and use uuid directly so we can name the upload dir
    import uuid
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# GET /jobs/{job_id}
# ---------------------------------------------------------------------------
@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str):
    """
    Poll the status of a separation job.

    When `status == "done"`, the `stems` dict contains download paths like:
    `{ "vocals": "/api/v1/stems/{job_id}/vocals", … }`
    """
    job = DemucsService.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")

    # Map file paths → download URL paths (only expose URLs, not server paths)
    stems_urls: dict[str, str] = {}
    if job["status"] == "done":
        for stem_name in job["stems"]:
            stems_urls[stem_name] = f"/api/v1/stems/{job_id}/{stem_name}"

    return JobResponse(
        job_id=job_id,
        status=job["status"],
        progress=job["progress"],
        stems=stems_urls,
        error=job.get("error"),
        model=job.get("model", "htdemucs"),
    )


# ---------------------------------------------------------------------------
# GET /stems/{job_id}/{stem_name}  — file download
# ---------------------------------------------------------------------------
@router.get("/stems/{job_id}/{stem_name}")
async def download_stem(job_id: str, stem_name: str):
    """
    Download a separated stem WAV file.
    Only available after the job status is `done`.
    """
    job = DemucsService.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    if job["status"] != "done":
        raise HTTPException(
            status_code=409,
            detail=f"Job not complete — current status: {job['status']}",
        )

    file_path = job["stems"].get(stem_name)
    if not file_path or not Path(file_path).exists():
        available = list(job["stems"].keys())
        raise HTTPException(
            status_code=404,
            detail=f"Stem '{stem_name}' not found. Available: {available}",
        )

    return FileResponse(
        path=file_path,
        media_type="audio/wav",
        filename=f"{stem_name}.wav",
    )


# ---------------------------------------------------------------------------
# GET /jobs  — list all jobs (useful for admin/debug)
# ---------------------------------------------------------------------------
@router.get("/jobs")
async def list_jobs():
    """List all jobs (debug endpoint — remove or auth-protect in production)."""
    return DemucsService.list_jobs()


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------
@router.get("/health", response_model=HealthResponse)
async def health():
    """Liveness check — also reports GPU availability and loaded models."""
    return get_svc().health()
