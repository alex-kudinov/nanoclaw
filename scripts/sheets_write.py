#!/usr/bin/env python3
"""El Contador — Google Sheets writer for Tandem Coaching payments.

Usage:
  sheets_write.py log    --date DATE --name NAME --email EMAIL --product PRODUCT
                         --amount AMOUNT --currency CURRENCY --session-id ID --status STATUS
  sheets_write.py matrix --email EMAIL --name NAME --column COLUMN --date DATE
  sheets_write.py refund --email EMAIL --date DATE

Env vars required:
  SHEETS_ID                    — Google Sheet ID (hash from URL)
  SHEETS_SERVICE_ACCOUNT_JSON  — Path to service account JSON credential file
"""

import argparse
import os
import sys

try:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
except ImportError:
    print(
        "ERROR: Missing dependencies. Run: pip3 install google-api-python-client google-auth",
        file=sys.stderr,
    )
    sys.exit(2)

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
CREDS_FILE = os.environ.get(
    "SHEETS_SERVICE_ACCOUNT_JSON",
    "/workspace/extra/credentials/sheets-service-account.json",
)
SHEET_ID = os.environ.get("SHEETS_ID", "")

TAB_LOG = "Payment Log"
TAB_MATRIX = "Student Matrix"

LOG_HEADERS = [
    "Date",
    "Customer Name",
    "Email",
    "Product Name",
    "Amount (cents)",
    "Currency",
    "Stripe Session ID",
    "Status",
]


def get_service():
    if not os.path.exists(CREDS_FILE):
        print(f"ERROR: Credentials file not found: {CREDS_FILE}", file=sys.stderr)
        sys.exit(1)
    creds = service_account.Credentials.from_service_account_file(
        CREDS_FILE, scopes=SCOPES
    )
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def col_letter(n):
    """Convert 1-based column index to letter(s). 1→A, 27→AA."""
    result = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        result = chr(65 + r) + result
    return result


def get_all_values(service, tab):
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=SHEET_ID, range=f"'{tab}'")
        .execute()
    )
    return result.get("values", [])


def append_row(service, tab, row):
    service.spreadsheets().values().append(
        spreadsheetId=SHEET_ID,
        range=f"'{tab}'!A1",
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body={"values": [row]},
    ).execute()


def update_cell(service, tab, row_idx, col_idx, value):
    """row_idx and col_idx are 1-based."""
    cell = f"'{tab}'!{col_letter(col_idx)}{row_idx}"
    service.spreadsheets().values().update(
        spreadsheetId=SHEET_ID,
        range=cell,
        valueInputOption="USER_ENTERED",
        body={"values": [[value]]},
    ).execute()


def cmd_log(args):
    service = get_service()
    rows = get_all_values(service, TAB_LOG)

    # Check for duplicate session ID (column index 7, 1-based → index 6 in list)
    SESSION_ID_COL = 6  # 0-based
    for row in rows[1:]:  # skip header
        if len(row) > SESSION_ID_COL and row[SESSION_ID_COL] == args.session_id:
            print(f"SKIP: session {args.session_id} already logged")
            return

    new_row = [
        args.date,
        args.name,
        args.email,
        args.product,
        args.amount,
        args.currency,
        args.session_id,
        args.status,
    ]

    # Ensure header row exists
    if not rows:
        append_row(service, TAB_LOG, LOG_HEADERS)

    append_row(service, TAB_LOG, new_row)
    print(f"LOG: appended payment for {args.email} — {args.product}")


def cmd_matrix(args):
    service = get_service()
    rows = get_all_values(service, TAB_MATRIX)

    if not rows:
        print(
            "ERROR: Student Matrix tab has no header row. Set up the sheet first (see KNOWLEDGE.md).",
            file=sys.stderr,
        )
        sys.exit(1)

    headers = rows[0]

    # Find target column (1-based)
    try:
        col_idx = headers.index(args.column) + 1
    except ValueError:
        print(
            f"ERROR: Column '{args.column}' not found in matrix headers.\nAvailable: {headers}",
            file=sys.stderr,
        )
        sys.exit(1)

    # Find existing buyer row by email (column A, index 0)
    row_idx = None
    for i, row in enumerate(rows[1:], start=2):  # 1-based, skip header
        if row and row[0].strip().lower() == args.email.strip().lower():
            row_idx = i
            break

    if row_idx:
        update_cell(service, TAB_MATRIX, row_idx, col_idx, args.date)
        print(f"MATRIX: updated row {row_idx} for {args.email} — {args.column} = {args.date}")
    else:
        # Build a new row with correct length, empty except email, name, and target column
        new_row = [""] * len(headers)
        new_row[0] = args.email
        if len(headers) > 1:
            new_row[1] = args.name
        new_row[col_idx - 1] = args.date
        append_row(service, TAB_MATRIX, new_row)
        print(f"MATRIX: new buyer {args.email} — {args.column} = {args.date}")


def cmd_refund(args):
    service = get_service()
    rows = get_all_values(service, TAB_MATRIX)

    if not rows:
        print("WARNING: Student Matrix empty — refund column not marked", file=sys.stderr)
        return

    headers = rows[0]

    try:
        refund_col_idx = headers.index("Refunded") + 1  # 1-based
    except ValueError:
        print("ERROR: 'Refunded' column not found in matrix headers", file=sys.stderr)
        sys.exit(1)

    for i, row in enumerate(rows[1:], start=2):
        if row and row[0].strip().lower() == args.email.strip().lower():
            update_cell(service, TAB_MATRIX, i, refund_col_idx, args.date)
            print(f"MATRIX: refund marked for {args.email} on {args.date}")
            return

    print(f"WARNING: {args.email} not found in matrix — refund column not marked")


def main():
    if not SHEET_ID:
        print("ERROR: SHEETS_ID env var is not set", file=sys.stderr)
        sys.exit(1)

    p = argparse.ArgumentParser(description="El Contador — Sheets writer")
    sub = p.add_subparsers(dest="cmd", required=True)

    log_p = sub.add_parser("log")
    log_p.add_argument("--date", required=True)
    log_p.add_argument("--name", required=True)
    log_p.add_argument("--email", required=True)
    log_p.add_argument("--product", required=True)
    log_p.add_argument("--amount", required=True)
    log_p.add_argument("--currency", required=True)
    log_p.add_argument("--session-id", required=True, dest="session_id")
    log_p.add_argument("--status", required=True)

    matrix_p = sub.add_parser("matrix")
    matrix_p.add_argument("--email", required=True)
    matrix_p.add_argument("--name", required=True)
    matrix_p.add_argument("--column", required=True)
    matrix_p.add_argument("--date", required=True)

    refund_p = sub.add_parser("refund")
    refund_p.add_argument("--email", required=True)
    refund_p.add_argument("--date", required=True)

    args = p.parse_args()
    {"log": cmd_log, "matrix": cmd_matrix, "refund": cmd_refund}[args.cmd](args)


if __name__ == "__main__":
    main()
