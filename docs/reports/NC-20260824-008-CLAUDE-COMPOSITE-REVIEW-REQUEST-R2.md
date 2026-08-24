# NC-20260824-008 composite implementation review R2

This is the exact-session recovery of the interrupted Sonnet/high core round.
Codex implemented the converged design after the session hit its exploration
limit. Perform a read-only independent review of the complete composite across
NanoClaw, the standalone grading authority, and the personal Heartbeat grading
skill. Write material findings only to the response artifact; do not edit any
implementation file.

## Objective and accepted boundary

One default Foundation grading routine covers English, French, Japanese, and
Spanish course variants. Each course and written assignment retains independent
identity/state. The grader evaluates original-language submissions against the
localized live prompt and prepares feedback in the host-bound language. English
behavior remains active. French/Japanese/Spanish are staging-only: their
Heartbeat writeback, tracker mutation, certificate readiness, issuance, and
notification flags are false pending locale release gates.

No production/provider/student-submission action is part of this review.

## Implemented facts to verify

- Standalone registry: 32 total assignments, 24 live Foundation mappings, six
  written mappings per locale, exact separate Heartbeat course/lesson IDs.
- Completion: `foundation`, `foundation-fr`, `foundation-ja`, `foundation-es`
  use distinct written codes. Localized `issues_certificate` is false with a
  hold reason.
- Packs: 32 current; localized packs include locale profile and reuse the
  English logical decision precedent with historical feedback wording omitted.
- Host: registry loader is data-driven/fail-closed; exact run context carries
  logical code, variant, completion course, locale, feedback language, and
  profile; output gate uses host context for conservative locale policy.
- Operator skill: one manifest-driven `en,fr,ja,es` sequence, one ledger/cache/
  approval index per course, exact variant grader code on Slack root line 2,
  manifest release flags, localized review gate, and disabled localized
  certificate sweep.

## Verification already run

- NanoClaw focused: 7 files / 190 tests pass under Node 22.23.2.
- NanoClaw typecheck passes.
- NanoClaw full suite: 157/158 files and 2,140/2,141 tests pass. The only failure
  is the pre-existing unrelated Sales website-path prompt-contract assertion;
  this task changed no Sales surface.
- Standalone grading: 32 validator callables pass; pack-builder test and pack
  freshness pass. `validate.py` reports only the pre-existing
  `calibration/acc-bars-standard.json` schema-dispatch error plus the existing
  PCC held warning.
- Operator skill: course variant validator passes (4 variants / 36 routes / 24
  written mappings); English and localized final-ledger fixtures pass; bundled
  skill quick validation passes.

## Review paths

NanoClaw core:

- `src/grader-submission-context.ts` and test
- `src/grader-run-context.ts` and test
- `src/grader-output-gate.ts` and test
- `src/grader-salutation.ts` and test
- `src/grader-delivery.ts` and test
- grader-specific context/delivery wiring in `src/index.ts` and `src/ipc.ts`
- `groups/grader/CLAUDE.md`
- `docs/GRADER-MULTILINGUAL-VARIANTS.md`

Standalone grading (`/Users/xbohdpukc/dev/grading`):

- `registry.json`, `courses.json`
- `validate.py`, `test_validate.py`
- `build_packs.py`, `test_build_packs.py`
- `locales/*.md`
- one representative localized snapshot and pack per locale
- `README.md`, `students/README.md`

Operator skill
(`/Users/xbohdpukc/.codex/skills/heartbeat-grade-submissions`):

- `SKILL.md`
- `references/course-variants.json`
- `scripts/validate-course-variants.py`
- `assets/run-ledger-template.json`, `scripts/validate-ledger.py`
- `references/decision-rules.md`, `batch-ledger.md`, `approval-index.md`

## Review questions

Report only P0/P1/P2 material findings with exact file/evidence:

1. Can any localized assignment fall back to an English snapshot, collide with
   another course/record, or fetch the wrong course/lesson?
2. Can untrusted submission/model text select or override locale, feedback
   language, release flags, or certificate behavior?
3. Are English mappings/aliases/output/completion behavior backward-compatible?
4. Can the host locale/name/output gate fail open, over-block ordinary valid
   feedback, or leak rejected bytes?
5. Do localized packs actually reuse decision calibration without importing
   historical English student-facing wording as a voice template?
6. Can the operator workflow accidentally write localized Heartbeat/tracker/
   certificate state despite manifest flags, reuse an English cache, or combine
   course identities?
7. Are validator/test gaps large enough to make the implementation unsafe to
   build/deploy for staging-only canaries?
8. Did the implementation drift beyond the accepted no-provider/no-certificate
   boundary?

Accepted non-findings:

- French/Spanish do not use heuristic language identification; quality is an
  operator/corpus gate.
- Model remains Sonnet in this slice; native quality is not claimed.
- Localized writeback/certificate behavior remains disabled rather than being
  treated as complete.
- The existing standalone calibration schema error and unrelated Sales test are
  not regressions from this task.

## Response artifact

Write only:

`/Users/xbohdpukc/dev/NanoClaw/docs/reports/NC-20260824-008-CLAUDE-COMPOSITE-REVIEW-RESPONSE-R2.md`

Include verdict, material findings ordered by consequence, verification limits,
and whether the staging-only release can proceed after listed corrections. Do
not reproduce private data, credentials, environment values, or unrelated dirty
work.
