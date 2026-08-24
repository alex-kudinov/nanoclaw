# NC-20260824-008 Claude plan convergence and implementation request R1

## Objective

Converge and implement one safe multilingual Mentor Coaching Foundation grading
system. The operator's default grading request must enumerate the English,
French, Japanese, and Spanish Heartbeat course variants automatically, process
one course at a time, and keep one isolated Slack root per submission. Written
feedback must be prepared in the configured course language and must preserve
the existing invariant that a student must never reasonably infer or assume AI
grading.

This is implementation convergence: challenge only decisions that are
load-bearing, reconcile them against the authorities below, then implement the
bounded source/skill/grading-data change in this round. Write the final plan,
files changed, tests, and remaining release gates to the response artifact.

## Authority order

1. Running NanoClaw source/tests and the current clean standalone grading tree.
2. `groups/grader/CLAUDE.md` for grader behavior and side-effect boundary.
3. `docs/PROJECT-MAP.md`, `docs/ACTIVE-WORK.md`, and
   `docs/GRADER-RECALIBRATION-IMPLEMENTATION-PLAN.md`.
4. The localized `i18n/{fr,ja,es}/course.json`, `README.md`, and terminology
   glossaries for course identity, locale, exact live lesson title/ID, and
   language register. These are read-only sources.
5. The personal `heartbeat-grade-submissions` skill for the operator workflow.

Heartbeat remains the live authority for queue state, submission state,
prerequisites, completion, and any later writeback. The grading tree owns
rubrics, calibration, packs, records, and course completion definitions.

## Accepted decisions

Do not reopen these unless current source proves them unsafe or impossible:

1. One default operator routine covers `en`, `fr`, `ja`, and `es`. Locale-only
   filters are optional recovery/debug scopes, never required routine commands.
2. The operator visits course variants sequentially. Inside a course, up to five
   independent written submissions may be in flight, matching current behavior.
3. The grader remains one submission per Slack root/container and receives no
   Heartbeat credential or write tool. The host fetches only the allowlisted live
   assignment.
4. Course variant and feedback language are explicit host-bound registry data;
   they are never inferred from the student's prose. Default feedback language
   equals the course language. An obvious language mismatch holds instead of
   silently switching languages.
5. Preserve one logical rubric/calibration standard for equivalent assignments,
   but use variant-specific assignment codes, live mappings, completion courses,
   and durable record keys so a student's cross-language attempts cannot collide.
6. The operator marker remains exactly `PASS` or `NO PASS`. Only the feedback
   body is localized and eligible for later Heartbeat copy.
7. English behavior and existing records remain backward-compatible. No existing
   student record, ledger row, or historical attempt may be migrated or rewritten
   in this task.
8. Localized variants do not emit certificate handoffs and are not eligible for
   certificate issuance in this implementation. Certificate/product/notification
   behavior needs a separate live policy verification.
9. Locale feedback profiles must bind the ratified course register and official
   terminology: French `fr-FR` professional international French with consistent
   vouvoiement; Japanese `ja-JP` professional natural Japanese with official ICF
   Japan terminology; Spanish neutral international Spanish with consistent `tu`
   learner address and official Spanish ICF terminology.
10. Deterministic gates may block obvious wrong-language/script, process traces,
    locale-specific formulaic phrases, wrong names, and formatting. They must not
    claim to prove native quality. The operator skill retains an independent
    submission-in-hand semantic/style review before any Heartbeat writeback.
11. Prefer localized-only stronger-model routing if it is a small, safely tested
    host change. Do not silently move all English grading to Opus merely to avoid
    designing locale routing. If safe per-run model routing is materially larger
    than this slice, preserve Sonnet and make the no-write calibration/review gate
    explicit instead of pretending polish is proven.
12. This round performs no provider call, student-data read, Slack post,
    Heartbeat write, certificate action, deployment, restart, commit, or push.

## Required implementation outcomes

### A. Standalone grading tree (`/Users/xbohdpukc/dev/grading`)

- Extend `registry.json` with the 18 localized written assignments (six each for
  French, Japanese, Spanish). Use stable variant codes such as
  `foundation-fr-m1`, `foundation-ja-m1`, `foundation-es-m1`; preserve the six
  existing English codes.
- Each localized entry must carry explicit `course_variant`, `locale`,
  `feedback_language`, `completion_course`, live-assignment requirement, exact
  Heartbeat `course_id`, `lesson_id`, and localized `canonical_title`.
- Import localized assignment snapshots and the smallest maintainable locale
  feedback/terminology profiles needed at grade time. Preserve source
  provenance and do not copy secrets, learner data, signed URLs, media assets,
  or unrelated course files.
- Reuse the current Foundation grader, material, and decision calibration. Packs
  may be variant-specific derived artifacts, but historical student-facing
  wording must remain excluded.
- Add `foundation-fr`, `foundation-ja`, and `foundation-es` completion courses,
  with localized quiz titles and `issues_certificate: false` plus an explicit
  hold reason. English Foundation stays unchanged.
- Update the validator, pack builder, status behavior/documentation, and tests so
  the variant schema, unique course/lesson/title mappings, profile references,
  shared precedent, and collision-free completion keys fail closed.
- Do not read or modify `students/`, `ledger.csv`, `submissions/`, or handoffs.

### B. NanoClaw host and grader behavior

- Replace the hard-coded English Foundation live-mapping rule with validated,
  data-driven registry fields while preserving fail-closed behavior.
- Carry `courseVariant`, `locale`, `feedbackLanguage`, and any locale-profile
  proof through submission resolution, exact run context, warm-turn cloning,
  the host assignment context block, and the delivery gate.
- The delivery gate must select locale policy from host context, not message
  content. Preserve all existing English rules. Add conservative, table-driven
  localized checks and tests, including Japanese-script presence, obvious
  cross-script mismatch, locale-specific process/AI vocabulary, formulaic
  praise/transition patterns, and safe multilingual name/salutation behavior.
  Avoid noisy pseudo-language-detection rules for French/Spanish.
- Update `groups/grader/CLAUDE.md` so the minion grades the original-language
  submission directly, uses the configured feedback language and locale
  profile, never uses an English translation as primary evidence, and holds an
  obvious mismatch. Keep the existing output and certificate boundaries.
- Update the current grader design/Project Map and focused tests. Preserve the
  exact per-turn UUID binding and all non-grader behavior.

### C. Operator skill

- Update `/Users/xbohdpukc/.codex/skills/heartbeat-grade-submissions` using its
  existing structure. The default run enumerates all enabled variants from one
  maintained variant manifest, hard-refreshes and reconciles each course
  separately, and continues other locales when one course/item is held.
- Add optional locale filtering without creating four commands the owner must
  remember.
- Add `course_variant`, `locale`, `feedback_language`, and logical assignment key
  to the run ledger and approval index. Idempotency keys must include the exact
  Heartbeat course/variant.
- Map localized assignment titles to the same logical prerequisite columns while
  keeping each course's approvals independent. Do not apply the current English
  certificate-readiness sweep or tracker/certificate mutations to localized
  variants.
- Before localized writeback, require direct-language, evidence, terminology,
  register, human-voice, and mismatch review. A questionable result is held.
- Add a deterministic, non-network validator for the variant manifest and update
  the run-ledger schema/validator where needed. Validate the skill with the
  bundled `quick_validate.py`.

## Read-only localized sources

Use only these source families to derive the variant catalog and profiles:

- `/Users/xbohdpukc/dev/courses/community/icf/mentor-coaching/i18n/fr/course.json`
- `/Users/xbohdpukc/dev/courses/community/icf/mentor-coaching/i18n/fr/README.md`
- `/Users/xbohdpukc/dev/courses/community/icf/mentor-coaching/i18n/fr/terminology/glossary.json`
- corresponding `ja` and `es` paths.

Select the six written assignment unit IDs only: `1.0b`, `2.0b`, `3.0`, `4.0b`,
`5.0`, and `6.0`. Knowledge-check units remain operator-local and must not be
added as grader assignments.

## Allowed edits

- Existing/new grader-focused files under `src/grader-*` and their tests.
- The smallest necessary grader wiring in `src/index.ts`, `src/ipc.ts`,
  `src/types.ts`, or `scripts/register-grader.ts`, with focused tests.
- `groups/grader/CLAUDE.md`.
- `docs/GRADER-RECALIBRATION-IMPLEMENTATION-PLAN.md`, `docs/PROJECT-MAP.md`,
  `docs/ACTIVE-WORK.md`, a new multilingual grader design if useful, and the
  named response artifact.
- `/Users/xbohdpukc/dev/grading`: registry/course/validator/pack/status/docs,
  localized snapshots/profiles, and tests/derived packs only.
- `/Users/xbohdpukc/.codex/skills/heartbeat-grade-submissions`: focused skill,
  reference, asset, state-schema, and validation-script changes only.

## Forbidden paths and actions

- Every `.env*`, credential/auth/session/token store, browser profile, database,
  log, dump, and MCP setting.
- `/Users/xbohdpukc/dev/grading/students`, `ledger.csv`, `submissions`, and
  `handoffs`.
- Any edit under the localized course source repositories.
- Unrelated dirty files and unrelated active tasks.
- Network/provider calls, live Heartbeat/Slack/Sertifier actions, deployment,
  restart, Git commit/push/merge, or generated production runtime state.

## Tests Claude may run

- Focused Vitest files for changed grader modules.
- Pinned Node 22 root typecheck and focused tests; full root suite only if time
  remains after focused correctness.
- `python3 validate.py`, grading unit scripts, and `python3 build_packs.py --check`
  in the standalone grading tree.
- Skill-local deterministic validators plus
  `/Users/xbohdpukc/.codex/skills/.system/skill-creator/scripts/quick_validate.py`.
- `npm run docs:continuity-check` and `git diff --check` for changed surfaces.

Do not run tests that inspect real student records. Use synthetic temporary
fixtures only.

## Response artifact

Write:

`/Users/xbohdpukc/dev/NanoClaw/docs/reports/NC-20260824-008-CLAUDE-IMPLEMENTATION-RESPONSE-R1.md`

It must contain:

1. the converged plan and any corrected decision;
2. exact files changed across all three roots;
3. tests and results;
4. material risks or incomplete acceptance criteria;
5. explicit confirmation that forbidden paths/actions were untouched;
6. the exact next review/release step.

Do not include private submissions, student identities, credentials, secret
values, raw environment data, or unrelated worktree content.
