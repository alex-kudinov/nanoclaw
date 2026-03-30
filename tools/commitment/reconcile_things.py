#!/usr/bin/env python3
"""Reconcile Things 3 status back to vault commitment register.

Reads the register, checks each open/overdue commitment's Things 3 status,
updates the register. Applies staleness and overdue rules.

Usage: python reconcile_things.py [--vault-root PATH] [--dry-run]
"""

import argparse
import fcntl
import json
import subprocess
import sys
from datetime import datetime, date
from pathlib import Path
from zoneinfo import ZoneInfo

CST = ZoneInfo("America/Chicago")
VAULT_ROOT_DEFAULT = Path.home() / "Vaults" / "My Notes"
REGISTER_REL = Path("meta") / "commitment-register.json"
LOCK_REL = Path("meta") / ".locks" / "commitment-register.lock"
STALE_DAYS = 14


# ── Things 3 Interaction ────────────────────────────────────────────────────

def ensure_things_running() -> None:
    """Ensure Things 3 is running."""
    result = subprocess.run(["pgrep", "-x", "Things3"], capture_output=True)
    if result.returncode != 0:
        subprocess.run(["open", "-a", "Things3"], check=True)
        import time
        time.sleep(2)


def things_get_todo(todo_id: str) -> dict | None:
    """Get a Things 3 todo by ID. Returns {id, name, status} or None."""
    script = f'''
var things = Application("Things3");
try {{
    var todo = things.toDos.whose({{id: "{todo_id}"}})[0];
    var name = todo.name();
    var status = todo.status();
    var statusStr = "open";
    if (status === "completed") statusStr = "completed";
    else if (status === "canceled") statusStr = "canceled";
    JSON.stringify({{id: "{todo_id}", name: name, status: statusStr}});
}} catch(e) {{
    "null";
}}
'''
    try:
        result = subprocess.run(
            ["osascript", "-l", "JavaScript", "-e", script],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            output = result.stdout.strip()
            if output == "null" or not output:
                return None
            return json.loads(output)
    except (subprocess.TimeoutExpired, json.JSONDecodeError):
        pass
    return None


# ── Register Operations ─────────────────────────────────────────────────────

def load_register(vault_root: Path) -> dict:
    """Load commitment register."""
    path = vault_root / REGISTER_REL
    if not path.exists():
        return {"schema_version": 1, "last_sync_run": None, "commitments": []}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"schema_version": 1, "last_sync_run": None, "commitments": []}


def save_register(vault_root: Path, register: dict) -> None:
    """Save commitment register atomically with file locking."""
    path = vault_root / REGISTER_REL
    lock_path = vault_root / LOCK_REL
    lock_path.parent.mkdir(parents=True, exist_ok=True)

    with open(lock_path, "w") as lock_fd:
        fcntl.flock(lock_fd, fcntl.LOCK_EX)
        try:
            tmp = path.with_suffix(".tmp")
            tmp.write_text(
                json.dumps(register, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            tmp.replace(path)
        finally:
            fcntl.flock(lock_fd, fcntl.LOCK_UN)


# ── Reconciliation ──────────────────────────────────────────────────────────

def reconcile(vault_root: Path, dry_run: bool = False) -> None:
    """Run reconciliation for all open commitments with Things IDs."""
    ensure_things_running()

    register = load_register(vault_root)
    commitments = register.get("commitments", [])
    now = datetime.now(CST)
    today = date.today()

    open_with_things = [
        c for c in commitments
        if c.get("things-id") and c.get("status") in ("open", "in-progress")
    ]

    if not open_with_things:
        print("No open commitments with Things IDs to reconcile.")
        return

    print(f"Reconciling {len(open_with_things)} open commitment(s)")

    updated = 0
    errors = 0
    all_success = True

    for c in open_with_things:
        things_id = c["things-id"]
        action_preview = c.get("action", "?")[:60]

        todo = things_get_todo(things_id)
        if todo is None:
            # Todo not found — may have been deleted
            if dry_run:
                print(f"  DRY RUN: would mark deleted: {action_preview}")
            else:
                c["things-status"] = "deleted"
                c["status"] = "deleted"
                c["last-checked"] = now.isoformat()
                updated += 1
                print(f"  DELETED (not found in Things): {action_preview}")
            continue

        things_status = todo.get("status", "open")
        old_status = c.get("things-status", "open")

        if things_status != old_status:
            if dry_run:
                print(f"  DRY RUN: {old_status} → {things_status}: {action_preview}")
            else:
                c["things-status"] = things_status
                if things_status == "completed":
                    c["status"] = "completed"
                elif things_status == "canceled":
                    c["status"] = "deleted"
                c["last-checked"] = now.isoformat()
                updated += 1
                print(f"  UPDATED: {old_status} → {things_status}: {action_preview}")
        else:
            c["last-checked"] = now.isoformat()

    # Apply staleness and overdue rules
    stale_count = 0
    overdue_count = 0
    for c in commitments:
        if c.get("status") not in ("open", "in-progress"):
            continue

        # Overdue check
        due = c.get("due-date")
        if due:
            try:
                due_date = date.fromisoformat(due)
                if due_date < today:
                    overdue_count += 1
            except ValueError:
                pass

        # Staleness check
        last_checked = c.get("last-checked")
        if last_checked:
            try:
                checked_dt = datetime.fromisoformat(last_checked)
                if (now - checked_dt).days >= STALE_DAYS:
                    stale_count += 1
            except ValueError:
                pass

    if not dry_run:
        register["last_sync_run"] = now.isoformat()
        save_register(vault_root, register)

    print(f"\nReconciliation complete:")
    print(f"  Updated: {updated}")
    print(f"  Overdue: {overdue_count}")
    print(f"  Stale: {stale_count}")


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="Reconcile Things 3 → vault commitments")
    parser.add_argument("--vault-root", type=Path, default=VAULT_ROOT_DEFAULT)
    parser.add_argument("--dry-run", action="store_true", help="Preview without updating")
    args = parser.parse_args()
    reconcile(args.vault_root.expanduser().resolve(), args.dry_run)


if __name__ == "__main__":
    main()
