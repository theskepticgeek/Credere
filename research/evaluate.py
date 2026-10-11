"""Reproducible, leakage-aware model comparison. Requires a real extraction manifest."""
import argparse
import hashlib
import json
from pathlib import Path
from dataset import chronological_partitions, held_out

MODELS = {
    "M0_current_position": ["health_factor", "debt_to_collateral", "log_debt_base"],
    "M1_simple_history": ["health_factor", "debt_to_collateral", "log_debt_base", "observed_history_days", "borrow_count"],
    "M2_behavioral_history": ["health_factor", "debt_to_collateral", "log_debt_base", "observed_history_days", "borrow_count", "repay_count", "past_liquidations", "repay_to_borrow", "historical_borrow_assets"],
}


def evaluate(args):
    import numpy as np
    import pandas as pd
    from sklearn.pipeline import make_pipeline
    from sklearn.impute import SimpleImputer
    from sklearn.preprocessing import StandardScaler
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import roc_auc_score, average_precision_score, brier_score_loss
    from sklearn.calibration import calibration_curve
    directory = Path(args.data)
    manifest = json.loads((directory / "manifest.json").read_text())
    if manifest.get("source") != "real-chain-data":
        raise ValueError("Empirical evaluation requires a real-chain-data manifest.")
    csv_path = directory / "observations.csv"
    if hashlib.sha256(csv_path.read_bytes()).hexdigest() != manifest["csv_sha256"]:
        raise ValueError("Dataset hash does not match the extraction manifest.")
    df = pd.read_csv(csv_path)
    rows = df.to_dict("records")
    horizon = manifest["horizon_days"] * 86400
    train, validation, test, test_start = chronological_partitions(rows, horizon)
    held_train = [i for i in train if not held_out(rows[i]["wallet"])]
    held_test = [i for i in test if held_out(rows[i]["wallet"])]
    report = {"source": "real-chain-data", "dataset_sha256": manifest["csv_sha256"], "seed": 42,
              "label": "Aave liquidation within the next 30 days" if manifest["horizon_days"] == 30 else f"Aave liquidation within {manifest['horizon_days']} days",
              "splits": {"train": len(train), "validation": len(validation), "test": len(test), "held_out_train": len(held_train), "held_out_test": len(held_test)},
              "test_start_timestamp": test_start, "embargo_seconds": horizon,
              "limitations": manifest["limitations"] + ["Repeated observations within a wallet are correlated.", "This analysis does not estimate Credere voluntary repayment probability."], "models": {}}
    for name, features in MODELS.items():
        model_report = {"features": features}
        for split_name, training, testing in [("chronological", train, test), ("wallet_held_out", held_train, held_test)]:
            if not training or not testing or df.iloc[training].label.nunique() < 2 or df.iloc[testing].label.nunique() < 2:
                model_report[split_name] = {"status": "insufficient_classes_or_samples"}
                continue
            model = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), LogisticRegression(max_iter=1000, random_state=42))
            model.fit(df.iloc[training][features], df.iloc[training].label)
            y = df.iloc[testing].label.to_numpy()
            probability = model.predict_proba(df.iloc[testing][features])[:, 1]
            observed, predicted = calibration_curve(y, probability, n_bins=10, strategy="quantile")
            model_report[split_name] = {"status": "evaluated", "rows": len(testing), "wallets": int(df.iloc[testing].wallet.nunique()),
                                      "positives": int(y.sum()), "prevalence": float(np.mean(y)),
                                      "auroc": float(roc_auc_score(y, probability)), "average_precision": float(average_precision_score(y, probability)),
                                      "brier_score": float(brier_score_loss(y, probability)),
                                      "calibration": {"predicted": predicted.tolist(), "observed": observed.tolist()}}
        report["models"][name] = model_report
    a = report["models"]["M0_current_position"]["chronological"]
    b = report["models"]["M2_behavioral_history"]["chronological"]
    report["delta_auroc_M2_minus_M0"] = b["auroc"] - a["auroc"] if "auroc" in a and "auroc" in b else None
    destination = Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", default="research/data")
    parser.add_argument("--output", default="research/results/evaluation.json")
    try:
        evaluate(parser.parse_args())
    except (ValueError, FileNotFoundError) as error:
        parser.exit(1, f"Evaluation unavailable: {error}\n")
