#!/usr/bin/env python3
"""Track attendance for a Tandem coaching session.

Runs post-enrichment: reads meta.json, reverse-looks up Zoom meeting UUID from
manifest, pulls participants via Zoom API, matches to Heartbeat profiles,
writes per-session attendance.json and updates cumulative matrix.

Usage:
    python3 track_attendance.py <enrichment_dir> [--uuid UUID] [--program PROGRAM]
                                                 [--class-duration MINUTES] [--dry-run]
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from lib.zoom import ZoomAPIError, get_meeting, get_participants
from lib.sheets_attendance import record_attendance as sheets_record_attendance
from lib.sheets_attendance import get_roster, match_zoom_to_roster

MANIFEST_PATH = Path.home() / "Vaults/My Notes/meta/zoom-recording-manifest.json"
SKIP_NAMES = {"alex kudinov", "cherie silas", "tandem coaching, instructor", "zoom user"}

# Program defaults for class duration (minutes)
PROGRAM_DURATIONS = {"acc": 120, "pcc": 120, "actc": 90, "mentor": 60}


def _load_env_key(key_name: str, *env_files: str) -> str:
    """Load a key from env var or fallback env files."""
    val = os.environ.get(key_name)
    if val:
        return val
    for path in env_files:
        p = Path(path).expanduser()
        if p.exists():
            for line in p.read_text().splitlines():
                if line.startswith(f"{key_name}="):
                    return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def _resolve_uuid(enrichment_dir: Path) -> str | None:
    """Reverse-lookup meeting UUID from manifest by matching transcript path."""
    meta_path = enrichment_dir / "meta.json"
    if not meta_path.exists():
        print("WARN: No meta.json in enrichment dir", file=sys.stderr)
        return None

    try:
        meta = json.loads(meta_path.read_text())
    except (json.JSONDecodeError, IOError) as e:
        print(f"WARN: Could not read meta.json: {e}", file=sys.stderr)
        return None

    transcript_path = meta.get("transcript", "")
    if not transcript_path:
        print("WARN: No 'transcript' field in meta.json", file=sys.stderr)
        return None

    try:
        manifest = json.loads(MANIFEST_PATH.read_text())
    except (json.JSONDecodeError, IOError) as e:
        print(f"WARN: Could not read manifest: {e}", file=sys.stderr)
        return None

    transcript_resolved = str(Path(transcript_path).resolve())
    transcript_filename = Path(transcript_path).name
    for uuid, entry in manifest.items():
        entry_path = str(Path(entry.get("transcript_path", "")).resolve())
        if entry_path == transcript_resolved:
            return uuid

    # Fallback: match by filename (manifest stores Intake path, meta stores Transcripts path)
    for uuid, entry in manifest.items():
        if Path(entry.get("transcript_path", "")).name == transcript_filename:
            return uuid

    print(f"WARN: No manifest entry matching transcript: {transcript_path}", file=sys.stderr)
    return None


def _get_module_lesson(program: str, session_date: str) -> tuple[int, int] | None:
    """Resolve (module, lesson) from WP calendar-debug API.

    Parses debug.modules[N].all_cohorts[].events[] which are
    "YYYY-MM-DD - Title" strings. The lesson number is the chronological
    position of the session date within its cohort's event list.
    """
    import urllib.request
    import urllib.error

    api_key = _load_env_key("TANDEM_API_KEY", str(Path.home() / "dev/.env.shared"))
    if not api_key:
        print("WARN: No TANDEM_API_KEY, skipping module/lesson lookup", file=sys.stderr)
        return None

    url = f"https://tandemcoach.co/wp-json/tandem/v1/calendar-debug?program={program}"
    req = urllib.request.Request(url, headers={"X-Tandem-Key": api_key})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as e:
        print(f"WARN: Calendar API failed: {e}", file=sys.stderr)
        return None

    if not isinstance(data, dict) or not data.get("success"):
        print("WARN: Calendar API returned unexpected format", file=sys.stderr)
        return None

    modules = data.get("debug", {}).get("modules", {})
    for mod_num_str, mod_data in modules.items():
        try:
            mod_num = int(mod_num_str)
        except ValueError:
            continue
        for cohort in mod_data.get("all_cohorts", []):
            events = cohort.get("events", [])
            # Events are "YYYY-MM-DD - Title" strings, sorted chronologically
            dates_in_cohort = []
            for event_str in events:
                if isinstance(event_str, str):
                    event_date = event_str[:10]
                    dates_in_cohort.append(event_date)
            if session_date in dates_in_cohort:
                lesson_num = dates_in_cohort.index(session_date) + 1
                if 1 <= lesson_num <= 4:
                    return (mod_num, lesson_num)
                print(f"WARN: Lesson {lesson_num} out of range for M{mod_num}", file=sys.stderr)
                return (mod_num, min(lesson_num, 4))

    print(f"WARN: Date {session_date} not found in calendar for {program}", file=sys.stderr)
    return None


def _parse_iso(s: str | None) -> datetime | None:
    """Parse ISO-8601 datetime string, tolerant of formats."""
    if not s:
        return None
    try:
        # Handle Zoom's format: 2026-04-06T15:00:00Z
        s = s.replace("Z", "+00:00")
        return datetime.fromisoformat(s)
    except (ValueError, TypeError):
        return None


def main():
    parser = argparse.ArgumentParser(description="Track session attendance")
    parser.add_argument("enrichment_dir", type=Path, help="Enrichment directory")
    parser.add_argument("--uuid", help="Zoom meeting UUID (skips manifest lookup)")
    parser.add_argument("--program", help="Program code (acc, pcc, actc, mentor)")
    parser.add_argument("--class-duration", type=int, help="Class duration in minutes (default: program-based)")
    parser.add_argument("--dry-run", action="store_true", help="Print report without writing files")
    args = parser.parse_args()

    enrichment_dir = args.enrichment_dir.resolve()
    warnings = []

    # Step 1: UUID resolution
    uuid = args.uuid or _resolve_uuid(enrichment_dir)
    if not uuid:
        result = {"ok": False, "attendance_file": "", "present": 0, "unmatched": 0, "meeting_uuid": "", "program": args.program or ""}
        print(json.dumps(result))
        sys.exit(2)

    # Step 2: Meeting data — get start_time
    meeting_start = None
    meeting_topic = ""

    # Check manifest for start_time first
    try:
        manifest = json.loads(MANIFEST_PATH.read_text())
        entry = manifest.get(uuid, {})
        manifest_start = entry.get("start_time")
        if manifest_start:
            meeting_start = _parse_iso(manifest_start)
            meeting_topic = entry.get("topic", "")
    except (json.JSONDecodeError, IOError):
        pass

    try:
        if not meeting_start:
            meeting_data = get_meeting(uuid)
            meeting_start = _parse_iso(meeting_data.get("start_time"))
            meeting_topic = meeting_data.get("topic", "")
    except ZoomAPIError as e:
        print(f"ERROR: Could not fetch meeting data: {e}", file=sys.stderr)
        if not meeting_start:
            result = {"ok": False, "attendance_file": "", "present": 0, "unmatched": 0, "meeting_uuid": uuid, "program": args.program or ""}
            print(json.dumps(result))
            sys.exit(2)

    # Step 3: Participant fetch
    try:
        raw_participants = get_participants(uuid)
    except ZoomAPIError as e:
        print(f"ERROR: Zoom API failed: {e}", file=sys.stderr)
        result = {"ok": False, "attendance_file": "", "present": 0, "unmatched": 0, "meeting_uuid": uuid, "program": args.program or ""}
        print(json.dumps(result))
        sys.exit(0)

    # Filter to in_meeting status only
    participants = []
    for p in raw_participants:
        status = p.get("status")
        if status is None:
            print("WARN: Participant missing 'status' field, keeping", file=sys.stderr)
            participants.append(p)
        elif status == "in_meeting":
            participants.append(p)

    # Step 4: Time-window filter
    class_duration = args.class_duration
    if class_duration is None:
        class_duration = PROGRAM_DURATIONS.get(args.program or "", 120)
    if class_duration < 1 or class_duration > 480:
        class_duration = 120

    if meeting_start:
        # Make meeting_start timezone-aware if naive
        if meeting_start.tzinfo is None:
            meeting_start = meeting_start.replace(tzinfo=timezone.utc)
        window_end = meeting_start + timedelta(minutes=class_duration)
        filtered = []
        unmatched_no_time = []
        for p in participants:
            join = _parse_iso(p.get("join_time"))
            if join is None:
                unmatched_no_time.append(p)
                continue
            if join.tzinfo is None:
                join = join.replace(tzinfo=timezone.utc)
            if join <= window_end:
                filtered.append(p)
        if unmatched_no_time:
            print(f"WARN: {len(unmatched_no_time)} participants without parseable join_time", file=sys.stderr)
        participants = filtered
    else:
        print("WARN: No meeting start_time — skipping time-window filter", file=sys.stderr)

    # Step 5: Duration conversion (Zoom returns seconds → minutes)
    for p in participants:
        raw_dur = p.get("duration") or 0
        p["duration_minutes"] = int(raw_dur) // 60

    # Step 6: Deduplication by normalized name
    groups = {}
    for p in participants:
        raw_name = p.get("name") or "Unknown"
        clean = re.sub(r'\s*\([^)]*\)', '', raw_name).strip()
        key = clean.lower()
        if key not in groups:
            groups[key] = {"name": clean, "duration_minutes": 0, "join_time": None, "leave_time": None, "entries": []}
        groups[key]["entries"].append(p)
        groups[key]["duration_minutes"] += p["duration_minutes"]
        join = _parse_iso(p.get("join_time"))
        leave = _parse_iso(p.get("leave_time"))
        if join and (groups[key]["join_time"] is None or join < _parse_iso(groups[key]["join_time"])):
            groups[key]["join_time"] = p.get("join_time")
        if leave and (groups[key]["leave_time"] is None or leave > _parse_iso(groups[key]["leave_time"])):
            groups[key]["leave_time"] = p.get("leave_time")

    deduped_names = [g["name"] for g in groups.values()]
    deduped_map = {g["name"].lower(): g for g in groups.values()}

    # Step 7: Roster crosscheck — match Zoom names against program roster
    present = []
    unmatched = []

    if args.program:
        roster = get_roster(args.program)
        if roster:
            # Filter out skip names before matching
            matchable_names = [
                g["name"] for key, g in deduped_map.items() if key not in SKIP_NAMES
            ]
            matched, unmatched_names = match_zoom_to_roster(matchable_names, roster)

            for m in matched:
                g = deduped_map.get(m["name"].lower(), {})
                present.append({
                    "name": m["name"],
                    "email": m["email"],
                    "duration_minutes": g.get("duration_minutes", 0),
                    "join_time": g.get("join_time"),
                    "leave_time": g.get("leave_time"),
                })

            for name in unmatched_names:
                g = deduped_map.get(name.lower(), {})
                unmatched.append({"name": name, "duration_minutes": g.get("duration_minutes", 0)})

            if unmatched_names:
                print(f"INFO: {len(unmatched_names)} not in roster: {', '.join(unmatched_names)}", file=sys.stderr)
        else:
            print("WARN: Could not load roster — recording all non-skip participants", file=sys.stderr)
            warnings.append("roster_unavailable")
            for key, g in deduped_map.items():
                if key not in SKIP_NAMES:
                    present.append({
                        "name": g["name"],
                        "email": None,
                        "duration_minutes": g.get("duration_minutes", 0),
                        "join_time": g.get("join_time"),
                        "leave_time": g.get("leave_time"),
                    })
    else:
        # No program specified — include all non-skip participants without roster check
        for key, g in deduped_map.items():
            if key not in SKIP_NAMES:
                present.append({
                    "name": g["name"],
                    "email": None,
                    "duration_minutes": g.get("duration_minutes", 0),
                    "join_time": g.get("join_time"),
                    "leave_time": g.get("leave_time"),
                })

    # Step 8: Module/lesson resolution
    session_date = meeting_start.strftime("%Y-%m-%d") if meeting_start else ""
    module_lesson = None
    session_title = None
    if args.program and session_date:
        module_lesson = _get_module_lesson(args.program, session_date)
        if module_lesson:
            session_title = f"M{module_lesson[0]}L{module_lesson[1]}"

    # Build class window
    class_window = None
    if meeting_start:
        class_window = {
            "start": meeting_start.isoformat(),
            "end": (meeting_start + timedelta(minutes=class_duration)).isoformat(),
        }

    # Build attendance record
    attendance = {
        "meeting_uuid": uuid,
        "program": args.program,
        "session_date": session_date,
        "session_title": session_title,
        "class_window": class_window,
        "present": present,
        "unmatched": unmatched,
        "stats": {
            "total_present": len(present),
            "total_unmatched": len(unmatched),
            "avg_duration_minutes": int(sum(p["duration_minutes"] for p in present) / len(present)) if present else 0,
        },
    }

    # Step 9: Write attendance.json
    attendance_file = ""
    if not args.dry_run:
        out_path = enrichment_dir / "attendance.json"
        tmp_path = enrichment_dir / "attendance.json.tmp"
        try:
            tmp_path.write_text(json.dumps(attendance, indent=2) + "\n")
            os.replace(str(tmp_path), str(out_path))
            attendance_file = str(out_path)
        except IOError as e:
            print(f"ERROR: Failed to write attendance.json: {e}", file=sys.stderr)

    # Step 10: Google Sheets attendance update
    sheets_result = None
    if args.program and module_lesson and present:
        mod, les = module_lesson
        sheets_students = [
            {"name": s["name"], "email": s.get("email") or ""}
            for s in present
        ]
        try:
            sheets_result = sheets_record_attendance(
                program=args.program,
                module=mod,
                lesson=les,
                students=sheets_students,
                session_date=session_date,
                dry_run=args.dry_run,
            )
            if sheets_result.get("ok"):
                print(
                    f"SHEETS: {sheets_result.get('students_written', 0)} written, "
                    f"{sheets_result.get('students_added', 0)} new to {sheets_result.get('column', '')}",
                    file=sys.stderr,
                )
            else:
                print(f"WARN: Sheets write failed: {sheets_result.get('error', 'unknown')}", file=sys.stderr)
                warnings.append("sheets_failed")
        except Exception as e:
            print(f"ERROR: Sheets attendance update failed: {e}", file=sys.stderr)
            warnings.append("sheets_error")
    elif args.program and not module_lesson and present:
        print(f"WARN: No module/lesson resolved — skipping Sheets write", file=sys.stderr)
        warnings.append("no_module_lesson")

    # Step 11: Stdout report
    result = {
        "ok": True,
        "attendance_file": attendance_file,
        "present": len(present),
        "unmatched": len(unmatched),
        "meeting_uuid": uuid,
        "program": args.program or "",
    }
    if module_lesson:
        result["module"] = module_lesson[0]
        result["lesson"] = module_lesson[1]
    if sheets_result:
        result["sheets"] = sheets_result
    if warnings:
        result["warnings"] = warnings
    print(json.dumps(result))


if __name__ == "__main__":
    main()
