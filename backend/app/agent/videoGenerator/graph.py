"""Route each video through skill selection, scene planning and asset preparation."""
from langgraph.graph import END, START, StateGraph

from .nodes.plan_scenes import plan_scenes
from .nodes.prepare_assets import prepare_assets
from .nodes.select_skills import select_skills
from .state.video import VideoInput, VideoOutput, VideoState


def build_video_graph():
    graph = StateGraph(VideoState, input_schema=VideoInput, output_schema=VideoOutput)
    graph.add_node("select_skills", select_skills)
    graph.add_node("plan_scenes", plan_scenes)
    graph.add_node("prepare_assets", prepare_assets)

    graph.add_edge(START, "select_skills")
    graph.add_edge("select_skills", "plan_scenes")
    graph.add_edge("plan_scenes", "prepare_assets")
    graph.add_edge("prepare_assets", END)
    return graph.compile(name="video_planning")


video_graph = build_video_graph()
