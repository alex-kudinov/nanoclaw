#!/usr/bin/env python3
"""generate_briefings.py — Generate morning meeting briefings via Print Bridge.

Reads today's calendar events, gathers context from vault, calls Claude
to generate posture-aware briefings, writes to Archivista/Briefings/.

Usage: python generate_briefings.py [YYYY-MM-DD]
"""

import glob
import json
import os
import re
import sys
import urllib.request
from datetime import date, timedelta
from pathlib import Path

import yaml

VAULT_ROOT = Path.home() / "Vaults" / "My Notes"
BRIEFINGS_DIR = VAULT_ROOT / "Archivista" / "Briefings"
CALENDAR_DIR = VAULT_ROOT / "Solera" / "Calendar"
MEETINGS_DIR = VAULT_ROOT / "Solera" / "Meetings"
AGENDAS_DIR = VAULT_ROOT / "Solera" / "Agendas"
PEOPLE_DIR = VAULT_ROOT / "Solera" / "People"

BRIDGE_URL = "http://100.115.115.206:40960/v1/print"
ENV_SHARED = Path.home() / "dev" / ".env.shared"


def get_bridge_key() -> str:
    if os.environ.get("CLAUDE_BRIDGE_KEY"):
        return os.environ["CLAUDE_BRIDGE_KEY"]
    if ENV_SHARED.exists():
        for line in ENV_SHARED.read_text().splitlines():
            if line.startswith("CLAUDE_BRIDGE_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def bridge_call(prompt: str, model: str = "sonnet", system: str = "") -> str:
    key = get_bridge_key()
    if not key:
        raise RuntimeError("No CLAUDE_BRIDGE_KEY found")
    body: dict = {"prompt": prompt, "model": model}
    if system:
        body["system_prompt"] = system
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        BRIDGE_URL,
        data=data,
        headers={
            "Content-Type": "application/json",
            "X-Bridge-Key": key,
        },
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        result = json.loads(resp.read())
    if not result.get("ok"):
        raise RuntimeError(result.get("error", "Bridge call failed"))
    return result["data"]["result"]


def parse_frontmatter(path: Path) -> dict | None:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None
    if not text.startswith("---"):
        return None
    end = text.find("\n---", 3)
    if end < 0:
        return None
    try:
        return yaml.safe_load(text[4:end]) or {}
    except yaml.YAMLError:
        return None


def find_calendar_events(target_date: str) -> list[dict]:
    """Find calendar events for a given date."""
    events = []
    for md in sorted(CALENDAR_DIR.glob(f"{target_date}*.md")):
        fm = parse_frontmatter(md)
        if not fm or fm.get("type") != "calendar-event":
            continue
        fm["_path"] = md
        fm["_body"] = md.read_text()
        events.append(fm)
    return events


def find_recent_meetings(workstreams: list[str], days: int = 14) -> list[str]:
    """Find recent meeting summaries matching workstreams."""
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    results = []
    for md in sorted(MEETINGS_DIR.rglob("*.md"), reverse=True):
        if ".sync-conflict-" in md.name:
            continue
        fm = parse_frontmatter(md)
        if not fm:
            continue
        if fm.get("type") != "meeting-summary":
            continue
        if str(fm.get("date", "")) < cutoff:
            continue
        note_ws = set(fm.get("workstreams", []) or [])
        if note_ws & set(workstreams):
            # Read key sections only (Decisions, Action Items, Risks)
            text = md.read_text()
            sections = []
            for header in ["## Decisions", "## Action Items", "## Risks", "## Next Steps"]:
                idx = text.find(header)
                if idx >= 0:
                    end = text.find("\n## ", idx + len(header))
                    section = text[idx:end] if end > 0 else text[idx:idx + 500]
                    sections.append(section.strip())
            if sections:
                results.append(
                    f"### {md.stem}\n" + "\n\n".join(sections)
                )
        if len(results) >= 10:
            break
    return results


def find_agendas(workstreams: list[str]) -> list[str]:
    """Find active agendas matching workstreams."""
    results = []
    for md in AGENDAS_DIR.glob("*.md"):
        fm = parse_frontmatter(md)
        if not fm or fm.get("type") != "agenda":
            continue
        if fm.get("status") != "active":
            continue
        agenda_ws = set(fm.get("workstreams", []) or [])
        if agenda_ws & set(workstreams):
            text = md.read_text()
            # Get first 800 chars of body (after frontmatter)
            body_start = text.find("\n---", 3)
            if body_start > 0:
                body = text[body_start + 4:body_start + 804].strip()
                results.append(f"### {fm.get('name', md.stem)}\n{body}")
    return results


def generate_briefing(event: dict, target_date: str) -> str | None:
    """Generate a single briefing for a calendar event."""
    subject = event.get("subject", "Unknown")
    start_time = event.get("start-time", "")
    attendees = event.get("attendees", []) or []
    categories = event.get("categories", []) or []
    workstreams = event.get("workstreams", []) or []
    organizer = event.get("organizer", "")

    # Gather context
    recent = find_recent_meetings(workstreams)
    agendas = find_agendas(workstreams)

    # Build prompt
    context_parts = [
        f"## Calendar Event\n- Subject: {subject}\n- Date: {target_date}\n- Time: {start_time}\n- Attendees: {', '.join(attendees)}\n- Categories: {', '.join(categories)}\n- Organizer: {organizer}\n- Workstreams: {', '.join(workstreams)}",
    ]
    if agendas:
        context_parts.append("## Active Agendas\n" + "\n\n".join(agendas[:3]))
    if recent:
        context_parts.append("## Recent Meeting Context\n" + "\n\n".join(recent[:6]))

    context = "\n\n---\n\n".join(context_parts)

    system = """You are an executive briefing generator. Generate a posture-aware meeting prep briefing.

Rules:
- Output a complete markdown note starting with YAML frontmatter (---...---)
- Frontmatter fields: type: briefing, date, meeting-subject, posture, agendas (list), workstreams (list), attendees (list), tags (list)
- Determine posture from categories if present, otherwise infer:
  - "Nate" in attendees AND organizer != "Alex Kudinov" → Reporting Up
  - Organizer = "Alex Kudinov" AND 3+ attendees → Running Status
  - Exactly 2 attendees → Inquisitive Review
  - Default → Information Gathering
- Use the posture to shape content:
  - Reporting Up: Top Items, Escalations, Decisions Needed, Wins
  - Running Status: Delta Since Last Meeting, Action Items by Owner, Blockers
  - Inquisitive Review: Questions to Ask, Blind Spots, Dependencies
  - Information Gathering: Background, Questions, Agenda Connections
- Use [[wikilinks]] for meeting note references
- Be concise and actionable — bullets, not paragraphs
- Include the meeting time in the H1: # {Subject} Prep — {date} {time}"""

    prompt = f"Generate a meeting briefing for the following event and context:\n\n{context}"

    try:
        return bridge_call(prompt, model="sonnet", system=system)
    except Exception as e:
        print(f"  Bridge error for {subject}: {e}", file=sys.stderr)
        return None


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else date.today().isoformat()
    print(f"Generating briefings for {target}")

    events = find_calendar_events(target)
    if not events:
        print(f"No calendar events for {target}")
        return 0

    print(f"Found {len(events)} calendar events")
    BRIEFINGS_DIR.mkdir(parents=True, exist_ok=True)

    generated = 0
    for event in events:
        subject = event.get("subject", "Unknown")
        safe_name = re.sub(r"[/:*?\"<>|]", "", subject).strip()
        filename = f"{target} - {safe_name} Prep.md"
        filepath = BRIEFINGS_DIR / filename

        if filepath.exists():
            print(f"  SKIP (exists): {filename}")
            continue

        print(f"  Generating: {subject}...")
        content = generate_briefing(event, target)
        if content:
            filepath.write_text(content, encoding="utf-8")
            generated += 1
            print(f"  WROTE: {filename}")
        else:
            print(f"  FAILED: {subject}")

    print(f"\nGenerated {generated} briefings for {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
