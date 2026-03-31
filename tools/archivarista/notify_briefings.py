#!/usr/bin/env python3
"""notify_briefings.py — Post daily briefing digest to Slack gru-archivarista."""
import glob
import json
import os
import re
import sys
import urllib.request
from datetime import date

VAULT_ROOT = os.path.expanduser("~/Vaults/My Notes")
BRIEFINGS_DIR = os.path.join(VAULT_ROOT, "Archivista", "Briefings")
VAULT_NAME = "My Notes"
SLACK_CHANNEL = "C0ANG8UPTJ7"  # gru-archivarista


def get_slack_token():
    env_path = os.path.expanduser("~/dev/NanoClaw/.env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith("SLACK_BOT_TOKEN="):
                    return line.strip().split("=", 1)[1]
    return os.environ.get("SLACK_BOT_TOKEN", "")


def parse_briefing(filepath):
    """Extract key fields from a briefing note."""
    with open(filepath) as f:
        content = f.read()

    if not content.startswith("---"):
        return None

    parts = content.split("---", 2)
    if len(parts) < 3:
        return None

    # Parse YAML frontmatter (simple key: value)
    fm = {}
    for line in parts[1].strip().split("\n"):
        if ":" in line:
            key, val = line.split(":", 1)
            fm[key.strip()] = val.strip().strip('"')

    # Time from H1: # ... — YYYY-MM-DD HH:MM
    time_match = re.search(r"#.*—.*(\d{2}:\d{2})", content)
    time_str = time_match.group(1) if time_match else "??:??"

    # First substantive bullet as highlight (skip **Check:** lines)
    highlight = ""
    body = parts[2]
    for line in body.split("\n"):
        stripped = line.strip()
        if stripped.startswith("- ") and "**Check:**" not in stripped:
            # Clean wikilinks: [[display|text]] → text, [[text]] → text
            h = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", stripped[2:])
            # Strip bold markers
            h = re.sub(r"\*\*([^*]+)\*\*", r"\1", h)
            highlight = h[:80] + "..." if len(h) > 80 else h
            break

    filename = os.path.basename(filepath).replace(".md", "")
    uri_file = filename.replace(" ", "%20")
    obsidian_uri = (
        f"obsidian://open?vault={VAULT_NAME.replace(' ', '%20')}"
        f"&file=Archivista%2FBriefings%2F{uri_file}"
    )

    return {
        "subject": fm.get("meeting-subject", filename),
        "posture": fm.get("posture", "Unknown"),
        "time": time_str,
        "highlight": highlight,
        "uri": obsidian_uri,
    }


def post_slack(token, message):
    payload = json.dumps({"channel": SLACK_CHANNEL, "text": message}).encode()
    req = urllib.request.Request(
        "https://slack.com/api/chat.postMessage",
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        resp = urllib.request.urlopen(req)
        result = json.loads(resp.read())
        if not result.get("ok"):
            print(f"Slack error: {result.get('error')}", file=sys.stderr)
            return False
        return True
    except Exception as e:
        print(f"Slack post failed: {e}", file=sys.stderr)
        return False


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else date.today().isoformat()

    files = sorted(glob.glob(os.path.join(BRIEFINGS_DIR, f"{target}*.md")))
    if not files:
        print(f"No briefings for {target}")
        return 0

    briefings = [b for f in files if (b := parse_briefing(f))]
    if not briefings:
        print("No parseable briefings")
        return 0

    # Build message per meeting-prep workflow spec §4
    lines = [
        f":clipboard: *Meeting Prep — {target}*",
        "",
        f"{len(briefings)} briefing{'s' if len(briefings) != 1 else ''} ready:",
        "",
    ]
    for b in sorted(briefings, key=lambda x: x["time"]):
        lines.append(f"• *{b['time']}* — {b['subject']} ({b['posture']})")
        if b["highlight"]:
            lines.append(f"  _{b['highlight']}_")
        lines.append(f"  :paperclip: {b['uri']}")
        lines.append("")

    message = "\n".join(lines).rstrip()

    token = get_slack_token()
    if not token:
        print("No SLACK_BOT_TOKEN — printing to stdout", file=sys.stderr)
        print(message)
        return 1

    if post_slack(token, message):
        print(f"Posted {len(briefings)} briefing digest to Slack")
        return 0
    else:
        print(message)
        return 1


if __name__ == "__main__":
    sys.exit(main() or 0)
