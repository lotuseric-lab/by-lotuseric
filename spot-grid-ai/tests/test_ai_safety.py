import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from ai.training import ModelEvaluation, can_promote
from core.risk import RiskContext, RiskEngine
from core.events import BotSignal, OrderIntent
from ai.brain import AIBrain


class AISafetyTests(unittest.TestCase):
    def test_news_only_signal_does_not_trigger_decision(self):
        signal = BotSignal(bot="news_hbr", symbol="BTC/USDT", side="BUY", confidence=0.99, reason="headline")
        self.assertEqual(AIBrain().decide([signal])["decision"], "HOLD")

    def test_live_is_blocked(self):
        verdict = RiskEngine().evaluate("BUY", Decimal("0.01"), RiskContext(mode="live"))
        self.assertFalse(verdict.allowed)
        self.assertIn("LIVE_MODE_DISABLED_IN_V1", verdict.reason_codes)

    def test_stale_data_is_blocked(self):
        verdict = RiskEngine().evaluate("BUY", Decimal("0.01"), RiskContext(market_data_fresh=False))
        self.assertFalse(verdict.allowed)

    def test_spot_sell_requires_free_base_balance(self):
        verdict = RiskEngine().evaluate("SELL", Decimal("2"), RiskContext(free_base_balance=Decimal("1")))
        self.assertIn("INSUFFICIENT_FREE_BASE_ASSET", verdict.reason_codes)

    def test_live_order_intent_cannot_be_constructed(self):
        with self.assertRaises(ValueError):
            OrderIntent(symbol="BTC/USDT", side="BUY", quantity=Decimal("0.01"),
                        strategy="grid", reservation_id="r1", paper=False)

    def test_candidate_model_never_auto_promotes(self):
        now = datetime.now(timezone.utc)
        candidate = ModelEvaluation("regime", "0.1", now, now - timedelta(days=30),
                                    0.8, 0.8, 0.8, 1000, True)
        self.assertFalse(can_promote(candidate)[0])
        self.assertEqual(can_promote(candidate)[1], "MANUAL_APPROVAL_REQUIRED")


if __name__ == "__main__":
    unittest.main()
