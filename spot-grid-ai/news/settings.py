"""Environment-based news feed configuration; URLs are supplied by operators."""
import json
import os

from news.ingestor import FeedConfig

ALLOWED_CATEGORIES = {
    "crypto_media", "exchange_official", "macro_calendar", "social"
}


def load_news_sources(raw: str | None = None) -> list[FeedConfig]:
    raw = os.getenv("NEWS_FEEDS_JSON", "[]") if raw is None else raw
    try:
        entries = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("NEWS_FEEDS_JSON must be valid JSON") from exc
    if not isinstance(entries, list):
        raise ValueError("NEWS_FEEDS_JSON must be a JSON array")

    sources = []
    seen = set()
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError("Each news feed must be an object")
        key, url, category = entry.get("key"), entry.get("url"), entry.get("category")
        trust = entry.get("trust_tier", "reputable")
        if not key or not isinstance(url, str) or not url.startswith(("https://", "http://")):
            raise ValueError("Each feed needs a key and an HTTP(S) URL")
        if category not in ALLOWED_CATEGORIES:
            raise ValueError(f"Unsupported news category: {category}")
        if trust not in ("official", "reputable", "unverified"):
            raise ValueError(f"Unsupported trust tier: {trust}")
        if key in seen:
            raise ValueError(f"Duplicate news feed key: {key}")
        seen.add(key)
        sources.append(FeedConfig(key=key, url=url, category=category, trust_tier=trust))
    return sources


def news_category_coverage(sources: list[FeedConfig]) -> dict[str, bool]:
    return {category: any(source.category == category for source in sources)
            for category in sorted(ALLOWED_CATEGORIES)}
