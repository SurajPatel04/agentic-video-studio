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
from app.utils import catalog, skill_router, skills as teaching_skills
from app.utils.console import step
from app.utils.iso import expand_continuations, paper_code_scenes
from app.utils.llm import get_llm, get_tool_llm, text_of, usage_of
from app.utils import cues, iso_design
from app.utils.plan_repair import Repair, scoped_repair, update_plan_fields
from app.utils.render import RenderError, validate

log = logging.getLogger(__name__)

Mode = Literal["auto", "catalog", "tools"]
Layout = Literal["desktop", "mobile", "square"]
LAYOUTS: dict[str, tuple[int, int]] = {"desktop": (1920, 1080), "mobile": (1080, 1920), "square": (1080, 1080)}
LAYOUT_HINT = {
    "mobile": "- Layout: MOBILE, portrait 1080x1920 (phone, Shorts/Reels). Set \"width\": 1080, \"height\": 1920. Keep titles to "
              "about 5 words, at most 3 objects side by side, stack things top to bottom, short labels and table cells.\n",
    "square": "- Layout: SQUARE 1080x1080 (feed post). Set \"width\": 1080, \"height\": 1080. Keep titles short and at most "
              "4 objects side by side.\n",
}


def apply_layout(spec: dict[str, Any], layout: str) -> dict[str, Any]:
    """Force the frame size of a layout (the LLM may copy 1920x1080 from the examples)."""
    spec["width"], spec["height"] = LAYOUTS.get(layout, LAYOUTS["desktop"])
    return spec


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


BRIEF_GUIDANCE = """Read the full brief in its language and context. Identify the requested action,
the subject it applies to, and the outcome the viewer should get. Resolve ambiguous words using the
surrounding phrase and supplied material. If several readings still fit, plan around their shared
meaning and keep the user's terminology. Preserve the stated audience, purpose, format, scope and
chapter outline. For a sparse brief, infer a focused viewer outcome and an appropriate sequence.
Choose an example from the subject when it helps explain a point. Introduce invented scenarios as
illustrations and keep the title and learning goals grounded in the user's subject."""


RULES = """You are the planner for a narrated video generator (React/Remotion), for any subject or purpose.
You turn a topic into ONE composition JSON.
Match each visual to the point being narrated at that moment. During a comparison, make both sides
and the relevant difference visible. During a process, show the change as the narrator describes it.

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
  A BUILD-UP scene (one picture that grows: a cued step for each sentence) may have up to 6 sentences (~80 words).
- Sync every change to the words: give each step/action/message "cue": "<a word or short phrase from THIS scene's
  narration>" instead of guessing "at"; an object or link that appears later gets "appearCue". The change then
  happens exactly when the narrator says that word ("cue": "duplicates" -> the badge pops on "duplicates").
  Cue the word that NAMES the change, in the order spoken.
- The narration is shown as subtitles at the bottom, so keep scene "caption"/"footer" props short (or leave them out) and never repeat the narration on screen.
- On-screen text supports markup: **bold**, ==highlight==, __underline__, ((circle)). Keep it short.
- Scene ids: unique, lowercase, kebab-case. durationInFrames: 90-300 (it is stretched to fit the narration).
- Follow the user's audience, language, purpose and format. A lecture develops understanding; an explainer answers a question; an ad communicates a benefit and next action. Do not force quizzes or a lecture structure into other formats.
- Choose visuals that support the meaning: examples, steps, comparisons, timelines, images or diagrams as appropriate. Avoid unrelated technical imagery and repetitive text slides.
- Show the REAL thing the narration talks about, readable on screen, not only a diagram about it: the code, the
  request and its JSON, the terminal output (tech); the headline, post, quote, document or ad (media); the date on a
  timeline or the place on a map (history, geography); the number on a chart (business, science); the equation and a
  worked value (maths). Mix scene types: never more than 5 of the same scene in a row (checked).
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


async def _check(reply: str, code_demo: str | None = None) -> tuple[dict[str, Any] | None, str]:
    """Parse + validate a reply. Returns (spec, "") or (None, problem to send back)."""
    try:
        spec = _normalize(_extract_json(reply))
    except (ValueError, json.JSONDecodeError) as exc:
        return None, f"Your reply was not a valid JSON object ({exc}). Reply with ONLY the corrected JSON."
    work = settings.WORKSPACE_DIR / "plans"
    work.mkdir(parents=True, exist_ok=True)
    path = work / f"{uuid.uuid4().hex[:12]}.json"
    # The plan keeps its word cues (resolved from real word times at render); check an estimated copy.
    path.write_text(json.dumps(cues.resolve(spec)[0], indent=2))
    try:
        await validate(path)
    except RenderError as exc:
        return None, f"The JSON has these errors:\n{exc.details}\nFix them and reply with ONLY the full corrected JSON."
    if code_demo and not any(scene.get("component") in CODE_SCENES for scene in spec.get("scenes", [])):
        return None, (f"Show this chapter's required code demonstration in an EditorScene: {code_demo}\n"
                      "Explain the relevant code in the narration. Reply with ONLY the full corrected JSON.")
    return spec, ""


TEXT_SCENES = {"DefinitionScene", "ExplainScene", "BulletListScene"}


def _rules() -> str:
    return (BRIEF_GUIDANCE + "\n" + RULES.replace("OVERLAYS", catalog.overlay_list()).replace("PANELS", ", ".join(sorted(PANEL_OVERLAYS)))
            .replace("TEXTSHARE", f"{settings.PLANNER_MAX_TEXT_SHARE:.0%}").replace("TEXTRUN", str(settings.PLANNER_MAX_TEXT_RUN)))


PANEL_OVERLAYS = {"terminal", "chat"}  # big windows that cover whatever is under them
PANEL_HOSTS = {"BlankScene"}  # scenes with free space for them


CODE_SKILLS = {"teach-code"}  # with these guides, the plan must show code regularly
CODE_SCENES = {"CodeScene", "EditorScene"}  # scenes that show source code (paper videos use EditorScene)


def _visuals(topic: str, skills: list[str] | tuple[str, ...]) -> list[tuple[str, list[str]]]:
    return teaching_skills.required_visuals(topic, list(skills), set(catalog.scene_names())) if topic else []


def _visual_hint(topic: str, skills: list[str] | tuple[str, ...]) -> str:
    """Tell the planner up front which scenes the topic must show (the plan is checked for them)."""
    need = _visuals(topic, skills)
    if not need:
        return ""
    return ("\nThis topic MUST be shown, not told. Include at least one of each (checked):\n"
            + "\n".join(f'- "{hit}": {" or ".join(scenes)}' for hit, scenes in need) + "\n")


def _lint(spec: dict[str, Any], skills: list[str] | tuple[str, ...] = (), topic: str = "",
          *, code_demo: str | None = None) -> str:
    """Style problems in a VALID plan (one retry is spent on them; a valid plan is never lost)."""
    problems = []
    scenes = spec.get("scenes", [])
    used = {s.get("component") for s in scenes}
    for hit, need in _visuals(topic, skills):
        if not used & set(need):
            problems.append(f'the topic mentions "{hit}", so the viewer must SEE it: add a {" or ".join(need)} that animates '
                            "it (computed steps, not a text card or a generic diagram), with narration that follows it.")
    texts = sum(s.get("component") in TEXT_SCENES for s in scenes)
    cap = max(2, int(len(scenes) * settings.PLANNER_MAX_TEXT_SHARE))
    if scenes and texts > cap:
        problems.append(f"{texts} of {len(scenes)} scenes are text-only (Definition/Explain/BulletList); the most allowed is "
                        f"{cap}. Turn {texts - cap} of them into scenes that SHOW the idea (code, flowchart, cycle, comparison, "
                        "chart, timeline, devices, connection).")
    if code_demo is None and settings.PLANNER_CODE_EVERY and CODE_SKILLS & set(skills):
        need = -(-len(scenes) // settings.PLANNER_CODE_EVERY)  # ceil
        have = sum(s.get("component") in CODE_SCENES for s in scenes)
        if have < need:
            problems.append(f"this is a programming topic: it needs at least {need} code scenes (EditorScene, or CodeScene; one per main concept, about "
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
    problems += _lint_variety(scenes, skills)
    problems += _lint_narration(scenes)
    problems += _lint_cues(spec)
    problems += _lint_iso(scenes)
    if not problems:
        return ""
    return "The plan is valid, but:\n- " + "\n- ".join(problems) + "\nReply with ONLY the full corrected JSON."


def _alternatives(skills, used: str) -> str:
    """Scenes the selected guides recommend other than ``used``: tech guides name code, terminal and
    trace scenes; media, history or business guides name front pages, timelines, maps and charts."""
    available, names = teaching_skills.discover(), set(catalog.scene_names())
    out = []
    for name in skills:
        for scene in available[name].metadata.scenes if name in available else []:
            if scene != used and scene in names and scene not in out and scene not in TEXT_SCENES:
                out.append(scene)
    return ", ".join(out[:8]) or "a chart, timeline, comparison, map, quote or worked example"


def _lint_variety(scenes: list[dict[str, Any]], skills) -> list[str]:
    """The same scene type over and over (any subject): a long run, most of the plan, or the same
    IsoScene picture drawn again and again. Viewers stop seeing a picture they have seen 10 times."""
    problems = []
    limit = settings.PLANNER_MAX_SAME_RUN
    run, start = 0, 0
    for i, s in enumerate(scenes + [{}]):
        if i and s.get("component") == scenes[i - 1].get("component"):
            run += 1
            continue
        if limit and run + 1 > limit and i:
            comp = scenes[i - 1].get("component")
            problems.append(f"{run + 1} {comp}s in a row ('{scenes[start].get('id')}' to '{scenes[i - 1].get('id')}'); "
                            f"the limit is {limit}. Show the REAL thing the narration talks about in some of them "
                            f"(the code, request, document, headline, number or place itself) with: {_alternatives(skills, comp)}.")
        run, start = 0, i
    share = settings.PLANNER_MAX_SAME_SHARE
    if share and len(scenes) >= 8:
        counts: dict[str, int] = {}
        for s in scenes:
            counts[s.get("component", "")] = counts.get(s.get("component", ""), 0) + 1
        comp, n = max(counts.items(), key=lambda kv: kv[1])
        if n > len(scenes) * share and not any(p.startswith(f"{n} {comp}s in a row") for p in problems):
            problems.append(f"{n} of {len(scenes)} scenes are {comp}; at most {share:.0%}. Replace some with scenes that show "
                            f"the real thing: {_alternatives(skills, comp)}.")
    most = settings.PLANNER_MAX_SAME_PICTURE
    if most:
        seen: dict[tuple, list[str]] = {}
        for s in scenes:
            props = s.get("props") or {}
            if s.get("component") != "IsoScene" or props.get("continue") or props.get("continued"):
                continue
            picture = tuple(sorted(f"{o.get('kind')}:{o.get('design') or o.get('icon') or ''}"
                                   for o in props.get("objects") or [] if isinstance(o, dict)))
            if len(picture) >= 2:
                seen.setdefault(picture, []).append(s.get("id", ""))
        for ids in seen.values():
            if len(ids) > most:
                problems.append(f"scenes {', '.join(ids)} draw the same objects from scratch {len(ids)} times (limit {most}). "
                                "Keep one overview, use \"continue\" for changes, and give the other ideas their own "
                                "picture: a close-up of one part, a before/after, or a non-diagram scene.")
    return problems


def _timed(node: Any) -> tuple[int, int]:
    """(cued, guessed) timed items in a scene's props: dicts with a word cue vs a numeric "at"."""
    cued = guessed = 0
    if isinstance(node, list):
        for item in node:
            c, g = _timed(item)
            cued, guessed = cued + c, guessed + g
    elif isinstance(node, dict):
        if "cue" in node or "appearCue" in node:
            cued += 1
        elif isinstance(node.get("at"), (int, float)) and not isinstance(node.get("at"), bool):
            guessed += 1
        for value in node.values():
            if isinstance(value, (list, dict)):
                c, g = _timed(value)
                cued, guessed = cued + c, guessed + g
    return cued, guessed


def _lint_cues(spec: dict[str, Any]) -> list[str]:
    """Changes must land on the words that name them: cues that are not in the narration, and
    scenes with several steps timed by guessed fractions."""
    problems = []
    _, missing = cues.resolve(spec)
    if missing:
        problems.append("these cues are not words of their scene's narration: " + "; ".join(
            f"'{sid}': {', '.join(repr(c) for c in lost)}" for sid, lost in missing.items())
            + ". Use a word the narrator actually says in that scene (or add it to the narration).")
    guessed = [s.get("id", "") for s in spec.get("scenes", []) if s.get("component") in cues.timing_paths()
               and (t := _timed(s.get("props")))[1] >= 3 and t[0] < t[1]]
    if guessed:
        problems.append(f"scenes {', '.join(guessed)} time most steps with a guessed \"at\", so the picture changes "
                        "before or after the narrator mentions it. Give each step \"cue\": \"<the word that names it>\".")
    return problems


GLOSSARY_LINE = re.compile(r"(?:^|[.!?]\s+)[A-Z][\w /'-]{1,40}\s=\s")


def _lint_narration(scenes: list[dict[str, Any]]) -> list[str]:
    """Narration that reads like notes, not a teacher talking: "Term = meaning" glossary lines, and
    the same phrase in many scenes."""
    problems = []
    texts = [(s.get("id", ""), str((s.get("narration") or {}).get("text", ""))) for s in scenes]
    glossary = [i for i, t in texts if GLOSSARY_LINE.search(t)]
    if glossary:
        problems.append(f"narration in {', '.join(glossary)} reads a definition like a note (\"Term = meaning\"). Say it as a "
                        "teacher would, in a sentence tied to what is on screen: \"A resource is simply ...\".")
    shingles: dict[str, set[str]] = {}
    for sid, text in texts:
        words = re.findall(r"[a-z0-9{}/']+", text.lower())
        for k in range(len(words) - 5):
            shingles.setdefault(" ".join(words[k:k + 6]), set()).add(sid)
    repeated = sorted((p for p, ids in shingles.items() if len(ids) >= 3), key=lambda p: -len(shingles[p]))
    if repeated:
        problems.append(f"the narration repeats \"{repeated[0]}\" in {len(shingles[repeated[0]])} scenes. Say each point once, "
                        "then move forward: a new example, a question to the viewer, or what goes wrong without it.")
    return problems


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
    text = catalog.scene_text(name)
    if "<iso kind>" in text:  # 179 objects: described in the iso-diagrams guide; search instead of listing them
        text += "\n<iso kind> = an object kind from the iso-diagrams guide; call find_iso_objects(\"idea\") to look one up."
    if name in cues.timing_paths():
        fields = ", ".join(sorted(p.lstrip(".") for p in cues.timing_paths()[name]))
        text += (f"\nTiming ({fields}): instead of guessing the fraction, write \"cue\": \"<word from this scene's "
                 "narration>\" (\"appearCue\" for appearAt); it lands exactly when that word is spoken.")
    return text


@tool
def find_iso_objects(query: str) -> str:
    """IsoScene object kinds for an idea, e.g. "radio studio", "money", "election", "hospital". Best match first."""
    # Same order the planner should choose in: built-in kinds, then Lucide icons, then saved designs.
    hits = catalog.find_iso_objects(query)
    rows = [f"- {k}" + (f": {d}" if d else "") for k, d in hits]
    rows += [f'- kind="tile", icon="{name}"' for name in iso_design.find_icons(query)]
    words = set(re.findall(r"[a-z0-9]+", query.lower()))
    for key, art in iso_design.inventory().items():
        if not art.icon and words.intersection(re.findall(r"[a-z0-9]+", " ".join([key, *art.aliases]).lower())):
            rows.append(f'- kind="tile", design="{key}" ({", ".join(art.aliases)})')
    return "\n".join(rows) or ('No match: use kind="tile" with a Lucide icon you know, or design="<thing>" '
                               'for a concrete object no icon shows.')


@tool
def list_device_kinds() -> str:
    """All device kinds usable where a field says <device kind> (2D icons and 3D models)."""
    return ", ".join(catalog.device_kinds())


@tool
def get_overlay(kind: str) -> str:
    """Fields of one overlay type (callout, check, terminal, ...), to put in a scene's "overlays" list."""
    return catalog.overlay_text(kind)


LOOKUP_TOOLS = {t.name: t for t in (search_scenes, get_scene, list_device_kinds, find_iso_objects, get_overlay)}


# --------------------------------------------------------------------------- modes


def _repair_for(reply: str, spec: dict | None, problem: str) -> Repair | None:
    if spec is None:
        if not problem.startswith("The JSON has these errors:"):
            return None
        spec = _normalize(_extract_json(reply))
    return scoped_repair(spec, problem)


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
                        *, code_demo: str | None = None) -> Plan:
    known = teaching_skills.guidance(list(skills)) if skills else ""  # iso objects the guides already describe are not repeated
    system = _rules() + hint + "\nOutput ONLY the JSON object, no prose, no code fences.\n\nScene library:\n" + catalog.catalog_text(topic, known=known)
    messages: list[Any] = [SystemMessage(system), HumanMessage(f"Topic: {topic}")]
    llm = get_llm(model or settings.PLANNER_MODEL or None)
    tin = tout = calls = 0
    problem = ""
    best = _Best()  # valid plans with style problems: the one with the fewest is kept
    repair = None
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
        spec, problem = await _check(reply, code_demo)
        if spec:
            style = _lint(spec, skills, topic, code_demo=code_demo)
            if not style:
                return Plan(spec, attempt, "catalog", calls, tin, tout)
            if best.add(spec, attempt, style):
                return Plan(best.spec, best.attempt, "catalog", calls, tin, tout)
            problem = style
        log.warning("planner.retry mode=catalog attempt=%d problem=%s", attempt, problem[:300])
        repair = _repair_for(reply, spec, problem)
        messages = [*messages[:2], AIMessage(reply), HumanMessage(problem)]
    if best.spec:
        return Plan(best.spec, best.attempt, "catalog", calls, tin, tout)
    raise PlanError(f"planner gave invalid JSON {settings.PLANNER_MAX_ATTEMPTS} times", problem)


async def _plan_tools(topic: str, hint: str, model: str | None, selected: list[str], allowed: list[str] | None,
                      *, code_demo: str | None = None) -> Plan:
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
    repair = None
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
        spec, problem = await _check(text_of(msg), code_demo)
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
        repair = _repair_for(text_of(msg), spec, problem)
        messages.append(HumanMessage(problem + " Use get_scene to check fields if unsure."))
    if best.spec:
        return Plan(best.spec, best.attempt, "tools", calls, tin, tout, sorted(loaded))
    raise PlanError(f"planner did not produce valid JSON (mode=tools, {attempts} attempts, {calls} calls)", problem)


async def plan_video(topic: str, *, scenes: int | None = None, model: str | None = None, mode: Mode | None = None,
                     context: str = "", skills: list[str] | None = None, layout: Layout = "desktop",
                     code_demo: str | None = None) -> Plan:
    """Ask the LLM for a valid composition about ``topic`` (printed as one step with its result).
    ``layout``: desktop 1920x1080 (default) | mobile 1080x1920 | square 1080x1080."""
    with step("plan", topic=topic, scenes=scenes, mode=mode or settings.PLANNER_MODE, layout=layout) as s:
        context = LAYOUT_HINT.get(layout, "") + context
        plan = await _plan_video(topic, scenes=scenes, model=model, mode=mode, context=context, skills=skills,
                                 code_demo=code_demo)
        await iso_design.materialize(plan, model)
        apply_layout(plan.spec, layout)
        s.update(mode=plan.mode, skills=",".join(plan.skills), scenes=len(plan.spec.get("scenes", [])),
                 attempts=plan.attempts, llm_calls=plan.llm_calls, tokens_in=plan.input_tokens, tokens_out=plan.output_tokens)
        return plan


async def _plan_video(topic: str, *, scenes: int | None = None, model: str | None = None, mode: Mode | None = None,
                      context: str = "", skills: list[str] | None = None, code_demo: str | None = None) -> Plan:
    """Ask the LLM for a valid composition about ``topic``.

    ``context``: extra instructions added to the rules, e.g. a long video's outline and what earlier
    chapters covered (see app/utils/long_video.py)."""
    hint = f"- Make about {scenes} scenes.\n" if scenes else "- Make 6-10 scenes.\n"
    if context:
        hint += "\n" + context.strip() + "\n"
    # None selects the standalone policy. An empty string is a chapter with no required demo.
    if code_demo:
        hint += f"\nUse an EditorScene to demonstrate this chapter's required source code: {code_demo}\n"
    elif code_demo == "":
        hint += "\nUse code only if it directly helps teach this chapter's goal.\n"
    mode = mode or settings.PLANNER_MODE
    if mode == "auto":
        mode = "tools" if len(catalog.scene_names()) > settings.PLANNER_TOOLS_THRESHOLD else "catalog"
    chosen = await skill_router.route(topic, skills, model=model)
    selected = chosen.skills
    if "iso-diagrams" in selected:
        hint += iso_design.planner_hint()
    hint += _visual_hint(topic, selected)
    allowed = selected if skills is not None else None
    if skills != []:
        hint += "\nAvailable teaching guides:\n" + teaching_skills.index(allowed=allowed)
    if mode == "tools":
        if selected:
            hint += "\nLoad these guides before planning: " + ", ".join(selected) + ". Use load_skill(name).\n"
        plan = await _plan_tools(topic, hint, model, selected, allowed, code_demo=code_demo)
    else:
        hint += teaching_skills.guidance(selected)
        available = teaching_skills.discover()
        scene_names = set(catalog.scene_names())
        extra_scenes = dict.fromkeys(n for name in selected for n in available[name].metadata.scenes)
        extra_overlays = dict.fromkeys(n for name in selected for n in available[name].metadata.overlays)
        extra = [catalog.scene_text(n) for n in extra_scenes if n in scene_names]
        hint += "\n" + catalog.kind_legend(*extra, known=teaching_skills.guidance(selected)) + "\n".join(extra)
        hint += "\n" + "\n".join(catalog.overlay_text(n) for n in extra_overlays)
        plan = await _plan_catalog(topic, hint, model, selected, code_demo=code_demo)
        plan.skills = selected
    plan.llm_calls += chosen.calls  # the skill router's call counts towards the plan
    plan.input_tokens += chosen.input_tokens
    plan.output_tokens += chosen.output_tokens
    return plan
