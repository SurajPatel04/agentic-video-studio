"""Deepgram calls: at most DEEPGRAM_CONCURRENCY at once; 429 waits and retries instead of failing the chapter."""

import asyncio
import unittest
from unittest.mock import patch

import httpx

from app.config import settings
from app.utils import tts


class DeepgramLimitTests(unittest.IsolatedAsyncioTestCase):
    async def test_concurrency_cap_and_429_retry(self):
        live = peak = 0
        seen: dict[str, int] = {}

        async def fake_post(self, url, **kw):
            nonlocal live, peak
            live += 1
            peak = max(peak, live)
            await asyncio.sleep(0.01)
            live -= 1
            text = kw["json"]["text"]
            seen[text] = seen.get(text, 0) + 1
            if seen[text] == 1:  # every clip is rate-limited once
                return httpx.Response(429, text="Too Many Requests", headers={"retry-after": "0"})
            return httpx.Response(200, content=b"wav")

        with patch.object(settings, "DEEPGRAM_TTS_API_KEY", "k"), patch.object(settings, "DEEPGRAM_CONCURRENCY", 3), \
                patch.object(httpx.AsyncClient, "post", fake_post):
            out = await asyncio.gather(*(tts._request(f"clip {i}", "v") for i in range(12)))
        self.assertEqual(out, [b"wav"] * 12)
        self.assertLessEqual(peak, 3)
        self.assertEqual(set(seen.values()), {2})  # one 429, then success

    async def test_gives_up_after_retries_and_keeps_client_errors(self):
        calls = 0

        async def always(self, url, **kw):
            nonlocal calls
            calls += 1
            return httpx.Response(429 if "busy" in kw["json"]["text"] else 400, text="nope", headers={"retry-after": "0"})

        with patch.object(settings, "DEEPGRAM_TTS_API_KEY", "k"), patch.object(settings, "DEEPGRAM_RETRIES", 3), \
                patch.object(httpx.AsyncClient, "post", always):
            with self.assertRaisesRegex(RuntimeError, "TTS 429"):
                await tts._request("busy", "v")
            self.assertEqual(calls, 3)
            with self.assertRaisesRegex(RuntimeError, "TTS 400"):
                await tts._request("bad text", "v")
            self.assertEqual(calls, 4)  # a 400 is not retried


if __name__ == "__main__":
    unittest.main()
