"""Attendance matrix — cumulative student x session tracking.

Stores per-program matrices in ~/Vaults/My Notes/Tandem/Attendance/<program>/matrix.json.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ATTENDANCE_ROOT = Path.home() / "Vaults/My Notes/Tandem/Attendance"


def get_matrix_path(program: str) -> Path:
    """Return the matrix.json path for a program."""
    if not program:
        raise ValueError("program must be a non-empty string")
    return ATTENDANCE_ROOT / program / "matrix.json"


def load_matrix(program: str) -> dict:
    """Load or initialize a program's attendance matrix. Creates directory if needed."""
    path = get_matrix_path(program)
    path.parent.mkdir(parents=True, exist_ok=True)

    if path.exists():
        try:
            data = json.loads(path.read_text())
            if isinstance(data, dict) and "program" in data:
                return data
        except (json.JSONDecodeError, IOError) as e:
            print(f"WARN: Could not load {path}, initializing fresh: {e}", file=sys.stderr)

    return {
        "program": program,
        "updated": datetime.now(timezone.utc).isoformat(),
        "sessions": [],
        "students": {},
    }


def update_matrix(matrix: dict, attendance_record: dict) -> None:
    """Merge a single session's attendance into the matrix. Mutates in place."""
    session_date = attendance_record.get("session_date", "")
    session_title = attendance_record.get("session_title")
    session_key = f"{session_date} {session_title}" if session_title else session_date

    if session_key not in matrix["sessions"]:
        matrix["sessions"].append(session_key)

    for student in attendance_record.get("present", []):
        email = student.get("email") or student.get("name", "unknown")
        name = student.get("name", email)
        duration = student.get("duration_minutes", 0)

        if email not in matrix["students"]:
            matrix["students"][email] = {"name": name, "attendance": {}}

        matrix["students"][email]["attendance"][session_key] = {
            "present": True,
            "duration_minutes": duration,
        }

    matrix["updated"] = datetime.now(timezone.utc).isoformat()


def save_matrix(program: str, matrix: dict) -> None:
    """Write matrix JSON atomically. Non-blocking on failure."""
    path = get_matrix_path(program)
    tmp_path = path.with_suffix(".json.tmp")
    try:
        tmp_path.write_text(json.dumps(matrix, indent=2) + "\n")
        os.replace(str(tmp_path), str(path))
    except IOError as e:
        print(f"ERROR: Failed to save matrix for {program}: {e}", file=sys.stderr)
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass
