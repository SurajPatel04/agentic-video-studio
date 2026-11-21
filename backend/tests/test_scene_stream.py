import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from langchain_core.messages import AIMessageChunk

from app.agent.videoGenerator.jobs import scene_stream as stream


class StreamingTests(unittest.IsolatedAsyncioTestCase):
    async def test_complete_scene_forwarded_before_next_chunk(self):
        first = {"id": "one", "props": {"text": 'a } " and a nested array [x]'}}
        second = {"id": "two"}
        work = Mock()
        async def chunks(*args, **kwargs):
            for char in '{"scenes":[' + json.dumps(first):
                yield AIMessageChunk(content=char)
            work.submit.assert_called_once()
            self.assertEqual(work.submit.call_args.args[0], [first])
            yield AIMessageChunk(content=',' + json.dumps(second) + ']}',
                                 usage_metadata={"input_tokens": 10, "output_tokens": 5, "total_tokens": 15})
        model = Mock(astream=chunks)
        token = stream.active.set(work)
        try:
            msg = await stream.planner_response(model, [])
        finally:
            stream.active.reset(token)
        self.assertEqual(json.loads(msg.text)["scenes"], [first, second])
        self.assertEqual(msg.usage_metadata["total_tokens"], 15)

    async def test_tool_arguments_do_not_start_narration(self):
        async def chunks(*args, **kwargs):
            yield AIMessageChunk(content="", tool_call_chunks=[
                {"index": 0, "name": "search_scenes", "id": "abc", "args": '{"query":"test"}'}])
        work = Mock()
        token = stream.active.set(work)
        try:
            msg = await stream.planner_response(Mock(astream=chunks), [], tools=True)
        finally:
            stream.active.reset(token)
        work.submit.assert_not_called()
        self.assertEqual(msg.tool_calls[0]["args"], {"query": "test"})

    async def test_repaired_scene_invalidates_early_ranges(self):
        work = stream.SceneStream(layout="desktop", scale=1, captions=True)
        try:
            spec = {"scenes": [{"id": str(i)} for i in range(4)]}
            work.signatures = [stream.signature(spec, i) for i in range(2)]
            for suffix in ("mp4", "wav"):
                (work.path / f"scene-00001.{suffix}").write_bytes(b"first")
            spec["scenes"][2]["id"] = "replacement"
            with tempfile.TemporaryDirectory() as destination:
                self.assertEqual(work.reuse(spec, Path(destination)), 1)
        finally:
            await work.close()
