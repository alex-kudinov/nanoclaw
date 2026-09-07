# NC-20260907-003 primary routing install receipt

Date: 2026-09-07T15:40:00Z

State: applied and exact-read-back; local primary installation only

Accepted proposal SHA-256:
`79f6da7a3790c83a5d23c63af382db022955f220fd856ccdc283fbed77047899`

Astra accepted the corrected strategy, R2 disposition, and exact four-path
proposal. Sol immediately rechecked the proposal hash and every target
precondition before mutation:

- primary checkout `/Users/xbohdpukc/dev/NanoClaw`, branch
  `codex/continuity-reconciliation`, HEAD
  `51185a5db6690807a821030d632c628340d0fb05`;
- `AGENTS.md` SHA-256
  `225c1a7d056dd4904e1e4b0e2dd94986b016a31ac9eca0569ef286f1f276c8ca`;
- pre-existing modified 199-line `CLAUDE.md` SHA-256
  `d2a9bf698e0a36dad7306b8acc012855095b04f41201e4ea9962b113d1b7a260`;
- `docs/MODEL-ROUTING-POLICY.md` absent; and
- `.codex/config.toml` absent.

All preconditions matched. Only the approved four primary paths changed. New
policy/config were added byte-for-byte from the reviewed worktree; the two
existing instruction files received only the exact proposal insertions. Readback:

| Primary path | Result | SHA-256 | Lines |
| --- | --- | --- | --- |
| `.codex/config.toml` | added; byte-identical to reviewed source | `13114f07fcb6611106a93f39b07318ec31f25d0477c0c907f092b7975b532232` | 4 |
| `docs/MODEL-ROUTING-POLICY.md` | added; byte-identical to reviewed source | `2ad44e0bda9d8b58cccc97cb8047d423835b4220b0174ab898c0276079e95717` | 101 |
| `AGENTS.md` | one model-routing section inserted | `60bc6f7bb35c92d1cf0497de409860be3b5495898e90873b3fc0c37273d20a18` | 121 |
| `CLAUDE.md` | one unique-anchor binding inserted; unrelated existing diff preserved | `dc66053cfea0f045f8735168179c5ac8832f9ab670835aab39ad971f0e47d6ad` | 199 |

The TOML parser returned exactly `gpt-5.6-sol`, `high`, and child ceiling 2.
Instruction assertions verified explicit model/effort on every dispatch,
one routing section/link, and no runtime/program/approval/release expansion.
The two new files compare byte-identical with the reviewed sources. The four-path
diff has no whitespace error.

Primary `npm run docs:continuity-check` could not start because this older dirty
checkout has no `scripts/with-pinned-node.sh`. Running its sanitizer/continuity
logic through the reviewed Node 22.23.2 launcher passed the sanitizer and then
reported only pre-existing primary continuity debt: untracked Capacity support,
missing detail sections for older tasks, and older validating/review items without
changelog entries. Its capability check cannot run because the primary also lacks
`scripts/generate-capability-matrix.ts`. These missing primary scripts and existing
continuity findings were not repaired. The clean strategy worktree's complete
continuity/capability check passes.

No primary file was staged or committed. No `.program`, global/trust configuration,
runtime, service, provider, student, payment, capacity, roster, schedule, message,
migration, or deployment state changed. Astra separately applied the reviewed
four-candidate Company OS delta at revision 247; Sol did not edit program state.
