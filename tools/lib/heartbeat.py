"""Heartbeat API client — user lookup and name matching.

Extracted from tools/enricher/distribute_session.py for reuse by
track_attendance.py and other enrichment scripts.
"""

import json
import os
import re
import sys
import time
from pathlib import Path

HEARTBEAT_API = "https://api.heartbeat.chat/v0"
HEARTBEAT_USERS_CACHE = Path("/tmp/hb-users-cache.json")
HEARTBEAT_CACHE_MAX_AGE = 86400  # 24 hours


def load_heartbeat_key() -> str:
    """Load Heartbeat API key from env, container secrets, or host env files."""
    key = os.environ.get("HEARTBEAT_API_KEY")
    if key:
        return key
    # Container secrets file (written by agent-runner)
    secrets_file = Path("/tmp/.nanoclaw-env")
    if secrets_file.exists():
        for line in secrets_file.read_text().splitlines():
            if line.startswith("HEARTBEAT_API_KEY="):
                return line.split("=", 1)[1].strip().strip("'\"")
    # Host fallback — shared env
    shared_env = Path.home() / "dev/.env.shared"
    if shared_env.exists():
        for line in shared_env.read_text().splitlines():
            if line.startswith("HEARTBEAT_API_KEY="):
                return line.split("=", 1)[1].strip().strip("'\"")
    # Host fallback — tandemweb
    tandemweb_env = Path.home() / "dev/tandemweb/.env"
    if tandemweb_env.exists():
        for line in tandemweb_env.read_text().splitlines():
            if line.startswith("HEARTBEAT_API_KEY="):
                return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def get_heartbeat_users() -> list[dict]:
    """Get all Heartbeat users, with 24h file cache. Falls back to stale cache on error."""
    import urllib.request
    import urllib.error

    if HEARTBEAT_USERS_CACHE.exists():
        age = time.time() - HEARTBEAT_USERS_CACHE.stat().st_mtime
        if age < HEARTBEAT_CACHE_MAX_AGE:
            return json.loads(HEARTBEAT_USERS_CACHE.read_text())

    api_key = load_heartbeat_key()
    if not api_key:
        print("  WARN: No HEARTBEAT_API_KEY, skipping user matching", file=sys.stderr)
        return []

    try:
        all_users = []
        params = "limit=100"
        while True:
            url = f"{HEARTBEAT_API}/users?{params}"
            req = urllib.request.Request(url, headers={"Authorization": f"Bearer {api_key}"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
            users = data if isinstance(data, list) else data.get("data", data.get("users", []))
            if not isinstance(users, list):
                users = [users]
            all_users.extend(users)
            has_more = data.get("hasMore", False) if isinstance(data, dict) else False
            if not has_more or not users:
                break
            last_id = users[-1].get("id", "")
            if not last_id:
                break
            params = f"limit=100&startingAfter={last_id}"

        HEARTBEAT_USERS_CACHE.write_text(json.dumps(all_users))
        return all_users
    except (urllib.error.URLError, urllib.error.HTTPError) as e:
        print(f"  WARN: Heartbeat API failed: {e}", file=sys.stderr)
        # Fall back to stale cache if it exists
        if HEARTBEAT_USERS_CACHE.exists():
            print("  WARN: Using stale Heartbeat cache", file=sys.stderr)
            return json.loads(HEARTBEAT_USERS_CACHE.read_text())
        return []


def match_attendees(
    attendee_names: list[str],
    hb_users: list[dict],
    skip_names: set[str] | None = None,
) -> list[dict]:
    """Match transcript attendee names to Heartbeat users.

    Returns list of dicts with keys: name (str), email (str — may be empty).
    """
    matched = []
    for name in attendee_names:
        if skip_names and name.lower() in skip_names:
            continue
        # Clean parenthetical aliases: "Misha (Nisha)" -> search both
        clean = re.sub(r'\s*\([^)]*\)', '', name).strip()
        name_lower = clean.lower()

        # Exact match first
        exact = [u for u in hb_users
                 if name_lower == (u.get("name", "") or "").lower()
                 or name_lower == (u.get("displayName", "") or "").lower()]
        if exact:
            matched.append({"name": name, "email": exact[0].get("email", "")})
            continue

        # Partial match (full name substring)
        partial = [u for u in hb_users
                   if name_lower in (u.get("name", "") or "").lower()
                   or (u.get("name", "") or "").lower() in name_lower]
        if len(partial) == 1:
            matched.append({"name": name, "email": partial[0].get("email", "")})
            continue

        # Last name match (handles Rick/Ricardo Gonzalez, Ed/Edward Utz)
        parts = name_lower.split()
        if len(parts) >= 2:
            last = parts[-1]
            fl_match = [u for u in hb_users
                        if last in (u.get("name", "") or "").lower()]
            if fl_match:
                matched.append({"name": name, "email": fl_match[0].get("email", "")})
                continue

        # First name only (risky, only if unique-ish)
        if parts:
            first = parts[0]
            first_match = [u for u in hb_users
                           if (u.get("name", "") or "").lower().startswith(first + " ")]
            if len(first_match) == 1:
                matched.append({"name": name, "email": first_match[0].get("email", "")})
                continue

        print(f"  WARN: No match for '{name}'", file=sys.stderr)

    # Deduplicate by email
    seen = set()
    deduped = []
    for m in matched:
        if m["email"] and m["email"] not in seen:
            seen.add(m["email"])
            deduped.append(m)
    return deduped
