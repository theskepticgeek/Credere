"""Hypothetical portfolio scenarios, never presented as historical estimates."""
import json
import random
from pathlib import Path


def settle(principal, collateral, reserve):
    recovered = min(principal, collateral)
    shortfall = principal - recovered
    covered = min(shortfall, reserve)
    return {"collateral_recovered": recovered, "reserve_used": covered, "lp_loss": shortfall - covered, "reserve_remaining": reserve - covered}


def issue_allowed(reserve, outstanding, proposed):
    return proposed == 0 or reserve > 0 and reserve >= (outstanding + proposed + 3) // 4


def scenario(defaults, borrowers=40, reserve=250_000_000):
    # 40 illustrative seasoned loans of 1,000 USDC with 975 USDC collateral.
    principal, collateral = 1_000_000_000, 975_000_000
    exposure = borrowers * (principal - collateral)
    original = reserve
    loss = 0
    halted_at = None
    for n in range(defaults):
        result = settle(principal, collateral, reserve)
        reserve = result["reserve_remaining"]
        loss += result["lp_loss"]
        exposure -= principal - collateral
        if halted_at is None and not issue_allowed(reserve, exposure, principal - collateral):
            halted_at = n + 1
    return {"defaulted_loans": defaults, "borrowers": borrowers, "initial_reserve_usdc": original / 1e6,
            "reserve_used_usdc": (original - reserve) / 1e6, "lp_loss_usdc": loss / 1e6,
            "reserve_remaining_usdc": reserve / 1e6, "new_unsecured_issuance_halted_after_default": halted_at}


def report():
    rng = random.Random(42)
    trials = []
    for _ in range(2000):
        # A common shock changes all borrowers' conditional default probability.
        p = .60 if rng.random() < .05 else .03
        trials.append(scenario(sum(rng.random() < p for _ in range(40)))["lp_loss_usdc"])
    trials.sort()
    return {"source": "hypothetical-simulation", "seed": 42, "units": "USDC", "assumptions": {
        "loans": 40, "principal_per_loan": 1000, "collateral_per_loan": 975, "reserve": 250,
        "base_conditional_default_probability": .03, "common_shock_probability": .05, "shock_conditional_default_probability": .60,
        "recovery": "same-asset collateral; no volatile-price haircut", "unpaid_interest": "foregone income, excluded from principal impairment"},
        "scenarios": {"base": scenario(1), "stress": scenario(8), "severe": scenario(24)},
        "monte_carlo": {"trials": 2000, "p99_lp_loss_usdc": trials[int(.99 * (len(trials) - 1))], "maximum_lp_loss_usdc": max(trials)}}


if __name__ == "__main__":
    output = report()
    Path("artifacts").mkdir(exist_ok=True)
    Path("artifacts/stress-scenarios.json").write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps(output, indent=2))
