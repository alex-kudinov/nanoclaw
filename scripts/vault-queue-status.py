#!/usr/bin/env python3
"""Generate queue-status.json for vault pipeline monitoring.

Scans OneDrive Drop, vault Intake, manifests, processor locks,
watcher log, and recent output. Writes a snapshot to meta/ so
El Archivista can answer queue-state questions from inside the container.

Called by onedrive-watcher.sh after each cycle, or standalone.
"""
import json
import os
import re
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

HOME = Path.home()
ONEDRIVE = HOME / "Library/CloudStorage/OneDrive-SoleraHoldings,Inc"
DROP = ONEDRIVE / "Drop"
VAULT = HOME / "Vaults/My Notes"
INTAKE = VAULT / "Intake"
META = VAULT / "meta"
LOG_PATH = HOME / ".local/log/onedrive-watcher.log"

OUTPUT_DIRS = {
    "solera": VAULT / "Solera",
    "tandem": VAULT / "Tandem",
    "cnpc": VAULT / "CNPC",
}

CATEGORIES = ["Calendar", "Chats", "Emails"]

DROP_QUEUES = {
    "calendar": (DROP / "Calendar", "*.txt"),
    "chats": (DROP / "Chats", "*.txt"),
    "email": (DROP / "Email", "*"),
    "people": (DROP / "People", "*.json"),
    "root": (DROP, None),  # special: root-level files only
}

INTAKE_QUEUES = {
    "calendar": (INTAKE / "Calendar", "*"),
    "chats": (INTAKE / "Chats", "*"),
    "email": (INTAKE / "Email", "*"),
    "people": (INTAKE / "People", "*"),
    "onedrive": (INTAKE / "OneDrive", "*"),
}

NOW = datetime.now(timezone.utc)

NOISE_PATTERNS = {".DS_Store", ".localized", "Thumbs.db", "desktop.ini"}


def _is_noise(f: Path) -> bool:
    """Filter OS artifacts and Syncthing conflict files."""
    return f.name in NOISE_PATTERNS or ".sync-conflict-" in f.name


def scan_dir(path: Path, pattern: str | None, root_only: bool = False) -> dict:
    """Count files and get age range for a directory."""
    if not path.is_dir():
        return {"count": 0, "oldest": None, "newest": None, "files": []}

    files = []
    try:
        if root_only:
            entries = [f for f in path.iterdir() if f.is_file()]
        elif pattern:
            entries = list(path.glob(pattern))
        else:
            entries = list(path.iterdir())
        files = [f for f in entries if f.is_file() and not _is_noise(f)]
    except Exception:
        return {"count": 0, "oldest": None, "newest": None, "error": "read_failed"}

    if not files:
        return {"count": 0, "oldest": None, "newest": None, "files": []}

    mtimes = []
    names = []
    for f in sorted(files, key=lambda x: x.stat().st_mtime):
        try:
            mt = datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc)
            mtimes.append(mt)
            names.append(f.name)
        except Exception:
            pass

    result = {
        "count": len(names),
        "oldest": mtimes[0].isoformat() if mtimes else None,
        "newest": mtimes[-1].isoformat() if mtimes else None,
    }
    # Include filenames for small queues, just count for large ones
    if len(names) <= 10:
        result["files"] = names
    else:
        result["sample"] = names[:5] + ["..."] + names[-3:]
    return result


def scan_errors(intake_path: Path) -> dict:
    """Check for error subfolders in intake directories."""
    errors = {}
    for name in ["Calendar", "Chats", "Email"]:
        err_dir = intake_path / name / "errors"
        if err_dir.is_dir():
            count = len([f for f in err_dir.iterdir() if f.is_file()])
            if count > 0:
                errors[name.lower()] = count
    return errors


def read_manifest(name: str) -> dict:
    """Read a manifest and extract summary stats."""
    path = META / f"{name}-manifest.json"
    if not path.is_file():
        return {"exists": False}

    try:
        with open(path) as f:
            data = json.load(f)
    except Exception as e:
        return {"exists": True, "error": str(e)}

    # Email manifest has nested structure
    if name == "email":
        by_msg = data.get("by_message_id", {})
        by_conv = data.get("by_conversation_id", {})
        statuses = {}
        dates = []
        for entry in by_msg.values():
            s = entry.get("status", "unknown")
            statuses[s] = statuses.get(s, 0) + 1
            pd = entry.get("processed_date", "")
            if pd:
                dates.append(pd)
        return {
            "exists": True,
            "messages": len(by_msg),
            "conversations": len(by_conv),
            "statuses": statuses,
            "last_processed": max(dates) if dates else None,
        }

    # Calendar and chat manifests are flat dicts
    entries = data if isinstance(data, dict) else {}
    dates = []
    for entry in entries.values():
        for key in ["last_seen", "last_processed"]:
            if key in entry and entry[key]:
                dates.append(entry[key])

    return {
        "exists": True,
        "entries": len(entries),
        "last_activity": max(dates) if dates else None,
    }


def count_recent_output(hours: int = 24) -> dict:
    """Count output files created in the last N hours per domain/category."""
    cutoff = NOW - timedelta(hours=hours)
    result = {}
    for domain, base in OUTPUT_DIRS.items():
        domain_counts = {}
        for cat in CATEGORIES:
            cat_dir = base / cat
            if not cat_dir.is_dir():
                domain_counts[cat.lower()] = 0
                continue
            count = 0
            try:
                for f in cat_dir.iterdir():
                    if f.is_file() and f.suffix == ".md":
                        mt = datetime.fromtimestamp(
                            f.stat().st_mtime, tz=timezone.utc
                        )
                        if mt >= cutoff:
                            count += 1
            except Exception:
                pass
            domain_counts[cat.lower()] = count
        result[domain] = domain_counts
    return result


def check_locks() -> dict:
    """Check which processor locks are currently held."""
    locks = {}
    for name in ["calendar", "chat", "email", "people", "resolver"]:
        lockfile = Path(f"/tmp/nanoclaw-proc-{name}.lock")
        if lockfile.is_file():
            try:
                pid = int(lockfile.read_text().strip())
                # Check if process is actually running
                try:
                    os.kill(pid, 0)
                    locks[name] = {"held": True, "pid": pid}
                except OSError:
                    locks[name] = {"held": False, "stale_pid": pid}
            except (ValueError, OSError):
                locks[name] = {"held": False, "error": "unreadable"}
        else:
            locks[name] = {"held": False}

    # AI semaphore slots
    sem_dir = Path("/tmp/nanoclaw-ai-sem")
    ai_slots = 0
    if sem_dir.is_dir():
        for slot in sem_dir.glob("*.slot"):
            try:
                pid = int(slot.read_text().strip())
                os.kill(pid, 0)
                ai_slots += 1
            except (ValueError, OSError):
                pass
    locks["_ai_semaphore"] = {"active_slots": ai_slots, "max_slots": 2}
    return locks


def parse_watcher_log(max_lines: int = 100) -> dict:
    """Extract recent activity from the watcher log."""
    if not LOG_PATH.is_file():
        return {"exists": False}

    try:
        with open(LOG_PATH) as f:
            lines = f.readlines()
    except Exception:
        return {"exists": True, "error": "read_failed"}

    recent = lines[-max_lines:] if len(lines) > max_lines else lines

    last_run = None
    last_copy = None
    errors = []
    for line in reversed(recent):
        line = line.strip()
        # Extract timestamp
        ts_match = re.match(r"\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]", line)
        if not ts_match:
            continue

        ts = ts_match.group(1)
        rest = line[len(ts_match.group(0)):].strip()

        if not last_run:
            last_run = ts

        if "Copy phase done:" in rest and not last_copy:
            # Parse: Copy phase done: cal=5 chat=3 people=1 email=12 drop=0
            counts = {}
            for pair in re.findall(r"(\w+)=(\d+)", rest):
                counts[pair[0]] = int(pair[1])
            last_copy = {"timestamp": ts, "counts": counts}

        # Match real errors, not summary lines like "Errors: 0"
        if re.search(r"(?i)\berror\b", rest) and not re.match(
            r".*Errors?:\s*0\b", rest
        ):
            errors.append({"timestamp": ts, "message": rest[:200]})
            if len(errors) >= 5:
                break

    return {
        "exists": True,
        "last_activity": last_run,
        "last_copy": last_copy,
        "recent_errors": errors[:5],
    }


def main():
    status = {
        "generated_at": NOW.isoformat(),
        "drop": {},
        "intake": {},
        "intake_errors": scan_errors(INTAKE),
        "manifests": {},
        "recent_output_24h": count_recent_output(24),
        "locks": check_locks(),
        "watcher": parse_watcher_log(),
    }

    # Scan drop queues
    for name, (path, pattern) in DROP_QUEUES.items():
        root_only = name == "root"
        status["drop"][name] = scan_dir(path, pattern, root_only=root_only)

    # Scan intake queues
    for name, (path, pattern) in INTAKE_QUEUES.items():
        status["intake"][name] = scan_dir(path, pattern)

    # Read manifests
    for name in ["calendar", "chat", "email"]:
        status["manifests"][name] = read_manifest(name)

    # Write output
    out_path = META / "queue-status.json"
    META.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(status, f, indent=2, default=str)

    # Summary to stdout for watcher log
    drop_total = sum(s.get("count", 0) for s in status["drop"].values())
    intake_total = sum(s.get("count", 0) for s in status["intake"].values())
    locks_held = sum(
        1 for k, v in status["locks"].items()
        if k != "_ai_semaphore" and v.get("held")
    )
    print(f"Queue status: drop={drop_total} intake={intake_total} locks={locks_held}")


if __name__ == "__main__":
    main()
