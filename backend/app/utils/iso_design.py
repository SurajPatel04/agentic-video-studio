"""Design missing IsoScene artwork and publish validated, immutable assets for reuse.

Order for new tiles: built-in iso art, Lucide or React Icons, then saved or custom designs.
The designer can select a matching icon or describe 3D shapes (boxes, cylinders, spheres, flat
polygons); this module projects them at the house 30-degree angle, shades them like the built-in
objects and fits them into the 100 x 100 ``faces`` the renderer draws.
"""
import difflib
import json
import logging
import math
import os
import re
import tempfile
from functools import cache
from typing import Annotated, Literal

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field, ValidationError, model_validator

from app.config import PROJECT_ROOT, settings
from app.utils import catalog, skills
from app.utils.llm import get_llm, text_of, usage_of

ROOT = PROJECT_ROOT / "library/iso/ai-designed"
ICONS = PROJECT_ROOT / "library/lucide-icons.json"
REACT_ICONS = PROJECT_ROOT / "library/react-icons.json"
HINT_LIMIT = 20  # saved designs named in the prompt; find_iso_objects finds the rest
MAX_FACES = 48
log = logging.getLogger(__name__)
Coordinate = Annotated[int, Field(strict=True, ge=2, le=98)]
Name = Annotated[str, Field(min_length=1, max_length=64)]
Color = Literal["cream", "lavender", "peach", "mint", "sky", "butter", "rose", "teal", "coral", "slate", "ink"]
Unit = Annotated[float, Field(ge=-30, le=30)]
Size = Annotated[float, Field(gt=0, le=30)]
ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")

# Same light model as the built-in objects (rendering/src/iso/iso.ts `faces`).
TOP, LEFT, RIGHT = 0.38, 0.08, -0.1


class Face(BaseModel):
    fill: Color
    shade: float = Field(default=0, ge=-0.5, le=0.6)
    points: list[tuple[Coordinate, Coordinate]] = Field(min_length=3, max_length=32)

    @model_validator(mode="after")
    def visible(self):
        if _area(self.points) < 2:
            raise ValueError("Face has no visible area")
        return self


class Part(BaseModel):
    """One 3D shape. Units: a footprint about 10 x 10, z up; the result is scaled to fit."""
    shape: Literal["box", "cylinder", "sphere", "poly"]
    color: Color
    at: tuple[Unit, Unit, Unit] | None = None  # box: lowest corner; cylinder: base centre; sphere: centre
    size: tuple[Size, Size, Size] | None = None  # box: [x, y, z]
    radius: Size | None = None
    height: Size | None = None  # cylinder length along its axis
    axis: Literal["x", "y", "z"] = "z"
    points: list[tuple[Unit, Unit, Unit]] | None = Field(default=None, min_length=3, max_length=24)  # poly

    @model_validator(mode="after")
    def complete(self):
        need = {"box": ("at", "size"), "cylinder": ("at", "radius", "height"), "sphere": ("at", "radius"),
                "poly": ("points",)}[self.shape]
        missing = [k for k in need if getattr(self, k) is None]
        if missing:
            raise ValueError(f"{self.shape} needs {', '.join(missing)}")
        return self


class Drawing(BaseModel):
    """A saved design: projected ``faces`` (what the renderer draws) and the source ``parts``,
    or just ``icon`` when the designer decided a Lucide icon shows the concept better."""
    aliases: list[Name] = Field(default_factory=list, max_length=5)
    faces: list[Face] = Field(default_factory=list, max_length=MAX_FACES)
    parts: list[Part] = Field(default_factory=list, max_length=24)
    icon: str | None = None

    @model_validator(mode="after")
    def fills_frame(self):
        if self.icon:
            return self
        if len(self.faces) < 2:
            raise ValueError("A drawing needs at least 2 visible faces")
        xs, ys = zip(*(point for face in self.faces for point in face.points))
        if max(xs) - min(xs) < 30 or max(ys) - min(ys) < 30:
            raise ValueError("Enlarge the artwork to remain legible in a small diagram")
        return self


class Reply(BaseModel):
    """What the designer returns: shapes to draw, a catalog icon, or skip."""
    aliases: list[Name] = Field(default_factory=list, max_length=5)
    parts: list[Part] = Field(default_factory=list, max_length=24)
    icon: str | None = None
    skip: bool = False

    @model_validator(mode="after")
    def one_answer(self):
        if not (self.parts or self.icon or self.skip):
            raise ValueError('Return "parts", or "icon", or "skip": true')
        if self.icon and self.icon not in icon_names() and self.icon not in react_icon_names():
            near = find_react_icons(self.icon, 4) if self.icon.startswith("react-icons/") else \
                difflib.get_close_matches(self.icon, icon_names(), n=4, cutoff=0.6)
            raise ValueError(f'unknown icon "{self.icon}"' + (f"; did you mean {', '.join(near)}?" if near else ""))
        return self


# ---- projection -------------------------------------------------------------------------------

C30 = math.cos(math.pi / 6)
VIEW = (1.0, 1.0, 1.0)  # towards the viewer: the top, +x and +y sides are the visible ones
SPHERE = 1 / math.sqrt(2 / 3)  # a unit length on screen per unit radius (isometric scale)


def _screen(p):
    x, y, z = p
    return ((x - y) * C30, (x + y) * 0.5 - z)


def _area(points):
    pairs = zip(points, points[1:] + points[:1])
    return abs(sum(x * v - u * y for (x, y), (u, v) in pairs)) / 2


def _hull(points):
    pts = sorted(set(points))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def _shade_of(normal):
    """Light a flat face by the side it faces most: top, left (+y) or right (+x)."""
    ax = max(range(3), key=lambda i: abs(normal[i]))
    return (RIGHT, LEFT, TOP)[ax] if normal[ax] >= 0 else (RIGHT, LEFT, TOP)[ax] - 0.12


def _normal(points):
    n = [0.0, 0.0, 0.0]
    for a, b in zip(points, points[1:] + points[:1]):
        n[0] += (a[1] - b[1]) * (a[2] + b[2])
        n[1] += (a[2] - b[2]) * (a[0] + b[0])
        n[2] += (a[0] - b[0]) * (a[1] + b[1])
    return n


def _circle(centre, r, axis, n=16):
    i = "xyz".index(axis)
    u, v = [j for j in range(3) if j != i]
    out = []
    for k in range(n):
        t = 2 * math.pi * k / n
        p = list(centre)
        p[u] += r * math.cos(t)
        p[v] += r * math.sin(t)
        out.append(tuple(p))
    return out


def _faces_of(part):
    """Visible (screen polygon, color, shade) of one part, back to front, plus its depth."""
    c = part.color
    if part.shape == "box":
        (x, y, z), (w, d, h) = part.at, part.size
        X, Y, Z = x + w, y + d, z + h
        faces = [([(x, Y, z), (X, Y, z), (X, Y, Z), (x, Y, Z)], LEFT),
                 ([(X, y, z), (X, Y, z), (X, Y, Z), (X, y, Z)], RIGHT),
                 ([(x, y, Z), (X, y, Z), (X, Y, Z), (x, Y, Z)], TOP)]
        out = [([_screen(p) for p in pts], c, s) for pts, s in faces]
        return out, x + w / 2 + y + d / 2 + z + h / 2
    if part.shape == "cylinder":
        i = "xyz".index(part.axis)
        base = list(part.at)
        end = list(part.at)
        end[i] += part.height
        a, b = _circle(base, part.radius, part.axis), _circle(end, part.radius, part.axis)
        cap, side = (b, (RIGHT, LEFT, TOP)[i]) if VIEW[i] > 0 else (a, 0)
        body = _hull([_screen(p) for p in a + b])
        body_shade = LEFT if part.axis == "z" else (LEFT if part.axis == "x" else RIGHT)
        out = [(body, c, body_shade), ([_screen(p) for p in cap], c, side)]
        return out, sum(base) + part.height / 2
    if part.shape == "sphere":
        cx, cy = _screen(part.at)
        r = part.radius * SPHERE
        ring = [(cx + r * math.cos(t), cy + r * math.sin(t)) for t in (2 * math.pi * k / 20 for k in range(20))]
        glint = [(cx - r * 0.35 + r * 0.28 * math.cos(t), cy - r * 0.35 + r * 0.2 * math.sin(t))
                 for t in (2 * math.pi * k / 10 for k in range(10))]
        return [(ring, c, 0.05), (glint, c, 0.5)], sum(part.at)
    pts = list(part.points)
    depth = sum(map(sum, pts)) / len(pts)
    return [([_screen(p) for p in pts], c, _shade_of(_normal(pts)))], depth + 0.01


def project(parts) -> list[Face]:
    """Draw ``parts`` back to front and fit them into the 100 x 100 frame (4-unit margin)."""
    drawn = []
    for order, part in enumerate(parts):
        faces, depth = _faces_of(part)
        drawn += [(depth, order, j, f) for j, f in enumerate(faces)]
    drawn.sort(key=lambda d: d[:3])
    pts = [p for *_, (poly, _, _) in drawn for p in poly]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    span = max(max(xs) - min(xs), max(ys) - min(ys)) or 1
    scale = 92 / span
    ox = 50 - (max(xs) + min(xs)) / 2 * scale
    oy = 50 - (max(ys) + min(ys)) / 2 * scale
    out = []
    for *_, (poly, fill, shade) in drawn:
        points = []
        for x, y in poly:
            p = (min(98, max(2, round(ox + x * scale))), min(98, max(2, round(oy + y * scale))))
            if not points or points[-1] != p:
                points.append(p)
        if len(points) > 1 and points[0] == points[-1]:
            points.pop()
        if len(points) >= 3 and _area(points) >= 2:
            out.append(Face(fill=fill, shade=round(shade, 2), points=points[:32]))
    if len(out) > MAX_FACES:
        raise ValueError(f"Too many visible faces ({len(out)}); use at most ~12 parts")
    return out


# ---- library ----------------------------------------------------------------------------------

PALETTE = dict(cream="#f2e9da", lavender="#cdc3ee", peach="#f7c6a3", mint="#b9e2c7",
               sky="#b8d6f3", butter="#f4da93", rose="#f3b9c6", teal="#b0dfda",
               coral="#f4a596", slate="#d2d5de", ink="#2b2833")


def _tint(color, amount):
    """``shade`` from rendering/src/iso/iso.ts: towards white (> 0) or black (< 0)."""
    rgb = [int(color[i:i + 2], 16) for i in (1, 3, 5)]
    target = 255 if amount > 0 else 0
    return "#" + "".join(f"{round(v + (target - v) * abs(amount)):02x}" for v in rgb)


def svg(art: Drawing) -> str:
    polygons = []
    for face in art.faces:
        points = " ".join(f"{x},{y}" for x, y in face.points)
        fill = PALETTE[face.fill] if face.fill == "ink" else _tint(PALETTE[face.fill], face.shade)
        polygons.append(f'<polygon fill="{fill}" points="{points}"/>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" '
            'stroke="#2b2833" stroke-width="1.8" stroke-linejoin="round">' + "".join(polygons) + "</svg>")


def save_preview(key, art):
    path = ROOT / f"{key}.svg"
    if path.exists() or art.icon:
        return
    with tempfile.NamedTemporaryFile(dir=ROOT, mode="w", delete=False) as temp:
        temp.write(svg(art))
    os.replace(temp.name, path)


def inventory():
    return {path.stem: Drawing.model_validate_json(path.read_text()) for path in sorted(ROOT.glob("*.json"))}


@cache
def icon_names() -> frozenset[str]:
    """Lucide icon names (exported by rendering/scripts/check-scenes.mjs)."""
    try:
        return frozenset(json.loads(ICONS.read_text()))
    except (OSError, ValueError):
        return frozenset()


@cache
def react_icon_names() -> frozenset[str]:
    try:
        return frozenset(json.loads(REACT_ICONS.read_text()))
    except (OSError, ValueError):
        return frozenset()


@cache
def _react_icon_terms() -> tuple[tuple[str, tuple[str, ...]], ...]:
    entries = []
    for reference in sorted(react_icon_names()):
        _, pack, export = reference.split("/")
        # FaReact, IoLogoReact and SiReact all tokenize to a searchable React name.
        stem = export[len(pack.rstrip("0123456789")):]
        words = re.sub(r"([a-z0-9])([A-Z])|([A-Z])([A-Z][a-z])", r"\1\3 \2\4", stem)
        entries.append((reference, tuple(re.findall(r"[a-z0-9]+", words.lower()))))
    return tuple(entries)


def find_react_icons(query: str, limit: int = 5) -> list[str]:
    if query in react_icon_names():
        return [query]
    words = re.findall(r"[a-z0-9]+", query.lower())
    if not words:
        return []
    joined = "".join(words)
    matches = []
    for reference, terms in _react_icon_terms():
        matched = sum(word in terms for word in words)
        exact = joined == "".join(terms)
        if exact or matched:
            matches.append((not exact, -matched, len(terms), len(reference), reference))
    return [reference for *_, reference in sorted(matches)[:limit]]


def _norm(name: str) -> str:
    return name.strip().lower().replace(" ", "-").replace("_", "-")


def find_icons(query: str, limit: int = 5) -> list[str]:
    """Lucide icons whose name matches the query words: the exact name, then a whole word in the
    name ("credit card" -> credit-card; "money" finds nothing: Lucide has names, not meanings)."""
    words = re.findall(r"[a-z0-9]+", query.lower())
    if not words:
        return []
    joined = "-".join(words)
    scored = []
    for name in icon_names():
        parts = name.split("-")
        score = 4 if name == joined else 3 if name in words else sum(2 for w in words if w in parts)
        if score:
            scored.append((-score, len(name), name))
    return [name for *_, name in sorted(scored)[:limit]]


def builtin_for(key: str) -> tuple[str, str] | None:
    """("kind", name) or ("icon", name) when a built-in shows ``key``: the whole name, or its last
    one or two words ("food-delivery-bike" -> bike). Built-in iso kinds win over icons."""
    words = key.split("-")
    candidates = [key, "-".join(words[-2:]), words[-1]] if len(words) > 1 else [key]
    kinds = set(catalog.iso_kinds()) - {"tile"}
    for name in candidates:
        if name.replace("-", "") in kinds:
            return "kind", name.replace("-", "")
    for name in candidates:
        if name in icon_names():
            return "icon", name
    return None


def resolve(key: str, assets: dict) -> str | None:
    """The saved design for ``key`` by ID or alias."""
    if key in assets:
        return key
    return next((k for k, art in assets.items() if key in {_norm(a) for a in art.aliases}), None)


def _unique_aliases(key: str, aliases: list[str], assets: dict) -> list[str]:
    """Drop aliases another design already answers to, so a name always means one picture."""
    taken = set(assets) | {_norm(a) for art in assets.values() for a in art.aliases}
    out = []
    for alias in aliases:
        if _norm(alias) not in taken and _norm(alias) != key and _norm(alias) not in {_norm(a) for a in out}:
            out.append(alias)
    return out


def planner_hint():
    assets = {k: a for k, a in inventory().items() if not a.icon}
    entries = [f"{key} ({', '.join(art.aliases)})" for key, art in list(assets.items())[:HINT_LIMIT]]
    if len(assets) > HINT_LIMIT:
        entries.append(f"{len(assets) - HINT_LIMIT} more (find_iso_objects finds them)")
    return ("\nIsoScene objects, in this order: a built-in kind; else kind=tile with a Lucide icon or a React Icons "
            "reference such as react-icons/fa6/FaReact. Use find_iso_objects to search both libraries by concept. "
            "When Lucide has no clear match, try React Icons before requesting kind=tile with design="
            "<lowercase-hyphenated-thing> - a designer draws it once for every video. Designs are for concrete "
            "THINGS, never abstract ideas (endpoint, URL, method): those get an icon."
            + (" Saved designs: " + ", ".join(entries) + "." if entries else "") + "\n")


# ---- designer ---------------------------------------------------------------------------------

async def _design(key, obj, plan, model, assets) -> Drawing | None:
    """Ask the designer for ``key``; publish and return the drawing (or icon), None to skip."""
    if not ID.fullmatch(key) or len(key) > 64:
        raise ValueError("Invalid iso design ID")
    # Only the thing itself: the scene title once made the designer draw the lesson's subject.
    context = {"concept": key, "label": obj.get("label")}
    if alternatives := find_react_icons(key):
        context["react_icons"] = alternatives
    messages = [SystemMessage(skills.load("design-iso-object", "component")), HumanMessage(json.dumps(context))]
    llm = get_llm(model or settings.PLANNER_MODEL or None)
    for attempt in range(3):
        msg = await llm.ainvoke(messages)
        tin, tout = usage_of(msg)
        plan.llm_calls += 1
        plan.input_tokens += tin
        plan.output_tokens += tout
        text = text_of(msg)
        try:
            reply = Reply.model_validate_json(_json_block(text))
            if reply.skip:
                return None
            art = Drawing(aliases=reply.aliases, icon=reply.icon) if reply.icon else \
                Drawing(aliases=reply.aliases, parts=reply.parts, faces=project(reply.parts))
            break
        except (ValidationError, ValueError) as exc:
            if attempt == 2:
                raise
            messages += [msg, HumanMessage(f"Fix and return the whole JSON again. Errors: {exc}"[:1800])]
    art.aliases = _unique_aliases(key, art.aliases, assets)
    ROOT.mkdir(parents=True, exist_ok=True)
    path = ROOT / f"{key}.json"
    with tempfile.NamedTemporaryFile(dir=ROOT, mode="w") as temp:
        temp.write(art.model_dump_json(exclude_defaults=True))
        temp.flush()
        try:
            os.link(temp.name, path)
        except FileExistsError:
            art = Drawing.model_validate_json(path.read_text())
    return art


def _json_block(text: str) -> str:
    match = re.search(r"\{.*\}", text, re.S)
    return match.group(0) if match else text


def _apply(obj, key, art):
    if art.icon:
        obj["icon"] = art.icon
        obj.pop("design", None)
        obj.pop("faces", None)
        return
    save_preview(key, art)
    obj["design"] = key
    obj["faces"] = [f.model_dump(mode="json") for f in art.faces]


def _plain(obj):
    obj.pop("design", None)
    obj.pop("faces", None)


async def materialize(plan, model):
    """Give every tile with a "design" its picture: a built-in kind, a Lucide icon, a saved
    design, or a new drawing. A design that cannot be drawn falls back to the plain tile (its
    icon, if any), so one missing picture never fails the whole video."""
    assets, failed, built = inventory(), set(), {}
    for scene in plan.spec.get("scenes", []):
        if scene.get("component") != "IsoScene":
            continue
        for obj in (scene.get("props") or {}).get("objects", []):
            raw = obj.get("design")
            if not raw:
                continue
            key = _norm(raw)
            builtin = builtin_for(key)
            if builtin:
                what, name = builtin
                _plain(obj)
                if what == "kind":
                    obj["kind"] = name
                    obj.pop("icon", None)
                else:
                    obj["icon"] = name
                continue
            key = resolve(key, assets) or key
            if key not in assets and key not in failed and key not in built:
                try:
                    art = await _design(key, obj, plan, model, assets)
                    if art is None:
                        failed.add(key)
                    else:
                        assets[key] = built[key] = art
                except Exception as exc:  # noqa: BLE001 - any designer failure degrades to a plain tile
                    log.warning("iso design %r failed, using a plain tile: %s", key, str(exc)[:300])
                    failed.add(key)
            if key in failed:
                _plain(obj)
                continue
            _apply(obj, key, assets[key])
