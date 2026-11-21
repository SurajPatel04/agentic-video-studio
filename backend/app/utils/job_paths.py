"""One job id = one folder: ``workspace/jobs/<id>/`` holds every file of that job and its one main video.

A long video's chapter renders live inside it (``jobs/<id>/chapters/ch01/``). Their ids stay
``long-<id>-ch01`` (saved in older job states too), and this maps them to that nested folder.
"""
import re
from pathlib import Path

from app.config import settings

CHAPTER_ID = re.compile(r"^long-(?P<parent>.+)-ch(?P<n>\d{2,})$")


def jobs_root() -> Path:
    return settings.WORKSPACE_DIR / "jobs"


def chapter_job_id(parent: str, n: int) -> str:
    return f"long-{parent}-ch{n:02d}"


def job_dir(job_id: str) -> Path:
    m = CHAPTER_ID.match(job_id)
    if m:
        return jobs_root() / m["parent"] / "chapters" / f"ch{m['n']}"
    return jobs_root() / job_id
