"""Scoped edits to a local composition draft. The model only sees the flagged targets."""

import copy
import json
import re
from dataclasses import dataclass
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool


@tool
def update_plan_fields(updates: dict[str, Any]) -> dict[str, Any]:
    """Set each supplied target path to its corrected JSON value in a single batch."""
    return updates


FIELD = re.compile(r"scenes\[(\d+)\] \(([^)]+)\)((?:\.\w+|\[\d+\])+): (.+)")
SCENE = re.compile(r"- scene '([^']+)': (.+)")


@dataclass
class Repair:
    draft: dict
    targets: dict[str, tuple[list, dict]]

    def messages(self):
        return [
            SystemMessage("Repair the listed targets of a video composition. Preserve meaning, language and IDs. "
                          "Each target's context says what it must agree with (columns, existing object ids, the "
                          "scene's fields); follow it. A target ending in .props is a whole scene: return its complete "
                          "corrected props, keeping what works and fixing every listed issue. "
                          "Return only the specified paths and their replacement values, in one update_plan_fields "
                          'call if available or as JSON {"updates": {"path": value}}.'),
            HumanMessage(json.dumps({key: details for key, (_, details) in self.targets.items()}, ensure_ascii=False)),
        ]

    def scenes(self) -> set[int]:
        """Indexes of the scenes this repair touches."""
        return {keys[1] for keys, _ in self.targets.values()}

    def apply(self, updates: dict) -> str:
        if not isinstance(updates, dict) or updates.keys() != self.targets.keys():
            raise ValueError("Expected exactly the requested repair paths")
        result = copy.deepcopy(self.draft)
        for path, value in updates.items():
            keys, details = self.targets[path]
            if keys[-1] == "props" and isinstance(value, dict):
                # models echo the request's wrapper into a whole-scene answer: {"scene": ..., "current": {...}}
                if isinstance(value.get("current"), dict) and set(value) <= {"scene", "component", "current", "issue", "context"}:
                    value = value["current"]
                value = {k: v for k, v in value.items()
                         if not (k == "scene" and v == details.get("scene")) and not (k == "component" and v == details.get("component"))}
            parent = result
            for key in keys[:-1]:
                parent = parent[key]
            parent[keys[-1]] = value
        return json.dumps(result)


def _related(props: Any, keys: list, issue: str) -> dict:
    """What the broken field must agree with, which the model cannot see from the field alone:
    the table's columns for a row, the scene's object ids for a link or step target."""
    if not isinstance(props, dict):
        return {}
    out: dict[str, Any] = {}
    names = {k for k in keys if isinstance(k, str)}
    if names & {"rows", "columns", "cells", "header", "headers"} or "column" in issue:
        for key in ("columns", "header", "headers"):
            if isinstance(props.get(key), list):
                out[key] = props[key]
                out["rule"] = f"every row has exactly {len(props[key])} cells, one per {key[:-1] if key.endswith('s') else key}"
                break
    if "no object with id" in issue or names & {"links", "steps", "target", "from", "to"}:
        objects = props.get("objects") or props.get("nodes") or []
        ids = [o.get("id") for o in objects if isinstance(o, dict) and o.get("id")]
        if ids:
            out["object_ids"] = ids
            out["rule"] = "use one of object_ids; if the thing is not drawn yet, the whole scene must add it"
    return out


def scoped_repair(draft: dict, problem: str, whole: set[int] | frozenset[int] = frozenset(),
                  contract=None) -> Repair | None:
    """Targets for the flagged fields. Scenes in ``whole`` (a field there already failed one scoped
    repair) are repaired as a whole: their full props, every issue and, via ``contract(component)``,
    the scene's field list, so the model can also add an object or restructure a table."""
    scenes = draft.get("scenes", [])
    targets = {}
    for line in problem.splitlines():
        line = line.strip()
        field = FIELD.fullmatch(line)
        scene_issue = SCENE.fullmatch(line)
        if field:
            index, scene_id, suffix, issue = field.groups()
            i = int(index)
            if i >= len(scenes) or scenes[i].get("id") != scene_id:
                return None
            keys = [int(n) if n else name for name, n in re.findall(r"\.(\w+)|\[(\d+)\]", suffix)]
        elif scene_issue:
            scene_id, issue = scene_issue.groups()
            i = next((j for j, s in enumerate(scenes) if s.get("id") == scene_id), -1)
            if i < 0:
                return None
            suffix, keys = ".props", ["props"]
        elif line.startswith(("- ", "scenes", "audio", "brand", "captions", "fps", "width", "height")):
            return None
        else:
            continue
        if i in whole and keys[:1] == ["props"]:
            suffix, keys = ".props", ["props"]
        try:
            parent = scenes[i]
            for key in keys[:-1]:
                parent = parent[key]
            value = parent.get(keys[-1]) if isinstance(parent, dict) else parent[keys[-1]]
        except (IndexError, KeyError, TypeError):
            return None
        path = f"scenes[{i}]{suffix}"
        if path in targets:
            targets[path][1]["issue"] += " / " + issue
            continue
        context = {k: parent[k] for k in ("from", "to", "kind", "id") if isinstance(parent, dict) and k in parent}
        if keys != ["props"]:
            context.update(_related(scenes[i].get("props"), keys, issue))
        elif contract:
            context["fields"] = contract(scenes[i].get("component"))
            context["narration"] = (scenes[i].get("narration") or {}).get("text", "")
        targets[path] = (["scenes", i, *keys], dict(scene=scene_id, component=scenes[i].get("component"),
                                                    current=value, issue=issue, context=context))
    # A parent replacement could invalidate the address of another edit in the same batch.
    for keys, _ in targets.values():
        if any(other[:len(keys)] == keys and len(other) > len(keys) for other, _ in targets.values()):
            return None
    return Repair(draft, targets) if targets else None
