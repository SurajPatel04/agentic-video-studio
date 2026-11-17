"""IsoScene continuations: "same picture, small change" without repeating the whole diagram.

The planner writes a scene with ``"continue": true`` and lists only what is new (objects, links,
steps) plus ``"remove": [ids]``. ``expand_continuations`` turns it into a complete IsoScene:

- objects and links of the previous IsoScene are carried over with their END state (status, colour
  and label changed by its steps; hidden objects dropped) and ``enter: "none"`` (no drop-in again);
- every scene of the chain gets the same set of objects (ones not on screen yet / any more as
  ``ghost: true``), so the layout is identical and nothing jumps;
- the transition into a continued scene is a cut (same picture, nothing to fade).

Cheap: those scenes cost only their changes in LLM output. Idempotent: expanded scenes are marked
``continued: true`` and lose ``continue`` / ``remove``.
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
        if st.get("hide") is True:
            o["_hidden"] = True
        elif st.get("hide") is False:
            o.pop("_hidden", None)
    alive = {i: o for i, o in objs.items() if not o.pop("_hidden", False)}
    links = [copy.deepcopy(l) for l in props.get("links") or [] if isinstance(l, dict) and l.get("from") in alive and l.get("to") in alive]
    return list(alive.values()), links


def expand_continuations(spec: dict[str, Any]) -> dict[str, Any]:
    scenes = spec.get("scenes") or []
    chain: list[int] = []
    chains: list[list[int]] = []
    for i, s in enumerate(scenes):
        props = s.get("props") if isinstance(s.get("props"), dict) else None
        cont = s.get("component") == "IsoScene" and props is not None and props.get("continue") is True
        if cont and chain:
            prev = scenes[chain[-1]]
            objs, links = _end_state(prev)
            for o in objs:
                o["enter"] = "none"
                o.pop("appearAt", None)
            for l in links:
                l["enter"] = "none"
                l.pop("appearAt", None)
            removed = set(props.get("remove") or [])
            new_objs = [o for o in props.get("objects") or [] if isinstance(o, dict)]
            new_ids = {o.get("id") for o in new_objs}
            kept = [o for o in objs if o["id"] not in removed and o["id"] not in new_ids]  # a re-listed id replaces the old one
            ids = {o["id"] for o in kept} | new_ids
            new_links = [l for l in props.get("links") or [] if isinstance(l, dict)]
            pairs = {(l.get("from"), l.get("to")) for l in new_links}
            kept_links = [l for l in links if l["from"] in ids and l["to"] in ids and (l["from"], l["to"]) not in pairs]
            props["objects"] = kept + new_objs
            props["links"] = kept_links + new_links
            props.setdefault("steps", [])
            for k in ("eyebrow", "title", "subtitle"):  # same picture, same heading unless it changes
                if k not in props and k in (prev.get("props") or {}):
                    props[k] = prev["props"][k]
            props.pop("continue", None)
            props.pop("remove", None)
            props["continued"] = True
            s["transition"] = {"type": "none"}
            chain.append(i)
            continue
        if props is not None and s.get("component") == "IsoScene":
            props.pop("continue", None)
            props.pop("remove", None)
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
