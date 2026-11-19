"""Resolve the artwork referenced by the finished scene plan."""
from copy import deepcopy

from ..state.video import VideoState
from ..tools.iso_design import materialize


async def prepare_assets(state: VideoState) -> dict:
    plan = deepcopy(state["plan"])
    await materialize(plan, state["model"])
    return {"plan": plan}
