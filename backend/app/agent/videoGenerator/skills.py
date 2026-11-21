"""Project teaching playbooks. Metadata is discovered eagerly; bodies load on demand."""
import logging
import re
from pathlib import Path
from typing import Literal

import yaml
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from app.config import PROJECT_ROOT, settings

ROOT = PROJECT_ROOT / "skills"
MAX_SKILL_BODY_CHARS = 8000
log = logging.getLogger(__name__)
Role = Literal["planner", "component"]


class VisualRule(BaseModel):
    """When the topic names one of ``when``, the plan must contain at least one of ``scenes``."""
    when: list[str] = Field(min_length=1)
    scenes: list[str] = Field(min_length=1)


class Metadata(BaseModel):
    category: Literal["foundation", "format", "style", "subject"] = "subject"
    roles: list[Role] = Field(default_factory=lambda: ["planner"])
    tags: list[str] = Field(default_factory=list)
    scenes: list[str] = Field(default_factory=list)
    overlays: list[str] = Field(default_factory=list)
    visuals: list[VisualRule] = Field(default_factory=list)
    long_video: bool = False
    # Never picked from the topic's words; used only when the request asks for it (make-ad: "ad": true,
    # or the guide named in "skills").
    on_request: bool = False


class Skill(BaseModel):
    name: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=63)
    description: str = Field(min_length=1, max_length=500)
    metadata: Metadata = Field(default_factory=Metadata)


def discover(role: Role = "planner") -> dict[str, Skill]:
    result = {}
    for path in sorted(ROOT.glob("*/SKILL.md")):
        try:
            if not path.resolve().is_relative_to(ROOT.resolve()):
                continue
            with path.open() as stream:
                if stream.readline().strip() != "---":
                    raise ValueError("missing YAML frontmatter")
                header = []
                for line in stream:
                    if line.strip() == "---":
                        break
                    header.append(line)
                    if sum(map(len, header)) > 16000:
                        raise ValueError("metadata too large")
                else:
                    raise ValueError("unclosed frontmatter")
            skill = Skill.model_validate(yaml.safe_load("".join(header)))
            if skill.name != path.parent.name:
                raise ValueError("name must match directory")
            if role in skill.metadata.roles:
                result[skill.name] = skill
        except (ValueError, OSError, yaml.YAMLError) as exc:
            log.warning("Skipping skill %s: %s", path, exc)
    return result


def load(name: str, role: Role = "planner") -> str:
    if name not in discover(role):
        raise ValueError(f"Unknown {role} skill: {name}")
    path = ROOT / name / "SKILL.md"
    if not path.resolve().is_relative_to(ROOT.resolve()):
        raise ValueError("Skill path outside skills directory")
    lines = path.read_text().splitlines(keepends=True)
    end = next(i for i, line in enumerate(lines[1:], 1) if line.strip() == "---")
    body = "".join(lines[end + 1:]).strip()
    if not body or len(body) > MAX_SKILL_BODY_CHARS:
        raise ValueError(f"Skill {name} must have a nonempty body of up to {MAX_SKILL_BODY_CHARS} characters")
    return f"### Teaching guide: {name}\n{body}"


def _words(text: str) -> str:
    return " " + " ".join(re.findall(r"[a-z0-9]+", text.lower())) + " "


def _mentions(words: str, phrase: str) -> bool:
    """``phrase`` appears in the topic as whole words ("sort" matches "sort a list", not "resort")."""
    key = " ".join(re.findall(r"[a-z0-9]+", phrase.lower()))
    return bool(key) and re.search(r"(?<!\w)" + re.escape(key) + r"(?!\w)", words) is not None


def required_visuals(topic: str, names: list[str], known: set[str] | None = None) -> list[tuple[str, list[str]]]:
    """Scenes the topic must show, from the selected guides' ``visuals`` rules: [(matched phrase, scenes)].
    ``known`` drops scenes the library does not have (a rule with none left is skipped)."""
    available, words, out = discover(), _words(topic), []
    for name in names:
        for rule in available[name].metadata.visuals if name in available else []:
            hit = next((w for w in rule.when if _mentions(words, w)), None)
            scenes = [s for s in rule.scenes if known is None or s in known]
            if hit and scenes and all(set(scenes) != set(s) for _, s in out):
                out.append((hit, scenes))
    return out


def select(topic: str, requested: list[str] | None = None, *, role: Role = "planner", long_video: bool = False) -> list[str]:
    available = discover(role)
    if requested is not None:
        unknown = set(requested) - available.keys()
        if unknown:
            raise ValueError("Unknown or inapplicable skills: " + ", ".join(sorted(unknown)))
        return list(dict.fromkeys(requested))
    words = _words(topic)
    ranked = []
    chosen = [name for name, skill in available.items() if skill.metadata.category == "foundation"]
    for name, skill in available.items():
        if skill.metadata.long_video or skill.metadata.on_request or skill.metadata.category == "foundation":
            continue
        score = sum(_mentions(words, tag) for tag in skill.metadata.tags)
        if score:
            ranked.append((score, name))
    ranked.sort(key=lambda item: (-item[0], item[1]))
    # Format, style and subject guides have separate slots: technical words cannot crowd out pedagogy.
    chosen += [name for _, name in ranked if available[name].metadata.category == "format"][:1]
    # one visual style: the best match, else the house style (PLANNER_DEFAULT_STYLE, "" = none)
    styles = [name for _, name in ranked if available[name].metadata.category == "style"]
    default_style = settings.PLANNER_DEFAULT_STYLE
    if not styles and default_style in available and available[default_style].metadata.category == "style":
        styles = [default_style]
    chosen += styles[:1]
    # subjects: a guide matching far fewer words than the best one is a side mention ("internet" in a
    # media topic), not the subject
    subjects = [(score, name) for score, name in ranked if available[name].metadata.category == "subject"]
    top = subjects[0][0] if subjects else 0
    chosen += [name for score, name in subjects if score * 3 >= top][:2]
    if long_video:
        chosen += [name for name, skill in available.items() if skill.metadata.long_video]
    return chosen


def index(role: Role = "planner", allowed: list[str] | None = None) -> str:
    """Guides the model may load: ``allowed``, else every guide except the on-request ones."""
    return "\n".join(f"- {name}: {s.description}" for name, s in discover(role).items()
                     if (name in allowed if allowed is not None else not s.metadata.on_request))


def guidance(names: list[str], role: Role = "planner", *, asset_lookup: bool = False) -> str:
    if not names:
        return ""
    guides = []
    for name in names:
        guide = load(name, role)
        if asset_lookup and name == "iso-diagrams":
            guide = re.sub(
                r"(?ms)^Objects \(kinds.*?(?=^- For concepts that need distinct artwork)",
                "Use find_iso_objects for specialized kinds. Common kinds: server, database, client, router, file, user. "
                "For road diagrams use z: 0.12 for vehicles, or 0.18 on a highway.\n",
                guide,
            )
            guide = re.sub(r"(?m)^More media kinds:.*\n?", "", guide)
        guides.append(guide)
    return "\nTeaching guides (adapt to the task; scene contracts and user instructions take precedence):\n" + "\n\n".join(guides)


def tools(role: Role = "planner", allowed: list[str] | None = None, loaded: set[str] | None = None):
    def list_skills() -> str:
        """List available teaching guides by name and description."""
        return index(role, allowed) or "No skills enabled."

    def load_skill(name: str) -> str:
        """Load a teaching guide by its exact name before applying it."""
        guide = discover(role).get(name)
        if (name not in allowed) if allowed is not None else (guide is not None and guide.metadata.on_request):
            return f"Skill {name!r} is not enabled for this request."
        try:
            body = load(name, role)
        except ValueError as exc:
            return str(exc)
        if loaded is not None:
            loaded.add(name)
        return body

    async def list_async() -> str:
        return list_skills()

    async def load_async(name: str) -> str:
        return load_skill(name)

    return [StructuredTool.from_function(list_skills, coroutine=list_async),
            StructuredTool.from_function(load_skill, coroutine=load_async)]
