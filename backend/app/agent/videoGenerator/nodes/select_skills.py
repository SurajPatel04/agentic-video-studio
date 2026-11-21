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


async def _typesafe_pick(topic: str, available: dict) -> tuple[dict, int, int]:
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

    scene_candidates = catalog.search_scenes(topic, limit=5, exclude=catalog.TOOLS_PRELOADED_SCENES)
    scene_questions = {}
    for name, description, _ in scene_candidates:
        question_id = f"scene_{name}"
        scene_questions[question_id] = name
        questions[question_id] = Noul(
            instructions=f"Would this scene show an essential example or mechanism in the brief? "
                         f"{name}: {catalog.scene_summary(description)}",
        )

    response = await decide(topic, questions)
    pick = {key: answer.choice for key, answer in response.choices.items() if answer.choice != "none"}
    scores = response.nouls
    matches = sorted((name for name in subjects if name in scores and scores[name].noul > 0.5),
                     key=lambda name: scores[name].noul, reverse=True)
    pick["subjects"] = matches[:2]
    scene_matches = sorted((key for key in scene_questions if key in scores and scores[key].noul > 0.5),
                           key=lambda key: scores[key].noul, reverse=True)
    pick["scenes"] = [scene_questions[key] for key in scene_matches[:2]]
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


async def route(topic: str, requested: list[str] | None = None, *, long_video: bool = False,
                model: str | None = None) -> Route:
    """Guides for ``topic``. Names given by the caller are used as they are (validated)."""
    if requested is not None:
        selected = teaching_skills.select(topic, requested, long_video=long_video)
        return Route(selected, "requested", objective=objective_for(topic, selected))
    keyword = teaching_skills.select(topic, long_video=long_video)
    provider = settings.SKILL_ROUTER
    if provider == "keyword" or not topic.strip() or (
        provider == "typesafe" and not settings.TYPESAFE_API_KEY.get_secret_value().strip()
    ):
        return Route(keyword, "keyword", objective=objective_for(topic, keyword))
    available = teaching_skills.discover()
    try:
        if provider == "typesafe":
            pick, tin, tout = await _typesafe_pick(topic, available)
        else:
            llm = get_llm(settings.SKILL_ROUTER_MODEL or model or settings.PLANNER_MODEL or None)
            objectives = "\n".join(f"- {key}: {pattern['purpose']}" for key, pattern in OBJECTIVES.items())
            msg = await llm.ainvoke(PROMPT.format(guides=_menu(available), objectives=objectives) + f"\n\nTopic: {topic}")
            tin, tout = usage_of(msg)
            pick = _parse(text_of(msg))
    except Exception as exc:  # never block planning on the router
        log.warning("skill router provider=%s failed (%s), using keyword match", provider, type(exc).__name__)
        return Route(keyword, f"keyword ({provider} failed)", objective=objective_for(topic, keyword))
    chosen = merge(keyword, pick, available, long_video=long_video)
    log.info("skills provider=%s topic=%r keyword=%s pick=%s -> %s", provider, topic[:80], keyword, pick, chosen)
    return Route(chosen, provider, 1, tin, tout, pick, objective_for(topic, chosen, pick.get("objective")),
                 scene_shortlist=pick["scenes"] if provider == "typesafe" else [])


async def select_skills(state: VideoState) -> dict:
    requested = state["skills"]
    chosen = await route(state["topic"], requested, model=state["model"])
    objective = state.get("objective") or chosen.objective
    return {"objective": objective, "hint": state["hint"] + pattern_hint(objective),
            "selected": chosen.skills, "allowed": chosen.skills if requested is not None else None,
            "scene_shortlist": state.get("scene_shortlist") or chosen.scene_shortlist,
            "route_usage": (chosen.calls, chosen.input_tokens, chosen.output_tokens)}
