#!/usr/bin/env bash
# make_test_email.sh — Generate a test email export file for process_email.py
#
# Usage:
#   ./make_test_email.sh                     # interactive prompts
#   ./make_test_email.sh --template          # print blank template to stdout
#   ./make_test_email.sh --from-eml FILE     # convert .eml file to export format
#
# Output: writes to ~/Vaults/My Notes/Intake/Email/{filename}.txt
# Then run: process_email.py (it picks up from Intake/Email automatically)
#   or:     process_email.py --input path/to/file.txt

set -euo pipefail

VAULT_ROOT="${HOME}/Vaults/My Notes"
INTAKE_DIR="${VAULT_ROOT}/Intake/Email"
mkdir -p "$INTAKE_DIR"

if [ "${1:-}" = "--template" ]; then
    cat <<'TEMPLATE'
@@EXPORT_META
type: email
message_id: <unique-id@outlook.com>
conversation_id: AAQk...
date: 2026-03-28T10:30:00Z
from: Sender Name <sender@solera.com>
to: Recipient1 <r1@solera.com>, Recipient2 <r2@solera.com>
cc: CC Person <cc@solera.com>
subject: Email Subject Line
importance: normal
has_attachments: false
web_link: https://outlook.office365.com/mail/id/...
categories: Vault
@@END_META

Paste the email body text here (plain text or HTML).
TEMPLATE
    exit 0
fi

if [ "${1:-}" = "--from-eml" ]; then
    if [ -z "${2:-}" ]; then
        echo "Usage: $0 --from-eml FILE.eml" >&2
        exit 1
    fi
    EML_FILE="$2"
    if [ ! -f "$EML_FILE" ]; then
        echo "Error: file not found: $EML_FILE" >&2
        exit 1
    fi

    # Extract headers and body from .eml using Python
    VENV="${HOME}/dev/NanoClaw/.venv/bin/python3"
    "$VENV" - "$EML_FILE" "$INTAKE_DIR" <<'PYTHON'
import email
import email.policy
import sys
from pathlib import Path
from datetime import datetime

eml_path = sys.argv[1]
intake_dir = Path(sys.argv[2])

with open(eml_path, 'rb') as f:
    msg = email.message_from_binary_file(f, policy=email.policy.default)

message_id = msg.get("Message-ID", f"<manual-{datetime.now().strftime('%Y%m%d%H%M%S')}@local>")
date_str = msg.get("Date", "")
from_str = msg.get("From", "")
to_str = msg.get("To", "")
cc_str = msg.get("Cc", "")
subject = msg.get("Subject", "No Subject")
importance = msg.get("Importance", "normal")
conversation_id = msg.get("Thread-Index", f"manual-{datetime.now().strftime('%Y%m%d%H%M%S')}")

# Parse date to ISO format
try:
    from email.utils import parsedate_to_datetime
    dt = parsedate_to_datetime(date_str)
    date_iso = dt.isoformat()
except Exception:
    date_iso = datetime.now().isoformat()

# Get body (prefer HTML, fall back to plain text)
body = ""
if msg.is_multipart():
    for part in msg.walk():
        ct = part.get_content_type()
        if ct == "text/html":
            body = part.get_content()
            break
        elif ct == "text/plain" and not body:
            body = part.get_content()
else:
    body = msg.get_content()

has_attachments = "true" if any(
    p.get_content_disposition() == 'attachment'
    for p in (msg.walk() if msg.is_multipart() else [])
) else "false"

# Build export file
export = f"""@@EXPORT_META
type: email
message_id: {message_id}
conversation_id: {conversation_id}
date: {date_iso}
from: {from_str}
to: {to_str}
cc: {cc_str}
subject: {subject}
importance: {importance}
has_attachments: {has_attachments}
web_link:
categories: Vault
@@END_META

{body}"""

safe_subject = subject[:80].replace("/", "-").replace("\\", "-").replace(" ", "-")
filename = f"{datetime.now().strftime('%Y%m%d-%H%M%S')}-{safe_subject}.txt"
out_path = intake_dir / filename
out_path.write_text(export, encoding="utf-8")
print(f"Exported: {out_path}")
print(f"Run: cd ~/dev/NanoClaw/tools/email && ../../.venv/bin/python3 process_email.py --input '{out_path}'")
PYTHON
    exit 0
fi

# Interactive mode
echo "=== Email Export Generator ==="
echo ""
read -p "Subject: " SUBJECT
read -p "From (Name <email>): " FROM
read -p "To (Name1 <e1>, Name2 <e2>): " TO
read -p "CC (optional): " CC
read -p "Date (ISO, e.g. 2026-03-28T10:30:00Z) [now]: " DATE
DATE="${DATE:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
MSG_ID="<manual-$(date +%Y%m%d%H%M%S)@local>"

SAFE_SUBJ=$(echo "$SUBJECT" | tr ' /' '--' | head -c 80)
FILENAME="$(date +%Y%m%d-%H%M%S)-${SAFE_SUBJ}.txt"
OUT_PATH="${INTAKE_DIR}/${FILENAME}"

echo ""
echo "Paste the email body below (press Ctrl-D when done):"
BODY=$(cat)

cat > "$OUT_PATH" <<EOF
@@EXPORT_META
type: email
message_id: ${MSG_ID}
conversation_id: manual-$(date +%Y%m%d%H%M%S)
date: ${DATE}
from: ${FROM}
to: ${TO}
cc: ${CC}
subject: ${SUBJECT}
importance: normal
has_attachments: false
web_link:
categories: Vault
@@END_META

${BODY}
EOF

echo ""
echo "Exported: ${OUT_PATH}"
echo "Run: cd ~/dev/NanoClaw/tools/email && ../../.venv/bin/python3 process_email.py --input '${OUT_PATH}'"
