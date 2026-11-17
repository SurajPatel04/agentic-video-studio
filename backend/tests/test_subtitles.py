"""Subtitle track / files: same lines and timing as the burned captions, shifted by transitions and the brand intro."""

import unittest
from unittest import mock

from app.config import settings
from app.utils import subtitles
from app.utils.render import set_caption_mode


def w(t, s, e):
    return {"t": t, "s": s, "e": e}


def spec(**top):
    return {"fps": 30, "width": 1920, "height": 1080, "brand": False, **top, "scenes": [
        {"id": "a", "component": "IsoScene", "durationInFrames": 120,
         "voice": {"words": [w("Hello", 10, 20), w("world.", 22, 40), w("Next", 70, 80)]}},
        {"id": "b", "component": "IsoScene", "durationInFrames": 90, "transition": {"type": "fade", "durationInFrames": 15},
         "voice": {"words": [w("Bye", 10, 25)]}},
    ]}


class SubtitleTest(unittest.TestCase):
    def test_lines_and_times(self):
        cues = subtitles.cues(spec())
        self.assertEqual([c.text for c in cues], ["Hello world.", "Next", "Bye"])
        self.assertAlmostEqual(cues[0].start, 7 / 30)
        self.assertAlmostEqual(cues[0].end, 67 / 30)  # until the next line (minus 3 frames)
        # scene b starts at 120 - 15 (fade overlap)
        self.assertAlmostEqual(cues[2].start, (105 + 7) / 30)

    def test_lines_never_overlap(self):
        cues = subtitles.cues(spec())
        for a, b in zip(cues, cues[1:]):
            self.assertLessEqual(a.end, b.start)

    def test_brand_intro_shifts_everything(self):
        plain = subtitles.cues(spec())
        branded = subtitles.cues(spec(brand={"introSeconds": 3}))
        self.assertAlmostEqual(branded[0].start - plain[0].start, (90 - subtitles.HANDOFF) / 30)
        self.assertEqual(subtitles.cues(spec(brand={"intro": False}))[0].start, plain[0].start)

    def test_srt_vtt_round_trip(self):
        cues = subtitles.cues(spec())
        srt = subtitles.to_srt(cues)
        self.assertIn("00:00:00,233 --> 00:00:02,233\nHello world.", srt)
        self.assertTrue(subtitles.to_vtt(cues).startswith("WEBVTT\n\n00:00:00.233 --> "))
        back = subtitles.parse_srt(srt)
        self.assertEqual([c.text for c in back], [c.text for c in cues])
        self.assertAlmostEqual(back[2].start, cues[2].start, places=3)

    def test_mode_from_argument_json_or_setting(self):
        with mock.patch.object(settings, "CAPTIONS_MODE", "track"):
            self.assertEqual(set_caption_mode({})["captions"], {"mode": "track"})
            self.assertEqual(set_caption_mode({"captions": {"mode": "burn"}})["captions"]["mode"], "burn")
            self.assertEqual(set_caption_mode({"captions": {"mode": "burn"}}, "both")["captions"]["mode"], "both")
            self.assertIs(set_caption_mode({"captions": False})["captions"], False)

    def test_mux_track_shown_by_default_only_in_track_mode(self):
        on = subtitles.mux_args(mock.sentinel.v, mock.sentinel.s, mock.sentinel.o, shown=True)
        off = subtitles.mux_args(mock.sentinel.v, mock.sentinel.s, mock.sentinel.o, shown=False)
        self.assertIn("mov_text", on)
        self.assertEqual(on[on.index("-disposition:s:0") + 1], "default")
        self.assertEqual(off[off.index("-disposition:s:0") + 1], "0")


if __name__ == "__main__":
    unittest.main()
