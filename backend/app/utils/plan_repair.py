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
                          "Return only the specified paths and their replacement values, in one update_plan_fields "
                          'call if available or as JSON {"updates": {"path": value}}.'),
            HumanMessage(json.dumps({key: details for key, (_, details) in self.targets.items()}, ensure_ascii=False)),
        ]

    def apply(self, updates: dict) -> str:
        if not isinstance(updates, dict) or updates.keys() != self.targets.keys():
            raise ValueError("Expected exactly the requested repair paths")
        result = copy.deepcopy(self.draft)
        for path, value in updates.items():
            keys, _ = self.targets[path]
            parent = result
            for key in keys[:-1]:
                parent = parent[key]
            parent[keys[-1]] = value
        return json.dumps(result)


def scoped_repair(draft: dict, problem: str) -> Repair | None:
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
        targets[path] = (["scenes", i, *keys], dict(scene=scene_id, component=scenes[i].get("component"),
                                                    current=value, issue=issue, context=context))
    # A parent replacement could invalidate the address of another edit in the same batch.
    for keys, _ in targets.values():
        if any(other[:len(keys)] == keys and len(other) > len(keys) for other, _ in targets.values()):
            return None
    return Repair(draft, targets) if targets else None
