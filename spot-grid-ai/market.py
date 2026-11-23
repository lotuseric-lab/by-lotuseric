"""Read-only spot market discovery. Requires optional dependency: pip install ccxt."""
from config import BotConfig


def discover_spot_usdt_pairs(config: BotConfig) -> list[str]:
    import ccxt
    exchange_class = getattr(ccxt, config.exchange)
    exchange = exchange_class({"enableRateLimit": True})
    try:
        markets = exchange.load_markets()
        return sorted(symbol for symbol, m in markets.items()
                      if m.get("spot") is True
                      and m.get("quote") == config.quote
                      and m.get("active") is not False)
    finally:
        exchange.close()
