"""Deterministic news enrichment. Outputs evidence only, never trade instructions."""
import re

from news.ingestor import NewsItem

_SYMBOL_PATTERNS = (
    re.compile(r"\$([A-Z0-9]{2,12})\b"),
    re.compile(r"\b([A-Z0-9]{2,12})\s*/\s*USDT\b"),
    re.compile(r"\b([A-Z0-9]{2,12})-USDT\b"),
)
_EVENT_KEYWORDS = {
    "listing": ("listing", "will list", "new trading pair", "delisting", "trading suspension"),
    "security": ("hack", "exploit", "漏洞", "security incident", "breach", "stolen"),
    "regulation": ("sec", "regulation", "regulatory", "lawsuit", "court", "ban"),
    "macro": ("federal reserve", "fed rate", "interest rate", "inflation", "cpi", "fomc"),
    "market_structure": ("etf", "liquidation", "market maker", "exchange outage"),
}
_POSITIVE = ("approval", "approved", "launch", "inflow", "partnership", "upgrade", "record high")
_NEGATIVE = ("hack", "exploit", "lawsuit", "ban", "outflow", "halt", "delist", "breach")


def analyze_news_item(item: NewsItem) -> dict:
    title = item.title or ""
    text = f"{title} {item.summary or ''}".lower()
    symbols = set()
    source = f"{item.title or ''} {item.summary or ''}"
    for pattern in _SYMBOL_PATTERNS:
        symbols.update(match.group(1) for match in pattern.finditer(source))
    event_type = "general"
    for kind, keywords in _EVENT_KEYWORDS.items():
        if any(keyword in text for keyword in keywords):
            event_type = kind
            break
    positive = sum(text.count(word) for word in _POSITIVE)
    negative = sum(text.count(word) for word in _NEGATIVE)
    # Small deterministic heuristic, explicitly not a trained sentiment model.
    sentiment = max(-1.0, min(1.0, (positive - negative) * 0.2))
    return {
        "symbols": sorted(symbols),
        "event_type": event_type,
        "sentiment_score": round(sentiment, 5),
        "analysis_method": "keyword_heuristic_v1",
        "is_trade_authority": False,
    }
