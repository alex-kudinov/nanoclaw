#!/usr/bin/env python3
"""
tools/regen-kb-delta.py

Delta-mode KNOWLEDGE.md regeneration from llms-pieces manifest + state.

SECTION-TARGETED (2026-07-24): the model returns ONLY the KB sections its
changed pieces affect — as `@@UPDATE`/`@@INSERT-AFTER`/`@@REMOVE` blocks anchored
on the unique `##`/`###` heading line — and this script splices them into the KB
deterministically. Each bridge call therefore emits a few small sections instead
of regenerating the whole ~116KB KB, which is what blew past the bridge's 600s
timeout (504) and left the pipeline broken since the 615fd78 bridge migration.

Reads:
  - current KNOWLEDGE.md
  - llms-pieces/manifest.json (source of truth: which pieces exist now)
  - .pieces-state.json (last known piece hashes that produced current KB)
  - lessons (text, from collect-lessons.sh via --lessons-file)

Computes delta (added / changed / removed). Empty → exit 99 (NOCHANGE).
Otherwise batches touched pieces (small, to bound output) and applies each
batch's section edits to the working KB. Writes updated KNOWLEDGE.md + state.
Fail-closed: if any returned edit does not resolve to a unique heading, the run
aborts WITHOUT writing (a partial splice is worse than a stale KB).
"""

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

BRIDGE_CAP = 1_048_576          # bridge hard limit on the request body
INPUT_BUDGET = 900_000          # keep prompt body under the cap
# Per-batch piece-content budget. Small on purpose: fewer pieces per call → fewer
# changed sections in the response → small output → well under the 600s timeout.
SECTION_BATCH_BUDGET = 120_000

HEADING_RE = re.compile(r"^#{2,3} .+$", re.M)


# ─── State ───────────────────────────────────────────────────────────────────

def load_state(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        print(f"WARN: could not read state file {path}: {e}", file=sys.stderr)
        return {}


def save_state(path: Path, manifest: dict) -> None:
    state = {p["id"]: p["hash"] for p in manifest["pieces"]}
    path.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8")


def compute_delta(manifest: dict, state: dict) -> dict:
    by_id = {p["id"]: p for p in manifest["pieces"]}
    added, changed, unchanged = [], [], 0
    for pid, piece in by_id.items():
        if pid not in state:
            added.append(piece)
        elif state[pid] != piece["hash"]:
            changed.append(piece)
        else:
            unchanged += 1
    removed = [pid for pid in state if pid not in by_id]
    return {"added": added, "changed": changed, "removed": removed,
            "unchanged_count": unchanged}


# ─── Section splicing ────────────────────────────────────────────────────────

def split_blocks(kb: str) -> tuple[str, list[tuple[str, str]]]:
    """(preamble, [(heading_line, block_text)]). block = heading + body to next heading."""
    starts = [m.start() for m in HEADING_RE.finditer(kb)]
    if not starts:
        return kb, []
    blocks = []
    for i, s in enumerate(starts):
        end = starts[i + 1] if i + 1 < len(starts) else len(kb)
        text = kb[s:end]
        blocks.append((text.splitlines()[0].rstrip(), text))
    return kb[: starts[0]], blocks


OP_RE = re.compile(
    r"^@@(UPDATE|INSERT-AFTER|REMOVE)[ \t]+(.*?)[ \t]*\n(.*?)\n?@@ENDOP[ \t]*$",
    re.M | re.S,
)


def parse_ops(text: str) -> list[dict]:
    ops = []
    for m in OP_RE.finditer(text):
        ops.append({"op": m.group(1), "arg": m.group(2).strip(), "body": m.group(3)})
    return ops


def _first_heading(body: str) -> str:
    for line in body.lstrip().splitlines():
        return line.rstrip()
    return ""


def _validate_ops(ops: list[dict], headings: list[str]) -> list[str]:
    count: dict[str, int] = {}
    for h in headings:
        count[h] = count.get(h, 0) + 1
    errs = []
    for op in ops:
        arg = op["arg"]
        if op["op"] in ("UPDATE", "REMOVE"):
            if count.get(arg, 0) == 0:
                errs.append(f"{op['op']}: heading not found: {arg!r}")
            elif count[arg] > 1:
                errs.append(f"{op['op']}: heading ambiguous: {arg!r}")
        elif op["op"] == "INSERT-AFTER" and arg != "END" and count.get(arg, 0) != 1:
            errs.append(f"INSERT-AFTER: anchor not found/unique: {arg!r}")
        if op["op"] in ("UPDATE", "INSERT-AFTER"):
            # Body must start with a heading; it MAY rename (differ from the
            # target) — the target only selects which block to replace.
            if not re.match(r"^#{2,3} ", _first_heading(op["body"])):
                errs.append(f"{op['op']} {arg!r}: body must start with a ##/### heading")
    return errs


def apply_ops(kb: str, ops: list[dict]) -> str:
    """Apply section edits deterministically. Raise (no partial write) on any bad ref."""
    if not ops:
        return kb
    preamble, blocks = split_blocks(kb)
    errs = _validate_ops(ops, [h for h, _ in blocks])
    if errs:
        raise RuntimeError("edit validation failed:\n  " + "\n  ".join(errs))

    updates = {op["arg"]: _norm(op["body"]) for op in ops if op["op"] == "UPDATE"}
    removes = {op["arg"] for op in ops if op["op"] == "REMOVE"}
    inserts: dict[str, list[str]] = {}
    for op in ops:
        if op["op"] == "INSERT-AFTER":
            inserts.setdefault(op["arg"], []).append(_norm(op["body"]))

    out = [preamble]
    for heading, text in blocks:
        if heading in removes:
            continue
        out.append(updates.get(heading, text))
        for new_block in inserts.get(heading, []):
            out.append(new_block)
    out.extend(inserts.get("END", []))
    return "".join(out)


def _norm(body: str) -> str:
    return body.rstrip() + "\n\n"


# ─── Batching ────────────────────────────────────────────────────────────────

def batch_pieces(pieces: list[dict], budget: int,
                 max_count: int = 5) -> list[list[dict]]:
    """Group pieces so each batch stays under `budget` bytes AND `max_count`
    pieces — the count cap bounds how many sections a batch can change (hence
    the response size), independent of piece byte size."""
    batches, cur, cur_bytes = [], [], 0
    for p in pieces:
        b = p["bytes"]
        if cur and (cur_bytes + b > budget or len(cur) >= max_count):
            batches.append(cur)
            cur, cur_bytes = [], 0
        cur.append(p)
        cur_bytes += b
    if cur:
        batches.append(cur)
    return batches


# ─── Prompt ──────────────────────────────────────────────────────────────────

INSTRUCTIONS = """You maintain a markdown knowledge base by editing ONLY the sections that changed.

CURRENT KNOWLEDGE BASE:
---
{current_kb}
---

CHANGED SOURCE PIECES (update the KB sections these describe):
{pieces_block}
{removed_block}{lessons_block}
OUTPUT FORMAT — emit a sequence of edit operations and NOTHING else (no prose, no
code fences). Emit an operation ONLY for a section that actually changes.

VALID ANCHORS: an anchor is ONLY a line that begins with `## ` or `### ` and
appears VERBATIM in the CURRENT KB above. Bold lines (`**Q: ...**`), bullets,
and table rows are NOT anchors. To change any content that lives BENEATH a
heading (e.g. one FAQ answer under `### Program & Enrollment`), UPDATE the ENTIRE
enclosing `###` section — reproduce all of it with your change. Anchor on the
smallest REAL `###` heading that encloses the change.

@@UPDATE <exact existing heading line>
<the FULL replacement section — its first line MUST be that same heading line>
@@ENDOP

@@INSERT-AFTER <exact existing heading line, or the literal word END>
<a FULL new section — first line MUST be a new ## or ### heading>
@@ENDOP

@@REMOVE <exact existing heading line>
@@ENDOP

RULES:
- Change as little as possible. Do NOT restate unchanged sections.
- NEVER touch the "Agent Operations Notes" or "Email Classification Taxonomy"
  sections unless a changed piece is explicitly about them.
- Keep each anchor heading byte-identical to the CURRENT KB. Do NOT rename a
  heading unless a changed source piece renames that program.
- If nothing needs changing, output the single line: NO-CHANGES"""


def build_prompt(current_kb, batch, pieces_dir, removed_ids, lessons):
    blocks = []
    for p in batch:
        txt = (pieces_dir / p["path"]).read_text(encoding="utf-8")
        blocks.append(f"[PIECE {p['id']}]\n---\n{txt}\n---\n")
    pieces_block = "\n".join(blocks)
    removed_block = ""
    if removed_ids:
        removed_block = ("\nREMOVED PIECES (drop or update the KB sections they fed):\n"
                         + "\n".join(f"- {r}" for r in removed_ids) + "\n")
    lessons_block = ""
    if lessons.strip():
        lessons_block = ("\nMANDATORY LESSONS (human-verified; override source on conflict):\n"
                         + lessons.strip() + "\n")
    return INSTRUCTIONS.format(current_kb=current_kb, pieces_block=pieces_block,
                               removed_block=removed_block, lessons_block=lessons_block)


# ─── Bridge ──────────────────────────────────────────────────────────────────

def call_bridge(prompt, bridge_url, bridge_key, model, timeout=590):
    body = json.dumps({"prompt": prompt, "model": model}).encode("utf-8")
    if len(body) > BRIDGE_CAP:
        raise RuntimeError(f"body {len(body)}B exceeds bridge cap {BRIDGE_CAP} — batching bug")
    req = urllib.request.Request(
        bridge_url, data=body, method="POST",
        headers={"Content-Type": "application/json", "X-Bridge-Key": bridge_key})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"bridge HTTP {e.code}: {e.read().decode('utf-8','replace')[:500]}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"bridge unreachable: {e}")
    if not payload.get("ok"):
        raise RuntimeError(f"bridge error: {payload.get('code','?')} {payload.get('error','?')}")
    return payload["data"]["result"]


def run_batch(prompt, kb, url, key, model, max_retries=2):
    """Call the bridge and splice; on a rejected edit, re-prompt with the error
    so the model self-corrects its anchors. Returns (new_kb, n_edits)."""
    cur = prompt
    for attempt in range(max_retries + 1):
        result = call_bridge(cur, url, key, model)
        if result.strip() == "NO-CHANGES":
            return kb, 0
        ops = parse_ops(result)
        if not ops:
            raise RuntimeError(f"no parseable edits in response:\n{result[:400]}")
        try:
            return apply_ops(kb, ops), len(ops)
        except RuntimeError as e:
            if attempt == max_retries:
                raise
            print(f"    apply rejected (retry {attempt + 1}/{max_retries}): {e}",
                  file=sys.stderr)
            cur = prompt + (
                "\n\nYOUR PREVIOUS RESPONSE WAS REJECTED:\n" + str(e)
                + "\n\nRe-issue the COMPLETE set of edit operations for this batch, "
                "fixing the above. Every anchor MUST be a heading that appears "
                "VERBATIM in the CURRENT KB, or the literal word END for "
                "INSERT-AFTER. Never invent a heading.")
    raise RuntimeError("unreachable")


# ─── Main ────────────────────────────────────────────────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--knowledge", required=True)
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--pieces-dir", required=True)
    ap.add_argument("--state", required=True)
    ap.add_argument("--lessons-file", default=None)
    ap.add_argument("--bridge-url", required=True)
    ap.add_argument("--bridge-key", required=True)
    ap.add_argument("--model", default="opus")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    kb_path, state_path = Path(args.knowledge), Path(args.state)
    pieces_dir = Path(args.pieces_dir)
    manifest_path = Path(args.manifest)
    if not manifest_path.exists():
        print(f"ERROR: manifest not found: {manifest_path}", file=sys.stderr)
        return 2
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    current_kb = kb_path.read_text(encoding="utf-8") if kb_path.exists() else ""
    lessons = ""
    if args.lessons_file and Path(args.lessons_file).exists():
        lessons = Path(args.lessons_file).read_text(encoding="utf-8")

    delta = compute_delta(manifest, load_state(state_path))
    na, nc, nr = len(delta["added"]), len(delta["changed"]), len(delta["removed"])
    print(f"delta: +{na} added / ~{nc} changed / -{nr} removed / "
          f"={delta['unchanged_count']} unchanged", file=sys.stderr)
    if na == 0 and nc == 0 and nr == 0:
        print("NOCHANGE: all pieces match state — skipping bridge call", file=sys.stderr)
        return 99

    touched = sorted(delta["added"] + delta["changed"], key=lambda p: p["order"])
    batches = batch_pieces(touched, SECTION_BATCH_BUDGET)
    print(f"{len(touched)} pieces → {len(batches)} batch(es) "
          f"(≤{SECTION_BATCH_BUDGET}B each)", file=sys.stderr)
    if args.dry_run:
        print("DRY RUN — no bridge calls, no writes", file=sys.stderr)
        return 0

    working_kb = current_kb
    for i, batch in enumerate(batches, 1):
        removed = delta["removed"] if i == 1 else []
        prompt = build_prompt(working_kb, batch, pieces_dir, removed, lessons)
        if len(prompt.encode("utf-8")) > INPUT_BUDGET:
            print(f"  ERROR: batch {i} prompt exceeds {INPUT_BUDGET}B", file=sys.stderr)
            return 3
        print(f"  batch {i}/{len(batches)}: {len(batch)} pieces → bridge...", file=sys.stderr)
        try:
            working_kb, n = run_batch(prompt, working_kb, args.bridge_url,
                                      args.bridge_key, args.model)
        except RuntimeError as e:
            print(f"  ERROR: batch {i} failed after retries: {e}", file=sys.stderr)
            return 4
        print(f"  batch {i}: applied {n} edit(s) "
              f"(KB now {len(working_kb.encode('utf-8'))}B)", file=sys.stderr)

    kb_path.write_text(working_kb, encoding="utf-8")
    save_state(state_path, manifest)
    print(f"OK: wrote {kb_path} ({len(working_kb)} chars) and {state_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
