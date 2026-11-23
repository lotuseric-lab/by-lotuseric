"""Hybrid decision coordinator. LLM/news output is evidence, never an order."""
from collections import defaultdict
from core.events import BotSignal


class AIBrain:
    def __init__(self, min_confidence: float = 0.65, min_agreement: int = 2):
        self.min_confidence = min_confidence
        self.min_agreement = min_agreement

    def decide(self, signals: list[BotSignal]) -> dict:
        if not signals:
            return {"decision": "HOLD", "confidence": 0.0, "reason": "NO_SIGNALS"}
        by_side = defaultdict(list)
        for signal in signals:
            if signal.side in ("BUY", "SELL") and signal.bot != "news_hbr":
                by_side[signal.side].append(signal)
        ranked = sorted(by_side.items(), key=lambda item: sum(s.confidence for s in item[1]), reverse=True)
        if not ranked:
            return {"decision": "HOLD", "confidence": 0.0, "reason": "NO_ACTIONABLE_SIGNAL"}
        side, votes = ranked[0]
        confidence = sum(s.confidence for s in votes) / len(votes)
        if len(votes) < self.min_agreement or confidence < self.min_confidence:
            return {"decision": "HOLD", "confidence": confidence, "reason": "INSUFFICIENT_CONSENSUS"}
        return {"decision": side, "confidence": confidence, "reason": "BOT_CONSENSUS",
                "signal_ids": [s.signal_id for s in votes]}
