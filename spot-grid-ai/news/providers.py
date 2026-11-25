"""Read-only official exchange and curated social news providers."""
from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import os
import re
from urllib.parse import urlsplit, urlunsplit

from news.ingestor import NewsItem

_DERIVATIVE_ONLY = re.compile(r"\b(perpetual|perpetuals|futures|future contract|swap contract|options|margin trading)\b", re.I)


def _iso_timestamp(value) -> str | None:
    if value in (None, ""):
        return None
    try:
        number = float(value)
        seconds = number / 1000 if number > 10_000_000_000 else number
        return datetime.fromtimestamp(seconds, tz=timezone.utc).isoformat()
    except (TypeError, ValueError, OverflowError, OSError):
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc).isoformat()
        except ValueError:
            return None


def _canonical_url(value: str) -> str:
    parts = urlsplit((value or "").strip())
    if not parts.scheme or not parts.netloc:
        return ""
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"), "", ""))


def _item(source: str, title: str, summary: str, url: str, published, category="exchange_official") -> NewsItem | None:
    title = (title or "").strip()
    if not title:
        return None
    canonical = _canonical_url(url)
    published_at = _iso_timestamp(published)
    identity = canonical or f"{source}:{title}:{published_at or ''}"
    return NewsItem(
        source_key=source,
        category=category,
        trust_tier="official" if category == "exchange_official" else "unverified",
        title=title[:2000],
        summary=(summary or "")[:8000],
        url=canonical,
        published_at=published_at,
        dedupe_key=sha256(identity.encode("utf-8")).hexdigest(),
    )


def _spot_relevant(title: str, tags: list[str] | None = None) -> bool:
    lowered = (title or "").lower()
    if "spot" in lowered:
        return True
    if tags and any("spot" in str(tag).lower() for tag in tags):
        return True
    return not bool(_DERIVATIVE_ONLY.search(lowered))


async def fetch_okx_announcements(client) -> list[NewsItem]:
    """OKX public GET /api/v5/support/announcements, no API key."""
    response = await client.get(
        "https://www.okx.com/api/v5/support/announcements",
        params={"limit": "50", "page": "1"},
        timeout=15.0,
    )
    response.raise_for_status()
    payload = response.json()
    if str(payload.get("code", "")) != "0":
        raise RuntimeError("OKX announcements returned a non-zero API code")
    data = payload.get("data") or []
    if data and isinstance(data[0], dict) and isinstance(data[0].get("details"), list):
        rows = data[0]["details"]
    else:
        rows = data
    items = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        title = row.get("title", "")
        if not _spot_relevant(title):
            continue
        item = _item("okx_announcements", title, row.get("description", ""),
                     row.get("url", ""), row.get("pTime") or row.get("businessPTime"))
        if item:
            items.append(item)
    return items


async def fetch_bybit_announcements(client) -> list[NewsItem]:
    """Bybit public V5 announcements endpoint, no API key."""
    response = await client.get(
        "https://api.bybit.com/v5/announcements/index",
        params={"locale": "en-US", "page": "1", "limit": "50"},
        timeout=15.0,
    )
    response.raise_for_status()
    payload = response.json()
    if int(payload.get("retCode", -1)) != 0:
        raise RuntimeError("Bybit announcements returned a non-zero API code")
    rows = (payload.get("result") or {}).get("list") or []
    items = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        tags = row.get("tags") or []
        title = row.get("title", "")
        if not _spot_relevant(title, tags):
            continue
        item = _item("bybit_announcements", title, row.get("description", ""),
                     row.get("url", ""), row.get("publishTime") or row.get("dateTimestamp"))
        if item:
            items.append(item)
    return items


async def fetch_bluesky_actor_feed(client, actor: str) -> list[NewsItem]:
    """Read recent posts from an explicitly curated public Bluesky account."""
    response = await client.get(
        "https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed",
        params={"actor": actor, "limit": "30", "filter": "posts_no_replies"},
        timeout=15.0,
    )
    response.raise_for_status()
    payload = response.json()
    items = []
    for entry in payload.get("feed") or []:
        post = entry.get("post") or {}
        author = post.get("author") or {}
        record = post.get("record") or {}
        text = (record.get("text") or "").strip()
        if not text:
            continue
        uri = post.get("uri", "")
        rkey = uri.rsplit("/", 1)[-1] if uri else ""
        handle = author.get("handle") or actor
        url = f"https://bsky.app/profile/{handle}/post/{rkey}" if rkey else ""
        item = _item(
            f"bluesky:{actor}", text[:240], text, url,
            record.get("createdAt") or post.get("indexedAt"), category="social",
        )
        if item:
            items.append(item)
    return items


def configured_bluesky_actors(raw: str | None = None) -> list[str]:
    value = os.getenv("BLUESKY_ACTORS", "") if raw is None else raw
    actors = []
    for actor in value.split(","):
        actor = actor.strip().lstrip("@")
        if actor and actor not in actors:
            actors.append(actor)
    return actors


async def fetch_all_news(rss_sources, bluesky_actors: list[str] | None = None,
                         enable_official: bool | None = None,
                         diagnostics: dict | None = None) -> list[NewsItem]:
    """Fetch configured RSS, official exchange announcements and curated social posts."""
    import asyncio
    import httpx
    from news.ingestor import fetch_all_feeds

    if enable_official is None:
        enable_official = os.getenv("ENABLE_OFFICIAL_EXCHANGE_NEWS", "true").lower() in ("1", "true", "yes")
    actors = configured_bluesky_actors() if bluesky_actors is None else bluesky_actors
    report = diagnostics if diagnostics is not None else {}
    rss_diagnostics = {}
    rss_items = await fetch_all_feeds(rss_sources, diagnostics=rss_diagnostics)
    report["rss"] = {"configured": len(rss_sources), "fetched": len(rss_items),
                     "sources": rss_diagnostics}
    tasks = {}
    async with httpx.AsyncClient(headers={"User-Agent": "SmartGridAI-NewsBot/0.2"},
                                 follow_redirects=True) as client:
        if enable_official:
            tasks["okx_announcements"] = fetch_okx_announcements(client)
            tasks["bybit_announcements"] = fetch_bybit_announcements(client)
        for actor in actors:
            tasks[f"bluesky:{actor}"] = fetch_bluesky_actor_feed(client, actor)
        names = list(tasks)
        results = await asyncio.gather(*tasks.values(), return_exceptions=True) if tasks else []
    all_items = list(rss_items)
    for name, result in zip(names, results):
        if isinstance(result, Exception):
            report[name] = {"status": "error", "error_type": type(result).__name__}
            continue
        report[name] = {"status": "ok", "fetched": len(result)}
        all_items.extend(result)
    unique = {item.dedupe_key: item for item in all_items}
    report["unique_items"] = len(unique)
    return list(unique.values())
