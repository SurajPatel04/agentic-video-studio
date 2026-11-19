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

    for order in (range(start, len(tokens)), range(start)):
        for i in order:
            if tokens[i:i + len(want)] == want:
                return i
        # Prefer the actual word to a prefix such as /watches/w-104.
        if len(want) == 1 and len(want[0]) >= 4:
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


def resolve_scene(scene: dict[str, Any]) -> list[str]:
    """Replace cues in one scene with fractions (in place). Returns the cues not found in the narration."""
    allowed = timing_paths().get(str(scene.get("component")), frozenset())
    words = (scene.get("voice") or {}).get("words") or []
    tokens = [_norm(w["t"]) for w in words] if words else \
        [_norm(w) for w in str((scene.get("narration") or {}).get("text", "")).split()]
    tokens = [t for t in tokens if t] if not words else tokens
    missing: list[str] = []
    # Objects, arrows, annotations and written lines can refer to the same utterance.
    # Advance only within a track so traversal order cannot change another track's timing.
    cursors: dict[str, int] = {}

    def visit(node: Any, path: str) -> None:
        if isinstance(node, list):
            for item in node:
                visit(item, path + "[]")
            return
        if not isinstance(node, dict):
            return
        for cue_key, field in (("cue", "at"), ("appearCue", "appearAt")):
            if cue_key not in node:
                continue
            cue = node.pop(cue_key)
            # "cue" on an object whose "at" is a grid position means "appear when said"
            target = field if f"{path}.{field}" in allowed else "appearAt" if f"{path}.appearAt" in allowed else None
            if target is None or not isinstance(cue, str):
                continue
            i = _find(tokens, cue, cursors.get(path, 0))
            if i is None:
                missing.append(cue)
                node.setdefault(target, 0.5)  # keep it valid; the planner is told the cue is not in the narration
                continue
            cursors[path] = i + 1
            node[target] = _fraction(scene, i, len(tokens))
        for key, value in node.items():
            visit(value, f"{path}.{key}")

    visit(scene.get("props"), "")
    return missing


def resolve(spec: dict[str, Any], *, inplace: bool = False) -> tuple[dict[str, Any], dict[str, list[str]]]:
    """Resolve every scene's cues. Returns (spec, {scene id: cues not found in its narration})."""
    if not inplace:
        spec = copy.deepcopy(spec)
    missing = {}
    for scene in spec.get("scenes", []):
        if isinstance(scene, dict):
            lost = resolve_scene(scene)
            if lost:
                missing[str(scene.get("id"))] = lost
    return spec, missing
