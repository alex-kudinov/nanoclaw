#!/usr/bin/env python3
"""Tests for bridge._auto_meta: env tags win, else the caller is the running script.

Run standalone:  python3 tools/lib/test_bridge.py
"""
import os
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bridge  # noqa: E402

_fails = []


def check(name, cond):
    print(f"  {'ok' if cond else 'FAIL'} {name}")
    if not cond:
        _fails.append(name)


with patch.dict(os.environ, {}, clear=True), patch.object(sys, "argv", ["/x/tools/email/process_email.py"]):
    check("caller defaults to the script", bridge._auto_meta() == {"caller": "process_email.py"})
with patch.dict(os.environ, {"NANOCLAW_CALLER": "job_email", "NANOCLAW_JOB": "j"}, clear=True):
    check("env caller wins", bridge._auto_meta() == {"caller": "job_email", "job": "j"})
with patch.dict(os.environ, {}, clear=True), patch.object(sys, "argv", ["-c"]):
    check("python -c stays untagged", bridge._auto_meta() == {})

print(f"\n{'ALL PASS' if not _fails else 'FAILURES: ' + ', '.join(_fails)}")
sys.exit(1 if _fails else 0)
