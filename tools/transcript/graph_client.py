"""Microsoft Graph API client with MSAL delegated auth and token caching."""

import json
import os
import sys
from pathlib import Path

import msal
import requests

# Azure CLI well-known client ID — try this first.
# If blocked (AADSTS50105), swap to a custom app registration.
DEFAULT_CLIENT_ID = "04b07795-a220-4244-b0b2-9ed196aab97b"

TENANT_ID = "c45b48f3-13bb-448b-9356-ba7b863c2189"
GRAPH_BASE = "https://graph.microsoft.com/v1.0"

SCOPES = [
    "OnlineMeetingTranscript.Read.All",
    "OnlineMeetingRecording.Read.All",
    "OnlineMeetingArtifact.Read.All",
]

TOKEN_CACHE_PATH = Path.home() / ".cache" / "nanoclaw" / "msal_token_cache.json"


def _load_client_id():
    """Read client ID from env or .env, fall back to Azure CLI default."""
    cid = os.environ.get("GRAPH_CLIENT_ID")
    if cid:
        return cid
    env_path = Path(__file__).parent.parent.parent / ".env"
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                if line.strip().startswith("GRAPH_CLIENT_ID="):
                    return line.strip().split("=", 1)[1].strip().strip("'\"")
    return DEFAULT_CLIENT_ID


def _build_app(client_id=None):
    """Build MSAL PublicClientApplication with persistent token cache."""
    cid = client_id or _load_client_id()
    cache = msal.SerializableTokenCache()

    TOKEN_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    if TOKEN_CACHE_PATH.exists():
        cache.deserialize(TOKEN_CACHE_PATH.read_text())

    app = msal.PublicClientApplication(
        cid,
        authority=f"https://login.microsoftonline.com/{TENANT_ID}",
        token_cache=cache,
    )
    return app, cache


def _save_cache(cache):
    if cache.has_state_changed:
        TOKEN_CACHE_PATH.write_text(cache.serialize())


def authenticate(client_id=None):
    """Authenticate via cached token or device code flow. Returns access token."""
    app, cache = _build_app(client_id)

    # Try silent auth first (cached refresh token)
    accounts = app.get_accounts()
    if accounts:
        result = app.acquire_token_silent(SCOPES, account=accounts[0])
        if result and "access_token" in result:
            _save_cache(cache)
            return result["access_token"]

    # Fall back to device code flow
    flow = app.initiate_device_flow(SCOPES)
    if "user_code" not in flow:
        raise RuntimeError(f"Device flow failed: {flow.get('error_description')}")

    print(flow["message"], file=sys.stderr)
    result = app.acquire_token_by_device_flow(flow)

    if "access_token" not in result:
        raise RuntimeError(
            f"Auth failed: {result.get('error')}: {result.get('error_description')}"
        )

    _save_cache(cache)
    return result["access_token"]


class GraphClient:
    """Thin wrapper around Graph API with automatic auth."""

    def __init__(self, token=None, client_id=None):
        self.token = token or authenticate(client_id)
        self.session = requests.Session()
        self.session.headers["Authorization"] = f"Bearer {self.token}"

    def get(self, path, params=None, headers=None):
        url = f"{GRAPH_BASE}{path}" if path.startswith("/") else path
        r = self.session.get(url, params=params, headers=headers)
        r.raise_for_status()
        return r

    def get_json(self, path, params=None):
        return self.get(path, params=params).json()

    def get_meeting_by_thread(self, thread_id):
        """Look up an online meeting by its chat thread ID."""
        data = self.get_json(
            "/me/onlineMeetings",
            params={"$filter": f"ChatInfo/ThreadId eq '{thread_id}'"},
        )
        meetings = data.get("value", [])
        if not meetings:
            return None
        return meetings[0]

    def list_transcripts(self, meeting_id):
        """List transcripts for an online meeting."""
        data = self.get_json(f"/me/onlineMeetings/{meeting_id}/transcripts")
        return data.get("value", [])

    def get_transcript_content(self, meeting_id, transcript_id, fmt="text/vtt"):
        """Download transcript content in VTT or DOCX format."""
        r = self.get(
            f"/me/onlineMeetings/{meeting_id}/transcripts/{transcript_id}/content",
            headers={"Accept": fmt},
        )
        return r.text if fmt == "text/vtt" else r.content

    def list_recordings(self, meeting_id):
        """List recordings for an online meeting."""
        data = self.get_json(f"/me/onlineMeetings/{meeting_id}/recordings")
        return data.get("value", [])
