# NC-20260824-008 correction review R3 — response

Read-only review of the three named corrections to
`NC-20260824-008-CLAUDE-COMPOSITE-REVIEW-RESPONSE-R2.md`. No implementation
file was edited. No Bash/shell tool was available in this session; findings
are from static reading of the four named files plus the two named registry
excerpts.

## ACCEPT

All three corrections resolve the R2 findings correctly and without
introducing a new material defect.

### 1. Japanese salutation P1 — resolved

`src/grader-salutation.ts`'s `JAPANESE_ADDRESS_RE` now requires さん/様 to be
immediately followed by whitespace, one of `、,，。:`, or end-of-line
(`(?=[\s、,，。:]|$)`) before it is treated as an address boundary, rather than
matching the first occurrence anywhere in the line. Traced by hand against
the three cases that matter:

- `各シナリオにたくさんの具体的根拠があります。` — さん inside たくさん is
  followed by の, which fails the lookahead; no later さん/様 exists in the
  line, so the regex does not match at all and `extractSalutationName` returns
  `undefined`.
- `皆さんが確認できる構成です。` — さん inside 皆さんが is followed by が,
  same non-match result.
- `皆さん、構成は明確です。` — さん is followed by 、, which is in the
  boundary set, so it matches; the captured candidate is `皆`, which is now in
  `GENERIC_ADDRESSES`, so `salutationMatchesStudent` returns `true` and the
  line is correctly treated as a generic address, not a wrong-student block.

`src/grader-salutation.test.ts` adds exactly these three cases (lines 81-91,
177-181) alongside the pre-existing explicit-name positive/negative cases
(`Adaさん`/`Sarahさん`), so the fix is covered by a regression test, not just
manual reasoning.

### 2. Calibration P2 — resolved

`registry.json`'s `calibration_status_legend` gains a fifth value,
`precedent_shared`, worded to state exactly what R2 asked for: the decision
bar is shared from a calibrated logical assignment, no locale-specific real
submissions exist, and the shared bar plus the locale profile and mandatory
human review still apply. The sampled localized entry (`foundation-fr-m1`)
carries `"calibration_status": "precedent_shared"`, and its rebuilt pack
(`packs/foundation-fr-m1.md:10`) reflects the same value, so the machine-
readable header no longer overstates confidence relative to the
`has_data` legend definition. `validate.py` derives its allowed-status set
from the legend's keys, so the new value validates without a separate code
change.

### 3. Course/lesson P2 — resolved, and closes the gap more completely than the

minimum needed. `src/grader-assignment-fetch.ts`'s `validatePayload` now
compares a returned `course_id` (when Heartbeat supplies one) against
`ref.courseId` and fails with `heartbeat-lesson-mismatch` on a sibling-course
value, while skipping the check when the field is absent (`courseId ===
undefined`) for deployment compatibility. `grader-assignment-fetch.test.ts`
adds both directions: a sibling course ID is rejected, and the correct
registered course ID is accepted. This is defense-in-depth for a live-traffic
mismatch, not a substitute for catching a bad registry entry before it ships.

That second half is covered by the new `verify_variant_sources.py`, read in
full: for each of the three locales it loads the source `course.json`,
resolves the six written units by logical code, and requires the registry's
`course_id`, `lesson_id`, `canonical_title`, `locale`, `feedback_language`,
and assignment-snapshot bytes to match the source dossier exactly — closing
the original R2 concern that a copy-paste error (right `lesson_id`, wrong
`course_id`, e.g. from a sibling locale) would pass silently. It is correctly
scoped as an offline release gate against the read-only course-source
repositories (not a production runtime dependency, consistent with the R1
decision that those repositories are onboarding-only sources).

## Verification limits

Not independently re-run: the claimed "4 files / 141 tests", "3 courses / 18
mappings/snapshots exact", and "32 validator callables pass" figures. This
review traced the corrected regex and fetch-validation logic by hand against
the added test cases and read the full body of `verify_variant_sources.py`
rather than executing it.

No remaining material finding from R2 is outstanding.
