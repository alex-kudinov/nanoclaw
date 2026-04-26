"""Google Sheets attendance writer for the Student Roster spreadsheet.

Creates/updates an "Attendance" tab with dual-layer header:
  Row 1: Student Name | Student Email | ACC (merged 16 cols) | PCC (merged 16 cols)
  Row 2: (blank)      | (blank)       | M1L1 | M1L2 | ... | M4L4 | M1L1 | ... | M4L4

Each program has 4 modules × 4 lessons = 16 columns.
Cells contain the attendance date (YYYY-MM-DD).
"""

import os
import sys
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

# Programs in column order (left to right)
PROGRAMS = ["ACC", "PCC/ACTC"]

# Program code aliases → canonical column name
_PROGRAM_ALIASES = {
    "acc": "ACC",
    "pcc": "PCC/ACTC",
    "actc": "PCC/ACTC",
    "pcc/actc": "PCC/ACTC",
}
MODULES = 4
LESSONS = 4
COLS_PER_PROGRAM = MODULES * LESSONS  # 16

TAB_NAME = "Attendance"

# Column labels: M1L1, M1L2, ..., M4L4
LESSON_HEADERS = [
    f"M{m}L{l}" for m in range(1, MODULES + 1) for l in range(1, LESSONS + 1)
]


def _load_env_key(key: str, *paths: str) -> str:
    val = os.environ.get(key)
    if val:
        return val
    for p in paths:
        fp = Path(p).expanduser()
        if fp.exists():
            for line in fp.read_text().splitlines():
                if line.startswith(f"{key}="):
                    return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def _sa_path() -> str:
    explicit = os.environ.get("SHEETS_SA_JSON", "")
    if explicit and Path(explicit).exists():
        return explicit
    # Host-side default
    host = Path(__file__).resolve().parent.parent.parent / "data/service-accounts/sheets-service-account.json"
    if host.exists():
        return str(host)
    # Container default
    container = Path("/workspace/extra/credentials/sheets-service-account.json")
    if container.exists():
        return str(container)
    return ""


def _get_service():
    sa = _sa_path()
    if not sa:
        raise FileNotFoundError("No service account JSON found")
    creds = service_account.Credentials.from_service_account_file(sa, scopes=SCOPES)
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def _sheet_id() -> str:
    return _load_env_key(
        "SHEETS_ROSTER_ID",
        "/tmp/.nanoclaw-env",
        str(Path.home() / "dev/.env.shared"),
        str(Path(__file__).resolve().parent.parent.parent / ".env"),
    )


def _read_roster_tab(service, spreadsheet_id: str, tab: str) -> list[dict]:
    """Read a single roster tab. Returns list of {"email": str, "name": str}."""
    try:
        result = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=f"'{tab}'!A:B",
        ).execute()
    except Exception as e:
        print(f"WARN: Could not read {tab}: {e}", file=sys.stderr)
        return []

    rows = result.get("values", [])
    roster = []
    for i, row in enumerate(rows):
        if i == 0:
            continue
        email = row[0].strip() if row else ""
        name = row[1].strip() if len(row) > 1 else ""
        if email:
            roster.append({"email": email.lower(), "name": name})
    return roster


def get_roster(program: str) -> list[dict]:
    """Read enrolled students from the program's roster tab(s).

    PCC and ACTC are the same program — merges both rosters, deduped by email.
    Returns list of {"email": str, "name": str}.
    """
    spreadsheet_id = _sheet_id()
    if not spreadsheet_id:
        return []

    prog = program.lower()
    service = _get_service()

    # PCC/ACTC share attendance — merge both rosters
    if prog in ("pcc", "actc"):
        tabs = ["PCC Roster", "ACTC Roster"]
    else:
        tabs = [f"{program.upper()} Roster"]

    seen = set()
    roster = []
    for tab in tabs:
        for entry in _read_roster_tab(service, spreadsheet_id, tab):
            if entry["email"] not in seen:
                seen.add(entry["email"])
                roster.append(entry)

    return roster


def match_zoom_to_roster(
    zoom_names: list[str], roster: list[dict]
) -> tuple[list[dict], list[str]]:
    """Match Zoom display names to roster entries. Mechanical crosscheck.

    Matching rules (in priority order):
    0. AKA lookup: check the Name Map tab for known aliases
    1. Exact name match against roster (case-insensitive)
    2. Subset match: all Zoom name words appear in the roster name
    3. Last name + first initial match

    After matching, verify the resolved email exists in the program roster.
    Single-word names and single-initial parts skip fuzzy rules (2-3).

    Returns:
        (matched, unmatched) where matched = [{"name": zoom_name, "email": roster_email}]
    """
    # Load AKA map (returns {} if tab doesn't exist)
    aka_map = get_name_map()

    # Build enrolled email set for verification
    enrolled_emails = {e["email"] for e in roster}

    # Build roster lookup structures
    name_exact = {}  # lower name → roster entry
    name_words = []  # (set of lower words, roster_entry)
    name_parts = []  # (last_lower, first_initial, roster_entry)
    for entry in roster:
        rname = entry["name"]
        name_exact[rname.lower()] = entry
        words = set(rname.lower().split())
        name_words.append((words, entry))
        parts = rname.split()
        if len(parts) >= 2:
            last = parts[-1].lower()
            first_initial = parts[0][0].lower() if parts[0] else ""
            name_parts.append((last, first_initial, entry))

    matched = []
    unmatched = []
    used_emails = set()

    for zname in zoom_names:
        zname_lower = zname.strip().lower()
        zparts = zname.split()

        # Rule 0: AKA lookup
        if zname_lower in aka_map:
            entry = aka_map[zname_lower]
            if entry["email"] in enrolled_emails and entry["email"] not in used_emails:
                matched.append({"name": zname, "email": entry["email"]})
                used_emails.add(entry["email"])
                continue

        # Rule 1: exact match against roster
        if zname_lower in name_exact and name_exact[zname_lower]["email"] not in used_emails:
            entry = name_exact[zname_lower]
            matched.append({"name": zname, "email": entry["email"]})
            used_emails.add(entry["email"])
            continue

        # Skip fuzzy rules for single-word names or names with very short parts
        min_part_len = min(len(p) for p in zparts) if zparts else 0
        if len(zparts) < 2 or min_part_len < 2:
            unmatched.append(zname)
            continue

        # Rule 2: subset match — all Zoom words appear in roster name
        z_words = set(zname_lower.split())
        found = False
        for r_words, entry in name_words:
            if entry["email"] in used_emails:
                continue
            if z_words.issubset(r_words):
                matched.append({"name": zname, "email": entry["email"]})
                used_emails.add(entry["email"])
                found = True
                break
        if found:
            continue

        # Rule 3: last name + first initial
        z_last = zparts[-1].lower()
        z_first_initial = zparts[0][0].lower() if zparts[0] else ""
        for r_last, r_fi, entry in name_parts:
            if entry["email"] in used_emails:
                continue
            if z_last == r_last and z_first_initial == r_fi:
                matched.append({"name": zname, "email": entry["email"]})
                used_emails.add(entry["email"])
                found = True
                break
        if found:
            continue

        unmatched.append(zname)

    return matched, unmatched


NAME_MAP_TAB = "Name Map"


def get_name_map() -> dict[str, dict]:
    """Read the Name Map tab. Returns {aka_lower: {"email": str, "name": str}}.

    Tab structure: Col A = Email, Col B = Canonical Name, Col C+ = AKA variants.
    Each AKA maps to the same email/name.
    """
    spreadsheet_id = _sheet_id()
    if not spreadsheet_id:
        return {}

    service = _get_service()
    try:
        result = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=f"'{NAME_MAP_TAB}'",
        ).execute()
    except Exception:
        return {}

    rows = result.get("values", [])
    aka_map = {}
    for i, row in enumerate(rows):
        if i == 0:
            continue
        if len(row) < 2:
            continue
        email = row[0].strip().lower()
        canonical = row[1].strip()
        if not email:
            continue
        entry = {"email": email, "name": canonical}
        # Canonical name is also a valid match
        aka_map[canonical.lower()] = entry
        # All AKA columns (C onward)
        for aka in row[2:]:
            aka_clean = aka.strip()
            if aka_clean:
                aka_map[aka_clean.lower()] = entry
    return aka_map


def ensure_name_map_tab() -> None:
    """Create the Name Map tab if it doesn't exist."""
    spreadsheet_id = _sheet_id()
    if not spreadsheet_id:
        return

    service = _get_service()
    meta = service.spreadsheets().get(
        spreadsheetId=spreadsheet_id, fields="sheets.properties"
    ).execute()
    for s in meta.get("sheets", []):
        if s["properties"]["title"] == NAME_MAP_TAB:
            return

    service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={"requests": [{"addSheet": {"properties": {"title": NAME_MAP_TAB}}}]},
    ).execute()

    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=f"'{NAME_MAP_TAB}'!A1:F1",
        valueInputOption="RAW",
        body={"values": [["Email", "Name", "AKA 1", "AKA 2", "AKA 3", "AKA 4"]]},
    ).execute()


def col_letter(n: int) -> str:
    """Convert 1-based column index to letter(s). 1→A, 27→AA."""
    result = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        result = chr(65 + r) + result
    return result


def _find_tab(service, spreadsheet_id: str) -> int | None:
    """Return sheetId for the Attendance tab, or None."""
    meta = service.spreadsheets().get(
        spreadsheetId=spreadsheet_id, fields="sheets.properties"
    ).execute()
    for s in meta.get("sheets", []):
        if s["properties"]["title"] == TAB_NAME:
            return s["properties"]["sheetId"]
    return None


def _create_tab(service, spreadsheet_id: str) -> int:
    """Create the Attendance tab with dual-layer header. Returns sheetId."""
    # Add sheet
    resp = service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={"requests": [{"addSheet": {"properties": {"title": TAB_NAME}}}]},
    ).execute()
    sheet_id = resp["replies"][0]["addSheet"]["properties"]["sheetId"]

    # Build header rows
    row1 = ["Student Name", "Student Email"]
    row2 = ["", ""]
    for prog in PROGRAMS:
        row1.append(prog)
        row1.extend([""] * (COLS_PER_PROGRAM - 1))
        row2.extend(LESSON_HEADERS)

    # Write headers
    total_cols = 2 + len(PROGRAMS) * COLS_PER_PROGRAM
    end_col = col_letter(total_cols)
    service.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=f"'{TAB_NAME}'!A1:{end_col}2",
        valueInputOption="RAW",
        body={"values": [row1, row2]},
    ).execute()

    # Merge program header cells + freeze rows/cols + bold headers
    requests = []
    col_offset = 2  # 0-based, after Name + Email
    for prog in PROGRAMS:
        requests.append({
            "mergeCells": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": 0,
                    "endRowIndex": 1,
                    "startColumnIndex": col_offset,
                    "endColumnIndex": col_offset + COLS_PER_PROGRAM,
                },
                "mergeType": "MERGE_ALL",
            }
        })
        # Center the merged program header
        requests.append({
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": 0,
                    "endRowIndex": 1,
                    "startColumnIndex": col_offset,
                    "endColumnIndex": col_offset + 1,
                },
                "cell": {
                    "userEnteredFormat": {
                        "horizontalAlignment": "CENTER",
                        "textFormat": {"bold": True},
                    }
                },
                "fields": "userEnteredFormat(horizontalAlignment,textFormat)",
            }
        })
        col_offset += COLS_PER_PROGRAM

    # Bold row 2 (lesson headers)
    requests.append({
        "repeatCell": {
            "range": {
                "sheetId": sheet_id,
                "startRowIndex": 1,
                "endRowIndex": 2,
                "startColumnIndex": 0,
                "endColumnIndex": total_cols,
            },
            "cell": {
                "userEnteredFormat": {"textFormat": {"bold": True}}
            },
            "fields": "userEnteredFormat.textFormat",
        }
    })

    # Freeze first 2 rows and first 2 columns
    requests.append({
        "updateSheetProperties": {
            "properties": {
                "sheetId": sheet_id,
                "gridProperties": {"frozenRowCount": 2, "frozenColumnCount": 2},
            },
            "fields": "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
        }
    })

    service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id, body={"requests": requests}
    ).execute()

    return sheet_id


def _col_index_for(program: str, module: int, lesson: int) -> int:
    """Return 1-based column index for a program/module/lesson cell.

    Columns: A=Name, B=Email, C..R=ACC(M1L1..M4L4), S..AH=PCC(M1L1..M4L4)
    """
    prog_canonical = _PROGRAM_ALIASES.get(program.lower())
    if not prog_canonical:
        raise ValueError(f"Unknown program: {program}. Expected one of {list(_PROGRAM_ALIASES.keys())}")
    prog_upper = prog_canonical
    if not (1 <= module <= MODULES):
        raise ValueError(f"Module must be 1-{MODULES}, got {module}")
    if not (1 <= lesson <= LESSONS):
        raise ValueError(f"Lesson must be 1-{LESSONS}, got {lesson}")

    prog_offset = PROGRAMS.index(prog_upper) * COLS_PER_PROGRAM
    lesson_offset = (module - 1) * LESSONS + (lesson - 1)
    return 2 + prog_offset + lesson_offset + 1  # +1 for 1-based


def record_attendance(
    program: str,
    module: int,
    lesson: int,
    students: list[dict],
    session_date: str,
    dry_run: bool = False,
) -> dict:
    """Write attendance dates to the Attendance tab.

    Args:
        program: "acc" or "pcc"
        module: 1-4
        lesson: 1-4
        students: list of {"name": str, "email": str}
        session_date: "YYYY-MM-DD"
        dry_run: if True, return plan without writing

    Returns:
        {"ok": bool, "tab": str, "column": str, "students_written": int, "students_added": int}
    """
    spreadsheet_id = _sheet_id()
    if not spreadsheet_id:
        return {"ok": False, "error": "SHEETS_ROSTER_ID not set"}

    target_col = _col_index_for(program, module, lesson)
    col_header = f"{program.upper()} M{module}L{lesson}"

    if dry_run:
        return {
            "ok": True,
            "tab": TAB_NAME,
            "column": col_header,
            "target_col_letter": col_letter(target_col),
            "students_written": len(students),
            "students_added": 0,
            "dry_run": True,
        }

    service = _get_service()

    # Ensure tab exists
    if _find_tab(service, spreadsheet_id) is None:
        _create_tab(service, spreadsheet_id)

    # Read existing student emails (col B)
    existing = service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range=f"'{TAB_NAME}'!A:B",
    ).execute()
    rows = existing.get("values", [])

    # Build email→row index map (1-based, skip 2 header rows)
    email_to_row = {}
    for i, row in enumerate(rows):
        if i < 2:
            continue  # skip headers
        if len(row) >= 2 and row[1]:
            email_to_row[row[1].strip().lower()] = i + 1  # 1-based

    written = 0
    added = 0
    target_letter = col_letter(target_col)

    for student in students:
        email = (student.get("email") or "").strip().lower()
        name = student.get("name", "")
        if not email:
            continue

        row_num = email_to_row.get(email)
        if row_num:
            # Update existing row
            service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range=f"'{TAB_NAME}'!{target_letter}{row_num}",
                valueInputOption="RAW",
                body={"values": [[session_date]]},
            ).execute()
            written += 1
        else:
            # Append new student row
            total_cols = 2 + len(PROGRAMS) * COLS_PER_PROGRAM
            new_row = [""] * total_cols
            new_row[0] = name
            new_row[1] = email if email else name  # fallback to name if no email
            new_row[target_col - 1] = session_date
            service.spreadsheets().values().append(
                spreadsheetId=spreadsheet_id,
                range=f"'{TAB_NAME}'!A1",
                valueInputOption="RAW",
                insertDataOption="INSERT_ROWS",
                body={"values": [new_row]},
            ).execute()
            # Track new row for subsequent writes in same batch
            next_row = len(rows) + added + 1
            email_to_row[email] = next_row
            written += 1
            added += 1

    return {
        "ok": True,
        "tab": TAB_NAME,
        "column": col_header,
        "students_written": written,
        "students_added": added,
    }
