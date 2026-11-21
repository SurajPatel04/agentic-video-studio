"""Scene and asset lookup tools available to the scene planner."""
import json
import re
from collections.abc import Iterable
from typing import TypeAlias

from langchain_core.tools import tool

from app.utils import cues
from . import catalog, iso_design

LookupCache: TypeAlias = dict[tuple[str, str], str]


def iso_inventory_version() -> int | None:
    try:
        return iso_design.ROOT.stat().st_mtime_ns
    except FileNotFoundError:
        return None


def chapter_lookup_reference(cache: LookupCache, brief: str, preloaded: set[str]) -> tuple[str, set[str]]:
    """Select compact references from earlier tool calls using the new chapter's own brief."""
    if not cache:
        return "", set()
    known = set(catalog.scene_names())
    scene_names = {json.loads(key)[0] for tool, key in cache if tool == "get_scene"} & known
    candidates = catalog.search_scenes(brief, limit=2, exclude=(known - scene_names) | preloaded)
    references: list[str] = []
    included: set[str] = set()
    remaining = 5_000
    for name, _, score in candidates:
        if score < 3:
            continue
        contract = catalog.scene_text(name, compact=True, link_diagram=True)
        if len(contract) <= remaining:
            references.append(contract)
            included.add(name)
            remaining -= len(contract)

    brief_words = " ".join(re.findall(r"\w+", brief.lower()))
    version = iso_inventory_version()
    for (tool, key), result in cache.items():
        if tool != "find_iso_objects" or result.startswith("No match"):
            continue
        args, lookup_version = json.loads(key)
        query_words = " ".join(re.findall(r"\w+", args["query"].lower()))
        if lookup_version != version or not query_words or f" {query_words} " not in f" {brief_words} ":
            continue
        rows = sorted(result.splitlines(), key=lambda line: 'design="' not in line)
        summary = f"Iso assets for {args['query']!r}:\n" + "\n".join(rows[:4])
        if len(summary) <= remaining:
            references.append(summary)
            break
    return "\n\n".join(references), included


@tool
def search_scenes(query: str) -> str:
    """Find scenes for a topic or visual idea (e.g. "network packets", "compare two things", "circuit").
    Returns scene names with a one-line description, best match first."""
    return search_scene_summaries(query)


def search_scene_summaries(query: str, *, exclude: Iterable[str] = ()) -> str:
    hits = catalog.search_scenes(query, limit=6, exclude=exclude)
    rows = [f"- {name}: {catalog.scene_summary(description)}" for name, description, _ in hits]
    return "\n".join(rows) or "No additional match. Try another query or use scene fields already provided."


@tool
def get_scene(name: str) -> str:
    """Get one scene's description, every field it accepts (? = optional, a|b = allowed values) and example props."""
    return scene_details(name)


def scene_details(name: str, *, include_fields: bool = True, link_diagram: bool = False) -> str:
    text = catalog.scene_text(name, include_fields=include_fields, link_diagram=link_diagram)
    if "<iso kind>" in text:  # 179 objects: described in the iso-diagrams guide; search instead of listing them
        text += "\n<iso kind> = an object kind from the iso-diagrams guide; call find_iso_objects(\"idea\") to look one up."
    if name in cues.timing_paths():
        fields = ", ".join(sorted(p.lstrip(".") for p in cues.timing_paths()[name]))
        text += (f"\nTiming ({fields}): instead of guessing the fraction, write \"cue\": \"<word from this scene's "
                 "narration>\" (\"appearCue\" for appearAt); it lands exactly when that word is spoken.")
    return text


@tool
def find_iso_objects(query: str) -> str:
    """Find IsoScene objects, Lucide icons, and React Icons by concept or brand name."""
    # Built-in kinds, then Lucide and React Icons, then saved designs.
    hits = catalog.find_iso_objects(query)
    rows = [f"- {k}" + (f": {d}" if d else "") for k, d in hits]
    rows += [f'- kind="tile", icon="{name}"' for name in iso_design.find_icons(query)]
    rows += [f'- kind="tile", icon="{name}"' for name in iso_design.find_react_icons(query)]
    words = set(re.findall(r"[a-z0-9]+", query.lower()))
    for key, art in iso_design.inventory().items():
        if not art.icon and words.intersection(re.findall(r"[a-z0-9]+", " ".join([key, *art.aliases]).lower())):
            rows.append(f'- kind="tile", design="{key}" ({", ".join(art.aliases)})')
    return "\n".join(rows) or ('No match: try a synonym to search both icon libraries, or use design="<thing>" '
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
