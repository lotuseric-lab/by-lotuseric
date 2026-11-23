import unittest
from datetime import datetime, timedelta, timezone

from ai.dataset import chronological_split, closed_outcome_rows


class DatasetTests(unittest.TestCase):
    def test_unclosed_outcomes_are_not_training_labels(self):
        rows = [
            {"closed_at": None, "net_pnl": None, "label": None},
            {"closed_at": datetime.now(timezone.utc), "net_pnl": 1.2, "label": "profitable"},
        ]
        self.assertEqual(len(closed_outcome_rows(rows)), 1)

    def test_chronological_split_purges_overlapping_labels(self):
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        rows = []
        for i in range(20):
            feature_at = start + timedelta(days=i)
            rows.append({
                "feature_at": feature_at,
                "label_at": feature_at + timedelta(hours=12),
                "label": "profitable",
            })
        split = chronological_split(rows)
        self.assertTrue(split["train"])
        self.assertTrue(split["validation"])
        self.assertTrue(split["test"])
        self.assertLess(max(r["feature_at"] for r in split["train"]),
                        min(r["feature_at"] for r in split["validation"]))

    def test_invalid_time_order_is_rejected(self):
        now = datetime.now(timezone.utc)
        with self.assertRaises(ValueError):
            chronological_split([{"feature_at": now, "label_at": now - timedelta(seconds=1)}])


if __name__ == "__main__":
    unittest.main()
