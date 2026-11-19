"""Long videos (20-40 min): outline -> plan each chapter -> render each chapter -> join.

    state = await create_long_video("How Node.js works", minutes=30)  # outline: 1 LLM call, saved
    await run_long_video(state.id)               # plans every chapter, then renders, then joins
    redo_chapter(state.id, 3, "plan")            # re-plan only chapter 3; run again to finish

Everything is saved in ``workspace/long/<id>/state.json`` after every step, so a restart (or a
change to one chapter) continues where it stopped instead of starting over:

    chapter status:  pending -> planned -> rendered      (failed = stage + error saved; run again retries it)
    ch03.plan.json   chapter 3's composition (scenes + narration), editable
    video.mp4        all chapters joined, with chapter markers; ``timestamps`` in the state

Each chapter is planned by the normal planner (``plan_video``) with extra context: the whole
outline, a shared glossary / running examples / visual style, what earlier chapters covered, and a
word budget (minutes x LONG_WORDS_PER_MINUTE). Plans far off the budget are re-planned once.
Chapters are rendered as normal jobs (``workspace/jobs/long-<id>-chNN``) and joined with ffmpeg.
"""

import asyncio
import os
import fcntl
import inspect
from contextlib import contextmanager
from functools import wraps
import json
import logging
import math
import re
import time
import uuid
from pathlib import Path
from typing import Any, Literal

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from pydantic import ValidationError

from app.agent.videoGenerator import skills as teaching_skills
from app.agent.videoGenerator.nodes import select_skills as skill_router
from app.agent.videoGenerator.generator import plan_video
from app.agent.videoGenerator.nodes.plan_scenes import PlanError, _extract_json, apply_layout
from app.agent.videoGenerator.prompts.catalog import BRIEF_GUIDANCE, OUTLINE_RULES
from app.agent.videoGenerator.schemas.outline import ChapterOutline, Outline
from app.agent.videoGenerator.state.long_video import ChapterState, LongState
from app.config import settings
from app.utils import cues, subtitles
from app.utils.console import step
from app.utils.iso import expand_continuations
from app.utils.llm import get_llm, text_of, usage_of
from app.utils.render import RenderError, captions_enabled, default_caption_mode, render_video, validate, without_intro

log = logging.getLogger(__name__)

ID_RE = re.compile(r"^[a-f0-9]{10}$")


# ---------------------------------------------------------------------------- state


def _dir(job_id: str) -> Path:
    if not ID_RE.fullmatch(job_id):
        raise ValueError(f"bad long-video id: {job_id}")
    return settings.WORKSPACE_DIR / "long" / job_id


class JobBusyError(RuntimeError):
    """Another process or request owns this job."""


@contextmanager
def _job_lock(job_id: str):
    # File locks cover API workers, CLI runs, and edits; the OS releases them on exit.
    directory = _dir(job_id)
    if not (directory / "state.json").exists():
        raise ValueError(f"no long video {job_id}")
    with (directory / ".lock").open("a") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise JobBusyError("This video is running or being edited; try again when it finishes.") from exc
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def _exclusive(fn):
    if inspect.iscoroutinefunction(fn):
        @wraps(fn)
        async def async_locked(job_id, *args, **kwargs):
            with _job_lock(job_id):
                return await fn(job_id, *args, **kwargs)
        return async_locked

    @wraps(fn)
    def sync_locked(job_id, *args, **kwargs):
        with _job_lock(job_id):
            return fn(job_id, *args, **kwargs)
    return sync_locked


def load(job_id: str) -> LongState:
    path = _dir(job_id) / "state.json"
    if not path.exists():
        raise ValueError(f"no long video {job_id}")
    return LongState.model_validate_json(path.read_text())


def save(state: LongState) -> None:
    state.updated = time.time()
    state.progress = _progress(state)
    d = _dir(state.id)
    d.mkdir(parents=True, exist_ok=True)
    tmp = d / "state.json.tmp"
    tmp.write_text(state.model_dump_json(indent=2))
    tmp.replace(d / "state.json")  # atomic: a crash never leaves half a state file


def list_long_videos() -> list[dict[str, Any]]:
    root = settings.WORKSPACE_DIR / "long"
    out = []
    for p in sorted(root.glob("*/state.json"), key=lambda p: p.stat().st_mtime, reverse=True) if root.exists() else []:
        s = LongState.model_validate_json(p.read_text())
        out.append({"id": s.id, "topic": s.topic, "status": s.status, "progress": s.progress, "running": is_running(s.id)})
    return out


def _progress(s: LongState) -> float:
    if s.status == "done":
        return 1.0
    n = len(s.chapters) or 1
    planned = sum(c.status in ("planned", "rendered") or (c.status == "failed" and c.failed_stage == "render") for c in s.chapters)
    rendered = sum(c.status == "rendered" for c in s.chapters)
    return round(0.95 * (planned + 4 * rendered) / (5 * n), 3)  # rendering is ~4x the work of planning


def plan_file(job_id: str, n: int) -> Path:
    return _dir(job_id) / f"ch{n:02d}.plan.json"


# -------------------------------------------------------------------------- outline


def length_rule(minutes: float, chapters: int | None, fixed: bool) -> str:
    """How long the outline may be. ``fixed``: exactly ``minutes``; otherwise ``minutes`` is a ceiling and
    the content decides (a narrow topic is shorter; nothing is padded)."""
    if fixed:
        want = chapters or max(2, round(minutes / settings.LONG_CHAPTER_MINUTES))
        return f"- About {want} chapters; their minutes add up to {minutes:g}."
    most = chapters or max(2, round(minutes / settings.LONG_CHAPTER_MINUTES))
    count = f"exactly {chapters} chapters" if chapters else f"2 to {most} chapters"
    return (f"- Length: UP TO {minutes:g} minutes in total ({count}, usually {settings.LONG_CHAPTER_MINUTES:g} minutes each). "
            f"Use only as much time as the topic genuinely needs to be explained well: a narrow topic may need "
            f"{max(settings.LONG_MIN_MINUTES, 6):g}-12 minutes, a broad one the full {minutes:g}. Never pad, repeat or add filler "
            f"chapters to reach the limit; never go over it.")


async def make_outline(topic: str, minutes: float, *, chapters: int | None = None, model: str | None = None,
                       skills: list[str] | None = None, fixed_length: bool = False) -> tuple[Outline, int, int, int]:
    """LLM writes the outline. Returns (outline, llm calls, input tokens, output tokens).
    ``minutes`` is the exact length with ``fixed_length``, else the most the video may take."""
    selected = teaching_skills.select(topic, skills, long_video=True)
    rule = length_rule(minutes, chapters, fixed_length)
    messages: list[Any] = [
        SystemMessage(BRIEF_GUIDANCE + "\n" + OUTLINE_RULES.format(length_rule=rule) + teaching_skills.guidance(selected)),
        HumanMessage(f"Topic: {topic}\nTotal length: {'exactly' if fixed_length else 'up to'} {minutes:g} minutes."),
    ]
    llm = get_llm(model or settings.LONG_MODEL or settings.PLANNER_MODEL or None)
    calls = tin = tout = 0
    problem = ""
    for _ in range(settings.PLANNER_MAX_ATTEMPTS):
        msg = await llm.ainvoke(messages)
        calls += 1
        i, o = usage_of(msg)
        tin, tout = tin + i, tout + o
        reply = text_of(msg)
        try:
            outline = Outline.model_validate(_extract_json(reply))
        except (ValueError, ValidationError) as exc:
            problem = str(exc)[:3000]
            messages += [AIMessage(reply), HumanMessage(f"That outline is invalid:\n{problem}\nReply with ONLY the corrected JSON.")]
            continue
        return set_budgets(outline, minutes, fixed=fixed_length), calls, tin, tout
    raise PlanError(f"outline invalid after {calls} tries", problem)


def set_budgets(outline: Outline, minutes: float, *, fixed: bool = True) -> Outline:
    """Give each chapter a narration word budget. ``fixed``: scale the chapters to add up to ``minutes``;
    otherwise keep the length the content needs, only shrinking it when it is over the limit (or under
    LONG_MIN_MINUTES)."""
    total = sum(c.minutes for c in outline.chapters) or 1
    target = minutes if fixed else min(minutes, max(total, settings.LONG_MIN_MINUTES))
    for c in outline.chapters:
        c.minutes = round(c.minutes * target / total, 2)
        c.words = round(c.minutes * settings.LONG_WORDS_PER_MINUTE)
    return outline


def new_id() -> str:
    return uuid.uuid4().hex[:10]


def _new_state(topic: str, minutes: float, outline: Outline, *, job_id: str | None = None, **opts: Any) -> LongState:
    return LongState(id=job_id or new_id(), topic=topic, minutes=minutes, outline=outline,
                     chapters=[ChapterState(n=i + 1) for i in range(len(outline.chapters))], **opts)


async def create_long_video(topic: str, minutes: float, *, chapters: int | None = None, captions: bool = True,
                            scale: float = 1.0, mode: str | None = None, model: str | None = None, skills: list[str] | None = None,
                            layout: str = "desktop", job_id: str | None = None, fixed_length: bool = False) -> LongState:
    """Write and save the outline (nothing planned or rendered yet). Review it, then run.
    ``minutes`` is the most the video may take (the content decides, never padded); ``fixed_length`` makes it exact.
    ``job_id``: use this id (from new_id()) so a caller can report on the job while the outline is written."""
    chosen = await skill_router.route(topic, skills, long_video=True, model=model)  # once; chapters reuse it
    selected = chosen.skills
    with step("outline", topic=topic, minutes=minutes, skills=",".join(selected)) as s:
        outline, calls, tin, tout = await make_outline(topic, minutes, chapters=chapters, model=model, skills=selected,
                                                       fixed_length=fixed_length)
        planned = round(sum(c.minutes for c in outline.chapters), 1)
        s.update(chapters=len(outline.chapters), planned_min=planned, limit_min=minutes, tokens_in=tin, tokens_out=tout)
    state = _new_state(topic, planned, outline, max_minutes=minutes, job_id=job_id, captions=captions, scale=scale, mode=mode, model=model,
                       skills=selected, layout=layout)
    state.llm_calls, state.input_tokens, state.output_tokens = calls + chosen.calls, tin + chosen.input_tokens, tout + chosen.output_tokens
    state.step = f"outline: {len(outline.chapters)} chapters"
    save(state)
    log.info("long.outline id=%s chapters=%d tokens_in=%d tokens_out=%d", state.id, len(outline.chapters), tin, tout)
    return state


@_exclusive
def replace_outline(job_id: str, outline: Outline) -> LongState:
    """Use an edited outline. Every chapter goes back to pending (nothing is rendered yet with it)."""
    state = _editable(job_id)
    state.outline = set_budgets(outline, sum(c.minutes for c in outline.chapters))
    state.minutes = round(sum(c.minutes for c in state.outline.chapters), 2)
    state.chapters = [ChapterState(n=i + 1) for i in range(len(outline.chapters))]
    _clear_video(state)
    state.status, state.step = "outlined", "outline replaced"
    save(state)
    return state


# -------------------------------------------------------------------------- chapters


def narration_words(spec: dict[str, Any]) -> int:
    return sum(len(((s.get("narration") or {}).get("text") or "").split()) for s in spec.get("scenes", []))


def chapter_context(state: LongState, n: int, note: str = "") -> str:
    """Everything one chapter's planner call needs to fit into the whole video."""
    o, total = state.outline, len(state.outline.chapters)
    ch = o.chapters[n - 1]
    scenes = max(4, math.ceil(ch.words / settings.LONG_WORDS_PER_SCENE))
    lines = [
        f'LONG VIDEO: "{o.title}" for {o.audience}. You plan ONLY chapter {n} of {total}.',
        f"Original user brief (preserve its purpose, format and language): {state.topic}",
        "Outline (stay inside your chapter; don't repeat what other chapters cover):",
        *[f"  {i}. {c.title}: {c.goal}{'   <- THIS CHAPTER' if i == n else ''}" for i, c in enumerate(o.chapters, 1)],
        f"This chapter: {ch.title}. Goal: {ch.goal}",
        "Cover in a logical order for the requested format: " + "; ".join(ch.key_points),
    ]
    if o.glossary:
        lines.append("Glossary (use exactly these words): " + "; ".join(f"{t.term} = {t.meaning}" for t in o.glossary))
    if o.examples:
        lines.append("Shared examples (preserve identifiers, types and values across chapters; show any state change explicitly): " + "; ".join(o.examples))
    if o.style:
        lines.append("Visual style for the whole video: " + o.style)
    done = [c.handoff for c in state.chapters[: n - 1] if c.handoff]
    if done:
        lines.append("Earlier chapters already covered (don't repeat; refer back briefly when useful):")
        lines += [f"  - {h}" for h in done]
    lines.append(
        f"Narration budget: about {ch.words} words in total (~{ch.minutes:g} min), so about {scenes} scenes "
        f"of ~{settings.LONG_WORDS_PER_SCENE} words each."
    )
    if n == 1:
        lines.append("Start with a title scene for the whole video, then teach this chapter.")
    else:
        lines.append(f'Start with a short title scene "Chapter {n}: {ch.title}" (no intro for the whole video).')
    if n == total:
        lines.append("End by delivering the original brief’s promised outcome. For a lecture, connect the key ideas and use a learning check if helpful; for an ad, give a supported next action. Do not force a quiz into other formats.")
    else:
        lines.append(f'The last scene\'s narration leads into the next chapter: "{o.chapters[n].title}".')
    if note:
        lines.append(note)
    return "\n".join(lines)


def _handoff(state: LongState, n: int, spec: dict[str, Any]) -> str:
    """Short, deterministic summary of a planned chapter for the chapters after it (no LLM call)."""
    ch = state.outline.chapters[n - 1]
    scenes = spec.get("scenes", [])
    last = next(((s.get("narration") or {}).get("text", "") for s in reversed(scenes) if s.get("narration")), "")
    used = sorted({s.get("component", "") for s in scenes} - {""})
    summary = f"Ch {n} {ch.title}: {'; '.join(ch.key_points)}. Scenes used: {', '.join(used)}. It ended with: \"{last[:200]}\""
    # Carry the concrete exchanges forward as well as the outline's description of them.
    exchanges = []
    for scene in scenes:
        if scene.get("component") != "TerminalScene":
            continue
        command = ""
        for action in (scene.get("props") or {}).get("actions") or []:
            if not isinstance(action, dict):
                continue
            if action.get("do") == "run":
                command = action.get("text", "")
            elif action.get("do") == "output" and command:
                exchange = f"{command} → {action.get('text', '')}"
                if exchange not in exchanges:
                    exchanges.append(exchange)
                command = ""
    if exchanges:
        summary += "\nExamples already shown (keep their values and types consistent):\n" + "\n".join(exchanges[:6])
    return summary


async def plan_chapter(state: LongState, n: int) -> dict[str, Any]:
    """Plan one chapter (planner + context); re-plan once if the narration is far off its word budget."""
    ch, cs = state.outline.chapters[n - 1], state.chapters[n - 1]
    scenes = max(4, math.ceil(ch.words / settings.LONG_WORDS_PER_SCENE))
    best: dict[str, Any] | None = None
    note = ""
    for _ in range(2):
        topic = f"{state.outline.title}: chapter {n}, {ch.title}"
        plan = await plan_video(
            topic, scenes=scenes, mode=state.mode, model=state.model, context=chapter_context(state, n, note),
            skills=state.skills, layout=state.layout, code_demo=ch.code_demo.strip(), narration_budget=ch.words,  # type: ignore[arg-type]
        )
        cs.llm_calls += plan.llm_calls
        cs.input_tokens += plan.input_tokens
        cs.output_tokens += plan.output_tokens
        words = narration_words(plan.spec)
        if best is None or abs(words - ch.words) < abs(narration_words(best) - ch.words):
            best = plan.spec
        off = (words - ch.words) / max(ch.words, 1)
        if abs(off) <= settings.LONG_BUDGET_TOLERANCE:
            break
        note = (f"IMPORTANT: a previous plan for this chapter had {words} narration words, but the budget is about "
                f"{ch.words}. Make it {'longer: more scenes and fuller narration' if off < 0 else 'shorter: fewer scenes, tighter narration'}.")
        log.warning("long.budget id=%s ch=%d words=%d budget=%d, re-planning", state.id, n, words, ch.words)
    assert best is not None
    words = narration_words(best)
    if abs(words - ch.words) / max(ch.words, 1) > settings.LONG_BUDGET_TOLERANCE:
        raise PlanError(
            f"Chapter {n} narration is outside its word budget after 2 attempts",
            f"Best attempt: {words} words; target: {ch.words} words "
            f"(tolerance: {settings.LONG_BUDGET_TOLERANCE:.0%}). Retry planning this chapter.",
        )
    return best


def _accept_plan(state: LongState, n: int, spec: dict[str, Any]) -> None:
    cs = state.chapters[n - 1]
    plan_file(state.id, n).write_text(json.dumps(spec, indent=2))
    cs.status, cs.failed_stage, cs.error = "planned", "", ""
    cs.scenes, cs.words = len(spec.get("scenes", [])), narration_words(spec)
    cs.handoff = _handoff(state, n, spec)
    cs.seconds, cs.job_id = 0, ""


def render_concurrency() -> int:
    """Remotion threads per chapter render: LONG_RENDER_CONCURRENCY, or the cores shared by the workers."""
    if settings.LONG_RENDER_CONCURRENCY > 0:
        return settings.LONG_RENDER_CONCURRENCY
    return max(1, (os.cpu_count() or 2) // max(1, settings.LONG_RENDER_WORKERS))


async def _render_chapter(state: LongState, n: int) -> None:
    cs = state.chapters[n - 1]
    spec = json.loads(plan_file(state.id, n).read_text())
    cs.job_id = f"long-{state.id}-ch{n:02d}"
    apply_layout(spec, state.layout)  # hand-edited plans get the job's frame size too
    if n > 1:
        spec = without_intro(spec)  # the logo intro plays once, at the start of the whole video
    result = await render_video(spec, captions=state.captions, job_id=cs.job_id, scale=state.scale,
                                concurrency=render_concurrency())
    cs.seconds = await _duration(result.video)
    cs.status, cs.failed_stage, cs.error = "rendered", "", ""


# ----------------------------------------------------------------------------- join


async def _ffmpeg(*args: str, timeout: float = 1800) -> tuple[int, str]:
    proc = await asyncio.create_subprocess_exec(*args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    try:
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise RenderError(f"timed out: {args[0]}")
    return proc.returncode or 0, out.decode(errors="replace")


async def _duration(video: Path) -> float:
    code, out = await _ffmpeg("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video), timeout=60)
    if code != 0:
        raise RenderError("ffprobe failed", out[-1000:])
    return round(float(out.strip().splitlines()[-1]), 3)


def _stamp(seconds: float) -> str:
    s = int(seconds)
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60:02d}:{s % 60:02d}"


async def _has_audio(video: Path) -> bool:
    code, out = await _ffmpeg("ffprobe", "-v", "error", "-select_streams", "a:0",
                              "-show_entries", "stream=index", "-of", "csv=p=0", str(video), timeout=60)
    if code != 0:
        raise RenderError("ffprobe failed", out[-1000:])
    return bool(out.strip())


async def join_chapters(state: LongState) -> Path:
    """Copy the chapter pictures, join their decoded audio, and add chapter markers."""
    d = _dir(state.id)
    videos = [settings.WORKSPACE_DIR / "jobs" / c.job_id / "video.mp4" for c in state.chapters]
    lengths = [c.seconds for c in state.chapters]
    (d / "concat.txt").write_text("".join(f"file '{v.resolve()}'\nduration {length:.3f}\n"
                                        for v, length in zip(videos, lengths)))
    meta, stamps, start = [";FFMETADATA1", f"title={state.outline.title}"], [], 0.0
    cues, said = long_captions(state)
    mode = ""
    for c, ch in zip(state.chapters, state.outline.chapters):
        end = start + c.seconds
        job = settings.WORKSPACE_DIR / "jobs" / c.job_id
        if (job / "captions.srt").exists() and (job / "composition.json").exists():
            mode = subtitles.caption_mode(json.loads((job / "composition.json").read_text()), default_caption_mode())
        meta += ["[CHAPTER]", "TIMEBASE=1/1000", f"START={round(start * 1000)}", f"END={round(end * 1000)}", f"title={ch.title}"]
        stamps.append(f"{_stamp(start)} {ch.title}")
        start = end
    (d / "chapters.ffmeta").write_text("\n".join(meta) + "\n")
    out = d / "video.mp4"
    # Keep picture timestamps anchored at zero even when the concat demuxer
    # reports a negative start time from a chapter's AAC priming packets.
    base = ["ffmpeg", "-y", "-copyts", "-f", "concat", "-safe", "0", "-i", str(d / "concat.txt"), "-i", str(d / "chapters.ffmeta")]
    track = []
    if cues:
        srt, _ = subtitles.write_files(cues, d)
        if mode in ("track", "both"):  # one switchable subtitle track for the whole video
            base += ["-i", str(srt)]
            track = ["-map", "2:0", "-c:s", "mov_text", "-metadata:s:s:0", "language=eng", "-metadata:s:s:0", "title=Captions",
                     "-disposition:s:0", "default" if mode == "track" else "0"]
    audio = await asyncio.gather(*(_has_audio(video) for video in videos))
    audio_map: list[str] = []
    if any(audio):
        # Decode each AAC track independently so FFmpeg applies its MP4 edit list
        # and removes encoder priming before the chapter timelines are joined.
        index = 3 if track else 2
        filters, streams = [], []
        for n, (video, length, has_audio) in enumerate(zip(videos, lengths, audio)):
            label = f"[chapter_audio{n}]"
            if has_audio:
                base += ["-i", str(video)]
                source = f"[{index}:a:0]aformat=sample_rates=48000:channel_layouts=stereo,apad"
                index += 1
            else:
                source = "anullsrc=r=48000:cl=stereo"
            filters.append(f"{source},atrim=duration={length:.3f},asetpts=N/SR/TB{label}")
            streams.append(label)
        filters.append("".join(streams) + f"concat=n={len(streams)}:v=0:a=1[joined_audio]")
        base += ["-filter_complex", ";".join(filters)]
        audio_map = ["-map", "[joined_audio]", "-c:a", "aac", "-b:a", "128k"]
    base += ["-map", "0:v", *audio_map, "-map_metadata", "1", "-map_chapters", "1", *track]
    code, log_text = await _ffmpeg(*base, "-c:v", "copy", "-movflags", "+faststart", str(out))
    if code != 0:  # chapters differ in format: re-encode once
        code, log_text = await _ffmpeg(*base, "-c:v", "libx264", "-crf", "18", "-movflags", "+faststart", str(out))
    (d / "join.log").write_text(log_text)
    if code != 0 or not out.exists():
        raise RenderError("joining chapters failed", log_text[-2000:])
    state.video, state.seconds, state.timestamps = str(out), round(start, 1), stamps
    (d / "chapters.txt").write_text("\n".join(stamps) + "\n")
    if said:
        subtitles.write_transcript(said, d, [ch.title for ch in state.outline.chapters])
    return out


def long_captions(state: LongState) -> tuple[list[subtitles.Cue], list[dict[str, Any]]]:
    """Captions and transcript for the whole long video: each chapter's lines shifted to where the chapter
    starts. Built from the chapter's composition.json (word timings), so jobs rendered before subtitle
    files existed get them too; a chapter's captions.srt is used when there is no composition."""
    cues: list[subtitles.Cue] = []
    said: list[dict[str, Any]] = []
    start = 0.0
    for n, c in enumerate(state.chapters, 1):
        job = settings.WORKSPACE_DIR / "jobs" / c.job_id
        if (job / "composition.json").exists():
            spec = _as_rendered(json.loads((job / "composition.json").read_text()), c.seconds)
            if captions_enabled(spec):
                cues += [subtitles.Cue(q.start + start, q.end + start, q.text) for q in subtitles.cues(spec)]
            said += subtitles.transcript(spec, offset=start, chapter=n)
        elif (job / "captions.srt").exists():
            cues += [subtitles.Cue(q.start + start, q.end + start, q.text) for q in subtitles.parse_srt((job / "captions.srt").read_text())]
        start += c.seconds
    return cues, said


def _as_rendered(spec: dict[str, Any], seconds: float) -> dict[str, Any]:
    """Videos rendered before the logo intro existed saved no "brand" key, which now means "intro on".
    When the real chapter length matches the composition only without the intro, time it without one."""
    if "brand" in spec or not seconds:
        return spec
    fps = int(spec.get("fps", 30))
    scenes = spec.get("scenes") or []
    if not scenes:
        return spec
    with_intro = (subtitles._scene_starts(spec, fps)[-1] + int(scenes[-1]["durationInFrames"])) / fps
    if abs(with_intro - seconds) > 0.5 and abs(with_intro - subtitles._brand_offset(spec, fps) / fps - seconds) <= 0.5:
        return {**spec, "brand": False}
    return spec


def transcript_files(job_id: str) -> dict[str, Path]:
    """captions.srt/.vtt and transcript.json/.txt of a finished long video, made now if missing (older jobs)."""
    state = load(job_id)
    d = _dir(job_id)
    files = {n: d / n for n in ("captions.srt", "captions.vtt", "transcript.json", "transcript.txt")}
    if all(p.exists() for p in files.values()) or state.status != "done":
        return files
    cues, said = long_captions(state)
    if cues and not files["captions.srt"].exists():
        subtitles.write_files(cues, d)
    if said:
        subtitles.write_transcript(said, d, [ch.title for ch in state.outline.chapters])
    return files


# --------------------------------------------------------------------------- runner


_tasks: dict[str, asyncio.Task] = {}


def is_running(job_id: str) -> bool:
    t = _tasks.get(job_id)
    return bool(t and not t.done())


def start(job_id: str, *, render: bool = True) -> bool:
    """Run in the background (API). False if it is already running."""
    load(job_id)  # raises if unknown
    if is_running(job_id):
        return False
    loop = asyncio.get_running_loop()
    reservation = _job_lock(job_id)
    reservation.__enter__()  # Reserve before yielding, so an edit cannot slip in.

    async def run_reserved():
        return await _run_long_video(job_id, render=render)

    try:
        task = loop.create_task(run_reserved())
    except BaseException:
        reservation.__exit__(None, None, None)
        raise
    _tasks[job_id] = task

    def finished(done):
        reservation.__exit__(None, None, None)
        if _tasks.get(job_id) is done:
            _tasks.pop(job_id, None)

    task.add_done_callback(finished)
    return True


def _total_tokens(state: LongState, outline_calls: tuple[int, int, int]) -> None:
    calls, tin, tout = outline_calls
    state.llm_calls = calls + sum(c.llm_calls for c in state.chapters)
    state.input_tokens = tin + sum(c.input_tokens for c in state.chapters)
    state.output_tokens = tout + sum(c.output_tokens for c in state.chapters)


@_exclusive
async def run_long_video(job_id: str, *, render: bool = True) -> LongState:
    return await _run_long_video(job_id, render=render)


async def _run_long_video(job_id: str, *, render: bool = True) -> LongState:
    """Plan every chapter that isn't planned, render the rest, join. Finished steps are skipped,
    so this is safe to call again after a crash or an edit.

    Speed: a chapter starts rendering as soon as it is planned, while the next one is planned
    (planning waits on the LLM, rendering uses the CPU). Up to LONG_RENDER_WORKERS chapters render at
    once. LONG_PARALLEL_PLANNING plans all chapters at once (faster; each chapter then knows the outline
    but not what earlier chapters actually said)."""
    state = load(job_id)
    if state.skills is None:
        state.skills = teaching_skills.select(state.topic, long_video=True)
    outline_usage = (state.llm_calls - sum(c.llm_calls for c in state.chapters),
                     state.input_tokens - sum(c.input_tokens for c in state.chapters),
                     state.output_tokens - sum(c.output_tokens for c in state.chapters))
    total = len(state.chapters)
    planning: set[int] = set()
    rendering: set[int] = set()
    errors: list[str] = []
    renders: list[asyncio.Task] = []
    render_slots = asyncio.Semaphore(max(1, settings.LONG_RENDER_WORKERS))

    def mark(text: str = "") -> None:
        busy = ([f"planning ch {', '.join(map(str, sorted(planning)))}"] if planning else []) + \
               ([f"rendering ch {', '.join(map(str, sorted(rendering)))}"] if rendering else [])
        state.step = text or " · ".join(busy) or state.step
        _total_tokens(state, outline_usage)
        save(state)

    def fail(cs: ChapterState, stage: str, exc: BaseException) -> None:
        msg = f"{exc}\n{getattr(exc, 'details', '')}".strip()[:4000]
        cs.status, cs.failed_stage, cs.error = "failed", stage, msg  # type: ignore[assignment]
        errors.append(f"chapter {cs.n} {stage}: {msg.splitlines()[0] if msg else type(exc).__name__}")
        log.error("long.chapter_failed id=%s ch=%d stage=%s", job_id, cs.n, stage)

    def needs_plan(cs: ChapterState) -> bool:
        return cs.status == "pending" or (cs.status == "failed" and cs.failed_stage == "plan")

    def needs_render(cs: ChapterState) -> bool:
        return cs.status == "planned" or (cs.status == "failed" and cs.failed_stage == "render")

    async def render_one(cs: ChapterState) -> None:
        async with render_slots:
            rendering.add(cs.n)
            mark()
            try:
                with step(f"chapter {cs.n}/{total} render", title=state.outline.chapters[cs.n - 1].title) as s:
                    await _render_chapter(state, cs.n)
                    s.update(length=f"{cs.seconds / 60:.1f}min", target=f"{state.outline.chapters[cs.n - 1].minutes:g}min")
            except Exception as exc:
                fail(cs, "render", exc)
            finally:
                rendering.discard(cs.n)
                mark()

    def start_render(cs: ChapterState) -> None:
        if render and needs_render(cs):
            renders.append(asyncio.create_task(render_one(cs)))

    async def plan_one(cs: ChapterState) -> bool:
        planning.add(cs.n)
        mark()
        try:
            with step(f"chapter {cs.n}/{total} plan", title=state.outline.chapters[cs.n - 1].title,
                      budget_words=state.outline.chapters[cs.n - 1].words) as s:
                _accept_plan(state, cs.n, await plan_chapter(state, cs.n))
                s.update(scenes=cs.scenes, words=cs.words, tokens_in=cs.input_tokens, tokens_out=cs.output_tokens)
        except Exception as exc:
            fail(cs, "plan", exc)
            return False
        finally:
            planning.discard(cs.n)
            mark()
        start_render(cs)  # render this chapter while the next one is planned
        return True

    state.status, state.error = "running", ""
    mark("starting")
    try:
        for cs in state.chapters:  # already planned (earlier run / edit): render right away
            if not needs_plan(cs):
                start_render(cs)
        todo = [cs for cs in state.chapters if needs_plan(cs)]
        if settings.LONG_PARALLEL_PLANNING:
            plan_slots = asyncio.Semaphore(max(1, settings.LONG_PLAN_WORKERS))

            async def bounded(cs: ChapterState) -> bool:
                async with plan_slots:
                    return await plan_one(cs)
            await asyncio.gather(*(bounded(cs) for cs in todo))
        else:
            for cs in todo:  # in order: each chapter sees what the earlier ones actually said
                if not await plan_one(cs):
                    break  # later chapters need this one's handoff; renders already started continue
        if renders:
            await asyncio.gather(*renders)
        unfinished = [cs.n for cs in state.chapters if needs_plan(cs) and cs.status != "failed"]
        if errors or unfinished:
            state.status = "failed"
            state.error = "\n".join(errors) + (f"\nnot planned yet: chapters {unfinished}" if unfinished else "")
            mark("stopped: " + (errors[0] if errors else "chapters left"))
            return state
        if not render:
            state.status = "planned"
            mark("all chapters planned (not rendered)")
            return state
        if not state.video or not Path(state.video).exists():
            mark("joining chapters")
            with step("join chapters (ffmpeg)", chapters=total) as s:
                await join_chapters(state)
                s.update(video=state.video, length=f"{state.seconds / 60:.1f}min", target=f"{state.minutes:g}min")
        state.status = "done"
        mark(f"done: {_stamp(state.seconds)} (target {state.minutes:g} min)")
        log.info("long.done id=%s seconds=%.0f llm_calls=%d tokens_in=%d tokens_out=%d",
                 job_id, state.seconds, state.llm_calls, state.input_tokens, state.output_tokens)
    except Exception as exc:
        msg = f"{exc}\n{getattr(exc, 'details', '')}".strip()[:4000]
        state.status, state.error = "failed", msg
        mark()
        log.exception("long.failed id=%s step=%s", job_id, state.step)
    finally:
        for t in renders:  # cancelled run: don't leave renders behind
            if not t.done():
                t.cancel()
    return state


# ---------------------------------------------------------------------------- edits


def _editable(job_id: str) -> LongState:
    if is_running(job_id):
        raise RuntimeError("it is running; wait until it stops")
    return load(job_id)


def _clear_video(state: LongState) -> None:
    state.video, state.seconds, state.timestamps = "", 0, []
    if state.status == "done":
        state.status = "planned"


@_exclusive
def redo_chapter(job_id: str, n: int, stage: Literal["plan", "render"] = "plan", *, cascade: bool = False) -> LongState:
    """Mark chapter ``n`` to be planned again (``plan``) or only rendered again (``render``).
    ``cascade``: also re-plan every later chapter (they were planned knowing the old chapter n)."""
    state = _editable(job_id)
    if not 1 <= n <= len(state.chapters):
        raise ValueError(f"chapter {n} does not exist")
    targets = state.chapters[n - 1 :] if (cascade and stage == "plan") else [state.chapters[n - 1]]
    for cs in targets:
        if stage == "plan":
            state.chapters[cs.n - 1] = ChapterState(n=cs.n)
        elif cs.status in ("rendered", "failed") and plan_file(job_id, cs.n).exists():
            cs.status, cs.failed_stage, cs.error, cs.seconds = "planned", "", "", 0
    _clear_video(state)
    state.step = f"chapter {n}: {stage} again" + (" (+ later chapters)" if cascade else "")
    save(state)
    return state


@_exclusive
async def set_chapter_plan(job_id: str, n: int, spec: dict[str, Any]) -> LongState:
    """Replace chapter ``n``'s composition by hand (validated first); it will be rendered again."""
    state = _editable(job_id)
    if not 1 <= n <= len(state.chapters):
        raise ValueError(f"chapter {n} does not exist")
    tmp = _dir(job_id) / f"ch{n:02d}.check.json"
    checked, _ = cues.resolve(spec)  # word cues are resolved from speech at render
    tmp.write_text(json.dumps(expand_continuations(checked), indent=2))
    try:
        await validate(tmp)
    finally:
        tmp.unlink(missing_ok=True)
    _accept_plan(state, n, spec)
    _clear_video(state)
    state.step = f"chapter {n}: plan edited"
    save(state)
    return state
