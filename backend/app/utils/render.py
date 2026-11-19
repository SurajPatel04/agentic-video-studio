"""The backend drives rendering: narration → validate → Remotion render → MP4.

    spec = {...composition JSON...}            # scenes may have "narration": {"text": ...}
    result = await render_video(spec)          # voices it, validates, renders
    result.video                               # workspace/jobs/<id>/video.mp4

Each job gets its own folder in ``workspace/jobs/<id>/`` with ``composition.json`` (the exact
props rendered, voice filled in), ``render.log`` and ``video.mp4``.
"""

import asyncio
import copy
import json
import logging
import math
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.config import settings
from app.utils.console import step
from app.utils import cues, subtitles
from app.utils.iso import expand_continuations, paper_code_scenes
from app.utils.tts import synthesize, word_timings

log = logging.getLogger(__name__)

DEFAULT_TRANSITION_FRAMES = 15  # matches rendering/src/transitions.ts


class RenderError(RuntimeError):
    """Validation or Remotion failed; ``details`` has the useful output."""

    def __init__(self, message: str, details: str = ""):
        super().__init__(message)
        self.details = details


@dataclass
class RenderResult:
    job_id: str
    job_dir: Path
    composition: Path
    video: Path
    seconds: float
    voice_clips: int = 0
    voice_cached: int = 0
    log: list[str] = field(default_factory=list)
    subtitles: Path | None = None  # captions.srt (captions.vtt next to it), when the narration has words
    captions_mode: str = ""


def _transition_into(spec: dict[str, Any], i: int) -> int:
    """Frames the transition into scene ``i`` overlaps the previous scene."""
    scenes = spec.get("scenes", [])
    if i <= 0 or i >= len(scenes):
        return 0
    t = scenes[i].get("transition") or spec.get("defaultTransition") or {"type": "none"}
    return 0 if t.get("type") == "none" else int(t.get("durationInFrames", DEFAULT_TRANSITION_FRAMES))


def captions_enabled(spec: dict[str, Any]) -> bool:
    """Captions are on unless the composition says ``"captions": {"enabled": false}`` (or ``false``)."""
    c = spec.get("captions", True)
    return bool(c.get("enabled", True)) if isinstance(c, dict) else bool(c)


def apply_brand(spec: dict[str, Any]) -> dict[str, Any]:
    """Fill in the "brand" key from BRAND_* settings when the JSON does not set it."""
    if "brand" not in spec:
        if not settings.BRAND_ENABLED:
            spec["brand"] = False
        elif not (settings.BRAND_INTRO and settings.BRAND_WATERMARK):
            spec["brand"] = {"intro": settings.BRAND_INTRO, "watermark": settings.BRAND_WATERMARK}
    return spec


def without_intro(spec: dict[str, Any]) -> dict[str, Any]:
    """Keep the corner logo but drop the logo intro (chapters after the first of a long video)."""
    spec = apply_brand(spec)
    brand = spec.get("brand", True)
    if brand is not False:
        spec["brand"] = {**(brand if isinstance(brand, dict) else {}), "intro": False}
    return spec


def default_caption_mode() -> str:
    """Drawn captions always; plus a player subtitle track when CAPTIONS_PLAYER_TRACK is on."""
    return "both" if settings.CAPTIONS_PLAYER_TRACK else "burn"


def set_caption_mode(spec: dict[str, Any], mode: str | None = None) -> dict[str, Any]:
    """Write the caption mode into the JSON (renderer reads it): argument, else JSON, else from settings."""
    if not captions_enabled(spec):
        return spec
    c = spec.get("captions")
    c = dict(c) if isinstance(c, dict) else {}
    if mode in subtitles.MODES:
        c["mode"] = mode
    elif c.get("mode") not in subtitles.MODES:
        c["mode"] = default_caption_mode()
    spec["captions"] = c
    return spec


def set_captions(spec: dict[str, Any], enabled: bool | None) -> dict[str, Any]:
    """Override the composition's caption switch (None = keep what the JSON says)."""
    if enabled is None:
        return spec
    spec = copy.deepcopy(spec)
    current = spec.get("captions")
    spec["captions"] = {**(current if isinstance(current, dict) else {}), "enabled": enabled}
    return spec


async def add_narration(spec: dict[str, Any], *, captions: bool | None = None) -> tuple[dict[str, Any], int, int, list[str]]:
    """Turn each scene's ``narration`` into a ``voice`` clip and make the scene long enough for it.

    With captions on, also stores when each word is spoken (``voice.words``, scene frames).
    Returns (new spec, clips made, clips cached, log lines). The input is not modified.
    """
    spec = set_captions(spec, captions)
    show_words = captions_enabled(spec)
    want_words = show_words or cues.has_cues(spec)  # word cues need the spoken word times too
    spec = copy.deepcopy(spec)
    fps = int(spec.get("fps", 30))
    default_voice = (spec.get("audio") or {}).get("voice") or settings.TTS_VOICE
    scenes = spec.get("scenes", [])
    made = cached = 0
    lines: list[str] = []

    jobs = [(i, s) for i, s in enumerate(scenes) if (s.get("narration") or {}).get("text")]
    clips, timings = [], []
    if jobs:
        with step("voice (Deepgram TTS)", clips=len(jobs), voice=default_voice) as st:
            clips = await asyncio.gather(*(synthesize(sc["narration"]["text"], sc["narration"].get("voice") or default_voice) for _, sc in jobs))
            st.update(new=sum(not c.cached for c in clips), cached=sum(c.cached for c in clips), audio=f"{sum(c.seconds for c in clips):.0f}s")
    if jobs and want_words:
        with step("caption timings (Deepgram STT)", clips=len(jobs)) as st:
            timings = await asyncio.gather(*(word_timings(clip, sc["narration"]["text"]) for (_, sc), clip in zip(jobs, clips)))
            st["words"] = sum(len(t) for t in timings)
    else:
        timings = [None] * len(jobs)

    for (i, scene), clip, words in zip(jobs, clips, timings):
        delay = int(scene["narration"].get("delay", 10))
        transition = scene.get("transition") or spec.get("defaultTransition") or {}
        if transition.get("type") in {"wipe", "fade"} and (overlap := _transition_into(spec, i)):
            delay = max(delay, overlap + 3)  # Captions.tsx shows the first line up to three frames early.
        frames = math.ceil(clip.seconds * fps)
        scene["voice"] = {**(scene.get("voice") or {}), "src": clip.src, "startAt": delay, "frames": frames}
        scene["voice"].pop("words", None)
        if words:
            # scene-relative frames, so the renderer can show and highlight each word on time
            scene["voice"]["words"] = [
                {"t": w.text, "s": delay + round(w.start * fps), "e": delay + max(round(w.start * fps) + 1, round(w.end * fps))}
                for w in words
            ]
        needed = delay + frames + 12 + _transition_into(spec, i + 1)  # speech + breath + next transition
        before = scene.get("durationInFrames")
        if not before or before < needed:
            scene["durationInFrames"] = needed
        cached += clip.cached
        made += not clip.cached
        lines.append(f"{scene.get('id')}: {clip.seconds:.1f}s speech, {before} -> {scene['durationInFrames']} frames")
    # Steps cued to words now land on the real spoken time of that word.
    for scene in scenes:
        missing = cues.resolve_scene(scene)
        if missing:
            lines.append(f"{scene.get('id')}: cues not heard in the narration (kept estimated): {', '.join(missing)}")
        if not show_words and isinstance(scene.get("voice"), dict):
            scene["voice"].pop("words", None)  # captions off: the times were only needed for the cues
    return spec, made, cached, lines


async def _run(cmd: list[str], timeout: float) -> tuple[int, str]:
    proc = await asyncio.create_subprocess_exec(
        *cmd, cwd=settings.RENDERING_DIR, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT
    )
    try:
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise RenderError(f"timed out after {timeout:.0f}s: {' '.join(cmd[:3])}")
    return proc.returncode or 0, out.decode(errors="replace")


async def validate(composition_file: Path) -> None:
    """Check the JSON against every scene contract (rendering/scripts/validate-composition.mjs)."""
    with step("validate", file=composition_file.name) as s:
        code, out = await _run(["node", "scripts/validate-composition.mjs", str(composition_file)], timeout=120)
        if code != 0:
            errors = "\n".join(l for l in out.splitlines() if l.startswith("  ") or l.startswith("✗"))
            log.warning("validation errors:\n%s", errors or out[-2000:])
            raise RenderError("composition is invalid", errors or out[-2000:])
        s["ok"] = True


async def render_video(
    spec: dict[str, Any],
    *,
    narrate: bool = True,
    captions: bool | None = None,
    job_id: str | None = None,
    scale: float = 1.0,
    concurrency: int | None = None,
    captions_mode: str | None = None,
) -> RenderResult:
    """Voice the narration (Deepgram), validate, and render the composition to MP4.

    ``captions``: True / False forces subtitles on or off; None keeps the JSON's setting (default on).
    ``captions_mode``: burn (in the picture) | track (player can switch it) | both; None = JSON, else CAPTIONS_PLAYER_TRACK (burn / both).
    """
    job_id = job_id or uuid.uuid4().hex[:12]
    job_dir = settings.WORKSPACE_DIR / "jobs" / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()

    spec = expand_continuations(copy.deepcopy(spec))  # hand-written plans may request continuations too
    spec = paper_code_scenes(spec)  # paper-style video: no dark CodeScene
    spec = apply_brand(spec)
    made = cached = 0
    lines: list[str] = []
    if narrate:
        spec, made, cached, lines = await add_narration(spec, captions=captions)
    else:
        spec = set_captions(spec, captions)
    spec = set_caption_mode(spec, captions_mode)
    spec, _ = cues.resolve(spec)  # word cues left (no narration / narrate off): estimated from the text

    composition = job_dir / "composition.json"
    composition.write_text(json.dumps(spec, indent=2))
    await validate(composition)

    video = job_dir / "video.mp4"
    cmd = ["npx", "remotion", "render", "src/index.ts", "VideoComposition", str(video), f"--props={composition}", "--gl=angle"]
    if scale != 1.0:
        cmd.append(f"--scale={scale}")
    if concurrency:
        cmd.append(f"--concurrency={concurrency}")  # Remotion threads (default: half the cores)
    frames = sum(int(sc.get("durationInFrames", 0)) for sc in spec.get("scenes", []))
    with step("remotion render", job=job_id, scenes=len(spec.get("scenes", [])), frames=frames, scale=scale, threads=concurrency) as s:
        code, out = await _run(cmd, timeout=settings.RENDER_TIMEOUT_SECONDS)
        (job_dir / "render.log").write_text(out)
        if code != 0 or not video.exists():
            tail = "\n".join(l for l in out.splitlines() if "Deprecation" not in l and "require(" not in l)[-3000:]
            raise RenderError("Remotion render failed", tail)
        s.update(video=str(video), size=f"{video.stat().st_size / 1e6:.1f}MB")

    srt, mode = await add_subtitles(spec, job_dir, video)
    if items := subtitles.transcript(spec):  # what is said, with times (even when captions are off)
        subtitles.write_transcript(items, job_dir)
    seconds = time.perf_counter() - started
    log.info("render.ok job=%s voice_new=%d voice_cached=%d took_s=%.1f", job_id, made, cached, seconds)
    return RenderResult(job_id, job_dir, composition, video, seconds, made, cached, lines, srt, mode)


async def add_subtitles(spec: dict[str, Any], job_dir: Path, video: Path) -> tuple[Path | None, str]:
    """Write captions.srt / .vtt and, for mode track / both, add them to the MP4 as a switchable track."""
    if not captions_enabled(spec):
        return None, ""
    items = subtitles.cues(spec)
    if not items:
        return None, ""
    mode = subtitles.caption_mode(spec, default_caption_mode())
    srt, _ = subtitles.write_files(items, job_dir)
    if mode in ("track", "both"):
        with step("subtitle track", mode=mode, lines=len(items)) as s:
            raw = video.with_name("video.raw.mp4")
            video.replace(raw)
            code, out = await _run(subtitles.mux_args(raw, srt, video, shown=mode == "track"), timeout=300)
            if code != 0 or not video.exists():
                raw.replace(video)  # keep the video without the track rather than failing the job
                log.warning("subtitle track failed: %s", out[-1500:])
                s["ok"] = False
            else:
                raw.unlink()
                s["ok"] = True
    return srt, mode
