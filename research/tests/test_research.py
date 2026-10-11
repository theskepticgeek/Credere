import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dataset import DAY, chronological_partitions, held_out, history_and_label
from stress import issue_allowed, scenario, settle


class ResearchTests(unittest.TestCase):
    def test_future_events_never_enter_features(self):
        events = [{"wallet": "a", "timestamp": t, "event": kind} for t, kind in [(99, "Borrow"), (100, "Repay"), (101, "LiquidationCall")]]
        history, label = history_and_label(events, "a", 100)
        self.assertEqual([e["timestamp"] for e in history], [99, 100])
        self.assertEqual(label, 1)

    def test_cutoff_liquidation_is_history_not_future_label(self):
        history, label = history_and_label([{"wallet": "a", "timestamp": 100, "event": "LiquidationCall"}], "a", 100)
        self.assertEqual(len(history), 1)
        self.assertEqual(label, 0)

    def test_time_split_has_label_embargo(self):
        rows = [{"timestamp": n * 7 * DAY, "wallet": str(n % 3)} for n in range(100)]
        train, validation, test, _ = chronological_partitions(rows)
        self.assertLess(max(rows[i]["timestamp"] + 30 * DAY for i in train), min(rows[i]["timestamp"] for i in validation))
        self.assertLess(max(rows[i]["timestamp"] + 30 * DAY for i in validation), min(rows[i]["timestamp"] for i in test))

    def test_wallet_split_is_stable_and_disjoint(self):
        wallets = [f"0x{i:040x}" for i in range(100)]
        training = {w for w in wallets if not held_out(w)}
        testing = {w for w in wallets if held_out(w)}
        self.assertFalse(training & testing)
        self.assertTrue(testing)
        self.assertEqual(held_out("0xAbC"), held_out("0xabc"))

    def test_small_dataset_is_rejected(self):
        with self.assertRaises(ValueError):
            chronological_partitions([{"timestamp": 0}])

    def test_loss_waterfall(self):
        self.assertEqual(settle(1000, 700, 200), {"collateral_recovered": 700, "reserve_used": 200, "lp_loss": 100, "reserve_remaining": 0})
        self.assertEqual(settle(1000, 1200, 200)["lp_loss"], 0)

    def test_coverage_checks_post_borrow_exposure(self):
        self.assertTrue(issue_allowed(25, 75, 25))
        self.assertFalse(issue_allowed(25, 100, 25))
        self.assertFalse(issue_allowed(0, 0, 1))

    def test_severe_defaults_reveal_lp_loss(self):
        self.assertEqual(scenario(8)["lp_loss_usdc"], 0)
        self.assertEqual(scenario(24)["lp_loss_usdc"], 350)
        self.assertIsNotNone(scenario(24)["new_unsecured_issuance_halted_after_default"])


if __name__ == "__main__":
    unittest.main()
