# -----------------------------------------------------------------------
# Stage 1 — Python deps
# Using slim to keep image small; ffmpeg is needed by torchaudio + pydub
# -----------------------------------------------------------------------
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# System deps: ffmpeg (audio decoding), libsndfile1 (soundfile), git (demucs install)
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        libsndfile1 \
        git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /service

# -----------------------------------------------------------------------
# Install Python deps
# CPU-only torch is used here — for GPU, override with:
#   --build-arg TORCH_INDEX=https://download.pytorch.org/whl/cu121
# -----------------------------------------------------------------------
ARG TORCH_INDEX=https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install torch torchaudio --index-url ${TORCH_INDEX} \
 && pip install -r requirements.txt

# -----------------------------------------------------------------------
# Pre-download HTDemucs model weights (~200MB) at build time.
# This avoids first-request latency; weights are baked into the image layer.
# -----------------------------------------------------------------------
RUN python - <<'EOF'
import logging
logging.basicConfig(level=logging.INFO)
from demucs.api import Separator
Separator(model="htdemucs")
print("HTDemucs model pre-loaded successfully.")
EOF

# -----------------------------------------------------------------------
# Copy application code (after deps so layer cache is reused on code changes)
# -----------------------------------------------------------------------
COPY . .

# Storage volume — mount a named volume here for persistence
VOLUME ["/tmp/demucs_storage"]
ENV STORAGE_DIR=/tmp/demucs_storage

EXPOSE 8001

# Single worker — Demucs uses its own thread pool internally.
# Scale horizontally (multiple containers) rather than with multiple uvicorn workers.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
