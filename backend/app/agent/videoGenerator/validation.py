"""Validate generated scenes, narration and visual timing before rendering."""
import json
import re
import uuid
from typing import Any, Literal

from app.agent.videoGenerator import skills as teaching_skills
from app.config import settings
from app.utils import cues
from app.utils.iso import expand_continuations, object_references, paper_code_scenes
from app.utils.render import DEFAULT_TRANSITION_FRAMES, RenderError, validate

from .tools import catalog

Layout = Literal["desktop", "mobile", "square"]
LAYOUTS: dict[str, tuple[int, int]] = {"desktop": (1920, 1080), "mobile": (1080, 1920), "square": (1080, 1080)}


def apply_layout(spec: dict[str, Any], layout: str) -> dict[str, Any]:
    """Use the job's requested render dimensions."""
    spec["width"], spec["height"] = LAYOUTS.get(layout, LAYOUTS["desktop"])
    return spec


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fence:
        text = fence.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in the reply")
    return json.loads(text[start : end + 1])


def _normalize(spec: dict[str, Any], *, layout: str = "desktop") -> dict[str, Any]:
    """Turn the planner's scenes into a composition with backend-owned settings."""
    for key in spec.keys() - {"scenes"}:
        del spec[key]
    spec.update(fps=30, defaultTransition={"type": "fade", "durationInFrames": DEFAULT_TRANSITION_FRAMES},
                audio={"effects": True})
    apply_layout(spec, layout)
    expand_continuations(spec)  # carry the previous picture over on supported boards
    paper_code_scenes(spec)  # paper-style video: no dark CodeScene
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
        if isinstance(props, dict):
            component = scene.get("component", "")
            if component == "ComparisonTableScene" and type(props.get("revealFrames")) is int and props["revealFrames"] == 0:
                props["revealFrames"] = 1  # shortest reveal supported by the renderer
            diagram = props if component == "IsoScene" else props.get("diagram") if component == "AnnotatedTextScene" else None
            opening_track = props.get("stages") if component == "WorkedExampleScene" else (
                diagram.get("exampleLines") if isinstance(diagram, dict) else None)
            if isinstance(opening_track, list) and opening_track and isinstance(first := opening_track[0], dict):
                first["at"] = 0
                first.pop("cue", None)
                first.pop("appearCue", None)
            for key in catalog.filler_fields(str(component)):
                props.setdefault(key, "")
    return spec


def _diagram_reference_errors(spec: dict[str, Any]) -> list[str]:
    errors = []
    for i, scene in enumerate(spec.get("scenes", [])):
        props = scene.get("props")
        if not isinstance(props, dict):
            continue
        component = scene.get("component")
        diagram = props if component == "IsoScene" else props.get("diagram") if component == "AnnotatedTextScene" else None
        if not isinstance(diagram, dict) or not isinstance(objects := diagram.get("objects"), list):
            continue
        ids = {obj.get("id") for obj in objects if isinstance(obj, dict) and isinstance(obj.get("id"), str)}
        prefix = "props" if component == "IsoScene" else "props.diagram"
        errors.extend(f'scenes[{i}] ({scene["id"]}).{prefix}.{path}: no object with id "{oid}"'
                      for path, oid in object_references(diagram) if oid not in ids)
    return errors


def _concept_card(scene: dict[str, Any]) -> bool:
    props = scene.get("props") or {}
    return (scene.get("component") == "ExplainScene"
            and all(isinstance(props.get(k), str) and props[k].strip() for k in ("heading", "body")))


def apply_reading_time(spec, *, lecture, explainer):
    scenes = spec.get("scenes", [])
    if not scenes or not (lecture or explainer):
        return
    first = scenes[0]
    title = first.get("component") == "TitleScene" or (
        first.get("component") == "IsoScene" and (first.get("props") or {}).get("objects") == [])
    first_lesson = scenes[1:2] if title else scenes[:1]
    for scene in filter(_concept_card, scenes if lecture else first_lesson):
        props = scene["props"]
        props.update(textAnimation="none", startAt=0)
        # Allow a quiet reading beat even when the recorded sentence is short.
        words = len((props["heading"] + " " + props["body"]).split())
        reading_frames = round(spec["fps"] * max(4, words / 3))
        scene["durationInFrames"] = max(scene["durationInFrames"], reading_frames)


async def _check(reply: str, code_demo: str | None = None, *, lecture: bool = False,
                 explainer: bool = False, layout: str = "desktop") -> tuple[dict[str, Any] | None, str]:
    """Parse + validate a reply. Returns (spec, "") or (None, problem to send back)."""
    try:
        spec = _extract_json(reply)
        _normalize(spec, layout=layout)
    except (ValueError, json.JSONDecodeError) as exc:
        return None, f"Your reply was not a valid JSON object ({exc}). Reply with ONLY the corrected JSON."
    if errors := _diagram_reference_errors(spec):
        return None, "The JSON has these errors:\n" + "\n".join(errors) + "\nFix every missing object reference."
    if lecture:
        issues = []
        for i, scene in enumerate(spec.get("scenes", [])):
            narration = scene.get("narration")
            if not isinstance(narration, dict):
                issues.append(f'scenes[{i}] ({scene["id"]}).narration: Supply an object with the spoken text.')
            elif not isinstance(narration.get("text"), str) or not narration["text"].strip():
                issues.append(f'scenes[{i}] ({scene["id"]}).narration.text: Supply the words spoken in this scene.')
        if issues:
            return None, "The JSON has these errors:\n" + "\n".join(issues)
    # The plan keeps its word cues (resolved from real word times at render); check an estimated copy.
    issues: list[str] = []
    estimated, _ = cues.resolve(spec, issues=issues if lecture or explainer else None)
    work = settings.WORKSPACE_DIR / "plans"
    work.mkdir(parents=True, exist_ok=True)
    path = work / f"{uuid.uuid4().hex[:12]}.json"
    path.write_text(json.dumps(estimated, indent=2))
    try:
        await validate(path)
    except RenderError as exc:
        issues.insert(0, exc.details)
    if issues:
        return None, "The JSON has these errors:\n" + "\n".join(issues) + "\nFix them and reply with ONLY the full corrected JSON."
    if lecture or explainer:
        scenes = spec["scenes"]
        opening = scenes[0]
        props = opening.get("props") or {}
        title = opening["component"] == "TitleScene" or (
            opening["component"] == "IsoScene" and props.get("objects") == [] and not props.get("steps"))
        first_lesson = scenes[1:2] if title else scenes[:1]
        if not first_lesson or not _concept_card(first_lesson[0]):
            return None, "Open the lesson with ExplainScene (or place it immediately after the title). Supply heading and body explaining the idea before showing its example."
        card = first_lesson[0]
        if card.get("overlays") or any(card["props"].get(k) for k in ("device", "stat", "arrows")):
            return None, "Keep the opening explanation readable with a heading, body, and optional short points. Move demonstrations to the next scene."
        if evidence := _lecture_evidence(scenes):
            return None, "Fix the lesson's visible examples:\n- " + "\n- ".join(evidence)
        apply_reading_time(spec, lecture=lecture, explainer=explainer)
    if any(s.get("component") == "TransactionScene" and "expectedPendingRows" not in s.get("props", {}) for s in spec.get("scenes", [])):
        return None, "Supply expectedPendingRows for each TransactionScene so its steps can be checked against the intended lesson."
    if code_demo and not any(scene.get("component") in CODE_SCENES for scene in spec.get("scenes", [])):
        return None, (f"Show this chapter's required code demonstration in an EditorScene: {code_demo}\n"
                      "Explain the relevant code in the narration. Reply with ONLY the full corrected JSON.")
    return spec, ""


TEXT_SCENES = {"DefinitionScene", "ExplainScene", "BulletListScene"}


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
    if code_demo is None and settings.PLANNER_CODE_EVERY and CODE_SKILLS & set(skills):
        need = -(-len(scenes) // settings.PLANNER_CODE_EVERY)  # ceil
        have = sum(s.get("component") in CODE_SCENES for s in scenes)
        if have < need:
            problems.append(f"this is a programming topic: it needs at least {need} code scenes (EditorScene, or CodeScene; one per main concept, about "
                            f"1 in every {settings.PLANNER_CODE_EVERY} scenes) but has {have}. Show the code that produces "
                            "each behavior you explain, using the same running example.")
    covered = [f"'{s.get('id')}' ({s.get('component')}: {', '.join(sorted(kinds))})" for s in spec.get("scenes", [])
               if s.get("component") not in PANEL_HOSTS
               and (kinds := {o.get("type") for o in s.get("overlays") or [] if isinstance(o, dict)} & PANEL_OVERLAYS)]
    if covered:
        problems.append("panel overlays would cover the scene's content in " + "; ".join(covered) + ". Move each panel "
                        "into its own BlankScene (short title, panel at \"center\", the narration about it) right after.")
    problems += _lint_variety(scenes, skills)
    problems += _lint_narration(scenes)
    problems += _lint_spoken_code(scenes)
    problems += _lint_unsaid_text(scenes)
    problems += _lint_cues(spec)
    problems += _lint_iso(scenes, lecture="teach-lecture" in skills)
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
    """Flag a scene type that dominates the plan or runs for too many scenes in a row."""
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
    return problems


def _lint_cues(spec: dict[str, Any]) -> list[str]:
    """Report authored cues that do not appear in their scene narration."""
    problems = []
    _, missing = cues.resolve(spec)
    if missing:
        problems.append("these cues are not words of their scene's narration: " + "; ".join(
            f"'{sid}': {', '.join(repr(c) for c in lost)}" for sid, lost in missing.items())
            + ". Use a word the narrator actually says in that scene (or add it to the narration).")
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


# Code a voice would spell out symbol by symbol: /paths, URLs, ?query=strings, a.b.c field paths,
# ids_with_underscores, calls(). "e.g.", "Node.js" and "and/or" are not matched.
SPOKEN_CODE = re.compile(r"(?<!\S)/[\w{]\S*|https?://\S+|\S*\?\w+=\S*|\b[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]+)+\b"
                         r"|\b\w+_\w+\b|\b\w+\(\)")


def _lint_spoken_code(scenes: list[dict[str, Any]]) -> list[str]:
    """Code in narration: the voice spells it out ("slash api slash watches question mark ...", ten
    seconds for one URL) while the caption shows the raw code. The screen should carry the code."""
    if not settings.PLANNER_LINT_SPOKEN_CODE:
        return []
    found = []
    for s in scenes:
        text = str((s.get("narration") or {}).get("text", ""))
        hits = list(dict.fromkeys(m.group().rstrip(".,;:!?") for m in SPOKEN_CODE.finditer(text)))
        if hits:
            found.append(f"'{s.get('id')}': {', '.join(hits[:4])}")
    if not found:
        return []
    return [f"narration is spoken aloud, but it contains code the voice would spell out symbol by symbol: {'; '.join(found[:8])}. "
            "Keep the exact code on screen and say it in words: \"the watches path\", \"watch W T one-oh-one\", "
            "\"the next link\", \"the price field inside data\". Do not write URLs, paths, a.b.c fields or ids with underscores in narration."]


TEXT_CARD_FIELDS = {"ExplainScene": ("heading", "points"), "BulletListScene": ("title", "items"),
                    "SummaryScene": ("title", "points"), "DefinitionScene": ("term", "meaning")}
STOP = {"this", "that", "with", "from", "into", "your", "they", "them", "their", "there", "what", "when", "which",
        "have", "will", "each", "than", "then", "also", "only", "just", "more", "most", "some", "such", "does",
        "were", "been", "being", "about", "over", "make", "makes", "uses", "using"}


def _key_words(text: str) -> list[str]:
    words = (re.sub(r"[^a-z0-9]", "", w.lower()) for w in text.split())
    return [w for w in words if (len(w) >= 4 or w.isdigit()) and w not in STOP]


def _said(word: str, spoken: set[str]) -> bool:
    """The word, or the same stem ("resources" ~ "resource", "validate" ~ "validation")."""
    return word in spoken or any(len(s) >= 4 and (s[:5] == word[:5] if len(word) >= 5 else s == word) for s in spoken)


def _lint_unsaid_text(scenes: list[dict[str, Any]]) -> list[str]:
    """Text cards whose heading / points the voice never says: the viewer reads one thing and hears
    another. A line passes when the narration says at least PLANNER_SAID_TEXT_MIN of its key words."""
    need = settings.PLANNER_SAID_TEXT_MIN
    if not need:
        return []
    unsaid = []
    for s in scenes:
        fields = TEXT_CARD_FIELDS.get(s.get("component", ""))
        if not fields:
            continue
        props = s.get("props") or {}
        spoken = set(_key_words(str((s.get("narration") or {}).get("text", ""))))
        lines = [v for f in fields for v in ([props.get(f)] if isinstance(props.get(f), str) else props.get(f) or [])]
        for line in lines:
            if not isinstance(line, str):
                continue
            words = _key_words(line)
            if len(words) >= 2 and sum(_said(w, spoken) for w in words) / len(words) < need:
                unsaid.append(f"'{s.get('id')}': \"{re.sub(r'\*\*|==|__|\(\(|\)\)', '', line)[:70]}\"")
    if not unsaid:
        return []
    return [f"the screen shows text the narration never says, so the viewer reads one thing and hears another: {'; '.join(unsaid[:8])}. "
            "Say each heading and point with the same key words (in a natural sentence), or change the card to what is said."]


HUBS = {"loadbalancer", "router", "api"}  # these send to each target directly
EVENT_LABEL = re.compile(r"^(request|req|response|packet|call|turn)\b", re.I)
REPLY_LABEL = re.compile(r"^(?:(?:HTTP|JSON) )?(?:response|reply)(?: body)?$|^JSON$", re.I)


def _lecture_evidence(scenes: list[dict[str, Any]]) -> list[str]:
    """Flag title-only diagrams and detached reply tiles."""
    problems = []
    for i, scene in enumerate(scenes):
        if scene.get("component") != "IsoScene":
            continue
        props = scene.get("props") or {}
        objects = [obj for obj in props.get("objects") or [] if not obj.get("ghost")]
        links = props.get("links") or []
        if i > 0 and not objects and not props.get("points"):
            problems.append(f"Scene '{scene['id']}' is a title-only diagram. Give the learner the actual example "
                            "in WorkedExampleScene, AnnotatedTextScene, or a diagram with readable exampleLines.")
        connected = {link.get(key) for link in links for key in ("from", "to", "via")}
        orphan_replies = [obj["id"] for obj in objects if links and obj["id"] not in connected
                          and REPLY_LABEL.fullmatch(str(obj.get("label") or obj["id"]).strip())]
        if orphan_replies:
            problems.append(f"Scene '{scene['id']}' has detached replies {orphan_replies}. Show the result on the "
                            "arrow to its recipient or next to that recipient as readable text.")
    return problems


def _lint_iso(scenes: list[dict[str, Any]], *, lecture: bool = False) -> list[str]:
    """Check teaching evidence, hub connections, and object labels in diagrams."""
    problems: list[str] = []
    for s in scenes:
        if s.get("component") != "IsoScene":
            continue
        props = s.get("props") or {}
        objs = {o.get("id"): o for o in props.get("objects") or [] if isinstance(o, dict)}
        visible_objects = [o for o in objs.values() if not o.get("ghost")]
        if lecture and len(visible_objects) >= 2:
            if not props.get("exampleLines"):
                problems.append(f"Scene '{s.get('id')}': write the concrete example in exampleLines beside the diagram, starting at 0.")
            untimed = [o.get("id") for o in visible_objects if o.get("enter") != "none" and
                       o.get("appearCue") is None and o.get("appearAt") is None]
            if untimed:
                problems.append(f"Scene '{s.get('id')}': give new diagram objects {untimed} an appearCue from the narration; use enter:none for the starting context.")
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
    return problems
