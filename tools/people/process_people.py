#!/usr/bin/env python3
"""People processor — reads Graph API harvest JSON and creates/updates vault People notes.

Usage: python process_people.py [--vault-root PATH] [--input PATH] [--dry-run]
"""

import argparse
import json
import re
import sys
from pathlib import Path

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

# ── Constants ────────────────────────────────────────────────────────────────

PEOPLE_DIRS = ["Solera/People", "Tandem/People", "CNPC/People"]

# Emails matching these patterns are skipped (DLs, system accounts, rooms)
SKIP_EMAIL_PATTERNS = [
    re.compile(r"^dl[-_]", re.I),
    re.compile(r"^noc@", re.I),
    re.compile(r"noreply", re.I),
    re.compile(r"^no[-_]?reply", re.I),
    re.compile(r"^room[-_.]", re.I),
    re.compile(r"^conf[-_.]", re.I),
    re.compile(r"^calendar[-_.]", re.I),
    re.compile(r"^svc[-_.]", re.I),
    re.compile(r"^admin@", re.I),
]

# jobTitle → level mapping (checked in order, first match wins)
LEVEL_PATTERNS = [
    (re.compile(r"\bC[A-Z]O\b"), "c-suite"),          # CAO, CFO, CTO, CEO
    (re.compile(r"\bChief\b", re.I), "c-suite"),
    (re.compile(r"\bSVP\b", re.I), "svp"),
    (re.compile(r"\bSenior Vice President\b", re.I), "svp"),
    (re.compile(r"\bVP\b", re.I), "vp"),
    (re.compile(r"\bVice President\b", re.I), "vp"),
    (re.compile(r"\bDirector\b", re.I), "director"),
    (re.compile(r"\bManager\b", re.I), "manager"),
    (re.compile(r"\bLead\b", re.I), "ic"),
    (re.compile(r"\bSenior\b", re.I), "ic"),
    (re.compile(r"\bPrincipal\b", re.I), "ic"),
]


# ── Name Processing ──────────────────────────────────────────────────────────

def invert_name(display_name: str) -> str:
    """Convert 'Last, First' or 'Last, First [Company]' to 'First Last'.

    Handles edge cases:
      'Norman II, Brocton' → 'Brocton Norman II'
      'Bikkumala, Manohar [Solera]' → 'Manohar Bikkumala'
      'De La Cruz, Maria' → 'Maria De La Cruz'
      'Alex Kudinov' → 'Alex Kudinov' (no comma = already correct)
      '' → ''
    """
    if not display_name:
        return ""
    # Strip company tag: [Solera], [Microsoft], etc.
    cleaned = re.sub(r"\s*\[[^\]]*\]\s*", " ", display_name).strip()
    if "," not in cleaned:
        return cleaned
    parts = cleaned.split(",", 1)
    last = parts[0].strip()
    first = parts[1].strip()
    if not first:
        return last
    return f"{first} {last}"


def infer_level(job_title: str) -> str:
    """Infer organizational level from job title. Returns level or ''."""
    if not job_title:
        return ""
    for pattern, level in LEVEL_PATTERNS:
        if pattern.search(job_title):
            return level
    return "ic"


def should_skip_email(email: str) -> bool:
    """Return True if email is a DL, system account, or non-person."""
    local = email.split("@")[0] if "@" in email else email
    for pattern in SKIP_EMAIL_PATTERNS:
        if pattern.search(local) or pattern.search(email):
            return True
    return False


# ── Frontmatter Parsing ──────────────────────────────────────────────────────

def parse_frontmatter(path: Path) -> dict | None:
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
        except yaml.YAMLError:
            return None
    return _parse_frontmatter_regex(block)


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


# ── People Index ─────────────────────────────────────────────────────────────

def build_people_index(vault_root: Path) -> dict:
    """Build indexes for matching harvest records to existing People notes.

    Returns dict with:
      'by_email': {email: path}
      'by_name': {lowered_name: path}
      'frontmatter': {path: fm_dict}
    """
    index = {"by_email": {}, "by_name": {}, "frontmatter": {}}
    for people_dir_rel in PEOPLE_DIRS:
        people_dir = vault_root / people_dir_rel
        if not people_dir.is_dir():
            continue
        for md_file in people_dir.glob("*.md"):
            fm = parse_frontmatter(md_file)
            if not fm:
                continue
            index["frontmatter"][md_file] = fm
            name = fm.get("name", "")
            if name:
                index["by_name"][name.lower()] = md_file
            for alias in fm.get("aliases", []) or []:
                if alias:
                    index["by_name"][alias.lower()] = md_file
            email = fm.get("email", "")
            if email:
                index["by_email"][email.lower()] = md_file
    return index


def find_existing_note(
    record: dict, index: dict,
) -> tuple[Path | None, dict | None]:
    """Match a harvest record to an existing People note.

    Match priority: email > name > alias.
    Returns (path, frontmatter) or (None, None).
    """
    email = record["mail"].lower()
    if email in index["by_email"]:
        path = index["by_email"][email]
        return path, index["frontmatter"].get(path, {})

    display = invert_name(record["displayName"])
    if display.lower() in index["by_name"]:
        path = index["by_name"][display.lower()]
        return path, index["frontmatter"].get(path, {})

    # First-name matching — only for upgrading first-name-only notes
    # Skip if the existing note's name looks like a DIFFERENT full name
    first_name = display.split()[0] if display else ""
    if first_name and first_name.lower() in index["by_name"]:
        path = index["by_name"][first_name.lower()]
        fm = index["frontmatter"].get(path)
        if fm:
            existing_name = fm.get("name", "")
            # Only match if existing note IS the first name only
            # (e.g., "Manohar" matches "Manohar Bikkumala")
            # Don't match if existing note has a DIFFERENT full name
            # (e.g., "Alberto Cairo" should NOT match "Alberto Gonzalez")
            if existing_name.lower() == first_name.lower():
                return path, fm

    return None, None


# ── Note Updates ─────────────────────────────────────────────────────────────

def compute_updates(
    record: dict, existing_fm: dict | None,
) -> dict:
    """Compute field updates for a People note from a harvest record.

    Respects verified-fields — never overwrites them.
    Returns dict of {field: new_value} to apply.
    """
    display = invert_name(record["displayName"])
    manager_name = invert_name(record.get("managerName", ""))
    level = infer_level(record.get("jobTitle", ""))

    # Graph-sourced fields
    graph_fields = {
        "email": record["mail"].lower(),
        "role": record.get("jobTitle", ""),
        "reports-to": manager_name,
        "level": level,
    }

    if not existing_fm:
        # New note — apply everything
        return graph_fields

    # Existing note — respect verified-fields
    verified = set(existing_fm.get("verified-fields", []) or [])
    updates = {}
    for field, value in graph_fields.items():
        if field in verified:
            continue  # protected
        if not value:
            continue  # don't overwrite with empty
        current = existing_fm.get(field, "")
        if current != value:
            updates[field] = value

    # Upgrade first-name-only notes to full name
    if "name" not in verified and display:
        current_name = existing_fm.get("name", "")
        if current_name and current_name != display:
            # Only upgrade if current name is shorter (first-name-only or partial)
            # and the Graph name contains the current name
            if (len(current_name) < len(display)
                    and current_name.lower() in display.lower()):
                updates["name"] = display
                updates["_old_name"] = current_name  # signal to rename file + add alias
                # Add old name to aliases if not already there
                existing_aliases = list(existing_fm.get("aliases", []) or [])
                if current_name not in existing_aliases:
                    existing_aliases.append(current_name)
                    updates["aliases"] = existing_aliases

    return updates


def apply_updates_to_file(
    path: Path, updates: dict, existing_fm: dict,
) -> Path:
    """Apply field updates to an existing People note's frontmatter.
    Returns the (possibly new) path after rename."""
    if not updates:
        return path
    if not path.exists():
        return path
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return path
    end = text.find("\n---", 3)
    if end < 0:
        return path

    fm_block = text[4:end]
    body = text[end + 4:]  # skip \n---

    old_name = updates.pop("_old_name", None)

    for field, value in updates.items():
        pattern = re.compile(rf"^{re.escape(field)}:.*$", re.MULTILINE)
        formatted = _format_field(field, value)
        if pattern.search(fm_block):
            fm_block = pattern.sub(formatted, fm_block)
        else:
            tags_match = re.search(r"^tags:.*$", fm_block, re.MULTILINE)
            if tags_match:
                fm_block = (
                    fm_block[:tags_match.start()]
                    + formatted + "\n"
                    + fm_block[tags_match.start():]
                )
            else:
                fm_block = fm_block.rstrip() + "\n" + formatted

    # Update body heading if name changed
    new_name = updates.get("name")
    if new_name and old_name:
        body = body.replace(f"# {old_name}", f"# {new_name}", 1)
        body = body.replace(f"**Role:** {old_name}", f"**Role:** {new_name}")

    new_text = "---\n" + fm_block + "\n---" + body
    path.write_text(new_text, encoding="utf-8")

    # Rename file if name changed
    if new_name and old_name:
        safe_new = re.sub(r'[/:\\*?"<>|]', "-", new_name)
        new_path = path.parent / f"{safe_new}.md"
        if not new_path.exists() and new_path != path:
            path.rename(new_path)
            return new_path

    return path


def _format_field(field: str, value) -> str:
    """Format a single frontmatter field."""
    if isinstance(value, bool):
        return f"{field}: {'true' if value else 'false'}"
    if isinstance(value, list):
        if not value:
            return f"{field}: []"
        items = ", ".join(str(v) for v in value)
        return f"{field}: [{items}]"
    # Quote strings that contain special YAML chars
    if any(c in str(value) for c in ":#{}[]|>&*!%@"):
        return f'{field}: "{value}"'
    return f"{field}: {value}"


def create_new_note(
    record: dict, vault_root: Path,
) -> Path:
    """Create a new People note from a harvest record."""
    display = invert_name(record["displayName"])
    manager_name = invert_name(record.get("managerName", ""))
    level = infer_level(record.get("jobTitle", ""))
    email = record["mail"].lower()

    # Determine filename — use full display name
    safe_name = re.sub(r'[/:\\*?"<>|]', "-", display)
    filename = f"{safe_name}.md"
    dest_dir = vault_root / "Solera" / "People"
    dest_dir.mkdir(parents=True, exist_ok=True)
    out_path = dest_dir / filename

    # Don't overwrite if file exists (could be a collision)
    if out_path.exists():
        return out_path

    # Build aliases — include first name if full name is different
    first_name = display.split()[0] if display else ""
    aliases = []
    if first_name and first_name != display:
        aliases.append(first_name)

    lines = ["---"]
    lines.append(f"name: {display}")
    lines.append(f"email: {email}")
    if record.get("jobTitle"):
        lines.append(f'role: "{record["jobTitle"]}"')
    lines.append("domain: solera")
    if aliases:
        lines.append(f"aliases: [{', '.join(aliases)}]")
    else:
        lines.append("aliases: []")
    if manager_name:
        lines.append(f"reports-to: {manager_name}")
    if level:
        lines.append(f"level: {level}")
    lines.append("tags: [solera]")
    lines.append("---")
    lines.append("")
    lines.append(f"# {display}")
    lines.append("")
    if record.get("jobTitle"):
        lines.append(f"**Role:** {record['jobTitle']}")
    if record.get("officeLocation"):
        lines.append(f"**Location:** {record['officeLocation']}")
    lines.append("")
    lines.append("## Meetings")
    lines.append("")
    lines.append("```dataview")
    lines.append("TABLE WITHOUT ID")
    lines.append('  file.link AS "Meeting",')
    lines.append('  dateformat(date, "yyyy-MM-dd") AS "Date",')
    lines.append('  meeting-type AS "Type"')
    lines.append('FROM "Solera" OR "Tandem" OR "CNPC" OR "Transcripts"')
    lines.append('WHERE (type = "meeting-summary" OR type = "transcript")')
    lines.append("  AND (contains(attendees, this.name)")
    lines.append('       OR any(this.aliases, (a) => contains(attendees, a)))')
    lines.append("SORT date DESC")
    lines.append("LIMIT 50")
    lines.append("```")

    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return out_path


# ── Processing Pipeline ──────────────────────────────────────────────────────

def load_harvest(path: Path) -> dict:
    """Load people.json harvest file."""
    return json.loads(path.read_text(encoding="utf-8"))


def process_harvest(
    harvest: dict, vault_root: Path, dry_run: bool = False,
) -> dict:
    """Process all people from a harvest file. Returns report."""
    report = {
        "total": len(harvest.get("people", [])),
        "internal": 0,
        "external": 0,
        "skipped_dl": 0,
        "matched": 0,
        "created": 0,
        "updated": 0,
        "unchanged": 0,
        "matched_details": [],
        "created_details": [],
        "updated_details": [],
        "skipped_verified": [],
    }

    index = build_people_index(vault_root)
    print(f"People index: {len(index['by_name'])} names, "
          f"{len(index['by_email'])} emails")

    for record in harvest.get("people", []):
        _process_one(record, vault_root, index, report, dry_run)

    return report


def _process_one(
    record: dict, vault_root: Path, index: dict,
    report: dict, dry_run: bool,
) -> None:
    """Process a single person record."""
    email = record.get("mail", "").strip()
    if not email:
        return

    if record["source"] == "external":
        report["external"] += 1
        return

    report["internal"] += 1

    if should_skip_email(email):
        report["skipped_dl"] += 1
        return

    display = invert_name(record["displayName"])
    path, existing_fm = find_existing_note(record, index)

    if path:
        report["matched"] += 1
        updates = compute_updates(record, existing_fm)
        if updates:
            report["updated"] += 1
            visible_fields = [k for k in updates.keys() if not k.startswith("_")]
            report["updated_details"].append(
                (display, email, visible_fields)
            )
            if not dry_run:
                new_path = apply_updates_to_file(path, updates, existing_fm)
                # Update index with possibly new path and new name
                index["by_email"][email.lower()] = new_path
                if "name" in updates:
                    index["by_name"][updates["name"].lower()] = new_path
                    new_fm = parse_frontmatter(new_path) or {}
                    index["frontmatter"][new_path] = new_fm
        else:
            report["unchanged"] += 1
            report["matched_details"].append((display, email, str(path)))
    else:
        report["created"] += 1
        report["created_details"].append((display, email))
        if not dry_run:
            new_path = create_new_note(record, vault_root)
            # Register in index to prevent duplicate creation
            new_fm = parse_frontmatter(new_path) or {}
            index["by_name"][display.lower()] = new_path
            index["by_email"][email.lower()] = new_path
            index["frontmatter"][new_path] = new_fm
            first_name = display.split()[0] if display else ""
            if first_name:
                if first_name.lower() not in index["by_name"]:
                    index["by_name"][first_name.lower()] = new_path


# ── Report ───────────────────────────────────────────────────────────────────

def print_report(report: dict) -> None:
    """Print processing summary."""
    print(f"\n=== People Processing Report ===")
    print(f"Total records: {report['total']}")
    print(f"  Internal:    {report['internal']}")
    print(f"  External:    {report['external']} (skipped)")
    print(f"  DL/system:   {report['skipped_dl']} (skipped)")
    print(f"  Matched:     {report['matched']}")
    print(f"    Updated:   {report['updated']}")
    print(f"    Unchanged: {report['unchanged']}")
    print(f"  Created:     {report['created']}")

    if report["updated_details"]:
        print(f"\nUpdated ({len(report['updated_details'])}):")
        for name, email, fields in report["updated_details"]:
            print(f"  {name} ({email}): {', '.join(fields)}")

    if report["created_details"]:
        print(f"\nCreated ({len(report['created_details'])}):")
        for name, email in report["created_details"][:20]:
            print(f"  {name} ({email})")
        if len(report["created_details"]) > 20:
            print(f"  ... and {len(report['created_details']) - 20} more")


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Process people harvest JSON into vault People notes",
    )
    parser.add_argument(
        "--vault-root",
        type=Path,
        default=Path.home() / "Vaults" / "My Notes",
        help="Vault root path (default: ~/Vaults/My Notes)",
    )
    parser.add_argument(
        "--input",
        type=Path,
        help="Path to people.json (default: Intake/People/people.json)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without writing files",
    )
    args = parser.parse_args()

    vault_root = args.vault_root.expanduser().resolve()
    if not vault_root.is_dir():
        print(f"Error: vault root not found: {vault_root}", file=sys.stderr)
        sys.exit(1)

    input_path = args.input
    if not input_path:
        input_path = vault_root / "Intake" / "People" / "people.json"
    input_path = input_path.expanduser().resolve()

    if not input_path.exists():
        print(f"Error: input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Processing: {input_path}")
    print(f"Vault root: {vault_root}")
    if args.dry_run:
        print("DRY RUN — no files will be modified")

    harvest = load_harvest(input_path)
    print(f"Harvest: {harvest.get('total_people', '?')} people, "
          f"exported {harvest.get('export_timestamp', '?')}")

    report = process_harvest(harvest, vault_root, dry_run=args.dry_run)
    print_report(report)


if __name__ == "__main__":
    main()
