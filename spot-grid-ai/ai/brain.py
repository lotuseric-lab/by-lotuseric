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

        # Only the latest signal from each independent bot counts once.
        latest_by_bot = {}
        for signal in signals:
            if signal.bot == "news_hbr" or signal.side not in ("BUY", "SELL"):
                continue
            previous = latest_by_bot.get(signal.bot)
            if previous is None or signal.created_at > previous.created_at:
                latest_by_bot[signal.bot] = signal

        by_side = defaultdict(list)
        for signal in latest_by_bot.values():
            by_side[signal.side].append(signal)
        if not by_side:
            return {"decision": "HOLD", "confidence": 0.0, "reason": "NO_ACTIONABLE_SIGNAL"}

        totals = {side: sum(s.confidence for s in votes) for side, votes in by_side.items()}
        if len(totals) == 2:
            sides = list(totals)
            if abs(totals[sides[0]] - totals[sides[1]]) < 0.15:
                return {"decision": "HOLD", "confidence": 0.0, "reason": "CONFLICTING_SIGNALS"}

        side = max(totals, key=totals.get)
        votes = by_side[side]
        confidence = sum(s.confidence for s in votes) / len(votes)
        if len(votes) < self.min_agreement or confidence < self.min_confidence:
            return {"decision": "HOLD", "confidence": confidence, "reason": "INSUFFICIENT_CONSENSUS"}
        return {"decision": side, "confidence": confidence, "reason": "BOT_CONSENSUS",
                "signal_ids": [s.signal_id for s in votes]}

    def decide_with_news(self, signals: list[BotSignal], news_items: list[dict]) -> dict:
        """Attach symbol-matched news as context without allowing it to vote or alter a decision."""
        result = self.decide(signals)
        symbols = {signal.symbol for signal in signals}
        matched = []
        if len(symbols) == 1:
            base_asset = next(iter(symbols)).split("/", 1)[0]
            for item in news_items:
                item_symbols = set(item.get("symbols") or [])
                if base_asset not in item_symbols:
                    continue
                matched.append({
                    "dedupe_key": item.get("dedupe_key"),
                    "source_key": item.get("source_key"),
                    "source_category": item.get("source_category"),
                    "trust_tier": item.get("trust_tier"),
                    "event_type": item.get("event_type"),
                    "sentiment_score": item.get("sentiment_score"),
                    "published_at": item.get("published_at"),
                })
        result["news_evidence"] = matched[:10]
        result["news_effect"] = "context_only_no_vote"
        return result
