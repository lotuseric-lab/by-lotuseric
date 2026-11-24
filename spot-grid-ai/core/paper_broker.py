"""Limit-only paper execution simulator. It never contacts exchange order endpoints."""
from dataclasses import dataclass
from decimal import Decimal
from uuid import uuid4

from config import BotConfig
from core.portfolio import PortfolioLedger


@dataclass(frozen=True)
class PaperFill:
    client_order_id: str
    symbol: str
    side: str
    quantity: Decimal
    fill_price: Decimal
    fee_quote: Decimal
    status: str


class PaperBroker:
    def __init__(self, ledger: PortfolioLedger, config: BotConfig):
        if not config.paper_trading or config.live_trading_enabled:
            raise ValueError("PaperBroker requires paper-only configuration")
        self.ledger = ledger
        self.config = config

    def submit_limit(
        self, symbol: str, side: str, quantity: Decimal, limit_price: Decimal,
        best_bid: Decimal, best_ask: Decimal,
    ) -> PaperFill:
        if side not in ("BUY", "SELL"):
            raise ValueError("Spot supports BUY or SELL only")
        if min(quantity, limit_price, best_bid, best_ask) <= 0 or best_ask < best_bid:
            raise ValueError("Invalid order book or order values")

        crosses = (side == "BUY" and limit_price >= best_ask) or (
            side == "SELL" and limit_price <= best_bid
        )
        order_id = str(uuid4())
        if not crosses:
            return PaperFill(order_id, symbol, side, quantity, Decimal("0"), Decimal("0"), "NOT_FILLED")

        slip = self.config.estimated_slippage_rate
        raw_price = best_ask if side == "BUY" else best_bid
        fill_price = raw_price * (Decimal("1") + slip if side == "BUY" else Decimal("1") - slip)
        fee_quote = quantity * fill_price * self.config.fee_rate
        self.ledger.apply_fill(order_id, symbol, side, quantity, fill_price, fee_quote)
        return PaperFill(order_id, symbol, side, quantity, fill_price, fee_quote, "FILLED")
