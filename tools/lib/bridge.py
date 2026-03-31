"""Claude CLI wrapper — calls `claude --print` directly.

Claude manages its own auth tokens. No bridge server, no API keys.

Usage:
    from lib.bridge import claude

    result = claude("Summarize this text: ...", model="haiku")
    print(result)
"""

import subprocess
import shutil

_CLAUDE_BIN = None

MODEL_MAP = {
    "haiku": "claude-haiku-4-5-20251001",
    "sonnet": "claude-sonnet-4-6",
    "opus": "claude-opus-4-6",
}

_TIMEOUT_S = 120


def _find_claude():
    global _CLAUDE_BIN
    if _CLAUDE_BIN:
        return _CLAUDE_BIN

    # Common locations
    for candidate in [
        shutil.which("claude"),
        "/opt/homebrew/bin/claude",
        "/usr/local/bin/claude",
    ]:
        if candidate:
            _CLAUDE_BIN = candidate
            return _CLAUDE_BIN

    raise RuntimeError("claude CLI not found in PATH or common locations")


def claude(prompt, model="haiku", system_prompt=None, **kwargs):
    """Call Claude via `claude --print`. Returns the response text.

    Args:
        prompt: The prompt string.
        model: "haiku", "sonnet", or "opus" (or a full model ID).
        system_prompt: Optional system prompt (passed via --system-prompt).
        **kwargs: Ignored (kept for bridge API compatibility).

    Raises:
        RuntimeError: On CLI errors or timeouts.
    """
    bin_path = _find_claude()
    model_id = MODEL_MAP.get(model, model)

    cmd = [bin_path, "--print", "--model", model_id]
    if system_prompt:
        cmd.extend(["--system-prompt", system_prompt])

    try:
        result = subprocess.run(
            cmd,
            input=prompt,
            capture_output=True,
            text=True,
            timeout=_TIMEOUT_S,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"claude --print timed out after {_TIMEOUT_S}s")
    except FileNotFoundError:
        raise RuntimeError(f"claude CLI not found at {bin_path}")

    if result.returncode != 0:
        stderr = result.stderr.strip()[:500]
        raise RuntimeError(f"claude --print failed (exit {result.returncode}): {stderr}")

    return result.stdout.strip()
