"""Choose the teaching guides (skills) for a topic.

Keyword matching (``skills.select``) only finds a guide when the topic contains one of its tags, so
"HTTPS", "React" or "Instagram feed" find nothing. With ``SKILL_ROUTER=llm`` (default) one small LLM call
reads the guides' descriptions and picks them; the keyword matches are merged in and used alone when
the call fails. ``SKILL_ROUTER=keyword`` keeps the old behaviour (no extra call).

Slots are the same as ``skills.select``: every foundation guide, at most one format, one style (else
PLANNER_DEFAULT_STYLE) and at most two subjects.
"""

import json
import logging
import re
from dataclasses import dataclass, field

from app.agent.videoGenerator import skills as teaching_skills
from ..prompts.catalog import PROMPT
from ..state.video import VideoState
from app.config import settings
from app.utils.llm import get_llm, text_of, usage_of

log = logging.getLogger(__name__)

@dataclass
class Route:
    skills: list[str]
    source: str  # "requested" | "keyword" | "llm" | "keyword (llm failed)"
    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    llm_pick: dict = field(default_factory=dict)


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


def merge(keyword: list[str], pick: dict, available: dict, *, long_video: bool = False) -> list[str]:
    """LLM choice first, keyword matches fill the free slots; categories and limits are enforced here."""
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
        return Route(teaching_skills.select(topic, requested, long_video=long_video), "requested")
    keyword = teaching_skills.select(topic, long_video=long_video)
    if settings.SKILL_ROUTER != "llm" or not topic.strip():
        return Route(keyword, "keyword")
    available = teaching_skills.discover()
    try:
        llm = get_llm(settings.SKILL_ROUTER_MODEL or model or settings.PLANNER_MODEL or None)
        msg = await llm.ainvoke(PROMPT.format(guides=_menu(available)) + f"\n\nTopic: {topic}")
        tin, tout = usage_of(msg)
        pick = _parse(text_of(msg))
    except Exception as exc:  # never block planning on the router
        log.warning("skill router failed, using keyword match: %s", exc)
        return Route(keyword, "keyword (llm failed)")
    chosen = merge(keyword, pick, available, long_video=long_video)
    log.info("skills topic=%r keyword=%s llm=%s -> %s", topic[:80], keyword, pick, chosen)
    return Route(chosen, "llm", 1, tin, tout, pick)


async def select_skills(state: VideoState) -> dict:
    requested = state["skills"]
    chosen = await route(state["topic"], requested, model=state["model"])
    return {"selected": chosen.skills, "allowed": chosen.skills if requested is not None else None,
            "route_usage": (chosen.calls, chosen.input_tokens, chosen.output_tokens)}
