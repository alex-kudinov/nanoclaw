#!/usr/bin/env python3
"""
tools/regen-kb-delta.py

Delta-mode KNOWLEDGE.md regeneration from llms-pieces manifest + state.

Reads:
  - current KNOWLEDGE.md
  - llms-pieces/manifest.json (source of truth: which pieces exist now)
  - .pieces-state.json (last known piece hashes that produced current KB)
  - lessons (text, from collect-lessons.sh via --lessons-file)

Computes delta:
  - added:    pieces in manifest but not in state
  - changed:  pieces in both but with different hashes
  - removed:  pieces in state but not in manifest

If delta is empty → exits 99 (NOCHANGE).
If delta fits in bridge budget → one bridge call, writes updated KB.
If delta is too big → chunks pieces, sequential bridge calls, each updating
the working KB.

On success:
  - writes updated KNOWLEDGE.md to --knowledge
  - updates --state to reflect current piece hashes
  - exits 0

On failure → exits non-zero with error on stderr.
"""

import argparse
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

# ─── Prompt budget ───────────────────────────────────────────────────────────
# Bridge enforces 1MB (1048576 bytes). Leave headroom for instructions +
# JSON envelope + UTF-8 expansion. 900KB is the practical max prompt body.
BRIDGE_CAP = 1_048_576
PROMPT_BUDGET = 900_000
INSTRUCTIONS_OVERHEAD = 4_000  # conservative estimate for prompt instructions


# ─── State ───────────────────────────────────────────────────────────────────

def load_state(path: Path) -> dict:
    """Load .pieces-state.json: {piece_id: hash}. Returns empty dict if missing."""
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        print(f"WARN: could not read state file {path}: {e}", file=sys.stderr)
        return {}


def save_state(path: Path, manifest: dict) -> None:
    """Write state = {piece_id: hash} derived from the manifest."""
    state = {p["id"]: p["hash"] for p in manifest["pieces"]}
    path.write_text(
        json.dumps(state, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


# ─── Delta computation ───────────────────────────────────────────────────────

def compute_delta(manifest: dict, state: dict) -> dict:
    """Return {'added': [], 'changed': [], 'removed': [], 'unchanged_count': N}."""
    pieces_by_id = {p["id"]: p for p in manifest["pieces"]}
    added, changed, unchanged = [], [], 0

    for pid, piece in pieces_by_id.items():
        if pid not in state:
            added.append(piece)
        elif state[pid] != piece["hash"]:
            changed.append(piece)
        else:
            unchanged += 1

    removed_ids = [pid for pid in state if pid not in pieces_by_id]

    return {
        "added": added,
        "changed": changed,
        "removed": removed_ids,
        "unchanged_count": unchanged,
    }


# ─── Chunking ────────────────────────────────────────────────────────────────

def pack_chunks(pieces: list[dict], base_size: int, budget: int) -> list[list[dict]]:
    """Pack pieces into chunks where base_size + sum(piece.bytes) <= budget.

    base_size = bytes of current KB + lessons + instructions overhead.
    Each chunk gets the full current KB prepended, so we need room for both.
    """
    chunks: list[list[dict]] = []
    current: list[dict] = []
    current_bytes = 0
    per_chunk_budget = budget - base_size

    if per_chunk_budget <= 0:
        raise RuntimeError(
            f"Base prompt size ({base_size}) exceeds budget ({budget}); "
            f"cannot fit any pieces. Reduce KB size or increase bridge limit."
        )

    for piece in pieces:
        b = piece["bytes"]
        if b > per_chunk_budget:
            # Single piece bigger than budget — must be its own chunk, and
            # may still fail at the bridge. Emit a warning.
            print(
                f"WARN: piece {piece['id']} is {b} bytes, exceeds chunk budget "
                f"{per_chunk_budget}. Will attempt single-piece chunk anyway.",
                file=sys.stderr,
            )
            if current:
                chunks.append(current)
                current, current_bytes = [], 0
            chunks.append([piece])
            continue

        if current_bytes + b > per_chunk_budget:
            chunks.append(current)
            current, current_bytes = [], 0

        current.append(piece)
        current_bytes += b

    if current:
        chunks.append(current)

    return chunks


# ─── Prompt assembly ─────────────────────────────────────────────────────────

INSTRUCTIONS = """You are updating a knowledge base document to reflect changes in source material.

CURRENT KNOWLEDGE BASE:
---
{current_kb}
---

SOURCE CHANGES:
The following source pieces have changed since the current KB was generated.
For each changed piece, update the corresponding section(s) of the knowledge base.
Preserve all sections that are NOT affected by these changes exactly as they are,
especially the "Agent Operations Notes" and "Email Classification Taxonomy"
sections which are operational knowledge not derived from source material.

{pieces_block}
{removed_block}
{lessons_block}

TASK:
Output the COMPLETE updated knowledge base document, incorporating the source
changes above. Do NOT truncate, summarize, or omit any section. Include every
section whether changed or not. Do NOT include any XML tags, code fences, or
explanation — just the raw markdown KB document, ready to save as
KNOWLEDGE.md."""


def build_prompt(current_kb: str, pieces_batch: list[dict], pieces_dir: Path,
                 removed_ids: list[str], lessons: str) -> str:
    piece_blocks = []
    for p in pieces_batch:
        piece_text = (pieces_dir / p["path"]).read_text(encoding="utf-8")
        piece_blocks.append(f"[CHANGED: {p['id']}]\n---\n{piece_text}\n---\n")
    pieces_block = "\n".join(piece_blocks) if piece_blocks else ""

    removed_block = ""
    if removed_ids:
        lines = ["REMOVED PIECES (no longer in source material; update or remove affected KB sections):"]
        for rid in removed_ids:
            lines.append(f"- {rid}")
        removed_block = "\n" + "\n".join(lines) + "\n"

    lessons_block = ""
    if lessons.strip():
        lessons_block = (
            "\nMANDATORY LESSONS (human-verified corrections — override source if they conflict):\n"
            + lessons.strip() + "\n"
        )

    return INSTRUCTIONS.format(
        current_kb=current_kb,
        pieces_block=pieces_block,
        removed_block=removed_block,
        lessons_block=lessons_block,
    )


# ─── Bridge call ─────────────────────────────────────────────────────────────

def call_bridge(prompt: str, bridge_url: str, bridge_key: str, model: str,
                timeout: int = 300) -> str:
    """POST to Claude Print Bridge, return result text. Raises on error."""
    body = json.dumps({"prompt": prompt, "model": model}).encode("utf-8")
    if len(body) > BRIDGE_CAP:
        raise RuntimeError(
            f"Request body {len(body)} bytes exceeds bridge cap {BRIDGE_CAP}. "
            f"This is a chunking bug — report it."
        )

    req = urllib.request.Request(
        bridge_url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-Bridge-Key": bridge_key,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"bridge HTTP {e.code}: {err_body[:500]}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"bridge unreachable: {e}")

    if not payload.get("ok"):
        raise RuntimeError(
            f"bridge error: {payload.get('code','?')} {payload.get('error','?')}"
        )
    return payload["data"]["result"]


# ─── Main orchestration ──────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--knowledge", required=True, help="Path to KNOWLEDGE.md (read + write)")
    parser.add_argument("--manifest", required=True, help="Path to llms-pieces/manifest.json")
    parser.add_argument("--pieces-dir", required=True, help="Path to llms-pieces/ directory")
    parser.add_argument("--state", required=True, help="Path to .pieces-state.json (read + write)")
    parser.add_argument("--lessons-file", default=None, help="Path to lessons text file (optional)")
    parser.add_argument("--bridge-url", required=True)
    parser.add_argument("--bridge-key", required=True)
    parser.add_argument("--model", default="opus")
    parser.add_argument("--dry-run", action="store_true",
                        help="Report delta and chunk plan without calling bridge")
    args = parser.parse_args()

    kb_path = Path(args.knowledge)
    manifest_path = Path(args.manifest)
    pieces_dir = Path(args.pieces_dir)
    state_path = Path(args.state)

    # Load inputs
    if not manifest_path.exists():
        print(f"ERROR: manifest not found: {manifest_path}", file=sys.stderr)
        return 2
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    current_kb = kb_path.read_text(encoding="utf-8") if kb_path.exists() else ""
    state = load_state(state_path)
    lessons = ""
    if args.lessons_file and Path(args.lessons_file).exists():
        lessons = Path(args.lessons_file).read_text(encoding="utf-8")

    # Compute delta
    delta = compute_delta(manifest, state)
    n_added, n_changed, n_removed = len(delta["added"]), len(delta["changed"]), len(delta["removed"])
    print(
        f"delta: +{n_added} added / ~{n_changed} changed / -{n_removed} removed / "
        f"={delta['unchanged_count']} unchanged",
        file=sys.stderr,
    )

    if n_added == 0 and n_changed == 0 and n_removed == 0:
        print("NOCHANGE: all pieces match state — skipping bridge call", file=sys.stderr)
        return 99

    # Pieces to send: union of added + changed (removed handled via hint only)
    touched = delta["added"] + delta["changed"]
    touched.sort(key=lambda p: p["order"])

    # Size budget
    base_size = (
        len(current_kb.encode("utf-8"))
        + len(lessons.encode("utf-8"))
        + INSTRUCTIONS_OVERHEAD
    )
    chunks = pack_chunks(touched, base_size, PROMPT_BUDGET)
    print(
        f"packed {len(touched)} pieces into {len(chunks)} chunk(s) "
        f"(base={base_size}B, budget={PROMPT_BUDGET}B)",
        file=sys.stderr,
    )
    for i, chunk in enumerate(chunks, 1):
        chunk_bytes = sum(p["bytes"] for p in chunk)
        print(
            f"  chunk {i}/{len(chunks)}: {len(chunk)} pieces, {chunk_bytes} bytes",
            file=sys.stderr,
        )

    if args.dry_run:
        print("DRY RUN — no bridge calls, no writes", file=sys.stderr)
        return 0

    # Sequential bridge calls — each chunk updates the working KB
    working_kb = current_kb
    for i, chunk in enumerate(chunks, 1):
        # Only emit [REMOVED] hints in the first chunk to avoid re-processing
        removed_for_chunk = delta["removed"] if i == 1 else []
        prompt = build_prompt(working_kb, chunk, pieces_dir, removed_for_chunk, lessons)
        prompt_bytes = len(prompt.encode("utf-8"))
        print(
            f"  calling bridge chunk {i}/{len(chunks)} "
            f"(prompt={prompt_bytes}B, pieces={len(chunk)})...",
            file=sys.stderr,
        )
        if prompt_bytes > PROMPT_BUDGET:
            # Safety net — base_size estimate was off
            print(
                f"  ERROR: prompt {prompt_bytes}B exceeds budget {PROMPT_BUDGET}B",
                file=sys.stderr,
            )
            return 3

        result = call_bridge(
            prompt, args.bridge_url, args.bridge_key, args.model,
        )
        if not result or not result.strip():
            print(f"  ERROR: bridge returned empty for chunk {i}", file=sys.stderr)
            return 4

        working_kb = result.strip() + "\n"
        print(
            f"  chunk {i} done (new KB: {len(working_kb.encode('utf-8'))}B)",
            file=sys.stderr,
        )

    # Write outputs
    kb_path.write_text(working_kb, encoding="utf-8")
    save_state(state_path, manifest)
    print(
        f"OK: wrote {kb_path} ({len(working_kb)} chars) "
        f"and {state_path}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
