"""Captions keep the narration's spelling; timings come from speech-to-text."""

import unittest

from app.utils.tts import align


def heard(*words):
    return [{"word": w, "start": i * 0.5, "end": i * 0.5 + 0.4} for i, w in enumerate(words)]


class AlignTests(unittest.TestCase):
    def test_same_words_take_heard_times(self):
        out = align(["Hello,", "world."], heard("hello", "world"))
        self.assertEqual([w.text for w in out], ["Hello,", "world."])
        self.assertEqual((out[1].start, out[1].end), (0.5, 0.9))

    def test_misheard_word_keeps_narration_spelling(self):  # the "refile" bug
        out = align(["Call", "readFile", "now"], heard("call", "refile", "now"))
        self.assertEqual([w.text for w in out], ["Call", "readFile", "now"])
        self.assertEqual(out[1].start, 0.5)

    def test_one_word_heard_as_two_shares_their_span(self):
        out = align(["the", "readFile", "call"], heard("the", "read", "file", "call"))
        self.assertEqual([w.text for w in out], ["the", "readFile", "call"])
        self.assertEqual((out[1].start, out[1].end), (0.5, 1.4))

    def test_unheard_words_fit_between_neighbours(self):
        out = align(["a", "b", "c", "d"], heard("a", "d"))
        self.assertEqual([w.text for w in out], ["a", "b", "c", "d"])
        self.assertTrue(out[0].end <= out[1].start < out[2].start < out[3].start)


if __name__ == "__main__":
    unittest.main()
