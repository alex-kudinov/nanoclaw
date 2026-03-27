"""Claude Print Bridge client.

Usage:
    from lib.bridge import claude

    result = claude("Summarize this text: ...", model="haiku")
    print(result)

See ~/dev/claude-bridge.md for full docs.
"""

import json
import os
import urllib.request
from pathlib import Path

BRIDGE_URL = "http://100.115.115.206:40960/v1/print"
_TIMEOUT_S = 130

_bridge_key = None


def _load_bridge_key():
    global _bridge_key
    if _bridge_key:
        return _bridge_key

    # 1. Already in env
    key = os.environ.get("CLAUDE_BRIDGE_KEY", "")
    if key:
        _bridge_key = key
        return _bridge_key

    # 2. Load from .env.shared
    env_shared = Path.home() / "dev" / ".env.shared"
    if env_shared.exists():
        for line in env_shared.read_text().splitlines():
            line = line.strip()
            if line.startswith("CLAUDE_BRIDGE_KEY="):
                key = line.split("=", 1)[1].strip().strip("'\"")
                if key:
                    _bridge_key = key
                    os.environ["CLAUDE_BRIDGE_KEY"] = key
                    return _bridge_key

    raise RuntimeError(
        "CLAUDE_BRIDGE_KEY not found. Set it in env or ~/dev/.env.shared. "
        "See ~/dev/claude-bridge.md."
    )


def claude(prompt, model="haiku", system_prompt=None, **kwargs):
    """Call Claude via the Print Bridge. Returns the response text.

    Args:
        prompt: The prompt string (max 1MB).
        model: "haiku", "sonnet", or "opus".
        system_prompt: Optional system prompt.
        **kwargs: Any other bridge-supported key (see ~/dev/claude-bridge.md).

    Raises:
        RuntimeError: On bridge errors (auth, timeout, concurrency, etc.).
    """
    key = _load_bridge_key()

    body = {"prompt": prompt, "model": model, **kwargs}
    if system_prompt:
        body["system_prompt"] = system_prompt

    req = urllib.request.Request(
        BRIDGE_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Bridge-Key": key,
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        raise RuntimeError(f"Bridge unreachable ({BRIDGE_URL}): {e}") from e

    if not result.get("ok"):
        code = result.get("code", "UNKNOWN")
        error = result.get("error", "No error message")
        raise RuntimeError(f"Bridge error [{code}]: {error}")

    data = result.get("data", {})
    # Handle both JSON-parsed and raw text responses
    if isinstance(data, dict):
        return data.get("result", "")
    return str(data)
