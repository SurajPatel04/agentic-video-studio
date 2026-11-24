"""Plan and validate the visual composition using catalog or tool mode.

The draft -> validate -> repair loop is a LangGraph subgraph (``add_plan_loop``): each LLM call, lookup,
check and retry decision is its own node or edge."""
import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Literal, Sequence

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, StateGraph
from typing_extensions import TypedDict

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


@dataclass(eq=False)
class PlanSession:
    """One planning run's working memory, shared by the plan loop's graph nodes: the LLM clients, the
    conversation, lookup caches and the best plan so far. It holds live clients, so it is not checkpointed."""
    mode: Literal["catalog", "tools"]
    topic: str
    selected: list[str]
    code_demo: str | None
    layout: str
    llm: Any  # full plans (tools mode: with the lookup tools bound)
    repair_llm: Any  # scoped field repairs
    base: list[Any]  # system prompt, brief (and reused lookups)
    tool_history: list[Any] = field(default_factory=list)  # tools mode: lookup calls and their results
    retry: list[Any] = field(default_factory=list)  # the last rejected reply and why it was rejected
    cache: LookupCache = field(default_factory=dict)
    known_scenes: set[str] = field(default_factory=set)
    examples_sent: set[str] = field(default_factory=set)
    scene_results: dict[str, str] = field(default_factory=dict)  # get_scene call id -> scene, not yet compacted
    pending: Any = None  # tools mode: the reply whose lookups the lookup node runs
    best: _Best = field(default_factory=_Best)  # valid plans with style problems: the one with the fewest is kept
    repair: Repair | None = None  # the next call is this scoped repair instead of a whole new plan
    last: str | None = None  # the latest full reply, for a last-resort salvage
    problem: str = ""
    tin: int = 0
    tout: int = 0

    @property
    def lecture(self) -> bool:
        return "teach-lecture" in self.selected

    @property
    def explainer(self) -> bool:
        return "make-explainer" in self.selected

    def conversation(self) -> list[Any]:
        return [*self.base, *self.tool_history, *self.retry]

    def count(self, usage: tuple[int, int]) -> None:
        self.tin, self.tout = self.tin + usage[0], self.tout + usage[1]

    def plan(self, spec: dict[str, Any], attempts: int, calls: int) -> Plan:
        return Plan(spec, attempts, self.mode, calls, self.tin, self.tout, list(self.selected))


def _catalog_session(topic: str, hint: str, model: str | None, skills: list[str] | tuple[str, ...] = (),
                     *, code_demo: str | None = None, allowed: list[str] | None = None,
                     layout: str = "desktop", scene_shortlist: Sequence[str] = ()) -> PlanSession:
    skills = list(skills)
    guides = teaching_skills.guidance(skills)
    available = teaching_skills.discover()
    preferred = [*scene_shortlist, *(scene for name in skills for scene in available[name].metadata.scenes)]
    overlays = dict.fromkeys(overlay for name in skills for overlay in available[name].metadata.overlays)
    index = "\nAvailable teaching guides:\n" + teaching_skills.index(allowed=allowed) if allowed != [] else ""
    system = (_rules() + index + guides + CATALOG_OUTPUT + catalog.catalog_text(topic, known=guides, preferred=preferred)
              + "\n" + "\n".join(catalog.overlay_text(name) for name in overlays))
    llm = get_llm(model or settings.PLANNER_MODEL or None)
    return PlanSession("catalog", topic, skills, code_demo, layout, llm, llm,
                       [SystemMessage(system), HumanMessage(f"Topic: {topic}\n\n{hint.strip()}")])


async def _plan_catalog(topic: str, hint: str, model: str | None, skills: list[str] | tuple[str, ...] = (),
                        *, code_demo: str | None = None, allowed: list[str] | None = None,
                        layout: str = "desktop", scene_shortlist: Sequence[str] = ()) -> Plan:
    """One whole-catalog plan, run through the plan loop graph."""
    return await run_plan_loop(_catalog_session(topic, hint, model, skills, code_demo=code_demo, allowed=allowed,
                                                layout=layout, scene_shortlist=scene_shortlist))


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


def _tools_session(topic: str, hint: str, model: str | None, selected: list[str],
                   *, code_demo: str | None = None, layout: str = "desktop",
                   scene_shortlist: Sequence[str] = (), lookup_cache: LookupCache | None = None,
                   lookup_focus: str = "", prepicked: dict | None = None) -> PlanSession:
    prepicked = prepicked or {}
    preloaded = _preloaded_scenes(code_demo, selected, scene_shortlist, diagram=prepicked.get("diagram", True))
    guides = teaching_skills.guidance(selected, asset_lookup=True)
    system = _tools_system(selected, guides, preloaded, prepicked)
    initial: list[SystemMessage | HumanMessage | AIMessage] = [SystemMessage(system)]
    cache = lookup_cache if lookup_cache is not None else {}
    known_scenes = set(preloaded)
    reference, reused_scenes = chapter_lookup_reference(cache, lookup_focus or topic, known_scenes)
    if reference:
        initial.append(AIMessage("Reference lookups from earlier planning. Use the fields or assets below if they fit "
                                 "the current chapter. Look up any missing detail.\n\n" + reference))
        known_scenes.update(reused_scenes)
    initial.append(HumanMessage(f"Topic: {topic}\n\n{hint.strip()}"))
    repair_llm = get_tool_llm(model or settings.PLANNER_MODEL or None)
    llm = repair_llm.bind_tools(list(LOOKUP_TOOLS.values()))
    return PlanSession("tools", topic, list(selected), code_demo, layout, llm, repair_llm, initial,
                       cache=cache, known_scenes=known_scenes)


async def _plan_tools(topic: str, hint: str, model: str | None, selected: list[str],
                      *, code_demo: str | None = None, layout: str = "desktop",
                      scene_shortlist: Sequence[str] = (), lookup_cache: LookupCache | None = None,
                      lookup_focus: str = "", prepicked: dict | None = None) -> Plan:
    """One plan with lookup tools, run through the plan loop graph."""
    return await run_plan_loop(_tools_session(topic, hint, model, selected, code_demo=code_demo, layout=layout,
                                              scene_shortlist=scene_shortlist, lookup_cache=lookup_cache,
                                              lookup_focus=lookup_focus, prepicked=prepicked))


# --------------------------------------------------------------------------- plan loop (graph nodes)
#
#   draft ──(lookups)──> lookup ──> draft | repair | give_up
#     └──(reply)──> validate ──(valid)──> done
#                      └──(rejected)──> repair | draft (whole new plan) | give_up (attempts or steps used up)
#   repair ──(edit applied)──> validate      repair ──(edit rejected)──> draft | give_up
#
# Counters live in the graph state (attempts = full or repaired plans checked, steps = LLM calls), so every
# routing decision is an edge. The conversation and caches live in the PlanSession.


class PlanLoopState(TypedDict, total=False):
    session: PlanSession
    attempts: int
    steps: int
    outcome: Literal["lookup", "check", "retry", "done"]
    reply: str | None
    plan: Plan


async def draft(state: PlanLoopState) -> dict:
    """A whole plan from the conversation (tools mode: or lookups to run first)."""
    s = state["session"]
    msg = await planner_response(s.llm, s.conversation(), tools=s.mode == "tools", lecture=s.lecture, explainer=s.explainer)
    s.count(usage_of(msg))
    steps = state["steps"] + 1
    if getattr(msg, "tool_calls", None):
        s.pending = msg
        return {"steps": steps, "outcome": "lookup"}
    reply = text_of(msg)
    if reply is None:
        return {"steps": steps, "attempts": state["attempts"] + 1, "outcome": "retry"}
    return {"steps": steps, "reply": reply, "outcome": "check"}


async def lookup(state: PlanLoopState) -> dict:
    """Run the lookups the planner asked for and add their results to the conversation."""
    s = state["session"]
    msg, s.pending = s.pending, None
    _compact_old_lookups(s.tool_history, s.scene_results)
    s.tool_history.append(msg)
    for call in msg.tool_calls:
        name, args = call["name"], call["args"]
        fn = LOOKUP_TOOLS.get(name)
        cached = False
        if name == "search_scenes" and isinstance(args.get("query"), str):
            result = search_scene_summaries(args["query"], exclude=s.known_scenes)
        elif name == "get_scene" and isinstance(scene_name := args.get("name"), str):
            if scene_name in s.examples_sent:
                result = f"{scene_name} details are already in this conversation."
            else:
                include_fields = scene_name not in s.known_scenes
                key = (name, json.dumps([scene_name, include_fields]))
                cached = key in s.cache
                if not cached:
                    s.cache[key] = scene_details(scene_name, include_fields=include_fields, link_diagram=True)
                result = s.cache[key]
                s.known_scenes.add(scene_name)
                s.examples_sent.add(scene_name)
                s.scene_results[call["id"]] = scene_name
        elif fn:
            # New drawings become searchable as soon as another chapter creates one.
            version = iso_inventory_version() if name == "find_iso_objects" else None
            key = (name, json.dumps([args, version], sort_keys=True))
            cached = key in s.cache
            if not cached:
                s.cache[key] = str(fn.invoke(args))
            result = s.cache[key]
        else:
            result = f"Unknown tool {name}"
        log.info("tool %s(%s) -> %d chars%s", name, json.dumps(args)[:120], len(str(result)),
                 " (cached lookup)" if cached else "")
        content = str(result) if name == "get_scene" else str(result)[:8000]
        s.tool_history.append(ToolMessage(content, tool_call_id=call["id"]))
    return {}


async def repair(state: PlanLoopState) -> dict:
    """Ask only for the flagged fields (or scenes) instead of a whole new plan."""
    s = state["session"]
    reply, usage = await _edit(s.repair, s.repair_llm, use_tool=s.mode == "tools")
    s.count(usage)
    steps = state["steps"] + 1
    if reply is None:  # the edit did not apply: the next try is a whole new plan
        s.repair = None
        return {"steps": steps, "attempts": state["attempts"] + 1, "outcome": "retry"}
    return {"steps": steps, "reply": reply, "outcome": "check"}


async def validate(state: PlanLoopState) -> dict:
    """Check the reply against the scene contracts, then the style rules; on a problem, prepare the retry."""
    s, reply = state["session"], state["reply"]
    attempts = state["attempts"] + 1
    s.last = reply
    spec, problem = await _check(reply, s.code_demo, lecture=s.lecture, explainer=s.explainer, layout=s.layout)
    if spec:
        style = _lint(spec, s.selected, s.topic, code_demo=s.code_demo)
        if not style:
            return {"attempts": attempts, "outcome": "done", "plan": s.plan(spec, attempts, state["steps"])}
        if s.best.add(spec, attempts, style):  # no style retries left: the plan with the fewest problems
            return {"attempts": attempts, "outcome": "done", "plan": s.plan(s.best.spec, s.best.attempt, state["steps"])}
        problem = style
    log.warning("planner.retry mode=%s attempt=%d problem=%s", s.mode, attempts, problem[:300])
    s.problem = problem
    if attempts < settings.PLANNER_MAX_ATTEMPTS:
        s.repair = _repair_for(reply, spec, problem, s.repair)
        s.retry = [AIMessage(reply), HumanMessage(problem)]
    return {"attempts": attempts, "outcome": "retry"}


async def give_up(state: PlanLoopState) -> dict:
    """Attempts or steps used up: the best valid plan, else salvage the few broken scenes, else fail."""
    s, attempts, steps = state["session"], state["attempts"], state["steps"]
    if s.best.spec:
        return {"plan": s.plan(s.best.spec, s.best.attempt, steps)}
    salvaged = None if s.lecture else await _salvage(s.last, s.problem, s.code_demo, explainer=s.explainer, layout=s.layout)
    if salvaged:
        return {"plan": s.plan(salvaged, attempts, steps)}
    if s.mode == "catalog":
        raise PlanError(f"planner gave invalid JSON {settings.PLANNER_MAX_ATTEMPTS} times", s.problem)
    raise PlanError(f"planner did not produce valid JSON (mode=tools, {attempts} attempts, {steps} calls)", s.problem)


def _next_call(state: PlanLoopState) -> str:
    if state["steps"] >= settings.PLANNER_MAX_STEPS:
        return "give_up"
    return "repair" if state["session"].repair else "draft"


def _after_retry(state: PlanLoopState) -> str:
    return "give_up" if state["attempts"] >= settings.PLANNER_MAX_ATTEMPTS else _next_call(state)


def _after_draft(state: PlanLoopState) -> str:
    return {"lookup": "lookup", "check": "validate"}.get(state["outcome"]) or _after_retry(state)


def _after_repair(state: PlanLoopState) -> str:
    return "validate" if state["outcome"] == "check" else _after_retry(state)


def _after_validate(state: PlanLoopState) -> str:
    return "done" if state["outcome"] == "done" else _after_retry(state)


def add_plan_loop(graph: StateGraph, done: str) -> str:
    """Add the plan loop's nodes and edges to ``graph``; a finished plan goes to ``done``. Returns the entry node."""
    for name, node in (("draft", draft), ("lookup", lookup), ("repair", repair), ("validate", validate), ("give_up", give_up)):
        graph.add_node(name, node)
    calls = {"draft": "draft", "repair": "repair", "give_up": "give_up"}
    graph.add_conditional_edges("draft", _after_draft, {**calls, "lookup": "lookup", "validate": "validate"})
    graph.add_conditional_edges("lookup", _next_call, calls)
    graph.add_conditional_edges("repair", _after_repair, {**calls, "validate": "validate"})
    graph.add_conditional_edges("validate", _after_validate, {**calls, "done": done})
    graph.add_edge("give_up", done)
    return "draft"


def recursion_limit() -> int:
    """LangGraph node runs one plan may take: up to two per LLM call (draft + lookup, repair + validate)."""
    return 2 * settings.PLANNER_MAX_STEPS + 2 * settings.PLANNER_MAX_ATTEMPTS + 10


def _build_plan_loop():
    graph = StateGraph(PlanLoopState)
    graph.add_edge(START, add_plan_loop(graph, END))
    return graph.compile(name="plan_loop")


PLAN_LOOP = _build_plan_loop()


async def run_plan_loop(session: PlanSession) -> Plan:
    """Run the plan loop on its own (one plan, no skill routing or assets)."""
    result = await PLAN_LOOP.ainvoke({"session": session, "attempts": 0, "steps": 0},
                                     config={"recursion_limit": recursion_limit()})
    return result["plan"]


# --------------------------------------------------------------------------- video graph nodes


async def start_planning(state: VideoState) -> dict:
    """Build the planner's prompt and session for the plan loop."""
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
        session = _tools_session(topic, hint, model, selected, code_demo=code_demo, layout=layout,
                                 scene_shortlist=scene_shortlist, lookup_cache=state.get("lookup_cache"),
                                 lookup_focus=state.get("lookup_focus", ""), prepicked=state.get("prepicked"))
    else:
        session = _catalog_session(topic, hint, model, selected, code_demo=code_demo, allowed=allowed, layout=layout,
                                   scene_shortlist=scene_shortlist)
    return {"session": session, "attempts": 0, "steps": 0}


async def finish_planning(state: VideoState) -> dict:
    """Add the skill router's LLM usage to the finished plan."""
    plan = state["plan"]
    calls, tin, tout = state["route_usage"]
    plan.llm_calls += calls
    plan.input_tokens += tin
    plan.output_tokens += tout
    return {"plan": plan}
