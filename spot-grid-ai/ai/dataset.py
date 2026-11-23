"""Leakage-aware chronological dataset preparation helpers."""
from typing import Any


def chronological_split(
    rows: list[dict[str, Any]],
    train_ratio: float = 0.70,
    validation_ratio: float = 0.15,
) -> dict[str, list[dict[str, Any]]]:
    if not 0 < train_ratio < 1 or not 0 < validation_ratio < 1:
        raise ValueError("split ratios must be between 0 and 1")
    if train_ratio + validation_ratio >= 1:
        raise ValueError("train + validation ratios must be below 1")
    if not rows:
        return {"train": [], "validation": [], "test": []}
    if len(rows) < 3:
        raise ValueError("at least three resolved samples are required")

    ordered = sorted(rows, key=lambda row: row["feature_at"])
    if any(row["label_at"] < row["feature_at"] for row in ordered):
        raise ValueError("label_at cannot precede feature_at")

    count = len(ordered)
    train_end = min(max(1, int(count * train_ratio)), count - 2)
    validation_end = min(max(train_end + 1, int(count * (train_ratio + validation_ratio))), count - 1)

    validation_start_at = ordered[train_end]["feature_at"]
    test_start_at = ordered[validation_end]["feature_at"]

    # Purge rows whose forward outcome window overlaps the next split.
    train = [row for row in ordered[:train_end] if row["label_at"] < validation_start_at]
    validation = [
        row for row in ordered[train_end:validation_end]
        if row["label_at"] < test_start_at
    ]
    test = ordered[validation_end:]
    return {"train": train, "validation": validation, "test": test}


def closed_outcome_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Only fully resolved outcomes may become supervised-learning labels."""
    return [
        row for row in rows
        if row.get("closed_at") is not None
        and row.get("net_pnl") is not None
        and row.get("label") in ("profitable", "unprofitable", "breakeven")
    ]
