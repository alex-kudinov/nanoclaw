#!/usr/bin/env python3
"""generate_briefings.py — Generate morning meeting briefings via Print Bridge.

Reads today's calendar events, gathers context from vault, calls Claude
to generate posture-aware briefings, writes to Archivista/Briefings/.

Usage: python generate_briefings.py [YYYY-MM-DD]
"""

import json
import os
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path

# Add tools/ to path for shared libraries
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.bridge import claude as _bridge_claude  # noqa: E402
from lib.parsing import parse_frontmatter  # noqa: E402

VAULT_ROOT = Path.home() / "Vaults" / "My Notes"
BRIEFINGS_DIR = VAULT_ROOT / "Archivista" / "Briefings"
CALENDAR_DIR = VAULT_ROOT / "Solera" / "Calendar"
MEETINGS_DIR = VAULT_ROOT / "Solera" / "Meetings"
AGENDAS_DIR = VAULT_ROOT / "Solera" / "Agendas"
PEOPLE_DIR = VAULT_ROOT / "Solera" / "People"


def bridge_call(
    prompt: str,
    model: str = "sonnet",
    system: str = "",
    max_tokens: int = 1024,
) -> str:
    return _bridge_claude(
        prompt,
        model=model,
        system_prompt=system or None,
        timeout=180,
        meta={"action": "generate-briefing"},
    )


# Known workstream vocabulary — keyword patterns that map to tags.
# Conservative: only match when the connection is unambiguous.
# Each entry: tag → list of keyword phrases (matched case-insensitive against subject + body)
WORKSTREAM_KEYWORDS: dict[str, list[str]] = {
    "billing-platform": ["billing platform", "billing migration", "bp migration", "bp blocker", "bp release", "billing review", "billing consolidation"],
    "crm": ["crm", "salesforce", "customer relationship"],
    "erp": ["erp", "d365", "dynamics 365", "dynamics365", "sow/msa", "go-live"],
    "ecomm": ["ecomm", "e-comm", "ecommerce", "e-commerce", "goldstar", "qapter"],
    "peri": ["peri ", "peri-", "perihelion"],
    "ai": ["ai ", "artificial intelligence", "machine learning", "ml model", "copilot"],
    "solid": ["solid "],
    "peppol": ["peppol", "e-invoic", "ksef"],
    "winback": ["winback", "win-back", "win back", "suspension", "churn"],
    "strata": ["strata"],
    "stargate": ["stargate"],
    "ap-automation": ["ap automation", "accounts payable"],
    "frame": ["frame "],
    "management": [],  # too generic for keyword matching
}


def infer_workstreams(subject: str, body: str) -> list[str]:
    """Infer workstream tags from subject + body text using known vocabulary.

    Conservative: only matches explicit keyword phrases, not loose associations.
    """
    text = f"{subject}\n{body}".lower()
    matched = []
    for tag, keywords in WORKSTREAM_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in text:
                matched.append(tag)
                break
    return matched


def extract_event_body(event: dict) -> str:
    """Extract the human-written body from a calendar event note.

    Strips Teams/Zoom boilerplate (everything after the divider line).
    """
    raw = event.get("_body", "")
    # Remove frontmatter
    if raw.startswith("---"):
        end = raw.find("\n---", 3)
        if end >= 0:
            raw = raw[end + 4:]

    # Strip Teams/Zoom boilerplate (starts with _____ divider)
    for marker in ["____________", "Microsoft Teams meeting", "Zoom Meeting", "Join Zoom"]:
        idx = raw.find(marker)
        if idx > 0:
            raw = raw[:idx]

    # Strip ## Attendees, ## Briefing, ## Related sections (auto-generated)
    for section in ["## Attendees", "## Briefing", "## Related"]:
        idx = raw.find(section)
        if idx > 0:
            raw = raw[:idx]

    return raw.strip()


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


def _load_recent_meetings(days: int = 14) -> list[tuple[set[str], str]]:
    """Load all recent meeting summaries once. Returns (workstreams, summary)."""
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    results = []
    for md in sorted(MEETINGS_DIR.rglob("*.md"), reverse=True):
        if ".sync-conflict-" in md.name:
            continue
        fm = parse_frontmatter(md)
        if not fm or fm.get("type") != "meeting-summary":
            continue
        if str(fm.get("date", "")) < cutoff:
            continue
        note_ws = set(fm.get("workstreams", []) or [])
        if not note_ws:
            continue
        text = md.read_text()
        sections = []
        for header in ["## Decisions", "## Action Items", "## Risks", "## Next Steps"]:
            idx = text.find(header)
            if idx >= 0:
                end = text.find("\n## ", idx + len(header))
                section = text[idx:end] if end > 0 else text[idx:idx + 500]
                sections.append(section.strip())
        if sections:
            results.append((note_ws, f"### {md.stem}\n" + "\n\n".join(sections)))
    return results


def _load_agendas() -> list[tuple[set[str], str]]:
    """Load all active agendas once. Returns (workstreams, summary)."""
    results = []
    for md in AGENDAS_DIR.glob("*.md"):
        fm = parse_frontmatter(md)
        if not fm or fm.get("type") != "agenda":
            continue
        if fm.get("status") != "active":
            continue
        agenda_ws = set(fm.get("workstreams", []) or [])
        if not agenda_ws:
            continue
        text = md.read_text()
        body_start = text.find("\n---", 3)
        if body_start > 0:
            body = text[body_start + 4:body_start + 804].strip()
            results.append((agenda_ws, f"### {fm.get('name', md.stem)}\n{body}"))
    return results


# Module-level caches — populated once per run in main()
_meetings_cache: list[tuple[set[str], str]] = []
_agendas_cache: list[tuple[set[str], str]] = []
_context_cache: dict[frozenset[str], tuple[list[str], list[str]]] = {}


def find_recent_meetings(workstreams: list[str]) -> list[str]:
    """Find recent meeting summaries matching workstreams (cached)."""
    ws_set = set(workstreams)
    return [summary for note_ws, summary in _meetings_cache
            if note_ws & ws_set][:10]


def find_agendas(workstreams: list[str]) -> list[str]:
    """Find active agendas matching workstreams (cached)."""
    ws_set = set(workstreams)
    return [summary for note_ws, summary in _agendas_cache
            if note_ws & ws_set]


def get_context(workstreams: list[str]) -> tuple[list[str], list[str]]:
    """Return (meetings, agendas) for a workstream set, with dedup cache."""
    key = frozenset(workstreams)
    if key not in _context_cache:
        _context_cache[key] = (
            find_recent_meetings(workstreams),
            find_agendas(workstreams),
        )
    return _context_cache[key]


def calendar_event_wikilink(event: dict) -> str:
    """Build an Obsidian wikilink to the calendar event note.

    Calendar notes are named: YYYY-MM-DD HHMM - Subject.md
    """
    path = event.get("_path")
    if path:
        return f"[[{Path(path).stem}]]"
    # Fallback: reconstruct from frontmatter
    start_time = event.get("start-time", "")
    subject = event.get("subject", "Unknown")
    if start_time:
        try:
            from datetime import datetime as _dt
            dt = _dt.fromisoformat(start_time)
            time_str = dt.strftime("%H%M")
            date_str = dt.strftime("%Y-%m-%d")
            safe = re.sub(r"[/:*?\"<>|]", "", subject).strip()
            return f"[[{date_str} {time_str} - {safe}]]"
        except (ValueError, TypeError):
            pass
    return ""


_file_lock = threading.Lock()


def add_briefing_backlink(event: dict, briefing_wikilink: str) -> None:
    """Add a backlink from the calendar event note to the briefing.

    Appends a ## Briefing section or updates an existing one.
    Thread-safe: serialized via _file_lock.
    """
    path = event.get("_path")
    if not path or not Path(path).exists():
        return
    with _file_lock:
        text = Path(path).read_text(encoding="utf-8")
        link_line = f"- {briefing_wikilink}"

        if "## Briefing" in text:
            if briefing_wikilink in text:
                return
            idx = text.find("## Briefing")
            end_of_line = text.find("\n", idx)
            if end_of_line < 0:
                text += f"\n{link_line}\n"
            else:
                next_section = text.find("\n## ", end_of_line + 1)
                if next_section < 0:
                    text = text.rstrip() + f"\n{link_line}\n"
                else:
                    text = text[:next_section] + f"{link_line}\n" + text[next_section:]
        else:
            if "## Related" in text:
                idx = text.find("## Related")
                text = text[:idx] + f"## Briefing\n{link_line}\n\n" + text[idx:]
            else:
                text = text.rstrip() + f"\n\n## Briefing\n{link_line}\n"

        Path(path).write_text(text, encoding="utf-8")


def pick_model(event: dict) -> str:
    """Sonnet for high-stakes meetings, Haiku for everything else."""
    attendees = [a.lower() for a in (event.get("attendees", []) or [])]
    organizer = (event.get("organizer", "") or "").lower()
    # Reporting up to Nate → Sonnet
    if any("nate" in a for a in attendees):
        return "sonnet"
    # Running a status meeting (Alex organizing, 3+ attendees) → Sonnet
    if "alex" in organizer and len(attendees) >= 3:
        return "sonnet"
    return "haiku"


def generate_briefing(event: dict, target_date: str, briefing_note_name: str = "") -> str | None:
    """Generate a single briefing for a calendar event."""
    subject = event.get("subject", "Unknown")
    start_time = event.get("start-time", "")
    attendees = event.get("attendees", []) or []
    categories = event.get("categories", []) or []
    workstreams = event.get("workstreams", []) or []
    organizer = event.get("organizer", "")
    cal_link = calendar_event_wikilink(event)
    event_body = extract_event_body(event)
    model = pick_model(event)

    # Infer workstreams from subject + body when not explicitly tagged
    if not workstreams:
        workstreams = infer_workstreams(subject, event_body)
        if workstreams:
            print(f"    Inferred workstreams: {workstreams}")

    # Gather context (cached — no redundant file scans)
    recent, agendas = get_context(workstreams)

    # Build prompt
    event_section = f"## Calendar Event\n- Subject: {subject}\n- Date: {target_date}\n- Time: {start_time}\n- Attendees: {', '.join(attendees)}\n- Categories: {', '.join(categories)}\n- Organizer: {organizer}\n- Workstreams: {', '.join(workstreams)}"
    if event_body:
        event_section += f"\n\n### Agenda / Notes from Invite\n{event_body}"

    context_parts = [event_section]
    if agendas:
        context_parts.append("## Active Agendas\n" + "\n\n".join(agendas[:3]))
    if recent:
        context_parts.append("## Recent Meeting Context\n" + "\n\n".join(recent[:6]))

    context = "\n\n---\n\n".join(context_parts)

    cal_link_instruction = ""
    if cal_link:
        cal_link_instruction = f"\n- Include a 'calendar-event' field in frontmatter linking to the calendar note: {cal_link}\n- In the body, right after the H1, add: **Calendar event:** {cal_link}"

    system = f"""You are an executive briefing generator. Generate a posture-aware meeting prep briefing.

Rules:
- Output a complete markdown note starting with YAML frontmatter (---...---)
- Frontmatter fields: type: briefing, date, meeting-subject, posture, calendar-event, agendas (list), workstreams (list), attendees (list), tags (list){cal_link_instruction}
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
- Include the meeting time in the H1: # {{Subject}} Prep — {{date}} {{time}}"""

    prompt = f"Generate a meeting briefing for the following event and context:\n\n{context}"

    try:
        result = bridge_call(prompt, model=model, system=system)
        # Strip markdown code fences if Claude wrapped the output
        if result and result.startswith("```"):
            lines = result.split("\n")
            if lines[-1].strip() == "```":
                lines = lines[1:-1]
            elif lines[0].startswith("```"):
                lines = lines[1:]
            result = "\n".join(lines)
        return result
    except Exception as e:
        print(f"  Bridge error for {subject}: {e}", file=sys.stderr)
        return None


def _event_file_info(event: dict, day_dir: Path) -> tuple[str, str, str, Path]:
    """Derive filename, note_name, time_prefix, filepath for an event."""
    subject = event.get("subject", "Unknown")
    safe_name = re.sub(r"[/:*?\"<>|]", "", subject).strip()
    start_time = event.get("start-time", "")
    time_prefix = ""
    if start_time and "T" in start_time:
        time_part = start_time.split("T")[1][:5].replace(":", "")
        time_prefix = f"{time_part} "
    filename = f"{time_prefix}{safe_name} Prep.md"
    note_name = f"{time_prefix}{safe_name} Prep"
    return filename, note_name, time_prefix, day_dir / filename


def _generate_one(event: dict, target: str, day_dir: Path) -> dict | None:
    """Generate a single briefing (runs in worker thread). Returns metadata."""
    subject = event.get("subject", "Unknown")
    filename, note_name, _, filepath = _event_file_info(event, day_dir)

    if filepath.exists():
        print(f"  SKIP (exists): {filename}")
        return None

    model = pick_model(event)
    print(f"  Generating [{model}]: {subject}...")
    content = generate_briefing(event, target, briefing_note_name=note_name)
    if not content:
        print(f"  FAILED: {subject}")
        return None

    filepath.write_text(content, encoding="utf-8")
    print(f"  WROTE: {target}/{filename}")

    briefing_link = f"[[{note_name}]]"
    add_briefing_backlink(event, briefing_link)
    print(f"  LINKED: calendar event ↔ briefing")
    return {"filename": note_name, "content": content, "event": event}


MAX_WORKERS = 2  # Bridge allows 3 concurrent; leave 1 slot for other callers


def main():
    global _meetings_cache, _agendas_cache

    target = sys.argv[1] if len(sys.argv) > 1 else date.today().isoformat()
    print(f"Generating briefings for {target}")

    events = find_calendar_events(target)
    if not events:
        print(f"No calendar events for {target}")
        return 0

    print(f"Found {len(events)} calendar events")

    # Populate caches once — all subsequent find_recent_meetings/find_agendas
    # calls are O(n) filters over in-memory lists, not disk scans.
    print("  Loading meeting/agenda context...")
    _meetings_cache = _load_recent_meetings()
    _agendas_cache = _load_agendas()
    print(f"  Cached {len(_meetings_cache)} recent meetings, {len(_agendas_cache)} agendas")

    day_dir = BRIEFINGS_DIR / target
    day_dir.mkdir(parents=True, exist_ok=True)

    # Generate individual briefings in parallel
    generated = 0
    briefing_data: list[dict] = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {
            pool.submit(_generate_one, event, target, day_dir): event
            for event in events
        }
        for future in as_completed(futures):
            result = future.result()
            if result:
                generated += 1
                briefing_data.append(result)

    print(f"\nGenerated {generated} briefings for {target}")

    generate_daily_summary(day_dir, events, target)

    return 0


def generate_daily_summary(day_dir: Path, events: list[dict], target_date: str) -> None:
    """Generate a single Daily Brief file summarizing all meetings and key points."""
    summary_path = day_dir / "Daily Brief.md"
    if summary_path.exists():
        print("  SKIP (exists): Daily Brief.md")
        return

    # Read all individual briefings we just generated
    briefing_summaries = []
    for md in sorted(day_dir.glob("*.md")):
        if md.name == "Daily Brief.md":
            continue
        text = md.read_text(encoding="utf-8")
        # Extract frontmatter fields
        fm = parse_frontmatter(md) or {}
        subject = fm.get("meeting-subject", md.stem.replace(" Prep", ""))
        posture = fm.get("posture", "")
        attendees = fm.get("attendees", []) or []
        workstreams = fm.get("workstreams", []) or []

        # Extract body (after frontmatter) — first 600 chars for context
        body = ""
        if text.startswith("---"):
            end = text.find("\n---", 3)
            if end >= 0:
                body = text[end + 4:].strip()[:600]

        briefing_summaries.append({
            "subject": subject,
            "posture": posture,
            "attendees": attendees,
            "workstreams": workstreams,
            "body_preview": body,
            "filename": md.stem,
        })

    if not briefing_summaries:
        print("  No briefings to summarize")
        return

    # Also gather calendar event times for the schedule
    event_times = {}
    for ev in events:
        subj = ev.get("subject", "")
        time = ev.get("start-time", "")
        if time and "T" in time:
            time = time.split("T")[1][:5]
        event_times[subj] = time

    # Build prompt
    meetings_text = []
    for b in briefing_summaries:
        time = event_times.get(b["subject"], "??:??")
        meetings_text.append(
            f"### {time} — {b['subject']}\n"
            f"Posture: {b['posture']}\n"
            f"Attendees: {', '.join(b['attendees'])}\n"
            f"Workstreams: {', '.join(b['workstreams']) or 'none'}\n"
            f"Briefing excerpt:\n{b['body_preview']}\n"
            f"Link: [[{b['filename']}]]"
        )

    prompt = (
        f"Synthesize a daily brief for {target_date}. "
        f"There are {len(briefing_summaries)} meetings.\n\n"
        + "\n\n---\n\n".join(meetings_text)
    )

    system = f"""You are an executive daily brief generator. Create a single-page overview of the day.

Rules:
- Output markdown starting with YAML frontmatter (---...---)
- Frontmatter: type: daily-brief, date: {target_date}
- H1: Daily Brief — {target_date}
- Start with a "## Day at a Glance" section: a short paragraph (2-3 sentences) highlighting what matters most today — themes, critical meetings, decisions needed
- Then "## Schedule" — chronological list of meetings, each with:
  - Time and subject (bold)
  - Posture tag
  - 1-2 bullet points: the single most important thing to know going in, sourced from the briefing content
  - Link to the full briefing as [[wikilink]]
- Then "## Threads to Watch" — cross-cutting themes or connected issues across multiple meetings (e.g., if billing comes up in 3 meetings, flag that)
- Skip canceled meetings in the schedule but note them at the bottom if relevant
- Be terse. Each meeting gets 2-3 lines max. The full details are in the individual briefings.
- Do NOT wrap output in code fences."""

    print("  Generating: Daily Brief...")
    try:
        result = bridge_call(prompt, model="sonnet", system=system)
        if result and result.startswith("```"):
            lines = result.split("\n")
            if lines[-1].strip() == "```":
                lines = lines[1:-1]
            elif lines[0].startswith("```"):
                lines = lines[1:]
            result = "\n".join(lines)
        summary_path.write_text(result, encoding="utf-8")
        print(f"  WROTE: {target_date}/Daily Brief.md")
    except Exception as e:
        print(f"  Bridge error for Daily Brief: {e}", file=sys.stderr)


if __name__ == "__main__":
    sys.exit(main() or 0)
