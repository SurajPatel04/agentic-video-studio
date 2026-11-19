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
    "TitleScene", "ExplainScene", "DefinitionScene", "ExampleCardScene", "AnnotatedTextScene", "WorkedExampleScene", "StepsScene", "BulletListScene",
    "ComparisonTableScene", "OutcomeComparisonScene", "ChartScene", "FlowchartScene", "QuizScene", "SummaryScene",
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
        return _long_enum_label(values) if len(values) > 30 else "|".join(map(str, values))
    if "const" in schema:
        return json.dumps(schema["const"])
    t = schema.get("type")
    if t == "array":
        return f"[{_type_of(schema.get('prefixItems') or schema.get('items', {}), defs, depth + 1)}]"
    if t == "object" and "properties" in schema and depth < 3:
        req = set(schema.get("required", []))
        inner = ", ".join(f"{k}{'' if k in req else '?'}: {_type_of(v, defs, depth + 1)}" for k, v in schema["properties"].items())
        return "{" + inner + "}"
    name = {"integer": "int", "number": "num", "boolean": "bool"}.get(t, t or "any")
    if t in ("integer", "number"):  # show limits, e.g. num 300..1600, so the LLM doesn't guess
        lo, hi = schema.get("minimum", schema.get("exclusiveMinimum")), schema.get("maximum", schema.get("exclusiveMaximum"))
        lo = None if lo is not None and lo <= -1e9 else lo  # zod int() adds +-MAX_SAFE_INTEGER: not a real limit
        hi = None if hi is not None and hi >= 1e9 else hi
        if lo is not None or hi is not None:
            name += f" {'' if lo is None else f'{lo:g}'}..{'' if hi is None else f'{hi:g}'}"
    return name


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
    long_enums: list[list[str]] = []

    def find(node: Any) -> None:
        if isinstance(node, dict):
            values = node.get("enum", [])
            if len(values) > 30 and values not in long_enums:
                long_enums.append(values)
            for v in node.values():
                find(v)
        elif isinstance(node, list):
            for v in node:
                find(v)

    for e in scenes.values():
        find(e["propsSchema"])
    # two different long lists: 2D/3D devices (DeviceGridScene, ConnectionScene ...) and paper iso objects (IsoScene)
    kinds = next((v for v in long_enums if "smartwatch" in v), [])
    iso = next((v for v in long_enums if "tile" in v and v is not kinds), [])
    _cache.update(mtime=mtime, scenes=scenes, overlays=overlays, kinds=kinds, iso=iso)
    return _cache


def scene_names() -> list[str]:
    return list(_load()["scenes"])


def device_kinds() -> list[str]:
    return list(_load()["kinds"])


def iso_kinds() -> list[str]:
    """Object kinds of IsoScene (paper iso objects: server, tv, podcastbooth, tile ...)."""
    return list(_load()["iso"])


def _long_enum_label(values: list) -> str:
    c = _load()
    if values == c["kinds"]:
        return "<device kind>"
    if values == c["iso"]:
        return "<iso kind>"
    return "|".join(map(str, values))  # any other long list is shown in full


def _mentions(text: str, kind: str) -> bool:
    return re.search(rf"(?<![a-z]){re.escape(kind)}(?![a-z])", text) is not None


def kind_legend(*texts: str, known: str = "") -> str:
    """What <device kind> / <iso kind> mean, for the scene texts that use them (once each).

    ``known``: the teaching guides already in the prompt. Iso objects they describe are not listed again
    (the iso-diagrams guide explains ~all of them with their meaning); only the ones they miss are named,
    and without any guide the whole list is given. Wrong names get "did you mean" from the validator."""
    joined = "\n".join(texts)
    out = []
    if "<device kind>" in joined:
        out.append(f"<device kind> = one of: {', '.join(device_kinds())}")
    if "<iso kind>" in joined:
        known = known.lower()
        missing = [k for k in iso_kinds() if not _mentions(known, k)]
        if len(missing) == len(iso_kinds()):
            out.append(f"<iso kind> = one of: {', '.join(missing)}")
        else:
            out.append("<iso kind> = an object kind named in the iso-diagrams guide" + (f"; also: {', '.join(missing)}" if missing else ""))
    return "\n".join(out) + "\n\n" if out else ""


# everyday words -> the section names used in the iso-diagrams guide
ISO_SYNONYMS = {
    "money": "finance", "pay": "finance", "payment": "finance", "bank": "finance", "price": "retail",
    "election": "politics", "vote": "politics", "voting": "politics", "government": "politics", "policy": "politics",
    "news": "media newsroom", "journalism": "newsroom", "journalist": "newsroom", "press": "pr newsroom",
    "broadcast": "media tower", "music": "audio", "sound": "audio", "podcast": "audio podcasts",
    "school": "education", "class": "education", "learn": "education", "student": "education",
    "health": "health", "medicine": "health", "doctor": "health", "emergency": "ambulance health", "shopping": "retail", "store": "retail",
    "travel": "transport", "delivery": "transport", "network": "tech", "internet": "tech", "data": "tech",
    "ai": "ai", "social": "socialpost scrollingfeed", "video": "videoplayer livestream", "film": "cinema",
}


def find_iso_objects(query: str, limit: int = 8) -> list[tuple[str, str]]:
    """IsoScene object kinds for an idea ("radio studio", "money", "election"): [(kind, meaning)].
    Matches the kind name, its meaning in the iso-diagrams guide ("tower (broadcast)") and its section
    ("Finance", "Politics"), plus a few everyday synonyms."""
    guide_path = PROJECT_ROOT / "skills" / "iso-diagrams" / "SKILL.md"
    guide = guide_path.read_text().lower() if guide_path.exists() else ""
    words = [w for w in re.findall(r"[a-z0-9]+", query.lower()) if len(w) > 1]
    words += [x for w in list(words) for x in ISO_SYNONYMS.get(w, "").split()]
    out = []
    for kind in iso_kinds():
        meaning = section = ""
        for line in guide.splitlines():
            m = re.search(rf"(?<![a-z]){re.escape(kind)}(?![a-z])\s*(\(([^)]*)\))?", line)
            if m:
                meaning = m.group(2) or ""
                labels = re.findall(r"([a-z][a-z ,]*):", line[:m.start()])  # nearest "Section:" before the kind
                section = labels[-1].strip(" -,") if labels else ""
                break
        hay = re.findall(r"[a-z0-9]+", f"{meaning} {section}")
        score = 0
        for w in words:
            if w == kind:
                score += 4
            elif kind.startswith(w) or w.startswith(kind) or w in kind.split("-"):
                score += 2
            elif any(h.startswith(w) or w.startswith(h) for h in hay if len(h) > 2):
                score += 1
        if score:
            out.append((score, kind, ", ".join(x for x in (meaning, section) if x)))
    out.sort(key=lambda x: (-x[0], x[1]))
    return [(k, d) for _, k, d in out[:limit]]


FILLER_FIELDS = ("footer", "caption")


def filler_fields(name: str) -> list[str]:
    """Footer/caption fields whose default is example text (e.g. "Line numbers and highlights draw
    attention…"). Fine in previews, wrong in a real video: the planner blanks them unless it sets them."""
    e = _load()["scenes"].get(name)
    props = (e or {}).get("propsSchema", {}).get("properties", {})
    return [k for k in FILLER_FIELDS if isinstance((props.get(k) or {}).get("default"), str) and props[k]["default"]]


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


def catalog_text(topic: str | None = None, extra: int = 12, known: str = "") -> str:
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
    return kind_legend(*blocks, known=known) + "\n\n".join(blocks)


def overlay_list() -> str:
    return ", ".join(_load()["overlays"]) or "(none)"


def overlay_text(kind: str) -> str:
    o = _load()["overlays"].get(kind)
    if not o:
        return f"No overlay {kind!r}. Available: {overlay_list()}"
    return f'overlay "{kind}": {{"type": "{kind}", ...}}\nfields: {_fields(o["propsSchema"])}'
