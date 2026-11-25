"""Optional Binance announcements stream; read-only and separate from order APIs."""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from urllib.parse import urlencode, urlsplit, parse_qs

from news.providers import _item, _spot_relevant

logger = logging.getLogger(__name__)
BASE_URL = "wss://api.binance.com/sapi/wss"
TOPIC = "com_announcement_en"


def build_binance_stream_url(api_secret: str, timestamp_ms: int | None = None,
                             random_value: str | None = None) -> str:
    params = {
        "random": random_value or secrets.token_hex(16),
        "topic": TOPIC,
        "recvWindow": "30000",
        "timestamp": str(timestamp_ms if timestamp_ms is not None else int(time.time() * 1000)),
    }
    # Binance documents a lexicographically sorted signing payload.
    signing_payload = urlencode(sorted(params.items()))
    signature = hmac.new(api_secret.encode("utf-8"), signing_payload.encode("utf-8"),
                         hashlib.sha256).hexdigest()
    return f"{BASE_URL}?{urlencode({**params, 'signature': signature})}"


def parse_binance_announcement(message: str | bytes):
    try:
        envelope = json.loads(message)
        if envelope.get("type") != "DATA" or envelope.get("topic") != TOPIC:
            return None
        data = envelope.get("data")
        if isinstance(data, str):
            data = json.loads(data)
        if not isinstance(data, dict):
            return None
        title = data.get("title", "")
        if not _spot_relevant(title):
            return None
        return _item(
            "binance_announcements", title, data.get("body", ""), "",
            data.get("publishDate"), category="exchange_official",
        )
    except (TypeError, ValueError, json.JSONDecodeError):
        return None


async def run_binance_announcements_worker(stop_event: asyncio.Event | None = None):
    """Persist official announcements. Requires an API key with no trading/withdrawal rights."""
    api_key = os.getenv("BINANCE_ANNOUNCEMENTS_API_KEY", "")
    api_secret = os.getenv("BINANCE_ANNOUNCEMENTS_API_SECRET", "")
    if not api_key or not api_secret:
        raise RuntimeError("Binance announcement API key and secret are not configured")
    try:
        from websockets.asyncio.client import connect
    except ImportError as exc:
        raise RuntimeError("Install the optional websockets dependency to run Binance stream worker") from exc

    from news.store import SupabaseNewsStore
    store = SupabaseNewsStore()
    if not store.configured:
        raise RuntimeError("Supabase server credentials are required for the Binance stream worker")

    backoff = 1
    while stop_event is None or not stop_event.is_set():
        try:
            url = build_binance_stream_url(api_secret)
            async with connect(
                url,
                additional_headers={"X-MBX-APIKEY": api_key},
                ping_interval=30,
                ping_timeout=60,
                close_timeout=10,
            ) as websocket:
                logger.info("Connected to Binance announcements stream")
                backoff = 1
                # Binance documents a maximum 24-hour connection lifetime.
                async with asyncio.timeout(23 * 60 * 60):
                    async for raw_message in websocket:
                        item = parse_binance_announcement(raw_message)
                        if item is not None:
                            await store.upsert_items([item])
            logger.info("Binance announcements stream closed; reconnecting")
        except asyncio.CancelledError:
            raise
        except TimeoutError:
            logger.info("Rotating Binance stream before the 24-hour connection limit")
        except Exception as exc:
            logger.warning("Binance announcement stream error: %s", type(exc).__name__)
        if stop_event is not None and stop_event.is_set():
            break
        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, 60)
