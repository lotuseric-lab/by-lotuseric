"""Canonical inventory of cooperating analysis, strategy and operations bots."""
from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class BotSpec:
    key: str
    purpose: str
    category: Literal["intelligence", "strategy", "portfolio", "risk", "learning"]
    can_propose_order: bool = False


BOT_REGISTRY = (
    BotSpec("news_hbr", "Crypto news, exchange announcements, macro calendar and sentiment", "intelligence"),
    BotSpec("market_regime", "Trend/range/volatility regime classification", "intelligence"),
    BotSpec("spot_scanner", "Discover all eligible active USDT spot markets", "intelligence"),
    BotSpec("technical", "Multi-timeframe trend and momentum analysis", "intelligence"),
    BotSpec("volume_liquidity", "Volume, spread, order-book depth and slippage", "intelligence"),
    BotSpec("whale_flow", "Large-trade and unusual-flow observations", "intelligence"),
    BotSpec("anomaly", "Abnormal movement and data-quality alerts", "intelligence"),
    BotSpec("grid", "Adaptive spot grid proposal generation", "strategy", True),
    BotSpec("scalp_exit", "Short-horizon spot entry/exit proposal generation", "strategy", True),
    BotSpec("portfolio", "Shared balances, positions and atomic reservations", "portfolio"),
    BotSpec("order_monitor", "Paper order lifecycle and reconciliation", "portfolio"),
    BotSpec("risk", "Non-bypassable risk veto", "risk"),
    BotSpec("performance_learning", "Net outcome labels, model evaluation and drift", "learning"),
)
