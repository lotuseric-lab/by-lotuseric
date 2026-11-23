from dataclasses import dataclass
from decimal import Decimal

SUPPORTED_EXCHANGES = ("okx", "binance", "bybit")

@dataclass(frozen=True)
class BotConfig:
    exchange: str = "okx"
    quote: str = "USDT"
    paper_trading: bool = True
    live_trading_enabled: bool = False
    fee_rate: Decimal = Decimal("0.001")
    estimated_slippage_rate: Decimal = Decimal("0.0005")
    minimum_net_profit_rate: Decimal = Decimal("0.002")

    def __post_init__(self):
        if self.exchange not in SUPPORTED_EXCHANGES:
            raise ValueError("Unsupported exchange")
        if not self.paper_trading or self.live_trading_enabled:
            raise ValueError("V1 only supports paper trading")
        for value in (self.fee_rate, self.estimated_slippage_rate, self.minimum_net_profit_rate):
            if not Decimal("0") <= value < Decimal("1"):
                raise ValueError("Invalid rate")
