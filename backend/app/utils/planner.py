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
from dataclasses import dataclass, field
from typing import Any, Literal

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool

from app.config import settings
from app.utils import catalog, skills as teaching_skills
from app.utils.console import step
from app.utils.iso import expand_continuations, paper_code_scenes
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
    skills: list[str] = field(default_factory=list)


RULES = """You are the planner for a narrated video generator (React/Remotion), for any subject or purpose.
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
  Copy the shape of the example props. Supply topic-specific content explicitly; sample labels, abbreviations,
  meanings and footers are not facts about this topic. Use defaults for layout/timing, not unrelated example content.
  For DefinitionScene, omit abbreviation unless it is a real abbreviation of the supplied term.
- Keep diagram labels concise, avoid paragraph-sized nodes and edge labels, and split dense explanations into focused scenes.
  A centered terminal on BlankScene is main content; use focusOverlay:false only when deliberately keeping it small.
- Every scene MUST have "narration.text": 1-3 short spoken sentences (max ~40 words), plain words,
  no markup, no emojis. It is read aloud and shown as captions; it should explain what the scene shows.
- The narration is shown as subtitles at the bottom, so keep scene "caption"/"footer" props short (or leave them out) and never repeat the narration on screen.
- On-screen text supports markup: **bold**, ==highlight==, __underline__, ((circle)). Keep it short.
- Scene ids: unique, lowercase, kebab-case. durationInFrames: 90-300 (it is stretched to fit the narration).
- Follow the user's audience, language, purpose and format. A lecture develops understanding; an explainer answers a question; an ad communicates a benefit and next action. Do not force quizzes or a lecture structure into other formats.
- Choose visuals that support the meaning: examples, steps, comparisons, timelines, images or diagrams as appropriate. Avoid unrelated technical imagery and repetitive text slides.
- Optional "overlays" are drawn on top of any scene; positions {"x": 0-100, "y": 0-100} or "top-left" ... "bottom-right".
  Overlay types: OVERLAYS. Use them sparingly and only with fields you are sure of.
- Show, don't just tell: at most TEXTSHARE of the scenes may be text-only (DefinitionScene / ExplainScene /
  BulletListScene), and never more than TEXTRUN in a row. Prefer diagrams, code, comparisons, charts, devices.
- PANEL overlays (PANELS) are big windows: put them only on a BlankScene (its title stays at the top), never on a
  scene that already shows text, code or a diagram, where they would cover it. Small overlays (callout, badge,
  check, highlight...) are fine on any scene.
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
    expand_continuations(spec)  # IsoScene "continue": carry the previous picture over
    paper_code_scenes(spec)  # paper-style video: no dark CodeScene
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
        props = scene.get("props")
        kinds = {o.get("type") for o in scene.get("overlays") or [] if isinstance(o, dict)}
        if scene.get("component") == "TitleScene" and kinds & PANEL_OVERLAYS and isinstance(props, dict):
            # a centred title would sit behind the panel: same title, at the top of an empty canvas
            scene["component"], props = "BlankScene", {"title": props.get("title") or "", "titleAt": "top"}
            scene["props"] = props
        if isinstance(props, dict):  # no example footer/caption text in real videos
            for key in catalog.filler_fields(str(scene.get("component", ""))):
                props.setdefault(key, "")
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


TEXT_SCENES = {"DefinitionScene", "ExplainScene", "BulletListScene"}


def _rules() -> str:
    return (RULES.replace("OVERLAYS", catalog.overlay_list()).replace("PANELS", ", ".join(sorted(PANEL_OVERLAYS)))
            .replace("TEXTSHARE", f"{settings.PLANNER_MAX_TEXT_SHARE:.0%}").replace("TEXTRUN", str(settings.PLANNER_MAX_TEXT_RUN)))


PANEL_OVERLAYS = {"terminal", "chat"}  # big windows that cover whatever is under them
PANEL_HOSTS = {"BlankScene"}  # scenes with free space for them


CODE_SKILLS = {"teach-code"}  # with these guides, the plan must show code regularly


def _lint(spec: dict[str, Any], skills: list[str] | tuple[str, ...] = ()) -> str:
    """Style problems in a VALID plan (one retry is spent on them; a valid plan is never lost)."""
    problems = []
    scenes = spec.get("scenes", [])
    texts = sum(s.get("component") in TEXT_SCENES for s in scenes)
    cap = max(2, int(len(scenes) * settings.PLANNER_MAX_TEXT_SHARE))
    if scenes and texts > cap:
        problems.append(f"{texts} of {len(scenes)} scenes are text-only (Definition/Explain/BulletList); the most allowed is "
                        f"{cap}. Turn {texts - cap} of them into scenes that SHOW the idea (code, flowchart, cycle, comparison, "
                        "chart, timeline, devices, connection).")
    if settings.PLANNER_CODE_EVERY and CODE_SKILLS & set(skills):
        need = -(-len(scenes) // settings.PLANNER_CODE_EVERY)  # ceil
        have = sum(s.get("component") == "CodeScene" for s in scenes)
        if have < need:
            problems.append(f"this is a programming topic: it needs at least {need} CodeScene (one per main concept, about "
                            f"1 in every {settings.PLANNER_CODE_EVERY} scenes) but has {have}. Show the code that produces "
                            "each behavior you explain, using the same running example.")
    run, worst, at = 0, 0, ""
    for s in spec.get("scenes", []):
        run = run + 1 if s.get("component") in TEXT_SCENES else 0
        if run > worst:
            worst, at = run, s.get("id", "")
    if worst > settings.PLANNER_MAX_TEXT_RUN:
        problems.append(f"{worst} text-only scenes in a row (Definition/Explain/BulletList, ending at '{at}'); the limit is "
                        f"{settings.PLANNER_MAX_TEXT_RUN}. Replace some with a visual scene (code, diagram, flowchart, "
                        "comparison, chart, devices) that shows the same idea.")
    covered = [f"'{s.get('id')}' ({s.get('component')}: {', '.join(sorted(kinds))})" for s in spec.get("scenes", [])
               if s.get("component") not in PANEL_HOSTS
               and (kinds := {o.get("type") for o in s.get("overlays") or [] if isinstance(o, dict)} & PANEL_OVERLAYS)]
    if covered:
        problems.append("panel overlays would cover the scene's content in " + "; ".join(covered) + ". Move each panel "
                        "into its own BlankScene (short title, panel at \"center\", the narration about it) right after.")
    problems += _lint_iso(scenes)
    if not problems:
        return ""
    return "The plan is valid, but:\n- " + "\n- ".join(problems) + "\nReply with ONLY the full corrected JSON."


class _Best:
    """Valid plans that still have style problems. After PLANNER_STYLE_RETRIES retries the plan with the
    fewest problems wins (a later plan wins a tie: it has seen the feedback)."""

    def __init__(self) -> None:
        self.spec: dict[str, Any] | None = None
        self.attempt, self.problems, self.seen = 0, 0, 0

    def add(self, spec: dict[str, Any], attempt: int, style: str) -> bool:
        """Remember ``spec``; True when no style retries are left (use ``self.spec``)."""
        n = style.count("\n- ")
        if self.spec is None or n <= self.problems:
            self.spec, self.attempt, self.problems = spec, attempt, n
        self.seen += 1
        return self.seen > settings.PLANNER_STYLE_RETRIES


HUBS = {"loadbalancer", "router", "api"}  # these send to each target directly
EVENT_LABEL = re.compile(r"^(request|req|response|packet|call|turn)\b", re.I)


def _lint_iso(scenes: list[dict[str, Any]]) -> list[str]:
    """IsoScene problems the validator can't see: chains behind a hub, one layout repeated, event labels."""
    problems: list[str] = []
    run: list[str] = []
    last = None
    for s in scenes:
        if s.get("component") != "IsoScene":
            run, last = [], None
            continue
        props = s.get("props") or {}
        objs = {o.get("id"): o for o in props.get("objects") or [] if isinstance(o, dict)}
        kinds = {i: o.get("kind") for i, o in objs.items()}
        if HUBS & set(kinds.values()):
            chain = [f"{l.get('from')}->{l.get('to')}" for l in props.get("links") or []
                     if kinds.get(l.get("from")) == "server" and kinds.get(l.get("to")) == "server"]
            if chain:
                problems.append(f"scene '{s.get('id')}': {', '.join(chain)} chains servers, but servers don't pass requests on; "
                                "link the hub (load balancer / router / api) to EACH server instead.")
        bad = [f"{i} ('{o.get('label')}')" for i, o in objs.items() if o.get("label") and o.get("kind") not in ("people", "user")
               and EVENT_LABEL.match(str(o.get("label")))]
        if bad:
            problems.append(f"scene '{s.get('id')}': labels name the object, not an event: {', '.join(bad)}. "
                            "Keep 'Server A'; say what happens in a step note.")
        layout = tuple(sorted((i, tuple(round(v, 1) for v in o.get("at", []))) for i, o in objs.items()))
        if props.get("continued"):  # a continuation reuses the picture on purpose (and cheaply)
            run, last = [], layout
            continue
        run = run + [s.get("id", "")] if layout and layout == last else [s.get("id", "")]
        last = layout
        if len(run) == settings.PLANNER_MAX_SAME_LAYOUT + 1:
            problems.append(f"scenes {', '.join(run)} rewrite the same layout from scratch. If it is the same picture, write "
                            "the later scenes with \"continue\": true and ONLY the changes (new objects / links / steps, \"remove\"); "
                            "otherwise change the picture (close-up, rearrange, add or remove objects).")
    return problems


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


async def _plan_catalog(topic: str, hint: str, model: str | None, skills: list[str] | tuple[str, ...] = ()) -> Plan:
    system = _rules() + hint + "\nOutput ONLY the JSON object, no prose, no code fences.\n\nScene library:\n" + catalog.catalog_text(topic)
    messages: list[Any] = [SystemMessage(system), HumanMessage(f"Topic: {topic}")]
    llm = get_llm(model or settings.PLANNER_MODEL or None)
    tin = tout = calls = 0
    problem = ""
    best = _Best()  # valid plans with style problems: the one with the fewest is kept
    for attempt in range(1, settings.PLANNER_MAX_ATTEMPTS + 1):
        msg = await llm.ainvoke(messages)
        calls += 1
        i, o = usage_of(msg)
        tin, tout = tin + i, tout + o
        reply = text_of(msg)
        spec, problem = await _check(reply)
        if spec:
            style = _lint(spec, skills)
            if not style:
                return Plan(spec, attempt, "catalog", calls, tin, tout)
            if best.add(spec, attempt, style):
                return Plan(best.spec, best.attempt, "catalog", calls, tin, tout)
            problem = style
        log.warning("planner.retry mode=catalog attempt=%d problem=%s", attempt, problem[:300])
        messages += [AIMessage(reply), HumanMessage(problem)]
    if best.spec:
        return Plan(best.spec, best.attempt, "catalog", calls, tin, tout)
    raise PlanError(f"planner gave invalid JSON {settings.PLANNER_MAX_ATTEMPTS} times", problem)


async def _plan_tools(topic: str, hint: str, model: str | None, selected: list[str], allowed: list[str] | None) -> Plan:
    skills = selected
    system = (
        _rules()
        + hint
        + "\nYou do NOT know the library yet. Use the tools: search_scenes to find candidates, get_scene for the exact fields of "
        "every scene you use (always, before using it), list_device_kinds when a field needs a device, get_overlay before using an overlay.\n"
        "When done, reply with ONLY the final composition JSON (no prose, no code fences).\n"
        f"Core teaching scenes that fit any subject: {', '.join(catalog.CORE_SCENES)}."
    )
    messages: list[Any] = [SystemMessage(system), HumanMessage(f"Topic: {topic}")]
    loaded: set[str] = set()
    lookup = dict(LOOKUP_TOOLS)
    if allowed != []:
        lookup.update({t.name: t for t in teaching_skills.tools(allowed=allowed, loaded=loaded)})
    llm = get_tool_llm(model or settings.PLANNER_MODEL or None).bind_tools(list(lookup.values()))
    tin = tout = calls = attempts = 0
    problem = ""
    best = _Best()
    for _ in range(settings.PLANNER_MAX_STEPS):
        msg = await llm.ainvoke(messages)
        calls += 1
        i, o = usage_of(msg)
        tin, tout = tin + i, tout + o
        messages.append(msg)
        if msg.tool_calls:
            for call in msg.tool_calls:
                fn = lookup.get(call["name"])
                result = fn.invoke(call["args"]) if fn else f"Unknown tool {call['name']}"
                log.info("tool %s(%s) -> %d chars", call["name"], json.dumps(call["args"])[:120], len(str(result)))
                messages.append(ToolMessage(str(result)[:8000], tool_call_id=call["id"]))
            continue
        missing = set(selected) - loaded
        if missing:
            messages.append(HumanMessage("Before planning, call load_skill for: " + ", ".join(sorted(missing))))
            continue
        attempts += 1
        spec, problem = await _check(text_of(msg))
        if spec:
            style = _lint(spec, skills)
            if not style:
                return Plan(spec, attempts, "tools", calls, tin, tout, sorted(loaded))
            if best.add(spec, attempts, style):
                return Plan(best.spec, best.attempt, "tools", calls, tin, tout, sorted(loaded))
            problem = style
        log.warning("planner.retry mode=tools attempt=%d problem=%s", attempts, problem[:300])
        if attempts >= settings.PLANNER_MAX_ATTEMPTS:
            break
        messages.append(HumanMessage(problem + " Use get_scene to check fields if unsure."))
    if best.spec:
        return Plan(best.spec, best.attempt, "tools", calls, tin, tout, sorted(loaded))
    raise PlanError(f"planner did not produce valid JSON (mode=tools, {attempts} attempts, {calls} calls)", problem)


async def plan_video(topic: str, *, scenes: int | None = None, model: str | None = None, mode: Mode | None = None,
                     context: str = "", skills: list[str] | None = None) -> Plan:
    """Ask the LLM for a valid composition about ``topic`` (printed as one step with its result)."""
    with step("plan", topic=topic, scenes=scenes, mode=mode or settings.PLANNER_MODE) as s:
        plan = await _plan_video(topic, scenes=scenes, model=model, mode=mode, context=context, skills=skills)
        s.update(mode=plan.mode, skills=",".join(plan.skills), scenes=len(plan.spec.get("scenes", [])),
                 attempts=plan.attempts, llm_calls=plan.llm_calls, tokens_in=plan.input_tokens, tokens_out=plan.output_tokens)
        return plan


async def _plan_video(topic: str, *, scenes: int | None = None, model: str | None = None, mode: Mode | None = None,
                      context: str = "", skills: list[str] | None = None) -> Plan:
    """Ask the LLM for a valid composition about ``topic``.

    ``context``: extra instructions added to the rules, e.g. a long video's outline and what earlier
    chapters covered (see app/utils/long_video.py)."""
    hint = f"- Make about {scenes} scenes.\n" if scenes else "- Make 6-10 scenes.\n"
    if context:
        hint += "\n" + context.strip() + "\n"
    mode = mode or settings.PLANNER_MODE
    if mode == "auto":
        mode = "tools" if len(catalog.scene_names()) > settings.PLANNER_TOOLS_THRESHOLD else "catalog"
    selected = teaching_skills.select(topic, skills)
    allowed = selected if skills is not None else None
    if skills != []:
        hint += "\nAvailable teaching guides:\n" + teaching_skills.index(allowed=allowed)
    if mode == "tools":
        if selected:
            hint += "\nLoad these guides before planning: " + ", ".join(selected) + ". Use load_skill(name).\n"
        plan = await _plan_tools(topic, hint, model, selected, allowed)
    else:
        hint += teaching_skills.guidance(selected)
        available = teaching_skills.discover()
        scene_names = set(catalog.scene_names())
        extra_scenes = dict.fromkeys(n for name in selected for n in available[name].metadata.scenes)
        extra_overlays = dict.fromkeys(n for name in selected for n in available[name].metadata.overlays)
        hint += "\n" + "\n".join(catalog.scene_text(n) for n in extra_scenes if n in scene_names)
        hint += "\n" + "\n".join(catalog.overlay_text(n) for n in extra_overlays)
        plan = await _plan_catalog(topic, hint, model, selected)
        plan.skills = selected
    return plan
