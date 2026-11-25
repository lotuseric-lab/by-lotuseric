import unittest
from ai.grid_advisor import build_grid_preview


def sideways_candles(count=48):
    rows = []
    for i in range(count):
        close = 100 + 10 * __import__("math").sin(i * __import__("math").pi / 4)
        open_price = 100 + 10 * __import__("math").sin((i - 1) * __import__("math").pi / 4)
        rows.append([i * 300000, open_price, max(open_price, close) + 1.5, min(open_price, close) - 1.5, close, 1000])
    return rows


class GridAdvisorTests(unittest.TestCase):
    def test_sideways_market_returns_preview_without_order_authority(self):
        result = build_grid_preview(
            symbol="BTC/USDT", last=100, bid=99.99, ask=100.01,
            spread_rate=0.0002, quote_volume=10000000,
            candles=sideways_candles(), budget=100, grid_count=10,
        )
        self.assertTrue(result["eligible"], result["reason_codes"])
        self.assertEqual(len(result["levels"]), 11)
        self.assertFalse(result["order_creation_enabled"])

    def test_trending_market_is_rejected(self):
        rows = [[i * 300000, 100 + i, 101 + i, 99 + i, 100 + i, 1000] for i in range(48)]
        result = build_grid_preview(
            symbol="BTC/USDT", last=147, bid=146.9, ask=147.1,
            spread_rate=0.001, quote_volume=10000000,
            candles=rows, budget=100, grid_count=10,
        )
        self.assertFalse(result["eligible"])
        self.assertIn("TRENDING_OR_DIRECTIONAL_MARKET", result["reason_codes"])

    def test_derivative_symbol_is_rejected(self):
        with self.assertRaises(ValueError):
            build_grid_preview(
                symbol="BTC-USDT-SWAP", last=100, bid=99, ask=101,
                spread_rate=0.01, quote_volume=1, candles=sideways_candles(),
                budget=100, grid_count=10,
            )

    def test_grid_count_bounds_are_enforced(self):
        with self.assertRaises(ValueError):
            build_grid_preview(
                symbol="BTC/USDT", last=100, bid=99, ask=101,
                spread_rate=0.01, quote_volume=1, candles=sideways_candles(),
                budget=100, grid_count=40,
            )


if __name__ == "__main__":
    unittest.main()
