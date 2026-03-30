#!/usr/bin/env python3
"""Vault hygiene — systematic data quality checks with auto-fix and AI dedup.

Runs checks against the Obsidian vault, auto-fixes deterministic issues,
uses AI (Sonnet) for dedup candidate scoring, and generates an actionable report.

Usage:
  python vault_hygiene.py [--vault-root PATH] [--dry-run] [--no-ai]
  python vault_hygiene.py --checks crossref-broken-links,crossref-speaker-sync
"""

import argparse
import difflib
import json
import os
import re
import sys
import time
from collections import defaultdict
from datetime import datetime, date
from pathlib import Path

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

try:
    # Add tools/lib to path for bridge client
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from lib.bridge import claude as bridge_claude
    HAS_BRIDGE = True
except ImportError:
    HAS_BRIDGE = False


# ── Constants ────────────────────────────────────────────────────────────────

DOMAINS = ["Solera", "Tandem", "CNPC"]
PEOPLE_DIRS = [f"{d}/People" for d in DOMAINS]
MEETING_DIRS = [f"{d}/Meetings" for d in DOMAINS]
CALENDAR_DIRS = ["Solera/Calendar"]
CHAT_DIRS = ["Solera/Chats", "CNPC/Chats"]
PROJECT_DIRS = ["Solera/Projects"]
TRANSCRIPT_DIR = "Transcripts"

VALID_TYPES = {
    "person", "meeting-summary", "transcript", "chat",
    "calendar-event", "org-entity", "project", "moc", "dashboard",
}
VALID_LEVELS = {"c-suite", "svp", "vp", "director", "manager", "ic"}

AI_MODEL = "claude-sonnet-4-6"
AI_FALLBACK = "claude-haiku-4-5-20251001"
MAX_AI_CALLS = 20

# Checks that can be targeted via --checks
ALL_CHECKS = [
    "people-schema", "people-email", "people-alias-collision",
    "people-name-norm", "people-stale", "people-orphan", "people-dedup",
    "project-metadata", "project-stale", "project-workstreams",
    "meeting-unknown-attendees", "meeting-tags", "meeting-workstreams",
    "transcript-unresolved",
    "crossref-broken-links", "crossref-speaker-sync",
    "invalid-types", "tag-governance",
]


# ── Frontmatter Parsing ─────────────────────────────────────────────────────

def _parse_frontmatter(path: Path) -> dict | None:
    """Extract YAML frontmatter dict from a markdown file."""
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None
    if not text.startswith("---"):
        return None
    end = text.find("\n---", 3)
    if end < 0:
        return None
    block = text[4:end]
    if HAS_YAML:
        try:
            return yaml.safe_load(block) or {}
        except Exception:
            return None
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


# ── Atomic Write Helper ──────────────────────────────────────────────────────

def apply_frontmatter_fix(
    path: Path, updates: dict, dry_run: bool,
) -> bool:
    """Patch frontmatter fields atomically. Returns True if changed."""
    if dry_run:
        return False
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return False
    if not text.startswith("---"):
        return False
    end = text.find("\n---", 3)
    if end < 0:
        return False

    fm_block = text[4:end]
    body = text[end + 4:]
    changed = False

    for field, value in updates.items():
        formatted = _format_field(field, value)
        pattern = re.compile(rf"^{re.escape(field)}:.*$", re.MULTILINE)
        if pattern.search(fm_block):
            new_block = pattern.sub(formatted, fm_block)
            if new_block != fm_block:
                fm_block = new_block
                changed = True
        else:
            fm_block = fm_block.rstrip() + "\n" + formatted
            changed = True

    if not changed:
        return False

    new_text = "---\n" + fm_block + "\n---" + body
    tmp = path.with_suffix(".tmp")
    tmp.write_text(new_text, encoding="utf-8")
    tmp.replace(path)
    return True


def _format_field(field: str, value) -> str:
    if isinstance(value, bool):
        return f"{field}: {'true' if value else 'false'}"
    if isinstance(value, list):
        if not value:
            return f"{field}: []"
        items = ", ".join(str(v) for v in value)
        return f"{field}: [{items}]"
    if any(c in str(value) for c in ":#{}[]|>&*!%@"):
        return f'{field}: "{value}"'
    return f"{field}: {value}"


# ── Vault Index ──────────────────────────────────────────────────────────────

def build_vault_index(vault_root: Path) -> dict:
    """Walk domain-scoped dirs and build lookup indexes."""
    index = {
        "people": {},
        "people_by_name": defaultdict(list),
        "people_by_email": {},
        "people_by_alias": defaultdict(list),
        "projects": {},
        "meetings": {},
        "transcripts": {},
        "calendar": {},
        "chats": {},
        "all_attendees": defaultdict(set),
    }

    def _walk(rel_dirs, category):
        if isinstance(rel_dirs, str):
            rel_dirs = [rel_dirs]
        for rel_dir in rel_dirs:
            d = vault_root / rel_dir
            if not d.is_dir():
                continue
            for md in d.rglob("*.md"):
                if ".sync-conflict-" in md.name:
                    continue
                fm = _parse_frontmatter(md)
                if fm:
                    index[category][md] = fm

    _walk(PEOPLE_DIRS, "people")
    _walk(MEETING_DIRS, "meetings")
    _walk(CALENDAR_DIRS, "calendar")
    _walk(CHAT_DIRS, "chats")
    _walk(PROJECT_DIRS, "projects")
    _walk(TRANSCRIPT_DIR, "transcripts")

    # Build people sub-indexes
    for path, fm in index["people"].items():
        name = fm.get("name", "")
        if name:
            index["people_by_name"][name.lower()].append(path)
        for alias in fm.get("aliases", []) or []:
            if alias:
                index["people_by_alias"][alias.lower()].append(path)
        email = fm.get("email", "")
        if email:
            index["people_by_email"][email.lower()] = path

    # Build attendees index (who appears in which meetings)
    for cat in ("meetings", "transcripts", "chats"):
        field = "participants" if cat == "chats" else "attendees"
        for path, fm in index[cat].items():
            for att in fm.get(field, []) or []:
                if att:
                    index["all_attendees"][att.lower()].add(path)

    return index


# ── Suppressions ─────────────────────────────────────────────────────────────

def load_suppressions(vault_root: Path) -> list:
    path = vault_root / "meta" / "hygiene-suppressions.json"
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data.get("suppressions", [])
    except (json.JSONDecodeError, OSError):
        return []


def is_suppressed(check: str, target: str, suppressions: list) -> bool:
    today = date.today().isoformat()
    for s in suppressions:
        if s.get("check") == check and s.get("target") == target:
            expires = s.get("expires", "9999-12-31")
            if today <= expires:
                return True
    return False


def ensure_suppressions_file(vault_root: Path, dry_run: bool):
    path = vault_root / "meta" / "hygiene-suppressions.json"
    if not path.exists() and not dry_run:
        path.write_text(
            json.dumps({"suppressions": []}, indent=2) + "\n",
            encoding="utf-8",
        )


# ── Tag Registry Parser ─────────────────────────────────────────────────────

def parse_tag_registry(vault_root: Path) -> dict:
    """Parse Tag Registry.md for valid tags by category."""
    path = vault_root / "Tag Registry.md"
    tags = {
        "domains": set(),
        "workstreams": set(),
        "meeting_types": set(),
        "signals": set(),
        "all": set(),
    }
    if not path.exists():
        return tags

    text = path.read_text(encoding="utf-8")
    current = None
    for line in text.split("\n"):
        if "Domain Tags" in line:
            current = "domains"
        elif "Workstream Tags" in line:
            current = "workstreams"
        elif "Meeting Type Tags" in line:
            current = "meeting_types"
        elif "Signal Tags" in line:
            current = "signals"
        elif "Governance Rules" in line:
            current = None
        elif current and line.startswith("| `"):
            m = re.match(r"\| `([^`]+)`", line)
            if m:
                tag = m.group(1)
                tags[current].add(tag)
                tags["all"].add(tag)

    return tags


# ── Report ───────────────────────────────────────────────────────────────────

def new_report() -> dict:
    return {
        "checks_run": 0,
        "auto_fixes": 0,
        "review_items": 0,
        "info_items": 0,
        "auto_fix_details": [],
        "review_details": [],
        "info_details": [],
        "errors": [],
        "stats": {},
    }


def add_finding(report, severity, check, target, description, suggestion=""):
    entry = {
        "check": check,
        "target": str(target),
        "description": description,
        "suggestion": suggestion,
    }
    if severity == "auto-fix":
        report["auto_fixes"] += 1
        report["auto_fix_details"].append(entry)
    elif severity == "review":
        report["review_items"] += 1
        report["review_details"].append(entry)
    else:
        report["info_items"] += 1
        report["info_details"].append(entry)


# ── People Checks ────────────────────────────────────────────────────────────

def check_people_schema(index, report, suppressions, dry_run):
    """Missing type, domain, invalid level."""
    report["checks_run"] += 1
    for path, fm in index["people"].items():
        if is_suppressed("people-schema", str(path), suppressions):
            continue
        verified = set(fm.get("verified-fields", []) or [])
        fixes = {}

        if fm.get("type") != "person" and "type" not in verified:
            fixes["type"] = "person"
        if not fm.get("domain") and "domain" not in verified:
            fixes["domain"] = "solera"  # default for Solera/People
            for d in DOMAINS:
                if f"/{d}/" in str(path):
                    fixes["domain"] = d.lower()
                    break
        level = fm.get("level", "")
        if level and level not in VALID_LEVELS and "level" not in verified:
            fixes["level"] = "ic"  # safe default

        if fixes:
            if apply_frontmatter_fix(path, fixes, dry_run):
                add_finding(report, "auto-fix", "people-schema", path,
                            f"Fixed: {', '.join(fixes.keys())}")
            elif dry_run:
                add_finding(report, "auto-fix", "people-schema", path,
                            f"Would fix: {', '.join(fixes.keys())}")


def check_people_email_uniqueness(index, report, suppressions):
    """Multiple notes with same email."""
    report["checks_run"] += 1
    email_notes = defaultdict(list)
    for path, fm in index["people"].items():
        email = (fm.get("email") or "").lower()
        if email:
            email_notes[email].append((path, fm))

    for email, notes in email_notes.items():
        if len(notes) <= 1:
            continue
        if is_suppressed("people-email", email, suppressions):
            continue
        names = [fm.get("name", path.stem) for path, fm in notes]
        verified = [path for path, fm in notes if fm.get("verified")]
        suggestion = ""
        if verified:
            suggestion = f"Canonical: {verified[0].stem} (verified)"
        add_finding(report, "review", "people-email",
                    email, f"Shared by: {', '.join(names)}", suggestion)


def check_people_alias_collisions(index, report, suppressions):
    """Aliases that match >1 person via contains()."""
    report["checks_run"] += 1
    for alias, paths in index["people_by_alias"].items():
        if len(paths) <= 1:
            continue
        if is_suppressed("people-alias-collision", alias, suppressions):
            continue
        names = []
        for p in paths:
            fm = index["people"].get(p, {})
            names.append(fm.get("name", p.stem))
        add_finding(report, "review", "people-alias-collision",
                    alias, f"Alias '{alias}' matches: {', '.join(names)}")


def check_people_name_normalization(index, report, suppressions, dry_run):
    """Whitespace and casing issues in name field."""
    report["checks_run"] += 1
    for path, fm in index["people"].items():
        name = fm.get("name", "")
        if not name:
            continue
        verified = set(fm.get("verified-fields", []) or [])
        if "name" in verified:
            continue
        if is_suppressed("people-name-norm", str(path), suppressions):
            continue
        cleaned = name.strip()
        if cleaned != name:
            if apply_frontmatter_fix(path, {"name": cleaned}, dry_run):
                add_finding(report, "auto-fix", "people-name-norm", path,
                            f"Stripped whitespace: '{name}' -> '{cleaned}'")
            elif dry_run:
                add_finding(report, "auto-fix", "people-name-norm", path,
                            f"Would strip whitespace: '{name}'")


def check_people_stale(index, report, suppressions):
    """last-seen > 180 days."""
    report["checks_run"] += 1
    today = date.today()
    count = 0
    for path, fm in index["people"].items():
        last_seen = fm.get("last-seen", "")
        if not last_seen:
            continue
        try:
            ls_date = date.fromisoformat(str(last_seen))
            if (today - ls_date).days > 180:
                count += 1
        except (ValueError, TypeError):
            pass
    report["stats"]["people_stale_count"] = count
    if count:
        add_finding(report, "info", "people-stale", "vault",
                    f"{count} People notes with last-seen > 180 days")


def check_people_orphan(index, report, suppressions):
    """People not in any attendees/participants."""
    report["checks_run"] += 1
    orphans = []
    for path, fm in index["people"].items():
        name = (fm.get("name") or "").lower()
        aliases = [a.lower() for a in (fm.get("aliases") or []) if a]
        found = name in index["all_attendees"]
        if not found:
            for a in aliases:
                if a in index["all_attendees"]:
                    found = True
                    break
        if not found:
            orphans.append(fm.get("name", path.stem))

    report["stats"]["people_orphan_count"] = len(orphans)
    if orphans:
        add_finding(report, "info", "people-orphan", "vault",
                    f"{len(orphans)} People notes not in any meeting attendees")


# ── AI Dedup ─────────────────────────────────────────────────────────────────

def check_people_dedup(index, report, vault_root, suppressions, no_ai):
    """Group by first name, score similarity, optionally use AI."""
    report["checks_run"] += 1

    # Group by first name
    first_name_groups = defaultdict(list)
    for path, fm in index["people"].items():
        name = fm.get("name", "")
        if not name:
            continue
        first = name.split()[0].lower() if name.split() else ""
        if first:
            first_name_groups[first].append((path, fm))

    candidates = []
    for first, notes in first_name_groups.items():
        if len(notes) < 2:
            continue
        # Compare each pair
        for i in range(len(notes)):
            for j in range(i + 1, len(notes)):
                p1, fm1 = notes[i]
                p2, fm2 = notes[j]
                target = f"{p1.stem} vs {p2.stem}"
                if is_suppressed("people-dedup", target, suppressions):
                    continue
                score = _dedup_score(fm1, fm2, index)
                if score > 0.3:
                    candidates.append((score, p1, fm1, p2, fm2))

    # Sort by score descending
    candidates.sort(key=lambda x: -x[0])

    # AI scoring for top candidates
    ai_calls = 0
    for score, p1, fm1, p2, fm2 in candidates:
        n1 = fm1.get("name", p1.stem)
        n2 = fm2.get("name", p2.stem)
        ai_result = ""

        if not no_ai and ai_calls < MAX_AI_CALLS and score > 0.4:
            ai_result = _ai_dedup(fm1, fm2, index, vault_root)
            ai_calls += 1

        desc = f"Score {score:.2f}: {n1} vs {n2}"
        if ai_result:
            desc += f" — AI: {ai_result}"
        add_finding(report, "review", "people-dedup",
                    f"{p1.stem} vs {p2.stem}", desc)

    report["stats"]["dedup_candidates"] = len(candidates)
    report["stats"]["dedup_ai_calls"] = ai_calls


def _dedup_score(fm1, fm2, index) -> float:
    """Deterministic similarity score between two People notes."""
    score = 0.0

    # Email domain overlap
    e1 = (fm1.get("email") or "").lower()
    e2 = (fm2.get("email") or "").lower()
    if e1 and e2:
        d1 = e1.split("@")[-1] if "@" in e1 else ""
        d2 = e2.split("@")[-1] if "@" in e2 else ""
        if d1 and d1 == d2:
            score += 0.2
        if e1 == e2:
            score += 0.5  # same email = very likely same person

    # Role similarity
    r1 = fm1.get("role", "")
    r2 = fm2.get("role", "")
    if r1 and r2:
        ratio = difflib.SequenceMatcher(None, r1.lower(), r2.lower()).ratio()
        score += ratio * 0.2

    # Domain match
    if fm1.get("domain") == fm2.get("domain"):
        score += 0.1

    # Meeting overlap
    n1 = (fm1.get("name") or "").lower()
    n2 = (fm2.get("name") or "").lower()
    m1 = index["all_attendees"].get(n1, set())
    m2 = index["all_attendees"].get(n2, set())
    if m1 and m2:
        overlap = len(m1 & m2)
        if overlap > 0:
            score += min(overlap * 0.1, 0.3)

    return min(score, 1.0)


def _ai_dedup(fm1, fm2, index, vault_root) -> str:
    """Ask AI whether two People notes are the same person."""
    if not HAS_BRIDGE:
        return ""

    n1 = fm1.get("name", "Unknown")
    n2 = fm2.get("name", "Unknown")
    prompt = f"""Are these two People notes about the same person?

PERSON A:
  Name: {n1}
  Role: {fm1.get('role', 'Unknown')}
  Email: {fm1.get('email', 'None')}
  Domain: {fm1.get('domain', 'Unknown')}
  Level: {fm1.get('level', 'Unknown')}
  Reports-to: {fm1.get('reports-to', 'Unknown')}

PERSON B:
  Name: {n2}
  Role: {fm2.get('role', 'Unknown')}
  Email: {fm2.get('email', 'None')}
  Domain: {fm2.get('domain', 'Unknown')}
  Level: {fm2.get('level', 'Unknown')}
  Reports-to: {fm2.get('reports-to', 'Unknown')}

Respond in exactly this format:
VERDICT: SAME or DIFFERENT
CONFIDENCE: 0.0 to 1.0
REASONING: one sentence"""

    try:
        return bridge_claude(prompt, model=AI_MODEL).strip()
    except Exception:
        try:
            return bridge_claude(prompt, model=AI_FALLBACK).strip()
        except Exception as e:
            return f"AI error: {e}"


# ── Project Checks ───────────────────────────────────────────────────────────

def check_project_metadata(index, report, suppressions):
    """Missing status, workstreams, priority, lead."""
    report["checks_run"] += 1
    for path, fm in index["projects"].items():
        if is_suppressed("project-metadata", str(path), suppressions):
            continue
        missing = []
        for field in ("status", "workstreams", "priority", "lead"):
            val = fm.get(field)
            if not val or val == "''":
                missing.append(field)
        if missing:
            add_finding(report, "review", "project-metadata", path,
                        f"Missing: {', '.join(missing)}")


def check_project_stale(index, report, suppressions):
    """Active projects with no meeting activity in 90+ days."""
    report["checks_run"] += 1
    today = date.today()
    for path, fm in index["projects"].items():
        if fm.get("status") != "active":
            continue
        if is_suppressed("project-stale", str(path), suppressions):
            continue
        last = fm.get("last-activity", "")
        if not last:
            add_finding(report, "review", "project-stale", path,
                        "Active project with no last-activity date",
                        "Consider setting status to paused")
            continue
        try:
            la_date = date.fromisoformat(str(last))
            if (today - la_date).days > 90:
                add_finding(report, "review", "project-stale", path,
                            f"Active but last activity {last} ({(today - la_date).days} days ago)",
                            "Consider setting status to paused")
        except (ValueError, TypeError):
            pass


def check_project_workstreams(index, valid_tags, report, suppressions, dry_run):
    """Invalid workstream values."""
    report["checks_run"] += 1
    valid = valid_tags.get("workstreams", set())
    if not valid:
        return
    for path, fm in index["projects"].items():
        ws = fm.get("workstreams", []) or []
        if isinstance(ws, str):
            ws = [ws]
        invalid = [w for w in ws if w and w not in valid]
        if invalid:
            cleaned = [w for w in ws if w in valid]
            if apply_frontmatter_fix(path, {"workstreams": cleaned}, dry_run):
                add_finding(report, "auto-fix", "project-workstreams", path,
                            f"Removed invalid workstreams: {invalid}")
            elif dry_run:
                add_finding(report, "auto-fix", "project-workstreams", path,
                            f"Would remove invalid workstreams: {invalid}")


# ── Meeting / Transcript Checks ─────────────────────────────────────────────

def check_meeting_unknown_attendees(index, report, vault_root, suppressions, dry_run):
    """Attendees not matching any People note."""
    report["checks_run"] += 1
    known_names = set(index["people_by_name"].keys())
    known_aliases = set(index["people_by_alias"].keys())
    known = known_names | known_aliases
    unknown = defaultdict(int)

    for cat in ("meetings", "transcripts"):
        for path, fm in index[cat].items():
            for att in fm.get("attendees", []) or []:
                if att and att.lower() not in known:
                    unknown[att] += 1

    if unknown:
        # Append to gaps.md (skip in dry-run)
        gaps_path = vault_root / "meta" / "gaps.md"
        if not dry_run and gaps_path.exists():
            existing = gaps_path.read_text(encoding="utf-8")
            new_entries = []
            for name, count in sorted(unknown.items(), key=lambda x: -x[1])[:20]:
                if name not in existing:
                    new_entries.append(
                        f"- **{name}** — unknown attendee in {count} meetings "
                        f"(detected {date.today().isoformat()} by hygiene)"
                    )
            if new_entries:
                with open(gaps_path, "a", encoding="utf-8") as f:
                    f.write("\n" + "\n".join(new_entries) + "\n")

        report["stats"]["unknown_attendees"] = len(unknown)
        top = sorted(unknown.items(), key=lambda x: -x[1])[:10]
        desc = ", ".join(f"{n} ({c}x)" for n, c in top)
        add_finding(report, "review", "meeting-unknown-attendees", "vault",
                    f"{len(unknown)} unknown attendees. Top: {desc}")


def check_meeting_tags(index, valid_tags, report, suppressions, dry_run):
    """Tags not in Tag Registry."""
    report["checks_run"] += 1
    valid = valid_tags.get("all", set())
    if not valid:
        return
    fixed = 0
    for cat in ("meetings", "transcripts"):
        for path, fm in index[cat].items():
            tags = fm.get("tags", []) or []
            if isinstance(tags, str):
                tags = [tags]
            invalid = [t for t in tags if t and t not in valid]
            if invalid:
                cleaned = [t for t in tags if t in valid]
                if apply_frontmatter_fix(path, {"tags": cleaned}, dry_run):
                    fixed += 1
                elif dry_run:
                    fixed += 1
    if fixed:
        add_finding(report, "auto-fix", "meeting-tags", "vault",
                    f"Cleaned invalid tags in {fixed} notes")


def check_meeting_workstreams(index, report, suppressions):
    """Meetings with no workstreams assigned."""
    report["checks_run"] += 1
    count = 0
    for path, fm in index["meetings"].items():
        ws = fm.get("workstreams", []) or []
        if not ws:
            count += 1
    if count:
        add_finding(report, "review", "meeting-workstreams", "vault",
                    f"{count} meetings with no workstreams assigned")
    report["stats"]["meetings_no_workstreams"] = count


def check_transcript_unresolved(index, report, suppressions):
    """Transcripts with Speaker N in attendees."""
    report["checks_run"] += 1
    speaker_re = re.compile(r"^Speaker \d+$")
    unresolved = []
    total_speakers = 0
    resolved_speakers = 0

    for path, fm in index["transcripts"].items():
        attendees = fm.get("attendees", []) or []
        has_unresolved = False
        for att in attendees:
            total_speakers += 1
            if speaker_re.match(att):
                has_unresolved = True
            else:
                resolved_speakers += 1
        if has_unresolved:
            unresolved.append(path.stem)

    report["stats"]["speaker_resolution_rate"] = (
        f"{resolved_speakers}/{total_speakers}"
        if total_speakers else "N/A"
    )
    if unresolved:
        add_finding(report, "review", "transcript-unresolved", "vault",
                    f"{len(unresolved)} transcripts with unresolved speakers",
                    "Re-run speaker resolver with latest calendar data")


# ── Cross-Reference Checks ──────────────────────────────────────────────────

def check_crossref_broken_links(index, report, suppressions, dry_run):
    """Broken calendar-event wikilinks."""
    report["checks_run"] += 1
    fixed = 0
    for cat in ("meetings", "transcripts"):
        for path, fm in index[cat].items():
            cal = fm.get("calendar-event", "")
            if not cal:
                continue
            # Extract path from wikilink: "[[Solera/Calendar/2026-03-25 1000 - CRM.md]]"
            cal_clean = cal.strip("\"'[]")
            cal_path = path.parent.parent.parent / cal_clean
            if not cal_clean:
                continue
            # Try a few resolution strategies
            found = False
            for candidate in [
                path.parent.parent.parent / cal_clean,
                path.parent.parent.parent / (cal_clean + ".md"),
            ]:
                if candidate.exists():
                    found = True
                    break
            if not found:
                if apply_frontmatter_fix(path, {"calendar-event": ""}, dry_run):
                    fixed += 1
                elif dry_run:
                    fixed += 1
    if fixed:
        add_finding(report, "auto-fix", "crossref-broken-links", "vault",
                    f"Cleared {fixed} broken calendar-event links")


def check_crossref_speaker_sync(index, report, suppressions, dry_run):
    """Speaker-map resolved names not in attendees."""
    report["checks_run"] += 1
    fixed = 0
    for path, fm in index["transcripts"].items():
        speaker_map = fm.get("speaker-map")
        if not speaker_map or not isinstance(speaker_map, dict):
            continue
        attendees = list(fm.get("attendees", []) or [])
        attendees_lower = {a.lower() for a in attendees}
        added = []
        for speaker, info in speaker_map.items():
            name = ""
            if isinstance(info, dict):
                name = info.get("name", "")
            elif isinstance(info, str):
                name = info
            if name and name.lower() not in attendees_lower:
                added.append(name)
                attendees.append(name)
                attendees_lower.add(name.lower())

        if added:
            if apply_frontmatter_fix(path, {"attendees": attendees}, dry_run):
                fixed += 1
            elif dry_run:
                fixed += 1
    if fixed:
        add_finding(report, "auto-fix", "crossref-speaker-sync", "vault",
                    f"Synced speaker-map names to attendees in {fixed} transcripts")


# ── Type & Tag Governance ────────────────────────────────────────────────────

def check_invalid_types(index, report, suppressions, dry_run):
    """type field not in VALID_TYPES."""
    report["checks_run"] += 1
    fixed = 0
    for cat in ("people", "projects", "meetings", "transcripts", "calendar", "chats"):
        for path, fm in index[cat].items():
            note_type = fm.get("type", "")
            if note_type and note_type not in VALID_TYPES:
                # Attempt auto-fix based on category
                correct = {
                    "people": "person", "projects": "project",
                    "meetings": "meeting-summary", "transcripts": "transcript",
                    "calendar": "calendar-event", "chats": "chat",
                }.get(cat, "")
                if correct:
                    verified = set(fm.get("verified-fields", []) or [])
                    if "type" not in verified:
                        if apply_frontmatter_fix(path, {"type": correct}, dry_run):
                            fixed += 1
                        elif dry_run:
                            fixed += 1
    if fixed:
        add_finding(report, "auto-fix", "invalid-types", "vault",
                    f"Fixed invalid type values in {fixed} notes")


# ── Report Generator ─────────────────────────────────────────────────────────

def generate_report(report, vault_root, dry_run, duration_s) -> str:
    """Generate markdown report and return summary string."""
    today = date.today().isoformat()
    summary = (
        f"{report['auto_fixes']} auto-fixes, "
        f"{report['review_items']} review items"
    )

    # Health metrics
    people_count = report["stats"].get("people_count", 0)
    meeting_count = report["stats"].get("meeting_count", 0)
    transcript_count = report["stats"].get("transcript_count", 0)

    lines = [
        "---",
        "type: hygiene-report",
        f"date: {today}",
        f'run-duration: "{duration_s:.1f}s"',
        f"checks-run: {report['checks_run']}",
        f"auto-fixes-applied: {report['auto_fixes']}",
        f"review-items: {report['review_items']}",
        "---",
        "",
        f"# Vault Hygiene Report — {today}",
        "",
        "## Summary",
        "",
        f"| Metric | Value |",
        f"|--------|-------|",
        f"| Checks run | {report['checks_run']} |",
        f"| Auto-fixes applied | {report['auto_fixes']} |",
        f"| Review items | {report['review_items']} |",
        f"| Informational | {report['info_items']} |",
        f"| Errors | {len(report['errors'])} |",
        "",
    ]

    if report["auto_fix_details"]:
        lines.append("## Auto-fixes Applied")
        lines.append("")
        for f in report["auto_fix_details"]:
            lines.append(f"- **{f['check']}** — {f['target']}: {f['description']}")
        lines.append("")

    if report["review_details"]:
        lines.append("## Review Queue")
        lines.append("")
        for f in report["review_details"]:
            line = f"- **{f['check']}** — {f['target']}: {f['description']}"
            if f.get("suggestion"):
                line += f" → _{f['suggestion']}_"
            lines.append(line)
        lines.append("")

    if report["info_details"]:
        lines.append("## Statistics")
        lines.append("")
        for f in report["info_details"]:
            lines.append(f"- {f['description']}")
        lines.append("")

    # Health metrics table
    lines.append("## Health Metrics")
    lines.append("")
    lines.append("| Metric | Value |")
    lines.append("|--------|-------|")
    lines.append(f"| People notes | {people_count} |")
    lines.append(f"| Meeting notes | {meeting_count} |")
    lines.append(f"| Transcripts | {transcript_count} |")
    lines.append(f"| Speaker resolution | {report['stats'].get('speaker_resolution_rate', 'N/A')} |")
    lines.append(f"| Dedup candidates | {report['stats'].get('dedup_candidates', 0)} |")
    lines.append(f"| Unknown attendees | {report['stats'].get('unknown_attendees', 0)} |")
    lines.append(f"| Stale people (>180d) | {report['stats'].get('people_stale_count', 0)} |")
    lines.append(f"| Orphan people | {report['stats'].get('people_orphan_count', 0)} |")
    lines.append(f"| Meetings w/o workstreams | {report['stats'].get('meetings_no_workstreams', 0)} |")
    lines.append("")

    report_text = "\n".join(lines)

    if not dry_run:
        report_dir = vault_root / "Archivista" / "Reports"
        report_dir.mkdir(parents=True, exist_ok=True)
        report_path = report_dir / f"{today}-hygiene.md"
        tmp = report_path.with_suffix(".tmp")
        tmp.write_text(report_text, encoding="utf-8")
        tmp.replace(report_path)

    return summary


def print_report(report, summary):
    """Print to stdout following processor convention."""
    print(f"\n=== Vault Hygiene Report ===")
    print(f"Checks run:    {report['checks_run']}")
    print(f"Auto-fixes:    {report['auto_fixes']}")
    print(f"Review items:  {report['review_items']}")
    print(f"Informational: {report['info_items']}")
    print(f"Errors:        {len(report['errors'])}")

    if report["auto_fix_details"]:
        print(f"\nAuto-fixes ({report['auto_fixes']}):")
        for f in report["auto_fix_details"]:
            print(f"  {f['check']}: {f['description']}")

    if report["review_details"]:
        print(f"\nReview queue ({report['review_items']}):")
        for f in report["review_details"][:20]:
            print(f"  {f['check']}: {f['description']}")
        if len(report["review_details"]) > 20:
            print(f"  ... and {len(report['review_details']) - 20} more")

    print(f"\nSummary: {summary}")


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Vault hygiene — systematic data quality checks",
    )
    parser.add_argument(
        "--vault-root", type=Path,
        default=Path.home() / "Vaults" / "My Notes",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-ai", action="store_true", help="Skip AI dedup calls")
    parser.add_argument(
        "--checks", type=str, default="",
        help="Comma-separated check names to run (default: all)",
    )
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

    if args.dry_run:
        print("DRY RUN — no files will be modified")

    start = time.time()

    # Determine which checks to run
    checks = set()
    if args.checks:
        checks = {c.strip() for c in args.checks.split(",")}
        invalid = checks - set(ALL_CHECKS)
        if invalid:
            print(f"Unknown checks: {invalid}", file=sys.stderr)
            sys.exit(1)

    def should_run(name):
        return not checks or name in checks

    # Build index
    print("Building vault index...")
    index = build_vault_index(vault_root)
    print(f"  People: {len(index['people'])}")
    print(f"  Meetings: {len(index['meetings'])}")
    print(f"  Transcripts: {len(index['transcripts'])}")
    print(f"  Calendar: {len(index['calendar'])}")
    print(f"  Chats: {len(index['chats'])}")
    print(f"  Projects: {len(index['projects'])}")

    suppressions = load_suppressions(vault_root)
    ensure_suppressions_file(vault_root, args.dry_run)
    valid_tags = parse_tag_registry(vault_root)
    report = new_report()
    report["stats"]["people_count"] = len(index["people"])
    report["stats"]["meeting_count"] = len(index["meetings"])
    report["stats"]["transcript_count"] = len(index["transcripts"])

    # ── Run checks ───────────────────────────────────────────────────────
    # People
    if should_run("people-schema"):
        check_people_schema(index, report, suppressions, args.dry_run)
    if should_run("people-email"):
        check_people_email_uniqueness(index, report, suppressions)
    if should_run("people-alias-collision"):
        check_people_alias_collisions(index, report, suppressions)
    if should_run("people-name-norm"):
        check_people_name_normalization(index, report, suppressions, args.dry_run)
    if should_run("people-stale"):
        check_people_stale(index, report, suppressions)
    if should_run("people-orphan"):
        check_people_orphan(index, report, suppressions)
    if should_run("people-dedup"):
        check_people_dedup(index, report, vault_root, suppressions, args.no_ai)

    # Projects
    if should_run("project-metadata"):
        check_project_metadata(index, report, suppressions)
    if should_run("project-stale"):
        check_project_stale(index, report, suppressions)
    if should_run("project-workstreams"):
        check_project_workstreams(index, valid_tags, report, suppressions, args.dry_run)

    # Meetings / Transcripts
    if should_run("meeting-unknown-attendees"):
        check_meeting_unknown_attendees(index, report, vault_root, suppressions, args.dry_run)
    if should_run("meeting-tags"):
        check_meeting_tags(index, valid_tags, report, suppressions, args.dry_run)
    if should_run("meeting-workstreams"):
        check_meeting_workstreams(index, report, suppressions)
    if should_run("transcript-unresolved"):
        check_transcript_unresolved(index, report, suppressions)

    # Cross-reference
    if should_run("crossref-broken-links"):
        check_crossref_broken_links(index, report, suppressions, args.dry_run)
    if should_run("crossref-speaker-sync"):
        check_crossref_speaker_sync(index, report, suppressions, args.dry_run)

    # Schema / Governance
    if should_run("invalid-types"):
        check_invalid_types(index, report, suppressions, args.dry_run)

    duration = time.time() - start
    summary = generate_report(report, vault_root, args.dry_run, duration)
    print_report(report, summary)


if __name__ == "__main__":
    main()
