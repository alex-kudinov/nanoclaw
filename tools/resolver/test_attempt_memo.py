#!/usr/bin/env python3
"""Tests for attempt_memo.py and the resolver's skip-unchanged path.

Run standalone (no pytest needed):  python3 test_attempt_memo.py

Regression guard: the resolver once re-sent ~230 unresolvable transcripts to
the bridge every run (about 1,300 Sonnet calls a day). A transcript whose AI
inputs have not changed must not reach the model again.
"""
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import attempt_memo as memo  # noqa: E402
import resolve_speakers as rs  # noqa: E402

_fails = []


def check(name, cond):
    print(f"  {'ok' if cond else 'FAIL'} {name}")
    if not cond:
        _fails.append(name)


# ── key ──
k = memo.attempt_key({"Speaker 2", "Speaker 1"}, ["Bo", "Al"], 40)
check("key: order-independent", k == memo.attempt_key({"Speaker 1", "Speaker 2"}, ["Al", "Bo"], 40))
check("key: new utterances change it", k != memo.attempt_key({"Speaker 1", "Speaker 2"}, ["Al", "Bo"], 41))
check("key: new attendee changes it", k != memo.attempt_key({"Speaker 1", "Speaker 2"}, ["Al", "Bo", "Cy"], 40))
check("key: 16 hex chars", len(k) == 16 and all(c in "0123456789abcdef" for c in k))

# ── read / write ──
note = "---\ntitle: x\nattendees: [Al]\n---\nbody line\n"
check("read: absent -> None", memo.read_key(note) is None)
check("read: no frontmatter -> None", memo.read_key("body only") is None)
written = memo.write_key(note, "abc123")
check("write: adds field", memo.read_key(written) == "abc123")
check("write: body untouched", written.endswith("---\nbody line\n"))
rewritten = memo.write_key(written, "def456")
check("write: replaces, no duplicate", memo.read_key(rewritten) == "def456" and rewritten.count(memo.FIELD) == 1)
check("write: no frontmatter -> unchanged", memo.write_key("body only", "k") == "body only")
check("read: field in body ignored", memo.read_key(f"---\na: 1\n---\n{memo.FIELD}: zzz\n") is None)

# ── resolver integration: second run skips the AI ──
TRANSCRIPT = """---
title: Weekly sync
attendees: [Speaker 1, Speaker 2]
---
[00:01-00:04] Speaker 1: Morning, let's start.
[00:05-00:06] Speaker 2: Sure.
"""
EVENT = {"subject": "Weekly sync", "attendees": ["Al Smith", "Bo Jones"], "path": None}


def run_once(path, vault, report, ai_answer):
    calls = []

    def fake_bridge(prompt, model=None):
        calls.append(model)
        return ai_answer

    with patch.object(rs, "HAS_BRIDGE", True), patch.object(rs, "match_calendar", return_value=(EVENT, "high", 0.9)), \
            patch.object(rs, "bridge_claude", side_effect=fake_bridge):
        rs.process_transcript(path, vault, [], {}, {}, {}, report, use_ai=True, dry_run=False)
    return calls


with tempfile.TemporaryDirectory() as tmp:
    vault = Path(tmp)
    EVENT["path"] = vault / "Calendar" / "sync.md"
    note_path = vault / "t.md"
    note_path.write_text(TRANSCRIPT)
    unsure = ("SPEAKER: Speaker 1 | NAME: null | CONFIDENCE: 0 | EVIDENCE: none\n"
              "SPEAKER: Speaker 2 | NAME: null | CONFIDENCE: 0 | EVIDENCE: none")
    report = {"already_resolved": 0, "processed": 0, "speakers_total": 0,
              "speakers_resolved": 0, "details": [], "skipped_unchanged": 0}
    first = run_once(note_path, vault, report, unsure)
    check("resolver: first run asks the AI", len(first) == 1)
    check("resolver: key recorded", memo.read_key(note_path.read_text()) is not None)
    second = run_once(note_path, vault, report, unsure)
    check("resolver: unchanged transcript skips the AI", second == [])
    check("resolver: skip is counted", report["skipped_unchanged"] == 1)
    note_path.write_text(note_path.read_text() + "[00:09-00:12] Speaker 1: One more thing.\n")
    third = run_once(note_path, vault, report, unsure)
    check("resolver: new utterance earns a fresh attempt", len(third) == 1)

    failed = vault / "f.md"
    failed.write_text(TRANSCRIPT)
    with patch.object(rs, "HAS_BRIDGE", True), patch.object(rs, "match_calendar", return_value=(EVENT, "high", 0.9)), \
            patch.object(rs, "bridge_claude", side_effect=RuntimeError("bridge down")):
        rs.process_transcript(failed, vault, [], {}, {}, {}, report, use_ai=True, dry_run=False)
    check("resolver: failed AI call records no key (retries next run)",
          memo.read_key(failed.read_text()) is None)

print(f"\n{'ALL PASS' if not _fails else 'FAILURES: ' + ', '.join(_fails)}")
sys.exit(1 if _fails else 0)
