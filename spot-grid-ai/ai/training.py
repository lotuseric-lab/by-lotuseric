"""Safe model lifecycle primitives; training and promotion are deliberately separate."""
from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(frozen=True)
class ModelEvaluation:
    model_name: str
    version: str
    evaluated_at: datetime
    train_end: datetime
    validation_score: float
    test_score: float
    walk_forward_score: float
    paper_observations: int
    leakage_check_passed: bool


@dataclass(frozen=True)
class PromotionPolicy:
    minimum_test_score: float = 0.55
    minimum_walk_forward_score: float = 0.53
    minimum_paper_observations: int = 100
    require_leakage_check: bool = True


def can_promote(candidate: ModelEvaluation, policy: PromotionPolicy = PromotionPolicy()) -> tuple[bool, str]:
    if candidate.train_end >= candidate.evaluated_at:
        return False, "INVALID_TIME_SPLIT"
    if policy.require_leakage_check and not candidate.leakage_check_passed:
        return False, "LEAKAGE_CHECK_FAILED"
    if candidate.test_score < policy.minimum_test_score:
        return False, "TEST_SCORE_TOO_LOW"
    if candidate.walk_forward_score < policy.minimum_walk_forward_score:
        return False, "WALK_FORWARD_SCORE_TOO_LOW"
    if candidate.paper_observations < policy.minimum_paper_observations:
        return False, "INSUFFICIENT_PAPER_OBSERVATIONS"
    return False, "MANUAL_APPROVAL_REQUIRED"
