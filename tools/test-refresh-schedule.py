#!/usr/bin/env python3
"""Tests for refresh-schedule.py rendering rules. Run: python3 tools/test-refresh-schedule.py"""
import importlib.util
from datetime import date
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "refresh_schedule", Path(__file__).resolve().parent / "refresh-schedule.py")
rs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rs)

TODAY = date(2026, 7, 24)

# Minimal debug payloads mirroring the live calendar-debug shapes.
ACC = {"modules": {"1": {"future_cohorts": [
    {"start": "2026-09-07T11:00:00-04:00"},   # Europe (11:00)
    {"start": "2026-10-07T19:00:00-04:00"},   # Asia   (19:00)
]}, "2": {"future_cohorts": [
    {"start": "2026-10-05T11:00:00-04:00"},   # Module 2 — must NOT appear
]}}}
PCC = {"upcoming_modules": [
    {"module": 1, "start_date": "2026-08-04T11:00:00-04:00"},
    {"module": 3, "start_date": "2026-08-04T19:00:00-04:00"},
    {"module": 2, "start_date": "2026-09-01T11:00:00-04:00"},
]}
MENTOR = {"cohorts": [
    {"start": "2026-08-03T11:00:00-04:00", "lessons": 4},
    {"start": "2026-10-06T19:00:00-04:00", "lessons": 4},
    {"start": "2026-01-01T11:00:00-05:00", "lessons": 4},  # past — must drop
]}

failures = []
def check(name, cond):
    print(("PASS " if cond else "FAIL ") + name)
    if not cond:
        failures.append(name)

# track split
check("track: 11:00 ET -> Europe", rs._track(rs._parse("2026-09-07T11:00:00-04:00")) == "US & Europe")
check("track: 19:00 ET -> Asia", rs._track(rs._parse("2026-10-07T19:00:00-04:00")) == "US & Asia-Pacific")

acc = "\n".join(rs.render_program(rs.PROGRAMS[0], ACC, TODAY))
check("acc: sequential note", "Module 1" in acc and "Sequential" in acc)
check("acc: Sep 7 entry present", "September 7, 2026" in acc)
check("acc: Module-2 date EXCLUDED", "October 5, 2026" not in acc)
check("acc: both tracks separated", "US & Europe" in acc and "US & Asia-Pacific" in acc)
check("acc: date carries its own time", "September 7, 2026 (11:00 AM ET)" in acc)

pcc = "\n".join(rs.render_program(rs.PROGRAMS[1], PCC, TODAY))
check("pcc: flexible note", "Flexible" in pcc)
check("pcc: all modules labeled", "Module 1" in pcc and "Module 2" in pcc and "Module 3" in pcc)
check("pcc: Aug 4 Europe on Europe line", "August 4, 2026 (11:00 AM ET) — Module 1" in pcc)
check("pcc: Aug 4 Asia on Asia line", "August 4, 2026 (7:00 PM ET) — Module 3" in pcc)

mentor = "\n".join(rs.render_program(rs.PROGRAMS[3], MENTOR, TODAY))
check("mentor: Aug 3 present", "August 3, 2026 (11:00 AM ET)" in mentor)
check("mentor: weekday label", "Mondays" in mentor)
check("mentor: past cohort dropped", "January 1, 2026" not in mentor)

hdr = rs.build_markdown({}, rs.datetime(2026, 7, 24), TODAY)
check("header: Marius two-track rule present", "NEVER pair a date from one track" in hdr)
check("header: do-not-edit warning", "DO NOT hand-edit" in hdr)

print()
if failures:
    print(f"{len(failures)} FAILED: {failures}")
    raise SystemExit(1)
print("ALL PASSED")
