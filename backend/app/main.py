import re
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.config import settings
from app.utils.llm import call_model
from app.agent.component_agent import build_component
from app.agent.staging import manifest, promote, unstage
from app.utils.planner import PlanError, plan_video
from app.utils.render import RenderError, render_video
from app.utils.tts import MAX_CHARS, synthesize

app = FastAPI(title="Agentic Video Studio API")


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


class PlanRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=4000)  # topic / what the video should teach
    scenes: int | None = Field(default=None, ge=2, le=20)  # rough number of scenes
    model: str | None = None  # MLflow gateway route; defaults to PLANNER_MODEL / DEFAULT_MODEL
    mode: Literal["auto", "catalog", "tools"] | None = None  # how the LLM learns the library (default PLANNER_MODE)


class PlanResponse(BaseModel):
    composition: dict[str, Any]
    attempts: int
    mode: str
    llm_calls: int
    input_tokens: int
    output_tokens: int


@app.post("/plan", response_model=PlanResponse)
async def plan(req: PlanRequest) -> PlanResponse:
    """LLM writes the composition JSON (scenes, props, narration). Nothing is rendered."""
    try:
        p = await plan_video(req.prompt, scenes=req.scenes, model=req.model, mode=req.mode)
    except PlanError as exc:
        raise HTTPException(status_code=422, detail={"error": str(exc), "details": exc.details}) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"planner failed: {exc}") from exc
    return PlanResponse(composition=p.spec, attempts=p.attempts, mode=p.mode, llm_calls=p.llm_calls, input_tokens=p.input_tokens, output_tokens=p.output_tokens)


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
    planned = await plan(PlanRequest(prompt=req.prompt, scenes=req.scenes, model=req.model, mode=req.mode))
    rendered = await render(RenderRequest(composition=planned.composition, narrate=req.narrate, captions=req.captions, scale=req.scale))
    return VideoResponse(**rendered.model_dump(), plan_attempts=planned.attempts, plan_mode=planned.mode,
                         llm_input_tokens=planned.input_tokens, llm_output_tokens=planned.output_tokens)


# ------------------------------------------------------------------ new components


class ComponentRequest(BaseModel):
    request: str = Field(min_length=10, max_length=4000)  # what the new scene should show
    name: str | None = Field(default=None, pattern=r"^[A-Z][A-Za-z0-9]{2,40}Scene$")
    model: str | None = None


@app.post("/components")
async def create_component(req: ComponentRequest) -> dict[str, Any]:
    """Agent writes a new scene, checks it (rules, typecheck, contract, 3 rendered frames) and stages it.
    A staged scene works in videos and the planner sees it; promote it to keep it for good."""
    r = await build_component(req.request, name=req.name, model=req.model)
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
