import unittest

from news.ingestor import NewsItem
from news.store import SupabaseNewsStore
from news.normalizer import analyze_news_item


class NewsStoreTests(unittest.TestCase):
    def setUp(self):
        self.item = NewsItem(
            source_key="sample", category="crypto_media", trust_tier="reputable",
            title="$BTC/USDT approval launch", summary="Partnership announced",
            url="https://example.test/story", published_at="2026-11-25T08:00:00Z",
            dedupe_key="a" * 64,
        )

    def test_analysis_extracts_explicit_symbols_and_no_order_authority(self):
        result = analyze_news_item(self.item)
        self.assertEqual(result["symbols"], ["BTC"])
        self.assertEqual(result["event_type"], "general")
        self.assertFalse(result["is_trade_authority"])

    def test_store_row_matches_database_contract(self):
        row = SupabaseNewsStore._row(self.item)
        self.assertEqual(row["source_key"], "sample")
        self.assertEqual(row["symbols"], ["BTC"])
        self.assertEqual(row["content_hash"], "a" * 64)
        self.assertEqual(row["payload"]["authority"], "evidence_only_no_order_permission")

    def test_invalid_publisher_timestamp_is_null(self):
        self.assertIsNone(SupabaseNewsStore._published_at("not-a-date"))


if __name__ == "__main__":
    unittest.main()
