# Antigravity — Demucs Stem Separation Service

A production-ready FastAPI wrapper around the open-source
[Demucs](https://github.com/adefossez/demucs) model for audio stem separation.

## Quick Start (local dev)

```bash
cd stem-service

# 1. Create virtualenv
python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate

# 2. Install PyTorch (CPU-only — fast to install)
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu

# 3. Install the rest
pip install -r requirements.txt

# 4. Run the service
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

API docs: http://localhost:8001/docs

---

## Quick Start (Docker)

```bash
cd stem-service
docker compose up --build
```

For GPU support, uncomment the NVIDIA runtime block in `docker-compose.yml` and
change `TORCH_INDEX` to `https://download.pytorch.org/whl/cu121`.

---

## API Reference

### `POST /api/v1/separate`

Upload an audio file to start stem separation.

```
curl -X POST http://localhost:8001/api/v1/separate \
  -F "file=@/path/to/track.mp3" \
  -F "model=htdemucs"
```

Response:
```json
{ "job_id": "abc-123", "status": "pending", "message": "..." }
```

### `GET /api/v1/jobs/{job_id}`

Poll progress. Returns `progress` 0–100 and `stems` URLs when done.

```
curl http://localhost:8001/api/v1/jobs/abc-123
```

### `GET /api/v1/stems/{job_id}/{stem_name}`

Download a separated stem WAV.

```
curl -O http://localhost:8001/api/v1/stems/abc-123/vocals
curl -O http://localhost:8001/api/v1/stems/abc-123/drums
curl -O http://localhost:8001/api/v1/stems/abc-123/bass
curl -O http://localhost:8001/api/v1/stems/abc-123/other
```

### `GET /api/v1/health`

Liveness + GPU check.

---

## Models

| Model          | Quality   | Speed (CPU) | Stems |
|----------------|-----------|-------------|-------|
| `htdemucs`     | ★★★★☆    | ~3×RT       | 4     |
| `htdemucs_ft`  | ★★★★★    | ~4×RT       | 4     |
| `htdemucs_6s`  | ★★★★☆    | ~5×RT       | 6     |
| `mdx_extra`    | ★★★☆☆    | ~2×RT       | 4     |

RT = realtime. A 3-minute song at 3×RT takes ~9 minutes on CPU.
With a mid-range GPU (RTX 3070) separation takes ~20–30 seconds.

---

## Integration with Antigravity

The Next.js app calls the service via:
- `POST /api/stems` — kicks off a job
- `GET /api/stems/[jobId]` — polls progress
- `GET /api/stems/[jobId]/[stemName]` — proxied WAV download

Set `DEMUCS_SERVICE_URL=http://localhost:8001` in your Next.js `.env.local`.
