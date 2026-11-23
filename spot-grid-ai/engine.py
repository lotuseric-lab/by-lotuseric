from decimal import Decimal
from config import BotConfig


def estimated_net_profit(buy_price: Decimal, sell_price: Decimal, quantity: Decimal, config: BotConfig) -> Decimal:
    """Conservative paper estimate including both-side fees and slippage."""
    if min(buy_price, sell_price, quantity) <= 0:
        raise ValueError("Prices and quantity must be positive")
    effective_buy = buy_price * (1 + config.estimated_slippage_rate)
    effective_sell = sell_price * (1 - config.estimated_slippage_rate)
    return quantity * (effective_sell * (1 - config.fee_rate) - effective_buy * (1 + config.fee_rate))


def can_sell_at_target(buy_price: Decimal, sell_price: Decimal, quantity: Decimal, config: BotConfig) -> bool:
    cost = buy_price * quantity * (1 + config.estimated_slippage_rate) * (1 + config.fee_rate)
    return estimated_net_profit(buy_price, sell_price, quantity, config) >= cost * config.minimum_net_profit_rate
