"""Read-only market/news API and paper-mode service status."""
from fastapi import FastAPI, HTTPException, Query

from config import BotConfig, SUPPORTED_EXCHANGES
from data.market_feed import PublicSpotFeed
from news.ingestor import fetch_all_feeds
from news.settings import load_news_sources, news_category_coverage

app = FastAPI(title="Smart Grid AI — Spot", version="0.1.0")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "market": "spot_only",
        "trading_mode": "paper_only",
        "live_trading_enabled": False,
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
def spot_snapshot(
    symbol: str,
    exchange: str = Query("okx"),
    timeframe: str = Query("5m", pattern=r"^(1m|3m|5m|15m|1h|4h|1d)$"),
):
    if exchange not in SUPPORTED_EXCHANGES:
        raise HTTPException(status_code=400, detail="Unsupported exchange")
    feed = PublicSpotFeed(BotConfig(exchange=exchange))
    try:
        snapshot = feed.fetch_snapshot(symbol, timeframe=timeframe)
        return {
            "exchange": snapshot.exchange,
            "symbol": snapshot.symbol,
            "observed_at": snapshot.observed_at.isoformat(),
            "bid": snapshot.bid,
            "ask": snapshot.ask,
            "last": snapshot.last,
            "base_volume": snapshot.base_volume,
            "quote_volume": snapshot.quote_volume,
            "spread_rate": snapshot.spread_rate,
            "bids": snapshot.bids,
            "asks": snapshot.asks,
            "candles": snapshot.candles,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Market snapshot failed: {type(exc).__name__}")
    finally:
        feed.close()


@app.get("/api/news/coverage")
def news_coverage():
    sources = load_news_sources()
    return {"configured_sources": len(sources), "categories": news_category_coverage(sources)}


@app.get("/api/news/latest")
async def news_latest():
    sources = load_news_sources()
    items = await fetch_all_feeds(sources)
    return {
        "configured_sources": len(sources),
        "items_count": len(items),
        "items": [item.__dict__ for item in items],
        "note": "Raw feed text is untrusted input; no item can authorize an order.",
    }
