#!/usr/bin/env python3
"""Chat processor — parses Teams chat exports into vault Chat notes.

Full pipeline: parse header → check manifest → HTML strip → name resolve →
AI summarize/tag → generate vault note → update manifest → archive input.

Usage:
  python process_chat.py [--vault-root PATH] [--dry-run] [--no-ai]
  python process_chat.py --input FILE [--vault-root PATH]
"""

import argparse
import html
import json
import os
import re
import shutil
import sys
from datetime import datetime, date, timezone
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
PEOPLE_DIRS = ["Solera/People", "Tandem/People", "CNPC/People"]
DOMAIN_DIRS = {"Solera/People": "solera", "Tandem/People": "tandem", "CNPC/People": "cnpc"}
DOMAIN_PRIORITY = {"solera": 3, "tandem": 2, "cnpc": 1}
DEST_MAP = {"solera": "Solera/Chats", "tandem": "Tandem/Chats", "cnpc": "CNPC/Chats"}
SANITIZE_RE = re.compile(r'[/:\\*?"<>|]')
MSG_HEADER_RE = re.compile(
    r'^(.*?)\s*\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\]:\s*(.*)',
    re.DOTALL,
)
AT_TAG_RE = re.compile(r'<at\s+id="[^"]*">([^<]*)</at>')
SPLIT_AT_RE = re.compile(
    r'<at\s+id="[^"]*">([^<]*),</at>\s*(?:&nbsp;)?\s*<at\s+id="[^"]*">([^<]*)</at>'
)

AI_MODEL = "claude-haiku-4-5-20251001"
MAX_MESSAGES_FOR_AI = 200  # Limit messages sent to AI to control token cost


# ── Header Parsing ───────────────────────────────────────────────────────────

def parse_header(text: str) -> tuple[dict | None, str]:
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


# ── Message Parsing ──────────────────────────────────────────────────────────

def parse_messages(text: str) -> list[dict]:
    """Parse message lines into structured dicts.
    Returns list of {sender, timestamp, body} in file order (reverse chrono)."""
    messages = []
    current = None
    for line in text.split("\n"):
        m = MSG_HEADER_RE.match(line)
        if m:
            if current:
                messages.append(current)
            sender_raw = m.group(1).strip()
            ts = m.group(2)
            body = m.group(3)
            current = {"sender_raw": sender_raw, "timestamp": ts, "body": body}
        elif current:
            current["body"] += "\n" + line
    if current:
        messages.append(current)
    return messages


def is_system_event(msg: dict) -> bool:
    """Check if a message is a system event."""
    return "<systemEventMessage/>" in msg["body"]


# ── HTML Stripping ───────────────────────────────────────────────────────────

def strip_html(text: str) -> str:
    """Strip HTML from a message body per spec §2."""
    if not text:
        return ""
    # Handle split @mentions: <at>Last,</at>&nbsp;<at>First</at> → First Last
    text = SPLIT_AT_RE.sub(lambda m: f"{m.group(2).strip()} {m.group(1).strip().rstrip(',')}", text)
    # Handle single @mentions
    text = AT_TAG_RE.sub(lambda m: m.group(1).strip(), text)
    # Handle emoji tags
    text = re.sub(r'<emoji[^>]*alt="([^"]*)"[^>]*>', r'\1', text)
    text = re.sub(r'<emoji[^>]*>', '', text)
    # Handle attachments
    text = re.sub(
        r'<a[^>]*href="[^"]*?([^/"]+\.(?:xlsx|pdf|docx|pptx|csv|zip))"[^>]*>.*?</a>',
        r'[attachment: \1]', text, flags=re.I | re.DOTALL
    )
    # Handle links
    text = re.sub(r'<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>', r'\2 (\1)', text, flags=re.DOTALL)
    # Handle images
    text = re.sub(r'<img[^>]*alt="([^"]*)"[^>]*>', lambda m: f'[{m.group(1)}]' if m.group(1) != 'image' else '', text)
    text = re.sub(r'<img[^>]*>', '', text)
    # Block-level elements → newlines
    text = re.sub(r'<(?:p|br|li|div|tr|h[1-6])[^>]*/?>', '\n', text, flags=re.I)
    text = re.sub(r'</(?:p|li|div|tr|h[1-6])>', '\n', text, flags=re.I)
    # Code blocks
    text = re.sub(r'<(?:codeblock|code)>(.*?)</(?:codeblock|code)>', r'```\n\1\n```', text, flags=re.DOTALL)
    # Strip remaining tags
    text = re.sub(r'<[^>]+>', '', text)
    # Decode entities
    text = text.replace('&nbsp;', ' ')
    text = html.unescape(text)
    # Cleanup
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    lines = [l.strip() for l in text.split('\n')]
    return '\n'.join(lines).strip()


# ── Name Resolution ──────────────────────────────────────────────────────────

def invert_name(sender_raw: str) -> str:
    """Convert 'Last, First' or 'Last, First [Company]' to 'First Last'."""
    if not sender_raw:
        return ""
    cleaned = re.sub(r"\s*\[[^\]]*\]\s*", " ", sender_raw).strip()
    if "," not in cleaned:
        return cleaned
    parts = cleaned.split(",", 1)
    last = parts[0].strip()
    first = parts[1].strip()
    if not first:
        return last
    return f"{first} {last}"


def build_people_lookup(vault_root: Path) -> tuple[dict, dict]:
    """Build name->canonical and name->domain lookup from People notes."""
    name_lookup: dict[str, str] = {}
    domain_lookup: dict[str, str] = {}
    for people_dir_rel, domain in DOMAIN_DIRS.items():
        people_dir = vault_root / people_dir_rel
        if not people_dir.is_dir():
            continue
        for md_file in people_dir.glob("*.md"):
            fm = _parse_frontmatter(md_file)
            if not fm:
                continue
            name = fm.get("name", "")
            if not name:
                continue
            person_domain = fm.get("domain", domain)
            domain_lookup[name] = person_domain
            name_lookup[name.lower()] = name
            for alias in fm.get("aliases", []) or []:
                if alias:
                    name_lookup[alias.lower()] = name
    return name_lookup, domain_lookup


def resolve_name(raw: str, name_lookup: dict) -> str:
    """Resolve a raw sender name to canonical form."""
    inverted = invert_name(raw)
    canonical = name_lookup.get(inverted.lower())
    if canonical:
        return canonical
    # Try first name
    first = inverted.split()[0] if inverted else ""
    if first:
        canonical = name_lookup.get(first.lower())
        if canonical:
            return canonical
    return inverted


def infer_domain(participants: list[str], domain_lookup: dict) -> str:
    """Infer domain from resolved participant names."""
    domains = [domain_lookup.get(p, "") for p in participants if domain_lookup.get(p)]
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


# ── Manifest ─────────────────────────────────────────────────────────────────

def load_manifest(vault_root: Path) -> dict:
    path = vault_root / "meta" / "chat-manifest.json"
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_manifest(vault_root: Path, manifest: dict) -> None:
    path = vault_root / "meta" / "chat-manifest.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(path)


def should_process(meta: dict, manifest: dict) -> str:
    """Return 'new', 'delta', or 'skip'."""
    thread_key = meta.get("thread_id", meta.get("chat_name", ""))
    if not thread_key:
        return "new"
    entry = manifest.get(thread_key)
    if not entry:
        return "new"
    manifest_latest = entry.get("latest_message", "")
    export_latest = meta.get("latest_message", "")
    manifest_count = int(entry.get("message_count", 0))
    export_count = int(meta.get("message_count", 0))
    if export_latest <= manifest_latest and export_count <= manifest_count:
        return "skip"
    return "delta"


# ── AI Integration ───────────────────────────────────────────────────────────

def ai_summarize(
    chat_name: str, participants: list[str],
    messages_text: str, existing_summary: str = "",
) -> dict:
    """Call AI to generate summary, key topics, and tags.
    Returns {summary, key_topics, workstreams, tags, meeting_type}."""
    if not HAS_ANTHROPIC:
        return _placeholder_ai_result()

    token = os.environ.get("CLAUDE_CODE_OAUTH_TOKEN", "")
    if not token:
        token = os.environ.get("ANTHROPIC_API_KEY", "")
    if not token:
        print("  WARNING: No API key found, using placeholder AI", file=sys.stderr)
        return _placeholder_ai_result()

    client = anthropic.Anthropic(api_key=token)
    prompt = _build_ai_prompt(chat_name, participants, messages_text, existing_summary)

    try:
        resp = client.messages.create(
            model=AI_MODEL,
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt}],
        )
        return _parse_ai_response(resp.content[0].text)
    except Exception as e:
        print(f"  WARNING: AI call failed: {e}", file=sys.stderr)
        return _placeholder_ai_result()


def _build_ai_prompt(
    chat_name: str, participants: list[str],
    messages_text: str, existing_summary: str,
) -> str:
    context = f"Chat thread: {chat_name}\nParticipants: {', '.join(participants)}\n"
    if existing_summary:
        context += f"Previous summary: {existing_summary}\n"
    context += f"\nMessages (chronological):\n{messages_text}\n"

    return f"""{context}

Analyze this Teams chat thread and respond in EXACTLY this format (no other text):

SUMMARY: <2-4 sentence summary of the thread's subject matter and outcome>
TOPICS: <comma-separated key topics discussed>
WORKSTREAMS: <comma-separated workstream tags from this list ONLY: billing-platform, erp, crm, ecomm, peri, peppol, solid, stargate, ai, winback, ap-automation, scandium. Leave empty if none match.>
SIGNALS: <comma-separated signal tags from this list ONLY: has-decisions, has-actions, has-blockers, has-risks. Leave empty if none apply.>"""


def _parse_ai_response(text: str) -> dict:
    """Parse structured AI response into dict."""
    result = {"summary": "", "key_topics": [], "workstreams": [], "signals": []}
    for line in text.strip().split("\n"):
        line = line.strip()
        if line.startswith("SUMMARY:"):
            result["summary"] = line[8:].strip()
        elif line.startswith("TOPICS:"):
            result["key_topics"] = [t.strip() for t in line[7:].split(",") if t.strip()]
        elif line.startswith("WORKSTREAMS:"):
            result["workstreams"] = [w.strip() for w in line[12:].split(",") if w.strip()]
        elif line.startswith("SIGNALS:"):
            result["signals"] = [s.strip() for s in line[8:].split(",") if s.strip()]
    return result


def _placeholder_ai_result() -> dict:
    return {"summary": "", "key_topics": [], "workstreams": [], "signals": []}


# ── Note Generation ──────────────────────────────────────────────────────────

def build_chat_note(
    meta: dict, messages: list[dict],
    participants: list[str], domain: str,
    ai_result: dict, name_lookup: dict,
) -> str:
    """Build complete vault note content for a chat thread."""
    fm = _build_frontmatter(meta, participants, domain, ai_result, messages)
    body = _build_body(messages, participants, ai_result, name_lookup)
    return fm + "\n\n" + body + "\n"


def _build_frontmatter(
    meta: dict, participants: list[str], domain: str,
    ai_result: dict, messages: list[dict],
) -> str:
    """Build YAML frontmatter."""
    # Find date range from messages
    timestamps = [m["timestamp"] for m in messages if not is_system_event(m)]
    if timestamps:
        earliest = min(timestamps)[:10]
        latest = max(timestamps)[:10]
        latest_date = max(timestamps)[:10]
    else:
        earliest = latest = latest_date = date.today().isoformat()

    non_system = [m for m in messages if not is_system_event(m)]
    msg_count = len(non_system)

    chat_name = meta.get("chat_name", meta.get("_chat_name", "Unknown Chat"))
    workstreams = ai_result.get("workstreams", [])
    signals = ai_result.get("signals", [])
    tags = [domain] + workstreams + signals

    lines = ["---"]
    lines.append(f"date: {latest_date}")
    lines.append("type: chat")
    lines.append(f"domain: {domain}")
    if meta.get("thread_id"):
        lines.append(f'thread-id: "{meta["thread_id"]}"')
    if meta.get("thread_type"):
        lines.append(f'thread-type: {meta["thread_type"]}')
    lines.append(f'chat-name: "{_yaml_escape(chat_name)}"')
    lines.append(_format_list("participants", participants))
    lines.append(f'date-range: "{earliest} to {latest}"')
    lines.append(f"message-count: {msg_count}")
    lines.append(_format_list("workstreams", workstreams))
    lines.append(_format_list("tags", tags))
    lines.append("calendar-event:")
    lines.append("---")
    return "\n".join(lines)


def _build_body(
    messages: list[dict], participants: list[str],
    ai_result: dict, name_lookup: dict,
) -> str:
    """Build markdown body."""
    parts = []

    # Summary
    parts.append("## Summary")
    parts.append("")
    if ai_result.get("summary"):
        parts.append(ai_result["summary"])
    else:
        parts.append("_Summary pending._")
    parts.append("")

    # Key Topics
    if ai_result.get("key_topics"):
        parts.append("## Key Topics")
        parts.append("")
        for topic in ai_result["key_topics"]:
            parts.append(f"- {topic}")
        parts.append("")

    # Participants
    parts.append("## Participants")
    parts.append("")
    for p in participants:
        parts.append(f"- [[{p}]]")
    parts.append("")

    # Messages (chronological — reverse the file order)
    parts.append("## Messages")
    parts.append("")
    non_system = [m for m in messages if not is_system_event(m)]
    non_system.reverse()  # File is reverse-chrono → flip to chrono

    for msg in non_system:
        sender = msg.get("resolved_name", msg.get("sender_raw", "Unknown"))
        ts_raw = msg["timestamp"]
        ts_fmt = _format_timestamp(ts_raw)
        body = msg.get("stripped_body", strip_html(msg["body"]))
        if not body.strip():
            continue
        parts.append(f"**[[{sender}]]** · {ts_fmt}")
        parts.append(body)
        parts.append("")
        parts.append("---")
        parts.append("")

    return "\n".join(parts)


def _format_timestamp(ts: str) -> str:
    """Format ISO timestamp to readable form."""
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        dt_cst = dt.astimezone(CST)
        return dt_cst.strftime("%Y-%m-%d %H:%M CST")
    except Exception:
        return ts[:16].replace("T", " ") + " UTC"


def _yaml_escape(s: str) -> str:
    return s.replace('"', '\\"')


def _format_list(key: str, items: list[str]) -> str:
    if not items:
        return f"{key}: []"
    return f"{key}: [{', '.join(items)}]"


# ── File Operations ──────────────────────────────────────────────────────────

def output_filename(chat_name: str) -> str:
    """Generate vault note filename from chat name."""
    safe = SANITIZE_RE.sub("-", chat_name).strip()
    if not safe:
        safe = "Unknown Chat"
    return f"{safe}.md"


def write_note(vault_root: Path, domain: str, filename: str, content: str) -> Path:
    dest_dir = vault_root / DEST_MAP[domain]
    dest_dir.mkdir(parents=True, exist_ok=True)
    out_path = dest_dir / filename
    out_path.write_text(content, encoding="utf-8")
    return out_path


def archive_input(path: Path, vault_root: Path) -> None:
    proc_dir = vault_root / "Intake" / "Chats" / "processed"
    proc_dir.mkdir(parents=True, exist_ok=True)
    dest = proc_dir / path.name
    if dest.exists():
        stem, suffix = dest.stem, dest.suffix
        n = 1
        while dest.exists():
            dest = dest.parent / f"{stem}_{n}{suffix}"
            n += 1
    shutil.move(str(path), str(dest))


# ── Processing Pipeline ──────────────────────────────────────────────────────

def process_one(
    path: Path, vault_root: Path,
    name_lookup: dict, domain_lookup: dict,
    manifest: dict, report: dict,
    use_ai: bool = True,
) -> None:
    """Process a single chat export file."""
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as e:
        report["errors"] += 1
        report["error_details"].append((path.name, str(e)))
        return

    meta, body_text = parse_header(text)
    if meta is None:
        # Legacy format — derive meta from filename
        meta = _meta_from_filename(path)

    # Check manifest
    action = should_process(meta, manifest)
    thread_key = meta.get("thread_id", meta.get("chat_name", path.stem))

    if action == "skip":
        report["skipped"] += 1
        archive_input(path, vault_root)
        return

    # Parse messages
    messages = parse_messages(body_text)
    if not messages:
        report["errors"] += 1
        report["error_details"].append((path.name, "No messages found"))
        archive_input(path, vault_root)
        return

    # Resolve participants
    if meta.get("participants"):
        raw_participants = [p.strip() for p in meta["participants"].split(",") if p.strip()]
    else:
        raw_participants = list({m["sender_raw"] for m in messages if m["sender_raw"] and not is_system_event(m)})
    participants = [resolve_name(p, name_lookup) for p in raw_participants]
    participants = list(dict.fromkeys(participants))  # dedup preserving order

    # Resolve sender names and strip HTML for each message
    for msg in messages:
        if msg["sender_raw"] and not is_system_event(msg):
            msg["resolved_name"] = resolve_name(msg["sender_raw"], name_lookup)
        else:
            msg["resolved_name"] = ""
        msg["stripped_body"] = strip_html(msg["body"])

    # Infer domain
    domain = infer_domain(participants, domain_lookup)

    # AI summary
    ai_result = _placeholder_ai_result()
    if use_ai:
        non_system = [m for m in messages if not is_system_event(m)]
        # Limit messages for AI (take most recent N)
        ai_msgs = non_system[:MAX_MESSAGES_FOR_AI]
        ai_msgs_reversed = list(reversed(ai_msgs))  # chrono order for AI
        msg_text = "\n".join(
            f"{m['resolved_name']}: {m['stripped_body']}"
            for m in ai_msgs_reversed if m["stripped_body"].strip()
        )
        if msg_text.strip():
            chat_name = meta.get("chat_name", path.stem)
            ai_result = ai_summarize(chat_name, participants, msg_text)

    # Generate note
    chat_name = meta.get("chat_name", meta.get("_chat_name", path.stem))
    meta["chat_name"] = chat_name
    filename = output_filename(chat_name)
    content = build_chat_note(meta, messages, participants, domain, ai_result, name_lookup)
    out_path = write_note(vault_root, domain, filename, content)

    # Update manifest
    non_system = [m for m in messages if not is_system_event(m)]
    timestamps = [m["timestamp"] for m in non_system]
    manifest[thread_key] = {
        "chat_name": chat_name,
        "latest_message": max(timestamps) if timestamps else "",
        "message_count": len(non_system),
        "last_processed": date.today().isoformat(),
        "output_path": str(out_path.relative_to(vault_root)),
    }

    # Archive input
    archive_input(path, vault_root)

    # Report
    if action == "new":
        report["processed"] += 1
    else:
        report["updated"] += 1
    report["details"].append((chat_name, domain, len(non_system), action))


def _meta_from_filename(path: Path) -> dict:
    """Derive meta from legacy filename (no header)."""
    stem = path.stem
    # Strip date suffix: -YYYY-MM-DD-HHMM
    date_match = re.search(r"-(\d{4}-\d{2}-\d{2}-\d{4})$", stem)
    if date_match:
        chat_name = stem[:date_match.start()]
    else:
        chat_name = stem
    return {"_chat_name": chat_name, "chat_name": chat_name}


# ── Report ───────────────────────────────────────────────────────────────────

def print_report(report: dict) -> None:
    print(f"\n=== Chat Processing Report ===")
    total = report["processed"] + report["updated"] + report["skipped"] + report["errors"]
    print(f"Total files: {total}")
    print(f"  New:     {report['processed']}")
    print(f"  Updated: {report['updated']}")
    print(f"  Skipped: {report['skipped']}")
    print(f"  Errors:  {report['errors']}")
    if report["details"]:
        print(f"\nProcessed:")
        for name, domain, count, action in report["details"]:
            print(f"  [{action}] {name} → {domain} ({count} messages)")
    if report["error_details"]:
        print(f"\nErrors:")
        for fname, reason in report["error_details"]:
            print(f"  {fname}: {reason}")


def new_report() -> dict:
    return {
        "processed": 0, "updated": 0, "skipped": 0, "errors": 0,
        "details": [], "error_details": [],
    }


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Process Teams chat exports into vault notes")
    parser.add_argument("--vault-root", type=Path, default=Path.home() / "Vaults" / "My Notes")
    parser.add_argument("--input", type=Path, help="Process a single file (default: all in Intake/Chats/)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-ai", action="store_true", help="Skip AI summarization")
    args = parser.parse_args()

    vault_root = args.vault_root.expanduser().resolve()
    if not vault_root.is_dir():
        print(f"Error: vault root not found: {vault_root}", file=sys.stderr)
        sys.exit(1)

    # Load .env for API key
    env_path = Path.home() / "dev" / "NanoClaw" / ".env"
    if env_path.exists():
        for line in env_path.read_text().split("\n"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

    name_lookup, domain_lookup = build_people_lookup(vault_root)
    print(f"People index: {len(name_lookup)} names across {len(domain_lookup)} people")

    manifest = load_manifest(vault_root)
    report = new_report()
    use_ai = not args.no_ai

    if args.input:
        files = [args.input.expanduser().resolve()]
    else:
        intake_dir = vault_root / "Intake" / "Chats"
        if not intake_dir.is_dir():
            print(f"No intake directory: {intake_dir}")
            return
        files = sorted(intake_dir.glob("*.txt"))

    if not files:
        print("No .txt files to process")
        return

    print(f"Found {len(files)} file(s), AI={'on' if use_ai else 'off'}")

    if args.dry_run:
        print("DRY RUN — would process these files:")
        for f in files:
            print(f"  {f.name}")
        return

    for path in files:
        print(f"  Processing: {path.name}")
        process_one(path, vault_root, name_lookup, domain_lookup, manifest, report, use_ai)

    save_manifest(vault_root, manifest)
    print_report(report)


if __name__ == "__main__":
    main()
