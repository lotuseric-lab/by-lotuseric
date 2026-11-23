import unittest
from decimal import Decimal
from config import BotConfig
from engine import estimated_net_profit, can_sell_at_target


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.config = BotConfig()

    def test_no_profit_when_price_unchanged(self):
        self.assertLess(estimated_net_profit(Decimal("100"), Decimal("100"), Decimal("1"), self.config), 0)

    def test_small_move_does_not_cover_costs(self):
        self.assertFalse(can_sell_at_target(Decimal("100"), Decimal("100.2"), Decimal("1"), self.config))

    def test_larger_move_passes_target(self):
        self.assertTrue(can_sell_at_target(Decimal("100"), Decimal("101"), Decimal("1"), self.config))

    def test_live_mode_is_blocked(self):
        with self.assertRaises(ValueError):
            BotConfig(paper_trading=False)


if __name__ == "__main__":
    unittest.main()
