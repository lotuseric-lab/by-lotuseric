import unittest
from fastapi.testclient import TestClient

from app import app


class ApiSmokeTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_is_paper_only(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["market"], "spot_only")
        self.assertEqual(body["trading_mode"], "paper_only")
        self.assertFalse(body["live_trading_enabled"])

    def test_news_coverage_exposes_all_source_categories(self):
        response = self.client.get("/api/news/coverage")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            set(response.json()["categories"]),
            {"crypto_media", "exchange_official", "macro_calendar", "social"},
        )


if __name__ == "__main__":
    unittest.main()
