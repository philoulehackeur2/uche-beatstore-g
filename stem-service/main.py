"""
Demucs Stem Separation Service — entrypoint.

Start locally:
    uvicorn main:app --host 0.0.0.0 --port 8001 --reload

Docker:
    docker compose up
"""

from __future__ import annotations


import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.utils.storage import ensure_dirs

# ---------------------------------------------------------------------------
# Logging — structured format, easy to pipe into CloudWatch / Datadog
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=== Demucs Stem Separation Service starting ===")
    ensure_dirs()
    yield
    logger.info("=== Demucs Stem Separation Service stopping ===")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Demucs Stem Separation API",
    description=(
        "AI-powered audio stem separation using the open-source Demucs model "
        "(https://github.com/adefossez/demucs). "
        "Supports HTDemucs and MDX variants."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — in production, replace "*" with your frontend domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")


# ---------------------------------------------------------------------------
# Dev runner
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=False,      # set True only for dev; reload resets in-memory jobs
        log_level="info",
    )
