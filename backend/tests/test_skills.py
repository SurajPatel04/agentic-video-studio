import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
from langchain_core.messages import AIMessage

from app.utils import skills, planner, long_video
from app.config import settings


class SelectionTests(unittest.TestCase):
    def setUp(self):  # these check topic matching; the house style slot is tested in StyleSelectionTests
        p = patch.object(settings, 'PLANNER_DEFAULT_STYLE', '')
        p.start()
        self.addCleanup(p.stop)

    def test_auto_explicit_disabled_and_boundaries(self):
        self.assertEqual(skills.select('How Node.js works'), ['video-foundation', 'make-explainer', 'teach-code'])
        self.assertEqual(skills.select('Python APIs'), ['video-foundation', 'teach-code'])
        self.assertEqual(skills.select('TCP routing'), ['video-foundation', 'teach-networking'])
        self.assertEqual(skills.select('Binary search algorithm'), ['video-foundation', 'teach-dsa'])
        self.assertEqual(skills.select('A history of empires'), ['video-foundation'])
        self.assertEqual(skills.select('decode a sculpture'), ['video-foundation'])
        self.assertEqual(skills.select('Node.js', []), [])
        self.assertEqual(skills.select('Node.js', ['teach-math', 'teach-math']), ['teach-math'])
        self.assertEqual(skills.select('Node.js', long_video=True), ['video-foundation', 'teach-code', 'long-video-pacing'])
        with self.assertRaises(ValueError):
            skills.select('Node.js', ['write-scene'])
        with self.assertRaises(ValueError):
            skills.load('../../.env')

    def test_universal_subjects_and_formats(self):
        cases = {
            'A study lecture about photosynthesis for grade 8': 'teach-lecture',
            'A history lesson about the Roman Empire': 'teach-lecture',
            'Explain how watercolor washes work': 'make-explainer',
            'An ad for a local bakery': 'make-ad',
            'A promotional video for a nursing course': 'make-ad',
        }
        for brief, expected in cases.items():
            with self.subTest(brief=brief):
                chosen = skills.select(brief)
                self.assertIn('video-foundation', chosen)
                self.assertIn(expected, chosen)
                self.assertNotIn('teach-code', chosen)
        otp = skills.select('How OTP login works: a one-time code arrives by SMS on the phone')
        self.assertIn('screen-demos', otp)
        self.assertNotIn('teach-code', otp)  # "code" here is a login code, not programming
        self.assertIn('teach-code', skills.select('Debugging a Python bug and committing with git'))
        self.assertIn('teach-code', skills.select('How the Node.js event loop works'))
        self.assertIn('teach-dsa', skills.select('How hash tables work'))
        self.assertNotIn('teach-dsa', skills.select('Becoming a full stack developer'))  # "stack" is not the data structure
        self.assertIn('teach-math', skills.select('How compound interest grows'))  # graph scenes live in teach-math
        self.assertIn('teach-math', skills.select('Graphing a parabola'))
        for brief in ['A poem about autumn', 'प्रकाश संश्लेषण', 'A pottery demonstration']:
            self.assertIn('video-foundation', skills.select(brief))
        self.assertEqual(skills.select('A bakery ad', []), [])

    def test_discovery_reloads_and_bad_files_are_isolated(self):
        with tempfile.TemporaryDirectory() as root, patch.object(skills, 'ROOT', Path(root)):
            path = Path(root) / 'custom' / 'SKILL.md'
            path.parent.mkdir()
            path.write_text('---\nname: custom\ndescription: custom teaching\nmetadata:\n  tags: [orbits]\n---\nUse a worked example.')
            self.assertEqual(skills.select('orbits'), ['custom'])
            self.assertNotIn('worked example', skills.index())
            self.assertIn('worked example', skills.load('custom'))
            path.write_text(path.read_text().replace('worked example', 'visual trace'))
            self.assertIn('visual trace', skills.load('custom'))
            bad = Path(root) / 'bad' / 'SKILL.md'; bad.parent.mkdir()
            bad.write_text('---\ninvalid: [\n---\nOops')
            self.assertEqual(list(skills.discover()), ['custom'])

    def test_tools_enforce_role_and_allowlist(self):
        loaded = set()
        tools = {t.name: t for t in skills.tools(allowed=['teach-code'], loaded=loaded)}
        self.assertNotIn('teach-math', tools['list_skills'].invoke({}))
        self.assertIn('not enabled', tools['load_skill'].invoke({'name': 'teach-math'}))
        self.assertFalse(loaded)
        self.assertIn('CodeScene', tools['load_skill'].invoke({'name': 'teach-code'}))
        self.assertEqual(loaded, {'teach-code'})
        self.assertIn('write-scene', skills.index('component'))
        self.assertNotIn('teach-code', skills.index('component'))


class IntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_catalog_gets_guidance_and_required_contracts(self):
        model = AsyncMock()
        model.ainvoke.return_value = AIMessage('{}')
        with patch.object(planner, 'get_llm', return_value=model), patch.object(planner, '_check', AsyncMock(return_value=({'scenes': []}, ''))):
            plan = await planner.plan_video('How Node.js works', mode='catalog')
            prompt = model.ainvoke.call_args.args[0][0].content
            self.assertIn('Teaching guide: teach-code', prompt)
            self.assertIn('### CodeScene', prompt)
            self.assertIn('highlightLines', prompt)
            self.assertIn('overlay "terminal"', prompt)
            self.assertEqual(plan.skills, ['video-foundation', 'make-explainer', 'iso-diagrams', 'teach-code'])  # house style by default
            await planner.plan_video('How Node.js works', mode='catalog', skills=[])
            self.assertNotIn('Teaching guide:', model.ainvoke.call_args.args[0][0].content)

    async def test_nontech_catalog_and_original_long_brief(self):
        model = AsyncMock(); model.ainvoke.return_value = AIMessage('{}')
        with patch.object(planner, 'get_llm', return_value=model), patch.object(planner, '_check', AsyncMock(return_value=({'scenes': []}, ''))):
            plan = await planner.plan_video('An ad for a local bakery', mode='catalog')
            self.assertEqual(plan.skills, ['video-foundation', 'make-ad', 'iso-diagrams'])
            prompt = model.ainvoke.call_args.args[0][0].content
            self.assertIn('Teaching guide: make-ad', prompt)
            self.assertNotIn('Teaching guide: teach-code', prompt)
            self.assertNotIn('quiz or summary.', prompt)
        outline = long_video.Outline(title='Fresh bread', chapters=[long_video.ChapterOutline(
            title='Daily baking', goal='Show the product', key_points=['bread'], minutes=3)])
        state = long_video._new_state('A bakery ad in Hindi for local customers', 3, outline)
        self.assertIn(state.topic, long_video.chapter_context(state, 1))
        self.assertNotIn('ends with a short quiz', long_video.OUTLINE_RULES)

    async def test_tools_load_guides_before_accepting_plan(self):
        model = AsyncMock()
        # First response tries to skip loading; the planner must ask again.
        model.ainvoke.side_effect = [AIMessage('{}'), AIMessage('', tool_calls=[
            {'name': 'load_skill', 'args': {'name': 'teach-code'}, 'id': 'load-1', 'type': 'tool_call'},
            {'name': 'load_skill', 'args': {'name': 'video-foundation'}, 'id': 'load-2', 'type': 'tool_call'}]), AIMessage('{}')]
        with patch.object(planner, 'get_tool_llm') as get, patch.object(planner, '_check', AsyncMock(return_value=({'scenes': []}, ''))) as check, \
                patch.object(settings, 'PLANNER_DEFAULT_STYLE', ''):  # no house style: only the two guides below
            get.return_value.bind_tools.return_value = model
            result = await planner.plan_video('Node.js', mode='tools')
        self.assertEqual(result.skills, ['teach-code', 'video-foundation'])
        self.assertEqual(result.llm_calls, 3)
        check.assert_awaited_once()
        prompt = model.ainvoke.call_args.args[0][0].content
        self.assertNotIn('Teach observable behavior', prompt)  # body arrived only via tool

    async def test_tools_can_be_disabled(self):
        model = AsyncMock(); model.ainvoke.return_value = AIMessage('{}')
        with patch.object(planner, 'get_tool_llm') as get, patch.object(planner, '_check', AsyncMock(return_value=({'scenes': []}, ''))):
            get.return_value.bind_tools.return_value = model
            result = await planner.plan_video('Node.js', mode='tools', skills=[])
            self.assertNotIn('load_skill', [t.name for t in get.return_value.bind_tools.call_args.args[0]])
            self.assertEqual(result.skills, [])

    async def test_long_video_persists_selection_and_passes_to_chapters(self):
        outline = {'title': 'Node.js', 'chapters': [{'title': 'Basics', 'goal': 'Learn the runtime', 'key_points': ['runtime'], 'minutes': 5}]}
        llm = AsyncMock(); llm.ainvoke.return_value = AIMessage(json.dumps(outline))
        with tempfile.TemporaryDirectory() as root, patch.object(settings, 'WORKSPACE_DIR', Path(root)), patch.object(long_video, 'get_llm', return_value=llm):
            state = await long_video.create_long_video('Node.js', 5)
            self.assertEqual(long_video.load(state.id).skills, ['video-foundation', 'iso-diagrams', 'teach-code', 'long-video-pacing'])
            self.assertIn('Teaching guide: teach-code', llm.ainvoke.call_args.args[0][0].content)
            spec = {'scenes': [{'narration': {'text': 'word ' * 750}}]}
            with patch.object(long_video, 'plan_video', AsyncMock(return_value=planner.Plan(spec, 1, 'catalog', 1, 10, 10))) as plan:
                await long_video.plan_chapter(state, 1)
                self.assertEqual(plan.call_args.kwargs['skills'], state.skills)
            disabled = await long_video.create_long_video('Node.js', 5, skills=[])
            self.assertEqual(long_video.load(disabled.id).skills, [])
            self.assertNotIn('Teaching guide:', llm.ainvoke.call_args.args[0][0].content)

    async def test_component_agent_exposes_and_loads_component_guide(self):
        from app.agent.component_agent import build_component
        model = AsyncMock()
        model.ainvoke.return_value = AIMessage('', tool_calls=[
            {'name': 'load_skill', 'args': {'name': 'write-scene'}, 'id': 'guide', 'type': 'tool_call'}])
        with patch.object(settings, 'AGENT_MAX_STEPS', 1), patch('app.agent.component_agent.get_tool_llm') as get:
            get.return_value.bind_tools.return_value = model
            result = await build_component('A clear diagram scene', skills=['write-scene'])
            self.addCleanup(shutil.rmtree, settings.WORKSPACE_DIR / 'jobs' / result.job_id)
            names = [t.name for t in get.return_value.bind_tools.call_args.args[0]]
            self.assertIn('load_skill', names)
            messages = model.ainvoke.call_args.args[0]
            self.assertTrue(any('meaningful data' in str(m.content) for m in messages[1:]))

    async def test_api_rejects_invalid_skills_before_model_call(self):
        from app.main import app
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            for endpoint, body in [('/plan', {'prompt': 'Node.js'}), ('/long', {'prompt': 'Node.js'}), ('/components', {'request': 'A useful new scene'})]:
                response = await client.post(endpoint, json={**body, 'skills': ['missing']})
                self.assertEqual(response.status_code, 422, response.text)


if __name__ == '__main__':
    unittest.main()


class StyleSelectionTests(unittest.TestCase):
    def test_house_style_for_any_topic_and_media_beats_side_mentions(self):
        from app.utils import skills
        picked = skills.select("Explain mass communication: print, radio, television, internet and social media, journalism")
        self.assertIn("iso-diagrams", picked)
        self.assertIn("teach-media", picked)
        self.assertNotIn("teach-networking", picked)  # "internet" is a side mention here
        with patch.object(settings, "PLANNER_DEFAULT_STYLE", ""):
            self.assertNotIn("iso-diagrams", skills.select("history of the printing press"))


class SkillSizeTests(unittest.TestCase):
    def test_every_skill_loads(self):
        """A skill over the size limit refuses to load and every plan that picks it fails."""
        from app.utils import skills
        for role in ("planner", "component"):
            for name in skills.discover(role):
                with self.subTest(skill=name):
                    skills.load(name, role)
