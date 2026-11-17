"""What the video library contains, in LLM-friendly text.

Built from ``library/registry.json`` (scenes) and ``library/overlays.json`` (overlays), which
``npm run check:scenes`` regenerates. Reloaded automatically when those files change, so new or
promoted scenes show up without restarting the backend.

Used two ways by the planner:
- catalog mode: ``catalog_text(topic)``: relevant scenes only (topic filter), all in the prompt
- tools mode: ``search_scenes`` / ``scene_text`` / ``device_kinds`` / ``overlay_text`` as tools
"""

import json
import re
from typing import Any

from app.config import PROJECT_ROOT

REGISTRY = PROJECT_ROOT / "library" / "registry.json"
OVERLAYS = PROJECT_ROOT / "library" / "overlays.json"

# Always offered in catalog mode: the general teaching scenes that fit any subject.
CORE_SCENES = [
    "TitleScene", "ExplainScene", "DefinitionScene", "ExampleCardScene", "StepsScene", "BulletListScene",
    "ComparisonTableScene", "ChartScene", "FlowchartScene", "QuizScene", "SummaryScene",
]
# Words that mean the same topic (expands the search a little).
SYNONYMS = {
    "internet": "network wan packet globe router", "wifi": "wireless router waves network", "lan": "network lan local",
    "man": "city man network", "wan": "wan globe world network", "electricity": "circuit current battery bulb",
    "physics": "circuit field magnet waves", "data": "chart stat", "history": "timeline", "process": "steps flowchart cycle",
    "math": "equation chart", "maths": "equation chart", "security": "firewall lock hacker encryption", "code": "code",
    "programming": "code flowchart", "computer": "device computer hardware", "hardware": "device hardware 3d",
    "compare": "comparison venn", "difference": "comparison venn", "geography": "map globe",
}

_cache: dict[str, Any] = {"mtime": None}


def _type_of(schema: Any, defs: dict[str, Any], depth: int = 0) -> str:
    """Very short type summary of a JSON-schema node, e.g. `star|bus|ring`, `[{kind, label?}]`."""
    if isinstance(schema, list):
        return ", ".join(_type_of(s, defs, depth) for s in schema)
    if not isinstance(schema, dict):
        return "any"
    if "$ref" in schema:
        schema = defs.get(schema["$ref"].split("/")[-1], {})
    for key in ("anyOf", "oneOf"):
        if key in schema:
            return " or ".join(dict.fromkeys(_type_of(s, defs, depth) for s in schema[key]))
    if "enum" in schema:
        values = schema["enum"]
        return "<device kind>" if len(values) > 30 else "|".join(map(str, values))
    if "const" in schema:
        return json.dumps(schema["const"])
    t = schema.get("type")
    if t == "array":
        return f"[{_type_of(schema.get('prefixItems') or schema.get('items', {}), defs, depth + 1)}]"
    if t == "object" and "properties" in schema and depth < 3:
        req = set(schema.get("required", []))
        inner = ", ".join(f"{k}{'' if k in req else '?'}: {_type_of(v, defs, depth + 1)}" for k, v in schema["properties"].items())
        return "{" + inner + "}"
    return {"integer": "int", "number": "num", "boolean": "bool"}.get(t, t or "any")


def _fields(schema: dict[str, Any]) -> str:
    defs = schema.get("$defs", {})
    req = set(schema.get("required", []))
    return "; ".join(f"{k}{'' if k in req else '?'}: {_type_of(v, defs)}" for k, v in schema.get("properties", {}).items())


def _load() -> dict[str, Any]:
    mtime = (REGISTRY.stat().st_mtime, OVERLAYS.stat().st_mtime if OVERLAYS.exists() else 0)
    if _cache["mtime"] == mtime:
        return _cache
    scenes = {e["name"]: e for e in json.loads(REGISTRY.read_text())}
    overlays = {o["type"]: o for o in json.loads(OVERLAYS.read_text())} if OVERLAYS.exists() else {}
    kinds: list[str] = []

    def find(node: Any) -> None:
        nonlocal kinds
        if isinstance(node, dict):
            if len(node.get("enum", [])) > 30 and not kinds:
                kinds = node["enum"]
            for v in node.values():
                find(v)
        elif isinstance(node, list):
            for v in node:
                find(v)

    for e in scenes.values():
        find(e["propsSchema"])
    _cache.update(mtime=mtime, scenes=scenes, overlays=overlays, kinds=kinds)
    return _cache


def scene_names() -> list[str]:
    return list(_load()["scenes"])


def device_kinds() -> list[str]:
    return list(_load()["kinds"])


def scene_text(name: str) -> str:
    """Everything the LLM needs to use one scene: description, fields, example props."""
    e = _load()["scenes"].get(name)
    if not e:
        close = [n for n in scene_names() if name.lower().replace("scene", "") in n.lower()]
        return f"No scene named {name!r}." + (f" Did you mean: {', '.join(close)}?" if close else "")
    example = json.dumps(e.get("example", {}), separators=(",", ":"))
    staged = " (new, agent-made)" if e.get("staged") else ""
    return f"### {name}{staged}\n{e['description']}\nfields: {_fields(e['propsSchema'])}\nexample props: {example}"


def _words(text: str) -> set[str]:
    out = set()
    for w in re.findall(r"[a-z0-9]+", text.lower()):
        out.add(w)
        if len(w) > 3 and w.endswith("s"):
            out.add(w[:-1])
        out.update(SYNONYMS.get(w, "").split())
    return out


def search_scenes(query: str, limit: int = 10) -> list[tuple[str, str, float]]:
    """Scenes ranked by how well their name, tags and description match ``query``."""
    q = _words(query)
    ranked = []
    for name, e in _load()["scenes"].items():
        tags = _words(" ".join(e.get("tags", [])) + " " + re.sub(r"(?<!^)(?=[A-Z])", " ", name))
        desc = _words(e["description"])
        score = 3 * len(q & tags) + len(q & desc)
        if score:
            ranked.append((name, e["description"], score))
    ranked.sort(key=lambda x: -x[2])
    return ranked[:limit]


def catalog_text(topic: str | None = None, extra: int = 12) -> str:
    """Scene catalog for the prompt. With a topic: core teaching scenes + the best matches only."""
    names = scene_names()
    if topic:
        chosen = [n for n in CORE_SCENES if n in names]
        for name, _, score in search_scenes(topic, limit=extra + len(chosen)):
            if score >= 3 and name not in chosen:  # at least one tag / name match
                chosen.append(name)
            if len(chosen) >= len(CORE_SCENES) + extra:
                break
        names = chosen
    blocks = [scene_text(n) for n in names]
    head = f"<device kind> = one of: {', '.join(device_kinds())}\n\n" if any("<device kind>" in b for b in blocks) else ""
    return head + "\n\n".join(blocks)


def overlay_list() -> str:
    return ", ".join(_load()["overlays"]) or "(none)"


def overlay_text(kind: str) -> str:
    o = _load()["overlays"].get(kind)
    if not o:
        return f"No overlay {kind!r}. Available: {overlay_list()}"
    return f'overlay "{kind}": {{"type": "{kind}", ...}}\nfields: {_fields(o["propsSchema"])}'
