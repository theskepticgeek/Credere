"""Extract real Aave V3 Ethereum observations. Never substitutes synthetic records."""
import argparse
import csv
import hashlib
import json
import math
import os
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlsplit

POOL = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fa4E2"
DAY = 86400
class ExtractionError(Exception):
    """Safe messages authored by this extractor, excluding provider credentials."""
SIGNATURES = {
    "Borrow": "Borrow(address,address,address,uint256,uint8,uint256,uint16)",
    "Repay": "Repay(address,address,address,uint256,bool)",
    "LiquidationCall": "LiquidationCall(address,address,address,uint256,uint256,address,bool)",
}
ABI = [{"type": "function", "name": "getUserAccountData", "stateMutability": "view",
        "inputs": [{"name": "user", "type": "address"}],
        "outputs": [{"name": n, "type": "uint256"} for n in
                    ["totalCollateralBase", "totalDebtBase", "availableBorrowsBase", "currentLiquidationThreshold", "ltv", "healthFactor"]]}]


def history_and_label(events, wallet, timestamp, lookback=180 * DAY, horizon=30 * DAY):
    own = [e for e in events if e["wallet"].lower() == wallet.lower()]
    history = [e for e in own if timestamp - lookback <= e["timestamp"] <= timestamp]
    label = int(any(e["event"] == "LiquidationCall" and timestamp < e["timestamp"] <= timestamp + horizon for e in own))
    return history, label


def held_out(wallet):
    return int(hashlib.sha256(wallet.lower().encode()).hexdigest(), 16) % 5 == 0


def chronological_partitions(rows, horizon=30 * DAY):
    dates = sorted(set(int(r["timestamp"]) for r in rows))
    if len(dates) < 10:
        raise ValueError("Need at least 10 distinct snapshot dates; no meaningful time-split estimate is possible.")
    validation_start = dates[int(len(dates) * .6)]
    test_start = dates[int(len(dates) * .8)]
    train = [i for i, r in enumerate(rows) if int(r["timestamp"]) + horizon < validation_start]
    validation = [i for i, r in enumerate(rows) if validation_start <= int(r["timestamp"]) and int(r["timestamp"]) + horizon < test_start]
    test = [i for i, r in enumerate(rows) if int(r["timestamp"]) >= test_start]
    if not train or not test:
        raise ValueError("Insufficient dated observations after the 30-day label embargo.")
    return train, validation, test, test_start


def run(args):
    from web3 import Web3
    rpc = os.getenv("AAVE_ARCHIVE_RPC_URL")
    if not rpc:
        raise ExtractionError("Set AAVE_ARCHIVE_RPC_URL privately. Extraction requires historical eth_call and complete eth_getLogs access.")
    web3 = Web3(Web3.HTTPProvider(rpc, request_kwargs={"timeout": 60}))
    if web3.eth.chain_id != 1:
        raise ExtractionError("The dataset source must be Ethereum mainnet (chain ID 1).")
    pool = web3.eth.contract(address=Web3.to_checksum_address(POOL), abi=ABI)
    finalized = web3.eth.get_block("finalized")
    end = args.to_block or finalized.number
    if end > finalized.number or args.from_block >= end:
        raise ExtractionError("Choose an ordered block range ending at or before the finalized block.")
    if args.from_block < 16492400:
        raise ExtractionError("The snapshot range must start after Ethereum Aave V3 deployment.")
    # Archive access check must succeed even for the zero account. Do not swallow historical-call failures.
    try:
        pool.functions.getUserAccountData("0x0000000000000000000000000000000000000000").call(block_identifier=args.from_block)
    except Exception:
        raise ExtractionError("Historical eth_call preflight failed. This endpoint must permit archive contract-state reads.") from None
    if args.preflight:
        try:
            web3.eth.get_logs({"address": pool.address, "fromBlock": args.from_block, "toBlock": args.from_block})
        except Exception:
            raise ExtractionError("Historical eth_getLogs preflight failed. Check provider permissions and log-range limits.") from None
        print(json.dumps({"chain_id": 1, "archive_call": "ok", "historical_logs": "ok", "from_block": args.from_block, "finalized_block": finalized.number}))
        return
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    timestamps = {}

    def block_time(number):
        if number not in timestamps:
            timestamps[number] = web3.eth.get_block(number).timestamp
        return timestamps[number]

    def block_at_or_after(timestamp, lo, hi):
        while lo < hi:
            mid = (lo + hi) // 2
            if block_time(mid) < timestamp:
                lo = mid + 1
            else:
                hi = mid
        return lo

    first_time = block_time(args.from_block)
    # Ethereum Aave V3 pool launch; no fabricated history before its deployment.
    launch = 16492400
    history_start = block_at_or_after(first_time - args.lookback_days * DAY, launch, args.from_block)
    topics = {Web3.keccak(text=signature).hex().removeprefix("0x"): name for name, signature in SIGNATURES.items()}
    events = []
    for lo in range(history_start, end + 1, args.chunk_size):
        hi = min(end, lo + args.chunk_size - 1)
        logs = web3.eth.get_logs({"address": POOL, "fromBlock": lo, "toBlock": hi, "topics": [["0x" + t for t in topics]]})
        for log in logs:
            name = topics[log["topics"][0].hex().removeprefix("0x")]
            wallet_topic = 3 if name == "LiquidationCall" else 2
            events.append({"event": name, "wallet": "0x" + log["topics"][wallet_topic].hex()[-40:],
                           "asset": "0x" + log["topics"][1].hex()[-40:], "block": log["blockNumber"],
                           "timestamp": block_time(log["blockNumber"]), "transaction": log["transactionHash"].hex(), "log_index": log["logIndex"]})
        print(f"Extracted through block {hi}; {len(events)} relevant events", flush=True)
    events.sort(key=lambda e: (e["block"], e["log_index"]))
    by_wallet = defaultdict(list)
    for event in events:
        by_wallet[event["wallet"].lower()].append(event)
    (output / "events.jsonl").write_text("\n".join(json.dumps(e) for e in events), encoding="utf-8")
    rows = []
    known_borrowers = sorted({e["wallet"].lower() for e in events if e["event"] == "Borrow"})
    for cutoff in range(args.from_block, end + 1, args.snapshot_step):
        timestamp = block_time(cutoff)
        if timestamp + args.horizon_days * DAY > block_time(end):
            break  # never assign negative labels to incomplete future windows
        for wallet in known_borrowers:
            history, label = history_and_label(by_wallet[wallet], wallet, timestamp, args.lookback_days * DAY, args.horizon_days * DAY)
            if not any(e["event"] == "Borrow" for e in history):
                continue
            values = pool.functions.getUserAccountData(Web3.to_checksum_address(wallet)).call(block_identifier=cutoff)
            collateral, debt, _, _, _, hf = values
            if not debt or not collateral:
                continue
            counts = Counter(e["event"] for e in history)
            borrow_events = [e for e in history if e["event"] == "Borrow"]
            rows.append({"wallet": wallet, "block": cutoff, "timestamp": timestamp, "horizon_end": timestamp + args.horizon_days * DAY,
                         "label": label, "health_factor": hf / 1e18, "debt_to_collateral": debt / collateral,
                         "log_debt_base": math.log1p(debt / 1e8),
                         "observed_history_days": (timestamp - min(e["timestamp"] for e in borrow_events)) / DAY,
                         "borrow_count": counts["Borrow"], "repay_count": counts["Repay"], "past_liquidations": counts["LiquidationCall"],
                         "repay_to_borrow": counts["Repay"] / max(1, counts["Borrow"]),
                         "historical_borrow_assets": len({e["asset"] for e in borrow_events})})
        print(f"Snapshot {cutoff}: {len(rows)} accumulated observations", flush=True)
    if not rows:
        raise ExtractionError("No fully observed borrower windows. Expand the range; extraction did not create a placeholder dataset.")
    csv_path = output / "observations.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    manifest = {"source": "real-chain-data", "chain_id": 1, "pool": POOL, "provider_host": urlsplit(rpc).hostname,
                "from_block": args.from_block, "history_start_block": history_start, "to_block": end,
                "from_hash": web3.eth.get_block(args.from_block).hash.hex(), "to_hash": web3.eth.get_block(end).hash.hex(),
                "lookback_days": args.lookback_days, "horizon_days": args.horizon_days, "snapshot_step_blocks": args.snapshot_step,
                "rows": len(rows), "wallets": len({r["wallet"] for r in rows}), "positive_labels": sum(r["label"] for r in rows),
                "csv_sha256": hashlib.sha256(csv_path.read_bytes()).hexdigest(),
                "limitations": ["Borrower cohort is limited to wallets with observed borrowing in the lookback window.",
                                "Observed history age is not wallet age; historical asset count is not current concentration.",
                                "Liquidation is an adverse financial event, not Credere strategic default."]}
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from-block", type=int, required=True)
    parser.add_argument("--to-block", type=int)
    parser.add_argument("--snapshot-step", type=int, default=50400)
    parser.add_argument("--chunk-size", type=int, default=1000)
    parser.add_argument("--lookback-days", type=int, default=180)
    parser.add_argument("--horizon-days", type=int, default=30)
    parser.add_argument("--output", default="research/data")
    parser.add_argument("--preflight", action="store_true")
    args = parser.parse_args()
    if min(args.snapshot_step, args.chunk_size, args.lookback_days, args.horizon_days) <= 0:
        parser.error("Steps, windows, and chunk sizes must be positive.")
    try:
        run(args)
    except Exception as error:
        # Provider exceptions can contain credential-bearing URLs. Keep them out of logs.
        if isinstance(error, ExtractionError):
            parser.exit(1, f"Extraction stopped: {error}\n")
        parser.exit(1, "Extraction stopped: archive/log RPC request failed. Check provider access and block limits. No empirical result was produced.\n")
