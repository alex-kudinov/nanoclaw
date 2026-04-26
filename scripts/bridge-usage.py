#!/usr/bin/env python3
"""Aggregate Claude Print Bridge usage from JSONL ledger files.

Reads daily JSONL files from the bridge ledger directory and prints
cost/token summaries grouped by minion, action, model, or day.

Usage:
    python3 scripts/bridge-usage.py                  # today
    python3 scripts/bridge-usage.py --days 7         # last 7 days
    python3 scripts/bridge-usage.py --group minion   # group by minion
    python3 scripts/bridge-usage.py --group action   # group by action
    python3 scripts/bridge-usage.py --group model    # group by model
    python3 scripts/bridge-usage.py --group day      # group by day
    python3 scripts/bridge-usage.py --raw            # dump all entries
"""
import argparse
import json
import os
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

LEDGER_DIR_LOCAL = Path.home() / "Library" / "Logs" / "claude-bridge-usage"
REMOTE_HOST = "macmini-eth.kudinov.com"
REMOTE_DIR = "Library/Logs/claude-bridge-usage"


def fetch_remote_files(dates: list[str], local_cache: Path) -> list[Path]:
    """SCP ledger files from Mac Mini if not running locally."""
    local_cache.mkdir(parents=True, exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")
    fetched = []
    for d in dates:
        fname = f"usage-{d}.jsonl"
        local = local_cache / fname
        # Never cache today's file — it's still being written
        if local.exists() and d != today:
            fetched.append(local)
            continue
        remote = f"{REMOTE_HOST}:~/{REMOTE_DIR}/{fname}"
        result = subprocess.run(
            ["scp", "-q", remote, str(local)],
            capture_output=True,
        )
        if result.returncode == 0:
            fetched.append(local)
    return fetched


def load_entries(dates: list[str]) -> list[dict]:
    entries = []

    # Try local first (if running on the Mac Mini itself)
    if LEDGER_DIR_LOCAL.is_dir():
        for d in dates:
            f = LEDGER_DIR_LOCAL / f"usage-{d}.jsonl"
            if f.exists():
                for line in f.read_text().splitlines():
                    if line.strip():
                        try:
                            entries.append(json.loads(line))
                        except json.JSONDecodeError:
                            pass
        if entries:
            return entries

    # Fetch from remote
    cache = Path("/tmp/bridge-usage-cache")
    files = fetch_remote_files(dates, cache)
    for f in files:
        for line in f.read_text().splitlines():
            if line.strip():
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return entries


def format_cost(usd: float) -> str:
    if usd < 0.01:
        return f"${usd:.4f}"
    return f"${usd:.2f}"


def format_tokens(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(n)


def print_table(rows: list[dict], group_key: str) -> None:
    if not rows:
        print("No data.")
        return

    header = f"{'Group':<30} {'Calls':>6} {'In':>9} {'Out':>9} {'Cache-R':>9} {'Cache-W':>9} {'Cost':>10}"
    print(header)
    print("-" * len(header))

    total_calls = 0
    total_cost = 0.0

    for r in sorted(rows, key=lambda x: -x["cost"]):
        label = (r["group"] or "(untagged)")[:30]
        print(
            f"{label:<30} {r['calls']:>6} "
            f"{format_tokens(r['input']):>9} "
            f"{format_tokens(r['output']):>9} "
            f"{format_tokens(r['cache_read']):>9} "
            f"{format_tokens(r['cache_write']):>9} "
            f"{format_cost(r['cost']):>10}"
        )
        total_calls += r["calls"]
        total_cost += r["cost"]

    print("-" * len(header))
    print(f"{'TOTAL':<30} {total_calls:>6} {'':>9} {'':>9} {'':>9} {'':>9} {format_cost(total_cost):>10}")


def aggregate(entries: list[dict], group_by: str) -> list[dict]:
    buckets = defaultdict(lambda: {
        "calls": 0, "input": 0, "output": 0,
        "cache_read": 0, "cache_write": 0, "cost": 0.0,
    })

    for e in entries:
        if group_by == "minion":
            key = e.get("minion")
        elif group_by == "action":
            key = e.get("action")
        elif group_by == "job":
            key = e.get("job")
        elif group_by == "model":
            key = e.get("model")
        elif group_by == "day":
            key = (e.get("ts") or "")[:10]
        elif group_by == "caller":
            key = e.get("caller")
        else:
            key = e.get(group_by)

        b = buckets[key]
        b["calls"] += 1
        b["input"] += e.get("input_tokens", 0)
        b["output"] += e.get("output_tokens", 0)
        b["cache_read"] += e.get("cache_read_tokens", 0)
        b["cache_write"] += e.get("cache_write_tokens", 0)
        b["cost"] += e.get("cost_usd", 0)

    return [{"group": k, **v} for k, v in buckets.items()]


def main():
    parser = argparse.ArgumentParser(description="Bridge usage aggregator")
    parser.add_argument("--days", type=int, default=1, help="Number of days to look back (default: 1)")
    parser.add_argument("--group", default="minion", help="Group by: minion, action, job, model, day, caller")
    parser.add_argument("--raw", action="store_true", help="Dump raw JSONL entries")
    parser.add_argument("--date", help="Specific date (YYYY-MM-DD)")
    args = parser.parse_args()

    if args.date:
        dates = [args.date]
    else:
        today = datetime.now()
        dates = [(today - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(args.days)]

    entries = load_entries(dates)

    if not entries:
        print(f"No ledger data for {', '.join(dates)}")
        print(f"Checked: {LEDGER_DIR_LOCAL} (local) and {REMOTE_HOST}:~/{REMOTE_DIR} (remote)")
        sys.exit(0)

    if args.raw:
        for e in entries:
            print(json.dumps(e, indent=2))
        return

    period = dates[-1] if len(dates) == 1 else f"{dates[-1]} → {dates[0]}"
    print(f"\nBridge usage: {period}  ({len(entries)} calls)")
    print(f"Grouped by: {args.group}\n")

    rows = aggregate(entries, args.group)
    print_table(rows, args.group)
    print()


if __name__ == "__main__":
    main()
