"""File-system layout for uploads and separated stems."""

from __future__ import annotations


import os
import shutil
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Base directory is configurable via env var — makes Docker volume mapping easy
BASE_DIR = Path(os.getenv("STORAGE_DIR", "/tmp/demucs_storage"))
UPLOADS_DIR = BASE_DIR / "uploads"
OUTPUTS_DIR = BASE_DIR / "outputs"


def ensure_dirs() -> None:
    """Create storage directories on startup."""
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(f"Storage dirs ready: {BASE_DIR}")


def get_upload_path(job_id: str, filename: str) -> Path:
    """Return path where the uploaded file should be saved."""
    job_dir = UPLOADS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    return job_dir / filename


def get_output_dir(job_id: str) -> Path:
    """Return directory where separated stems will be written."""
    out = OUTPUTS_DIR / job_id
    out.mkdir(parents=True, exist_ok=True)
    return out


def stem_file_path(job_id: str, stem_name: str) -> Path:
    """Absolute path for a specific stem wav."""
    return OUTPUTS_DIR / job_id / f"{stem_name}.wav"


def cleanup_job(job_id: str) -> None:
    """
    Remove all files for a job.
    Call this after stems have been transferred to permanent storage (e.g. R2/S3).
    """
    for directory in [UPLOADS_DIR / job_id, OUTPUTS_DIR / job_id]:
        if directory.exists():
            shutil.rmtree(directory)
            logger.info(f"Cleaned up: {directory}")
