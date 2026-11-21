"""Delete a finished job's narration clips: the final video.mp4 already contains the audio.

Voice clips are a shared cache (``rendering/public/audio/tts/<hash>.wav`` + ``.words-v2.json``, keyed by
voice + text), so a clip is kept when another job may still need it:

- a queued or running job's composition uses it, or
- it was used (touched) after this job's composition was written: another job reused it and may
  still be rendering with it.

Off with AUDIO_CLEANUP=false (keeps the cache: a re-render of the same text costs no Deepgram call).
"""
import json
import logging
import shutil
from pathlib import Path
from typing import Any, Iterable

from app.config import settings
from app.utils.job_paths import jobs_root
from app.utils.tts import TTS_DIR_IN_PUBLIC, tts_dir

log = logging.getLogger(__name__)

ENDED = {"done", "failed", "cancelled", "paused", "planned"}
SLACK_SECONDS = 2.0  # file-system time resolution


def compositions(job_folder: Path) -> list[Path]:
    """The job's own composition and its chapters' (long video)."""
    return [p for p in [job_folder / "composition.json", *sorted(job_folder.glob("chapters/*/composition.json"))] if p.is_file()]


def _clip_names(composition: Path) -> set[str]:
    try:
        spec = json.loads(composition.read_text())
    except (OSError, ValueError):
        return set()
    prefix = TTS_DIR_IN_PUBLIC + "/"
    return {src[len(prefix):] for s in spec.get("scenes", []) if isinstance(s, dict)
            for src in [(s.get("voice") or {}).get("src", "")] if isinstance(src, str) and src.startswith(prefix)}


def _status(folder: Path) -> str:
    for name in ("state.json", "status.json"):
        try:
            return str(json.loads((folder / name).read_text()).get("status") or "")
        except (OSError, ValueError):
            continue
    return ""


def _in_use(skip: Path) -> set[str]:
    """Clips used by jobs that are queued or running (not this one)."""
    used: set[str] = set()
    root = jobs_root()
    for folder in root.iterdir() if root.exists() else []:
        if folder.is_dir() and folder != skip and _status(folder) not in ENDED:
            for c in compositions(folder):
                used |= _clip_names(c)
    return used


def remove_job_audio(job_folder: Path) -> dict[str, Any]:
    """Delete the clips this job's compositions used, except those another job may need."""
    if not settings.AUDIO_CLEANUP:
        return {"removed": 0, "bytes": 0, "kept": 0}
    busy = _in_use(job_folder)
    removed = kept = size = 0
    for composition in compositions(job_folder):
        written = composition.stat().st_mtime
        for name in _clip_names(composition):
            wav = tts_dir() / name
            if not wav.exists():
                continue
            if name in busy or wav.stat().st_mtime > written + SLACK_SECONDS:
                kept += 1
                continue
            for f in _files(wav):
                size += f.stat().st_size
                f.unlink(missing_ok=True)
            removed += 1
    log.info("audio.cleanup job=%s removed=%d kept=%d freed_mb=%.1f", job_folder.name, removed, kept, size / 1e6)
    return {"removed": removed, "bytes": size, "kept": kept}


def remove_audio(job_folder: Path) -> None:
    """remove_job_audio for the end of a job: a cleanup problem never fails a finished video."""
    try:
        remove_job_audio(job_folder)
    except Exception as exc:  # noqa: BLE001
        log.warning("audio.cleanup.failed job=%s error=%s", job_folder.name, exc)


def remove_chapters(job_folder: Path) -> None:
    """Delete a long video's ``chapters/`` folder once the final video.mp4 is joined (LONG_KEEP_CHAPTERS=false).
    The chapter plans (chNN.plan.json) stay, so a later redo renders a chapter again from its plan."""
    chapters = job_folder / "chapters"
    if settings.LONG_KEEP_CHAPTERS or not chapters.is_dir() or not (job_folder / "video.mp4").is_file():
        return
    try:
        size = sum(f.stat().st_size for f in chapters.rglob("*") if f.is_file())
        shutil.rmtree(chapters)
        log.info("chapters.cleanup job=%s freed_mb=%.1f", job_folder.name, size / 1e6)
    except OSError as exc:  # a cleanup problem never fails a finished video
        log.warning("chapters.cleanup.failed job=%s error=%s", job_folder.name, exc)


def _files(wav: Path) -> Iterable[Path]:
    yield wav
    for words in wav.parent.glob(wav.stem + ".words*.json"):
        yield words
