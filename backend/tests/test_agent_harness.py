import shutil
import unittest
from unittest.mock import AsyncMock, patch

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from app.agent.history import History, reserve_tokens
from app.agent.component_agent import build_component
from app.agent.sandbox import Sandbox, SandboxError
from app.config import PROJECT_ROOT, settings


def turn(n, source='x' * 20000):
    return [AIMessage('', tool_calls=[{'id': str(n), 'name': 'write_file',
             'args': {'path': 'draft.tsx', 'content': source}, 'type': 'tool_call'}]),
            ToolMessage('wrote draft.tsx', tool_call_id=str(n))]


class HistoryTests(unittest.TestCase):
    def test_source_removed_and_protocol_pairs_preserved(self):
        messages = [SystemMessage('rules'), HumanMessage('request')]
        for n in range(12):
            messages.extend(turn(n))
        before = reserve_tokens(messages, [])
        history = History()
        history.compact(messages)
        after = reserve_tokens(messages, [])
        self.assertLess(after, before * .3)
        self.assertEqual(messages[1].content, 'request')
        self.assertNotIn('xxxxx', messages[2].content)
        for i, message in enumerate(messages):
            if isinstance(message, ToolMessage):
                self.assertEqual(message.tool_call_id, messages[i-1].tool_calls[0]['id'])
        messages.extend(turn(13))
        history.compact(messages)
        self.assertLessEqual(len(history.receipts), 24)
        self.assertIn('wrote draft.tsx', messages[2].content)

    def test_images_consumed_once(self):
        frame = HumanMessage([{'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,AAAA'}}])
        messages = [SystemMessage('rules'), HumanMessage('request'), *turn(1), frame]
        h = History()
        h.compact(messages)
        self.assertIsInstance(messages[-1].content, list)
        self.assertGreater(reserve_tokens(messages, []), 8192)
        messages.extend(turn(2))
        h.compact(messages)
        self.assertFalse(any(isinstance(m.content, list) for m in messages))

    def test_batched_tool_pairs_remain_complete(self):
        messages = [SystemMessage('rules'), HumanMessage('request')]
        for n in range(5):
            calls = [{'id': f'{n}-{i}', 'name': 'read_file', 'args': {'path': 'x'}, 'type': 'tool_call'} for i in range(2)]
            messages.append(AIMessage('', tool_calls=calls))
            messages.extend(ToolMessage('file', tool_call_id=c['id']) for c in calls)
        History().compact(messages, 1)
        self.assertEqual(len(messages[-3].tool_calls), 2)
        self.assertEqual([m.tool_call_id for m in messages[-2:]], ['4-0', '4-1'])


class HarnessTests(unittest.IsolatedAsyncioTestCase):
    async def test_budget_stops_before_first_call(self):
        model = AsyncMock()
        with patch('app.agent.component_agent.get_tool_llm') as get, patch.object(settings, 'AGENT_MAX_INPUT_TOKENS', 1):
            get.return_value.bind_tools.return_value = model
            result = await build_component('test reservation')
        self.addCleanup(shutil.rmtree, settings.WORKSPACE_DIR / 'jobs' / result.job_id)
        self.assertFalse(result.ok)
        self.assertEqual(result.steps, 0)
        model.ainvoke.assert_not_called()
        self.assertIn('reservation', result.summary)

    async def test_finish_must_wait_for_frame_review(self):
        from app.agent.staging import CheckReport
        call = lambda name, args, ident: {'name': name, 'args': args, 'id': ident, 'type': 'tool_call'}
        calls = 0
        async def respond(messages):
            nonlocal calls
            calls += 1
            if calls == 1:
                job = messages[0].content.split('Your draft folder: ')[1].split('/   ')[0]
                return AIMessage('', tool_calls=[
                    call('write_file', {'path': job + '/TestScene.tsx', 'content': 'draft'}, 'w'),
                    call('check_component', {'name': 'TestScene'}, 'c'),
                    call('finish', {'name': 'TestScene', 'summary': 'done'}, 'f')])
            self.assertTrue(any(isinstance(m, ToolMessage) and 'inspect the rendered frames' in str(m.content) for m in messages))
            self.assertTrue(any(isinstance(m.content, list) for m in messages))
            return AIMessage('', tool_calls=[call('finish', {'name': 'TestScene', 'summary': 'done'}, 'f2')])
        async def check(name, draft, job, request):
            image = job / 'frame.png'
            image.write_bytes(b'fake image for mocked model')
            return CheckReport(True, name, stills=[image])
        model = AsyncMock()
        model.ainvoke.side_effect = respond
        pub = AsyncMock(return_value='published TestScene')
        with patch('app.agent.component_agent.get_tool_llm') as get, patch('app.agent.component_agent.check_draft', side_effect=check), \
                patch('app.agent.component_agent.publish', pub), patch.object(settings, 'AGENT_VISION', True):
            get.return_value.bind_tools.return_value = model
            result = await build_component('test review')
        self.addCleanup(shutil.rmtree, settings.WORKSPACE_DIR / 'jobs' / result.job_id)
        self.assertTrue(result.ok)
        self.assertEqual(result.steps, 2)
        pub.assert_awaited_once()  # published exactly once, at the reviewed finish

    async def test_nothing_published_when_run_stops_before_finish(self):
        from app.agent.staging import CheckReport
        call = lambda name, args, ident: {'name': name, 'args': args, 'id': ident, 'type': 'tool_call'}
        async def respond(messages):
            job = messages[0].content.split('Your draft folder: ')[1].split('/   ')[0]
            return AIMessage('', tool_calls=[call('write_file', {'path': job + '/TestScene.tsx', 'content': 'draft'}, 'w'),
                                             call('check_component', {'name': 'TestScene'}, 'c')])
        async def check(name, draft, job, request):
            return CheckReport(True, name)
        model = AsyncMock()
        model.ainvoke.side_effect = respond
        pub = AsyncMock()
        with patch('app.agent.component_agent.get_tool_llm') as get, patch('app.agent.component_agent.check_draft', side_effect=check), \
                patch('app.agent.component_agent.publish', pub), patch.object(settings, 'AGENT_MAX_STEPS', 2):
            get.return_value.bind_tools.return_value = model
            result = await build_component('test early stop')
        self.addCleanup(shutil.rmtree, settings.WORKSPACE_DIR / 'jobs' / result.job_id)
        self.assertFalse(result.ok)
        pub.assert_not_awaited()  # checks passed, but no finish -> never live

    async def test_failed_publish_does_not_finish(self):
        from app.agent.staging import CheckReport
        call = lambda name, args, ident: {'name': name, 'args': args, 'id': ident, 'type': 'tool_call'}
        n = 0
        async def respond(messages):
            nonlocal n
            n += 1
            job = messages[0].content.split('Your draft folder: ')[1].split('/   ')[0]
            if n == 1:
                return AIMessage('', tool_calls=[call('write_file', {'path': job + '/TestScene.tsx', 'content': 'draft'}, 'w'),
                                                 call('check_component', {'name': 'TestScene'}, 'c')])
            return AIMessage('', tool_calls=[call('finish', {'name': 'TestScene', 'summary': 'x'}, f'f{n}')])
        async def check(name, draft, job, request):
            return CheckReport(True, name)
        model = AsyncMock()
        model.ainvoke.side_effect = respond
        with patch('app.agent.component_agent.get_tool_llm') as get, patch('app.agent.component_agent.check_draft', side_effect=check), \
                patch('app.agent.component_agent.publish', AsyncMock(side_effect=RuntimeError('typecheck failed at publish'))), \
                patch.object(settings, 'AGENT_MAX_STEPS', 3), patch.object(settings, 'AGENT_VISION', False):
            get.return_value.bind_tools.return_value = model
            result = await build_component('test publish failure')
        self.addCleanup(shutil.rmtree, settings.WORKSPACE_DIR / 'jobs' / result.job_id)
        self.assertFalse(result.ok)

    async def test_missing_usage_is_charged_and_tools_expose_arguments(self):
        model = AsyncMock()
        model.ainvoke.return_value = AIMessage('continue')
        with patch('app.agent.component_agent.get_tool_llm') as get, patch.object(settings, 'AGENT_MAX_INPUT_TOKENS', 25000):
            get.return_value.bind_tools.return_value = model
            result = await build_component('test missing usage')
            schemas = {t.name: t.args for t in get.return_value.bind_tools.call_args.args[0]}
        self.addCleanup(shutil.rmtree, settings.WORKSPACE_DIR / 'jobs' / result.job_id)
        self.assertIn('path', schemas['write_file'])
        self.assertIn('content', schemas['write_file'])
        self.assertGreater(result.steps, 0)
        self.assertLess(result.steps, 5)
        self.assertTrue((settings.WORKSPACE_DIR / 'jobs' / result.job_id / 'usage.json').exists())


class SandboxTests(unittest.TestCase):
    def setUp(self):
        self.job = PROJECT_ROOT / 'workspace/jobs/test-harness-local'
        self.box = Sandbox(self.job)
        self.addCleanup(shutil.rmtree, self.job)

    def test_read_pagination_and_denials(self):
        path = self.box.job_rel + '/long.tsx'
        self.box.write_file(path, '\n'.join(f'line {i}' for i in range(400)))
        result = self.box.read_file(path)
        self.assertIn('read from line 161', result)
        self.assertNotIn('line 160\n', result)
        self.assertIn('line 160', self.box.read_file(path, 161, 162))
        for path in ['.env', '../escape', 'backend/app/main.py', '/etc/passwd']:
            with self.assertRaises(SandboxError):
                self.box.read_file(path)
        with self.assertRaises(SandboxError):
            self.box.write_file('rendering/src/test.tsx', 'bad')


if __name__ == '__main__':
    unittest.main()
