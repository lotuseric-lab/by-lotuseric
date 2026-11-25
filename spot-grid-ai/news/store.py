"""Server-side Supabase Data API adapter for the isolated spot_grid schema."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from hashlib import sha256
from typing import Iterable

import httpx

from news.ingestor import NewsItem
from news.normalizer import analyze_news_item


class SupabaseNewsStore:
    """Uses only server-side service-role credentials; never expose these to clients."""

    def __init__(self, url: str | None = None, service_role_key: str | None = None):
        self.url = (url if url is not None else os.getenv("SUPABASE_URL", "")).rstrip("/")
        self.key = service_role_key if service_role_key is not None else os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        self.timeout = float(os.getenv("SUPABASE_HTTP_TIMEOUT", "15"))

    @property
    def configured(self) -> bool:
        return bool(self.url and self.key)

    def _headers(self) -> dict[str, str]:
        if not self.configured:
            raise RuntimeError("Supabase news storage is not configured")
        return {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
            "Accept-Profile": "spot_grid",
            "Content-Profile": "spot_grid",
            "Prefer": "resolution=ignore-duplicates,return=minimal",
        }

    @staticmethod
    def _published_at(value: str | None) -> str | None:
        if not value:
            return None
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc).isoformat()
        except ValueError:
            # Preserve the raw publisher timestamp in payload, but don't write
            # an invalid timestamp into the timestamptz column.
            return None

    @staticmethod
    def _row(item: NewsItem) -> dict:
        analysis = analyze_news_item(item)
        return {
            "source_key": item.source_key,
            "source_category": item.category,
            "trust_tier": item.trust_tier,
            "canonical_url": item.url or None,
            "dedupe_key": item.dedupe_key,
            "published_at": SupabaseNewsStore._published_at(item.published_at),
            "symbols": analysis["symbols"],
            "event_type": analysis["event_type"],
            "sentiment_score": analysis["sentiment_score"],
            "summary": item.summary[:8000],
            "content_hash": sha256(f"{item.title}\\n{item.summary}".encode("utf-8")).hexdigest(),
            "payload": {
                "title": item.title[:2000],
                "raw_published_at": item.published_at,
                "analysis": analysis,
                "authority": "evidence_only_no_order_permission",
            },
        }

    async def upsert_items(self, items: Iterable[NewsItem]) -> int:
        rows = [self._row(item) for item in items]
        if not rows:
            return 0
        if not self.configured:
            raise RuntimeError("Supabase news storage is not configured")
        url = f"{self.url}/rest/v1/news_events"
        headers = self._headers()
        headers["Prefer"] = "resolution=ignore-duplicates,return=minimal"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                url, params={"on_conflict": "dedupe_key"}, headers=headers, json=rows
            )
        if response.is_error:
            raise RuntimeError(
                f"Supabase news write failed ({response.status_code}); "
                "check Data API exposure for spot_grid and service_role grants"
            )
        # PostgREST minimal responses do not report inserted row counts.
        # Return submitted unique rows, not a claim of newly inserted rows.
        return len(rows)

    async def insert_market_snapshot(self, snapshot: dict) -> None:
        """Append a public market snapshot; no exchange private endpoint is used."""
        if not self.configured:
            raise RuntimeError("Supabase market storage is not configured")
        row = {
            "exchange": snapshot["exchange"],
            "symbol": snapshot["symbol"],
            "timeframe": snapshot["timeframe"],
            "observed_at": snapshot["observed_at"],
            "payload": snapshot,
        }
        headers = self._headers()
        headers["Prefer"] = "return=minimal"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.url}/rest/v1/market_snapshots", headers=headers, json=row
            )
        if response.is_error:
            raise RuntimeError(
                f"Supabase market snapshot write failed ({response.status_code}); "
                "check Data API exposure for spot_grid and service_role grants"
            )

    async def latest_for_symbol(self, symbol: str, limit: int = 50) -> list[dict]:
        """Read news explicitly tagged with the requested base-asset ticker."""
        if not self.configured:
            raise RuntimeError("Supabase news storage is not configured")
        base_asset = symbol.split("/", 1)[0].strip().upper()
        headers = self._headers()
        headers.pop("Content-Profile", None)
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.url}/rest/v1/news_events",
                params={
                    "select": "source_key,source_category,trust_tier,canonical_url,dedupe_key,published_at,fetched_at,symbols,event_type,sentiment_score,summary,payload",
                    "symbols": f"cs.{{{base_asset}}}",
                    "order": "published_at.desc.nullslast,fetched_at.desc",
                    "limit": max(1, min(int(limit), 200)),
                },
                headers=headers,
            )
        if response.is_error:
            raise RuntimeError(f"Supabase symbol news read failed ({response.status_code})")
        data = response.json()
        return data if isinstance(data, list) else []

    async def latest_signals(self, exchange: str, symbol: str, limit: int = 50) -> list[dict]:
        """Read recent bot evidence for one exact spot market."""
        if not self.configured:
            raise RuntimeError("Supabase signal storage is not configured")
        headers = self._headers()
        headers.pop("Content-Profile", None)
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.url}/rest/v1/bot_signals",
                params={
                    "select": "id,bot_key,exchange,symbol,side,confidence,reason,evidence,created_at,expires_at",
                    "exchange": f"eq.{exchange}",
                    "symbol": f"eq.{symbol}",
                    "order": "created_at.desc",
                    "limit": max(1, min(int(limit), 200)),
                },
                headers=headers,
            )
        if response.is_error:
            raise RuntimeError(f"Supabase bot signal read failed ({response.status_code})")
        data = response.json()
        return data if isinstance(data, list) else []

    async def latest(self, limit: int = 50) -> list[dict]:
        if not self.configured:
            raise RuntimeError("Supabase news storage is not configured")
        headers = self._headers()
        headers.pop("Content-Profile", None)
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.url}/rest/v1/news_events",
                params={
                    "select": "source_key,source_category,trust_tier,canonical_url,dedupe_key,published_at,fetched_at,symbols,event_type,sentiment_score,summary,payload",
                    "order": "published_at.desc.nullslast,fetched_at.desc",
                    "limit": max(1, min(int(limit), 200)),
                },
                headers=headers,
            )
        if response.is_error:
            raise RuntimeError(
                f"Supabase news read failed ({response.status_code}); "
                "check Data API exposure for spot_grid and service_role grants"
            )
        data = response.json()
        return data if isinstance(data, list) else []
