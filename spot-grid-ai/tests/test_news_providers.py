import unittest

from news.providers import (
    _iso_timestamp, _spot_relevant, configured_bluesky_actors,
    fetch_bybit_announcements, fetch_bluesky_actor_feed, fetch_okx_announcements,
)


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload
    def raise_for_status(self):
        return None
    def json(self):
        return self.payload


class FakeClient:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []
    async def get(self, url, params=None, timeout=None):
        self.calls.append((url, params))
        return FakeResponse(self.payload)


class NewsProviderTests(unittest.IsolatedAsyncioTestCase):
    def test_timestamp_milliseconds_and_seconds(self):
        self.assertTrue(_iso_timestamp(1795593600000).startswith("2026-11-25"))
        self.assertTrue(_iso_timestamp(1795593600).startswith("2026-11-25"))

    def test_derivative_only_news_is_filtered(self):
        self.assertFalse(_spot_relevant("New BTC perpetual futures contract"))
        self.assertTrue(_spot_relevant("New BTC/USDT spot listing"))
        self.assertTrue(_spot_relevant("Exchange system maintenance"))

    def test_bluesky_actor_config_is_deduplicated(self):
        self.assertEqual(configured_bluesky_actors("@a.test, b.test, a.test"), ["a.test", "b.test"])

    async def test_okx_public_announcements_are_normalized(self):
        client = FakeClient({"code": "0", "data": [
            {"title": "BTC/USDT spot listing", "url": "https://www.okx.com/help/a",
             "pTime": "1795593600000"},
            {"title": "BTC perpetual contract update", "url": "https://www.okx.com/help/b",
             "pTime": "1795593600000"},
        ]})
        items = await fetch_okx_announcements(client)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].source_key, "okx_announcements")
        self.assertEqual(items[0].trust_tier, "official")

    async def test_bybit_public_announcements_are_normalized(self):
        client = FakeClient({"retCode": 0, "result": {"list": [
            {"title": "Spot listing for ABC", "description": "Spot market",
             "url": "https://announcements.bybit.com/a", "publishTime": 1795593600000,
             "tags": ["Spot"]},
        ]}})
        items = await fetch_bybit_announcements(client)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].category, "exchange_official")

    async def test_bluesky_curated_actor_feed_is_unverified_evidence(self):
        client = FakeClient({"feed": [{
            "post": {"uri": "at://did:plc:abc/app.bsky.feed.post/xyz",
                     "indexedAt": "2026-11-25T08:00:00Z",
                     "author": {"handle": "analyst.bsky.social"},
                     "record": {"text": "$BTC market update", "createdAt": "2026-11-25T08:00:00Z"}},
        }]})
        items = await fetch_bluesky_actor_feed(client, "analyst.bsky.social")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].category, "social")
        self.assertEqual(items[0].trust_tier, "unverified")
        self.assertIn("/post/xyz", items[0].url)


if __name__ == "__main__":
    unittest.main()
