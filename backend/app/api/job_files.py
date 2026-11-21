import re
from pathlib import Path

from fastapi import HTTPException

from app.utils.job_paths import job_dir


CAPTIONS_MEDIA = {"vtt": "text/vtt", "srt": "application/x-subrip"}
TRANSCRIPT_MEDIA = {"json": "application/json", "txt": "text/plain; charset=utf-8"}


def job_file(job_id: str, name: str) -> Path:
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", job_id):
        raise HTTPException(status_code=400, detail="bad job id")
    path = job_dir(job_id) / name
    if not path.exists():
        raise HTTPException(status_code=404, detail="not found")
    return path
