#!/usr/bin/env python3
"""Copy people.json from OneDrive Drop to Intake (keeps source)."""
import logging
import os
from pathlib import Path

HOME = Path.home()
SRC = HOME / "Library/CloudStorage/OneDrive-SoleraHoldings,Inc/Drop/People/people.json"
DST_DIR = HOME / "Vaults/My Notes/Intake/People"
LOG = HOME / ".local/log/copy_people.log"

logging.basicConfig(filename=str(LOG), level=logging.INFO,
                    format="%(asctime)s %(message)s", datefmt="%Y-%m-%d %H:%M:%S")

def main():
    if not SRC.is_file():
        return
    DST_DIR.mkdir(parents=True, exist_ok=True)
    tmp = DST_DIR / "people.json.tmp"
    final = DST_DIR / "people.json"
    try:
        data = open(SRC, "rb").read()
        open(tmp, "wb").write(data)
        if tmp.stat().st_size != len(data):
            logging.warning("SIZE_MISMATCH people.json")
            tmp.unlink(missing_ok=True)
            return
        os.rename(str(tmp), str(final))
        # Do NOT delete source — people.json is kept in Drop
        logging.info("COPIED people.json (%d bytes)", len(data))
    except Exception as e:
        logging.warning("FAILED people.json: %s", e)
        tmp.unlink(missing_ok=True)

if __name__ == "__main__":
    main()
