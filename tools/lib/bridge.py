"""Claude Print Bridge client — calls the HTTP bridge on Mac Mini.

The bridge handles auth, concurrency, timeouts, and credential lifecycle.
Never call `claude --print` directly from scripts.

Usage:
    from lib.bridge import claude

    result = claude("Summarize this text: ...", model="haiku")
    print(result)
"""

import json
import os
import urllib.request

_BRIDGE_URL = os.environ.get(
    "CLAUDE_BRIDGE_URL", "http://100.115.115.206:40960/v1/print"
)
_TIMEOUT_S = 120


def _load_bridge_key():
    key = os.environ.get("CLAUDE_BRIDGE_KEY", "")
    if key:
        return key
    env_shared = os.path.expanduser("~/dev/.env.shared")
    if os.path.exists(env_shared):
        with open(env_shared) as f:
            for line in f:
                line = line.strip()
                if line.startswith("CLAUDE_BRIDGE_KEY="):
                    return line.split("=", 1)[1].strip().strip("'\"")
    raise RuntimeError(
        "CLAUDE_BRIDGE_KEY not found in env or ~/dev/.env.shared"
    )


def _auto_meta() -> dict:
    """Build meta dict from NANOCLAW_* env vars. Zero-config for callers."""
    meta = {}
    for env_key, meta_key in [
        ("NANOCLAW_MINION", "minion"),
        ("NANOCLAW_ACTION", "action"),
        ("NANOCLAW_JOB", "job"),
        ("NANOCLAW_CALLER", "caller"),
    ]:
        val = os.environ.get(env_key)
        if val:
            meta[meta_key] = val
    return meta


def claude(prompt, model="haiku", system_prompt=None, timeout=None, **kwargs):
    """Call Claude via the Print Bridge. Returns the response text.

    Args:
        prompt: The prompt string.
        model: "haiku", "sonnet", or "opus".
        system_prompt: Optional system prompt text.
        timeout: Request timeout in seconds (default: 120).
        **kwargs: Additional bridge params (output_format, max_turns, etc.).
            Pass meta={"minion": ..., "action": ...} to tag the call,
            or let NANOCLAW_* env vars provide it automatically.

    Raises:
        RuntimeError: On bridge errors or timeouts.
    """
    key = _load_bridge_key()
    body = {"prompt": prompt, "model": model}
    if system_prompt:
        body["system_prompt"] = system_prompt

    # Auto-inject metadata from env, allow explicit override
    auto = _auto_meta()
    explicit = kwargs.pop("meta", None)
    if auto or explicit:
        body["meta"] = {**auto, **(explicit or {})}

    body.update(kwargs)

    req = urllib.request.Request(
        _BRIDGE_URL,
        data=json.dumps(body).encode(),
        headers={
            "Content-Type": "application/json",
            "X-Bridge-Key": key,
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout or _TIMEOUT_S) as resp:
            result = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()[:500] if e.fp else ""
        raise RuntimeError(f"Bridge HTTP {e.code}: {body_text}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Bridge unreachable: {e.reason}")

    if not result.get("ok"):
        raise RuntimeError(
            f"Bridge error ({result.get('code', 'UNKNOWN')}): "
            f"{result.get('error', 'no details')}"
        )

    return result["data"]["result"]
