# NC-20260824-008 composite implementation review R2 — response

Read-only review. No implementation file was edited. This session had no shell
(Bash) access, so grading/NanoClaw test suites and validators were not
independently re-executed; findings below are from static reading of the named
paths, cross-checking registry/manifest/ledger data, and reading the existing
test suites to see what they do and do not exercise.

## Verdict

**Staging-only release can proceed after one correction.** The identity,
routing, delivery-gate, and writeback/certificate boundaries are sound and
mostly fail-closed. One real false-positive defect in the Japanese salutation
check (P1) should be fixed before a Japanese staging canary, since it can
block ordinary, policy-compliant Japanese feedback (the locale's own profile
directs the grader to normally omit a salutation, which does not avoid the
bug). Two P2 items are worth cleaning up but do not block staging-only use.

## Findings

### P1 — Japanese salutation regex false-positives on ordinary words containing さん/様

`src/grader-salutation.ts:42`:

```js
const JAPANESE_ADDRESS_RE = /^(.{1,60}?)(?:さん|様)\s*[、,，。:]?/u;
```

Unlike the French/Spanish patterns (`FRENCH_GREETING_RE`, `SPANISH_GREETING_RE`),
this pattern is not anchored to a greeting word. It matches the *first*
occurrence of さん or 様 anywhere in the opening line and treats whatever
precedes it as a candidate name. さん is not exclusively an honorific suffix —
it is a substring of ordinary Japanese words, most commonly たくさん ("a lot",
"many") and 皆さん ("everyone"). A feedback body whose first line is, for
example, `各シナリオにたくさんの具体的根拠があります。` ("Each scenario has a lot of
concrete evidence.") extracts the candidate `各シナリオにた` (the text up to
`さん`), which will not equal the student's name, so
`hasWrongStudentSalutation` returns `true` and the whole student copy is
blocked as `salutation-name-mismatch` — even though the sentence never
addresses anyone.

This is not a hypothetical: `locales/ja-JP.md` (the profile the grader is
instructed to follow) explicitly says "Omit a salutation unless the exact
student name and natural honorific form are certain," so the intended default
Japanese style is exactly the no-salutation, direct-prose opening that is most
likely to trip this pattern on a common word.

Verified as an untested gap: `src/grader-salutation.test.ts` only exercises
`Adaさん` / `Sarahさん`-style explicit addresses (lines 76, 141, 158) and one
salutation-free sentence with no さん/様 in it at all
(`src/grader-output-gate.test.ts:56`). No test constructs a Japanese sentence
that contains さん as a word-fragment without addressing anyone, so this
defect passes the existing suite.

**Fix direction:** anchor `JAPANESE_ADDRESS_RE` to an actual greeting/vocative
context (line-start bare name + さん/様 followed by a name-terminating
boundary, or an explicit greeting token analogous to `Bonjour`/`Hola`), or
require that the captured span not itself end mid-word (e.g. reject when the
character immediately before さん/様 combined with it forms a known common
word, or require the preceding character to be a name-plausible token
boundary). At minimum, add a negative test for たくさん/皆さん before enabling
a live Japanese canary.

### P2 — `calibration_status: "has_data"` is reused verbatim for locale variants with zero real submissions

`registry.json` gives every localized Foundation entry (e.g.
`foundation-fr-m1`, line 576) the same `calibration_status: "has_data"` as its
English precedent, and `build_packs.py` prints that value unmodified into the
pack header (`packs/foundation-fr-m1.md:10`). Per the registry's own
`calibration_status_legend`, `has_data` means "Real graded student submissions
on record ... Grade against them." No French/Japanese/Spanish submission has
ever been graded — `calibration/` contains no locale-variant files, and
`calibration/README.md`'s section map has no locale entries. The pack's own
body is honest about this (the "Shared decision calibration precedent"
section correctly says "Reuse the decision standard, never historical wording
or an English-only voice"), but the machine-readable header field overstates
confidence and is not checked by `validate.py`'s `check_calibration`, which
only inspects `calibration/*.json` files by exact code and never touches
registry entries that have no such file.

Impact is informational, not a release blocker: nothing in the reviewed host
or skill code branches on `calibration_status` to decide whether the
mandatory submission-in-hand review still runs, and `groups/grader/CLAUDE.md`'s
"Uncalibrated assignment" branch only fires on `none`/`calibrating`, so the
mislabeling does not skip a gate today. It is worth fixing so a future
consumer (validator, dashboard, or the grader minion's own status view) does
not treat borrowed English precedent as locale-proven data. Consider a
distinct legend value (e.g. `precedent_shared`) or leaving `rubric_built` for
the 18 locale entries.

### P2 — `HeartbeatAssignmentRef.courseId` is present in the ref but not checked at fetch time

`src/grader-assignment-fetch.ts`'s `validatePayload` (line 118) checks the
returned lesson `id` and `title` against the registry entry, but never checks
`course_id`. This is unchanged from the pre-existing English-only design
(lesson IDs are Heartbeat UUIDs, globally unique in practice), so it is not a
regression introduced by this round, and it is not reachable from untrusted
input — `registry.json` is host-controlled data, not submission content.
Flagged only because the multilingual round is exactly the scenario (four
parallel courses, 24 near-identical lesson shapes) where a registry authoring
slip (correct `lesson_id`, wrong `course_id` copy-pasted from a sibling
locale) would be easiest to introduce and hardest to notice, since neither
`validate.py` nor the fetch path would catch it. `validate.py`'s
`check_heartbeat` (grading/validate.py:63-92) now scopes its duplicate/title
checks by `(course_id, lesson_id)` and `(course_id, norm_label(title))`
tuples rather than a global `lesson_id`, per the R1B spec's explicit "unique
course+lesson identity" requirement — that part is correct and intentional,
not a finding. The gap is narrower: nothing cross-checks that a given
`course_id`/`lesson_id` pair in the registry actually belongs together
against the source `course.json` files at validation time. No action required
for staging; worth a follow-up validator check if locale course IDs are ever
hand-edited again.

## Answers to the review questions

1. **Wrong course/lesson fetch, snapshot fallback, or cross-course collision:**
   No fallback path exists — `loadRegistryAssignments` (grader-submission-context.ts:127)
   rejects the whole registry if any `heartbeat` block is malformed, and
   `resolveFrom` (line 263) blocks with `heartbeat-mapping-missing` rather than
   grading a `live_assignment_required` code from the snapshot. Collision is
   prevented by variant-specific codes plus `validate.py`'s per-course
   lesson/title uniqueness and `courses.json` `written_owner` check (one code
   → one completion course). See the P2 note above for the one narrow,
   host-data-only gap.
2. **Untrusted text selecting locale/language/release flags:** No. Locale and
   feedback language flow only from the host-resolved `RegistryAssignment` →
   `GraderRunContext` → `submissionContext` passed into `checkGraderOutput`
   (`src/ipc.ts:642-648`, `src/grader-delivery.ts:244-250`); confirmed by
   `grader-delivery.test.ts:96` that the locale check applies from the run
   context even when the offered text is plain English. Release flags
   (`writeback_enabled`, `tracker_enabled`, `certificate_readiness_enabled`)
   live only in `references/course-variants.json` and the run ledger, never in
   submission or model text, and `validate-ledger.py:88-89` structurally
   forbids `verified_completed` entries when `writeback_enabled` is false.
3. **English backward compatibility:** Preserved. The six English codes,
   aliases, and heartbeat mappings are unchanged; `courses.json`'s `foundation`
   course keeps its original `required[]`; `check_heartbeat`/`check_label_ambiguity`
   still validate English entries the same way. The added variant fields are
   additive on the same six English registry entries.
4. **Fail-open, over-block, or byte leakage in the output/name/locale gate:**
   No fail-open path found — every new locale check is additive to the
   existing violation list, and a block always routes through
   `formatGraderOutputBlock`, which never echoes rejected bytes. Over-block:
   see the P1 Japanese salutation finding above — this is a real, verified
   over-block risk on ordinary valid Japanese feedback.
5. **Packs reuse calibration without historical wording:** Yes, confirmed by
   reading `packs/foundation-fr-m1.md` end to end: the "Shared decision
   calibration precedent" section pulls the English compendium section via
   `shared_precedent_code` and passes it through `decision_only_precedent()`,
   which strips `**Feedback delivered/Student-facing feedback/Full feedback**`
   lines and replaces them with an explicit omission notice. See the P2 note
   above on the `calibration_status` header field being an inaccurate
   restatement of this same fact.
6. **Operator workflow writing localized state despite manifest flags, cache
   reuse, or identity mixing:** No path found. `validate-ledger.py` makes
   `writeback_enabled`/`certificate_readiness_enabled` structurally load-
   bearing (not just prose in `SKILL.md`): verified actions are forbidden
   while writeback is disabled, and the certificate sweep must be exactly
   `not_applicable` when the sweep is disabled and must not be
   `not_applicable` when it is enabled. Each variant has its own
   `approval_cache` path (`state/foundation-fr-approval-cache.json`, etc.,
   distinct from the English cache), and `validate-course-variants.py`
   enforces unique `course_id`/`cohort_id`/lesson IDs across all four
   variants, so an English cache cannot be silently reused for a locale run.
7. **Validator/test gaps large enough to make this unsafe for staging-only
   canaries:** One — the P1 Japanese salutation gap. Everything else checked
   (registry shape, ledger safety invariants, delivery-gate wiring,
   English-preserving tests, pack precedent handling) has either a passing
   automated check or a real test exercising the behavior claimed.
8. **Drift beyond the no-provider/no-certificate boundary:** None found. No
   new outbound provider/model call was added; `fetchLiveAssignment` is the
   same pre-existing single Heartbeat GET, still credential-gated to the host
   and still absent from the grader container's tools per
   `groups/grader/CLAUDE.md`. `issues_certificate: false` plus
   `certificate_hold_reason` is set on all three locale courses in
   `courses.json`, and the skill's certificate-issuance path
   (`SKILL.md`'s "Issue an Authorized Foundation Certificate") is unreachable
   for a locale variant because `certificate_readiness_enabled` is `false` and
   `validate-ledger.py` will not accept a non-`not_applicable` sweep state for
   it.

## Verification limits

- No Bash/shell tool was available in this session; the "verification already
  run" figures in the request (test counts, `validate.py`/`build_packs.py`
  output) were not independently re-executed here. Findings above are from
  static reading of the source, registry data, packs, manifest, and ledger
  validator logic, plus reading (not running) the existing Vitest suites to
  identify what they do and do not cover.
- Spot-checked rather than exhaustively diffed: one localized pack
  (`foundation-fr-m1.md`) was read end to end; the other 17 locale packs and
  6 localized assignment snapshots were sampled (one Japanese assignment file
  read in full) rather than each read individually.
- Did not re-derive the localized lesson IDs/titles from the source
  `i18n/{fr,ja,es}/course.json` files in this session (that cross-check was
  performed in the prior implementation round); this review trusted the
  registry values as given and checked internal consistency
  (`validate-course-variants.py`'s structural rules, cross-references between
  `registry.json`, `courses.json`, and `course-variants.json`).

## Recommendation

Fix the P1 Japanese salutation false-positive before running a Japanese
staging canary. The P2 items can be addressed opportunistically and do not
block staging-only use of the English, French, and Spanish paths, or of
Japanese once the salutation regex is corrected.
