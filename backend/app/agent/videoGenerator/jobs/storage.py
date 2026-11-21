from pathlib import Path

from app.config import settings
from app.utils.job_paths import CHAPTER_ID, chapter_job_id, job_dir, jobs_root

__all__ = ["chapter_job_id", "job_dir", "jobs_root", "migrate_job_storage"]


def migrate_job_storage() -> int:
    """Move legacy job directories while the API and workers are stopped: ``workspace/long/<id>`` and
    ``workspace/components/<id>`` into ``workspace/jobs/<id>``, and chapter renders that sit beside
    their long job (``jobs/long-<id>-ch01``) into it (``jobs/<id>/chapters/ch01``)."""
    roots = [settings.WORKSPACE_DIR / name for name in ("long", "components")]
    roots = [root for root in roots if root.exists()]
    moves: dict[Path, Path] = {}
    sources = [source for root in roots for source in sorted(root.iterdir())]
    if jobs_root().exists():
        sources += [p for p in sorted(jobs_root().iterdir()) if CHAPTER_ID.match(p.name) and p.is_dir()]
    for source in sources:
        target = job_dir(source.name)
        if target == source:
            continue
        if not source.is_dir() or source.is_symlink():
            raise ValueError(f"Unexpected entry in legacy job storage: {source}")
        if target.exists() or target.is_symlink() or target in moves:
            raise FileExistsError(f"Job destination already exists or is duplicated: {target}")
        moves[target] = source

    for target, source in moves.items():
        target.parent.mkdir(parents=True, exist_ok=True)
        source.rename(target)
    for root in roots:
        root.rmdir()
    return len(moves)
