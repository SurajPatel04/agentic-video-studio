"""Bound complete conversation turns without retaining old generated source."""
import json
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage


class History:
    def __init__(self) -> None:
        self.receipts: list[str] = []

    def compact(self, messages: list[Any], keep_turns: int = 3) -> None:
        # Drop images after the model has had one opportunity to inspect them.
        for i, message in enumerate(messages):
            if isinstance(message, HumanMessage) and isinstance(message.content, list):
                if any(isinstance(m, AIMessage) for m in messages[i + 1:]):
                    messages[i] = HumanMessage('Earlier frames reviewed; run check_component for fresh frames.')
        starts = [i for i, m in enumerate(messages) if isinstance(m, AIMessage)]
        if len(starts) <= keep_turns:
            return
        cut = starts[-keep_turns]
        calls = {}
        for message in messages[2:cut]:
            if isinstance(message, AIMessage):
                calls.update({c['id']: c for c in message.tool_calls})
            elif isinstance(message, ToolMessage) and message.tool_call_id in calls:
                call = calls[message.tool_call_id]
                args = call['args']
                # Never store source/patch arguments in the compacted ledger.
                target = str(args.get('path', args.get('name', args.get('pattern', ''))))[:180]
                result = str(message.content)
                self.receipts.append(f"{call['name']} {target}: {result[:240]}")
        self.receipts = self.receipts[-24:]
        note = HumanMessage('Earlier tool activity (files on disk are authoritative; read ranges if needed):\n'
                            + '\n'.join(self.receipts))
        # Keep the immutable instructions/request and complete assistant/tool groups.
        messages[:] = messages[:2] + [note] + messages[cut:]


def reserve_tokens(messages: list[Any], schemas: list[dict]) -> int:
    """Conservative local reservation, not a provider token count.

    Reserve one token per UTF-8 byte plus framing, and 8192 per image. This
    deliberately overestimates typical code. Provider/image accounting may differ.
    """
    total = len(json.dumps(schemas, ensure_ascii=False).encode()) + 512
    for message in messages:
        content = message.content
        if isinstance(content, list):
            parts = []
            for part in content:
                if isinstance(part, dict) and part.get('type') == 'image_url':
                    total += 8192
                else:
                    parts.append(part)
            content = parts
        payload = {'content': content, 'tool_calls': getattr(message, 'tool_calls', [])}
        total += len(json.dumps(payload, ensure_ascii=False).encode()) + 64
    return total
