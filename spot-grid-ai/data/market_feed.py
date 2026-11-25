"""Public, read-only CCXT spot market data adapter."""
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from config import BotConfig, SUPPORTED_EXCHANGES


@dataclass(frozen=True)
class MarketSnapshot:
    exchange: str
    symbol: str
    observed_at: datetime
    bid: float
    ask: float
    last: float
    base_volume: float | None
    quote_volume: float | None
    spread_rate: float
    bids: list[list[float]]
    asks: list[list[float]]
    candles: list[list[float]]


class PublicSpotFeed:
    """No API credentials and no private/order methods are used here."""

    def __init__(self, config: BotConfig):
        if config.exchange not in SUPPORTED_EXCHANGES:
            raise ValueError("Unsupported exchange")
        self.config = config
        self._exchange = None

    def connect(self):
        if self._exchange is not None:
            return self._exchange
        import ccxt
        exchange_type = getattr(ccxt, self.config.exchange)
        self._exchange = exchange_type({"enableRateLimit": True, "timeout": 15000})
        self._exchange.load_markets()
        return self._exchange

    def discover_symbols(self) -> list[str]:
        exchange = self.connect()
        return sorted(
            symbol for symbol, market in exchange.markets.items()
            if market.get("spot") is True
            and market.get("contract") is not True
            and market.get("swap") is not True
            and market.get("future") is not True
            and market.get("quote") == self.config.quote
            and market.get("active") is not False
        )


    def fetch_tickers(self) -> list[dict[str, Any]]:
        """Fetch one public ticker batch and retain only active USDT spot pairs."""
        exchange = self.connect()
        tickers = exchange.fetch_tickers()
        rows = []
        for symbol, ticker in tickers.items():
            market = exchange.markets.get(symbol) or {}
            if not (market.get("spot") is True and market.get("contract") is not True
                    and market.get("swap") is not True and market.get("future") is not True
                    and market.get("quote") == self.config.quote and market.get("active") is not False):
                continue
            last = ticker.get("last")
            if last is None:
                continue
            bid, ask = ticker.get("bid"), ticker.get("ask")
            spread = None
            if bid and ask and float(ask) >= float(bid) and (float(ask) + float(bid)) > 0:
                spread = (float(ask) - float(bid)) / ((float(ask) + float(bid)) / 2)
            rows.append({
                "symbol": symbol, "last": float(last),
                "percentage": float(ticker["percentage"]) if ticker.get("percentage") is not None else None,
                "quote_volume": float(ticker["quoteVolume"]) if ticker.get("quoteVolume") is not None else None,
                "bid": float(bid) if bid is not None else None,
                "ask": float(ask) if ask is not None else None,
                "spread_rate": spread,
                "timestamp": ticker.get("timestamp"),
            })
        rows.sort(key=lambda row: row["quote_volume"] or 0, reverse=True)
        return rows

    def fetch_snapshot(self, symbol: str, timeframe: str = "5m", candle_limit: int = 100) -> MarketSnapshot:
        exchange = self.connect()
        market = exchange.market(symbol)
        if not market.get("spot") or market.get("contract") or market.get("quote") != self.config.quote:
            raise ValueError("Only eligible USDT spot markets are allowed")

        ticker: dict[str, Any] = exchange.fetch_ticker(symbol)
        book = exchange.fetch_order_book(symbol, limit=20)
        candles = exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=candle_limit)

        bid = float(book["bids"][0][0]) if book.get("bids") else float(ticker.get("bid") or 0)
        ask = float(book["asks"][0][0]) if book.get("asks") else float(ticker.get("ask") or 0)
        if bid <= 0 or ask <= 0 or ask < bid:
            raise ValueError("Invalid or incomplete top-of-book data")
        spread = (ask - bid) / ((ask + bid) / 2)
        timestamp = ticker.get("timestamp") or exchange.milliseconds()
        return MarketSnapshot(
            exchange=self.config.exchange,
            symbol=symbol,
            observed_at=datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc),
            bid=bid,
            ask=ask,
            last=float(ticker.get("last") or (bid + ask) / 2),
            base_volume=float(ticker["baseVolume"]) if ticker.get("baseVolume") is not None else None,
            quote_volume=float(ticker["quoteVolume"]) if ticker.get("quoteVolume") is not None else None,
            spread_rate=spread,
            bids=[[float(p), float(q)] for p, q in book.get("bids", [])],
            asks=[[float(p), float(q)] for p, q in book.get("asks", [])],
            candles=[[float(v) for v in row] for row in candles],
        )

    def close(self):
        if self._exchange is not None:
            self._exchange.close()
            self._exchange = None
