"""Scene and asset lookup tools available to the scene planner."""
import re

from langchain_core.tools import tool

from app.utils import cues
from . import catalog, iso_design


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
