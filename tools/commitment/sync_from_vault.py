#!/usr/bin/env python3
"""Sync action items from vault meeting notes to Things 3 + commitment register.

Three-tier classification:
  Tier 1 (My Actions)   — Alex owns it → Things 3 "My Actions" heading + register
  Tier 2 (Waiting For)  — Direct report owns it → Things 3 "Waiting For" heading + register
  Tier 3 (Peripheral)   — Anyone else → register only (briefing visibility)

Usage: python sync_from_vault.py [--vault-root PATH] [--dry-run]
"""

import argparse
import fcntl
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import uuid
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

# ── Constants ────────────────────────────────────────────────────────────────

CST = ZoneInfo("America/Chicago")
VAULT_ROOT_DEFAULT = Path.home() / "Vaults" / "My Notes"
REGISTER_REL = Path("meta") / "commitment-register.json"
LOCK_REL = Path("meta") / ".locks" / "commitment-register.lock"
MEETING_DIRS = [
    "Solera/Meetings", "Solera/One on Ones", "Solera/Management",
    "Solera/Platform", "Solera/Billing", "Solera/GFS",
    "Tandem/Meetings", "CNPC/Meetings",
]
ACTION_TABLE_RE = re.compile(
    r"^\|\s*(?P<owner>[^|]+)\|\s*(?P<action>[^|]+)\|\s*(?P<due>[^|]+)\|\s*(?P<status>[^|]+)\|",
)
HEADER_RE = re.compile(r"^\|[-\s|]+\|$")
SELF_NAMES = {"alex kudinov", "alex", "kudinov"}

# Common English nicknames → canonical first name (bidirectional)
NICKNAMES = {
    "michael": "mike", "mike": "michael",
    "thomas": "tom", "tom": "thomas",
    "christopher": "chris", "chris": "christopher",
    "william": "bill", "bill": "william",
    "robert": "bob", "bob": "robert",
    "james": "jim", "jim": "james",
    "richard": "rich", "rich": "richard",
    "daniel": "dan", "dan": "daniel",
    "benjamin": "ben", "ben": "benjamin",
    "matthew": "matt", "matt": "matthew",
    "nicholas": "nick", "nick": "nicholas",
    "timothy": "tim", "tim": "timothy",
    "sandra": "sandy", "sandy": "sandra",
}

# Tier labels
TIER_MY_ACTIONS = "my-actions"
TIER_WAITING_FOR = "waiting-for"
TIER_PERIPHERAL = "peripheral"

# Things 3 heading names
HEADING_MY_ACTIONS = "My Actions"
HEADING_WAITING_FOR = "Waiting For"
HEADING_OTHER = "Other"
INITIATIVES_REL = Path("meta") / "things-initiatives.json"

# Max items per things:///json call (URL length safety)
THINGS_BATCH_SIZE = 15


# ── People & Agenda Loading ────────────────────────────────────────────────

def load_direct_reports(vault_root: Path) -> set[str]:
    """Load names of Alex's direct reports from People notes.

    Generates name variants using nickname mapping so "Mike Chandler"
    matches "Michael Chandler.md" and vice versa.
    """
    reports = set()
    people_dir = vault_root / "Solera" / "People"
    if not people_dir.is_dir():
        return reports
    for md in people_dir.glob("*.md"):
        if ".sync-conflict-" in md.name:
            continue
        fm = parse_frontmatter(md)
        if not fm:
            continue
        if fm.get("reports-to", "").strip() == "Alex Kudinov":
            name = md.stem  # e.g., "Michael Chandler"
            reports.add(name.lower())
            # Add aliases
            for alias in fm.get("aliases", []) or []:
                reports.add(str(alias).lower())
            # Generate nickname variants: "Michael Chandler" → "Mike Chandler"
            parts = name.split()
            if len(parts) >= 2:
                first = parts[0].lower()
                rest = " ".join(parts[1:]).lower()
                if first in NICKNAMES:
                    reports.add(f"{NICKNAMES[first]} {rest}")
                # Add bare first name for matching [[Sandro]], [[Kevin]], etc.
                reports.add(first)
                # Also add last name for matching [[Ripperger]], etc.
                last = parts[-1].lower()
                if len(last) > 3:
                    reports.add(last)
    return reports


def load_agenda_mapping(vault_root: Path) -> dict[str, str]:
    """Load workstream → agenda name mapping from agenda notes.

    Two-pass: primary workstreams (first in each agenda's list) always win,
    then secondary workstreams fill remaining gaps. This ensures "peri" maps
    to "Peri Payments Platform" (where it's primary) not "E-Commerce Expansion"
    (where it's secondary).
    """
    agendas_dir = vault_root / "Solera" / "Agendas"
    if not agendas_dir.is_dir():
        return {}

    # Collect all agendas with their workstream lists
    agendas = []
    for md in agendas_dir.glob("*.md"):
        fm = parse_frontmatter(md)
        if not fm or fm.get("type") != "agenda":
            continue
        name = fm.get("name", "")
        ws_list = fm.get("workstreams", []) or []
        if name and ws_list:
            agendas.append((name, ws_list))

    mapping = {}
    # Pass 1: primary workstream (first in list) always wins.
    # Tie-breaker: if two agendas claim the same primary, prefer the one
    # whose name contains the workstream (e.g., "D365/ERP" wins "erp" over
    # "Team & Talent" even though both list it first).
    primary_claims: dict[str, list[tuple[str, list[str]]]] = {}
    for name, ws_list in agendas:
        primary = ws_list[0]
        primary_claims.setdefault(primary, []).append((name, ws_list))

    for ws, claimants in primary_claims.items():
        if len(claimants) == 1:
            mapping[ws] = claimants[0][0]
        else:
            # Tie-break: prefer agenda whose name contains the workstream
            best = None
            for name, _ in claimants:
                if ws.replace("-", " ") in name.lower().replace("/", " "):
                    best = name
                    break
            mapping[ws] = best or claimants[0][0]

    # Pass 2: secondary workstreams fill gaps
    for name, ws_list in agendas:
        for ws in ws_list[1:]:
            if ws not in mapping:
                mapping[ws] = name

    return mapping


def load_things_project_ids() -> dict[str, str]:
    """Get agenda name → Things 3 project ID mapping via JXA."""
    script = '''
var things = Application("Things3");
var projects = things.projects();
var result = {};
for (var i = 0; i < projects.length; i++) {
    var p = projects[i];
    try {
        if (p.area().name() === "Solera Agendas") {
            result[p.name()] = p.id();
        }
    } catch(e) {}
}
JSON.stringify(result);
'''
    try:
        result = subprocess.run(
            ["osascript", "-l", "JavaScript", "-e", script],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            return json.loads(result.stdout.strip())
    except (subprocess.TimeoutExpired, json.JSONDecodeError):
        pass
    return {}


def build_agenda_to_project_id(
    ws_to_agenda: dict[str, str],
    things_projects: dict[str, str],
) -> dict[str, str]:
    """Build agenda name → Things project ID, handling name mismatches.

    Agenda vault names use hyphens (e.g., "Salesforce-CRM Architecture")
    while Things uses slashes/ampersands (e.g., "Salesforce/CRM Architecture").
    """
    # Normalize: strip punctuation for fuzzy match
    def normalize(s: str) -> str:
        return re.sub(r"[/&\-]", " ", s).lower().strip()

    things_by_norm = {normalize(k): (k, v) for k, v in things_projects.items()}
    mapping = {}
    for agenda_name in set(ws_to_agenda.values()):
        norm = normalize(agenda_name)
        if norm in things_by_norm:
            mapping[agenda_name] = things_by_norm[norm][1]
        else:
            # Try substring match
            for tn, (orig, pid) in things_by_norm.items():
                if norm in tn or tn in norm:
                    mapping[agenda_name] = pid
                    break
    return mapping


# ── Initiative Clustering ──────────────────────────────────────────────────

def load_initiatives(vault_root: Path) -> dict[str, list[dict]]:
    """Load initiative definitions per agenda from things-initiatives.json."""
    path = vault_root / INITIATIVES_REL
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        # Strip the _doc key
        return {k: v for k, v in data.items() if not k.startswith("_")}
    except (json.JSONDecodeError, OSError):
        return {}


def match_initiative(
    action_text: str, meeting_subject: str,
    agenda_initiatives: list[dict],
) -> str:
    """Match an action item to an initiative by keyword. Returns heading name."""
    combined = (action_text + " " + meeting_subject).lower()
    for init in agenda_initiatives:
        for kw in init.get("keywords", []):
            if kw.lower() in combined:
                return init["name"]
    return HEADING_OTHER


# ── AI Agenda Classification ───────────────────────────────────────────────

BRIDGE_URL = "http://100.115.115.206:40960/v1/print"
ENV_SHARED = Path.home() / "dev" / ".env.shared"

AGENDA_PROMPT_HEADER = """Classify each action item into the BEST matching agenda based on the item's content, not the source meeting.

Available agendas (pick exactly one per item):
1. Peri Payments Platform — Peri/Adyen payments, Genesis integration, payment terminals, 3DS, Apple Pay
2. Billing Platform Consolidation — BP migration, cash application, DealerSocket, bundles, UK/Europe expansion, Xactly, vendor/SOW, NetSuite
3. D365/ERP Implementation — D365 migration, vendor selection (RSM/KPMG), licensing, API Hub, SOLID, Exflow, project governance
4. AI Adoption & Culture — AI dev tools, GitHub Copilot, AI adoption metrics, ChatGPT commerce, AI workflow
5. PEPPOL Compliance — Poland KSeF, Belgium, Pagero, e-invoicing
6. Salesforce/CRM Architecture — CRM, win-back/AgentForce, CPQ, address validation, Pentana, Revenue Cloud, QSM
7. E-Commerce Expansion — Gold Star, HPI, Hollander, CAP, Shop Central, WooCommerce
8. Team & Talent Development — hiring, onboarding, team development, performance, delegation, workshops"""


def _get_bridge_key() -> str:
    if os.environ.get("CLAUDE_BRIDGE_KEY"):
        return os.environ["CLAUDE_BRIDGE_KEY"]
    if ENV_SHARED.exists():
        for line in ENV_SHARED.read_text().splitlines():
            if line.startswith("CLAUDE_BRIDGE_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def classify_items_by_agenda(
    items: list[dict],
    fallback_agenda: str | None,
) -> list[str]:
    """Classify action items into agendas using AI (Haiku via Print Bridge).

    Args:
        items: list of {action, owner} dicts
        fallback_agenda: agenda to use if bridge is unavailable

    Returns:
        list of agenda names, one per item, in same order as input
    """
    if not items:
        return []

    key = _get_bridge_key()
    if not key:
        print("  WARN: No bridge key — using workstream fallback", file=sys.stderr)
        return [fallback_agenda or ""] * len(items)

    item_lines = "\n".join(
        f"{i+1}. {it['owner']}: {it['action'][:120]}"
        if it.get("owner") else f"{i+1}. {it['action'][:120]}"
        for i, it in enumerate(items)
    )

    prompt = (
        f"{AGENDA_PROMPT_HEADER}\n\n"
        f"Items to classify:\n{item_lines}\n\n"
        f"Respond with ONLY a JSON array: "
        f'[{{"item": 1, "agenda": "exact agenda name"}}]'
    )

    body = json.dumps({"prompt": prompt, "model": "haiku"}).encode()
    req = urllib.request.Request(
        BRIDGE_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Bridge-Key": key,
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
        if not result.get("ok"):
            raise RuntimeError(result.get("error", "Bridge error"))

        text = result["data"]["result"]
        # Extract JSON from response (may be wrapped in ```json ... ```)
        json_match = re.search(r"\[.*\]", text, re.DOTALL)
        if not json_match:
            raise ValueError("No JSON array in response")

        classifications = json.loads(json_match.group())
        # Build index → agenda mapping
        agenda_by_idx = {}
        for c in classifications:
            agenda_by_idx[c["item"]] = c["agenda"]

        return [
            agenda_by_idx.get(i + 1, fallback_agenda or "")
            for i in range(len(items))
        ]

    except Exception as e:
        print(f"  WARN: AI classification failed ({e}) — using fallback", file=sys.stderr)
        return [fallback_agenda or ""] * len(items)


# ── Tier Classification ────────────────────────────────────────────────────

def strip_wikilinks(text: str) -> str:
    """Remove [[wikilink]] markup: [[display|text]] → text, [[text]] → text."""
    return re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", text)


def classify_item(owner_raw: str, direct_reports: set[str]) -> str:
    """Classify an action item into a tier."""
    owner_clean = strip_wikilinks(owner_raw).strip().lower()
    if owner_clean in SELF_NAMES:
        return TIER_MY_ACTIONS
    if owner_clean in direct_reports:
        return TIER_WAITING_FOR
    return TIER_PERIPHERAL


# ── Things 3 Interaction ──────────────────────────────────────────────────

def ensure_things_running() -> None:
    """Ensure Things 3 is running."""
    result = subprocess.run(["pgrep", "-x", "Things3"], capture_output=True)
    if result.returncode != 0:
        subprocess.run(["open", "-a", "Things3"], check=True)
        time.sleep(2)


def _iso_to_applescript_date(iso_date: str) -> str:
    """Convert ISO date (2026-03-26) to AppleScript format (March 26, 2026).

    AppleScript's `date "2026-03-26"` produces year 12000+.
    Must use `date "March 26, 2026"` instead.
    """
    try:
        parts = iso_date.split("-")
        if len(parts) != 3:
            return ""
        y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
        months = [
            "", "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December",
        ]
        return f"{months[m]} {d}, {y}"
    except (ValueError, IndexError):
        return ""


def things_add_todo(
    title: str, notes: str = "", project: str = "",
    deadline: str = "",
) -> str | None:
    """Create a Things 3 todo via AppleScript. Returns todo ID or None."""
    def esc(s):
        return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")

    props = f'name:"{esc(title)}"'
    if notes:
        props += f', notes:"{esc(notes)}"'
    if deadline:
        as_date = _iso_to_applescript_date(deadline)
        if as_date:
            props += f', due date:date "{as_date}"'

    lines = [
        'tell application "Things3"',
        f'    set newTodo to make new to do with properties {{{props}}}',
    ]
    if project:
        lines.append(f'    set project of newTodo to project "{esc(project)}"')
    lines.append('    return id of newTodo')
    lines.append('end tell')

    try:
        result = subprocess.run(
            ["osascript", "-e", "\n".join(lines)],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, subprocess.SubprocessError):
        pass
    return None


def things_search_title(title: str) -> list[dict]:
    """Search Things 3 for todos matching title. Returns list of {id, name}."""
    esc = title.replace("\\", "\\\\").replace('"', '\\"')
    script = f'''
var things = Application("Things3");
var todos = things.toDos.whose({{name: {{_contains: "{esc}"}}}})();
var results = [];
for (var i = 0; i < Math.min(todos.length, 5); i++) {{
    results.push({{id: todos[i].id(), name: todos[i].name()}});
}}
JSON.stringify(results);
'''
    try:
        result = subprocess.run(
            ["osascript", "-l", "JavaScript", "-e", script],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            return json.loads(result.stdout.strip())
    except (subprocess.TimeoutExpired, json.JSONDecodeError):
        pass
    return []


def things_find_id(title: str) -> str | None:
    """Find the Things 3 ID for a todo by exact title match."""
    results = things_search_title(title[:60])
    for r in results:
        if r["name"] == title:
            return r["id"]
    return None


# ── Vault Reading ─────────────────────────────────────────────────────────

def find_meeting_notes(vault_root: Path) -> list[Path]:
    """Find meeting notes with has-actions that haven't been synced."""
    notes = []
    for rel_dir in MEETING_DIRS:
        meeting_dir = vault_root / rel_dir
        if not meeting_dir.is_dir():
            continue
        for md in meeting_dir.rglob("*.md"):
            if ".sync-conflict-" in md.name:
                continue
            fm = parse_frontmatter(md)
            if not fm:
                continue
            if fm.get("type") != "meeting-summary":
                continue
            tags = fm.get("tags", []) or []
            if "has-actions" not in tags:
                continue
            if fm.get("things-synced") is True:
                continue
            notes.append(md)
    return notes


def parse_frontmatter(path: Path) -> dict | None:
    """Parse YAML frontmatter from markdown file."""
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


def parse_action_items(path: Path) -> list[dict]:
    """Parse action items from ## Action Items table in note body."""
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return []

    in_section = False
    in_table = False
    items = []

    for line in text.split("\n"):
        stripped = line.strip()
        if stripped.startswith("## Action Items") or stripped.startswith("## Action items"):
            in_section = True
            continue
        if in_section and stripped.startswith("## "):
            break
        if not in_section:
            continue

        if stripped.startswith("| Owner") or stripped.startswith("|Owner"):
            in_table = True
            continue
        if HEADER_RE.match(stripped):
            continue

        if in_table and stripped.startswith("|"):
            m = ACTION_TABLE_RE.match(stripped)
            if m:
                owner = m.group("owner").strip()
                action = m.group("action").strip()
                due = m.group("due").strip()
                status = m.group("status").strip().lower()
                if owner and action and status != "completed":
                    items.append({
                        "owner": owner,
                        "action": action,
                        "due_date": due if due and due != "TBD" else None,
                        "status": status or "open",
                    })
        elif in_table and not stripped:
            break

    return items


# ── Commitment Register ───────────────────────────────────────────────────

def load_register(vault_root: Path) -> dict:
    """Load commitment register."""
    path = vault_root / REGISTER_REL
    if not path.exists():
        return {"schema_version": 2, "last_sync_run": None, "commitments": []}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"schema_version": 2, "last_sync_run": None, "commitments": []}


def save_register(vault_root: Path, register: dict) -> None:
    """Save commitment register atomically with file locking."""
    path = vault_root / REGISTER_REL
    lock_path = vault_root / LOCK_REL
    lock_path.parent.mkdir(parents=True, exist_ok=True)

    with open(lock_path, "w") as lock_fd:
        fcntl.flock(lock_fd, fcntl.LOCK_EX)
        try:
            tmp = path.with_suffix(".tmp")
            tmp.write_text(
                json.dumps(register, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            tmp.replace(path)
        finally:
            fcntl.flock(lock_fd, fcntl.LOCK_UN)


def commitment_exists(register: dict, source: str, action: str) -> bool:
    """Check if a commitment already exists (dedup by source + action text)."""
    for c in register.get("commitments", []):
        if c.get("source") == source and c.get("action") == action:
            return True
    return False


# ── Frontmatter Update ────────────────────────────────────────────────────

def set_things_synced(path: Path) -> bool:
    """Set things-synced: true in note frontmatter."""
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return False

    if not text.startswith("---"):
        return False
    end = text.find("\n---", 3)
    if end < 0:
        return False

    fm_text = text[4:end]
    body = text[end + 4:]

    try:
        fm = yaml.safe_load(fm_text) or {}
    except yaml.YAMLError:
        return False

    fm["things-synced"] = True
    new_fm = yaml.dump(
        fm, default_flow_style=False, allow_unicode=True,
        sort_keys=False, width=120,
    )
    new_text = "---\n" + new_fm + "---" + body
    path.write_text(new_text, encoding="utf-8")
    return True


# ── Helpers ────────────────────────────────────────────────────────────────

def _build_commitment(
    ci: dict, source: str, source_date: str,
    workstreams: list[str], agenda: str | None,
    meeting_subject: str, agenda_inits: list[dict],
    initiatives: dict,
) -> dict:
    """Build a commitment register entry."""
    item_initiative = match_initiative(
        ci["action"], meeting_subject, agenda_inits,
    ) if agenda_inits else None

    return {
        "id": str(uuid.uuid4()),
        "source": source,
        "source-date": source_date,
        "owner": ci["owner_clean"],
        "action": ci["action"],
        "due-date": ci["due_date"],
        "status": ci["status"],
        "tier": ci["tier"],
        "initiative": item_initiative,
        "things-id": None,
        "things-status": None,
        "agenda": agenda,
        "workstreams": workstreams,
        "created": datetime.now(CST).isoformat(),
        "last-checked": datetime.now(CST).isoformat(),
        "resolved-in": None,
    }


# ── Main Pipeline ─────────────────────────────────────────────────────────

def process_note(
    path: Path, vault_root: Path, register: dict,
    ws_to_agenda: dict, agenda_to_project: dict,
    direct_reports: set[str], initiatives: dict,
    things_name_to_id: dict, dry_run: bool,
) -> dict:
    """Process one meeting note. Returns {my_actions, waiting_for, peripheral}."""
    counts = {TIER_MY_ACTIONS: 0, TIER_WAITING_FOR: 0, TIER_PERIPHERAL: 0}

    fm = parse_frontmatter(path)
    if not fm:
        return counts

    items = parse_action_items(path)
    if not items:
        print(f"  No action items in {path.name}")
        if not dry_run:
            set_things_synced(path)
        return counts

    source = f"[[{path.relative_to(vault_root)}]]".replace("\\", "/")
    source_date = str(fm.get("date", ""))
    workstreams = fm.get("workstreams", []) or []
    meeting_subject = fm.get("subject", "") or path.stem

    # Mechanical fallback agenda (first workstream match)
    fallback_agenda = None
    for ws in workstreams:
        if ws in ws_to_agenda:
            fallback_agenda = ws_to_agenda[ws]
            break

    rel_path = str(path.relative_to(vault_root)).replace("\\", "/")
    obsidian_file = rel_path.removesuffix(".md")
    obsidian_uri = (
        f"obsidian://open?vault=My%20Notes"
        f"&file={obsidian_file.replace(' ', '%20')}"
    )

    # Pass 1: classify tiers, collect Tier 1/2 items for AI agenda classification
    classified_items = []
    for item in items:
        tier = classify_item(item["owner"], direct_reports)
        owner_clean = strip_wikilinks(item["owner"]).strip()

        if commitment_exists(register, source, item["action"]):
            print(f"  SKIP (dup) [{tier}]: {item['action'][:50]}")
            continue

        classified_items.append({
            **item,
            "tier": tier,
            "owner_clean": owner_clean,
        })

    # Separate peripheral (no AI needed) from Tier 1/2 (need agenda classification)
    things_items = [ci for ci in classified_items if ci["tier"] != TIER_PERIPHERAL]
    peripheral_items = [ci for ci in classified_items if ci["tier"] == TIER_PERIPHERAL]

    # Register peripheral items immediately (fallback agenda, no Things)
    for ci in peripheral_items:
        agenda_inits = initiatives.get(fallback_agenda, []) if fallback_agenda else []
        commitment = _build_commitment(
            ci, source, source_date, workstreams, fallback_agenda,
            meeting_subject, agenda_inits, initiatives,
        )
        register["commitments"].append(commitment)
        counts[TIER_PERIPHERAL] += 1
        if dry_run:
            print(f"  REGISTER [{TIER_PERIPHERAL}]: {ci['owner_clean']} — {ci['action'][:50]}")

    # Pass 2: AI-classify Tier 1/2 items into agendas (one bridge call per note)
    if things_items:
        ai_agendas = classify_items_by_agenda(
            [{"action": ci["action"], "owner": ci["owner_clean"]} for ci in things_items],
            fallback_agenda,
        )

        for ci, ai_agenda in zip(things_items, ai_agendas):
            agenda = ai_agenda or fallback_agenda
            project_id = agenda_to_project.get(agenda, "")
            tier = ci["tier"]

            agenda_inits = initiatives.get(agenda, []) if agenda else []
            commitment = _build_commitment(
                ci, source, source_date, workstreams, agenda,
                meeting_subject, agenda_inits, initiatives,
            )

            title = ci["action"] if tier == TIER_MY_ACTIONS else f"{ci['owner_clean']}: {ci['action']}"

            if not project_id:
                register["commitments"].append(commitment)
                counts[tier] += 1
                print(f"  REGISTER (no project) [{tier}]: {title[:50]} → {agenda}")
                continue

            if dry_run:
                register["commitments"].append(commitment)
                counts[tier] += 1
                print(f"  DRY RUN [{tier}]: {title[:50]} → {agenda}")
                continue

            # Find Things project name for AppleScript
            project_name = agenda or ""
            for tname, tid in (things_name_to_id or {}).items():
                if tid == project_id:
                    project_name = tname
                    break

            notes_text = f"Source: {obsidian_uri}\nDate: {source_date}"
            things_id = things_add_todo(
                title=title,
                notes=notes_text,
                project=project_name,
                deadline=ci["due_date"] or "",
            )

            commitment["things-id"] = things_id
            commitment["things-status"] = "open" if things_id else None
            register["commitments"].append(commitment)
            counts[tier] += 1

            if things_id:
                print(f"  PUSHED [{tier}]: {title[:50]} → {agenda}")
            else:
                print(f"  FAILED: {title[:50]}", file=sys.stderr)

    if not dry_run:
        set_things_synced(path)

    return counts


def run(vault_root: Path, dry_run: bool = False, since: str | None = None) -> None:
    """Run the full sync pipeline."""
    print("Loading configuration...")
    direct_reports = load_direct_reports(vault_root)
    print(f"  Direct reports: {len(direct_reports)} names/aliases")

    ws_to_agenda = load_agenda_mapping(vault_root)
    print(f"  Workstream→agenda mappings: {len(ws_to_agenda)}")

    initiatives = load_initiatives(vault_root)
    print(f"  Initiative definitions: {sum(len(v) for v in initiatives.values())} across {len(initiatives)} agendas")

    if not dry_run:
        ensure_things_running()
    things_projects = load_things_project_ids()
    agenda_to_project = build_agenda_to_project_id(ws_to_agenda, things_projects)
    print(f"  Agenda→Things project mappings: {len(agenda_to_project)}")

    notes = find_meeting_notes(vault_root)
    if not notes:
        print("\nNo unsynced meeting notes with has-actions found.")
        return

    # Apply date cutoff — mark older notes as synced without processing
    if since:
        recent = []
        skipped = 0
        for note in notes:
            fm = parse_frontmatter(note)
            note_date = str(fm.get("date", "")) if fm else ""
            if note_date and note_date < since:
                if not dry_run:
                    set_things_synced(note)
                skipped += 1
            else:
                recent.append(note)
        if skipped:
            print(f"\nMarked {skipped} pre-{since} notes as synced (skipped)")
        notes = recent

    print(f"\nFound {len(notes)} note(s) to process")
    register = load_register(vault_root)

    totals = {TIER_MY_ACTIONS: 0, TIER_WAITING_FOR: 0, TIER_PERIPHERAL: 0}
    for note in sorted(notes):
        print(f"\n{'─' * 60}")
        print(f"  {note.name}")
        counts = process_note(
            note, vault_root, register, ws_to_agenda,
            agenda_to_project, direct_reports, initiatives,
            things_projects, dry_run,
        )
        for k in totals:
            totals[k] += counts.get(k, 0)

    if not dry_run:
        register["last_sync_run"] = datetime.now(CST).isoformat()
        save_register(vault_root, register)

    print(f"\n{'═' * 60}")
    print(f"Sync complete:")
    print(f"  My Actions (Things):    {totals[TIER_MY_ACTIONS]}")
    print(f"  Waiting For (Things):   {totals[TIER_WAITING_FOR]}")
    print(f"  Peripheral (register):  {totals[TIER_PERIPHERAL]}")
    print(f"  Total:                  {sum(totals.values())}")


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Sync vault action items to Things 3 (three-tier model)",
    )
    parser.add_argument("--vault-root", type=Path, default=VAULT_ROOT_DEFAULT)
    parser.add_argument("--dry-run", action="store_true", help="Preview without pushing")
    parser.add_argument(
        "--since", type=str, default=None,
        help="Only process notes dated on or after YYYY-MM-DD (older notes marked synced)",
    )
    args = parser.parse_args()
    run(args.vault_root.expanduser().resolve(), args.dry_run, since=args.since)


if __name__ == "__main__":
    main()
