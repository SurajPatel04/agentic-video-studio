"""Word cues: a step happens when the narrator SAYS a word, not at a guessed fraction of the scene.

The planner may write ``"cue": "duplicates"`` on a step/action/message (instead of ``"at": 0.4``)
and ``"appearCue": "warehouse"`` on an object or link (instead of ``"appearAt"``). They resolve to
the timing fraction the scene contract expects:

- after TTS, from the real spoken word times (Deepgram word timings, scene frames), so a change
  lands on the word that names it;
- before audio exists (plan validation), from the word's position in the narration text.

Only fields that are 0-1 scene fractions in the registry are filled (IsoScene ``objects[].at`` is a
grid position and is never touched). The cue keys are removed, so the renderer sees plain fractions.
"""
import copy
import json
import re
from functools import cache
from typing import Any

from app.config import PROJECT_ROOT

REGISTRY = PROJECT_ROOT / "library" / "registry.json"
LEAD = 3  # frames: show the change just as the word starts
ORDERED_TRACKS = {
    "AnnotatedTextScene": {("steps",): True, ("diagram", "exampleLines"): False},
    "OutcomeComparisonScene": {("steps",): True},
    "WorkedExampleScene": {("stages",): True},
    "IsoScene": {("exampleLines",): False},
}


def _norm(word: str) -> str:
    return re.sub(r"[^a-z0-9]", "", word.lower())


@cache
def timing_paths() -> dict[str, frozenset[str]]:
    """{component: {".steps[].at", ".objects[].appearAt", ...}}: fields that are 0-1 scene fractions."""
    out: dict[str, set[str]] = {}

    def walk(schema: Any, path: str, found: set[str]) -> None:
        if not isinstance(schema, dict):
            return
        for key, sub in (schema.get("properties") or {}).items():
            if key in ("at", "appearAt") and isinstance(sub, dict) and sub.get("maximum") == 1:
                found.add(f"{path}.{key}")
            walk(sub, f"{path}.{key}", found)
        if "items" in schema:
            walk(schema["items"], path + "[]", found)
        for key in ("anyOf", "oneOf", "allOf"):
            for sub in schema.get(key) or []:
                walk(sub, path, found)

    try:
        entries = json.loads(REGISTRY.read_text())
    except (OSError, ValueError):
        return {}
    for entry in entries:
        found: set[str] = set()
        walk(entry.get("propsSchema"), "", found)
        if found:
            out[entry["name"]] = found
    return {k: frozenset(v) for k, v in out.items()}


def has_cues(spec: dict[str, Any]) -> bool:
    return '"cue"' in json.dumps(spec) or '"appearCue"' in json.dumps(spec)


def _find(tokens: list[str], cue: str, start: int) -> int | None:
    """Index of the first word of ``cue`` in ``tokens``, searching from ``start`` first (cues usually
    follow the narration's order), then from the beginning. A single word also matches its plural
    or stem ("warehouse" ~ "warehouses")."""
    want = [_norm(w) for w in cue.split() if _norm(w)]
    if not want:
        return None

    orders = (range(start, len(tokens)), range(start))
    for order in orders:
        for i in order:
            if tokens[i:i + len(want)] == want:
                return i
    # Prefer the actual word anywhere to a prefix such as /watches/w-104.
    if len(want) == 1 and len(want[0]) >= 4:
        for order in orders:
            for i in order:
                t = tokens[i]
                if len(t) >= 4 and (t.startswith(want[0]) or want[0].startswith(t)):
                    return i
    return None


def _fraction(scene: dict[str, Any], index: int, total: int) -> float:
    """When word ``index`` of ``total`` is spoken: real word times if the scene has them, else estimated."""
    voice = scene.get("voice") or {}
    words = voice.get("words") or []
    duration = scene.get("durationInFrames") or 0
    if words and duration and index < len(words):
        return max(0.0, min(0.97, (words[index]["s"] - LEAD) / duration))
    return round(0.05 + 0.85 * index / max(1, total), 3)


def resolve_scene(scene: dict[str, Any], *, issues: dict[str, str] | None = None) -> list[str]:
    """Replace cues in one scene with fractions (in place). Returns the cues not found in the narration."""
    allowed = timing_paths().get(str(scene.get("component")), frozenset())
    words = (scene.get("voice") or {}).get("words") or []
    script_tokens = [token for w in str((scene.get("narration") or {}).get("text", "")).split()
                     if (token := _norm(w))]
    tokens = [_norm(w["t"]) for w in words] if words else script_tokens
    missing: list[str] = []
    unresolved = set()
    # Objects, arrows, annotations and written lines can refer to the same utterance.
    # Advance only within a track so traversal order cannot change another track's timing.
    cursors: dict[str, int] = {}

    def visit(node: Any, path: str, address: str, position: float = 0.0) -> None:
        if isinstance(node, list):
            for index, item in enumerate(node):
                visit(item, path + "[]", f"{address}[{index}]", (index + 1) / (len(node) + 1))
            return
        if not isinstance(node, dict):
            return
        for cue_key, field in (("cue", "at"), ("appearCue", "appearAt")):
            if cue_key not in node:
                continue
            cue = node.pop(cue_key)
            # "cue" on an object whose "at" is a grid position means "appear when said"
            target = field if f"{path}.{field}" in allowed else "appearAt" if f"{path}.appearAt" in allowed else None
            if target is None:
                continue
            track = address.rsplit("[", 1)[0] if address.endswith("]") else path
            i = _find(tokens, cue, cursors.get(track, 0)) if isinstance(cue, str) else None
            if i is None:
                missing.append(str(cue))
                if issues is not None:
                    issues[f"{address}.{cue_key}"] = f"Use a distinct phrase from the narration for cue {cue!r}."
                script_index = _find(script_tokens, cue, 0) if words and isinstance(cue, str) else None
                if target not in node:
                    if target == "at":
                        unresolved.add(id(node))
                    if script_index is None:
                        node[target] = position
                    else:
                        node[target] = _fraction({}, script_index, len(script_tokens))
                continue
            cursors[track] = i + 1
            node[target] = _fraction(scene, i, len(tokens))
        for key, value in node.items():
            visit(value, f"{path}.{key}", f"{address}.{key}", position)

    visit(scene.get("props"), "", "")
    if not unresolved:
        return missing
    # Keep the estimated plan valid enough to check other fields. A missing cue is
    # still rejected by the planner using its original address and phrase.
    for track, strict in ORDERED_TRACKS.get(scene.get("component"), {}).items():
        items = scene.get("props")
        for key in track:
            items = items.get(key) if isinstance(items, dict) else None
        if not isinstance(items, list) or not all(isinstance(item, dict) for item in items):
            continue
        times = [item.get("at") for item in items]
        if all(type(at) in (float, int) for at in times) and all(
            left < right or (not strict and left == right) for left, right in zip(times, times[1:])
        ):
            continue
        anchors = [(-1, 0.0), *((i, item["at"]) for i, item in enumerate(items)
                               if id(item) not in unresolved and type(item.get("at")) in (float, int)),
                   (len(items), 1.0)]
        for (left, start), (right, end) in zip(anchors, anchors[1:]):
            for i in range(left + 1, right):
                if id(items[i]) in unresolved:
                    items[i]["at"] = start + (end - start) * (i - left) / (right - left)
    return missing


def resolve(spec: dict[str, Any], *, inplace: bool = False,
            issues: list[str] | None = None) -> tuple[dict[str, Any], dict[str, list[str]]]:
    """Resolve every scene's cues. Returns (spec, {scene id: cues not found in its narration})."""
    if not inplace:
        spec = copy.deepcopy(spec)
    missing = {}
    for index, scene in enumerate(spec.get("scenes", [])):
        if isinstance(scene, dict):
            details = {} if issues is not None else None
            lost = resolve_scene(scene, issues=details)
            if lost:
                missing[str(scene.get("id"))] = lost
            if details and issues is not None:
                issues.extend(f"scenes[{index}] ({scene.get('id')}).props{path}: {message}"
                              for path, message in details.items())
    return spec, missing
