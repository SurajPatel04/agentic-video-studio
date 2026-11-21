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
import os
import re
import signal
import tempfile
import time
import uuid
import wave
from collections.abc import Callable
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
HIGHLIGHT_MARKUP = re.compile(r"==[^=\n]+==")


def _needs_spoken_words(scene: dict[str, Any]) -> bool:
    props = scene.get("props") or {}
    if scene.get("component") != "ExplainScene":
        return False
    return bool(props.get("pointCues")) or any(
        isinstance(text, str) and HIGHLIGHT_MARKUP.search(text) for text in (props.get("heading"), props.get("body"))
    )


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
    processing_seconds: dict[str, float] = field(default_factory=dict)


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

    Stores word timings for captions and narration synced highlights.
    Returns (new spec, clips made, clips cached, log lines). The input is not modified.
    """
    spec = set_captions(spec, captions)
    show_words = captions_enabled(spec)
    spec = copy.deepcopy(spec)
    fps = int(spec.get("fps", 30))
    default_voice = (spec.get("audio") or {}).get("voice") or settings.TTS_VOICE
    scenes = spec.get("scenes", [])
    made = cached = 0
    lines: list[str] = []

    async def prepare_voice(i: int, scene: dict[str, Any]):
        narration = scene["narration"]
        try:
            clip = await synthesize(narration["text"], narration.get("voice") or default_voice)
            words = await word_timings(clip, narration["text"]) if (
                show_words or _needs_spoken_words(scene) or cues.has_cues(scene)
            ) else []
        except Exception as exc:
            raise RenderError(f"Scene {i + 1} ({scene['id']}) audio preparation failed", str(exc)) from exc
        return i, scene, clip, words

    jobs = [(i, s) for i, s in enumerate(scenes) if (s.get("narration") or {}).get("text")]
    prepared = []
    if jobs:
        with step("scene narration and word timings", scenes=len(jobs), voice=default_voice) as st:
            prepared = await asyncio.gather(*(prepare_voice(i, scene) for i, scene in jobs))
            st.update(new=sum(not clip.cached for _, _, clip, _ in prepared),
                      cached=sum(clip.cached for _, _, clip, _ in prepared),
                      words=sum(len(words) for _, _, _, words in prepared))

    for i, scene, clip, words in prepared:
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
        pause = math.ceil(scene["narration"].get("pauseAfterSeconds", 0) * fps)
        needed = delay + frames + max(12, pause) + _transition_into(spec, i + 1)
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
        if not show_words and not _needs_spoken_words(scene) and isinstance(scene.get("voice"), dict):
            scene["voice"].pop("words", None)
    return spec, made, cached, lines


async def _run(cmd: list[str], timeout: float, on_output: Callable[[str], None] | None = None) -> tuple[int, str]:
    isolated = os.name == "posix"
    proc = await asyncio.create_subprocess_exec(
        *cmd, cwd=settings.RENDERING_DIR, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
        start_new_session=isolated,
    )
    async def collect_output() -> str:
        if on_output is None:
            out, _ = await proc.communicate()
            return out.decode(errors="replace")
        assert proc.stdout is not None
        lines = []
        async for raw in proc.stdout:
            line = raw.decode(errors="replace")
            on_output(line)
            lines.append(line)
        await proc.wait()
        return "".join(lines)

    try:
        output = await asyncio.wait_for(collect_output(), timeout=timeout)
    except (asyncio.TimeoutError, asyncio.CancelledError) as exc:
        try:
            if isolated:
                os.killpg(proc.pid, signal.SIGKILL)
            elif proc.returncode is None:
                proc.kill()
        except ProcessLookupError:
            pass
        await proc.communicate()
        if isinstance(exc, asyncio.CancelledError):
            raise
        raise RenderError(f"timed out after {timeout:.0f}s: {' '.join(cmd[:3])}") from exc
    return proc.returncode or 0, output


async def validate(composition_file: Path) -> None:
    """Check the JSON against every scene contract (rendering/scripts/validate-composition.mjs)."""
    with step("validate", file=composition_file.name) as s:
        code, out = await _run(["node", "scripts/validate-composition.mjs", str(composition_file)], timeout=120)
        if code != 0:
            errors = "\n".join(l for l in out.splitlines() if l.startswith("  ") or l.startswith("✗"))
            log.warning("validation errors:\n%s", errors or out[-2000:])
            raise RenderError("composition is invalid", errors or out[-2000:])
        s["ok"] = True


def _join_scene_audio(chunks: Path, boundaries: list[int], fps: int) -> Path:
    """Concatenate PCM by exact frame boundaries, then let FFmpeg encode AAC once."""
    soundtrack = chunks / "soundtrack.wav"
    sample_rate = 48000
    with wave.open(str(soundtrack), "wb") as output:
        output.setparams((2, 2, sample_rate, 0, "NONE", "not compressed"))
        for index, (start, end) in enumerate(zip(boundaries, boundaries[1:]), 1):
            samples = round(end * sample_rate / fps) - round(start * sample_rate / fps)
            try:
                with wave.open(str(chunks / f"scene-{index:05d}.wav"), "rb") as clip:
                    if (clip.getnchannels(), clip.getsampwidth(), clip.getframerate()) != (2, 2, sample_rate):
                        raise RenderError(f"Scene {index} audio has an unexpected format")
                    output.writeframesraw(clip.readframes(samples).ljust(samples * 4, b"\x00"))
            except (OSError, EOFError, wave.Error) as exc:
                raise RenderError(f"Scene {index} audio could not be joined", str(exc)) from exc
    return soundtrack


async def _render_scene_ranges(spec: dict[str, Any], composition: Path, video: Path, *,
                               scale: float, concurrency: int | None) -> None:
    """Render individual scene ranges against the full timeline and join them without re-encoding."""
    starts = subtitles._scene_starts(spec, spec["fps"])
    render_log = video.with_name("render.log")
    with tempfile.TemporaryDirectory(prefix="scene-render-", dir=video.parent) as work:
        chunks = Path(work)
        from app.agent.videoGenerator.jobs.scene_stream import active
        stream = active.get()
        reused = stream.reuse(spec, chunks) if stream else 0
        if reused:
            log.info("%s · Reusing %d verified streamed scene ranges", video.parent.name, reused)
        command = ["node", "scripts/render-scenes.mjs", str(composition), work, json.dumps(starts),
                   str(scale), str(concurrency or 0), str(reused)]
        with render_log.open("w", buffering=1) as handle:
            def on_output(line: str) -> None:
                handle.write(line)
                if line.startswith("PROGRESS "):
                    log.info("%s · %s", video.parent.name, line.removeprefix("PROGRESS ").strip())

            code, output = await _run(command, timeout=settings.RENDER_TIMEOUT_SECONDS, on_output=on_output)
        if code != 0:
            tail = "\n".join(line for line in output.splitlines() if "Deprecation" not in line)[-4000:]
            raise RenderError("Scene rendering failed", tail)
        joined = chunks / "joined.mp4"
        boundaries = [0, *starts[1:], starts[-1] + spec["scenes"][-1]["durationInFrames"]]
        log.info("%s · Joining scene clips and audio", video.parent.name)
        soundtrack = chunks / "soundtrack.wav"
        if not soundtrack.is_file():
            soundtrack = await asyncio.to_thread(_join_scene_audio, chunks, boundaries, spec["fps"])
        code, output = await _run([
            "ffmpeg", "-v", "error", "-f", "concat", "-safe", "1", "-i", str(chunks / "concat.txt"),
            "-i", str(soundtrack), "-map", "0:v:0", "-map", "1:a:0",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-af", "apad", "-shortest",
            "-movflags", "+faststart", str(joined),
        ], timeout=settings.RENDER_TIMEOUT_SECONDS)
        with render_log.open("a") as handle:
            handle.write("\nJoining scene ranges and soundtrack\n" + output)
        if code != 0 or not joined.is_file():
            raise RenderError("Joining rendered scenes failed", output[-3000:])
        joined.replace(video)


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
    job_id = job_id or str(uuid.uuid4())
    job_dir = settings.WORKSPACE_DIR / "jobs" / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()

    spec = expand_continuations(copy.deepcopy(spec))  # hand-written plans may request continuations too
    spec = paper_code_scenes(spec)  # paper-style video: no dark CodeScene
    spec = apply_brand(spec)
    spec = set_caption_mode(set_captions(spec, captions), captions_mode)
    composition = job_dir / "composition.json"
    validation_started = time.perf_counter()
    estimated, _ = cues.resolve(spec)
    composition.write_text(json.dumps(estimated, indent=2))
    await validate(composition)
    validation_seconds = time.perf_counter() - validation_started

    made = cached = 0
    lines: list[str] = []
    narration_started = time.perf_counter()
    if narrate:
        spec, made, cached, lines = await add_narration(spec)
        spec, _ = cues.resolve(spec)
    else:
        spec = estimated
    narration_seconds = time.perf_counter() - narration_started
    if narrate:
        validation_started = time.perf_counter()
        composition.write_text(json.dumps(spec, indent=2))
        await validate(composition)
        validation_seconds += time.perf_counter() - validation_started

    video = job_dir / "video.mp4"
    frames = sum(int(sc.get("durationInFrames", 0)) for sc in spec.get("scenes", []))
    remotion_started = time.perf_counter()
    with step("remotion scene render", job=job_id, scenes=len(spec.get("scenes", [])), frames=frames, scale=scale, threads=concurrency) as s:
        await _render_scene_ranges(spec, composition, video, scale=scale, concurrency=concurrency)
        s.update(video=str(video), size=f"{video.stat().st_size / 1e6:.1f}MB")

    remotion_seconds = time.perf_counter() - remotion_started
    subtitles_started = time.perf_counter()
    srt, mode = await add_subtitles(spec, job_dir, video)
    if items := subtitles.transcript(spec):  # what is said, with times (even when captions are off)
        subtitles.write_transcript(items, job_dir)
    seconds = time.perf_counter() - started
    log.info("render.ok job=%s voice_new=%d voice_cached=%d took_s=%.1f", job_id, made, cached, seconds)
    timings = {"narration_and_alignment": narration_seconds, "validation": validation_seconds,
               "remotion": remotion_seconds, "subtitles_and_transcript": time.perf_counter() - subtitles_started}
    return RenderResult(job_id, job_dir, composition, video, seconds, made, cached, lines, srt, mode, timings)


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
