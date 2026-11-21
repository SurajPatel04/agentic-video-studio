import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
from langchain_core.decisions import ChoiceAnswer, ClassifierResponse, NoulAnswer
from langchain_core.messages import AIMessage
from pydantic import SecretStr

from app.agent.videoGenerator import skills
from app.agent.videoGenerator.generator import plan_video
from app.agent.videoGenerator.nodes import plan_scenes as planner
from app.agent.videoGenerator.jobs import long_video
from app.config import settings

settings.SKILL_ROUTER = "keyword"  # offline tests: no skill-router LLM call (tested with a mock in test_skills)


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
        }  # make-ad is on request only ("ad": true), see test_make_ad_only_on_request
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

    def test_ai_lecture_selects_the_subject_guide_and_discoverable_scenes(self):
        from app.agent.videoGenerator.tools import catalog
        from app.utils import cues

        chosen = skills.select("Beginner lecture on neural networks and backpropagation")
        self.assertIn("teach-lecture", chosen)
        self.assertIn("teach-ai", chosen)
        self.assertIn("NeuralNetworkScene", skills.load("teach-ai"))
        for query, component, timing in [
            ("neural network backpropagation", "NeuralNetworkScene", ".steps[].at"),
            ("model evaluation confusion matrix", "ModelEvaluationScene", ".results[].at"),
            ("next token generation", "TextGenerationScene", ".turns[].selection.at"),
            ("retrieval augmented generation rag", "RAGScene", ".search.at"),
            ("decision tree path", "TreeScene", ".decisionPath[].at"),
        ]:
            with self.subTest(query=query):
                self.assertEqual(catalog.search_scenes(query, limit=1)[0][0], component)
                self.assertIn(timing, cues.timing_paths()[component])

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
            plan = await plan_video('How Node.js works', mode='catalog')
            prompt = model.ainvoke.call_args.args[0][0].content
            self.assertIn('Teaching guide: teach-code', prompt)
            self.assertIn('### CodeScene', prompt)
            self.assertIn('highlightLines', prompt)
            self.assertIn('overlay "terminal"', prompt)
            self.assertEqual(plan.skills, ['video-foundation', 'make-explainer', 'iso-diagrams', 'teach-code'])  # house style by default
            await plan_video('How Node.js works', mode='catalog', skills=[])
            self.assertNotIn('Teaching guide:', model.ainvoke.call_args.args[0][0].content)

    async def test_ad_plans_with_make_ad_and_its_length(self):
        model = AsyncMock()
        model.ainvoke.return_value = AIMessage('{}')
        with patch.object(settings, 'SKILL_ROUTER', 'keyword'), patch.object(planner, 'get_llm', return_value=model), \
                patch.object(planner, '_check', AsyncMock(return_value=({'scenes': []}, ''))):
            plan = await plan_video('TaskFlow, a to-do app for students', mode='catalog', ad=True, minutes=0.5)
        prompt = '\n'.join(m.content for m in model.ainvoke.call_args.args[0])
        self.assertIn('make-ad', plan.skills)
        self.assertIn('Teaching guide: make-ad', prompt)
        self.assertIn('advertisement (promo), about 30 seconds long', prompt)
        self.assertIn('about 75 spoken words', prompt)

    async def test_nontech_catalog_and_original_long_brief(self):
        model = AsyncMock(); model.ainvoke.return_value = AIMessage('{}')
        with patch.object(planner, 'get_llm', return_value=model), patch.object(planner, '_check', AsyncMock(return_value=({'scenes': []}, ''))):
            plan = await plan_video('An ad for a local bakery', mode='catalog', ad=True)
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

    async def test_source_is_the_only_content_for_short_and_long(self):
        source = 'Our bakery opened in 1998 in Pune. Sourdough takes 36 hours.'
        model = AsyncMock(); model.ainvoke.return_value = AIMessage('{}')
        with patch.object(planner, 'get_llm', return_value=model), patch.object(planner, '_check', AsyncMock(return_value=({'scenes': []}, ''))):
            await plan_video('A short video about our bakery', mode='catalog', source=source)
            prompt = '\n'.join(m.content for m in model.ainvoke.call_args.args[0])
            self.assertIn('SOURCE MATERIAL', prompt)
            self.assertIn(source, prompt)
            self.assertIn('clear factual error', prompt)
            await plan_video('A short video about our bakery', mode='catalog')
            self.assertNotIn('SOURCE MATERIAL', '\n'.join(m.content for m in model.ainvoke.call_args.args[0]))
        outline = long_video.Outline(title='Bakery', chapters=[long_video.ChapterOutline(
            title='History', goal='Tell the story', key_points=['1998'], minutes=3)])
        state = long_video._new_state('Our bakery', 3, outline, source=source)
        self.assertIn(source, long_video.chapter_context(state, 1))  # every chapter gets it
        model.ainvoke.reset_mock()
        model.ainvoke.return_value = AIMessage(outline.model_dump_json())
        with patch.object(long_video, 'get_llm', return_value=model):
            await long_video.make_outline('Our bakery', 3, source=source)
        self.assertIn(source, model.ainvoke.call_args.args[0][1].content)  # and the outline
        with patch.object(settings, 'SOURCE_MAX_CHARS', 10), self.assertRaises(ValueError):
            await plan_video('x', source=source)

    async def test_tools_preload_guides_and_common_scene_contracts(self):
        model = AsyncMock()
        model.ainvoke.return_value = AIMessage('{}')
        with patch.object(planner, 'get_tool_llm') as get, patch.object(planner, '_check', AsyncMock(return_value=({'scenes': []}, ''))) as check, \
                patch.object(settings, 'PLANNER_DEFAULT_STYLE', ''):  # no house style: only the two guides below
            get.return_value.bind_tools.return_value = model
            result = await plan_video('Node.js', mode='tools')
        self.assertCountEqual(result.skills, ['teach-code', 'video-foundation'])
        self.assertEqual(result.llm_calls, 1)
        check.assert_awaited_once()
        prompt = model.ainvoke.call_args.args[0][0].content
        self.assertIn('Teaching guide: teach-code', prompt)
        self.assertIn('### OutcomeComparisonScene', prompt)
        self.assertIn('### TerminalScene', prompt)
        names = [t.name for t in get.return_value.bind_tools.call_args.args[0]]
        self.assertIn('get_scene', names)
        self.assertIn('find_iso_objects', names)
        self.assertNotIn('load_skill', names)

    async def test_tools_can_be_disabled(self):
        model = AsyncMock(); model.ainvoke.return_value = AIMessage('{}')
        with patch.object(planner, 'get_tool_llm') as get, patch.object(planner, '_check', AsyncMock(return_value=({'scenes': []}, ''))):
            get.return_value.bind_tools.return_value = model
            result = await plan_video('Node.js', mode='tools', skills=[])
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
        from app.agent.videoGenerator.components.component_agent import build_component
        model = AsyncMock()
        model.ainvoke.return_value = AIMessage('', tool_calls=[
            {'name': 'load_skill', 'args': {'name': 'write-scene'}, 'id': 'guide', 'type': 'tool_call'}])
        with patch.object(settings, 'AGENT_MAX_STEPS', 1), patch('app.agent.videoGenerator.components.component_agent.get_tool_llm') as get:
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
            for endpoint, body in [
                ('/videos', {'prompt': 'Node.js'}),
                ('/videos', {'prompt': 'Node.js', 'length': 'long'}),
                ('/components', {'request': 'A useful new scene'}),
            ]:
                response = await client.post(endpoint, json={**body, 'skills': ['missing']})
                self.assertEqual(response.status_code, 422, response.text)


if __name__ == '__main__':
    unittest.main()


class StyleSelectionTests(unittest.TestCase):
    def test_house_style_for_any_topic_and_media_beats_side_mentions(self):
        from app.agent.videoGenerator import skills
        picked = skills.select("Explain mass communication: print, radio, television, internet and social media, journalism")
        self.assertIn("iso-diagrams", picked)
        self.assertIn("teach-media", picked)
        self.assertNotIn("teach-networking", picked)  # "internet" is a side mention here
        with patch.object(settings, "PLANNER_DEFAULT_STYLE", ""):
            self.assertNotIn("iso-diagrams", skills.select("history of the printing press"))


class SkillSizeTests(unittest.TestCase):
    def test_every_skill_loads(self):
        """A skill over the size limit refuses to load and every plan that picks it fails."""
        from app.agent.videoGenerator import skills
        for role in ("planner", "component"):
            for name in skills.discover(role):
                with self.subTest(skill=name):
                    skills.load(name, role)


class RouterTests(unittest.IsolatedAsyncioTestCase):
    """SKILL_ROUTER=llm: the LLM picks guides by meaning; keyword matches fill free slots; failures fall back."""

    async def route(self, topic, reply):
        from app.agent.videoGenerator.nodes import select_skills as skill_router
        llm = AsyncMock()
        llm.ainvoke.side_effect = reply if isinstance(reply, Exception) else [AIMessage(reply)]
        with patch.object(settings, "SKILL_ROUTER", "llm"), patch("app.agent.videoGenerator.nodes.select_skills.get_llm", return_value=llm):
            return await skill_router.route(topic)

    async def test_llm_finds_what_keywords_miss(self):
        self.assertNotIn("teach-networking", skills.select("How HTTPS keeps data private"))
        r = await self.route("How HTTPS keeps data private", '{"format": "make-explainer", "style": null, "subjects": ["teach-networking"]}')
        self.assertEqual(r.source, "llm")
        self.assertEqual(r.skills, ["video-foundation", "make-explainer", "iso-diagrams", "teach-networking"])

    async def test_bad_names_and_categories_are_dropped_and_keywords_kept(self):
        # "teach-code" is not a format; "nope" does not exist; keyword subject teach-dsa still fills a slot
        r = await self.route("Explain bubble sort", '```json\n{"format": "teach-code", "subjects": ["nope", "teach-code"]}\n```')
        self.assertEqual(r.skills, ["video-foundation", "make-explainer", "iso-diagrams", "teach-code", "teach-dsa"])

    async def test_at_most_two_subjects_llm_first(self):
        r = await self.route("Learn SQL joins", '{"subjects": ["teach-math", "teach-code", "teach-media"]}')
        self.assertEqual([s for s in r.skills if s.startswith("teach-")], ["teach-math", "teach-code"])

    async def test_ad_forces_make_ad_over_the_routers_format(self):
        from app.agent.videoGenerator.nodes import select_skills as skill_router
        llm = AsyncMock()
        llm.ainvoke.side_effect = [AIMessage('{"format": "make-explainer", "subjects": ["teach-code"]}')]
        with patch.object(settings, "SKILL_ROUTER", "llm"), patch("app.agent.videoGenerator.nodes.select_skills.get_llm", return_value=llm):
            r = await skill_router.route("TaskFlow, a to-do app for students", fmt="make-ad")
        self.assertEqual(r.skills[:4], ["video-foundation", "make-ad", "iso-diagrams", "teach-code"])
        self.assertNotIn("make-explainer", r.skills)
        r = await skill_router.route("anything", ["teach-code"], fmt="make-ad")  # requested guides + the ad guide
        self.assertEqual(r.skills, ["make-ad", "teach-code"])

    async def test_make_ad_only_on_request(self):
        from app.agent.videoGenerator.nodes import select_skills as skill_router
        for topic in ("Make a promo ad commercial for TaskFlow", "Teach how advertising campaigns work"):
            self.assertNotIn("make-ad", skills.select(topic))
            r = await self.route(topic, '{"format": "make-ad"}')  # the router cannot pick it either
            self.assertNotIn("make-ad", r.skills)
        self.assertNotIn("make-ad", skills.index())
        load = {t.name: t for t in skills.tools()}["load_skill"]
        self.assertIn("not enabled", load.invoke({"name": "make-ad"}))
        self.assertEqual(skills.select("anything", ["make-ad"]), ["make-ad"])  # naming it still works
        self.assertIn("make-ad", (await skill_router.route("TaskFlow", fmt="make-ad")).skills)

    async def test_failure_or_requested_skips_the_llm(self):
        r = await self.route("How HTTPS keeps data private", RuntimeError("gateway down"))
        self.assertEqual((r.source, r.skills), ("keyword (llm failed)", skills.select("How HTTPS keeps data private")))
        from app.agent.videoGenerator.nodes import select_skills as skill_router
        r = await skill_router.route("anything", ["teach-code"])
        self.assertEqual((r.source, r.skills, r.calls), ("requested", ["teach-code"], 0))

    async def test_typesafe_routes_in_one_request_and_records_usage(self):
        from app.agent.videoGenerator.nodes import select_skills as skill_router
        from app.utils.llm_accounting import collect_usage

        response = ClassifierResponse(
            model="jev-latest",
            answers={
                "format": ChoiceAnswer(type="choice", choice="make-explainer", confidence=1,
                                       probabilities={"make-explainer": 1}),
                "objective": ChoiceAnswer(type="choice", choice="trace", confidence=1, probabilities={"trace": 1}),
                "teach-data": NoulAnswer(type="noul", noul=0.9),
                "scene_QueryScene": NoulAnswer(type="noul", noul=0.95),
                "scene_TransactionScene": NoulAnswer(type="noul", noul=0.8),
                "scene_RAGScene": NoulAnswer(type="noul", noul=0.7),
                "scene_UnregisteredScene": NoulAnswer(type="noul", noul=1),
                "iso_0": NoulAnswer(type="noul", noul=0.9),  # - database
                "iso_2": NoulAnswer(type="noul", noul=0.2),  # an icon it rejects
                "overlay": ChoiceAnswer(type="choice", choice="lock", confidence=1, probabilities={"lock": 1}),
                "diagram": NoulAnswer(type="noul", noul=0.9),
            },
            usage={"input_tokens": 100, "output_tokens": 8, "total_tokens": 108},
        )
        classifier = AsyncMock()
        classifier.ainvoke.return_value = response
        with patch.object(settings, "SKILL_ROUTER", "typesafe"), \
                patch.object(settings, "TYPESAFE_API_KEY", SecretStr("test-key")), \
                patch("langchain_typesafe.TypeSafeClassifier", return_value=classifier), \
                patch.object(skill_router, "get_llm") as llm, collect_usage() as usage:
            routed = await skill_router.route("Follow a request through a database", long_video=True)

        classifier.ainvoke.assert_awaited_once()
        llm.assert_not_called()
        questions = classifier.ainvoke.await_args.args[0]["questions"]
        self.assertTrue({"format", "style", "objective", "teach-data"} <= questions.keys())
        self.assertIn("scene_QueryScene", questions)
        self.assertNotIn("scene_ExplainScene", questions)
        self.assertEqual((routed.source, routed.calls, routed.input_tokens, routed.output_tokens), ("typesafe", 1, 100, 8))
        self.assertEqual(routed.objective, "trace")
        self.assertIn("teach-data", routed.skills)
        self.assertIn("long-video-pacing", routed.skills)
        self.assertEqual(routed.scene_shortlist, ["QueryScene", "TransactionScene", "RAGScene"])  # best 3 above 0.5
        self.assertEqual(routed.prepicked, {"overlays": ["lock"], "iso": ["- database: tech"], "diagram": True})
        self.assertTrue({"iso_0", "overlay", "diagram"} <= questions.keys())
        self.assertNotIn("overlay", routed.llm_pick)
        self.assertEqual(usage.details.usage_details_calls, 1)

    async def test_no_diagram_leaves_out_iso_scene_and_picks_go_in_the_prompt(self):
        model = AsyncMock()
        model.ainvoke.return_value = AIMessage('{}')
        with patch.object(planner, 'get_tool_llm') as get, \
                patch.object(planner, '_check', AsyncMock(return_value=({'scenes': []}, ''))):
            get.return_value.bind_tools.return_value = model
            await plan_video('Bubble sort', mode='tools', skills=['iso-diagrams'], prepicked={"diagram": False})
            without = model.ainvoke.call_args.args[0][0].content
            await plan_video('Load balancing', mode='tools', skills=['iso-diagrams'],
                             prepicked={"diagram": True, "iso": ["- loadbalancer: tech"], "overlays": ["lock"]})
            with_picks = model.ainvoke.call_args.args[0][0].content
        self.assertNotIn('### IsoScene', without)
        self.assertIn('### IsoScene', with_picks)
        self.assertIn('Iso objects for this topic (use these before calling find_iso_objects):\n- loadbalancer: tech', with_picks)
        self.assertIn('overlay "lock"', with_picks)
        # the start of the prompt is the same for every topic (provider prompt caching)
        fixed_end = with_picks.index('Teaching guides')
        self.assertEqual(without[:fixed_end], with_picks[:fixed_end])

    async def test_typesafe_missing_key_or_error_uses_keyword_router(self):
        from app.agent.videoGenerator.nodes import select_skills as skill_router

        classify = AsyncMock(side_effect=RuntimeError("test error"))
        topic = "Explain bubble sort"
        with patch.object(settings, "SKILL_ROUTER", "typesafe"), patch.object(skill_router, "decide", classify):
            with patch.object(settings, "TYPESAFE_API_KEY", SecretStr("")):
                self.assertEqual((await skill_router.route(topic)).source, "keyword")
                classify.assert_not_awaited()
            with patch.object(settings, "TYPESAFE_API_KEY", SecretStr("test-key")):
                failed = await skill_router.route(topic)
        self.assertEqual((failed.source, failed.skills), ("keyword (typesafe failed)", skills.select(topic)))
