#!/usr/bin/env python3
"""Tests for process_calendar.py — focused on empty-subject handling.

Run standalone (no pytest needed):  python3 test_process_calendar.py

Regression guard: empty-subject events must be SKIPPED (cleanly deleted from
intake), never routed to errors/. They once flooded Intake/Calendar/errors/
with 2,145 files and starved the morning meeting briefer.
"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import process_calendar as pc  # noqa: E402

VALID_META = """@@EXPORT_META
event_id: EVT-{eid}
subject: {subject}
start_time: 2026-04-27T21:00:00+00:00
end_time: 2026-04-27T22:00:00+00:00
organizer: Alex Kudinov
attendees: Alex Kudinov
location:
is_online: false
is_recurring: false
categories:
last_modified: 2026-04-20T21:07:36.0938831+00:00
@@END_META

<html></html>
"""


def _write_export(intake: Path, eid: str, subject: str) -> Path:
    path = intake / f"{eid}.txt"
    path.write_text(VALID_META.format(eid=eid, subject=subject), encoding="utf-8")
    return path


def _setup_vault() -> Path:
    root = Path(tempfile.mkdtemp(prefix="cal-test-"))
    (root / "Intake" / "Calendar").mkdir(parents=True)
    (root / "meta").mkdir(parents=True)
    return root


def _run_one(vault: Path, path: Path) -> dict:
    report = pc.new_report()
    pc.process_one(path, vault, {}, {}, {}, set(), report)
    return report


def test_empty_subject_is_skipped_not_errored():
    vault = _setup_vault()
    intake = vault / "Intake" / "Calendar"
    path = _write_export(intake, "empty1", "")  # blank subject

    report = _run_one(vault, path)

    assert report["skipped"] == 1, f"expected skipped=1, got {report['skipped']}"
    assert report["errors"] == 0, f"expected errors=0, got {report['errors']}"
    assert not path.exists(), "skipped intake file should be deleted"
    errors_dir = vault / "Intake" / "Calendar" / "errors"
    assert not errors_dir.exists() or not list(errors_dir.glob("*.txt")), \
        "empty-subject event must NOT land in errors/"
    print("PASS: empty subject -> skipped, not errored")


def test_whitespace_subject_is_skipped():
    vault = _setup_vault()
    intake = vault / "Intake" / "Calendar"
    path = _write_export(intake, "ws1", "   ")  # whitespace-only

    report = _run_one(vault, path)

    assert report["skipped"] == 1, f"expected skipped=1, got {report['skipped']}"
    assert report["errors"] == 0
    print("PASS: whitespace-only subject -> skipped")


def test_valid_subject_is_processed():
    vault = _setup_vault()
    intake = vault / "Intake" / "Calendar"
    path = _write_export(intake, "valid1", "Quarterly Planning")

    report = _run_one(vault, path)

    assert report["processed"] == 1, f"expected processed=1, got {report['processed']}"
    assert report["errors"] == 0
    notes = list((vault / "Solera" / "Calendar").glob("*.md"))
    assert notes, "valid event should produce a calendar note"
    assert "Quarterly Planning" in notes[0].name
    print("PASS: valid subject -> processed, note written")


def test_missing_required_field_still_errors():
    vault = _setup_vault()
    intake = vault / "Intake" / "Calendar"
    # No event_id line -> still a hard error (subject is no longer required)
    bad = intake / "bad1.txt"
    bad.write_text(
        "@@EXPORT_META\nsubject: X\nstart_time: 2026-04-27T21:00:00+00:00\n"
        "end_time: 2026-04-27T22:00:00+00:00\n@@END_META\n\nbody\n",
        encoding="utf-8",
    )
    report = _run_one(vault, bad)

    assert report["errors"] == 1, f"expected errors=1, got {report['errors']}"
    assert (vault / "Intake" / "Calendar" / "errors" / "bad1.txt").exists()
    print("PASS: missing event_id still errors")


if __name__ == "__main__":
    test_empty_subject_is_skipped_not_errored()
    test_whitespace_subject_is_skipped()
    test_valid_subject_is_processed()
    test_missing_required_field_still_errors()
    print("\nAll tests passed.")
