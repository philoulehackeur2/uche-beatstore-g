"""Audio validation and metadata utilities."""

from __future__ import annotations


import logging
from pathlib import Path
from typing import Dict, Any

import torchaudio

logger = logging.getLogger(__name__)

# Formats natively readable by torchaudio (+ pydub fallback for mp3)
ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".aiff", ".aif", ".ogg", ".m4a"}

# Hard cap — Demucs can be memory-hungry; 200MB is generous
MAX_FILE_SIZE_MB = 200


def validate_audio_file(file_path: Path) -> None:
    """
    Raise ValueError if the file is unusable.
    Called before queuing the job so the user gets immediate feedback.
    """
    suffix = file_path.suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Unsupported format '{suffix}'. "
            f"Accepted: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    size_mb = file_path.stat().st_size / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise ValueError(
            f"File is {size_mb:.1f} MB — exceeds the {MAX_FILE_SIZE_MB} MB limit."
        )


def get_audio_info(file_path: Path) -> Dict[str, Any]:
    """
    Return basic metadata without fully decoding the file.
    Uses torchaudio.info() which is fast and format-agnostic.
    """
    try:
        info = torchaudio.info(str(file_path))
        duration = info.num_frames / info.sample_rate if info.sample_rate else 0
        return {
            "sample_rate": info.sample_rate,
            "num_channels": info.num_channels,
            "num_frames": info.num_frames,
            "duration_seconds": round(duration, 2),
            "encoding": info.encoding,
        }
    except Exception as exc:
        logger.warning(f"Could not read audio info from {file_path}: {exc}")
        return {"duration_seconds": None}
