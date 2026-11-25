import json
import unittest
from urllib.parse import parse_qs, urlsplit
import hashlib
import hmac
from urllib.parse import urlencode

from news.binance_stream import build_binance_stream_url, parse_binance_announcement


class BinanceStreamTests(unittest.TestCase):
    def test_stream_url_signature_matches_sorted_payload(self):
        url = build_binance_stream_url("test-secret", timestamp_ms=123456789, random_value="abc123")
        parsed = urlsplit(url)
        params = parse_qs(parsed.query)
        unsigned = {key: params[key][0] for key in ("random", "topic", "recvWindow", "timestamp")}
        payload = urlencode(sorted(unsigned.items()))
        expected = hmac.new(b"test-secret", payload.encode(), hashlib.sha256).hexdigest()
        self.assertEqual(params["signature"][0], expected)
        self.assertEqual(params["topic"][0], "com_announcement_en")

    def test_parse_official_spot_announcement(self):
        raw = json.dumps({
            "type": "DATA", "topic": "com_announcement_en",
            "data": json.dumps({
                "catalogName": "New Listing", "publishDate": 1795593600000,
                "title": "Binance will list ABC on Spot",
                "body": "ABC/USDT spot trading will open soon",
            }),
        })
        item = parse_binance_announcement(raw)
        self.assertIsNotNone(item)
        self.assertEqual(item.source_key, "binance_announcements")
        self.assertEqual(item.trust_tier, "official")
        self.assertEqual(item.category, "exchange_official")

    def test_derivative_only_announcement_is_ignored(self):
        raw = json.dumps({
            "type": "DATA", "topic": "com_announcement_en",
            "data": {"title": "New perpetual futures contract", "body": "Futures"},
        })
        self.assertIsNone(parse_binance_announcement(raw))

    def test_non_data_messages_are_ignored(self):
        self.assertIsNone(parse_binance_announcement('{"type":"COMMAND","data":"SUCCESS"}'))


if __name__ == "__main__":
    unittest.main()
