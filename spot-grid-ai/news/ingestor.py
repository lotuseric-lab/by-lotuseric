"""Configurable RSS/Atom ingestion for all approved news categories."""
from dataclasses import dataclass
from hashlib import sha256
import xml.etree.ElementTree as ET
from typing import Literal
from urllib.parse import urlsplit, urlunsplit


Category = Literal["crypto_media", "exchange_official", "macro_calendar", "social"]


@dataclass(frozen=True)
class FeedConfig:
    key: str
    url: str
    category: Category
    trust_tier: Literal["official", "reputable", "unverified"] = "reputable"


@dataclass(frozen=True)
class NewsItem:
    source_key: str
    category: str
    trust_tier: str
    title: str
    summary: str
    url: str
    published_at: str | None
    dedupe_key: str


def _text(node: ET.Element, names: tuple[str, ...]) -> str:
    for name in names:
        found = node.find(name)
        if found is not None and found.text:
            return found.text.strip()
    return ""


def _canonical_url(url: str) -> str:
    parts = urlsplit(url.strip())
    if not parts.scheme or not parts.netloc:
        return url.strip()
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"), "", ""))


def parse_feed(xml_text: str, source: FeedConfig) -> list[NewsItem]:
    root = ET.fromstring(xml_text)
    items = root.findall(".//item")
    if not items:
        items = root.findall(".//{*}entry")
    parsed = []
    for node in items:
        title = _text(node, ("title", "{*}title"))
        summary = _text(node, ("description", "summary", "{*}summary", "{*}content"))
        link = _text(node, ("link",))
        if not link:
            link_node = node.find("{*}link")
            if link_node is not None:
                link = link_node.attrib.get("href", "")
        guid = _text(node, ("guid", "id", "{*}id"))
        published = _text(node, ("pubDate", "published", "updated", "{*}published", "{*}updated"))
        canonical = _canonical_url(link)
        dedupe_source = canonical or guid or f"{source.key}:{title}:{published}"
        dedupe_key = sha256(dedupe_source.encode("utf-8")).hexdigest()
        if title:
            parsed.append(NewsItem(
                source_key=source.key, category=source.category,
                trust_tier=source.trust_tier, title=title, summary=summary,
                url=canonical, published_at=published or None, dedupe_key=dedupe_key
            ))
    return parsed


async def fetch_feed(client, source: FeedConfig) -> list[NewsItem]:
    response = await client.get(source.url, timeout=15.0, follow_redirects=True)
    response.raise_for_status()
    return parse_feed(response.text, source)


async def fetch_all_feeds(sources: list[FeedConfig], diagnostics: dict | None = None) -> list[NewsItem]:
    """Fetch feeds concurrently and optionally report per-source errors."""
    import asyncio
    import httpx

    async with httpx.AsyncClient(headers={"User-Agent": "SmartGridAI-NewsBot/0.2"}) as client:
        results = await asyncio.gather(
            *(fetch_feed(client, source) for source in sources),
            return_exceptions=True,
        )
    items = []
    report = diagnostics if diagnostics is not None else {}
    for source, result in zip(sources, results):
        if isinstance(result, Exception):
            report[source.key] = {"status": "error", "error_type": type(result).__name__}
            continue
        report[source.key] = {"status": "ok", "fetched": len(result)}
        items.extend(result)
    unique = {item.dedupe_key: item for item in items}
    return list(unique.values())
