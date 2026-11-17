import json
import logging
import re
import time
import uuid
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.config import settings
from app.utils.console import fmt_seconds, paint, request_id, setup_logging
from app.utils.llm import call_model, resolve_base_url
from app.agent.component_agent import build_component
from app.agent.staging import manifest, promote, unstage
from app.utils import long_video, skills as teaching_skills
from app.utils.planner import PlanError, plan_video
from app.utils.render import RenderError, render_video
from app.utils.tts import MAX_CHARS, synthesize

setup_logging()
log = logging.getLogger("app.http")
app = FastAPI(title="Agentic Video Studio API")


@app.on_event("startup")
async def banner() -> None:
    from urllib.parse import urlparse
    host = urlparse(resolve_base_url()).hostname or "?"  # host only: the URL can hold credentials
    log.info("%s  llm=%s via %s  planner=%s  prompts=%s  level=%s", paint("Agentic Video Studio ready", "green", True),
             settings.PLANNER_MODEL or settings.DEFAULT_MODEL, host, settings.PLANNER_MODE,
             "on" if settings.LOG_PROMPTS else "off", settings.LOG_LEVEL)


class RequestLog:
    """Pure ASGI middleware: → POST /plan … ← 200 POST /plan 12.3s, request id on every line in between.
    (Not BaseHTTPMiddleware: that one buffers responses and can break streaming / background tasks.)"""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers") or [])
        rid = headers.get(b"x-request-id", b"").decode(errors="ignore")[:12] or uuid.uuid4().hex[:6]
        token = request_id.set(rid)
        method, path = scope["method"], scope["path"] + (f"?{scope['query_string'].decode()}" if scope.get("query_string") else "")
        started, status = time.perf_counter(), 500

        async def send_with_id(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message["headers"] = [*message.get("headers", []), (b"x-request-id", rid.encode())]
            await send(message)

        log.info("%s %s %s", paint("→", "blue", True), paint(method, "blue", True), path)
        try:
            await self.app(scope, receive, send_with_id)
        except Exception:
            log.exception("%s %s %s %s", paint("✗ 500", "red", True), method, path, paint(fmt_seconds(time.perf_counter() - started), "yellow"))
            raise
        else:
            color = "green" if status < 400 else "yellow" if status < 500 else "red"
            log.info("%s %s %s %s", paint(f"← {status}", color, True), method, path, paint(fmt_seconds(time.perf_counter() - started), "yellow"))
        finally:
            request_id.reset(token)


app.add_middleware(RequestLog)


class ChatRequest(BaseModel):
    prompt: str
    system: str | None = None
    model: str | None = None  # MLflow gateway route; defaults to DEFAULT_MODEL


class ChatResponse(BaseModel):
    reply: str


@app.get("/")
def hello() -> dict[str, str]:
    return {"message": "Hello"}


@app.post("/llm/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    messages = []
    if req.system:
        messages.append(SystemMessage(req.system))
    messages.append(HumanMessage(req.prompt))
    try:
        reply = await call_model(messages, model=req.model)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM gateway error: {exc}") from exc
    return ChatResponse(reply=reply)


# --------------------------------------------------------------------------- audio


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_CHARS)
    voice: str | None = None  # Deepgram voice, defaults to TTS_VOICE (e.g. aura-2-thalia-en)


@app.post("/tts", response_class=FileResponse)
async def tts(req: TTSRequest) -> FileResponse:
    """Speak the text with Deepgram and return the WAV (cached by voice + text)."""
    try:
        clip = await synthesize(req.text, req.voice)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=502 if "Deepgram" in str(exc) else 400, detail=str(exc)) from exc
    return FileResponse(
        clip.path,
        media_type="audio/wav",
        headers={"X-Audio-Seconds": f"{clip.seconds:.3f}", "X-Audio-Src": clip.src, "X-Cached": str(clip.cached).lower()},
    )


# -------------------------------------------------------------------------- render


class RenderRequest(BaseModel):
    composition: dict[str, Any]  # same JSON as rendering/examples/*.json
    narrate: bool = True  # voice every scene's "narration" with Deepgram first
    captions: bool | None = None  # True/False forces subtitles on/off; None = what the JSON says (default on)
    scale: float = Field(default=1.0, gt=0.1, le=2.0)  # 0.5 = half resolution (quick preview)


class RenderResponse(BaseModel):
    job_id: str
    video_url: str
    composition_url: str
    seconds: float
    voice_clips: int
    voice_cached: int
    log: list[str]


@app.post("/render", response_model=RenderResponse)
async def render(req: RenderRequest) -> RenderResponse:
    """Narrate (Deepgram) → validate → render with Remotion. Waits until the MP4 is ready."""
    try:
        result = await render_video(req.composition, narrate=req.narrate, captions=req.captions, scale=req.scale)
    except RenderError as exc:
        raise HTTPException(status_code=422, detail={"error": str(exc), "details": exc.details}) from exc
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return RenderResponse(
        job_id=result.job_id,
        video_url=f"/render/{result.job_id}/video",
        composition_url=f"/render/{result.job_id}/composition",
        seconds=round(result.seconds, 1),
        voice_clips=result.voice_clips,
        voice_cached=result.voice_cached,
        log=result.log,
    )


def _job_file(job_id: str, name: str):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", job_id):
        raise HTTPException(status_code=400, detail="bad job id")
    path = settings.WORKSPACE_DIR / "jobs" / job_id / name
    if not path.exists():
        raise HTTPException(status_code=404, detail="not found")
    return path


@app.get("/render/{job_id}/video", response_class=FileResponse)
def render_video_file(job_id: str) -> FileResponse:
    return FileResponse(_job_file(job_id, "video.mp4"), media_type="video/mp4", filename=f"{job_id}.mp4")


@app.get("/render/{job_id}/composition", response_class=FileResponse)
def render_composition_file(job_id: str) -> FileResponse:
    return FileResponse(_job_file(job_id, "composition.json"), media_type="application/json")


# ------------------------------------------------------------------------- planner


def _check_skills(names: list[str] | None, role: teaching_skills.Role = "planner") -> None:
    if names is not None:
        try:
            teaching_skills.select("", names, role=role)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/skills")
def list_teaching_skills(role: Literal["planner", "component"] = "planner") -> list[dict[str, Any]]:
    return [s.model_dump() for s in teaching_skills.discover(role).values()]


class PlanRequest(BaseModel):
    skills: list[str] | None = None  # omitted: automatic; []: disabled; names: explicit
    prompt: str = Field(min_length=3, max_length=4000)  # topic / what the video should teach
    scenes: int | None = Field(default=None, ge=2, le=20)  # rough number of scenes
    model: str | None = None  # MLflow gateway route; defaults to PLANNER_MODEL / DEFAULT_MODEL
    mode: Literal["auto", "catalog", "tools"] | None = None  # how the LLM learns the library (default PLANNER_MODE)


class PlanResponse(BaseModel):
    skills: list[str] = Field(default_factory=list)
    composition: dict[str, Any]
    attempts: int
    mode: str
    llm_calls: int
    input_tokens: int
    output_tokens: int


@app.post("/plan", response_model=PlanResponse)
async def plan(req: PlanRequest) -> PlanResponse:
    """LLM writes the composition JSON (scenes, props, narration). Nothing is rendered."""
    _check_skills(req.skills)
    try:
        p = await plan_video(req.prompt, scenes=req.scenes, model=req.model, mode=req.mode, skills=req.skills)
    except PlanError as exc:
        raise HTTPException(status_code=422, detail={"error": str(exc), "details": exc.details}) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"planner failed: {exc}") from exc
    return PlanResponse(skills=p.skills, composition=p.spec, attempts=p.attempts, mode=p.mode, llm_calls=p.llm_calls, input_tokens=p.input_tokens, output_tokens=p.output_tokens)


class VideoRequest(PlanRequest):
    narrate: bool = True  # Deepgram voice for each scene's narration
    captions: bool = True  # subtitles from the narration (False = no captions)
    scale: float = Field(default=1.0, gt=0.1, le=2.0)


class VideoResponse(RenderResponse):
    plan_attempts: int
    plan_mode: str
    llm_input_tokens: int
    llm_output_tokens: int


@app.post("/video", response_model=VideoResponse)
async def video(req: VideoRequest) -> VideoResponse:
    """Prompt → plan (LLM) → narration (Deepgram) → captions → render. Waits until the MP4 is ready."""
    planned = await plan(PlanRequest(prompt=req.prompt, scenes=req.scenes, model=req.model, mode=req.mode, skills=req.skills))
    rendered = await render(RenderRequest(composition=planned.composition, narrate=req.narrate, captions=req.captions, scale=req.scale))
    return VideoResponse(**rendered.model_dump(), plan_attempts=planned.attempts, plan_mode=planned.mode,
                         llm_input_tokens=planned.input_tokens, llm_output_tokens=planned.output_tokens)


# ------------------------------------------------------------------ new components


class ComponentRequest(BaseModel):
    skills: list[str] | None = None
    request: str = Field(min_length=10, max_length=4000)  # what the new scene should show
    name: str | None = Field(default=None, pattern=r"^[A-Z][A-Za-z0-9]{2,40}Scene$")
    model: str | None = None


@app.post("/components")
async def create_component(req: ComponentRequest) -> dict[str, Any]:
    """Agent writes a new scene, checks it (rules, typecheck, contract, 3 rendered frames) and stages it.
    A staged scene works in videos and the planner sees it; promote it to keep it for good."""
    _check_skills(req.skills, "component")
    r = await build_component(req.request, name=req.name, model=req.model, skills=req.skills)
    return {
        "ok": r.ok, "name": r.name, "job_id": r.job_id, "summary": r.summary, "report": r.report,
        "steps": r.steps, "input_tokens": r.input_tokens, "output_tokens": r.output_tokens,
        "files": r.files, "stills": [f"/components/jobs/{r.job_id}/{Path(p).name}" for p in r.stills],
    }


@app.get("/components")
def staged_components() -> dict[str, Any]:
    """Scenes the agent made that are staged (usable, not yet promoted)."""
    return manifest()


@app.get("/components/jobs/{job_id}/{file}", response_class=FileResponse)
def component_still(job_id: str, file: str) -> FileResponse:
    if not re.fullmatch(r"still-\d+\.png", file):
        raise HTTPException(status_code=400, detail="bad file")
    return FileResponse(_job_file(job_id, file), media_type="image/png")


@app.post("/components/{name}/promote")
async def promote_component(name: str) -> dict[str, str]:
    """Move a staged scene into rendering/src/scenes and registry.ts (rolled back if anything fails)."""
    try:
        path = await promote(name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"promoted": name, "path": path}


@app.delete("/components/{name}")
async def delete_component(name: str) -> dict[str, str]:
    """Remove a staged scene."""
    try:
        await unstage(name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"removed": name}


# ------------------------------------------------------------------- long videos


class LongRequest(BaseModel):
    skills: list[str] | None = None
    prompt: str = Field(min_length=3, max_length=4000)  # topic, e.g. "How Node.js works"
    minutes: float = Field(default=30, ge=3, le=120)  # target length
    chapters: int | None = Field(default=None, ge=2, le=24)  # default: minutes / LONG_CHAPTER_MINUTES
    captions: bool = True
    scale: float = Field(default=1.0, gt=0.1, le=2.0)
    mode: Literal["auto", "catalog", "tools"] | None = None
    model: str | None = None
    run: bool = True  # start planning + rendering right away (False = only write the outline to review)
    render: bool = True  # False = stop after planning every chapter (review the scripts first)


def _long(job_id: str):
    try:
        return long_video.load(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _long_view(state) -> dict[str, Any]:
    return {**state.model_dump(), "running": long_video.is_running(state.id),
            "video_url": f"/long/{state.id}/video" if state.status == "done" else None}


@app.post("/long")
async def create_long(req: LongRequest) -> dict[str, Any]:
    """Long video (20-40 min): writes the outline now (1 LLM call), then plans + renders chapters in the
    background. Poll GET /long/{id} for progress; everything is saved, so it can resume."""
    _check_skills(req.skills)
    try:
        state = await long_video.create_long_video(req.prompt, req.minutes, chapters=req.chapters, captions=req.captions,
                                                   scale=req.scale, mode=req.mode, model=req.model, skills=req.skills)
    except PlanError as exc:
        raise HTTPException(status_code=422, detail={"error": str(exc), "details": exc.details}) from exc
    if req.run:
        long_video.start(state.id, render=req.render)
    return _long_view(state)


@app.get("/long")
def list_long() -> list[dict[str, Any]]:
    return long_video.list_long_videos()


@app.get("/long/{job_id}")
def get_long(job_id: str) -> dict[str, Any]:
    """Status, progress, outline, every chapter's status/tokens/length, timestamps."""
    return _long_view(_long(job_id))


@app.post("/long/{job_id}/run")
async def run_long(job_id: str, render: bool = True) -> dict[str, Any]:
    """Start or resume: skips finished chapters, retries failed ones."""
    _long(job_id)
    try:
        started = long_video.start(job_id, render=render)
    except long_video.JobBusyError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"started": started, "running": True}


@app.put("/long/{job_id}/outline")
def put_long_outline(job_id: str, outline: long_video.Outline) -> dict[str, Any]:
    """Replace the outline with an edited one (all chapters go back to pending)."""
    _long(job_id)
    try:
        return _long_view(long_video.replace_outline(job_id, outline))
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/long/{job_id}/chapters/{n}/plan")
def get_long_chapter_plan(job_id: str, n: int) -> dict[str, Any]:
    _long(job_id)
    path = long_video.plan_file(job_id, n)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"chapter {n} is not planned yet")
    return json.loads(path.read_text())


@app.put("/long/{job_id}/chapters/{n}/plan")
async def put_long_chapter_plan(job_id: str, n: int, composition: dict[str, Any]) -> dict[str, Any]:
    """Replace one chapter's composition by hand (validated); run again to re-render and re-join."""
    _long(job_id)
    try:
        return _long_view(await long_video.set_chapter_plan(job_id, n, composition))
    except RuntimeError as exc:
        status = 422 if isinstance(exc, RenderError) else 409
        raise HTTPException(status_code=status, detail={"error": str(exc), "details": getattr(exc, "details", "")}) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/long/{job_id}/chapters/{n}/redo")
def redo_long_chapter(job_id: str, n: int, stage: Literal["plan", "render"] = "plan", cascade: bool = False) -> dict[str, Any]:
    """Re-plan (or only re-render) one chapter; cascade=true also re-plans the chapters after it."""
    _long(job_id)
    try:
        return _long_view(long_video.redo_chapter(job_id, n, stage, cascade=cascade))
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/long/{job_id}/video", response_class=FileResponse)
def long_video_file(job_id: str) -> FileResponse:
    state = _long(job_id)
    if state.status != "done" or not Path(state.video).exists():
        raise HTTPException(status_code=404, detail="video not ready")
    return FileResponse(state.video, media_type="video/mp4", filename=f"long-{job_id}.mp4")
