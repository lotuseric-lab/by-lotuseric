# Smart Grid AI — Spot Engine

Independent spot grid + fast trading research and paper-trading service.

## Approved operating decisions
- Hybrid AI: deterministic technical analysis + machine learning + LLM news analysis.
- News coverage: crypto media, official exchange announcements, macro calendar and curated social evidence.
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
- `GET /api/news/coverage` (includes built-in OKX/Bybit announcement providers and configured Bluesky accounts)
- `GET /api/news/latest` (reads persisted news when Supabase is configured; otherwise a non-persisted preview)
- `GET /api/ai/decision-preview?exchange=okx&symbol=BTC/USDT` (combines stored bot signals with matching HBR news as context; never places an order)
- `POST /api/news/sync` (fetches configured feeds and deduplicates them into `spot_grid.news_events`; requires `X-Sync-Token`)

Public market data uses CCXT unified market metadata, order-book, ticker and OHLCV methods. Only markets explicitly marked spot and not marked contract/swap/future are eligible. See the [CCXT manual](https://docs.ccxt.com/docs/manual).

## News feed setup
Set `NEWS_FEEDS_JSON` to a JSON array of operator-reviewed RSS/Atom sources. Public OKX and Bybit announcement APIs are enabled by default (`ENABLE_OFFICIAL_EXCHANGE_NEWS=true`) and require no exchange credentials. Curated Bluesky actor feeds can be enabled by adding comma-separated handles to `BLUESKY_ACTORS`; posts are always marked unverified and never gain order authority. Each item has `key`, `url`, `category` and optional `trust_tier`.
Supported categories: `crypto_media`, `exchange_official`, `macro_calendar`, `social`.
Trust tiers: `official`, `reputable`, `unverified`.
No feed is silently treated as official. Untrusted article text cannot issue an order. A reviewed starter list is in `news/sources.example.json` (Cointelegraph, CoinDesk, The Block, Decrypt and the Federal Reserve). Copy/edit it into `NEWS_FEEDS_JSON` after reviewing publisher terms. The starter list covers crypto media and a macro source. `news/providers.py` additionally fetches public OKX and Bybit announcements and optional curated Bluesky actor feeds. Binance announcements use the documented authenticated WebSocket stream rather than an unsupported REST endpoint. Reddit RSS is not used because its feeds were discontinued in November 2026.

## News persistence and HBR evidence
- `news/store.py` writes normalized feed items to `spot_grid.news_events` using the unique `dedupe_key`; repeat syncs are idempotent.
- Built-in official sources: OKX and Bybit public announcement endpoints. Optional Binance announcement WebSocket worker is available as `python -m news.binance_stream_worker`; it requires a dedicated API key with no Trade/Withdraw permissions, reconnects before the 24-hour connection limit, and stores into the same news table. Optional social source: recent posts from explicitly curated public Bluesky handles, always tagged `unverified`.
- `POST /api/news/sync` returns per-source diagnostics so failed exchange/social providers are visible rather than silently treated as successful.
- `GET /api/ai/decision-preview` reads recent `bot_signals` plus symbol-matched `news_events`, then calls `AIBrain.decide_with_news()`. News remains context-only and the endpoint is strictly read-only.
- Market snapshot writes are opt-in with `PERSIST_MARKET_SNAPSHOTS=true`; the default avoids inserting a database row on every chart refresh.
- `news/normalizer.py` extracts only explicit ticker forms (`$BTC`, `BTC/USDT`, `BTC-USDT`) and applies a transparent keyword heuristic for event type/sentiment. This is not a trained model.
- News is stored as evidence only. The HBR/news bot has no BUY/SELL authority and is not counted as an independent trading vote.
- Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the server environment only. Never commit the service-role key or expose it in a browser/mobile client. Set a separate high-entropy `SMART_GRID_SYNC_TOKEN`; the ingestion endpoint stays disabled without it and rejects requests without the matching `X-Sync-Token` header.
- Supabase Data API must expose the `spot_grid` schema in Dashboard → Settings → API → Exposed schemas. The schema's RLS/grants already deny `anon` and `authenticated`; the server uses `service_role`.
- Configure approved RSS/Atom feeds in `NEWS_FEEDS_JSON`, then call `POST /api/news/sync`. To enable the optional Binance worker, set `BINANCE_ANNOUNCEMENTS_API_KEY` and `BINANCE_ANNOUNCEMENTS_API_SECRET` as server secrets, then run the worker as a persistent process. `GET /api/news/latest` reads persisted rows when configured.

## Official provider references
- [OKX public announcements API](https://www.okx.com/docs-v5/en/#support-announcements)
- [Bybit V5 announcements API](https://bybit-exchange.github.io/docs/v5/announcement)
- [Binance announcement WebSocket](https://developers.binance.com/en/docs/products/announcements/announcement)
- [Bluesky public API and authentication](https://bsky.network/docs/api-directory/)

## Shared portfolio and paper broker
- `core/portfolio.py` stores balances, active reservations and paper fills in SQLite.
- Grid and Scalp can reserve from the same asset ledger; an atomic transaction prevents double allocation.
- `core/paper_broker.py` only simulates marketable limit fills against supplied top-of-book data and includes fee/slippage assumptions.
- It never calls exchange private order endpoints. Unfilled limit intents are currently returned as `NOT_FILLED`; persistent resting orders/partial fills are a later phase.

## AI and bot foundations
- Architecture and data contracts: [ARCHITECTURE.md](ARCHITECTURE.md)
- Bot inventory: `bots/registry.py`
- Central decision coordinator: `ai/brain.py`; `decide_with_news()` attaches symbol-matched HBR evidence as context only and does not let news cast a vote or change the bot-consensus decision.
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


## Web control panel

A responsive, mobile-first monitoring dashboard is served by the FastAPI app at `/`. It includes exchange selection (OKX, Binance, Bybit), active USDT spot market discovery, batch ticker monitoring, selected-pair candles/order-book snapshot, HBR news evidence, AI decision preview, service health, and paper-mode status. The UI refreshes public market/news data every 20 seconds and can be added to an iPhone home screen. The shell can be cached offline; API data remains network-only.

Vercel project: `smart-grid-ai-dashboard` (root directory: `spot-grid-ai`). The dashboard is not an order-entry screen. The batch ticker scan is market-data monitoring only; the strategy signal-generation and portfolio/order-ledger UI remain pending until those engines are connected. Supabase service credentials and the sync token must be configured as server-side environment variables before news persistence and stored AI evidence are available. Keep `SUPABASE_SERVICE_ROLE_KEY` and `SMART_GRID_SYNC_TOKEN` out of browser code.
