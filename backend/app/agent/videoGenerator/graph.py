"""Route each video through skill selection, the plan loop and asset preparation.

    START -> select_skills -> start_planning -> [plan loop: draft / lookup / validate / repair / give_up]
          -> finish_planning -> prepare_assets -> END
"""
from langgraph.graph import END, START, StateGraph

from .nodes.plan_scenes import add_plan_loop, finish_planning, start_planning
from .nodes.prepare_assets import prepare_assets
from .nodes.select_skills import select_skills
from .state.video import VideoInput, VideoOutput, VideoState


def build_video_graph():
    graph = StateGraph(VideoState, input_schema=VideoInput, output_schema=VideoOutput)
    graph.add_node("select_skills", select_skills)
    graph.add_node("start_planning", start_planning)
    graph.add_node("finish_planning", finish_planning)
    graph.add_node("prepare_assets", prepare_assets)

    graph.add_edge(START, "select_skills")
    graph.add_edge("select_skills", "start_planning")
    graph.add_edge("start_planning", add_plan_loop(graph, "finish_planning"))
    graph.add_edge("finish_planning", "prepare_assets")
    graph.add_edge("prepare_assets", END)
    return graph.compile(name="video_planning")


video_graph = build_video_graph()
