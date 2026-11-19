import asyncio
import unittest

from langchain_core.messages import AIMessage

from app.agent.videoGenerator.jobs.long_video import _total_tokens
from app.agent.videoGenerator.state.long_video import ChapterState, LongState
from app.utils.llm_accounting import ModelRates, SavedUsage, UsageDetails, collect_usage, record_usage


class UsageAccountingTests(unittest.IsolatedAsyncioTestCase):
    async def test_concurrent_chapters_collect_their_own_usage_and_cost(self):
        async def one(cached):
            with collect_usage() as collected:
                await asyncio.sleep(0)
                record_usage(AIMessage("", response_metadata={"model_name": "model"}),
                             {"input_tokens": 1000, "output_tokens": 100,
                              "input_token_details": {"cache_read": cached},
                              "output_token_details": {"cache_read": 20}},
                             {"model": ModelRates(input=2, cached_input=1, output=4, cached_output=2)})
                return collected.details

        first, second = await asyncio.gather(one(100), one(500))
        self.assertEqual(first.cached_input_tokens, 100)
        self.assertEqual(second.cached_input_tokens, 500)
        state = LongState.model_construct(chapters=[
            ChapterState(n=1, llm_calls=1, input_tokens=1000, output_tokens=100, **first.model_dump()),
            ChapterState(n=2, llm_calls=1, input_tokens=1000, output_tokens=100, **second.model_dump()),
        ])
        _total_tokens(state, (1, 10, 10), UsageDetails(priced_llm_calls=1, known_llm_cost_usd=.001))
        self.assertEqual(state.cached_input_tokens, 600)
        self.assertEqual(state.cached_output_tokens, 40)
        self.assertAlmostEqual(state.total_llm_cost_usd, .00512)

    def test_historical_cost_is_unknown(self):
        saved = SavedUsage.model_validate({"llm_calls": 15, "input_tokens": 119838, "output_tokens": 21447})
        self.assertIsNone(saved.total_llm_cost_usd)
        self.assertEqual(saved.usage_details_calls, 0)

    def test_provider_cost_takes_precedence(self):
        with collect_usage() as collected:
            record_usage(AIMessage("", response_metadata={"cost_usd": 0.012}), {}, {})
        saved = SavedUsage(llm_calls=1, **collected.details.model_dump())
        self.assertEqual(saved.total_llm_cost_usd, .012)
