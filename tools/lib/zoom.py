"""Zoom S2S OAuth client — Python port of toolbox/shared/zoom/lib/api.sh.

Provides token caching, UUID encoding, and participant/meeting data fetching.
"""

import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from base64 import b64encode
from pathlib import Path

ZOOM_API_BASE = "https://api.zoom.us/v2"
ZOOM_TOKEN_URL = "https://zoom.us/oauth/token"


class ZoomAPIError(Exception):
    """Raised when all Zoom API fetch attempts fail."""
    pass


def _load_env_key(key_name: str, *env_files: str) -> str:
    """Load a key from environment or fallback env files."""
    val = os.environ.get(key_name)
    if val:
        return val
    for path in env_files:
        p = Path(path).expanduser()
        if p.exists():
            for line in p.read_text().splitlines():
                if line.startswith(f"{key_name}="):
                    return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def load_zoom_credentials(account: str = "training") -> dict:
    """Load Zoom S2S credentials for the given account profile.

    Checks env vars first, then ~/dev/.env.shared, then ~/dev/NanoClaw/.env.
    """
    upper = account.upper()
    env_files = (
        str(Path.home() / "dev/.env.shared"),
        str(Path.home() / "dev/NanoClaw/.env"),
    )
    account_id = _load_env_key(f"ZOOM_{upper}_ACCOUNT_ID", *env_files)
    client_id = _load_env_key(f"ZOOM_{upper}_CLIENT_ID", *env_files)
    client_secret = _load_env_key(f"ZOOM_{upper}_CLIENT_SECRET", *env_files)

    missing = []
    if not account_id:
        missing.append(f"ZOOM_{upper}_ACCOUNT_ID")
    if not client_id:
        missing.append(f"ZOOM_{upper}_CLIENT_ID")
    if not client_secret:
        missing.append(f"ZOOM_{upper}_CLIENT_SECRET")
    if missing:
        raise ValueError(f"Missing Zoom credentials for profile '{account}': {', '.join(missing)}")

    return {
        "account_id": account_id,
        "client_id": client_id,
        "client_secret": client_secret,
    }


def get_zoom_access_token(account: str = "training") -> str:
    """Get Zoom access token via S2S OAuth, with file-based caching."""
    cache_path = Path(f"/tmp/.zoom_token_cache_{account}")

    # Check cache
    if cache_path.exists():
        try:
            lines = cache_path.read_text().strip().split("\n")
            if len(lines) >= 2:
                expiry = int(lines[0])
                if expiry > int(time.time()):
                    return lines[1]
        except (ValueError, IOError):
            pass

    creds = load_zoom_credentials(account)
    basic = b64encode(f"{creds['client_id']}:{creds['client_secret']}".encode()).decode()

    data = urllib.parse.urlencode({
        "grant_type": "account_credentials",
        "account_id": creds["account_id"],
    }).encode()

    req = urllib.request.Request(
        ZOOM_TOKEN_URL,
        data=data,
        headers={
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
    except Exception as e:
        raise ZoomAPIError(f"Failed to obtain Zoom token: {e}")

    token = result.get("access_token")
    if not token:
        raise ZoomAPIError(f"No access_token in response: {result}")

    expires_in = int(result.get("expires_in", 3600))
    expiry = int(time.time()) + expires_in - 60  # 60s safety margin

    try:
        cache_path.write_text(f"{expiry}\n{token}\n")
        cache_path.chmod(0o600)
    except IOError:
        print(f"WARN: Could not cache Zoom token to {cache_path}", file=sys.stderr)

    return token


def encode_zoom_uuid(uuid: str) -> str:
    """Double URL-encode UUIDs starting with / or containing //."""
    if not uuid:
        raise ValueError("UUID must be a non-empty string")
    if uuid.startswith("/") or "//" in uuid:
        return urllib.parse.quote(urllib.parse.quote(uuid, safe=""), safe="")
    return uuid


def _zoom_api_get(endpoint: str, account: str = "training") -> dict:
    """Make a GET request to Zoom API."""
    token = get_zoom_access_token(account)
    url = f"{ZOOM_API_BASE}{endpoint}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            # Clear cache and retry once
            cache_path = Path(f"/tmp/.zoom_token_cache_{account}")
            cache_path.unlink(missing_ok=True)
            token = get_zoom_access_token(account)
            req = urllib.request.Request(url, headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            })
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        raise


def get_participants(meeting_uuid: str, account: str = "training") -> list[dict]:
    """Fetch all participants for a past meeting. Handles pagination."""
    encoded = encode_zoom_uuid(meeting_uuid)
    all_participants = []
    next_page_token = ""

    while True:
        qs = f"page_size=300"
        if next_page_token:
            qs += f"&next_page_token={next_page_token}"
        endpoint = f"/past_meetings/{encoded}/participants?{qs}"

        try:
            data = _zoom_api_get(endpoint, account)
        except Exception as e:
            if all_participants:
                print(f"WARN: Pagination failed after {len(all_participants)} participants: {e}", file=sys.stderr)
                return all_participants
            raise ZoomAPIError(f"Failed to fetch participants for {meeting_uuid}: {e}")

        participants = data.get("participants", [])
        for p in participants:
            # Ensure expected keys exist
            for key in ("name", "join_time", "leave_time", "duration", "status"):
                if key not in p:
                    p[key] = None
            all_participants.append(p)

        next_page_token = data.get("next_page_token", "")
        if not next_page_token:
            break

    return all_participants


def get_meeting(meeting_uuid: str, account: str = "training") -> dict:
    """Fetch past meeting details (start_time, duration, topic)."""
    encoded = encode_zoom_uuid(meeting_uuid)
    try:
        return _zoom_api_get(f"/past_meetings/{encoded}", account)
    except Exception as e:
        raise ZoomAPIError(f"Failed to fetch meeting {meeting_uuid}: {e}")
