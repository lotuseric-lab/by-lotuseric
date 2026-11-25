"""Read-only market API and guarded paper-mode news persistence service."""
import hmac
import os

from fastapi import FastAPI, Header, HTTPException, Query

from config import BotConfig, SUPPORTED_EXCHANGES
from data.market_feed import PublicSpotFeed
from news.ingestor import fetch_all_feeds
from news.settings import load_news_sources, news_category_coverage
from news.store import SupabaseNewsStore

app = FastAPI(title="Smart Grid AI — Spot", version="0.2.0")


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
        if store.configured:
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
    return {
        "configured_sources": len(sources),
        "categories": news_category_coverage(sources),
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
    if not sources:
        raise HTTPException(status_code=409, detail="No news feeds configured in NEWS_FEEDS_JSON")
    store = SupabaseNewsStore()
    if not store.configured:
        raise HTTPException(status_code=503, detail="Server-side Supabase credentials are not configured")
    items = await fetch_all_feeds(sources)
    try:
        submitted = await store.upsert_items(items)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {
        "configured_sources": len(sources),
        "fetched_unique_items": len(items),
        "submitted_for_deduplicated_storage": submitted,
        "storage": "spot_grid.news_events",
        "authority": "evidence_only_no_order_permission",
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
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc))
    sources = load_news_sources()
    items = await fetch_all_feeds(sources)
    return {
        "source": "live_feed_preview_not_persisted",
        "configured_sources": len(sources),
        "items_count": len(items[:limit]),
        "items": [item.__dict__ for item in items[:limit]],
        "note": "Configure server-side Supabase credentials and call POST /api/news/sync to persist. News cannot authorize an order.",
    }
