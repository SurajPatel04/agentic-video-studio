"""Brand: the logo intro + corner logo key is filled from BRAND_* settings; long videos show the intro once."""

import unittest
from unittest import mock

from app.config import settings
from app.utils.render import apply_brand, without_intro


def brand_settings(enabled=True, intro=True, watermark=True):
    return mock.patch.multiple(settings, BRAND_ENABLED=enabled, BRAND_INTRO=intro, BRAND_WATERMARK=watermark)


class BrandTest(unittest.TestCase):
    def test_defaults_left_to_renderer(self):
        with brand_settings():
            self.assertNotIn("brand", apply_brand({"scenes": []}))

    def test_settings_fill_missing_key(self):
        with brand_settings(enabled=False):
            self.assertIs(apply_brand({})["brand"], False)
        with brand_settings(intro=False):
            self.assertEqual(apply_brand({})["brand"], {"intro": False, "watermark": True})

    def test_json_wins(self):
        with brand_settings(enabled=False):
            self.assertEqual(apply_brand({"brand": {"size": 90}})["brand"], {"size": 90})

    def test_later_chapters_keep_logo_without_intro(self):
        with brand_settings():
            self.assertEqual(without_intro({})["brand"], {"intro": False})
            self.assertEqual(without_intro({"brand": {"corner": "top-left"}})["brand"], {"corner": "top-left", "intro": False})
            self.assertIs(without_intro({"brand": False})["brand"], False)


if __name__ == "__main__":
    unittest.main()
