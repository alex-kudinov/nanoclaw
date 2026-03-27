#!/usr/bin/env python3
"""Calendar event processor — parses @@EXPORT_META exports into vault notes.

Usage: python process_calendar.py [--force EVENT_ID] [--vault-root PATH]
"""

import argparse
import html
import json
import re
import shutil
import sys
from collections import Counter
from datetime import datetime, date, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

# ── Constants ────────────────────────────────────────────────────────────────

CST = ZoneInfo("America/Chicago")
STALE_DAYS = 14
PEOPLE_DIRS = ["Solera/People", "Tandem/People", "CNPC/People"]
DOMAIN_DIRS = {"Solera/People": "solera", "Tandem/People": "tandem", "CNPC/People": "cnpc"}
DOMAIN_PRIORITY = {"solera": 3, "tandem": 2, "cnpc": 1}
DEST_MAP = {"solera": "Solera/Calendar", "tandem": "Tandem/Calendar", "cnpc": "CNPC/Calendar"}
REQUIRED_FIELDS = {"event_id", "subject", "start_time", "end_time"}
SANITIZE_RE = re.compile(r'[/:\\*?"<>|]')
HTML_TAG_RE = re.compile(r"<[^>]+>")


# ── Header Parsing ───────────────────────────────────────────────────────────

def parse_export_file(path: Path) -> tuple[dict, str]:
    """Parse @@EXPORT_META header and body text. Returns (meta, body)."""
    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")
    if not lines or lines[0].strip() != "@@EXPORT_META":
        raise ValueError("First line must be @@EXPORT_META")
    end_idx = _find_end_meta(lines)
    meta = _parse_meta_lines(lines[1:end_idx])
    body = _extract_body(lines, end_idx)
    return meta, body


def _find_end_meta(lines: list[str]) -> int:
    """Return index of @@END_META line, or raise."""
    for i, line in enumerate(lines):
        if line.strip() == "@@END_META":
            return i
    raise ValueError("@@END_META not found")


def _parse_meta_lines(lines: list[str]) -> dict:
    """Parse key: value pairs from meta block lines."""
    meta = {}
    for line in lines:
        line = line.strip()
        if not line:
            continue
        colon = line.find(":")
        if colon < 0:
            continue
        key = line[:colon].strip()
        value = line[colon + 1:].strip()
        meta[key] = value
    return meta


def _extract_body(lines: list[str], end_idx: int) -> str:
    """Extract body text after @@END_META, skipping one blank line."""
    remaining = lines[end_idx + 1:]
    if remaining and remaining[0].strip() == "":
        remaining = remaining[1:]
    return "\n".join(remaining).strip()


# ── Validation ───────────────────────────────────────────────────────────────

def validate_meta(meta: dict) -> list[str]:
    """Return list of validation errors (empty = valid)."""
    errors = []
    for field in REQUIRED_FIELDS:
        if not meta.get(field):
            errors.append(f"Missing required field: {field}")
    for tf in ("start_time", "end_time"):
        if meta.get(tf):
            try:
                datetime.fromisoformat(meta[tf])
            except ValueError:
                errors.append(f"Unparseable ISO 8601: {tf}={meta[tf]}")
    return errors


# ── HTML Stripping ───────────────────────────────────────────────────────────

def strip_html(text: str) -> str:
    """Remove HTML tags, decode entities, collapse whitespace."""
    # Insert newlines before block-level elements
    text = re.sub(r"<(?:p|br|li|div|tr|h[1-6])[^>]*>", "\n", text, flags=re.I)
    text = HTML_TAG_RE.sub("", text)
    text = html.unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ── Timezone ─────────────────────────────────────────────────────────────────

def utc_to_cst(iso_str: str) -> datetime:
    """Parse UTC ISO 8601 string and convert to America/Chicago."""
    dt = datetime.fromisoformat(iso_str)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(CST)


def format_cst(dt: datetime) -> str:
    """Format datetime with CST offset (zoneinfo handles DST)."""
    return dt.strftime("%Y-%m-%dT%H:%M:%S") + _offset_str(dt)


def _offset_str(dt: datetime) -> str:
    """Return UTC offset string like -05:00 or -06:00."""
    offset = dt.utcoffset()
    total_seconds = int(offset.total_seconds())
    sign = "+" if total_seconds >= 0 else "-"
    total_seconds = abs(total_seconds)
    hours, remainder = divmod(total_seconds, 3600)
    minutes = remainder // 60
    return f"{sign}{hours:02d}:{minutes:02d}"


# ── People Lookup ────────────────────────────────────────────────────────────

def build_people_lookup(vault_root: Path) -> tuple[dict, dict]:
    """Build name->canonical and name->domain lookup from People notes.

    Returns (name_lookup, domain_lookup) where:
      name_lookup[lowered_name] = canonical_name
      domain_lookup[canonical_name] = domain
    """
    name_lookup: dict[str, str] = {}
    domain_lookup: dict[str, str] = {}
    for people_dir_rel, domain in DOMAIN_DIRS.items():
        people_dir = vault_root / people_dir_rel
        if not people_dir.is_dir():
            continue
        for md_file in people_dir.glob("*.md"):
            _index_person(md_file, domain, name_lookup, domain_lookup)
    return name_lookup, domain_lookup


def _index_person(
    path: Path, domain: str,
    name_lookup: dict, domain_lookup: dict,
) -> None:
    """Parse one People note and register name + aliases."""
    fm = _parse_frontmatter(path)
    if not fm:
        return
    name = fm.get("name", "")
    if not name:
        return
    person_domain = fm.get("domain", domain)
    domain_lookup[name] = person_domain
    name_lookup[name.lower()] = name
    for alias in fm.get("aliases", []) or []:
        if alias:
            name_lookup[alias.lower()] = name


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
        return _parse_yaml(block)
    return _parse_frontmatter_regex(block)


def _parse_yaml(block: str) -> dict | None:
    """Parse YAML block with PyYAML."""
    try:
        return yaml.safe_load(block) or {}
    except yaml.YAMLError:
        return None


def _parse_frontmatter_regex(block: str) -> dict:
    """Fallback frontmatter parser when PyYAML unavailable."""
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
            result[key] = [
                s.strip().strip("\"'")
                for s in items.split(",") if s.strip()
            ]
        elif val.lower() in ("true", "false"):
            result[key] = val.lower() == "true"
        else:
            result[key] = val.strip("\"'")
    return result


# ── Attendee Resolution ──────────────────────────────────────────────────────

def resolve_attendees(
    raw: str, name_lookup: dict,
) -> tuple[list[str], list[str], list[str]]:
    """Resolve comma-separated attendee string.

    Returns (all_names, matched, unmatched) with canonical names for matches.
    """
    if not raw.strip():
        return [], [], []
    names = [n.strip() for n in raw.split(",") if n.strip()]
    resolved = []
    matched = []
    unmatched = []
    for name in names:
        canonical = name_lookup.get(name.lower())
        if canonical:
            resolved.append(canonical)
            matched.append(canonical)
        else:
            resolved.append(name)
            unmatched.append(name)
    return resolved, matched, unmatched


def resolve_organizer(raw: str, name_lookup: dict) -> str:
    """Resolve organizer name against People lookup."""
    if not raw.strip():
        return ""
    return name_lookup.get(raw.strip().lower(), raw.strip())


# ── Domain Inference ─────────────────────────────────────────────────────────

def infer_domain(
    matched_names: list[str], domain_lookup: dict,
) -> tuple[str, str]:
    """Infer domain from matched attendees. Returns (domain, reason)."""
    if not matched_names:
        return "solera", "no matched attendees (default)"
    domains = [domain_lookup.get(n, "solera") for n in matched_names]
    counts = Counter(domains)
    if len(counts) == 1:
        d = domains[0]
        return d, f"all matched attendees are {d}"
    max_count = max(counts.values())
    top = [d for d, c in counts.items() if c == max_count]
    if len(top) == 1:
        return top[0], f"majority domain ({counts})"
    top.sort(key=lambda d: DOMAIN_PRIORITY.get(d, 0), reverse=True)
    return top[0], f"tie broken by priority ({counts})"


# ── Manifest ─────────────────────────────────────────────────────────────────

def load_manifest(vault_root: Path) -> dict:
    """Load calendar-manifest.json or return empty dict."""
    path = vault_root / "meta" / "calendar-manifest.json"
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_manifest(vault_root: Path, manifest: dict) -> None:
    """Write calendar-manifest.json atomically."""
    path = vault_root / "meta" / "calendar-manifest.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    tmp.replace(path)


def should_process(
    event_id: str, last_modified: str,
    manifest: dict, force_ids: set[str],
) -> str:
    """Return 'new', 'update', or 'skip'."""
    if event_id in force_ids:
        return "new"
    entry = manifest.get(event_id)
    if not entry:
        return "new"
    if last_modified <= entry.get("last_modified", ""):
        return "skip"
    return "update"


def find_stale_entries(manifest: dict) -> list[tuple[str, dict]]:
    """Return manifest entries not seen in 14+ days."""
    today = date.today()
    stale = []
    for eid, entry in manifest.items():
        last_seen_str = entry.get("last_seen", "")
        if not last_seen_str:
            continue
        try:
            last_seen = date.fromisoformat(last_seen_str)
        except ValueError:
            continue
        if (today - last_seen).days >= STALE_DAYS:
            stale.append((eid, entry))
    return stale


# ── Note Generation ──────────────────────────────────────────────────────────

def sanitize_subject(subject: str) -> str:
    """Replace invalid filename chars with hyphens."""
    return SANITIZE_RE.sub("-", subject).strip()


def build_filename(start_cst: datetime, subject: str) -> str:
    """Build vault note filename: YYYY-MM-DD HHMM - Subject.md"""
    date_str = start_cst.strftime("%Y-%m-%d")
    time_str = start_cst.strftime("%H%M")
    safe = sanitize_subject(subject)
    return f"{date_str} {time_str} - {safe}.md"


def build_frontmatter(
    meta: dict, attendees: list[str], organizer: str,
    start_cst: datetime, end_cst: datetime, domain: str,
) -> str:
    """Build YAML frontmatter string for calendar event note."""
    lines = ["---"]
    lines.append(f"date: {start_cst.strftime('%Y-%m-%d')}")
    lines.append("type: calendar-event")
    lines.append(f"domain: {domain}")
    lines.append(f'event-id: "{meta["event_id"]}"')
    lines.append(f'subject: "{_yaml_escape(meta["subject"])}"')
    lines.append(f'start-time: "{format_cst(start_cst)}"')
    lines.append(f'end-time: "{format_cst(end_cst)}"')
    lines.append(f"organizer: {organizer}")
    lines.append(_format_list("attendees", attendees))
    _add_optional(lines, "location", meta.get("location", ""))
    _add_optional_bool(lines, "is-online", meta.get("is_online", ""))
    _add_optional(lines, "online-meeting-url", meta.get("online_meeting_url", ""))
    _add_optional_bool(lines, "is-recurring", meta.get("is_recurring", ""))
    _add_optional(lines, "series-id", meta.get("series_id", ""))
    lines.append("meeting-type:")
    lines.append("workstreams: []")
    lines.append(f"tags: [{domain}]")
    lines.append("---")
    return "\n".join(lines)


def _yaml_escape(s: str) -> str:
    """Escape double quotes in a YAML string value."""
    return s.replace('"', '\\"')


def _format_list(key: str, items: list[str]) -> str:
    """Format a YAML list field."""
    if not items:
        return f"{key}: []"
    formatted = ", ".join(items)
    return f"{key}: [{formatted}]"


def _add_optional(lines: list, key: str, value: str) -> None:
    """Add a string field only if non-empty."""
    if value:
        lines.append(f'{key}: "{_yaml_escape(value)}"')


def _add_optional_bool(lines: list, key: str, value: str) -> None:
    """Add a boolean field only if truthy."""
    if isinstance(value, bool):
        if value:
            lines.append(f"{key}: true")
        return
    if isinstance(value, str) and value.strip().lower() == "true":
        lines.append(f"{key}: true")


def build_body(
    body_text: str, attendees: list[str],
    matched: list[str], organizer: str,
) -> str:
    """Build markdown body with Agenda, Attendees, Related sections."""
    parts = ["## Agenda", ""]
    if body_text:
        parts.append(strip_html(body_text))
    else:
        parts.append("_No agenda provided._")
    parts += ["", "## Attendees", ""]
    matched_set = set(matched)
    for name in attendees:
        label = _attendee_line(name, matched_set, organizer)
        parts.append(f"- {label}")
    parts += ["", "## Related", ""]
    parts.append("<!-- Links to matching meeting-summary, transcript, or chat notes -->")
    parts.append("<!-- Populated manually or by future automation -->")
    return "\n".join(parts)


def _attendee_line(
    name: str, matched_set: set[str], organizer: str,
) -> str:
    """Format one attendee line with wikilink/plain and organizer tag."""
    is_org = name.lower() == organizer.lower()
    if name in matched_set:
        label = f"[[{name}]]"
    else:
        label = f"{name} (unmatched)"
    if is_org:
        label += " (organizer)"
    return label


def write_vault_note(
    vault_root: Path, domain: str, filename: str,
    frontmatter: str, body: str,
) -> Path:
    """Write the calendar event note to the vault. Returns output path."""
    dest_dir = vault_root / DEST_MAP[domain]
    dest_dir.mkdir(parents=True, exist_ok=True)
    out_path = dest_dir / filename
    content = frontmatter + "\n\n" + body + "\n"
    out_path.write_text(content, encoding="utf-8")
    return out_path


# ── File Operations ──────────────────────────────────────────────────────────

def move_to_errors(
    path: Path, vault_root: Path, reason: str,
) -> None:
    """Move invalid file to errors dir and log reason."""
    errors_dir = vault_root / "Intake" / "Calendar" / "errors"
    errors_dir.mkdir(parents=True, exist_ok=True)
    dest = errors_dir / path.name
    dest = _unique_path(dest)
    shutil.move(str(path), str(dest))
    print(f"  ERROR: {path.name}: {reason}", file=sys.stderr)


def move_to_processed(path: Path, vault_root: Path) -> None:
    """Move processed file to Intake/Calendar/processed/."""
    proc_dir = vault_root / "Intake" / "Calendar" / "processed"
    proc_dir.mkdir(parents=True, exist_ok=True)
    dest = proc_dir / path.name
    dest = _unique_path(dest)
    shutil.move(str(path), str(dest))


def _unique_path(path: Path) -> Path:
    """Add numeric suffix if path already exists."""
    if not path.exists():
        return path
    stem, suffix = path.stem, path.suffix
    n = 1
    while path.exists():
        path = path.parent / f"{stem}_{n}{suffix}"
        n += 1
    return path


# ── Processing Pipeline ──────────────────────────────────────────────────────

def process_one(
    path: Path, vault_root: Path,
    name_lookup: dict, domain_lookup: dict,
    manifest: dict, force_ids: set[str],
    report: dict,
) -> None:
    """Process a single export file through the full pipeline."""
    result = _parse_and_validate(path, vault_root, report)
    if result is None:
        return
    meta, body_text = result

    event_id = meta["event_id"]
    action = should_process(
        event_id, meta.get("last_modified", ""), manifest, force_ids,
    )
    _touch_last_seen(event_id, action, manifest)

    if action == "skip":
        report["skipped"] += 1
        move_to_processed(path, vault_root)
        return

    _generate_note(
        meta, body_text, vault_root,
        name_lookup, domain_lookup,
        manifest, action, report,
    )
    move_to_processed(path, vault_root)


def _parse_and_validate(
    path: Path, vault_root: Path, report: dict,
) -> tuple[dict, str] | None:
    """Parse and validate an export file. Returns (meta, body) or None."""
    try:
        meta, body_text = parse_export_file(path)
    except ValueError as e:
        _record_error(path, vault_root, report, str(e))
        return None
    errors = validate_meta(meta)
    if errors:
        _record_error(path, vault_root, report, "; ".join(errors))
        return None
    return meta, body_text


def _record_error(
    path: Path, vault_root: Path, report: dict, reason: str,
) -> None:
    """Move file to errors and update report."""
    move_to_errors(path, vault_root, reason)
    report["errors"] += 1
    report["error_details"].append((path.name, reason))


def _touch_last_seen(
    event_id: str, action: str, manifest: dict,
) -> None:
    """Update last_seen for an event in the manifest."""
    today_str = date.today().isoformat()
    if event_id in manifest:
        manifest[event_id]["last_seen"] = today_str
    elif action == "skip":
        manifest[event_id] = {"last_seen": today_str}


def _generate_note(
    meta: dict, body_text: str, vault_root: Path,
    name_lookup: dict, domain_lookup: dict,
    manifest: dict, action: str, report: dict,
) -> None:
    """Generate vault note and update manifest entry."""
    attendees, matched, unmatched = resolve_attendees(
        meta.get("attendees", ""), name_lookup,
    )
    organizer = resolve_organizer(meta.get("organizer", ""), name_lookup)
    report["matched"].update(matched)
    report["unmatched"].update(unmatched)

    domain, domain_reason = infer_domain(matched, domain_lookup)
    report["domain_log"].append((meta["subject"], domain, domain_reason))

    start_cst = utc_to_cst(meta["start_time"])
    end_cst = utc_to_cst(meta["end_time"])
    out_path = _write_event_note(
        meta, body_text, attendees, matched, organizer,
        start_cst, end_cst, domain, vault_root,
    )
    _update_manifest_entry(meta, out_path, vault_root, manifest)
    report["processed" if action == "new" else "updated"] += 1


def _write_event_note(
    meta: dict, body_text: str,
    attendees: list[str], matched: list[str], organizer: str,
    start_cst: datetime, end_cst: datetime,
    domain: str, vault_root: Path,
) -> Path:
    """Build and write a calendar event note. Returns output path."""
    filename = build_filename(start_cst, meta["subject"])
    frontmatter = build_frontmatter(
        meta, attendees, organizer, start_cst, end_cst, domain,
    )
    body = build_body(body_text, attendees, matched, organizer)
    return write_vault_note(vault_root, domain, filename, frontmatter, body)


def _update_manifest_entry(
    meta: dict, out_path: Path, vault_root: Path, manifest: dict,
) -> None:
    """Write or overwrite a manifest entry for this event."""
    manifest[meta["event_id"]] = {
        "subject": meta["subject"],
        "start_time": meta["start_time"],
        "last_modified": meta.get("last_modified", ""),
        "last_seen": date.today().isoformat(),
        "output_path": str(out_path.relative_to(vault_root)),
    }


# ── Report ───────────────────────────────────────────────────────────────────

def print_report(report: dict, stale: list) -> None:
    """Print processing summary to stdout."""
    _print_counts(report)
    _print_name_list("Matched attendees", report["matched"])
    _print_name_list("Unmatched attendees", report["unmatched"])
    _print_domain_log(report["domain_log"])
    _print_error_details(report["error_details"])
    _print_stale(stale)


def _print_counts(report: dict) -> None:
    """Print count summary block."""
    total = sum(report[k] for k in ("processed", "updated", "skipped", "errors"))
    print(f"\n=== Calendar Processing Report ===")
    print(f"Total files: {total}")
    for label, key in [("New", "processed"), ("Updated", "updated"),
                       ("Skipped", "skipped"), ("Errors", "errors")]:
        print(f"  {label + ':':<9} {report[key]}")


def _print_name_list(heading: str, names: set) -> None:
    """Print a sorted set of names under a heading."""
    if not names:
        return
    print(f"\n{heading} ({len(names)}):")
    for name in sorted(names):
        print(f"  - {name}")


def _print_domain_log(log: list) -> None:
    """Print domain inference decisions."""
    if not log:
        return
    print(f"\nDomain inference:")
    for subj, dom, reason in log:
        print(f"  {subj} -> {dom} ({reason})")


def _print_error_details(details: list) -> None:
    """Print error detail lines."""
    if not details:
        return
    print(f"\nError details:")
    for fname, reason in details:
        print(f"  {fname}: {reason}")


def _print_stale(stale: list) -> None:
    """Print stale manifest entries."""
    if not stale:
        return
    print(f"\nStale manifest entries ({len(stale)}):")
    for eid, entry in stale:
        subj = entry.get("subject", "?")
        last = entry.get("last_seen", "?")
        print(f"  {subj} (last seen: {last})")


def new_report() -> dict:
    """Create a fresh report accumulator."""
    return {
        "processed": 0,
        "updated": 0,
        "skipped": 0,
        "errors": 0,
        "matched": set(),
        "unmatched": set(),
        "domain_log": [],
        "error_details": [],
    }


# ── Main ─────────────────────────────────────────────────────────────────────

def _collect_input_files(vault_root: Path) -> list[Path] | None:
    """Find .txt files in Intake/Calendar/. Returns None if nothing to do."""
    intake_dir = vault_root / "Intake" / "Calendar"
    if not intake_dir.is_dir():
        print(f"No intake directory: {intake_dir}")
        return None
    files = sorted(intake_dir.glob("*.txt"))
    if not files:
        print("No .txt files in Intake/Calendar/")
        return None
    print(f"Found {len(files)} export file(s)")
    return files


def run(vault_root: Path, force_ids: set[str]) -> None:
    """Run the full calendar processing pipeline."""
    input_files = _collect_input_files(vault_root)
    if not input_files:
        return

    name_lookup, domain_lookup = build_people_lookup(vault_root)
    print(f"People index: {len(name_lookup)} names across {len(domain_lookup)} people")

    manifest = load_manifest(vault_root)
    report = new_report()
    for path in input_files:
        process_one(
            path, vault_root, name_lookup, domain_lookup,
            manifest, force_ids, report,
        )
    save_manifest(vault_root, manifest)
    print_report(report, find_stale_entries(manifest))


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Process calendar event exports into vault notes",
    )
    parser.add_argument(
        "--vault-root",
        type=Path,
        default=Path.home() / "Vaults" / "My Notes",
        help="Vault root path (default: ~/Vaults/My Notes)",
    )
    parser.add_argument(
        "--force",
        dest="force_ids",
        action="append",
        default=[],
        help="Force reprocess specific event IDs (repeatable)",
    )
    args = parser.parse_args()

    vault_root = args.vault_root.expanduser().resolve()
    if not vault_root.is_dir():
        print(f"Error: vault root not found: {vault_root}", file=sys.stderr)
        sys.exit(1)

    force_ids = set(args.force_ids)
    run(vault_root, force_ids)


if __name__ == "__main__":
    main()
