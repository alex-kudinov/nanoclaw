#!/usr/bin/env python3
"""Copy email exports from OneDrive Drop to Intake.

Email .eml filenames are `{timestamp}-{subject}__{GraphID}.eml`. Outlook
subjects routinely push the name past the 255-byte filesystem limit, which
broke staging with `[Errno 63] File name too long` (612 files jammed in the
drop). We shorten over-long names by truncating only the subject, preserving
the leading timestamp and the trailing `__{GraphID}.eml` that
process_email.py parses for the Outlook deep-link.
"""
import ctypes
import hashlib
import logging
import os
import shutil
from pathlib import Path

HOME = Path.home()
SRC = HOME / "Library/CloudStorage/OneDrive-SoleraHoldings,Inc/Drop/Email"
DST = HOME / "Vaults/My Notes/Intake/Email"
LOG = HOME / ".local/log/copy_email.log"

# launchd-spawned processes can run with dataless-file materialization
# disabled, so ANY read of a OneDrive cloud placeholder fails with EDEADLK
# ([Errno 11] Resource deadlock avoided) — including shutil.copy2. Opt in
# process-wide (matches copy_calendar.py).
try:
    ctypes.CDLL("/usr/lib/libSystem.B.dylib", use_errno=True).setiopolicy_np(3, 0, 2)
except Exception:
    pass

# Rotate the log if it grew past 10 MB — a 5-min failure loop spamming one
# line per stuck file grows it fast.
if LOG.exists() and LOG.stat().st_size > 10_000_000:
    LOG.rename(LOG.parent / (LOG.name + ".1"))

LOG.parent.mkdir(parents=True, exist_ok=True)
logging.basicConfig(filename=str(LOG), level=logging.INFO,
                    format="%(asctime)s %(message)s", datefmt="%Y-%m-%d %H:%M:%S")

# Leave headroom under the 255-byte limit for the ".tmp" staging suffix.
MAX_NAME_BYTES = 240


def _truncate_bytes(s: str, max_bytes: int) -> str:
    """Truncate a string to at most max_bytes of UTF-8, never splitting a char."""
    return s.encode("utf-8")[:max_bytes].decode("utf-8", "ignore")


def safe_name(name: str, max_bytes: int = MAX_NAME_BYTES) -> str:
    """Shorten an over-long .eml name, keeping timestamp + __<GraphID>.eml."""
    if len(name.encode("utf-8")) <= max_bytes:
        return name
    base = name[:-4] if name.lower().endswith(".eml") else name
    head, sep, gid = base.partition("__")
    if not sep:  # no graph id — keep a unique, byte-safe stub
        h = hashlib.sha1(name.encode("utf-8")).hexdigest()[:10]
        return _truncate_bytes(head, max_bytes - 19) + f"-{h}.eml"
    tail = f"__{gid}.eml"
    budget = max_bytes - len(tail.encode("utf-8"))
    if budget < 16:  # pathologically long graph id — fall back to a hash
        h = hashlib.sha1(name.encode("utf-8")).hexdigest()[:10]
        return f"{head[:15]}__{h}.eml"
    return _truncate_bytes(head, budget) + tail


def main():
    if not SRC.is_dir():
        return
    DST.mkdir(parents=True, exist_ok=True)
    for f in sorted(SRC.glob("*.eml")):
        if not f.is_file():
            continue
        dest_name = safe_name(f.name)
        tmp = DST / (dest_name + ".tmp")
        final = DST / dest_name
        try:
            shutil.copy2(str(f), str(tmp))
            src_size = f.stat().st_size
            if tmp.stat().st_size != src_size:
                logging.warning("SIZE_MISMATCH %s", f.name)
                tmp.unlink(missing_ok=True)
                continue
            os.rename(str(tmp), str(final))
            f.unlink()
            logging.info("COPIED %s", dest_name)
        except Exception as e:
            logging.warning("FAILED %s: %s", f.name, e)
            tmp.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
