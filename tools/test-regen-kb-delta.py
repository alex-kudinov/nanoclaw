#!/usr/bin/env python3
"""Tests for regen-kb-delta.py splice logic. Run: python3 tools/test-regen-kb-delta.py"""
import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "regen_kb_delta", Path(__file__).resolve().parent / "regen-kb-delta.py")
rk = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rk)

KB = (
    "# Title\n"
    "preamble text\n\n"
    "## Section A\n"
    "body A\n\n"
    "### Sub A1\n"
    "sub a1 body\n\n"
    "### Sub A2\n"
    "sub a2 body\n\n"
    "## Section B\n"
    "body B\n"
)

fails = []
def check(name, cond):
    print(("PASS " if cond else "FAIL ") + name)
    if not cond:
        fails.append(name)

# split_blocks
pre, blocks = rk.split_blocks(KB)
check("split: preamble kept", pre.startswith("# Title") and "preamble text" in pre)
check("split: 4 blocks", len(blocks) == 4)
check("split: heading lines", [h for h, _ in blocks] ==
      ["## Section A", "### Sub A1", "### Sub A2", "## Section B"])

# parse_ops
ops_text = (
    "@@UPDATE ### Sub A1\n### Sub A1\nUPDATED body\n@@ENDOP\n"
    "@@REMOVE ### Sub A2\n@@ENDOP\n"
    "@@INSERT-AFTER ## Section B\n### Sub B1\nbrand new\n@@ENDOP\n"
    "@@INSERT-AFTER END\n## Section C\ntail section\n@@ENDOP\n"
)
ops = rk.parse_ops(ops_text)
check("parse: 4 ops", len(ops) == 4)
check("parse: op kinds", [o["op"] for o in ops] ==
      ["UPDATE", "REMOVE", "INSERT-AFTER", "INSERT-AFTER"])

# apply_ops
out = rk.apply_ops(KB, ops)
check("apply: A1 updated", "UPDATED body" in out and "sub a1 body" not in out)
check("apply: A2 removed", "sub a2 body" not in out and "### Sub A2" not in out)
check("apply: B1 inserted after Section B", out.index("### Sub B1") > out.index("## Section B"))
check("apply: C appended at END", out.rstrip().endswith("tail section"))
check("apply: untouched Section A body kept", "body A" in out)
check("apply: preamble intact", out.startswith("# Title\npreamble text"))

# fail-loud: missing heading
try:
    rk.apply_ops(KB, [{"op": "UPDATE", "arg": "### Nope", "body": "### Nope\nx"}])
    check("fail-loud: missing heading raises", False)
except RuntimeError as e:
    check("fail-loud: missing heading raises", "not found" in str(e))

# rename allowed: UPDATE body MAY change the heading text (target only selects the block)
renamed = rk.apply_ops(KB, [{"op": "UPDATE", "arg": "### Sub A1", "body": "### Sub A1 (renamed)\nnew"}])
check("rename: heading may change", "### Sub A1 (renamed)" in renamed and "sub a1 body" not in renamed)

# fail-loud: body not starting with a heading (e.g. bold/bullet anchor)
try:
    rk.apply_ops(KB, [{"op": "UPDATE", "arg": "### Sub A1", "body": "**Q: not a heading**\nx"}])
    check("fail-loud: non-heading body raises", False)
except RuntimeError as e:
    check("fail-loud: non-heading body raises", "must start with" in str(e))

# fail-loud: bold-line anchor (not a real heading) not found
try:
    rk.apply_ops(KB, [{"op": "UPDATE", "arg": "**Q: bold**", "body": "### x\ny"}])
    check("fail-loud: bold anchor not found", False)
except RuntimeError as e:
    check("fail-loud: bold anchor not found", "not found" in str(e))

# batch_pieces budget
pieces = [{"id": f"p{i}", "bytes": 50_000, "order": i} for i in range(6)]
batches = rk.batch_pieces(pieces, 120_000)
check("batch: 6×50KB @120KB budget → 3 batches", len(batches) == 3)
check("batch: no batch exceeds budget", all(sum(p["bytes"] for p in b) <= 120_000 for b in batches))
check("batch: all pieces retained", sum(len(b) for b in batches) == 6)

print()
if fails:
    print(f"{len(fails)} FAILED: {fails}")
    raise SystemExit(1)
print("ALL PASSED")
