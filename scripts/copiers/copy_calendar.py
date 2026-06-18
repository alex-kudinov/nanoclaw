#!/usr/bin/env python3
"""Copy calendar exports from OneDrive Drop to Intake."""
import ctypes
import logging
import os
import shutil
import sys
from pathlib import Path

HOME = Path.home()
SRC = HOME / "Library/CloudStorage/OneDrive-SoleraHoldings,Inc/Drop/Calendar"
DST = HOME / "Vaults/My Notes/Intake/Calendar"
LOG = HOME / ".local/log/copy_calendar.log"

# launchd-spawned processes can run with dataless-file materialization
# disabled, so ANY read of a OneDrive cloud placeholder fails with EDEADLK
# ([Errno 11] Resource deadlock avoided) — including shutil.copy2. Opt in
# process-wide: setiopolicy_np(IOPOL_TYPE_VFS_MATERIALIZE_DATALESS_FILES=3,
# IOPOL_SCOPE_PROCESS=0, IOPOL_MATERIALIZE_DATALESS_FILES_ON=2).
try:
    ctypes.CDLL("/usr/lib/libSystem.B.dylib", use_errno=True).setiopolicy_np(3, 0, 2)
except Exception:
    pass

# Rotate the log if it grew past 10 MB — a persistent failure loop once
# grew it to 2.5 GB and filled the disk.
if LOG.exists() and LOG.stat().st_size > 10_000_000:
    LOG.rename(LOG.parent / (LOG.name + ".1"))

LOG.parent.mkdir(parents=True, exist_ok=True)
logging.basicConfig(filename=str(LOG), level=logging.INFO,
                    format="%(asctime)s %(message)s", datefmt="%Y-%m-%d %H:%M:%S")

def main():
    if not SRC.is_dir():
        return
    DST.mkdir(parents=True, exist_ok=True)
    for f in sorted(SRC.glob("*.txt")):
        if not f.is_file():
            continue
        tmp = DST / (f.name + ".tmp")
        final = DST / f.name
        try:
            # shutil.copy2 uses macOS copyfile() syscall which properly
            # materializes OneDrive cloud-placeholder files. Raw open().read()
            # can fail with EDEADLK on placeholder files in launchd-spawned
            # processes, leaving files stuck in the drop indefinitely.
            shutil.copy2(str(f), str(tmp))
            src_size = f.stat().st_size
            if tmp.stat().st_size != src_size:
                logging.warning("SIZE_MISMATCH %s", f.name)
                tmp.unlink(missing_ok=True)
                continue
            os.rename(str(tmp), str(final))
            f.unlink()
            logging.info("COPIED %s", f.name)
        except Exception as e:
            logging.warning("FAILED %s: %s", f.name, e)
            tmp.unlink(missing_ok=True)

if __name__ == "__main__":
    main()
