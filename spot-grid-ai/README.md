# Smart Grid AI — Spot Engine

Independent spot grid + fast trading research and paper-trading service.

## Approved operating decisions
- Hybrid AI: deterministic technical analysis + machine learning + LLM news analysis.
- News coverage: crypto media, official exchange announcements, macro calendar and social/sentiment feeds.
- Authority: guarded; V1 is paper-only.
- Spot USDT markets only; no perpetual/futures and no short selling.
- One active exchange at a time: OKX, Binance or Bybit.

## Quick start
From this directory:
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8002
```
Open `/docs` for the read-only API. Useful endpoints:
- `GET /health`
- `GET /api/spot/symbols?exchange=okx`
- `GET /api/spot/snapshot?exchange=okx&symbol=BTC/USDT&timeframe=5m`
- `GET /api/news/coverage`
- `GET /api/news/latest` (reads persisted news when Supabase is configured; otherwise a non-persisted preview)\n- `POST /api/news/sync` (fetches configured feeds and deduplicates them into `spot_grid.news_events`)

Public market data uses CCXT unified market metadata, order-book, ticker and OHLCV methods. Only markets explicitly marked spot and not marked contract/swap/future are eligible. See the [CCXT manual](https://docs.ccxt.com/docs/manual).

## News feed setup
Set `NEWS_FEEDS_JSON` to a JSON array of operator-reviewed RSS/Atom sources. Each item has `key`, `url`, `category` and optional `trust_tier`.
Supported categories: `crypto_media`, `exchange_official`, `macro_calendar`, `social`.
Trust tiers: `official`, `reputable`, `unverified`.
No feed is silently treated as official. Untrusted article text cannot issue an order. A reviewed starter list is in `news/sources.example.json` (Cointelegraph, CoinDesk, The Block, Decrypt and the Federal Reserve). Copy/edit it into `NEWS_FEEDS_JSON` after reviewing publisher terms. The starter list covers crypto media and a macro source; exchange announcements need dedicated official-source adapters, while social feeds need a supported authenticated provider. Reddit RSS is not used because its feeds were discontinued in November 2026.

## News persistence and HBR evidence
- `news/store.py` writes normalized feed items to `spot_grid.news_events` using the unique `dedupe_key`; repeat syncs are idempotent.
- `news/normalizer.py` extracts only explicit ticker forms (`$BTC`, `BTC/USDT`, `BTC-USDT`) and applies a transparent keyword heuristic for event type/sentiment. This is not a trained model.
- News is stored as evidence only. The HBR/news bot has no BUY/SELL authority and is not counted as an independent trading vote.
- Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the server environment only. Never commit the service-role key or expose it in a browser/mobile client.
- Supabase Data API must expose the `spot_grid` schema in Dashboard → Settings → API → Exposed schemas. The schema's RLS/grants already deny `anon` and `authenticated`; the server uses `service_role`.
- Configure approved RSS/Atom feeds in `NEWS_FEEDS_JSON`, then call `POST /api/news/sync`. `GET /api/news/latest` reads persisted rows when configured.

## Shared portfolio and paper broker
- `core/portfolio.py` stores balances, active reservations and paper fills in SQLite.
- Grid and Scalp can reserve from the same asset ledger; an atomic transaction prevents double allocation.
- `core/paper_broker.py` only simulates marketable limit fills against supplied top-of-book data and includes fee/slippage assumptions.
- It never calls exchange private order endpoints. Unfilled limit intents are currently returned as `NOT_FILLED`; persistent resting orders/partial fills are a later phase.

## AI and bot foundations
- Architecture and data contracts: [ARCHITECTURE.md](ARCHITECTURE.md)
- Bot inventory: `bots/registry.py`
- Central decision coordinator: `ai/brain.py`
- Training split and model-promotion safety: `ai/training.py`, `ai/dataset.py`
- Non-bypassable risk gate: `core/risk.py`

## Supabase and isolation
The isolated `spot_grid` schema is now created in the linked Supabase project with 10 tables. RLS is enabled on all 10; `anon` and `authenticated` have no schema usage, while `service_role` has schema usage. Existing `public` application tables were left untouched. SQL source: `database/001_spot_grid_schema.sql`.

## Safety
Live order adapters are not included in V1. LLM output alone cannot create a trade. Grid and Scalp share one portfolio ledger. Net performance must include fees, spread and slippage.

## Tests
```bash
python -m unittest discover -s tests -v
python -m unittest test_engine -v
```
GitHub Actions runs both suites when files under `spot-grid-ai/` change.

> Grid trading is not guaranteed to be profitable. In a sharp decline, inventory accumulation and unrealized losses are possible.
