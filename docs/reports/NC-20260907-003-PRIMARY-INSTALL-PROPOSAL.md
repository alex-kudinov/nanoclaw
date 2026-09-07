# NC-20260907-003 primary routing install proposal

Status: reviewed proposal; not applied. Astra internal acceptance is required by
the execution packet before this narrow installation or the final task commit.

## Observed primary target

- Checkout: `/Users/xbohdpukc/dev/NanoClaw`
- Branch/HEAD: `codex/continuity-reconciliation` at
  `51185a5db6690807a821030d632c628340d0fb05`, ahead of its upstream by two
  commits at inspection.
- The checkout is extensively dirty. Only the four paths below are in scope.
- `AGENTS.md`: tracked and clean relative to primary HEAD; SHA-256
  `225c1a7d056dd4904e1e4b0e2dd94986b016a31ac9eca0569ef286f1f276c8ca`.
- `CLAUDE.md`: pre-existing modified file, 199 lines; SHA-256
  `d2a9bf698e0a36dad7306b8acc012855095b04f41201e4ea9962b113d1b7a260`.
  Its unrelated current diff is preserved byte-for-byte.
- `docs/MODEL-ROUTING-POLICY.md`: absent.
- `.codex/config.toml`: absent; no global config or trust setting was inspected
  or changed.

Immediately before installation, re-read only these target statuses and hashes.
If either existing-file hash changed or either new path appeared, stop and
recompute the patch; do not overwrite or merge by assumption.

## Exact proposed mutation

1. Copy the reviewed task-worktree `.codex/config.toml` byte-for-byte to the same
   primary path. Expected SHA-256:
   `13114f07fcb6611106a93f39b07318ec31f25d0477c0c907f092b7975b532232`.
2. Copy the reviewed task-worktree `docs/MODEL-ROUTING-POLICY.md` byte-for-byte
   to the same primary path. Expected SHA-256:
   `2ad44e0bda9d8b58cccc97cb8047d423835b4220b0174ab898c0276079e95717`.
3. In primary `AGENTS.md`, insert the following section exactly once immediately
   after the two-line introductory paragraph and its blank line:

```markdown
## Model routing

Follow [the NanoClaw model routing policy](docs/MODEL-ROUTING-POLICY.md): Astra
owns strategy and acceptance, an explicitly selected `gpt-5.6-sol` worker with
high reasoning owns bounded execution, and Claude Code Sonnet/high supplies
independent review. Sol workers execute their assigned slice and do not create
more Codex workers. Keep one execution writer and treat the configured two-child
ceiling as a runtime limit, not authority for another `.program` claim or release.
Select the explicit model and effort on every dispatch; project defaults are
defense in depth even after fresh-task behavior is observed.
```

   Expected resulting SHA-256:
   `60bc6f7bb35c92d1cf0497de409860be3b5495898e90873b3fc0c37273d20a18`
   and 121 lines.
4. In primary `CLAUDE.md`, replace only this exact unique anchor:

```text
Claude Code and Codex use the same tracked engineering record. Client-private
memory or chat history is never the only record of a change.

Before non-trivial work, read:
```

   with:

```text
Claude Code and Codex use the same tracked engineering record. Client-private
memory or chat history is never the only record of a change.
Codex collaboration follows `docs/MODEL-ROUTING-POLICY.md`: Astra owns strategy/acceptance, one explicit Sol High worker owns bounded execution, and Claude Code Sonnet/high reviews independently; routing changes no runtime, program-concurrency, approval, or release boundary.
Before non-trivial work, read:
```

   Expected resulting SHA-256:
   `dc66053cfea0f045f8735168179c5ac8832f9ab670835aab39ad971f0e47d6ad`
   and 199 lines. This preserves the prompt hook's 200-line maximum and every
   pre-existing primary formatting/content change outside the exact anchor.

Use `apply_patch` for both existing-file insertions and new files. Do not copy
task-worktree `AGENTS.md` or `CLAUDE.md` wholesale because they have different
lineage and the primary CLAUDE file has unrelated user-owned changes.

## Post-install checks

- Verify the four exact resulting hashes/line counts above and inspect the
  four-path diff only.
- Parse `.codex/config.toml` and require exactly Sol/high/two-child agent values.
- Confirm `AGENTS.md` still requires explicit model/effort on every dispatch and
  `CLAUDE.md` states no runtime/program/approval/release expansion.
- Run primary `npm run docs:continuity-check` with the pinned Node launcher. If
  unrelated primary drift prevents the check, preserve the failure evidence and
  verify the routing paths independently; do not repair unrelated dirty files.
- Confirm no `.program`, global/trust configuration, runtime, provider, student,
  payment, capacity, roster, message, migration, deployment, or schedule state
  changed.

This install makes the local routing defaults and operating guidance available
in the primary checkout. It does not prove that a fresh trusted task consumed the
defaults; every dispatch continues to specify model and effort explicitly.
