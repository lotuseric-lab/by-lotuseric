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
- `GET /api/news/latest`

Public market data uses CCXT unified market metadata, order-book, ticker and OHLCV methods. Only markets explicitly marked spot and not marked contract/swap/future are eligible. See the [CCXT manual](https://docs.ccxt.com/docs/manual).

## News feed setup
Set `NEWS_FEEDS_JSON` to a JSON array of operator-reviewed RSS/Atom sources. Each item has `key`, `url`, `category` and optional `trust_tier`.
Supported categories: `crypto_media`, `exchange_official`, `macro_calendar`, `social`.
Trust tiers: `official`, `reputable`, `unverified`.
No feed is silently treated as official. Untrusted article text cannot issue an order. Review publishers and terms before enabling sources. The categories are implemented, but feed URLs have not yet been configured.

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
