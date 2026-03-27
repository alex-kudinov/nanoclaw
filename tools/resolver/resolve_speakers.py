#!/usr/bin/env python3
"""Speaker resolver — matches transcripts to calendar events and resolves
Speaker N labels using calendar attendees.

Enrichment pass: runs against existing vault notes. Reads transcript notes
from Transcripts/, matches to calendar events in */Calendar/, resolves
speakers via AI, and updates the transcript notes in place.

Usage:
  python resolve_speakers.py [--vault-root PATH] [--dry-run] [--no-ai]
  python resolve_speakers.py --transcript PATH [--vault-root PATH]
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

try:
    import anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False

# ── Constants ────────────────────────────────────────────────────────────────

CST = ZoneInfo("America/Chicago")
TIME_TOLERANCE_MIN = 15
CALENDAR_DIRS = ["Solera/Calendar", "Tandem/Calendar", "CNPC/Calendar"]
PEOPLE_DIRS = ["Solera/People", "Tandem/People", "CNPC/People"]
TRANSCRIPTS_DIR = "Transcripts"
OVERRIDES_PATH = "meta/speaker-overrides.json"
HINTS_PATH = "meta/speaker-hints.json"

HAIKU = "claude-haiku-4-5-20251001"
SONNET = "claude-haiku-4-5-20251001"  # OAuth token doesn't have Sonnet access; Haiku handles this fine

# Regex for transcript lines
UTTERANCE_RE = re.compile(
    r'^\[(\d{2}:\d{2})-(\d{2}:\d{2})\]\s+(.+?):\s+(.*)$'
)
# Regex for transcript header
DATE_RE = re.compile(r'^Date:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})')
DURATION_RE = re.compile(r'^Duration:\s*(.+)')
SUMMARY_RE = re.compile(r'^Summary:\s*(.+)')


# ── Frontmatter Parsing ─────────────────────────────────────────────────────

def parse_frontmatter(path: Path) -> dict | None:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None
    if not text.startswith("---"):
        # Transcript files may not have frontmatter yet
        return {}
    end = text.find("\n---", 3)
    if end < 0:
        return {}
    block = text[4:end]
    if HAS_YAML:
        try:
            return yaml.safe_load(block) or {}
        except Exception:
            return {}
    return _parse_fm_regex(block)


def _parse_fm_regex(block: str) -> dict:
    result: dict = {}
    for line in block.split("\n"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r"^(\S[\w-]*):\s*(.*)", line)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        if val.startswith("[") and val.endswith("]"):
            items = val[1:-1]
            result[key] = [s.strip().strip("\"'") for s in items.split(",") if s.strip()]
        elif val.lower() in ("true", "false"):
            result[key] = val.lower() == "true"
        else:
            result[key] = val.strip("\"'")
    return result


# ── Transcript Parsing ───────────────────────────────────────────────────────

def parse_transcript(path: Path) -> dict:
    """Parse a transcript file. Returns {date, duration, summary, speakers, utterances, text}."""
    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")

    result = {
        "path": path,
        "date": None,
        "duration": "",
        "summary": "",
        "speakers": set(),
        "named_speakers": set(),
        "anonymous_speakers": set(),
        "utterances": [],
        "raw_text": text,
    }

    for line in lines:
        dm = DATE_RE.match(line)
        if dm:
            try:
                result["date"] = datetime.strptime(dm.group(1), "%Y-%m-%d %H:%M:%S")
                result["date"] = result["date"].replace(tzinfo=CST)
            except ValueError:
                pass
            continue
        sm = SUMMARY_RE.match(line)
        if sm:
            result["summary"] = sm.group(1)
            continue
        dr = DURATION_RE.match(line)
        if dr:
            result["duration"] = dr.group(1)
            continue
        um = UTTERANCE_RE.match(line)
        if um:
            speaker = um.group(3).strip()
            text_content = um.group(4).strip()
            result["utterances"].append({
                "start": um.group(1),
                "end": um.group(2),
                "speaker": speaker,
                "text": text_content,
            })
            result["speakers"].add(speaker)
            if re.match(r'^Speaker\s+\d+$', speaker):
                result["anonymous_speakers"].add(speaker)
            else:
                result["named_speakers"].add(speaker)

    return result


def estimate_duration_minutes(duration_str: str) -> float:
    """Parse '13m 33s' or '1h 5m' to minutes."""
    total = 0
    hm = re.search(r'(\d+)h', duration_str)
    if hm:
        total += int(hm.group(1)) * 60
    mm = re.search(r'(\d+)m', duration_str)
    if mm:
        total += int(mm.group(1))
    sm = re.search(r'(\d+)s', duration_str)
    if sm:
        total += int(sm.group(1)) / 60
    return total or 15  # default 15 min if unparseable


# ── Calendar Index ───────────────────────────────────────────────────────────

def build_calendar_index(vault_root: Path) -> list[dict]:
    """Read all calendar event notes and build a time-indexed list."""
    events = []
    for cal_dir_rel in CALENDAR_DIRS:
        cal_dir = vault_root / cal_dir_rel
        if not cal_dir.is_dir():
            continue
        for md_file in cal_dir.glob("*.md"):
            fm = parse_frontmatter(md_file)
            if not fm or fm.get("type") != "calendar-event":
                continue
            start = fm.get("start-time", "")
            end = fm.get("end-time", "")
            if not start or not end:
                continue
            try:
                start_dt = datetime.fromisoformat(start)
                end_dt = datetime.fromisoformat(end)
            except ValueError:
                continue
            events.append({
                "path": md_file,
                "subject": fm.get("subject", ""),
                "start": start_dt,
                "end": end_dt,
                "attendees": fm.get("attendees", []) or [],
                "organizer": fm.get("organizer", ""),
                "domain": fm.get("domain", "solera"),
            })
    return events


# ── People Index ─────────────────────────────────────────────────────────────

def build_people_lookup(vault_root: Path) -> dict:
    """Build name->canonical lookup from People notes."""
    lookup: dict[str, str] = {}
    for people_dir_rel in PEOPLE_DIRS:
        people_dir = vault_root / people_dir_rel
        if not people_dir.is_dir():
            continue
        for md_file in people_dir.glob("*.md"):
            fm = parse_frontmatter(md_file)
            if not fm:
                continue
            name = fm.get("name", "")
            if not name:
                continue
            lookup[name.lower()] = name
            for alias in fm.get("aliases", []) or []:
                if alias:
                    lookup[alias.lower()] = name
    return lookup


def name_uniqueness(name: str, lookup: dict) -> int:
    """Count how many People notes share a first name."""
    first = name.split()[0].lower() if name else ""
    if not first:
        return 0
    count = sum(1 for k, v in lookup.items() if k == first or v.split()[0].lower() == first)
    return count


# ── Calendar Matching ────────────────────────────────────────────────────────

def match_calendar(
    transcript: dict, events: list[dict], lookup: dict,
) -> tuple[dict | None, str, float]:
    """Match a transcript to a calendar event.
    Returns (best_event, confidence_level, score)."""
    if not transcript["date"] or not events:
        return None, "none", 0.0

    t_start = transcript["date"]
    t_duration = estimate_duration_minutes(transcript["duration"])
    t_end = t_start + timedelta(minutes=t_duration)
    tolerance = timedelta(minutes=TIME_TOLERANCE_MIN)

    candidates = []
    for event in events:
        # Date must match (same day)
        if event["start"].date() != t_start.date():
            continue
        # Time overlap with tolerance
        if t_start > event["end"] + tolerance:
            continue
        if t_end < event["start"] - tolerance:
            continue

        score = _score_match(transcript, event, t_start, lookup)
        candidates.append((event, score))

    if not candidates:
        return None, "none", 0.0

    candidates.sort(key=lambda x: x[1], reverse=True)
    best_event, best_score = candidates[0]

    if best_score >= 0.7:
        level = "high"
    elif best_score >= 0.4:
        level = "medium"
    else:
        level = "low"

    return best_event, level, best_score


def _score_match(
    transcript: dict, event: dict,
    t_start: datetime, lookup: dict,
) -> float:
    """Score a transcript-event match. Returns 0.0 to 1.0."""
    score = 0.0

    # Time proximity (0-0.3)
    time_diff = abs((t_start - event["start"]).total_seconds()) / 60
    if time_diff < 5:
        score += 0.3
    elif time_diff < 15:
        score += 0.2
    elif time_diff < 30:
        score += 0.1

    # Subject similarity (0-0.3)
    if transcript["summary"] and event["subject"]:
        sim = _text_similarity(transcript["summary"], event["subject"])
        score += sim * 0.3

    # Named speaker overlap (0-0.3)
    event_attendees_lower = {a.lower() for a in event["attendees"]}
    named = transcript["named_speakers"]
    if named and event_attendees_lower:
        matched = 0
        for speaker in named:
            canonical = lookup.get(speaker.lower(), speaker)
            if canonical.lower() in event_attendees_lower:
                matched += 1
            # Try first name
            first = speaker.split()[0].lower()
            if any(first in a for a in event_attendees_lower):
                matched += 1
        overlap = matched / max(len(named), 1)
        score += min(overlap, 1.0) * 0.3

    # Speaker count proximity (0-0.1)
    n_speakers = len(transcript["speakers"])
    n_attendees = len(event["attendees"])
    if n_attendees > 0:
        ratio = min(n_speakers, n_attendees) / max(n_speakers, n_attendees)
        score += ratio * 0.1

    return score


def _text_similarity(a: str, b: str) -> float:
    """Simple word-overlap similarity."""
    words_a = set(a.lower().split())
    words_b = set(b.lower().split())
    # Remove common words
    stop = {"the", "a", "an", "and", "or", "of", "in", "on", "for", "to", "with", "is", "are", "was"}
    words_a -= stop
    words_b -= stop
    if not words_a or not words_b:
        return 0.0
    overlap = words_a & words_b
    return len(overlap) / min(len(words_a), len(words_b))


# ── Speaker Overrides ────────────────────────────────────────────────────────

def load_overrides(vault_root: Path) -> dict:
    path = vault_root / OVERRIDES_PATH
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def load_hints(vault_root: Path) -> dict:
    path = vault_root / HINTS_PATH
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


# ── AI Speaker Resolution ───────────────────────────────────────────────────

def resolve_speakers_ai(
    transcript: dict, attendees: list[str],
    overrides: dict, hints: dict, lookup: dict,
) -> dict:
    """Resolve anonymous speakers using AI.
    Returns {speaker_label: {name, confidence, evidence}}."""

    # Step 1: pre-resolve named speakers
    resolution = {}
    remaining_speakers = set()
    remaining_attendees = list(attendees)

    for speaker in transcript["speakers"]:
        # Check overrides first
        transcript_key = str(transcript["path"])
        if transcript_key in overrides and speaker in overrides[transcript_key]:
            override = overrides[transcript_key][speaker]
            resolution[speaker] = {
                "name": override["name"],
                "confidence": 0.99,
                "tier": "definite",
                "evidence": "Manual override",
            }
            if override["name"] in remaining_attendees:
                remaining_attendees.remove(override["name"])
            continue

        if speaker in transcript["named_speakers"]:
            canonical = lookup.get(speaker.lower(), speaker)
            resolution[speaker] = {
                "name": canonical,
                "confidence": 0.95,
                "tier": "definite",
                "evidence": "Named in transcript",
            }
            # Remove from candidates
            if canonical in remaining_attendees:
                remaining_attendees.remove(canonical)
            elif speaker in remaining_attendees:
                remaining_attendees.remove(speaker)
        else:
            remaining_speakers.add(speaker)

    # Step 2: if no anonymous speakers or no candidates, done
    if not remaining_speakers or not remaining_attendees:
        for s in remaining_speakers:
            resolution[s] = {
                "name": None, "confidence": 0,
                "tier": "unresolved", "evidence": "No candidates available",
            }
        return resolution

    # Step 3: AI resolution
    if not HAS_ANTHROPIC:
        for s in remaining_speakers:
            resolution[s] = {
                "name": None, "confidence": 0,
                "tier": "unresolved", "evidence": "No AI available",
            }
        return resolution

    token = os.environ.get("CLAUDE_CODE_OAUTH_TOKEN", "")
    if not token:
        token = os.environ.get("ANTHROPIC_API_KEY", "")
    if not token:
        for s in remaining_speakers:
            resolution[s] = {
                "name": None, "confidence": 0,
                "tier": "unresolved", "evidence": "No API key",
            }
        return resolution

    # Build transcript excerpt for AI
    excerpt_lines = []
    for u in transcript["utterances"][:150]:  # limit context
        excerpt_lines.append(f"[{u['start']}] {u['speaker']}: {u['text']}")
    excerpt = "\n".join(excerpt_lines)

    # Build hints context
    hints_text = ""
    for name, hint in hints.items():
        if name in remaining_attendees or name in [r.get("name") for r in resolution.values()]:
            meetings = hint.get("typical_meetings", [])
            cues = hint.get("language_cues", "")
            if meetings or cues:
                hints_text += f"- {name}: meetings={meetings}, cues={cues}\n"

    # Uniqueness context
    uniqueness_text = ""
    for attendee in remaining_attendees:
        count = name_uniqueness(attendee, lookup)
        if count <= 1:
            uniqueness_text += f"- {attendee}: unique first name\n"

    prompt = f"""You are resolving anonymous speaker labels in a meeting transcript.

ANONYMOUS SPEAKERS to resolve: {sorted(remaining_speakers)}
CANDIDATE ATTENDEES (from calendar): {remaining_attendees}
ALREADY IDENTIFIED: {', '.join(f'{s}={r["name"]}' for s, r in resolution.items() if r["name"])}

{f"SPEAKER HINTS:{chr(10)}{hints_text}" if hints_text else ""}
{f"NAME UNIQUENESS:{chr(10)}{uniqueness_text}" if uniqueness_text else ""}

TRANSCRIPT:
{excerpt}

RULES:
- Only assign a speaker to an attendee who is SPEAKING (has utterance lines), not someone merely mentioned
- Use evidence: self-introductions, being called by name, role references, speech patterns
- If uncertain, leave as null — honest uncertainty beats wrong attribution
- Each attendee can be assigned to at most ONE speaker

Respond in EXACTLY this format for EACH anonymous speaker (one per line):
SPEAKER: Speaker N | NAME: First Last | CONFIDENCE: 0.XX | EVIDENCE: brief reason
SPEAKER: Speaker N | NAME: null | CONFIDENCE: 0 | EVIDENCE: insufficient context"""

    # Choose model based on complexity
    model = HAIKU
    if len(remaining_speakers) > 6 or len(transcript["utterances"]) > 100:
        model = SONNET

    try:
        client = anthropic.Anthropic(api_key=token)
        resp = client.messages.create(
            model=model,
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt}],
        )
        ai_text = resp.content[0].text
        _parse_ai_resolution(ai_text, resolution, remaining_speakers)
    except Exception as e:
        print(f"    AI error: {e}", file=sys.stderr)
        for s in remaining_speakers:
            resolution[s] = {
                "name": None, "confidence": 0,
                "tier": "unresolved", "evidence": f"AI call failed: {e}",
            }

    return resolution


def _parse_ai_resolution(
    text: str, resolution: dict, remaining: set,
) -> None:
    """Parse AI response lines into resolution dict."""
    for line in text.strip().split("\n"):
        line = line.strip()
        if not line.startswith("SPEAKER:"):
            continue
        parts = {}
        for segment in line.split("|"):
            segment = segment.strip()
            if ":" in segment:
                key, val = segment.split(":", 1)
                parts[key.strip()] = val.strip()

        speaker = parts.get("SPEAKER", "").strip()
        name = parts.get("NAME", "null").strip()
        if name == "null":
            name = None
        try:
            conf = float(parts.get("CONFIDENCE", "0"))
        except ValueError:
            conf = 0
        evidence = parts.get("EVIDENCE", "")

        if speaker in remaining:
            tier = "unresolved"
            if conf >= 0.95:
                tier = "definite"
            elif conf >= 0.80:
                tier = "high"
            elif conf >= 0.60:
                tier = "probable"
            elif conf > 0:
                tier = "guess"

            resolution[speaker] = {
                "name": name,
                "confidence": conf,
                "tier": tier,
                "evidence": evidence,
            }
            remaining.discard(speaker)

    # Anything still remaining gets unresolved
    for s in remaining:
        resolution[s] = {
            "name": None, "confidence": 0,
            "tier": "unresolved", "evidence": "Not addressed by AI",
        }


# ── Transcript Update ────────────────────────────────────────────────────────

def update_transcript(
    path: Path, resolution: dict,
    calendar_event: dict | None, match_confidence: str,
    vault_root: Path,
) -> None:
    """Update a transcript note with resolved speakers and calendar cross-ref."""
    text = path.read_text(encoding="utf-8")

    # Replace speaker labels in utterance lines
    for speaker, info in resolution.items():
        if info["name"] and info["confidence"] >= 0.60:
            # Replace "Speaker N:" with "Name:" in utterance lines
            text = text.replace(f"] {speaker}:", f"] {info['name']}:")

    # Add/update frontmatter
    text = _add_or_update_frontmatter(
        text, path, resolution, calendar_event, match_confidence, vault_root,
    )

    path.write_text(text, encoding="utf-8")


def _add_or_update_frontmatter(
    text: str, path: Path, resolution: dict,
    calendar_event: dict | None, match_confidence: str,
    vault_root: Path,
) -> str:
    """Add or update YAML frontmatter on the transcript."""
    # Collect resolved attendees
    attendees = []
    for speaker, info in resolution.items():
        if info["name"] and info["confidence"] >= 0.60:
            if info["name"] not in attendees:
                attendees.append(info["name"])
        elif info["name"] is None and speaker not in attendees:
            attendees.append(speaker)

    # Build speaker-map for frontmatter
    speaker_map = {}
    for speaker, info in resolution.items():
        if re.match(r'^Speaker\s+\d+$', speaker):
            entry = {"name": info["name"] or speaker, "confidence": info["confidence"]}
            speaker_map[speaker] = entry

    # Calendar cross-ref
    cal_ref = ""
    if calendar_event:
        cal_path = calendar_event["path"].relative_to(vault_root)
        cal_ref = f'"[[{cal_path}]]"'

    if text.startswith("---"):
        # Has existing frontmatter — update it
        end = text.find("\n---", 3)
        if end >= 0:
            fm_block = text[4:end]
            body = text[end + 4:]

            # Update attendees
            fm_block = re.sub(
                r'^attendees:.*$',
                f'attendees: [{", ".join(attendees)}]',
                fm_block, flags=re.MULTILINE,
            )

            # Add/update calendar fields
            if "calendar-event:" not in fm_block:
                fm_block += f"\ncalendar-event: {cal_ref}"
            else:
                fm_block = re.sub(
                    r'^calendar-event:.*$',
                    f'calendar-event: {cal_ref}',
                    fm_block, flags=re.MULTILINE,
                )

            if "calendar-match-confidence:" not in fm_block:
                fm_block += f"\ncalendar-match-confidence: {match_confidence}"
            else:
                fm_block = re.sub(
                    r'^calendar-match-confidence:.*$',
                    f'calendar-match-confidence: {match_confidence}',
                    fm_block, flags=re.MULTILINE,
                )

            return "---\n" + fm_block + "\n---" + body
    else:
        # No frontmatter — parse header lines and create frontmatter
        lines = text.split("\n")
        header_end = 0
        date_str = ""
        summary = ""
        duration = ""
        for i, line in enumerate(lines):
            dm = DATE_RE.match(line)
            if dm:
                date_str = dm.group(1)[:10]
                header_end = i + 1
                continue
            sm = SUMMARY_RE.match(line)
            if sm:
                summary = sm.group(1)
                header_end = i + 1
                continue
            dr = DURATION_RE.match(line)
            if dr:
                duration = dr.group(1)
                header_end = i + 1
                continue
            if line.strip() == "" and header_end > 0:
                header_end = i + 1
                break

        fm_lines = ["---"]
        fm_lines.append(f"date: {date_str}")
        fm_lines.append("type: transcript")
        fm_lines.append("domain: solera")
        if duration:
            fm_lines.append(f'duration: "{duration}"')
        fm_lines.append(f"attendees: [{', '.join(attendees)}]")
        if calendar_event:
            fm_lines.append(f"calendar-event: {cal_ref}")
            fm_lines.append(f"calendar-match-confidence: {match_confidence}")
        if summary:
            fm_lines.append(f'summary: "{summary}"')
        fm_lines.append("tags: [solera]")
        fm_lines.append("---")
        fm_lines.append("")

        remaining_lines = lines[header_end:]
        return "\n".join(fm_lines) + "\n".join(remaining_lines)

    return text


# ── Processing Pipeline ──────────────────────────────────────────────────────

def process_transcript(
    path: Path, vault_root: Path,
    events: list[dict], lookup: dict,
    overrides: dict, hints: dict,
    report: dict, use_ai: bool, dry_run: bool,
) -> None:
    """Process a single transcript for speaker resolution."""
    transcript = parse_transcript(path)
    if not transcript["utterances"]:
        return

    n_anon = len(transcript["anonymous_speakers"])
    n_total = len(transcript["speakers"])
    if n_anon == 0:
        report["already_resolved"] += 1
        return

    print(f"  {path.name}: {n_total} speakers ({n_anon} anonymous)")

    # Calendar match
    event, confidence, score = match_calendar(transcript, events, lookup)
    if event:
        print(f"    Calendar match: {event['subject']} (confidence={confidence}, score={score:.2f})")
        print(f"    Attendees: {', '.join(event['attendees'])}")
    else:
        print(f"    No calendar match")

    attendees = event["attendees"] if event else []

    # Resolve speakers
    if use_ai and attendees:
        resolution = resolve_speakers_ai(transcript, attendees, overrides, hints, lookup)
    else:
        resolution = {}
        for s in transcript["speakers"]:
            if s in transcript["named_speakers"]:
                canonical = lookup.get(s.lower(), s)
                resolution[s] = {"name": canonical, "confidence": 0.95, "tier": "definite", "evidence": "Named"}
            else:
                resolution[s] = {"name": None, "confidence": 0, "tier": "unresolved", "evidence": "No AI/no attendees"}

    # Report
    resolved_count = sum(1 for r in resolution.values() if r["name"] and r["confidence"] >= 0.60)
    report["processed"] += 1
    report["speakers_total"] += n_total
    report["speakers_resolved"] += resolved_count

    for speaker, info in sorted(resolution.items()):
        if info["name"] and info["confidence"] >= 0.60:
            print(f"    {speaker} → {info['name']} ({info['tier']}, {info['confidence']:.2f}: {info['evidence']})")
        else:
            print(f"    {speaker} → UNRESOLVED ({info.get('evidence', '')})")

    report["details"].append({
        "file": path.name,
        "calendar": event["subject"] if event else None,
        "confidence": confidence,
        "resolution": {s: r for s, r in resolution.items()},
    })

    # Update transcript
    if not dry_run:
        update_transcript(path, resolution, event, confidence, vault_root)
        print(f"    Updated: {path.name}")


def find_transcripts(vault_root: Path, specific: Path | None = None) -> list[Path]:
    """Find transcript files to process."""
    if specific:
        return [specific.resolve()]
    transcripts_dir = vault_root / TRANSCRIPTS_DIR
    if not transcripts_dir.is_dir():
        return []
    files = sorted(transcripts_dir.glob("*.md"))
    # Skip triage files
    return [f for f in files if not f.name.startswith("TRIAGE")]


# ── Report ───────────────────────────────────────────────────────────────────

def print_report(report: dict) -> None:
    print(f"\n=== Speaker Resolution Report ===")
    print(f"Transcripts scanned: {report['scanned']}")
    print(f"Already resolved:    {report['already_resolved']}")
    print(f"Processed:           {report['processed']}")
    print(f"Speakers total:      {report['speakers_total']}")
    print(f"Speakers resolved:   {report['speakers_resolved']}")


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Resolve speaker labels in transcript notes")
    parser.add_argument("--vault-root", type=Path, default=Path.home() / "Vaults" / "My Notes")
    parser.add_argument("--transcript", type=Path, help="Process a single transcript")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-ai", action="store_true")
    args = parser.parse_args()

    vault_root = args.vault_root.expanduser().resolve()
    if not vault_root.is_dir():
        print(f"Error: vault root not found: {vault_root}", file=sys.stderr)
        sys.exit(1)

    # Load .env
    env_path = Path.home() / "dev" / "NanoClaw" / ".env"
    if env_path.exists():
        for line in env_path.read_text().split("\n"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

    print("Building indexes...")
    events = build_calendar_index(vault_root)
    print(f"  Calendar events: {len(events)}")
    lookup = build_people_lookup(vault_root)
    print(f"  People names: {len(lookup)}")
    overrides = load_overrides(vault_root)
    hints = load_hints(vault_root)
    print(f"  Speaker overrides: {len(overrides)} transcripts")
    print(f"  Speaker hints: {len(hints)} people")

    transcripts = find_transcripts(vault_root, args.transcript)
    print(f"  Transcripts: {len(transcripts)}")

    report = {
        "scanned": 0, "already_resolved": 0, "processed": 0,
        "speakers_total": 0, "speakers_resolved": 0, "details": [],
    }

    if args.dry_run:
        print("\nDRY RUN — no files will be modified\n")

    for path in transcripts:
        report["scanned"] += 1
        process_transcript(
            path, vault_root, events, lookup,
            overrides, hints, report,
            use_ai=not args.no_ai, dry_run=args.dry_run,
        )

    print_report(report)


if __name__ == "__main__":
    main()
