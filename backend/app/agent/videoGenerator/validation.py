"""Validate generated scenes, narration and visual timing before rendering."""
import json
import re
import uuid
from typing import Any

from app.agent.videoGenerator import skills as teaching_skills
from app.config import settings
from app.utils import cues
from app.utils.iso import expand_continuations, paper_code_scenes
from app.utils.render import RenderError, validate

from .schemas.lecture import Script
from .tools import catalog


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
    expand_continuations(spec)  # carry the previous picture over on supported boards
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


def _concept_card(scene: dict[str, Any]) -> bool:
    props = scene.get("props") or {}
    return (scene.get("component") == "ExplainScene"
            and all(isinstance(props.get(k), str) and props[k].strip() for k in ("heading", "body")))


async def _check(reply: str, code_demo: str | None = None, *, lecture: bool = False,
                 script: Script | None = None) -> tuple[dict[str, Any] | None, str]:
    """Parse + validate a reply. Returns (spec, "") or (None, problem to send back)."""
    try:
        spec = _extract_json(reply)
        if script:
            script.bind(spec)
        _normalize(spec)
    except (ValueError, json.JSONDecodeError) as exc:
        return None, f"Your reply was not a valid JSON object ({exc}). Reply with ONLY the corrected JSON."
    # The plan keeps its word cues (resolved from real word times at render); check an estimated copy.
    estimated, missing = cues.resolve(spec)
    if script and missing:
        issues = "\n".join(f"- scene '{sid}': Cue {', '.join(map(repr, lost))} is missing from the locked narration. "
                           "Use the exact spoken phrase for the change." for sid, lost in missing.items())
        return None, "The JSON has these errors:\n" + issues
    work = settings.WORKSPACE_DIR / "plans"
    work.mkdir(parents=True, exist_ok=True)
    path = work / f"{uuid.uuid4().hex[:12]}.json"
    path.write_text(json.dumps(estimated, indent=2))
    try:
        await validate(path)
    except RenderError as exc:
        return None, f"The JSON has these errors:\n{exc.details}\nFix them and reply with ONLY the full corrected JSON."
    if lecture:
        scenes = spec["scenes"]
        opening = scenes[0]
        props = opening.get("props") or {}
        title = opening["component"] == "TitleScene" or (
            opening["component"] == "IsoScene" and props.get("objects") == [] and not props.get("steps"))
        first_lesson = scenes[1:2] if title else scenes[:1]
        if not first_lesson or not _concept_card(first_lesson[0]):
            return None, "Open the lesson with ExplainScene (or place it immediately after the title). Supply heading and body explaining the idea before showing its example."
        if evidence := _lecture_evidence(scenes):
            return None, "Fix the lesson's visible examples:\n- " + "\n- ".join(evidence)
        spec.setdefault("defaultTransition", {"type": "fade", "durationInFrames": 15})
        for scene in filter(_concept_card, scenes):
            props = scene["props"]
            props.update(textAnimation="none", startAt=0)
            # Allow a quiet reading beat even when the recorded sentence is short.
            words = len((props["heading"] + " " + props["body"]).split())
            reading_frames = round(spec["fps"] * max(4, words / 3))
            scene["durationInFrames"] = max(scene["durationInFrames"], reading_frames)
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
    texts = sum(s.get("component") in TEXT_SCENES and not ("teach-lecture" in skills and _concept_card(s)) for s in scenes)
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


HUBS = {"loadbalancer", "router", "api"}  # these send to each target directly
EVENT_LABEL = re.compile(r"^(request|req|response|packet|call|turn)\b", re.I)
REPLY_LABEL = re.compile(r"^(?:(?:HTTP|JSON) )?(?:response|reply)(?: body)?$|^JSON$", re.I)


def _lecture_evidence(scenes: list[dict[str, Any]]) -> list[str]:
    """Flag diagrams that hide the example or represent a reply as an orphan tile."""
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
        if links and not props.get("exampleLines"):
            tables = [obj for obj in objects if obj.get("table")]
            if tables and all(obj.get("kind") != "table" for obj in tables):
                problems.append(f"Scene '{scene['id']}' keeps the example rows inside icons. "
                                "Show the rows on screen when the narration reads them.")
        connected = {link.get(key) for link in links for key in ("from", "to", "via")}
        orphan_replies = [obj["id"] for obj in objects if links and obj["id"] not in connected
                          and REPLY_LABEL.fullmatch(str(obj.get("label") or obj["id"]).strip())]
        if orphan_replies:
            problems.append(f"Scene '{scene['id']}' has detached replies {orphan_replies}. Show the result on the "
                            "arrow to its recipient or next to that recipient as readable text.")
    return problems


def _lint_iso(scenes: list[dict[str, Any]], *, lecture: bool = False) -> list[str]:
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
