"""Explicit opt-in, two-call tool-loop smoke test against OpenAI directly (NOT the MLflow gateway).

Run: PYTHONPATH=backend .venv/bin/python backend/tests/live_harness_smoke.py
No scene files or registry changes; not a full scene-quality benchmark.
"""
import asyncio
import json

from dotenv import dotenv_values
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import StructuredTool
from langchain_openai import ChatOpenAI

from app.agent.videoGenerator.components.history import History
from app.config import PROJECT_ROOT
from app.utils.llm import usage_of


async def main():
    api_key = dotenv_values(PROJECT_ROOT / '.env').get('TEST')
    if not api_key:
        raise SystemExit('TEST is missing; refusing to use the production model.')

    def scene_contract(name: str) -> str:
        """Return the minimal scene contract for a scene name."""
        return json.dumps({'name': name, 'required_exports': ['schema', 'description', 'tags']})

    tool = StructuredTool.from_function(scene_contract)
    llm = ChatOpenAI(api_key=api_key, base_url='https://api.openai.com/v1',
                     model='gpt-4.1-mini', use_responses_api=True,
                     max_retries=0, max_tokens=512, timeout=30)
    messages = [SystemMessage('Use scene_contract when asked. Keep answers short.'),
                HumanMessage('Look up ExampleScene with scene_contract.')]
    reply = await llm.bind_tools([tool], tool_choice='scene_contract').ainvoke(messages)
    assert reply.tool_calls, 'Gateway returned no tool call'
    messages.append(reply)
    for call in reply.tool_calls:
        assert call['name'] == 'scene_contract'
        result = await tool.ainvoke(call['args'])
        messages.append(ToolMessage(result, tool_call_id=call['id']))
    # Force compaction of an older, completed source-bearing turn.
    old = AIMessage('', tool_calls=[{'id': 'old-write', 'name': 'write_file',
        'args': {'path': 'draft.tsx', 'content': '// old source\n' * 2000}, 'type': 'tool_call'}])
    messages[2:2] = [old, ToolMessage('wrote draft.tsx', tool_call_id='old-write')]
    History().compact(messages, 1)
    messages.append(HumanMessage('List the three required exports returned by the tool.'))
    answer = await llm.ainvoke(messages)
    text = str(answer.content)
    assert all(word in text for word in ['schema', 'description', 'tags']), 'Contract not preserved'
    usage = [usage_of(m) for m in [reply, answer]]
    print(json.dumps({'ok': True, 'calls': 2, 'input_tokens': sum(i for i, _ in usage),
                      'output_tokens': sum(o for _, o in usage), 'credential_source': '.env TEST', 'model': 'gpt-4.1-mini'}))


if __name__ == '__main__':
    # Avoid printing provider exceptions that might contain endpoint credentials.
    try:
        asyncio.run(main())
    except Exception as exc:
        raise SystemExit(f'Live smoke failed ({type(exc).__name__}); credentials omitted.') from None
