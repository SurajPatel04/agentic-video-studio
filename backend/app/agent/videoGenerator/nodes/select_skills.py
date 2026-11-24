"""Choose the teaching guides (skills) for a topic.

TypeSafe classifies the brief against the guide catalog. Keyword matches fill free slots and
serve as a fallback. The old LLM router and keyword-only routing are also available.

Slots are the same as ``skills.select``: every foundation guide, at most one format, one style (else
PLANNER_DEFAULT_STYLE) and at most two subjects.
"""

import json
import logging
import re
from dataclasses import dataclass, field

from langchain_core.decisions import Choice, Noul, Question
from langchain_core.messages import HumanMessage, SystemMessage

from app.agent.videoGenerator import skills as teaching_skills
from ..prompts.catalog import PROMPT
from ..state.video import VideoState
from ..teaching_patterns import OBJECTIVES, objective_for, pattern_hint
from ..tools import catalog
from app.config import settings
from app.utils.llm import get_llm, text_of, usage_of
from app.utils.typesafe import decide

log = logging.getLogger(__name__)

@dataclass
class Route:
    skills: list[str]
    source: str
    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    llm_pick: dict = field(default_factory=dict)
    objective: str = ""
    scene_shortlist: list[str] = field(default_factory=list)
    # TypeSafe pre-picks for the planner prompt: {"iso": [rows], "overlays": [names], "diagram": bool}
    prepicked: dict = field(default_factory=dict)


DIAGRAM_DROP_BELOW = 0.25  # "needs a diagram" score under this: IsoScene's fields are not preloaded

# What each overlay is for (TypeSafe picks one; names alone are too vague to classify).
OVERLAY_USES = {
    "flow": "moving dots along a path between two points (data or money in transit)",
    "waves": "radio or wireless waves spreading from a point",
    "callout": "a labelled callout box pointing at one part of the picture",
    "check": "a big check mark confirming something worked",
    "cross": "a big cross marking something wrong or failed",
    "badge": "a small status badge or label stuck on the picture",
    "arrow": "an arrow pointing at something",
    "pointer": "a mouse pointer clicking on a screen",
    "highlight": "a highlight box around an area",
    "tooltip": "a tooltip popping up over an element",
    "zoom": "a magnified inset of a small detail",
    "field": "a form field being typed into",
    "sound": "a sound effect cue",
    "progress": "a progress bar filling up",
    "lock": "a padlock showing something is secured or encrypted",
    "terminal": "a command-line terminal running commands",
    "notification": "a phone or app notification popping in",
    "toggle": "a settings switch turning on or off",
    "chat": "chat messages appearing in a conversation",
}


def _menu(available: dict) -> str:
    rows = []
    for name, s in available.items():
        m = s.metadata
        if m.category == "foundation" or m.long_video:
            continue
        tags = ", ".join(m.tags[:10])
        rows.append(f"- {name} [{m.category}]: {s.description}" + (f" (e.g. {tags})" if tags else ""))
    return "\n".join(rows)


def _parse(reply: str) -> dict:
    match = re.search(r"\{.*\}", reply, re.S)
    data = json.loads(match.group(0) if match else reply)
    return data if isinstance(data, dict) else {}


def _scene_candidates(topic: str, keyword: list[str], available: dict) -> list[tuple[str, str]]:
    """Scenes to ask TypeSafe about: the best search matches for the topic, then the keyword-matched guides'
    own scenes (e.g. teach-dsa -> BubbleSortScene) to fill the free places."""
    limit = settings.TYPESAFE_SCENE_CANDIDATES
    if not limit:
        return []
    entries = catalog._load()["scenes"]
    skip = set(catalog.TOOLS_PRELOADED_SCENES) | {"IsoScene"}  # IsoScene has its own diagram question
    names = [name for name, _, score in catalog.search_scenes(topic, limit=limit, exclude=skip) if score >= 3]
    names += [s for g in keyword if g in available for s in available[g].metadata.scenes]
    names += [name for name, _, _ in catalog.search_scenes(topic, limit=limit, exclude=skip)]
    names = [n for n in dict.fromkeys(names) if n in entries and n not in skip][:limit]
    return [(n, entries[n]["description"]) for n in names]


FILLER = set("""a an the and or of to in on for with from by about into through how what why when where which who
is are was were be been do does did can could should would will it its this that these those your you my our their
explain explained explaining teach learn learning lesson video show make create work works working using use""".split())


def _iso_candidates(topic: str) -> list[str]:
    """Iso objects and icons for the topic's content words (filler words like "a" would match letter icons)."""
    from ..tools.scene_lookup import iso_rows

    if not settings.TYPESAFE_ISO_CANDIDATES:
        return []
    query = " ".join(w for w in re.findall(r"[A-Za-z0-9.+#-]+", topic) if len(w) > 1 and w.lower() not in FILLER)
    return iso_rows(query)[: settings.TYPESAFE_ISO_CANDIDATES] if query else []


def _yes(scores: dict, ids: dict[str, str], limit: int) -> list[str]:
    """Values of ``ids`` whose yes/no score passes TYPESAFE_THRESHOLD, best first, at most ``limit``."""
    passed = [k for k in ids if k in scores and scores[k].noul > settings.TYPESAFE_THRESHOLD]
    return [ids[k] for k in sorted(passed, key=lambda k: scores[k].noul, reverse=True)[:limit]]


async def _typesafe_pick(topic: str, available: dict, keyword: list[str] | None = None) -> tuple[dict, int, int]:
    instructions = {
        "format": "Which format is requested? Choose make-explainer for concept explanations and tool walkthroughs unless the brief requests a lecture or another format.",
        "style": "Which visual style fits the requested video?",
    }
    questions: dict[str, Question] = {
        "objective": Choice(
            instructions="What should the viewer be able to do after this lesson? Distinguish explaining a concept from operating a named tool.",
            criteria={name: pattern["purpose"] for name, pattern in OBJECTIVES.items()},
        ),
    }
    subjects = []
    candidates = {name: guide for name, guide in available.items() if not guide.metadata.long_video}
    for category, instruction in instructions.items():
        options = {name: guide.description for name, guide in candidates.items()
                   if guide.metadata.category == category}
        if options:
            questions[category] = Choice(
                instructions=instruction,
                criteria={**options, "none": "No listed guide fits the brief."},
            )
    for name, guide in candidates.items():
        if guide.metadata.category == "subject":
            subjects.append(name)
            questions[name] = Noul(
                instructions=f"Is this a main subject of the brief? A passing mention does not count. Subject: {guide.description}",
            )

    scene_questions = {}
    for name, description in _scene_candidates(topic, keyword or [], available):
        question_id = f"scene_{name}"
        scene_questions[question_id] = name
        questions[question_id] = Noul(
            instructions=f"Would this scene show an essential example or mechanism in the brief? "
                         f"{name}: {catalog.scene_summary(description)}",
        )
    # Iso objects and icons the planner would otherwise look up with find_iso_objects.
    iso_questions = {}
    for i, row in enumerate(_iso_candidates(topic)):
        iso_questions[f"iso_{i}"] = row
        questions[f"iso_{i}"] = Noul(
            instructions=f"Would a diagram for this brief show this object? A passing word match does not count. "
                         f"Object: {row.removeprefix('- ')}",
        )
    if settings.TYPESAFE_OVERLAYS:
        questions["overlay"] = Choice(
            instructions="Which on-screen overlay would most help explain the brief? Choose none unless one clearly fits.",
            criteria={**{name: use for name, use in OVERLAY_USES.items() if name in catalog._load()["overlays"]},
                      "none": "No overlay is needed."},
        )
    if settings.TYPESAFE_DIAGRAM_CHECK:
        questions["diagram"] = Noul(
            instructions="Does explaining the brief need a diagram of things or people interacting (systems, flows, "
                         "requests, processes between parts)? Pure text, code, maths or a screen walkthrough does not.",
        )

    response = await decide(topic, questions)
    pick = {key: answer.choice for key, answer in response.choices.items()
            if answer.choice != "none" and key != "overlay"}
    scores = response.nouls
    pick["subjects"] = _yes(scores, {name: name for name in subjects}, 2)
    pick["scenes"] = _yes(scores, scene_questions, settings.TYPESAFE_SCENE_PICKS)
    pick["iso"] = _yes(scores, iso_questions, settings.TYPESAFE_ISO_PICKS)
    overlay = response.choices.get("overlay")
    pick["overlays"] = [overlay.choice] if overlay and overlay.choice in OVERLAY_USES else []
    if "diagram" in scores:
        pick["diagram"] = scores["diagram"].noul >= DIAGRAM_DROP_BELOW  # drop IsoScene only when clearly not needed
    usage = response.usage or {}
    return pick, usage.get("input_tokens", 0), usage.get("output_tokens", 0)


def merge(keyword: list[str], pick: dict, available: dict, *, long_video: bool = False) -> list[str]:
    """Router choices first, then keyword matches, with category and slot limits."""
    cat = {n: s.metadata.category for n, s in available.items() if not s.metadata.long_video}
    def ok(name: object, category: str) -> bool:
        return isinstance(name, str) and cat.get(name) == category
    chosen = [n for n in available if cat.get(n) == "foundation"]
    fmt = [pick.get("format")] if ok(pick.get("format"), "format") else []
    chosen += (fmt or [n for n in keyword if cat.get(n) == "format"])[:1]
    styles = [pick.get("style")] if ok(pick.get("style"), "style") else []
    styles += [n for n in keyword if cat.get(n) == "style"]
    chosen += styles[:1]
    subjects = [n for n in pick.get("subjects") or [] if ok(n, "subject")]
    subjects += [n for n in keyword if cat.get(n) == "subject" and n not in subjects]
    chosen += list(dict.fromkeys(subjects))[:2]
    if long_video:
        chosen += [n for n, s in available.items() if s.metadata.long_video]
    return list(dict.fromkeys(chosen))


def force_format(chosen: list[str], name: str) -> list[str]:
    """``chosen`` with ``name`` as its one format guide (the router's own format pick is dropped)."""
    available = teaching_skills.discover()
    if name not in available:
        raise ValueError(f"Unknown or inapplicable skills: {name}")
    others = [n for n in chosen if n != name and not (n in available and available[n].metadata.category == "format")]
    foundation = [n for n in others if n in available and available[n].metadata.category == "foundation"]
    return list(dict.fromkeys(foundation + [name] + others))


async def route(topic: str, requested: list[str] | None = None, *, long_video: bool = False,
                model: str | None = None, fmt: str = "") -> Route:
    """Guides for ``topic``. Names given by the caller are used as they are (validated).
    ``fmt``: this format guide replaces whatever format the router picks (ads: "make-ad")."""
    chosen = await _route(topic, requested, long_video=long_video, model=model)
    if fmt:
        chosen.skills = force_format(chosen.skills, fmt)
        chosen.objective = objective_for(topic, chosen.skills, chosen.llm_pick.get("objective"))
    return chosen


async def _route(topic: str, requested: list[str] | None = None, *, long_video: bool = False,
                 model: str | None = None) -> Route:
    if requested is not None:
        selected = teaching_skills.select(topic, requested, long_video=long_video)
        return Route(selected, "requested", objective=objective_for(topic, selected))
    keyword = teaching_skills.select(topic, long_video=long_video)
    provider = settings.SKILL_ROUTER
    if provider == "keyword" or not topic.strip() or (
        provider == "typesafe" and not settings.TYPESAFE_API_KEY.get_secret_value().strip()
    ):
        return Route(keyword, "keyword", objective=objective_for(topic, keyword))
    # on-request guides (make-ad) are never offered to the router; the request adds them (route's fmt)
    available = {n: s for n, s in teaching_skills.discover().items() if not s.metadata.on_request}
    try:
        if provider == "typesafe":
            pick, tin, tout = await _typesafe_pick(topic, available, keyword)
        else:
            llm = get_llm(settings.SKILL_ROUTER_MODEL or model or settings.PLANNER_MODEL or None)
            objectives = "\n".join(f"- {key}: {pattern['purpose']}" for key, pattern in OBJECTIVES.items())
            msg = await llm.ainvoke([SystemMessage(PROMPT.format(guides=_menu(available), objectives=objectives)),
                                     HumanMessage(f"Topic: {topic}")])
            tin, tout = usage_of(msg)
            pick = _parse(text_of(msg))
    except Exception as exc:  # never block planning on the router
        log.warning("skill router provider=%s failed (%s), using keyword match", provider, type(exc).__name__)
        return Route(keyword, f"keyword ({provider} failed)", objective=objective_for(topic, keyword))
    chosen = merge(keyword, pick, available, long_video=long_video)
    log.info("skills provider=%s topic=%r keyword=%s pick=%s -> %s", provider, topic[:80], keyword, pick, chosen)
    prepicked = {}
    if provider == "typesafe":
        prepicked = {"overlays": pick.get("overlays", []), "iso": pick.get("iso", [])}
        if "diagram" in pick:
            prepicked["diagram"] = pick["diagram"]
            if not pick["diagram"]:
                prepicked["iso"] = []
    return Route(chosen, provider, 1, tin, tout, pick, objective_for(topic, chosen, pick.get("objective")),
                 scene_shortlist=pick["scenes"] if provider == "typesafe" else [], prepicked=prepicked)


async def select_skills(state: VideoState) -> dict:
    requested = state["skills"]
    chosen = await route(state["topic"], requested, model=state["model"], fmt=state.get("force_format", ""))
    objective = state.get("objective") or chosen.objective
    return {"objective": objective, "hint": state["hint"] + pattern_hint(objective),
            "selected": chosen.skills, "allowed": chosen.skills if requested is not None else None,
            "scene_shortlist": state.get("scene_shortlist") or chosen.scene_shortlist,
            "prepicked": state.get("prepicked") or chosen.prepicked,
            "route_usage": (chosen.calls, chosen.input_tokens, chosen.output_tokens)}
