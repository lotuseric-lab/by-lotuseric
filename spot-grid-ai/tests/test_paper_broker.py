import tempfile
import unittest
from decimal import Decimal
from pathlib import Path

from config import BotConfig
from core.portfolio import PortfolioLedger
from core.paper_broker import PaperBroker


class PaperBrokerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.ledger = PortfolioLedger(str(Path(self.temp.name) / "paper.sqlite3"))
        self.config = BotConfig()
        self.broker = PaperBroker(self.ledger, self.config)

    def tearDown(self):
        self.temp.cleanup()

    def test_buy_fill_debits_quote_and_credits_base_after_costs(self):
        self.ledger.set_balance("USDT", Decimal("1000"))
        fill = self.broker.submit_limit("BTC/USDT", "BUY", Decimal("0.01"),
                                        Decimal("101"), Decimal("99"), Decimal("100"))
        self.assertEqual(fill.status, "FILLED")
        self.assertGreater(self.ledger.get_balance("BTC"), Decimal("0"))
        self.assertLess(self.ledger.get_balance("USDT"), Decimal("1000"))

    def test_sell_requires_base_balance(self):
        with self.assertRaises(ValueError):
            self.broker.submit_limit("BTC/USDT", "SELL", Decimal("0.01"),
                                     Decimal("99"), Decimal("100"), Decimal("101"))

    def test_non_crossing_limit_is_not_filled(self):
        self.ledger.set_balance("USDT", Decimal("1000"))
        fill = self.broker.submit_limit("BTC/USDT", "BUY", Decimal("0.01"),
                                        Decimal("90"), Decimal("99"), Decimal("100"))
        self.assertEqual(fill.status, "NOT_FILLED")
        self.assertEqual(self.ledger.get_balance("USDT"), Decimal("1000"))

    def test_duplicate_fill_id_is_rejected(self):
        self.ledger.set_balance("USDT", Decimal("1000"))
        self.ledger.apply_fill("same-id", "BTC/USDT", "BUY", Decimal("0.001"),
                               Decimal("100"), Decimal("0.1"))
        with self.assertRaises(ValueError):
            self.ledger.apply_fill("same-id", "BTC/USDT", "BUY", Decimal("0.001"),
                                   Decimal("100"), Decimal("0.1"))


if __name__ == "__main__":
    unittest.main()
