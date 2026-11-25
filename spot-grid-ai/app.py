"""Read-only market API and guarded paper-mode news persistence service."""
import hmac
import os
from datetime import datetime, timezone

from fastapi import FastAPI, Header, HTTPException, Query

from config import BotConfig, SUPPORTED_EXCHANGES
from ai.brain import AIBrain
from core.events import BotSignal
from data.market_feed import PublicSpotFeed
from news.providers import configured_bluesky_actors, fetch_all_news
from news.settings import load_news_sources, news_category_coverage
from news.store import SupabaseNewsStore

app = FastAPI(title="Smart Grid AI — Spot", version="0.2.0")


def _parse_datetime(value: str | None):
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed


@app.get("/health")
def health():
    store = SupabaseNewsStore()
    return {
        "status": "ok",
        "market": "spot_only",
        "trading_mode": "paper_only",
        "live_trading_enabled": False,
        "news_storage_configured": store.configured,
    }


@app.get("/api/spot/symbols")
def spot_symbols(exchange: str = Query("okx")):
    if exchange not in SUPPORTED_EXCHANGES:
        raise HTTPException(status_code=400, detail="Unsupported exchange")
    feed = PublicSpotFeed(BotConfig(exchange=exchange))
    try:
        symbols = feed.discover_symbols()
        return {"exchange": exchange, "quote": "USDT", "count": len(symbols), "symbols": symbols}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Market discovery failed: {type(exc).__name__}")
    finally:
        feed.close()


@app.get("/api/spot/snapshot")
async def spot_snapshot(
    symbol: str,
    exchange: str = Query("okx"),
    timeframe: str = Query("5m", pattern=r"^(1m|3m|5m|15m|1h|4h|1d)$"),
):
    if exchange not in SUPPORTED_EXCHANGES:
        raise HTTPException(status_code=400, detail="Unsupported exchange")
    feed = PublicSpotFeed(BotConfig(exchange=exchange))
    try:
        snapshot = feed.fetch_snapshot(symbol, timeframe=timeframe)
        result = {
            "exchange": snapshot.exchange, "symbol": snapshot.symbol,
            "timeframe": timeframe, "observed_at": snapshot.observed_at.isoformat(),
            "bid": snapshot.bid, "ask": snapshot.ask, "last": snapshot.last,
            "base_volume": snapshot.base_volume, "quote_volume": snapshot.quote_volume,
            "spread_rate": snapshot.spread_rate, "bids": snapshot.bids,
            "asks": snapshot.asks, "candles": snapshot.candles,
        }
        store = SupabaseNewsStore()
        persist_snapshots = os.getenv("PERSIST_MARKET_SNAPSHOTS", "false").lower() in ("1", "true", "yes")
        if not persist_snapshots:
            result["persistence"] = "disabled_by_default"
        elif store.configured:
            try:
                await store.insert_market_snapshot(result)
                result["persistence"] = "saved"
            except Exception:
                result["persistence"] = "failed"
        else:
            result["persistence"] = "not_configured"
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Market snapshot failed: {type(exc).__name__}")
    finally:
        feed.close()


@app.get("/api/news/coverage")
def news_coverage():
    sources = load_news_sources()
    store = SupabaseNewsStore()
    categories = news_category_coverage(sources)
    official_enabled = os.getenv("ENABLE_OFFICIAL_EXCHANGE_NEWS", "true").lower() in ("1", "true", "yes")
    actors = configured_bluesky_actors()
    binance_stream_configured = bool(os.getenv("BINANCE_ANNOUNCEMENTS_API_KEY") and os.getenv("BINANCE_ANNOUNCEMENTS_API_SECRET"))
    categories["exchange_official"] = categories["exchange_official"] or official_enabled or binance_stream_configured
    categories["social"] = categories["social"] or bool(actors)
    return {
        "configured_rss_sources": len(sources),
        "official_exchange_providers_enabled": official_enabled,
        "bluesky_actors_configured": len(actors),
        "binance_stream_configured": binance_stream_configured,
        "categories": categories,
        "storage_configured": store.configured,
    }


@app.post("/api/news/sync")
async def news_sync(x_sync_token: str | None = Header(default=None, alias="X-Sync-Token")):
    """Fetch reviewed feeds and persist deduplicated evidence to spot_grid.news_events."""
    expected_token = os.getenv("SMART_GRID_SYNC_TOKEN", "")
    if not expected_token:
        raise HTTPException(status_code=503, detail="News sync is disabled until SMART_GRID_SYNC_TOKEN is configured")
    if not x_sync_token or not hmac.compare_digest(x_sync_token, expected_token):
        raise HTTPException(status_code=401, detail="Invalid sync token")
    sources = load_news_sources()
    official_enabled = os.getenv("ENABLE_OFFICIAL_EXCHANGE_NEWS", "true").lower() in ("1", "true", "yes")
    actors = configured_bluesky_actors()
    if not sources and not official_enabled and not actors:
        raise HTTPException(status_code=409, detail="No RSS, official exchange or social sources configured")
    store = SupabaseNewsStore()
    if not store.configured:
        raise HTTPException(status_code=503, detail="Server-side Supabase credentials are not configured")
    source_diagnostics = {}
    items = await fetch_all_news(sources, bluesky_actors=actors, enable_official=official_enabled,
                                 diagnostics=source_diagnostics)
    try:
        submitted = await store.upsert_items(items)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"News persistence failed: {type(exc).__name__}")
    return {
        "configured_rss_sources": len(sources),
        "official_exchange_providers_enabled": official_enabled,
        "bluesky_actors_configured": len(actors),
        "fetched_unique_items": len(items),
        "source_diagnostics": source_diagnostics,
        "submitted_for_deduplicated_storage": submitted,
        "storage": "spot_grid.news_events",
        "authority": "evidence_only_no_order_permission",
    }


@app.get("/api/ai/decision-preview")
async def ai_decision_preview(
    symbol: str,
    exchange: str = Query("okx"),
    limit: int = Query(50, ge=1, le=200),
):
    """Read recent bot signals and matching HBR evidence; never creates an order."""
    if exchange not in SUPPORTED_EXCHANGES:
        raise HTTPException(status_code=400, detail="Unsupported exchange")
    parts = symbol.upper().split("/")
    if len(parts) != 2 or not parts[0] or parts[1] != "USDT":
        raise HTTPException(status_code=400, detail="Only BASE/USDT spot symbols are supported")
    symbol = f"{parts[0]}/USDT"
    store = SupabaseNewsStore()
    if not store.configured:
        raise HTTPException(status_code=503, detail="Server-side Supabase credentials are not configured")
    try:
        signal_rows = await store.latest_signals(exchange, symbol, limit)
        news_items = await store.latest_for_symbol(symbol, limit)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI evidence read failed: {type(exc).__name__}")
    signals = []
    for row in signal_rows:
        signals.append(BotSignal(
            bot=row["bot_key"],
            symbol=row["symbol"],
            side=row["side"],
            confidence=float(row["confidence"]),
            reason=row["reason"],
            evidence=row.get("evidence") or {},
            created_at=_parse_datetime(row.get("created_at")) or datetime.now(timezone.utc),
            expires_at=_parse_datetime(row.get("expires_at")),
            signal_id=row["id"],
        ))
    result = AIBrain().decide_with_news(signals, news_items, symbol=symbol)
    return {
        "exchange": exchange,
        "symbol": symbol,
        "signals_considered": len(signals),
        "news_items_matched": len(result.get("news_evidence", [])),
        "result": result,
        "order_created": False,
        "authority": "decision_preview_only_no_order_permission",
    }


@app.get("/api/news/latest")
async def news_latest(limit: int = Query(50, ge=1, le=200)):
    store = SupabaseNewsStore()
    if store.configured:
        try:
            items = await store.latest(limit)
            return {
                "source": "supabase_spot_grid",
                "items_count": len(items),
                "items": items,
                "note": "News is evidence only; it cannot authorize an order.",
            }
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Supabase news read failed: {type(exc).__name__}")
    sources = load_news_sources()
    official_enabled = os.getenv("ENABLE_OFFICIAL_EXCHANGE_NEWS", "true").lower() in ("1", "true", "yes")
    actors = configured_bluesky_actors()
    source_diagnostics = {}
    items = await fetch_all_news(sources, bluesky_actors=actors, enable_official=official_enabled,
                                 diagnostics=source_diagnostics)
    return {
        "source": "live_feed_preview_not_persisted",
        "configured_rss_sources": len(sources),
        "official_exchange_providers_enabled": official_enabled,
        "bluesky_actors_configured": len(actors),
        "items_count": len(items[:limit]),
        "source_diagnostics": source_diagnostics,
        "items": [item.__dict__ for item in items[:limit]],
        "note": "Configure server-side Supabase credentials and call POST /api/news/sync to persist. News cannot authorize an order.",
    }
\n\n# Serve the responsive monitoring UI from this FastAPI app. Keep this mount last\n# so the API routes above always take precedence.\nDASHBOARD_DIR = Path(__file__).parent / "dashboard"\nif DASHBOARD_DIR.is_dir():\n    app.mount("/", StaticFiles(directory=str(DASHBOARD_DIR), html=True), name="dashboard")\n