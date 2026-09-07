# NC-20260906-006 verification evidence

Company OS `work:bookkeeper-capacity-enrollment-contract`; accepted local-only
decision `decision-bookkeeper-capacity-enrollment-contract-2026-09-06`.

## Restoration

- Original checkpoint verified against charter 1.0.0/hash
  `38b36c42358ff7c9ec919bfee0d06064cb52e9f9f1623fd4622c933f95b53c6a`,
  state r225, sole claim `NC-20260906-006`; validate/status/check-handoff passed.
- Primary `codex/continuity-reconciliation` remains at `51185a5d` with its
  unrelated dirty operational files preserved. Its tracked authority docs are
  older than the reviewed predecessor; no source implementation uses them.
- Fetched Git; verified `f5adc8cc` contains enrollment `deac91a8`, disposable
  proof `01351538`, and fulfillment-case `fbf02a44`. Created isolated worktree
  `/Users/xbohdpukc/dev/NanoClaw-bookkeeper-enrollment-20260906` on the checkpoint's
  exact requested branch. Registration `38813c85` pushed before source edits.

## Implementation and boundary

See `docs/BOOKKEEPER-ENROLLMENT-CONTRACT.md` for supported paths, host trust,
transaction/CAS requirements, exception resolution, and migration/promotion
boundaries. No new schema, live consumer, CLI, or provider writer exists.
The pure result is serializable; it is not a production persistence receipt.
AI can propose fields; it cannot supply trusted host authority or mutate state.

## Verification

- Pinned Node 22.23.2; isolated `npm ci --include=dev` installed dependencies
  including native SQLite for that runtime.
- Initial focused: 9 files, 124 tests, including 37 new contract cases.
- Initial typecheck: pass.
- Initial full root: 344 passed files, 10 skipped, 2 failed; 3,657 tests pass,
  32 skipped, 2 fail. Exact two failures reproduced in the unchanged predecessor
  worktree at `f5adc8cc` (8 pass / 2 fail): CNPC prompt's stale wrapper-literal
  expectation and Trafft freshness's date-sensitive synthetic appointment.
- Root full suite includes disposable PostgreSQL capacity tests. No production
  credentials, databases, business rows, provider APIs, or customer data were used.
- Final focused/full/typecheck/continuity and review evidence will be appended.

## Independent review

- R1 fresh Sonnet/high session `182a1e4e-2938-4b0e-a7d5-6cacfd7a3840` through the
  installed rotation runner, `alex,info` only, Read/Write tools, 100k compaction
  threshold. Packet `docs/reports/NC-20260906-006-CLAUDE-REQUEST-R1.md`.
- Verdict and measured footprint pending. Codex independently verifies findings.

## Correction and final verification (2026-09-07)

- R1 reached the engine-reading budget without an artifact and was interrupted;
  no verdict is claimed. Footprint: 17 calls, 90,842 cache-create, 1,086,013
  cache-read, 12,807 output, maximum context 90,844 tokens.
- Fresh narrowed R1B (`05b69f82-846b-4d8c-a67b-c969fd9bb5b7`) found generic
  commitment-channel labeling and cross-order same-person/class duplication.
  Codex confirmed and corrected both: preserve the existing channel categories;
  retain actual funding commitments but hold duplicate assignment/roster effects
  with owner exceptions. Grants retain the manual category with exact grant
  provenance on their canonical order.
- Codex additionally corrected replay to use immutable admission evidence and
  prevented unattested conflicting proposals from freezing existing requests.
  R2 (`e1a5e85b-8c5a-4c11-9dd5-23556f152726`) returned NO MATERIAL FINDINGS on
  the five load-bearing corrections (including expired-block/canonical-source
  tests). No provider authentication or transactional persistence is claimed.
- R1B footprint: 4 calls, 71,180 cache-create, 130,982 cache-read, 22,228 output,
  maximum context 77,954. R2: 4 calls, 57,943 cache-create, 127,025 cache-read,
  12,946 output, maximum context 64,717. Neither completed round raised a usage
  warning. Both used Sonnet/high and Read/Write only.
- A final Codex regression reproduced retry of a resolved source conflict
  freezing a later authorized projection (1 fail before correction). The exact
  recorded-conflict guard fixes it; 44 adapter tests pass. Narrow R3 covers that
  last correction independently, with its verdict/usage to be appended.
- Final focused: **131/131**, 9 files (44 new adapter cases).
- Final full root: **3,664 pass / 32 skip / 2 known failures**; 344 passed files,
  10 skipped, 2 failed. Failures remain the same CNPC/Trafft predecessor tests.
- Final pinned Node 22.23.2 typecheck, targeted Prettier, and diff checks pass.
  Initial continuity passes; final staged continuity and Git receipts follow.
- Existing runtime payment script, website-capacity ingress, enrollment and
  capacity engines are byte-for-byte unchanged from the predecessor. No runtime
  consumer or container package changed, so independent runner build and email
  transport checks are not applicable to this unwired pure adapter.
- Tracked foundation docs now distinguish their historical dark-phase gates
  from later capacity deployment receipts; no live state was inspected here.

## Review closure

- R3 `da12a024-3c8b-4ac9-a1eb-c00e15c75e86` returned **NO MATERIAL FINDINGS**
  for the final resolved-conflict replay guard. Footprint: 4 calls, 34,998
  cache-create, 111,848 cache-read, 4,949 output, maximum context 41,772 tokens.
- Three completed bounded Sonnet/high rounds (R1B, R2, narrow R3), plus one
  interrupted scope-drift attempt without a verdict. Codex checked every claim,
  verified the final source, and left no material finding unresolved. Minor
  wording note remains internal-only and has no behavioral effect.
- No Claude source edits occurred; only the named response artifacts were
  written. Source changes, regression implementation, and verification were
  performed by Codex in the isolated worktree.
