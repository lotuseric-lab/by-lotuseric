import unittest

from news.ingestor import FeedConfig, parse_feed
from news.settings import load_news_sources, news_category_coverage


class NewsIngestorTests(unittest.TestCase):
    def test_parse_rss_and_dedupe_key(self):
        xml = """<?xml version="1.0"?><rss><channel><item>
        <title>Exchange listing notice</title><description>Spot market notice</description>
        <link>https://example.test/article?id=3</link><pubDate>Tue, 24 Nov 2026 07:00:00 GMT</pubDate>
        </item></channel></rss>"""
        source = FeedConfig("exchange", "https://example.test/rss", "exchange_official", "official")
        item = parse_feed(xml, source)[0]
        self.assertEqual(item.category, "exchange_official")
        self.assertEqual(item.trust_tier, "official")
        self.assertEqual(len(item.dedupe_key), 64)

    def test_all_four_categories_are_supported(self):
        raw = """[
          {"key":"a","url":"https://a.test/rss","category":"crypto_media"},
          {"key":"b","url":"https://b.test/rss","category":"exchange_official"},
          {"key":"c","url":"https://c.test/rss","category":"macro_calendar"},
          {"key":"d","url":"https://d.test/rss","category":"social"}
        ]"""
        sources = load_news_sources(raw)
        self.assertTrue(all(news_category_coverage(sources).values()))

    def test_invalid_source_category_is_rejected(self):
        with self.assertRaises(ValueError):
            load_news_sources('[{"key":"x","url":"https://x.test","category":"unknown"}]')

    def test_duplicate_feed_key_is_rejected(self):
        raw = """[
          {"key":"x","url":"https://a.test","category":"social"},
          {"key":"x","url":"https://b.test","category":"social"}
        ]"""
        with self.assertRaises(ValueError):
            load_news_sources(raw)


if __name__ == "__main__":
    unittest.main()
