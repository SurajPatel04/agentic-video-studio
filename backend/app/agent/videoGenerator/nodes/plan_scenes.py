"""Plan and validate the visual composition using catalog or tool mode."""
import json
import logging
import re
from typing import Any, Literal

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from app.agent.videoGenerator import skills as teaching_skills
from app.config import settings
from app.utils.llm import get_llm, get_tool_llm, text_of, usage_of

from ..prompts.catalog import BRIEF_GUIDANCE, CATALOG_OUTPUT, RULES, SCENE_DIRECTION, TOOLS_INTRO
from ..schemas.lecture import Script
from ..schemas.plan import Plan
from ..state.video import VideoState
from ..tools import catalog, iso_design
from ..tools.plan_repair import Repair, scoped_repair, update_plan_fields
from ..tools.scene_lookup import LOOKUP_TOOLS
from ..validation import PANEL_OVERLAYS, _check, _extract_json, _lint, _normalize, _visual_hint

log = logging.getLogger(__name__)

Mode = Literal["auto", "catalog", "tools"]
Layout = Literal["desktop", "mobile", "square"]
LAYOUTS: dict[str, tuple[int, int]] = {"desktop": (1920, 1080), "mobile": (1080, 1920), "square": (1080, 1080)}


def apply_layout(spec: dict[str, Any], layout: str) -> dict[str, Any]:
    """Force the frame size of a layout (the LLM may copy 1920x1080 from the examples)."""
    spec["width"], spec["height"] = LAYOUTS.get(layout, LAYOUTS["desktop"])
    return spec


class PlanError(RuntimeError):
    def __init__(self, message: str, details: str = ""):
        super().__init__(message)
        self.details = details


def _rules() -> str:
    return (BRIEF_GUIDANCE + "\n" + RULES.replace("OVERLAYS", catalog.overlay_list()).replace("PANELS", ", ".join(sorted(PANEL_OVERLAYS)))
            .replace("TEXTSHARE", f"{settings.PLANNER_MAX_TEXT_SHARE:.0%}").replace("TEXTRUN", str(settings.PLANNER_MAX_TEXT_RUN)))


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


# --------------------------------------------------------------------------- modes


def _repair_for(reply: str, spec: dict | None, problem: str, previous: Repair | None = None,
                *, script: Script | None = None) -> Repair | None:
    """A scoped repair for the flagged fields. A scene that is still broken after a scoped repair is
    repaired whole (full props + its field list), so the model can add a missing object or reshape
    a table instead of guessing the same field again."""
    if spec is None:
        if not problem.startswith("The JSON has these errors:"):
            return None
        spec = _extract_json(reply)
        if script:
            script.bind(spec)
        _normalize(spec)
    repair = scoped_repair(spec, problem, contract=catalog.scene_text)
    again = repair.scenes() & previous.scenes() if repair and previous else set()
    if again:
        log.info("planner.repair whole scenes=%s (still broken after a field repair)", sorted(again))
        repair = scoped_repair(spec, problem, whole=again, contract=catalog.scene_text) or repair
    return repair


FALLBACK_SHARE = 0.25  # at most this share of scenes (and at least 1) may be replaced by a card


async def _salvage(reply: str | None, problem: str, code_demo: str | None, *, lecture: bool = False, explainer: bool = False) -> dict | None:
    """Last resort when attempts run out: replace the few scenes that are still invalid with a plain
    title card that keeps their narration, so one stubborn scene does not fail the whole video."""
    if not reply or not problem.startswith("The JSON has these errors:"):
        return None
    try:
        spec = _normalize(_extract_json(reply))
    except (ValueError, json.JSONDecodeError):
        return None
    scenes = spec.get("scenes", [])
    ids = {s.get("id"): i for i, s in enumerate(scenes)}
    bad = {int(m.group(1)) for m in FIELD_ERROR.finditer(problem) if int(m.group(1)) < len(scenes)}
    bad |= {ids[m.group(1)] for m in SCENE_ERROR.finditer(problem) if m.group(1) in ids}
    if not bad or len(bad) > max(1, int(len(scenes) * FALLBACK_SHARE)):
        return None
    for card in ("IsoScene", "BlankScene"):
        for i in bad:
            old = scenes[i]
            title = str((old.get("props") or {}).get("title") or old.get("id", "")).replace("-", " ").strip()[:60]
            props = ({"title": title, "objects": [], "links": [], "steps": []} if card == "IsoScene"
                     else {"title": title, "titleAt": "top"})
            scenes[i] = {k: v for k, v in old.items() if k in ("id", "durationInFrames", "narration", "transition")}
            scenes[i].update(component=card, props=props)
        fixed, _ = await _check(json.dumps(spec), code_demo, lecture=lecture, explainer=explainer)
        if fixed:
            log.warning("planner.salvage replaced %d invalid scene(s) with a %s card: %s", len(bad), card,
                        ", ".join(str(scenes[i].get("id")) for i in sorted(bad)))
            return fixed
    return None


FIELD_ERROR = re.compile(r"scenes\[(\d+)\] \(")
SCENE_ERROR = re.compile(r"- scene '([^']+)':")


async def _edit(repair: Repair, llm, *, use_tool: bool = False):
    if use_tool:
        llm = llm.bind_tools([update_plan_fields], tool_choice="update_plan_fields")
    msg = await llm.ainvoke(repair.messages())
    try:
        if use_tool:
            call, = msg.tool_calls
            if call["name"] != "update_plan_fields":
                raise ValueError("Unexpected repair tool")
            updates = update_plan_fields.invoke(call["args"])
        else:
            updates = _extract_json(text_of(msg))["updates"]
        return repair.apply(updates), usage_of(msg)
    except (ValueError, TypeError, KeyError) as exc:
        log.warning("planner.repair rejected: %s", exc)
        return None, usage_of(msg)


async def _plan_catalog(topic: str, hint: str, model: str | None, skills: list[str] | tuple[str, ...] = (),
                        *, code_demo: str | None = None, script: Script | None = None) -> Plan:
    known = teaching_skills.guidance(list(skills)) if skills else ""  # iso objects the guides already describe are not repeated
    system = _rules() + hint + CATALOG_OUTPUT + catalog.catalog_text(topic, known=known)
    messages: list[Any] = [SystemMessage(system), HumanMessage(f"Topic: {topic}")]
    llm = get_llm(model or settings.PLANNER_MODEL or None)
    tin = tout = calls = 0
    problem = ""
    best = _Best()  # valid plans with style problems: the one with the fewest is kept
    repair = None
    last: str | None = None  # the latest full reply, for a last-resort salvage
    for attempt in range(1, settings.PLANNER_MAX_ATTEMPTS + 1):
        if repair:
            reply, (i, o) = await _edit(repair, llm)
        else:
            msg = await llm.ainvoke(messages)
            reply, (i, o) = text_of(msg), usage_of(msg)
        calls += 1
        tin, tout = tin + i, tout + o
        if reply is None:
            repair = None
            continue
        spec, problem = await _check(reply, code_demo, lecture="teach-lecture" in skills, explainer="make-explainer" in skills, script=script)
        if spec:
            style = _lint(spec, skills, topic, code_demo=code_demo)
            if not style:
                return Plan(spec, attempt, "catalog", calls, tin, tout)
            if best.add(spec, attempt, style):
                return Plan(best.spec, best.attempt, "catalog", calls, tin, tout)
            problem = style
        log.warning("planner.retry mode=catalog attempt=%d problem=%s", attempt, problem[:300])
        last = reply
        repair = _repair_for(reply, spec, problem, repair, script=script)
        messages = [*messages[:2], AIMessage(reply), HumanMessage(problem)]
    if best.spec:
        return Plan(best.spec, best.attempt, "catalog", calls, tin, tout)
    salvaged = None if script else await _salvage(last, problem, code_demo, lecture="teach-lecture" in skills, explainer="make-explainer" in skills)
    if salvaged:
        return Plan(salvaged, settings.PLANNER_MAX_ATTEMPTS, "catalog", calls, tin, tout)
    raise PlanError(f"planner gave invalid JSON {settings.PLANNER_MAX_ATTEMPTS} times", problem)


async def _plan_tools(topic: str, hint: str, model: str | None, selected: list[str], allowed: list[str] | None,
                      *, code_demo: str | None = None, script: Script | None = None) -> Plan:
    skills = selected
    system = _rules() + hint + TOOLS_INTRO.format(core_scenes=", ".join(catalog.CORE_SCENES))
    messages: list[Any] = [SystemMessage(system), HumanMessage(f"Topic: {topic}")]
    loaded: set[str] = set()
    lookup = dict(LOOKUP_TOOLS)
    if allowed != []:
        lookup.update({t.name: t for t in teaching_skills.tools(allowed=allowed, loaded=loaded)})
    llm = get_tool_llm(model or settings.PLANNER_MODEL or None).bind_tools(list(lookup.values()))
    tin = tout = calls = attempts = 0
    problem = ""
    best = _Best()
    repair = None
    last: str | None = None
    for _ in range(settings.PLANNER_MAX_STEPS):
        if repair:
            reply, (i, o) = await _edit(repair, get_tool_llm(model or settings.PLANNER_MODEL or None), use_tool=True)
            calls += 1
            tin, tout = tin + i, tout + o
            if reply is None:
                repair = None
                attempts += 1
                if attempts >= settings.PLANNER_MAX_ATTEMPTS:
                    break
                continue
            msg = AIMessage(reply)
        else:
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
        last = text_of(msg)
        spec, problem = await _check(last, code_demo, lecture="teach-lecture" in skills, explainer="make-explainer" in skills, script=script)
        if spec:
            style = _lint(spec, skills, topic, code_demo=code_demo)
            if not style:
                return Plan(spec, attempts, "tools", calls, tin, tout, sorted(loaded))
            if best.add(spec, attempts, style):
                return Plan(best.spec, best.attempt, "tools", calls, tin, tout, sorted(loaded))
            problem = style
        log.warning("planner.retry mode=tools attempt=%d problem=%s", attempts, problem[:300])
        if attempts >= settings.PLANNER_MAX_ATTEMPTS:
            break
        repair = _repair_for(last, spec, problem, repair, script=script)
        messages.append(HumanMessage(problem + " Use get_scene to check fields if unsure."))
    if best.spec:
        return Plan(best.spec, best.attempt, "tools", calls, tin, tout, sorted(loaded))
    salvaged = None if script else await _salvage(last, problem, code_demo, lecture="teach-lecture" in skills, explainer="make-explainer" in skills)
    if salvaged:
        return Plan(salvaged, attempts, "tools", calls, tin, tout, sorted(loaded))
    raise PlanError(f"planner did not produce valid JSON (mode=tools, {attempts} attempts, {calls} calls)", problem)


async def plan_scenes(state: VideoState) -> dict:
    """Build and validate scenes using the chosen tools or catalog and optional lecture script."""
    topic, hint, model = state["topic"], state["hint"], state["model"]
    selected, allowed = state["selected"], state["allowed"]
    code_demo, mode, script = state["code_demo"], state["mode"], state.get("script")
    if code_demo is None and state.get("objective"):
        code_demo = ""  # A selected subject guide alone does not require source code.
    if script:
        beats = {sid: beat.model_dump() for sid, beat in script.by_id().items()}
        hint += f"\n{SCENE_DIRECTION}\n{json.dumps(beats, ensure_ascii=False)}\n"
    if "iso-diagrams" in selected:
        hint += iso_design.planner_hint()
    hint += _visual_hint(topic, selected)
    if allowed != []:
        hint += "\nAvailable teaching guides:\n" + teaching_skills.index(allowed=allowed)
    if mode == "tools":
        if selected:
            hint += "\nLoad these guides before planning: " + ", ".join(selected) + ". Use load_skill(name).\n"
        plan = await _plan_tools(topic, hint, model, selected, allowed, code_demo=code_demo, script=script)
    else:
        hint += teaching_skills.guidance(selected)
        available = teaching_skills.discover()
        scene_names = set(catalog.scene_names())
        extra_scenes = dict.fromkeys(n for name in selected for n in available[name].metadata.scenes)
        extra_overlays = dict.fromkeys(n for name in selected for n in available[name].metadata.overlays)
        extra = [catalog.scene_text(n) for n in extra_scenes if n in scene_names]
        hint += "\n" + catalog.kind_legend(*extra, known=teaching_skills.guidance(selected)) + "\n".join(extra)
        hint += "\n" + "\n".join(catalog.overlay_text(n) for n in extra_overlays)
        plan = await _plan_catalog(topic, hint, model, selected, code_demo=code_demo, script=script)
        plan.skills = selected
    calls, tin, tout = state["route_usage"]
    script_calls, script_in, script_out = state.get("script_usage", (0, 0, 0))
    plan.llm_calls += calls + script_calls
    plan.input_tokens += tin + script_in
    plan.output_tokens += tout + script_out
    return {"plan": plan}
