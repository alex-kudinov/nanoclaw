#!/usr/bin/env python3
"""Email processor — parses email exports into vault Email Summary notes.

Full pipeline: parse header → check manifest → HTML strip → name resolve →
AI classify/extract → thread management → vault note → manifest → archive.

Usage:
  python process_email.py [--vault-root PATH] [--dry-run] [--no-ai]
  python process_email.py --input FILE [--vault-root PATH]
"""

import argparse
import email as email_mod
import email.policy
import email.utils
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, date
from pathlib import Path
from zoneinfo import ZoneInfo

# Add tools/ to path for shared libraries
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from lib.parsing import (
    parse_export_header,
    strip_html,
    build_people_lookup,
    build_email_lookup,
    parse_frontmatter,
    sanitize_filename,
    DOMAIN_PRIORITY,
    DOMAIN_DIRS,
)

try:
    from lib.bridge import claude as bridge_claude
    HAS_BRIDGE = True
except ImportError:
    HAS_BRIDGE = False

# ── Constants ────────────────────────────────────────────────────────────────

CST = ZoneInfo("America/Chicago")
AI_MODEL = "claude-haiku-4-5-20251001"
DEST_MAP = {
    "solera": "Solera/Emails",
    "tandem": "Tandem/Emails",
    "cnpc": "CNPC/Emails",
}
THREAD_REVIVAL_DAYS = 7
PROMPT_PATH = Path(__file__).resolve().parent / "prompts" / "email-extract.md"
THINGS_TODO = (
    Path.home() / "dev" / "toolbox" / "shared" / "things"
    / "tools" / "things" / "add-todo.sh"
)


# ── Manifest ─────────────────────────────────────────────────────────────────

def load_manifest(vault_root: Path) -> dict:
    path = vault_root / "meta" / "email-manifest.json"
    if not path.exists():
        return {"by_message_id": {}, "by_conversation_id": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        data.setdefault("by_message_id", {})
        data.setdefault("by_conversation_id", {})
        return data
    except (json.JSONDecodeError, OSError):
        return {"by_message_id": {}, "by_conversation_id": {}}


def save_manifest(vault_root: Path, manifest: dict) -> None:
    path = vault_root / "meta" / "email-manifest.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    tmp.replace(path)


# ── EML Parsing ──────────────────────────────────────────────────────────────

def parse_eml_file(path: Path) -> tuple[dict, str]:
    """Parse .eml file into (meta_dict, body_html).
    Returns same format as parse_export_header for pipeline compatibility."""
    raw = path.read_bytes()
    msg = email_mod.message_from_bytes(raw, policy=email_mod.policy.default)

    message_id = msg.get("Message-ID", "")
    from_str = str(msg.get("From", ""))
    to_str = str(msg.get("To", ""))
    cc_str = str(msg.get("Cc", "") or "")
    subject = str(msg.get("Subject", ""))
    importance = str(msg.get("Importance", "") or "normal").lower()

    # Parse date to ISO
    date_raw = msg.get("Date", "")
    try:
        dt = email.utils.parsedate_to_datetime(date_raw)
        date_iso = dt.isoformat()
    except Exception:
        date_iso = datetime.now(CST).isoformat()

    # Thread ID: References[0] (thread root) > In-Reply-To > own Message-ID
    references = msg.get("References", "")
    in_reply_to = msg.get("In-Reply-To", "")
    if references:
        ref_ids = references.strip().split()
        thread_id = ref_ids[0] if ref_ids else message_id
    elif in_reply_to:
        thread_id = in_reply_to.strip()
    else:
        thread_id = message_id

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

    # Extract attachment filenames
    att_names = []
    if msg.is_multipart():
        for part in msg.walk():
            disp = part.get_content_disposition()
            fname = part.get_filename()
            if fname and disp in ("attachment", "inline"):
                att_names.append(fname)

    meta = {
        "type": "email",
        "message_id": message_id,
        "conversation_id": thread_id,
        "date": date_iso,
        "from": from_str,
        "to": to_str,
        "cc": cc_str,
        "subject": subject,
        "importance": importance,
        "has_attachments": "true" if att_names else "false",
        "attachment_names": ", ".join(att_names),
        "web_link": "",
    }

    # Extract Graph API ID from filename: ...subject__GRAPHID.eml
    stem = path.stem
    if "__" in stem:
        graph_id = stem.split("__", 1)[1]
        meta["outlook_link"] = f"ms-outlook://emails/open?restid={graph_id}"
        meta["web_link"] = f"https://outlook.office365.com/owa/?ItemID={graph_id}&exvsurl=1&viewmodel=ReadMessageItem"

    # Fallback: sidecar .json with web_link
    sidecar = path.with_suffix(".json")
    if not meta.get("web_link") and sidecar.exists():
        try:
            sidecar_data = json.loads(sidecar.read_text(encoding="utf-8"))
            meta["web_link"] = sidecar_data.get("web_link", "")
        except (json.JSONDecodeError, OSError):
            pass

    return meta, body


# ── Quoted Reply Stripping ────────────────────────────────────────────────────

# Patterns that mark the start of a quoted reply chain (applied after strip_html)
_QUOTE_PATTERNS = [
    # Outlook: "From: Name\nSent: Date\nTo: Recipients"
    re.compile(
        r'^-{2,}.*(?:Original Message|Forwarded message).*-{2,}',
        re.MULTILINE,
    ),
    # Outlook horizontal rule + From/Sent block
    re.compile(
        r'^_{10,}\s*\nFrom:',
        re.MULTILINE,
    ),
    # From/Sent/To/Subject block (Outlook reply header)
    re.compile(
        r'^From:\s+.+\nSent:\s+.+\nTo:\s+',
        re.MULTILINE,
    ),
    # Gmail-style: "On {date}, {name} wrote:"
    re.compile(
        r'^On .+wrote:\s*$',
        re.MULTILINE,
    ),
    # Generic forwarded
    re.compile(
        r'^-{2,}\s*Forwarded message\s*-{2,}',
        re.MULTILINE,
    ),
]

MAX_BODY_CHARS = 131072  # 128K — tail of longer threads was caught in previous days


MIN_CONTENT_CHARS = 50  # If stripping leaves less, use full body instead


def strip_quoted_replies(text: str) -> str:
    """Remove quoted reply chains from email body text.
    Keeps only the new content from this specific email.
    Falls back to full body (capped) if stripping is too aggressive."""
    if not text:
        return text
    original = text
    earliest_pos = len(text)
    for pattern in _QUOTE_PATTERNS:
        m = pattern.search(text)
        if m and m.start() < earliest_pos:
            earliest_pos = m.start()
    if earliest_pos < len(text):
        stripped = text[:earliest_pos].rstrip()
        # Fallback: if stripping removed almost everything, keep the full body
        if len(stripped) >= MIN_CONTENT_CHARS:
            text = stripped
        # else: keep original text (quote pattern matched too early)
    # Safety truncation
    if len(text) > MAX_BODY_CHARS:
        text = text[:MAX_BODY_CHARS] + "\n[... truncated]"
    return text


# ── Recipient Parsing ────────────────────────────────────────────────────────

def parse_sender(from_str: str) -> tuple[str, str]:
    """Parse 'Name <addr>' format. Returns (name, email_addr)."""
    name, addr = email.utils.parseaddr(from_str)
    return name or addr, addr


def parse_recipients(recipients_str: str) -> list[tuple[str, str]]:
    """Parse recipient string in various formats:
    - 'Name1 <a1>, Name2 <a2>' (RFC 2822)
    - 'a1; a2' (PA semicolon-separated)
    - 'a1' (single bare address)
    Returns list of (name, email_addr) tuples."""
    if not recipients_str or not recipients_str.strip():
        return []
    # PA may use semicolons as separators
    normalized = recipients_str.replace(";", ",")
    return [
        (name or addr, addr)
        for name, addr in email.utils.getaddresses([normalized])
    ]


# ── People Resolution ────────────────────────────────────────────────────────

def resolve_person(
    name: str, addr: str,
    email_lk: dict, name_lk: dict,
) -> str:
    """Resolve by email first, then name/alias fallback."""
    if addr:
        canonical = email_lk.get(addr.lower())
        if canonical:
            return canonical
    if name:
        canonical = name_lk.get(name.lower())
        if canonical:
            return canonical
    return name or addr


def infer_domain(participants: list[str], domain_lk: dict) -> str:
    """Majority participant domain. Priority: solera > tandem > cnpc."""
    domains = [domain_lk.get(p, "") for p in participants if domain_lk.get(p)]
    if not domains:
        return "solera"
    from collections import Counter
    counts = Counter(domains)
    if len(counts) == 1:
        return domains[0]
    max_count = max(counts.values())
    top = [d for d, c in counts.items() if c == max_count]
    top.sort(key=lambda d: DOMAIN_PRIORITY.get(d, 0), reverse=True)
    return top[0]


# ── AI Integration ───────────────────────────────────────────────────────────

def load_prompt_template() -> str:
    if PROMPT_PATH.exists():
        return PROMPT_PATH.read_text(encoding="utf-8")
    raise FileNotFoundError(f"Prompt template not found: {PROMPT_PATH}")


def load_tag_registry(vault_root: Path) -> str:
    path = vault_root / "Tag Registry.md"
    if path.exists():
        return path.read_text(encoding="utf-8")
    return ""


def build_ai_prompt(
    template: str, meta: dict, body_text: str,
    people_list: list[str], tag_registry: str,
) -> str:
    email_content = (
        f"Subject: {meta.get('subject', '')}\n"
        f"From: {meta.get('from', '')}\n"
        f"To: {meta.get('to', '')}\n"
        f"CC: {meta.get('cc', '')}\n"
        f"Date: {meta.get('date', '')}\n"
        f"Importance: {meta.get('importance', 'normal')}\n"
        f"Has Attachments: {meta.get('has_attachments', 'false')}\n"
        f"\nBody:\n{body_text}"
    )
    prompt = template
    prompt = prompt.replace("{{TAG_REGISTRY}}", tag_registry)
    prompt = prompt.replace("{{PEOPLE_LIST}}", "\n".join(people_list))
    prompt = prompt.replace("{{EMAIL_CONTENT}}", email_content)
    return prompt


def ai_classify_extract(prompt: str) -> dict:
    """Call AI for classification and extraction. Retries up to 2x on parse failure."""
    if not HAS_BRIDGE:
        return _fallback_result()
    for attempt in range(3):
        try:
            response = bridge_claude(prompt, model=AI_MODEL)
            return _parse_json_response(response)
        except json.JSONDecodeError:
            if attempt < 2:
                print(
                    f"  WARNING: AI JSON parse failed (attempt {attempt + 1}/3), retrying",
                    file=sys.stderr,
                )
                continue
            print("  ERROR: AI JSON parse failed after 3 attempts", file=sys.stderr)
            return _fallback_result()
        except Exception as e:
            print(f"  WARNING: AI call failed: {e}", file=sys.stderr)
            return _fallback_result()


def _fallback_result() -> dict:
    return {
        "classification": "reference",
        "confidence": "low",
        "title": "",
        "summary": "AI extraction unavailable",
    }


def _parse_json_response(text: str) -> dict:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"```(?:json)?\s*\n(.*?)\n```", text, re.DOTALL)
    if match:
        return json.loads(match.group(1))
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        return json.loads(text[start : end + 1])
    raise json.JSONDecodeError("No JSON found in response", text, 0)


# ── Thread Management ────────────────────────────────────────────────────────

def check_thread(
    manifest: dict, conversation_id: str, msg_date: datetime,
) -> tuple[str, str | None]:
    """Returns (action, existing_note_path).
    action: 'new', 'append', 'revival'."""
    if not conversation_id:
        return "new", None
    entry = manifest.get("by_conversation_id", {}).get(conversation_id)
    if not entry:
        return "new", None
    last_str = entry.get("last_message_date", "")
    if not last_str:
        return "new", None
    try:
        last_date = datetime.fromisoformat(last_str.replace("Z", "+00:00"))
        if (msg_date - last_date).days >= THREAD_REVIVAL_DAYS:
            return "revival", entry.get("current_output_path")
        return "append", entry.get("current_output_path")
    except (ValueError, TypeError):
        return "new", None


def append_to_note(
    vault_root: Path, note_path: str,
    meta: dict, ai_result: dict, sender_name: str,
) -> None:
    """Append a new message section, then re-summarize the full thread."""
    full_path = vault_root / note_path
    if not full_path.exists():
        return
    msg_date = _format_date_display(meta.get("date", ""))
    outlook_link = meta.get("outlook_link", "")
    web_link = meta.get("web_link", "")

    section = f"\n\n## Update: {msg_date} — {sender_name}\n\n"
    if outlook_link or web_link:
        links = []
        if outlook_link:
            links.append(f"[Open in Outlook]({outlook_link})")
        if web_link:
            links.append(f"[Open in Web]({web_link})")
        section += " · ".join(links) + "\n\n"
    section += ai_result.get("summary", "_No summary available._") + "\n"

    action_items = ai_result.get("action_items", [])
    if action_items:
        section += "\n### New Action Items\n\n"
        for item in action_items:
            section += f"- {_format_action_item(item)}\n"

    existing = full_path.read_text(encoding="utf-8")

    # Backfill deep links into frontmatter if note doesn't have them
    if outlook_link and "outlook-link:" not in existing:
        existing = re.sub(
            r"^(has-attachments:.*\n)",
            f"\\g<1>outlook-link: \"{outlook_link}\"\n",
            existing, count=1, flags=re.MULTILINE,
        )
    if web_link and "web-link:" not in existing:
        existing = re.sub(
            r"^(has-attachments:.*\n)",
            f"\\g<1>web-link: \"{web_link}\"\n",
            existing, count=1, flags=re.MULTILINE,
        )

    updated = existing + section
    full_path.write_text(updated, encoding="utf-8")

    # Re-summarize the full thread
    _resummarize_thread(full_path)


def _resummarize_thread(note_path: Path) -> None:
    """Read the full note, send all content to AI, replace the Summary section."""
    if not HAS_BRIDGE:
        return
    text = note_path.read_text(encoding="utf-8")

    # Extract everything after frontmatter for context
    fm_end = text.find("\n---\n", 4)
    if fm_end < 0:
        return
    body = text[fm_end + 5:]

    prompt = (
        "You are summarizing an email thread that has been updated with new messages.\n"
        "Below is the full vault note including all updates.\n"
        "Write a concise 2-4 sentence summary that covers the ENTIRE thread — "
        "all messages, decisions, action items, and current status.\n"
        "Return ONLY the summary text, no JSON, no labels, no markdown headers.\n\n"
        f"{body}"
    )

    try:
        summary = bridge_claude(prompt, model=AI_MODEL)
        summary = summary.strip()
        if not summary or len(summary) < 10:
            return
    except Exception:
        return

    # Replace the Summary section in the note
    pattern = re.compile(
        r"(## Summary\n\n).*?(\n\n## )",
        re.DOTALL,
    )
    m = pattern.search(text)
    if m:
        new_text = text[:m.start()] + f"## Summary\n\n{summary}\n\n## " + text[m.end():]
        note_path.write_text(new_text, encoding="utf-8")


# ── Note Rendering ───────────────────────────────────────────────────────────

def render_note(
    meta: dict, ai_result: dict,
    sender_name: str, to_names: list[str], cc_names: list[str],
    domain: str, continued_from: str | None = None,
) -> str:
    fm = _build_frontmatter(
        meta, ai_result, sender_name, to_names, cc_names,
        domain, continued_from,
    )
    body = _build_body(meta, ai_result, sender_name, to_names)
    return fm + "\n\n" + body + "\n"


def _build_frontmatter(
    meta: dict, ai_result: dict,
    sender_name: str, to_names: list[str], cc_names: list[str],
    domain: str, continued_from: str | None,
) -> str:
    msg_date = _parse_date(meta.get("date", ""))
    subject = meta.get("subject", "Unknown Subject")
    workstreams = ai_result.get("workstreams", [])
    tags = ai_result.get("tags", [domain])

    lines = ["---"]
    lines.append(f"date: {msg_date}")
    lines.append("type: email-summary")
    lines.append(f"domain: {domain}")
    lines.append(f'subject: "{_yaml_escape(subject)}"')
    lines.append(f'from: "{_yaml_escape(sender_name)}"')
    lines.append(_format_list("to", to_names))
    if cc_names:
        lines.append(_format_list("cc", cc_names))
    if meta.get("conversation_id"):
        lines.append(f'thread-id: "{meta["conversation_id"]}"')
    if meta.get("message_id"):
        lines.append(f'message-id: "{_yaml_escape(meta["message_id"])}"')
    lines.append(_format_list("workstreams", workstreams))
    lines.append(_format_list("tags", tags))
    if meta.get("outlook_link"):
        lines.append(f'outlook-link: "{meta["outlook_link"]}"')
    if meta.get("web_link"):
        lines.append(f'web-link: "{meta["web_link"]}"')
    if continued_from:
        lines.append(f'continued-from: "{continued_from}"')
    lines.append(f"classification: {ai_result.get('classification', 'reference')}")
    lines.append(f"confidence: {ai_result.get('confidence', 'low')}")
    has_att = str(meta.get("has_attachments", "false")).lower() == "true"
    lines.append(f"has-attachments: {str(has_att).lower()}")
    att_names = _parse_attachment_names(meta.get("attachment_names", ""))
    if att_names:
        lines.append(_format_list("attachment-names", att_names))
    lines.append("---")
    return "\n".join(lines)


def _build_body(
    meta: dict, ai_result: dict,
    sender_name: str, to_names: list[str],
) -> str:
    title = ai_result.get("title") or meta.get("subject", "Email")
    msg_date = _format_date_display(meta.get("date", ""))
    outlook_link = meta.get("outlook_link", "")
    web_link = meta.get("web_link", "")

    parts = [f"# {title}", ""]
    to_links = ", ".join(f"[[{n}]]" for n in to_names)
    parts.append(f"**From:** [[{sender_name}]] → **To:** {to_links}")
    parts.append(f"**Date:** {msg_date}")
    if outlook_link or web_link:
        links = []
        if outlook_link:
            links.append(f"[Open in Outlook]({outlook_link})")
        if web_link:
            links.append(f"[Open in Web]({web_link})")
        parts.append(" · ".join(links))
    parts.append("")

    parts.append("## Summary")
    parts.append("")
    parts.append(ai_result.get("summary") or "_Summary pending._")
    parts.append("")

    decisions = ai_result.get("decisions", [])
    if decisions:
        parts.append("## Decisions")
        parts.append("")
        for d in decisions:
            parts.append(f"- {d}")
        parts.append("")

    action_items = ai_result.get("action_items", [])
    if action_items:
        parts.append("## Action Items")
        parts.append("")
        for item in action_items:
            parts.append(f"- {_format_action_item(item)}")
        parts.append("")

    att_names = _parse_attachment_names(meta.get("attachment_names", ""))
    if att_names:
        parts.append("## Attachments")
        parts.append("")
        for fname in att_names:
            parts.append(f"- {fname}")
        if outlook_link or web_link:
            parts.append("")
            dl_links = []
            if outlook_link:
                dl_links.append(f"[Open in Outlook]({outlook_link})")
            if web_link:
                dl_links.append(f"[Open in Web]({web_link})")
            parts.append(" · ".join(dl_links) + " to download")
        parts.append("")

    return "\n".join(parts)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _parse_date(date_str: str) -> str:
    if not date_str:
        return date.today().isoformat()
    try:
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        return dt.astimezone(CST).strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        m = re.match(r"(\d{4}-\d{2}-\d{2})", date_str)
        return m.group(1) if m else date.today().isoformat()


def _format_date_display(date_str: str) -> str:
    if not date_str:
        return date.today().isoformat()
    try:
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        return dt.astimezone(CST).strftime("%Y-%m-%d %H:%M CST")
    except (ValueError, TypeError):
        return date_str[:16]


def _format_action_item(item) -> str:
    if isinstance(item, dict):
        task = item.get("task", "")
        owner = item.get("owner", "")
        deadline = item.get("deadline", "")
        line = task
        if owner:
            line += f" (Owner: {owner})"
        if deadline:
            line += f" [Due: {deadline}]"
        return line
    return str(item)


def _parse_attachment_names(raw: str) -> list[str]:
    """Parse comma-separated attachment filenames from meta header."""
    if not raw or not raw.strip():
        return []
    return [n.strip() for n in raw.split(",") if n.strip()]


def _yaml_escape(s: str) -> str:
    return s.replace('"', '\\"')


def _format_list(key: str, items: list[str]) -> str:
    if not items:
        return f"{key}: []"
    quoted = []
    for i in items:
        if " " in i or any(c in i for c in "[]{},:"):
            quoted.append(f'"{_yaml_escape(i)}"')
        else:
            quoted.append(i)
    return f"{key}: [{', '.join(quoted)}]"


def _output_filename(title: str, msg_date: str) -> str:
    safe_title = sanitize_filename(title)
    return f"{msg_date} - {safe_title}.md"


def _dedup_path(path: Path) -> Path:
    if not path.exists():
        return path
    stem, suffix = path.stem, path.suffix
    n = 2
    candidate = path
    while candidate.exists():
        candidate = path.parent / f"{stem}_{n}{suffix}"
        n += 1
    return candidate


# ── Side Effects ─────────────────────────────────────────────────────────────

def update_people_notes(
    vault_root: Path,
    resolved_with_email: list[tuple[str, str]],
    msg_date: str,
    email_lk: dict,
) -> None:
    """Update People notes: last-seen date + email field enrichment.
    resolved_with_email: list of (canonical_name, email_addr) tuples."""
    person_names = {name for name, _ in resolved_with_email}
    email_by_name = {name: addr for name, addr in resolved_with_email if addr}

    for people_dir_rel in DOMAIN_DIRS:
        people_dir = vault_root / people_dir_rel
        if not people_dir.is_dir():
            continue
        for md_file in people_dir.glob("*.md"):
            fm = parse_frontmatter(md_file)
            if not fm:
                continue
            name = fm.get("name", "")
            if name not in person_names:
                continue

            text = md_file.read_text(encoding="utf-8")
            modified = False
            verified_fields = fm.get("verified-fields", []) or []

            # Update last-seen
            if "last-seen" not in verified_fields:
                current_last = str(fm.get("last-seen", ""))
                if not current_last or current_last < msg_date:
                    if current_last:
                        text = re.sub(
                            r"^(last-seen:\s*).*$",
                            f"\\g<1>{msg_date}",
                            text, count=1, flags=re.MULTILINE,
                        )
                    else:
                        text = re.sub(
                            r"^(tags:)",
                            f"last-seen: {msg_date}\n\\1",
                            text, count=1, flags=re.MULTILINE,
                        )
                    modified = True

            # Enrich email field if matched by name but missing email
            if (
                "email" not in verified_fields
                and not fm.get("email")
                and name in email_by_name
                and email_by_name[name]
                and name not in [email_lk.get(a, "") for a in [email_by_name[name]]]
            ):
                addr = email_by_name[name]
                # Only add if this person was matched by name (not by email)
                if addr.lower() not in email_lk:
                    text = re.sub(
                        r"^(domain:.*\n)",
                        f"\\g<1>email: {addr}\n",
                        text, count=1, flags=re.MULTILINE,
                    )
                    modified = True

            if modified:
                md_file.write_text(text, encoding="utf-8")


def create_things_todos(ai_result: dict, subject: str) -> None:
    """Create Things todos for action items owned by Alex."""
    if not THINGS_TODO.exists():
        return
    for item in ai_result.get("action_items", []):
        if not isinstance(item, dict):
            continue
        owner = item.get("owner", "").lower()
        if "alex" not in owner and owner not in ("me", ""):
            continue
        task = item.get("task", "")
        if not task:
            continue
        try:
            cmd = [str(THINGS_TODO), "--title", f"{task} (from: {subject})"]
            deadline = item.get("deadline", "")
            if deadline:
                cmd.extend(["--when", deadline])
            subprocess.run(cmd, capture_output=True, timeout=10)
        except Exception:
            pass


# ── Processing Pipeline ─────────────────────────────────────────────────────

def process_one(
    path: Path, vault_root: Path,
    email_lk: dict, name_lk: dict, domain_lk: dict,
    manifest: dict, prompt_template: str, tag_registry: str,
    use_ai: bool = True, dry_run: bool = False,
    no_delete: bool = False,
) -> dict:
    """Process a single email export file. Returns result dict."""
    result = {"_status": "error", "_file": path.name}

    # 1. Read and parse — detect format by extension
    if path.suffix.lower() == ".eml":
        try:
            meta, body_html = parse_eml_file(path)
        except Exception as e:
            result["_error"] = f"eml parse failed: {e}"
            return result
    else:
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as e:
            result["_error"] = str(e)
            return result
        meta, body_html = parse_export_header(text)
        if meta is None:
            result["_status"] = "skip"
            result["_reason"] = "no_header"
            return result

    # 2. Check type
    if meta.get("type") != "email":
        result["_status"] = "skip"
        result["_reason"] = f"wrong_type:{meta.get('type', 'unknown')}"
        return result

    # 3. Validate required fields
    message_id = meta.get("message_id", "")
    if not message_id:
        result["_status"] = "error"
        result["_error"] = "missing message_id"
        return result
    for field in ("date", "from", "subject"):
        if not meta.get(field):
            result["_status"] = "error"
            result["_error"] = f"missing {field}"
            return result

    # 4. Check manifest dedup
    if message_id in manifest["by_message_id"]:
        result["_status"] = "skip"
        result["_reason"] = "already_processed"
        if not dry_run and not no_delete:
            _archive_input(path)
        return result

    # 5. Strip HTML, then strip quoted replies for AI
    body_text = strip_html(body_html)
    body_for_ai = strip_quoted_replies(body_text)

    # 6. Parse sender/recipients
    sender_name, sender_addr = parse_sender(meta.get("from", ""))
    to_parsed = parse_recipients(meta.get("to", ""))
    cc_parsed = parse_recipients(meta.get("cc", ""))

    # 7. Resolve against People notes
    sender_resolved = resolve_person(sender_name, sender_addr, email_lk, name_lk)
    to_resolved = [resolve_person(n, a, email_lk, name_lk) for n, a in to_parsed]
    cc_resolved = [resolve_person(n, a, email_lk, name_lk) for n, a in cc_parsed]
    all_participants = list(dict.fromkeys(
        [sender_resolved] + to_resolved + cc_resolved
    ))

    # Build (name, email) pairs for People enrichment
    resolved_with_email = [(sender_resolved, sender_addr)]
    resolved_with_email += [(resolve_person(n, a, email_lk, name_lk), a) for n, a in to_parsed]
    resolved_with_email += [(resolve_person(n, a, email_lk, name_lk), a) for n, a in cc_parsed]

    domain = infer_domain(all_participants, domain_lk)

    # 8–10. AI classification + extraction
    ai_result = {
        "classification": "reference", "confidence": "low",
        "title": meta.get("subject", ""), "summary": "",
    }
    if use_ai:
        people_list = list(dict.fromkeys(name_lk.values()))
        prompt = build_ai_prompt(
            prompt_template, meta, body_for_ai, people_list, tag_registry,
        )
        ai_result = ai_classify_extract(prompt)

    # Defaults
    ai_result.setdefault("classification", "reference")
    ai_result.setdefault("confidence", "low")
    ai_result.setdefault("title", meta.get("subject", "Email"))
    ai_result.setdefault("summary", "")
    ai_result.setdefault("workstreams", [])
    ai_result.setdefault("tags", [domain])
    ai_result.setdefault("decisions", [])
    ai_result.setdefault("action_items", [])
    if domain not in ai_result["tags"]:
        ai_result["tags"].insert(0, domain)

    result["title"] = ai_result.get("title", "")
    result["classification"] = ai_result["classification"]

    # 11. Skip handling
    if ai_result["classification"] == "skip":
        result["_status"] = "skip"
        result["_reason"] = ai_result.get("skip_reason", "ai_classified_skip")
        manifest["by_message_id"][message_id] = {
            "status": "skip",
            "skip_reason": ai_result.get("skip_reason", ""),
            "conversation_id": meta.get("conversation_id", ""),
            "processed_date": datetime.now(CST).isoformat(),
        }
        if not dry_run:
            save_manifest(vault_root, manifest)
            if not no_delete:
                _archive_input(path)
        return result

    if dry_run:
        result["_status"] = "dry_run"
        result["domain"] = domain
        result["sender"] = sender_resolved
        result["to"] = to_resolved
        result["ai_result"] = ai_result
        return result

    # 12. Thread management
    msg_date_str = meta.get("date", "")
    try:
        msg_date = datetime.fromisoformat(msg_date_str.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        msg_date = datetime.now(CST)

    conversation_id = meta.get("conversation_id", "")
    thread_action, existing_path = check_thread(
        manifest, conversation_id, msg_date,
    )

    date_str = _parse_date(msg_date_str)
    continued_from = None

    if thread_action == "append" and existing_path:
        append_to_note(
            vault_root, existing_path, meta, ai_result, sender_resolved,
        )
        out_path_rel = existing_path
        result["_status"] = "ok"
        result["_action"] = "appended"
        result["_output"] = existing_path
    else:
        if thread_action == "revival" and existing_path:
            continued_from = f"[[{existing_path}]]"

        # 13. Render note
        content = render_note(
            meta, ai_result,
            sender_resolved, to_resolved, cc_resolved,
            domain, continued_from,
        )
        dest_dir = vault_root / DEST_MAP.get(domain, f"{domain.title()}/Emails")
        dest_dir.mkdir(parents=True, exist_ok=True)
        title = ai_result.get("title") or meta.get("subject", "Email")
        filename = _output_filename(title, date_str)
        out_path = _dedup_path(dest_dir / filename)
        out_path.write_text(content, encoding="utf-8")
        out_path_rel = str(out_path.relative_to(vault_root))

        result["_status"] = "ok"
        result["_action"] = "created" if thread_action != "revival" else "revival"
        result["_output"] = out_path_rel

    # 14. Update manifest atomically
    manifest["by_message_id"][message_id] = {
        "status": "ok",
        "conversation_id": conversation_id,
        "output_path": out_path_rel,
        "processed_date": datetime.now(CST).isoformat(),
    }
    if conversation_id:
        conv = manifest["by_conversation_id"].get(conversation_id, {
            "current_output_path": "",
            "last_message_date": "",
            "message_ids": [],
        })
        if thread_action != "append":
            conv["current_output_path"] = out_path_rel
        conv["last_message_date"] = msg_date_str
        conv.setdefault("message_ids", [])
        if message_id not in conv["message_ids"]:
            conv["message_ids"].append(message_id)
        manifest["by_conversation_id"][conversation_id] = conv

    save_manifest(vault_root, manifest)

    # 15. Archive input (only after manifest saved)
    if not no_delete:
        _archive_input(path)

    # 16. Side effects
    update_people_notes(vault_root, resolved_with_email, date_str, email_lk)
    if ai_result.get("action_items"):
        create_things_todos(ai_result, meta.get("subject", ""))

    return result


def _archive_input(path: Path) -> None:
    """Delete processed input file + sidecar. Manifest handles dedup."""
    try:
        path.unlink()
    except OSError:
        pass
    # Delete companion .json sidecar if exists
    sidecar = path.with_suffix(".json")
    try:
        sidecar.unlink()
    except OSError:
        pass


# ── Report ───────────────────────────────────────────────────────────────────

def print_report(results: list[dict]) -> None:
    ok = sum(1 for r in results if r["_status"] == "ok")
    skipped = sum(1 for r in results if r["_status"] == "skip")
    errors = sum(1 for r in results if r["_status"] == "error")

    print(f"\n=== Email Processing Report ===")
    print(f"Total files: {len(results)}")
    print(f"  New:     {ok}")
    print(f"  Skipped: {skipped}")
    print(f"  Errors:  {errors}")

    for r in results:
        status = r["_status"]
        fname = r["_file"]
        if status == "ok":
            action = r.get("_action", "created")
            title = r.get("title", "")
            print(f"  [{action}] {fname} → {title}")
        elif status == "skip":
            reason = r.get("_reason", "")
            print(f"  [skip] {fname}: {reason}")
        elif status == "error":
            error = r.get("_error", "unknown")
            print(f"  [error] {fname}: {error}")

    # JSON output for watcher integration
    for r in results:
        print(json.dumps(r, ensure_ascii=False))


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Process email exports into vault notes",
    )
    parser.add_argument(
        "--vault-root", type=Path,
        default=Path.home() / "Vaults" / "My Notes",
    )
    parser.add_argument("--input", type=Path, help="Process a single file")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-ai", action="store_true")
    parser.add_argument(
        "--reprocess", type=Path, metavar="DIR",
        help="Reprocess .eml files from DIR, ignoring manifest dedup. "
             "Deletes existing vault notes and manifest entries first.",
    )
    parser.add_argument(
        "--no-delete", action="store_true",
        help="Don't delete source files after processing (for --reprocess)",
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

    # Build lookups
    email_lk = build_email_lookup(vault_root)
    name_lk, domain_lk = build_people_lookup(vault_root)
    print(
        f"People index: {len(name_lk)} names, "
        f"{len(email_lk)} emails, {len(domain_lk)} people"
    )

    manifest = load_manifest(vault_root)

    # Handle --reprocess: clear manifest entries and delete existing notes
    if args.reprocess:
        reprocess_dir = args.reprocess.expanduser().resolve()
        if not reprocess_dir.is_dir():
            print(f"Error: reprocess dir not found: {reprocess_dir}", file=sys.stderr)
            sys.exit(1)
        files = sorted(
            f for f in list(reprocess_dir.glob("*.eml")) + list(reprocess_dir.glob("*.txt"))
            if ".sync-conflict-" not in f.name
        )
        if not files:
            print(f"No files to reprocess in {reprocess_dir}")
            return
        # Clear manifest entries for these files so they don't get skipped
        cleared = 0
        for fpath in files:
            if fpath.suffix.lower() == ".eml":
                try:
                    meta, _ = parse_eml_file(fpath)
                    mid = meta.get("message_id", "")
                    if mid and mid in manifest["by_message_id"]:
                        # Delete existing vault note
                        old_path = manifest["by_message_id"][mid].get("output_path", "")
                        if old_path:
                            full_old = vault_root / old_path
                            if full_old.exists():
                                full_old.unlink()
                                print(f"  Deleted old note: {old_path}", flush=True)
                        del manifest["by_message_id"][mid]
                        cleared += 1
                except Exception:
                    pass
        # Also clear conversation entries that reference deleted notes
        for conv_id in list(manifest.get("by_conversation_id", {}).keys()):
            conv = manifest["by_conversation_id"][conv_id]
            path = conv.get("current_output_path", "")
            if path and not (vault_root / path).exists():
                del manifest["by_conversation_id"][conv_id]
        save_manifest(vault_root, manifest)
        print(f"Cleared {cleared} manifest entries, reprocessing {len(files)} files")
        # Override no-delete for reprocess (don't delete source files from temp dir)
        args.no_delete = True
    else:
        # Load AI resources
        tag_registry = load_tag_registry(vault_root)
        try:
            prompt_template = load_prompt_template()
        except FileNotFoundError as e:
            if not args.no_ai:
                print(f"Error: {e}", file=sys.stderr)
                sys.exit(1)
            prompt_template = ""

        # Find input files
        if args.input:
            files = [args.input.expanduser().resolve()]
        else:
            intake_dir = vault_root / "Intake" / "Email"
            if not intake_dir.is_dir():
                intake_dir.mkdir(parents=True, exist_ok=True)
                print(f"Created intake directory: {intake_dir}")
            files = sorted(
                f for f in list(intake_dir.glob("*.txt")) + list(intake_dir.glob("*.eml"))
                if ".sync-conflict-" not in f.name
            )

    if not files:
        print("No files to process")
        return

    # Load AI resources (needed for both normal and reprocess)
    tag_registry = load_tag_registry(vault_root)
    try:
        prompt_template = load_prompt_template()
    except FileNotFoundError as e:
        if not args.no_ai:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
        prompt_template = ""

    print(f"Found {len(files)} file(s), AI={'on' if not args.no_ai else 'off'}")

    results = []
    for i, fpath in enumerate(files, 1):
        print(f"  [{i}/{len(files)}] {fpath.name}", flush=True)
        r = process_one(
            fpath, vault_root,
            email_lk, name_lk, domain_lk,
            manifest, prompt_template, tag_registry,
            use_ai=not args.no_ai, dry_run=args.dry_run,
            no_delete=getattr(args, 'no_delete', False),
        )
        status = r["_status"]
        title = r.get("title", "")
        action = r.get("_action", "")
        reason = r.get("_reason", "")
        label = f"{status}:{action}" if action else f"{status}:{reason}" if reason else status
        print(f"    → {label} {title}", flush=True)
        results.append(r)

    if not args.dry_run:
        save_manifest(vault_root, manifest)

    print_report(results)


if __name__ == "__main__":
    main()
