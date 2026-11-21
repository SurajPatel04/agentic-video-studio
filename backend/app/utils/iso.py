"""Lecture continuations keep the same picture across a scene cut.

The planner writes a scene with ``"continue": true`` and lists only what is new (objects, links,
steps) plus ``"remove": [ids]``. ``expand_continuations`` turns it into a complete IsoScene:

- objects and links of the previous IsoScene are carried over with their END state (status, colour
  and label changed by its steps; hidden objects dropped) and ``enter: "none"`` (no drop-in again);
- every scene of the chain gets the same set of objects (ones not on screen yet / any more as
  ``ghost: true``), so the layout is identical and nothing jumps;
- the transition into a continued scene is a cut (same picture, nothing to fade).

Cheap: those scenes cost only their changes in LLM output. Idempotent: expanded scenes are marked
``continued: true`` and lose ``continue`` / ``remove``.

OutcomeComparisonScene keeps its existing two-row layout and carries the final visible rows,
results and emphasis. The next scene supplies only its new steps.
"""

import copy
from typing import Any

CARRY = ("status", "color", "label", "highlight")


def _end_state(scene: dict[str, Any]) -> tuple[list[dict], list[dict]]:
    """Objects (after every step: status / colour / label applied, hidden ones removed) and links."""
    props = scene.get("props") or {}
    objs = {o["id"]: copy.deepcopy(o) for o in props.get("objects") or [] if isinstance(o, dict) and "id" in o and not o.get("ghost")}
    for st in sorted((s for s in props.get("steps") or [] if isinstance(s, dict)), key=lambda s: s.get("at", 0)):
        o = objs.get(st.get("target"))
        if o is None:
            continue
        for key in CARRY:
            if key in st:
                o[key] = st[key]
        if "badge" in st or "lookup" in st:
            key = "badge" if "badge" in st else "lookup"
            o.pop("lookup" if key == "badge" else "badge", None)
            o[key] = copy.deepcopy(st[key])
        if st.get("hide") is True:
            o["_hidden"] = True
        elif st.get("hide") is False:
            o.pop("_hidden", None)
    alive = {i: o for i, o in objs.items() if not o.pop("_hidden", False)}
    links = [copy.deepcopy(l) for l in props.get("links") or [] if isinstance(l, dict) and l.get("from") in alive
             and l.get("to") in alive and ("via" not in l or l["via"] in alive)]
    return list(alive.values()), links


def _continue_comparison(previous: dict, following: dict) -> dict:
    """Reuse the board and start from the state at the end of its previous narration."""
    steps = previous.get("steps", [])
    if not isinstance(steps, list) or any(
        not isinstance(step, dict) or type(step.get("row")) is not int or step["row"] not in (0, 1) for step in steps
    ):
        raise ValueError("The previous comparison's steps must each specify row 0 or 1")
    on_cue = previous.get("resultsOnCue", any(step.get("reveal") is True for step in steps))
    start = copy.deepcopy(previous.get("start"))
    if start is None:
        rows = previous.get("rows", [{}, {}])
        if not isinstance(rows, list) or len(rows) != 2 or not all(isinstance(row, dict) for row in rows):
            raise ValueError("The previous comparison needs two rows")
        start = {"rows": [{"shown": not row.get("hidden", False), "revealed": not on_cue}
                          for row in rows]}
    elif not isinstance(start, dict) or not isinstance(start.get("rows"), list) or len(start["rows"]) != 2 or not all(
        isinstance(row, dict) and type(row.get("shown")) is bool and type(row.get("revealed")) is bool for row in start["rows"]
    ):
        raise ValueError("The previous comparison's start state needs two shown and revealed flags")
    for step in steps:
        row = start["rows"][step["row"]]
        row["shown"] = True
        row["revealed"] = row["revealed"] or step.get("reveal") is True
        start["active"] = {key: step[key] for key in ("row", "part", "resultFocus", "explanation") if key in step}
    return {**copy.deepcopy(previous), "start": start, "steps": following.get("steps", [])}


def object_references(props: dict):
    """Yield the field path and ID for explicit object references in a diagram."""
    for track, fields in (("links", ("from", "to", "via")), ("steps", ("target",))):
        items = props.get(track)
        if not isinstance(items, list):
            continue
        for i, item in enumerate(items):
            if isinstance(item, dict):
                for field in fields:
                    if isinstance(item.get(field), str):
                        yield f"{track}[{i}].{field}", item[field]


def expand_continuations(spec: dict[str, Any]) -> dict[str, Any]:
    scenes = spec.get("scenes") or []
    chain: list[int] = []
    chains: list[list[int]] = []
    last_iso: dict | None = None
    for i, s in enumerate(scenes):
        props = s.get("props") if isinstance(s.get("props"), dict) else None
        if s.get("component") == "OutcomeComparisonScene" and props and props.get("continue") is True:
            if i == 0 or scenes[i - 1].get("component") != s["component"]:
                raise ValueError("An OutcomeComparisonScene continuation needs an OutcomeComparisonScene immediately before it")
            if props.keys() - {"continue", "steps"}:
                raise ValueError("Supply only continue and new steps for an OutcomeComparisonScene continuation")
            s["props"] = _continue_comparison(scenes[i - 1].get("props") or {}, props)
            s["transition"] = {"type": "none"}
        cont = s.get("component") == "IsoScene" and props is not None and props.get("continue") is True
        if cont and chain:
            prev = scenes[chain[-1]]
            objs, links = _end_state(prev)
            for o in objs:
                o["enter"] = "none"
                o.pop("appearAt", None)
                o.pop("appearCue", None)
            for l in links:
                l["enter"] = "none"
                l.pop("appearAt", None)
                l.pop("appearCue", None)
            removed = set(props.get("remove") or [])
            new_objs = [o for o in props.get("objects") or [] if isinstance(o, dict)]
            new_ids = {o.get("id") for o in new_objs}
            kept = [o for o in objs if o["id"] not in removed and o["id"] not in new_ids]  # a re-listed id replaces the old one
            ids = {o["id"] for o in kept} | new_ids
            new_links = [l for l in props.get("links") or [] if isinstance(l, dict)]
            pairs = {(l.get("from"), l.get("to")) for l in new_links}
            kept_links = [l for l in links if l["from"] in ids and l["to"] in ids
                          and ("via" not in l or l["via"] in ids) and (l["from"], l["to"]) not in pairs]
            props["objects"] = kept + new_objs
            props["links"] = kept_links + new_links
            props.setdefault("steps", [])
            for k in ("eyebrow", "title", "subtitle"):  # same picture, same heading unless it changes
                if k not in props and k in (prev.get("props") or {}):
                    props[k] = prev["props"][k]
            previous_note = prev["props"].get("sideNote")
            if previous_note and "until" not in previous_note and not {"sideNote", "exampleLines", "points"} & props.keys():
                props["sideNote"] = {**previous_note, "at": 0}
                props["sideNote"].pop("cue", None)
            previous_lines = (prev.get("props") or {}).get("exampleLines")
            if previous_lines and "exampleLines" not in props and "points" not in props:
                props["exampleLines"] = [{"text": line["text"], "at": 0} for line in previous_lines
                                         if isinstance(line, dict) and "text" in line]
            props.pop("continue", None)
            props.pop("remove", None)
            props["continued"] = True
            s["transition"] = {"type": "none"}
            chain.append(i)
            last_iso = s
            continue
        if props is not None and s.get("component") == "IsoScene":
            if cont and last_iso is not None and isinstance(objects := props.get("objects", []), list):
                # After a cutaway, rebuild only the explicitly referenced actors. Keep the normal
                # scene transition and current links rather than extending the previous board.
                present = {obj.get("id") for obj in objects if isinstance(obj, dict) and isinstance(obj.get("id"), str)}
                missing = {oid for _, oid in object_references(props)} - present - set(props.get("remove") or [])
                if missing:
                    previous, _ = _end_state(last_iso)
                    for obj in previous:
                        if obj["id"] in missing:
                            obj.pop("appearAt", None)
                            obj.pop("appearCue", None)
                            objects.append({**obj, "enter": "none"})
                    props["objects"] = objects
            props.pop("continue", None)
            props.pop("remove", None)
            last_iso = s
        if len(chain) > 1:
            chains.append(chain)
        chain = [i] if s.get("component") == "IsoScene" else []
    if len(chain) > 1:
        chains.append(chain)

    # same objects (as ghosts where absent) in every scene of a chain -> identical layout
    for c in chains:
        everyone: dict[str, dict] = {}
        for i in c:
            for o in scenes[i]["props"]["objects"]:
                everyone.setdefault(o["id"], o)
        for i in c:
            props = scenes[i]["props"]
            present = {o["id"] for o in props["objects"]}
            for oid, o in everyone.items():
                if oid not in present:
                    ghost = {k: o[k] for k in ("id", "kind", "at", "z", "size", "count") if k in o}
                    if "status" in o:
                        ghost["status"] = o["status"]
                    props["objects"].append({**ghost, "ghost": True})
    return spec


PAPER_SCENES = {"IsoScene", "ScreenScene", "PhoneScene", "TerminalScene", "EditorScene", "ChatScene", "FormScene",
                "QueryScene", "PipelineScene", "PacketScene", "ArrayScene", "StackScene", "HashScene", "TreeScene",
                "GraphScene", "LinkedListScene", "EventLoopScene", "PlotScene", "LiveChartScene"}
EXT = {"python": "py", "javascript": "js", "typescript": "ts", "java": "java", "go": "go", "ruby": "rb", "bash": "sh",
       "shell": "sh", "sql": "sql", "html": "html", "css": "css", "c": "c", "cpp": "cpp", "c++": "cpp", "rust": "rs", "php": "php"}


def paper_code_scenes(spec: dict[str, Any]) -> dict[str, Any]:
    """In a paper-style video, a dark CodeScene would look like another video: show it as an EditorScene
    (same code, highlighted lines light up one after another). Other videos are left alone."""
    scenes = spec.get("scenes") or []
    if not any(s.get("component") in PAPER_SCENES for s in scenes):
        return spec
    for s in scenes:
        props = s.get("props")
        if s.get("component") != "CodeScene" or not isinstance(props, dict):
            continue
        code = str(props.get("code") or "").rstrip("\n")
        n = len(code.split("\n"))
        if not code or n > 22:
            continue  # too long for the editor: keep the original
        lines = [ln for ln in props.get("highlightLines") or [] if isinstance(ln, int) and 1 <= ln <= n][:6]
        lang = str(props.get("language") or "python").lower()
        filename = props.get("filename") or f"main.{EXT.get(lang, 'txt')}"
        step = 0.6 / max(1, len(lines))
        editor: dict[str, Any] = {"filename": str(filename)[:40], "code": code,
                                  "actions": [{"at": round(0.2 + k * step, 3), "do": "highlight", "line": ln} for k, ln in enumerate(lines)]}
        for key in ("title", "eyebrow"):
            if props.get(key):
                editor[key] = str(props[key])[:70 if key == "title" else 40]
        s["component"], s["props"] = "EditorScene", editor
    return spec
