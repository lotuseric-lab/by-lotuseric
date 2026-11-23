"""Non-bypassable safety gate. V1 intentionally permits paper mode only."""
from dataclasses import dataclass
from decimal import Decimal
from typing import Literal


@dataclass(frozen=True)
class RiskContext:
    mode: Literal["paper", "live"] = "paper"
    emergency_stop: bool = False
    exchange_connected: bool = True
    market_data_fresh: bool = True
    daily_net_pnl: Decimal = Decimal("0")
    daily_loss_limit: Decimal = Decimal("25")
    drawdown: Decimal = Decimal("0")
    max_drawdown: Decimal = Decimal("0.10")
    open_orders: int = 0
    max_open_orders: int = 10
    coin_exposure: Decimal = Decimal("0")
    max_coin_exposure: Decimal = Decimal("100")
    free_base_balance: Decimal = Decimal("0")


@dataclass(frozen=True)
class RiskVerdict:
    allowed: bool
    reason_codes: tuple[str, ...]


class RiskEngine:
    def evaluate(self, side: str, quantity: Decimal, context: RiskContext) -> RiskVerdict:
        reasons: list[str] = []
        if context.mode != "paper":
            reasons.append("LIVE_MODE_DISABLED_IN_V1")
        if context.emergency_stop:
            reasons.append("EMERGENCY_STOP")
        if not context.exchange_connected:
            reasons.append("EXCHANGE_DISCONNECTED")
        if not context.market_data_fresh:
            reasons.append("STALE_MARKET_DATA")
        if context.daily_net_pnl <= -abs(context.daily_loss_limit):
            reasons.append("DAILY_LOSS_LIMIT")
        if context.drawdown >= context.max_drawdown:
            reasons.append("MAX_DRAWDOWN")
        if context.open_orders >= context.max_open_orders:
            reasons.append("OPEN_ORDER_LIMIT")
        if context.coin_exposure > context.max_coin_exposure:
            reasons.append("COIN_EXPOSURE_LIMIT")
        if side == "SELL" and quantity > context.free_base_balance:
            reasons.append("INSUFFICIENT_FREE_BASE_ASSET")
        if side not in ("BUY", "SELL"):
            reasons.append("INVALID_SPOT_SIDE")
        if quantity <= 0:
            reasons.append("INVALID_QUANTITY")
        return RiskVerdict(allowed=not reasons, reason_codes=tuple(reasons))
