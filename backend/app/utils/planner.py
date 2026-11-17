"""Planner: the LLM turns a topic into a composition JSON (scenes + props + narration).

    plan = await plan_video("Explain LAN, MAN and WAN with examples")
    plan.spec, plan.attempts, plan.mode, plan.input_tokens, plan.output_tokens

Two ways for the LLM to know what the library has (``mode``):
- ``catalog``: the relevant scenes (topic filter, see app/utils/catalog.py) are put in the prompt. 1 call.
- ``tools``:   the prompt is small; the LLM looks things up with search_scenes / get_scene /
               list_device_kinds / get_overlay. Better when the library is large.
- ``auto``:    catalog until the library has more than PLANNER_TOOLS_THRESHOLD scenes, then tools.

Either way the JSON is checked with the same validator as renders; errors go back to the LLM
(PLANNER_MAX_ATTEMPTS tries).
"""

import json
import logging
import re
import uuid
from dataclasses import dataclass
from typing import Any, Literal

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool

from app.config import settings
from app.utils import catalog
from app.utils.llm import get_llm, get_tool_llm, text_of, usage_of
from app.utils.render import RenderError, validate

log = logging.getLogger(__name__)

Mode = Literal["auto", "catalog", "tools"]


class PlanError(RuntimeError):
    def __init__(self, message: str, details: str = ""):
        super().__init__(message)
        self.details = details


@dataclass
class Plan:
    spec: dict[str, Any]
    attempts: int
    mode: str
    llm_calls: int
    input_tokens: int
    output_tokens: int


RULES = """You are the planner for an educational explainer-video generator (React/Remotion).
You turn a topic into ONE composition JSON.

Shape:
{
  "fps": 30, "width": 1920, "height": 1080,
  "defaultTransition": {"type": "fade", "durationInFrames": 15},
  "audio": {"effects": true},
  "scenes": [
    {"id": "intro", "component": "<SceneName>", "durationInFrames": 150,
      "props": {...only fields listed for that scene...},
      "narration": {"text": "What the narrator says during this scene."},
      "overlays": [ ...optional... ]}
  ]
}

Rules:
- Use ONLY scene names from the library, and ONLY the fields listed for each scene (unknown keys are errors).
  Copy the shape of the example props; leave out fields you don't need (defaults apply).
- Every scene MUST have "narration.text": 1-3 short spoken sentences (max ~40 words), plain words,
  no markup, no emojis. It is read aloud and shown as captions; it should explain what the scene shows.
- The narration is shown as subtitles at the bottom, so keep scene "caption"/"footer" props short (or leave them out) and never repeat the narration on screen.
- On-screen text supports markup: **bold**, ==highlight==, __underline__, ((circle)). Keep it short.
- Scene ids: unique, lowercase, kebab-case. durationInFrames: 90-300 (it is stretched to fit the narration).
- Teach step by step: hook/title -> concepts -> real-life examples -> comparison or steps -> quiz or summary.
- Prefer varied, visual scenes (devices, connections, charts, diagrams) over plain bullet lists.
- Optional "overlays" are drawn on top of any scene; positions {"x": 0-100, "y": 0-100} or "top-left" ... "bottom-right".
  Overlay types: OVERLAYS. Use them sparingly and only with fields you are sure of.
"""


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fence:
        text = fence.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in the reply")
    return json.loads(text[start : end + 1])


def _normalize(spec: dict[str, Any]) -> dict[str, Any]:
    spec.setdefault("fps", 30)
    spec.setdefault("width", 1920)
    spec.setdefault("height", 1080)
    seen: set[str] = set()
    for i, scene in enumerate(spec.get("scenes", [])):
        sid = re.sub(r"[^a-z0-9-]+", "-", str(scene.get("id") or f"scene-{i + 1}").lower()).strip("-") or f"scene-{i + 1}"
        while sid in seen:
            sid += "-2"
        seen.add(sid)
        scene["id"] = sid
    return spec


async def _check(reply: str) -> tuple[dict[str, Any] | None, str]:
    """Parse + validate a reply. Returns (spec, "") or (None, problem to send back)."""
    try:
        spec = _normalize(_extract_json(reply))
    except (ValueError, json.JSONDecodeError) as exc:
        return None, f"Your reply was not a valid JSON object ({exc}). Reply with ONLY the corrected JSON."
    work = settings.WORKSPACE_DIR / "plans"
    work.mkdir(parents=True, exist_ok=True)
    path = work / f"{uuid.uuid4().hex[:12]}.json"
    path.write_text(json.dumps(spec, indent=2))
    try:
        await validate(path)
    except RenderError as exc:
        return None, f"The JSON has these errors:\n{exc.details}\nFix them and reply with ONLY the full corrected JSON."
    return spec, ""


# ------------------------------------------------------------------- tools (lookup)


@tool
def search_scenes(query: str) -> str:
    """Find scenes for a topic or visual idea (e.g. "network packets", "compare two things", "circuit").
    Returns scene names with a one-line description, best match first."""
    hits = catalog.search_scenes(query, limit=10)
    return "\n".join(f"- {n}: {d}" for n, d, _ in hits) or "No match. Try other words, or use the core scenes: " + ", ".join(catalog.CORE_SCENES)


@tool
def get_scene(name: str) -> str:
    """Get one scene's description, every field it accepts (? = optional, a|b = allowed values) and example props."""
    return catalog.scene_text(name)


@tool
def list_device_kinds() -> str:
    """All device kinds usable where a field says <device kind> (2D icons and 3D models)."""
    return ", ".join(catalog.device_kinds())


@tool
def get_overlay(kind: str) -> str:
    """Fields of one overlay type (callout, check, terminal, ...), to put in a scene's "overlays" list."""
    return catalog.overlay_text(kind)


LOOKUP_TOOLS = {t.name: t for t in (search_scenes, get_scene, list_device_kinds, get_overlay)}


# --------------------------------------------------------------------------- modes


async def _plan_catalog(topic: str, hint: str, model: str | None) -> Plan:
    system = RULES.replace("OVERLAYS", catalog.overlay_list()) + hint + "\nOutput ONLY the JSON object, no prose, no code fences.\n\nScene library:\n" + catalog.catalog_text(topic)
    messages: list[Any] = [SystemMessage(system), HumanMessage(f"Topic: {topic}")]
    llm = get_llm(model or settings.PLANNER_MODEL or None)
    tin = tout = calls = 0
    problem = ""
    for attempt in range(1, settings.PLANNER_MAX_ATTEMPTS + 1):
        msg = await llm.ainvoke(messages)
        calls += 1
        i, o = usage_of(msg)
        tin, tout = tin + i, tout + o
        reply = text_of(msg)
        spec, problem = await _check(reply)
        if spec:
            return Plan(spec, attempt, "catalog", calls, tin, tout)
        log.warning("planner.retry mode=catalog attempt=%d problem=%s", attempt, problem[:300])
        messages += [AIMessage(reply), HumanMessage(problem)]
    raise PlanError(f"planner gave invalid JSON {settings.PLANNER_MAX_ATTEMPTS} times", problem)


async def _plan_tools(topic: str, hint: str, model: str | None) -> Plan:
    system = (
        RULES.replace("OVERLAYS", catalog.overlay_list())
        + hint
        + "\nYou do NOT know the library yet. Use the tools: search_scenes to find candidates, get_scene for the exact fields of "
        "every scene you use (always, before using it), list_device_kinds when a field needs a device, get_overlay before using an overlay.\n"
        "When done, reply with ONLY the final composition JSON (no prose, no code fences).\n"
        f"Core teaching scenes that fit any subject: {', '.join(catalog.CORE_SCENES)}."
    )
    messages: list[Any] = [SystemMessage(system), HumanMessage(f"Topic: {topic}")]
    llm = get_tool_llm(model or settings.PLANNER_MODEL or None).bind_tools(list(LOOKUP_TOOLS.values()))
    tin = tout = calls = attempts = 0
    problem = ""
    for _ in range(settings.PLANNER_MAX_STEPS):
        msg = await llm.ainvoke(messages)
        calls += 1
        i, o = usage_of(msg)
        tin, tout = tin + i, tout + o
        messages.append(msg)
        if msg.tool_calls:
            for call in msg.tool_calls:
                fn = LOOKUP_TOOLS.get(call["name"])
                result = fn.invoke(call["args"]) if fn else f"Unknown tool {call['name']}"
                messages.append(ToolMessage(str(result)[:8000], tool_call_id=call["id"]))
            continue
        attempts += 1
        spec, problem = await _check(text_of(msg))
        if spec:
            return Plan(spec, attempts, "tools", calls, tin, tout)
        log.warning("planner.retry mode=tools attempt=%d problem=%s", attempts, problem[:300])
        if attempts >= settings.PLANNER_MAX_ATTEMPTS:
            break
        messages.append(HumanMessage(problem + " Use get_scene to check fields if unsure."))
    raise PlanError(f"planner did not produce valid JSON (mode=tools, {attempts} attempts, {calls} calls)", problem)


async def plan_video(topic: str, *, scenes: int | None = None, model: str | None = None, mode: Mode | None = None) -> Plan:
    """Ask the LLM for a valid composition about ``topic``."""
    hint = f"- Make about {scenes} scenes.\n" if scenes else "- Make 6-10 scenes.\n"
    mode = mode or settings.PLANNER_MODE
    if mode == "auto":
        mode = "tools" if len(catalog.scene_names()) > settings.PLANNER_TOOLS_THRESHOLD else "catalog"
    plan = await (_plan_tools if mode == "tools" else _plan_catalog)(topic, hint, model)
    log.info("planner.ok mode=%s attempts=%d calls=%d tokens_in=%d tokens_out=%d scenes=%d",
             plan.mode, plan.attempts, plan.llm_calls, plan.input_tokens, plan.output_tokens, len(plan.spec.get("scenes", [])))
    return plan
