#!/usr/bin/env python3
"""Copy files from OneDrive Drop to vault Intake folders.

Called by onedrive-watcher.sh. Uses Python because macOS TCC blocks
bash/launchd from reading ~/Library/CloudStorage/ but allows Python.

Uses manual byte copy (not shutil.copy2) to avoid EDEADLK errors
with OneDrive cloud-placeholder files on macOS.

Outputs JSON: {"cal": N, "chat": N, "people": N, "email": N, "drop": N}
"""
import json
import os
import sys
from pathlib import Path

HOME = Path.home()
ONEDRIVE = HOME / "Library/CloudStorage/OneDrive-SoleraHoldings,Inc"
DROP = ONEDRIVE / "Drop"
VAULT = HOME / "Vaults/My Notes"

ROUTES = [
    ("Calendar", "*.txt",  VAULT / "Intake/Calendar", True),
    ("Chats",    "*.txt",  VAULT / "Intake/Chats",    True),
    ("People",   "*.json", VAULT / "Intake/People",   False),  # keep source
    ("Email",    "*",      VAULT / "Intake/Email",    True),
]

DROP_ROOT_EXTS = {".txt", ".eml"}


def safe_copy(src: Path, dst: Path) -> bool:
    """Copy file using manual read/write to avoid macOS fcopyfile issues."""
    try:
        with open(src, "rb") as fin:
            data = fin.read()
        with open(dst, "wb") as fout:
            fout.write(data)
        return True
    except Exception as e:
        print(f"WARN: copy failed {src.name}: {e}", file=sys.stderr)
        return False


def copy_subdir(subdir: str, pattern: str, dest: Path, delete_src: bool) -> int:
    src_dir = DROP / subdir
    if not src_dir.is_dir():
        return 0
    dest.mkdir(parents=True, exist_ok=True)
    count = 0
    for f in sorted(src_dir.glob(pattern)):
        if not f.is_file() or ".sync-conflict-" in f.name:
            continue
        if safe_copy(f, dest / f.name):
            if delete_src:
                try:
                    f.unlink()
                except Exception:
                    pass
            count += 1
    return count


def copy_drop_root() -> int:
    if not DROP.is_dir():
        return 0
    dest = VAULT / "Intake/OneDrive"
    dest.mkdir(parents=True, exist_ok=True)
    count = 0
    try:
        entries = sorted(DROP.iterdir())
    except Exception:
        return 0
    for f in entries:
        if f.is_file() and f.suffix in DROP_ROOT_EXTS and ".sync-conflict-" not in f.name:
            if safe_copy(f, dest / f.name):
                try:
                    f.unlink()
                except Exception:
                    pass
                count += 1
    return count


def main():
    counts = {}
    for subdir, pattern, dest, delete in ROUTES:
        key = subdir.lower()
        counts[key] = copy_subdir(subdir, pattern, dest, delete)
    counts["drop"] = copy_drop_root()
    # Remap keys to match watcher expectations
    result = {
        "cal": counts.get("calendar", 0),
        "chat": counts.get("chats", 0),
        "people": counts.get("people", 0),
        "email": counts.get("email", 0),
        "drop": counts.get("drop", 0),
    }
    print(json.dumps(result))


if __name__ == "__main__":
    main()
