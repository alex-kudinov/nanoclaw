# NC-20260824-008 correction review R3

Review only the corrections to the material findings in
`NC-20260824-008-CLAUDE-COMPOSITE-REVIEW-RESPONSE-R2.md`. Do not reopen accepted
architecture or edit implementation.

## Corrections

1. Japanese salutation P1: `src/grader-salutation.ts` now recognizes `さん`/`様`
   only when followed by punctuation, whitespace, or end-of-line. The generic
   Japanese address `皆さん、` is accepted; ordinary `たくさんの` and `皆さんが`
   are not parsed as names. `src/grader-salutation.test.ts` adds all three
   negative/generic cases while retaining correct/wrong explicit-name cases.
2. Calibration P2: the 18 localized registry entries now use the new explicit
   `precedent_shared` status. The registry legend states that the decision bar
   is shared from a calibrated logical assignment but no locale-specific real
   submissions are claimed. Packs were rebuilt and remain current.
3. Course/lesson P2: `src/grader-assignment-fetch.ts` now rejects a mismatched
   returned `course_id` when Heartbeat supplies one, while remaining compatible
   with deployments that omit it. New tests cover matching and sibling-course
   IDs. The standalone `verify_variant_sources.py` release gate also compares
   all 18 registry course/lesson/title tuples and assignment snapshot bytes
   against the current three course dossiers; it passes.

## Verification

- Corrected salutation/output/delivery/fetch slice: 4 files / 141 tests pass.
- NanoClaw typecheck passes.
- Standalone source verifier: 3 courses / 18 mappings/snapshots exact.
- Standalone validator callables: 32 pass; packs current. The known unrelated
  calibration-schema error remains unchanged.

Read only:

- `src/grader-salutation.ts` and test
- `src/grader-assignment-fetch.ts` and test
- `/Users/xbohdpukc/dev/grading/registry.json` legend plus one localized entry
- `/Users/xbohdpukc/dev/grading/verify_variant_sources.py`

Write only:

`docs/reports/NC-20260824-008-CLAUDE-CORRECTION-REVIEW-RESPONSE-R3.md`

Return `ACCEPT` if no material correction defect remains; otherwise report only
the remaining material finding. No private data, provider action, or broad
review.
