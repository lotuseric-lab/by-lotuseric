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


    def test_ticker_scan_rejects_unsupported_exchange(self):
        response = self.client.get("/api/spot/tickers?exchange=unknown")
        self.assertEqual(response.status_code, 400)

    def test_grid_session_rejects_derivative_symbol(self):
        response = self.client.post("/api/grid/sessions", json={"symbol":"BTC-USDT-SWAP","exchange":"okx"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("BASE/USDT", response.json()["detail"])

    def test_grid_session_rejects_unsupported_exchange(self):
        response = self.client.post("/api/grid/sessions", json={"symbol":"BTC/USDT","exchange":"unknown"})
        self.assertEqual(response.status_code, 400)

    def test_grid_sessions_require_server_credentials(self):
        with __import__("unittest").mock.patch("grid.store.SupabaseGridStore.configured", new_callable=__import__("unittest").mock.PropertyMock, return_value=False):
            response = self.client.get("/api/grid/sessions?exchange=okx")
        self.assertEqual(response.status_code, 503)

    def test_news_sync_is_disabled_without_server_token(self):
        response = self.client.post("/api/news/sync")
        self.assertEqual(response.status_code, 503)
        self.assertIn("SMART_GRID_SYNC_TOKEN", response.json()["detail"])

    def test_ai_preview_rejects_derivative_symbols(self):
        response = self.client.get("/api/ai/decision-preview?symbol=BTC-USDT-SWAP")
        self.assertEqual(response.status_code, 400)
        self.assertIn("BASE/USDT", response.json()["detail"])

    def test_ai_preview_rejects_unsupported_exchange(self):
        response = self.client.get("/api/ai/decision-preview?symbol=BTC/USDT&exchange=unknown")
        self.assertEqual(response.status_code, 400)

    def test_news_coverage_exposes_all_source_categories(self):
        response = self.client.get("/api/news/coverage")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            set(response.json()["categories"]),
            {"crypto_media", "exchange_official", "macro_calendar", "social"},
        )


if __name__ == "__main__":
    unittest.main()
