"""Deterministic technical suitability gate and price ladder for spot grid previews.

This module creates plans only. It never submits exchange orders and does not claim
that an ML model is trained. All prices are derived from closed OHLCV candles.
"""
from dataclasses import dataclass
from decimal import Decimal
from math import isfinite


@dataclass(frozen=True)
class GridPolicy:
    lookback: int = 48
    min_candles: int = 30
    max_spread_rate: Decimal = Decimal("0.0015")
    max_efficiency_ratio: Decimal = Decimal("0.35")
    max_abs_slope_rate: Decimal = Decimal("0.008")
    min_atr_rate: Decimal = Decimal("0.001")
    max_atr_rate: Decimal = Decimal("0.035")
    fee_rate: Decimal = Decimal("0.001")
    slippage_rate: Decimal = Decimal("0.0005")
    minimum_net_grid_rate: Decimal = Decimal("0.002")


def _dec(value) -> Decimal:
    result = Decimal(str(value))
    if not result.is_finite():
        raise ValueError("Non-finite numeric input")
    return result


def build_grid_preview(*, symbol: str, last, bid, ask, spread_rate, quote_volume,
                       candles: list, budget, grid_count: int = 10,
                       policy: GridPolicy | None = None) -> dict:
    policy = policy or GridPolicy()
    if "/" not in symbol or symbol.split("/")[-1] != "USDT" or symbol.count("/") != 1:
        raise ValueError("Only BASE/USDT spot symbols are supported")
    last, bid, ask, budget = map(_dec, (last, bid, ask, budget))
    spread = _dec(spread_rate)
    volume = _dec(quote_volume or 0)
    if min(last, bid, ask, budget) <= 0 or ask < bid or spread < 0:
        raise ValueError("Invalid price, budget or order book")
    if not 4 <= int(grid_count) <= 30:
        raise ValueError("Grid count must be between 4 and 30")
    if not isinstance(candles, list) or len(candles) < policy.min_candles:
        return {"eligible": False, "status": "REJECTED", "reason_codes": ["INSUFFICIENT_CLOSED_CANDLES"],
                "symbol": symbol, "order_creation_enabled": False}

    rows = candles[-policy.lookback:]
    closes, highs, lows = [], [], []
    for row in rows:
        if len(row) < 5:
            raise ValueError("Invalid OHLCV candle")
        o, h, l, c = map(float, row[1:5])
        if not all(isfinite(v) and v > 0 for v in (o, h, l, c)) or h < max(o, c, l) or l > min(o, c, h):
            raise ValueError("Invalid OHLCV values")
        closes.append(_dec(c)); highs.append(_dec(h)); lows.append(_dec(l))

    net_move = abs(closes[-1] - closes[0])
    path = sum((abs(closes[i] - closes[i-1]) for i in range(1, len(closes))), Decimal("0"))
    efficiency = net_move / path if path else Decimal("0")
    slope = abs(closes[-1] - closes[0]) / closes[0]
    true_ranges = []
    for i in range(1, len(rows)):
        previous = closes[i-1]
        true_ranges.append(max(highs[i]-lows[i], abs(highs[i]-previous), abs(lows[i]-previous)))
    atr = sum(true_ranges, Decimal("0")) / Decimal(len(true_ranges))
    atr_rate = atr / last
    reasons = []
    if efficiency > policy.max_efficiency_ratio:
        reasons.append("TRENDING_OR_DIRECTIONAL_MARKET")
    if slope > policy.max_abs_slope_rate:
        reasons.append("PRICE_DRIFT_TOO_HIGH")
    if spread > policy.max_spread_rate:
        reasons.append("SPREAD_TOO_WIDE")
    if atr_rate < policy.min_atr_rate:
        reasons.append("VOLATILITY_TOO_LOW")
    if atr_rate > policy.max_atr_rate:
        reasons.append("VOLATILITY_TOO_HIGH")
    if volume <= 0:
        reasons.append("MISSING_QUOTE_VOLUME")

    lower = min(lows); upper = max(highs)
    if lower <= 0 or upper <= lower:
        reasons.append("INVALID_GRID_RANGE")
        spacing_rate = Decimal("0")
    else:
        spacing_rate = (upper / lower) ** (Decimal("1") / Decimal(grid_count)) - Decimal("1")
    round_trip_cost = Decimal("2") * (policy.fee_rate + policy.slippage_rate)
    net_per_grid = spacing_rate - round_trip_cost
    if net_per_grid < policy.minimum_net_grid_rate:
        reasons.append("GRID_SPACING_BELOW_NET_COST_FLOOR")

    levels = []
    if not reasons:
        for i in range(grid_count + 1):
            price = lower * ((upper / lower) ** (Decimal(i) / Decimal(grid_count)))
            levels.append({"index": i, "price": str(price.quantize(Decimal("0.00000001"))),
                           "below_market": price < last})
    per_grid_budget = budget / Decimal(grid_count)
    return {
        "eligible": not reasons,
        "status": "READY_FOR_PAPER_REVIEW" if not reasons else "REJECTED",
        "reason_codes": reasons,
        "symbol": symbol,
        "market_regime": "RANGE_BOUND_CANDIDATE" if not reasons else "NOT_GRID_SUITABLE",
        "metrics": {
            "efficiency_ratio": str(efficiency.quantize(Decimal("0.0001"))),
            "price_drift_rate": str(slope.quantize(Decimal("0.0001"))),
            "atr_rate": str(atr_rate.quantize(Decimal("0.0001"))),
            "spread_rate": str(spread),
            "quote_volume_24h": str(volume),
            "grid_spacing_rate": str(spacing_rate.quantize(Decimal("0.0001"))),
            "estimated_round_trip_cost_rate": str(round_trip_cost),
            "estimated_net_per_grid_rate": str(net_per_grid.quantize(Decimal("0.0001"))),
        },
        "range": {"lower": str(lower), "upper": str(upper), "reference_price": str(last)},
        "grid_count": int(grid_count),
        "budget_usdt": str(budget),
        "indicative_quote_per_level": str(per_grid_budget.quantize(Decimal("0.01"))),
        "levels": levels,
        "order_creation_enabled": False,
        "authority": "technical_suitability_preview_only_no_order_permission",
    }
