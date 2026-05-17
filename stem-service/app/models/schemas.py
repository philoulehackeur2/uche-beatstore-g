"""Pydantic request/response schemas."""

from __future__ import annotations


from enum import Enum
from typing import Dict, Optional
from pydantic import BaseModel


class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    DONE = "done"
    ERROR = "error"


class SeparateResponse(BaseModel):
    job_id: str
    status: JobStatus
    message: str


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    progress: int          # 0-100
    stems: Dict[str, str]  # stem_name -> download URL (empty until done)
    error: Optional[str] = None
    model: str
    duration_seconds: Optional[float] = None


class HealthResponse(BaseModel):
    status: str
    service: str
    gpu_available: bool
    device: str
