"""Route each video through skill selection, scene planning and asset preparation."""
from typing import Literal

from langgraph.graph import END, START, StateGraph

from .nodes.plan_scenes import plan_scenes
from .nodes.prepare_assets import prepare_assets
from .nodes.repair_scenes import repair_scenes
from .nodes.review_lesson import review_lesson
from .nodes.select_skills import select_skills
from .nodes.write_script import write_script
from .state.video import VideoInput, VideoOutput, VideoState


async def after_selection(state: VideoState) -> Literal["write_script", "plan_scenes"]:
    return "write_script" if "teach-lecture" in state["selected"] else "plan_scenes"


async def after_planning(state: VideoState) -> Literal["review_lesson", "prepare_assets"]:
    return "review_lesson" if state.get("script") else "prepare_assets"


async def after_review(state: VideoState) -> Literal["repair_scenes", "prepare_assets"]:
    return "repair_scenes" if state["review"].issues else "prepare_assets"


def build_video_graph():
    graph = StateGraph(VideoState, input_schema=VideoInput, output_schema=VideoOutput)
    graph.add_node("select_skills", select_skills)
    graph.add_node("write_script", write_script)
    graph.add_node("plan_scenes", plan_scenes)
    graph.add_node("review_lesson", review_lesson)
    graph.add_node("repair_scenes", repair_scenes)
    graph.add_node("prepare_assets", prepare_assets)

    graph.add_edge(START, "select_skills")
    graph.add_conditional_edges("select_skills", after_selection)
    graph.add_edge("write_script", "plan_scenes")
    graph.add_conditional_edges("plan_scenes", after_planning)
    graph.add_conditional_edges("review_lesson", after_review)
    graph.add_edge("repair_scenes", "review_lesson")
    graph.add_edge("prepare_assets", END)
    return graph.compile(name="video_planning")


video_graph = build_video_graph()
