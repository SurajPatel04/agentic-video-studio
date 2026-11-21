"""Plan and validate the visual composition using catalog or tool mode."""
import json
import logging
import re
from typing import Any, Literal, Sequence

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from app.agent.videoGenerator import skills as teaching_skills
from app.config import settings
from app.utils.llm import get_llm, get_tool_llm, text_of, usage_of

from ..jobs.scene_stream import planner_response
from ..prompts.catalog import BRIEF_GUIDANCE, CATALOG_OUTPUT, RULES, TOOLS_INTRO
from ..schemas.plan import Plan
from ..state.video import VideoState
from ..tools import catalog, iso_design
from ..tools.plan_repair import Repair, scoped_repair, update_plan_fields
from ..tools.scene_lookup import (
    LOOKUP_TOOLS, LookupCache, chapter_lookup_reference, device_legend, iso_inventory_version, scene_details,
    search_scene_summaries,
)
from ..validation import PANEL_OVERLAYS, _check, _extract_json, _lint, _normalize, _visual_hint
from ..validation import apply_layout as apply_layout

log = logging.getLogger(__name__)

Mode = Literal["auto", "catalog", "tools"]


class PlanError(RuntimeError):
    def __init__(self, message: str, details: str = ""):
        super().__init__(message)
        self.details = details


def _rules() -> str:
    return BRIEF_GUIDANCE + "\n" + RULES.replace("OVERLAYS", catalog.overlay_list()).replace("PANELS", ", ".join(sorted(PANEL_OVERLAYS)))


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


def _repair_for(reply: str, spec: dict | None, problem: str, previous: Repair | None = None) -> Repair | None:
    """A scoped repair for the flagged fields. A scene that is still broken after a scoped repair is
    repaired whole (full props + its field list), so the model can add a missing object or reshape
    a table instead of guessing the same field again."""
    if spec is None:
        if not problem.startswith("The JSON has these errors:"):
            return None
        spec = _extract_json(reply)
        _normalize(spec)
    repair = scoped_repair(spec, problem, contract=catalog.scene_text)
    again = repair.scenes() & previous.scenes() if repair and previous else set()
    if again:
        log.info("planner.repair whole scenes=%s (still broken after a field repair)", sorted(again))
        repair = scoped_repair(spec, problem, whole=again, contract=catalog.scene_text) or repair
    return repair


FALLBACK_SHARE = 0.25  # at most this share of scenes (and at least 1) may be replaced by a card


async def _salvage(reply: str | None, problem: str, code_demo: str | None, *, explainer: bool = False,
                   layout: str = "desktop") -> dict | None:
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
        fixed, _ = await _check(json.dumps(spec), code_demo, explainer=explainer, layout=layout)
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
                        *, code_demo: str | None = None, allowed: list[str] | None = None,
                        layout: str = "desktop", scene_shortlist: Sequence[str] = ()) -> Plan:
    lecture = "teach-lecture" in skills
    explainer = "make-explainer" in skills
    guides = teaching_skills.guidance(list(skills))
    available = teaching_skills.discover()
    preferred = [*scene_shortlist, *(scene for name in skills for scene in available[name].metadata.scenes)]
    overlays = dict.fromkeys(overlay for name in skills for overlay in available[name].metadata.overlays)
    index = "\nAvailable teaching guides:\n" + teaching_skills.index(allowed=allowed) if allowed != [] else ""
    system = (_rules() + index + guides + CATALOG_OUTPUT + catalog.catalog_text(topic, known=guides, preferred=preferred)
              + "\n" + "\n".join(catalog.overlay_text(name) for name in overlays))
    messages: list[Any] = [SystemMessage(system), HumanMessage(f"Topic: {topic}\n\n{hint.strip()}")]
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
            msg = await planner_response(llm, messages, lecture=lecture, explainer=explainer)
            reply, (i, o) = text_of(msg), usage_of(msg)
        calls += 1
        tin, tout = tin + i, tout + o
        if reply is None:
            repair = None
            continue
        spec, problem = await _check(reply, code_demo, lecture=lecture, explainer=explainer, layout=layout)
        if spec:
            style = _lint(spec, skills, topic, code_demo=code_demo)
            if not style:
                return Plan(spec, attempt, "catalog", calls, tin, tout)
            if best.add(spec, attempt, style):
                return Plan(best.spec, best.attempt, "catalog", calls, tin, tout)
            problem = style
        log.warning("planner.retry mode=catalog attempt=%d problem=%s", attempt, problem[:300])
        last = reply
        repair = _repair_for(reply, spec, problem, repair)
        messages = [*messages[:2], AIMessage(reply), HumanMessage(problem)]
    if best.spec:
        return Plan(best.spec, best.attempt, "catalog", calls, tin, tout)
    salvaged = None if lecture else await _salvage(last, problem, code_demo, explainer=explainer, layout=layout)
    if salvaged:
        return Plan(salvaged, settings.PLANNER_MAX_ATTEMPTS, "catalog", calls, tin, tout)
    raise PlanError(f"planner gave invalid JSON {settings.PLANNER_MAX_ATTEMPTS} times", problem)


def _preloaded_scenes(code_demo: str | None, selected: list[str], scene_shortlist: Sequence[str] = (),
                      *, diagram: bool = True) -> list[str]:
    """Scenes whose fields go in the prompt: the fixed set first (same for every topic), then the topic's.
    ``diagram=False`` (TypeSafe: the brief needs no diagram) leaves out IsoScene's ~4k characters."""
    names = list(catalog.TOOLS_PRELOADED_SCENES)
    if code_demo:
        names.append("EditorScene")
    if "iso-diagrams" in selected and diagram:
        names.append("IsoScene")
    available = set(catalog.scene_names())
    return [name for name in dict.fromkeys([*names, *scene_shortlist]) if name in available]


def _tools_system(selected: list[str], guides: str, preloaded: list[str], prepicked: dict) -> str:
    """Tools-mode system prompt, ordered for provider prompt caching: the part that is the same for every
    topic (rules, tool intro, the fixed scene fields) comes first and is byte-identical between calls; the
    guides and the topic's own picks follow."""
    fixed = [n for n in preloaded if n in catalog.TOOLS_PRELOADED_SCENES]
    extra = [n for n in preloaded if n not in fixed]
    contract = lambda names: "\n\n".join(catalog.scene_text(n, compact=True, link_diagram=True) for n in names)
    system = _rules() + TOOLS_INTRO + "\n\nPreloaded scene fields:\n" + contract(fixed) + "\n" + guides
    if extra:
        system += "\n\nScene fields for this topic:\n" + contract(extra)
        # only for the topic's scenes: ExplainScene's rarely used "device" alone is not worth it on every call
        system += device_legend(contract(extra))
    available = teaching_skills.discover()
    overlays = dict.fromkeys([*(o for name in selected if name in available for o in available[name].metadata.overlays),
                              *prepicked.get("overlays", [])])
    if overlays:
        system += "\n\nOverlay fields for this topic:\n" + "\n".join(catalog.overlay_text(o) for o in overlays)
    if prepicked.get("iso") and "IsoScene" in preloaded:
        system += ("\n\nIso objects for this topic (use these before calling find_iso_objects):\n"
                   + "\n".join(prepicked["iso"]))
    return system


def _compact_old_lookups(tool_history: list[AIMessage | ToolMessage], scenes: dict[str, str]) -> None:
    """Earlier get_scene results shrink to their field list once the model has read them (description and
    example props are dropped), so each later planner turn re-sends less."""
    for i, message in enumerate(tool_history):
        name = scenes.get(getattr(message, "tool_call_id", ""))
        if name and isinstance(message, ToolMessage):
            compact = catalog.scene_text(name, compact=True, link_diagram=True)
            if len(compact) < len(str(message.content)):
                tool_history[i] = ToolMessage(compact + "\n(details shown earlier)", tool_call_id=message.tool_call_id)
            scenes.pop(message.tool_call_id)


async def _plan_tools(topic: str, hint: str, model: str | None, selected: list[str],
                      *, code_demo: str | None = None, layout: str = "desktop",
                      scene_shortlist: Sequence[str] = (), lookup_cache: LookupCache | None = None,
                      lookup_focus: str = "", prepicked: dict | None = None) -> Plan:
    lecture = "teach-lecture" in selected
    explainer = "make-explainer" in selected
    prepicked = prepicked or {}
    preloaded = _preloaded_scenes(code_demo, selected, scene_shortlist, diagram=prepicked.get("diagram", True))
    guides = teaching_skills.guidance(selected, asset_lookup=True)
    system = _tools_system(selected, guides, preloaded, prepicked)
    initial: list[SystemMessage | HumanMessage | AIMessage] = [SystemMessage(system)]
    tool_history: list[AIMessage | ToolMessage] = []
    retry_context: list[AIMessage | HumanMessage] = []
    lookup = LOOKUP_TOOLS
    cache = lookup_cache if lookup_cache is not None else {}
    known_scenes = set(preloaded)
    reference, reused_scenes = chapter_lookup_reference(cache, lookup_focus or topic, known_scenes)
    if reference:
        initial.append(AIMessage("Reference lookups from earlier planning. Use the fields or assets below if they fit "
                                 "the current chapter. Look up any missing detail.\n\n" + reference))
        known_scenes.update(reused_scenes)
    initial.append(HumanMessage(f"Topic: {topic}\n\n{hint.strip()}"))
    examples_sent: set[str] = set()
    scene_results: dict[str, str] = {}  # tool call id -> scene, for get_scene results not yet compacted
    model = model or settings.PLANNER_MODEL or None
    repair_llm = get_tool_llm(model)
    llm = repair_llm.bind_tools(list(lookup.values()))
    tin = tout = calls = attempts = 0
    problem = ""
    best = _Best()
    repair = None
    last: str | None = None
    for _ in range(settings.PLANNER_MAX_STEPS):
        if repair:
            reply, (i, o) = await _edit(repair, repair_llm, use_tool=True)
            calls += 1
            tin, tout = tin + i, tout + o
            if reply is None:
                repair = None
                attempts += 1
                if attempts >= settings.PLANNER_MAX_ATTEMPTS:
                    break
                continue
        else:
            msg = await planner_response(llm, [*initial, *tool_history, *retry_context], tools=True,
                                         lecture=lecture, explainer=explainer)
            calls += 1
            i, o = usage_of(msg)
            tin, tout = tin + i, tout + o
            if msg.tool_calls:
                _compact_old_lookups(tool_history, scene_results)
                tool_history.append(msg)
                for call in msg.tool_calls:
                    name, args = call["name"], call["args"]
                    fn = lookup.get(name)
                    cached = False
                    if name == "search_scenes" and isinstance(args.get("query"), str):
                        result = search_scene_summaries(args["query"], exclude=known_scenes)
                    elif name == "get_scene" and isinstance(scene_name := args.get("name"), str):
                        if scene_name in examples_sent:
                            result = f"{scene_name} details are already in this conversation."
                        else:
                            include_fields = scene_name not in known_scenes
                            args_key = json.dumps([scene_name, include_fields])
                            key = (name, args_key)
                            cached = key in cache
                            if not cached:
                                cache[key] = scene_details(scene_name, include_fields=include_fields, link_diagram=True)
                            result = cache[key]
                            known_scenes.add(scene_name)
                            examples_sent.add(scene_name)
                            scene_results[call["id"]] = scene_name
                    elif fn:
                        # New drawings become searchable as soon as another chapter creates one.
                        version = iso_inventory_version() if name == "find_iso_objects" else None
                        key = (name, json.dumps([args, version], sort_keys=True))
                        cached = key in cache
                        if not cached:
                            cache[key] = str(fn.invoke(args))
                        result = cache[key]
                    else:
                        result = f"Unknown tool {name}"
                    log.info("tool %s(%s) -> %d chars%s", name, json.dumps(args)[:120], len(str(result)),
                             " (cached lookup)" if cached else "")
                    content = str(result) if name == "get_scene" else str(result)[:8000]
                    tool_history.append(ToolMessage(content, tool_call_id=call["id"]))
                continue
            reply = text_of(msg)
        attempts += 1
        last = reply
        spec, problem = await _check(last, code_demo, lecture=lecture, explainer=explainer, layout=layout)
        if spec:
            style = _lint(spec, selected, topic, code_demo=code_demo)
            if not style:
                return Plan(spec, attempts, "tools", calls, tin, tout, selected)
            if best.add(spec, attempts, style):
                return Plan(best.spec, best.attempt, "tools", calls, tin, tout, selected)
            problem = style
        log.warning("planner.retry mode=tools attempt=%d problem=%s", attempts, problem[:300])
        if attempts >= settings.PLANNER_MAX_ATTEMPTS:
            break
        repair = _repair_for(last, spec, problem, repair)
        retry_context = [AIMessage(last), HumanMessage(problem)]
    if best.spec:
        return Plan(best.spec, best.attempt, "tools", calls, tin, tout, selected)
    salvaged = None if lecture else await _salvage(last, problem, code_demo, explainer=explainer, layout=layout)
    if salvaged:
        return Plan(salvaged, attempts, "tools", calls, tin, tout, selected)
    raise PlanError(f"planner did not produce valid JSON (mode=tools, {attempts} attempts, {calls} calls)", problem)


async def plan_scenes(state: VideoState) -> dict:
    """Write and validate the visual content and narration together in each scene."""
    topic, hint, model = state["topic"], state["hint"], state["model"]
    selected, allowed = state["selected"], state["allowed"]
    code_demo, mode = state["code_demo"], state["mode"]
    layout = state.get("layout", "desktop")
    scene_shortlist = state.get("scene_shortlist", [])
    if code_demo is None and state.get("objective"):
        code_demo = ""  # A selected subject guide alone does not require source code.
    if "iso-diagrams" in selected and mode != "tools":
        hint += iso_design.planner_hint()
    hint += _visual_hint(topic, selected)
    if mode == "tools":
        plan = await _plan_tools(topic, hint, model, selected, code_demo=code_demo, layout=layout,
                                 scene_shortlist=scene_shortlist, lookup_cache=state.get("lookup_cache"),
                                 lookup_focus=state.get("lookup_focus", ""), prepicked=state.get("prepicked"))
    else:
        plan = await _plan_catalog(topic, hint, model, selected, code_demo=code_demo, allowed=allowed, layout=layout,
                                   scene_shortlist=scene_shortlist)
        plan.skills = selected
    calls, tin, tout = state["route_usage"]
    plan.llm_calls += calls
    plan.input_tokens += tin
    plan.output_tokens += tout
    return {"plan": plan}
