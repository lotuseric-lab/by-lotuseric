"""News source policy. Concrete providers are plugged in behind adapters."""
from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class NewsSource:
    key: str
    category: Literal["crypto_media", "exchange_official", "macro_calendar", "social"]
    enabled: bool = True
    trust_tier: Literal["official", "reputable", "unverified"] = "reputable"


ALL_NEWS_SOURCE_CATEGORIES = (
    "crypto_media",
    "exchange_official",
    "macro_calendar",
    "social",
)


def llm_output_may_authorize_order() -> bool:
    return False
