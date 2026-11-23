"""Shared serializable event contracts for all Smart Grid AI bots."""
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Literal
from uuid import uuid4


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class BotSignal:
    bot: str
    symbol: str
    side: Literal["BUY", "SELL", "HOLD"]
    confidence: float
    reason: str
    evidence: dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=utc_now)
    expires_at: datetime | None = None
    signal_id: str = field(default_factory=lambda: str(uuid4()))

    def __post_init__(self):
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError("confidence must be between 0 and 1")
        if not self.bot or not self.symbol:
            raise ValueError("bot and symbol are required")


@dataclass(frozen=True)
class OrderIntent:
    symbol: str
    side: Literal["BUY", "SELL"]
    quantity: Decimal
    strategy: str
    reservation_id: str
    client_order_id: str = field(default_factory=lambda: str(uuid4()))
    paper: bool = True

    def __post_init__(self):
        if self.quantity <= 0:
            raise ValueError("quantity must be positive")
        if not self.paper:
            raise ValueError("Live order intents are disabled in V1")


@dataclass(frozen=True)
class DecisionRecord:
    symbol: str
    decision: Literal["BUY", "SELL", "HOLD"]
    confidence: float
    signal_ids: tuple[str, ...]
    model_versions: dict[str, str]
    reason_codes: tuple[str, ...]
    created_at: datetime = field(default_factory=utc_now)
