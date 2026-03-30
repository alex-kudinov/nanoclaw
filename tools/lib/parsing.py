#!/usr/bin/env python3
"""Shared parsing utilities for NanoClaw processing pipelines.

Extracted from process_chat.py + new email-specific utilities.
Provides: header parsing, HTML stripping, People lookup, filename sanitization.
"""

import html
import re
from pathlib import Path

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

# ── Constants ────────────────────────────────────────────────────────────────

PEOPLE_DIRS = ["Solera/People", "Tandem/People", "CNPC/People"]
DOMAIN_DIRS = {
    "Solera/People": "solera",
    "Tandem/People": "tandem",
    "CNPC/People": "cnpc",
}
DOMAIN_PRIORITY = {"solera": 3, "tandem": 2, "cnpc": 1}
SANITIZE_RE = re.compile(r'[/:\\*?"<>|]')


def is_sync_conflict(path: Path) -> bool:
    """Return True if path is a Syncthing conflict file (should be skipped)."""
    return ".sync-conflict-" in path.name
AT_TAG_RE = re.compile(r'<at\s+id="[^"]*">([^<]*)</at>')
SPLIT_AT_RE = re.compile(
    r'<at\s+id="[^"]*">([^<]*),</at>\s*(?:&nbsp;)?\s*<at\s+id="[^"]*">([^<]*)</at>'
)


# ── Export Header ────────────────────────────────────────────────────────────

def parse_export_header(text: str) -> tuple[dict | None, str]:
    """Parse @@EXPORT_META header. Returns (meta_dict, remaining_text).
    Returns (None, full_text) if no header found."""
    lines = text.split("\n")
    if not lines or lines[0].strip() != "@@EXPORT_META":
        return None, text
    end_idx = None
    for i, line in enumerate(lines):
        if line.strip() == "@@END_META":
            end_idx = i
            break
    if end_idx is None:
        return None, text
    meta = {}
    for line in lines[1:end_idx]:
        line = line.strip()
        if not line:
            continue
        colon = line.find(":")
        if colon < 0:
            continue
        key = line[:colon].strip()
        value = line[colon + 1:].strip()
        meta[key] = value
    remaining = lines[end_idx + 1:]
    if remaining and remaining[0].strip() == "":
        remaining = remaining[1:]
    return meta, "\n".join(remaining)


# ── HTML Stripping ───────────────────────────────────────────────────────────

def strip_html(text: str) -> str:
    """Strip HTML from a message/email body."""
    if not text:
        return ""
    text = SPLIT_AT_RE.sub(
        lambda m: f"{m.group(2).strip()} {m.group(1).strip().rstrip(',')}",
        text,
    )
    text = AT_TAG_RE.sub(lambda m: m.group(1).strip(), text)
    text = re.sub(r'<emoji[^>]*alt="([^"]*)"[^>]*>', r'\1', text)
    text = re.sub(r'<emoji[^>]*>', '', text)
    text = re.sub(
        r'<a[^>]*href="[^"]*?([^/"]+\.(?:xlsx|pdf|docx|pptx|csv|zip))"[^>]*>.*?</a>',
        r'[attachment: \1]', text, flags=re.I | re.DOTALL,
    )
    text = re.sub(r'<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>', r'\2 (\1)', text, flags=re.DOTALL)
    text = re.sub(
        r'<img[^>]*alt="([^"]*)"[^>]*>',
        lambda m: f'[{m.group(1)}]' if m.group(1) != 'image' else '',
        text,
    )
    text = re.sub(r'<img[^>]*>', '', text)
    text = re.sub(r'<(?:p|br|li|div|tr|h[1-6])[^>]*/?>', '\n', text, flags=re.I)
    text = re.sub(r'</(?:p|li|div|tr|h[1-6])>', '\n', text, flags=re.I)
    text = re.sub(
        r'<(?:codeblock|code)>(.*?)</(?:codeblock|code)>',
        r'```\n\1\n```', text, flags=re.DOTALL,
    )
    text = re.sub(r'<[^>]+>', '', text)
    text = text.replace('&nbsp;', ' ')
    text = html.unescape(text)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    lines = [l.strip() for l in text.split('\n')]
    return '\n'.join(lines).strip()


# ── Frontmatter Parsing ─────────────────────────────────────────────────────

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


# ── People Lookup ────────────────────────────────────────────────────────────

def _scan_people_notes(vault_root: Path):
    """Yield (frontmatter_dict, domain) for all People notes.
    Shared helper — avoids double I/O between name and email lookups."""
    for people_dir_rel, domain in DOMAIN_DIRS.items():
        people_dir = vault_root / people_dir_rel
        if not people_dir.is_dir():
            continue
        for md_file in people_dir.glob("*.md"):
            if is_sync_conflict(md_file):
                continue
            fm = parse_frontmatter(md_file)
            if not fm:
                continue
            name = fm.get("name", "")
            if not name:
                continue
            yield fm, fm.get("domain", domain)


def build_people_lookup(vault_root: Path) -> tuple[dict, dict]:
    """Build name->canonical and name->domain lookup from People notes.
    Returns 2-tuple: (name_lookup, domain_lookup)."""
    name_lookup: dict[str, str] = {}
    domain_lookup: dict[str, str] = {}
    for fm, person_domain in _scan_people_notes(vault_root):
        name = fm["name"]
        domain_lookup[name] = person_domain
        name_lookup[name.lower()] = name
        for alias in fm.get("aliases", []) or []:
            if alias:
                name_lookup[alias.lower()] = name
    return name_lookup, domain_lookup


def build_email_lookup(vault_root: Path) -> dict:
    """Build email_address -> person_name lookup from People notes.
    Uses email field from Person schema as strongest matching signal."""
    email_lookup: dict[str, str] = {}
    for fm, _ in _scan_people_notes(vault_root):
        email = fm.get("email", "")
        if email:
            email_lookup[email.lower()] = fm["name"]
    return email_lookup


# ── Filename Sanitization ────────────────────────────────────────────────────

def sanitize_filename(text: str) -> str:
    """Sanitize text for use as a filename.
    Strips unsafe chars and truncates at 200 chars."""
    safe = SANITIZE_RE.sub("-", text).strip()
    if not safe:
        safe = "Untitled"
    if len(safe) > 200:
        safe = safe[:200].rstrip("-").rstrip()
    return safe
