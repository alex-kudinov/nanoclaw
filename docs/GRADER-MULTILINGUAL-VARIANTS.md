# Multilingual Foundation grader variants

Status: implemented locally, not deployed or live-verified
Task: `NC-20260824-008`
Locales: `en-US`, `fr-FR`, `ja-JP`, `es-419`

## Outcome and boundary

One operator grading request covers all enabled Mentor Coaching Foundation
course variants. The operator visits each Heartbeat course sequentially while
the grader retains one isolated Slack root/container per written submission.
The grader evaluates the original-language work against the exact localized
live assignment and prepares the feedback body in the host-bound course
language.

This design does not give the grader Heartbeat credentials or provider-write
tools. Heartbeat remains authoritative for queue state, approvals, retries,
prerequisites, completion, and any later certificate decision. The first local
release keeps French, Japanese, and Spanish Heartbeat writeback, completion-
tracker mutation, certificate readiness, and issuance disabled. It can prepare
and review localized Slack staging copy without converting that source result
into a customer-facing outcome claim.

## Authority and source flow

1. Each localized course dossier's `course.json` supplies its exact course ID,
   written-assignment lesson IDs, and localized live titles.
2. Its ratified README/glossary supplies the locale register and official
   terminology used to build a concise grade-time profile.
3. The standalone `~/dev/grading/registry.json` is the runtime allowlist and
   variant catalog mounted into the grader container.
4. The NanoClaw host resolves the variant code from the Slack root, validates
   the registry shape, fetches the allowlisted Heartbeat lesson, and binds the
   variant/locale/language to one exact Claude turn.
5. `groups/grader/CLAUDE.md`, the generated pack, live assignment context, and
   host output gate jointly define the grading/output contract. The host gate,
   not the prompt, decides whether staging copy may reach Slack.

Localized course repositories are read-only onboarding sources. They are not
mounted in production and are not a runtime dependency.

## Variant identity

The six English codes retain their existing names and records. Each localized
course has six distinct written codes:

| Logical assignment | French | Japanese | Spanish |
| --- | --- | --- | --- |
| `foundation-m1` | `foundation-fr-m1` | `foundation-ja-m1` | `foundation-es-m1` |
| `foundation-m2` | `foundation-fr-m2` | `foundation-ja-m2` | `foundation-es-m2` |
| `foundation-m3` | `foundation-fr-m3` | `foundation-ja-m3` | `foundation-es-m3` |
| `eval-m4` | `foundation-fr-m4` | `foundation-ja-m4` | `foundation-es-m4` |
| `eval-m5` | `foundation-fr-m5` | `foundation-ja-m5` | `foundation-es-m5` |
| `facilitation-m6` | `foundation-fr-m6` | `foundation-ja-m6` | `foundation-es-m6` |

Every live entry carries `logical_code`, `course_variant`,
`completion_course`, `locale`, `feedback_language`,
`live_assignment_required`, `locale_profile`, and
`shared_precedent_code`. Variant-specific codes keep attempts, resubmissions,
completion, caches, and idempotency separate. The logical code permits the same
decision standard and Module 6 prerequisite meaning to be reused without
sharing course state.

The grading validator rejects missing profiles, invalid locale/language pairs,
unknown completion courses, duplicate course/lesson mappings, duplicate live
titles inside a course, missing shared precedent, and a written code belonging
to more than one completion course. The separate source-host verifier compares
all 18 localized registry course/lesson/title tuples and snapshot bytes against
the three current course dossiers before release.

## Packs and feedback quality

Localized packs combine:

- the shared Tandem grading voice;
- a concise locale/register/terminology profile;
- the existing Foundation grader and course material;
- the localized assignment snapshot as a drift comparison only;
- the English logical assignment's decision precedent, with historical
  student-facing wording omitted.

The live localized Heartbeat assignment still outranks the snapshot for what
the learner was asked to do. English precedent calibrates the decision bar; it
is not a translation template or feedback voice. Localized entries use
`calibration_status: precedent_shared`, not `has_data`, so the machine-readable
record does not imply that real submissions already exist in that locale.

The host output boundary preserves all existing rules and adds conservative
locale checks. Japanese staging must contain Japanese script; predominantly
Japanese output is refused for an English run. French and Spanish deliberately
avoid unreliable heuristic language detection. Closed, locale-specific process
vocabulary, synthetic praise, and cohort-template phrases are blocked. English,
French, Spanish, and Japanese salutations are checked only when the address is
deterministically identifiable; no salutation remains valid.

These checks do not prove native quality. Before any localized Heartbeat
writeback is enabled, the release still requires submission-in-hand review for
evidence, verdict severity, official terminology, natural register, human
faculty voice, and noticeable-cleanup risk. Model self-review or passing regexes
cannot replace that gate.

## Operator workflow

The personal Heartbeat grading skill owns course traversal. Its maintained
`references/course-variants.json` contains four enabled variants, exact
course/cohort identities, the nine logical assignment routes, variant grader
codes, and release flags. The default order is English, French, Japanese,
Spanish. An explicit locale request is only a filter.

Each course receives its own schema-version-3 ledger and approval index. The
Slack root's second line is the exact variant grader code, not a localized
title requiring inference. Idempotency includes course ID, course variant,
logical key, student, submission time, and file hash when present.

English preserves existing tracker and certificate behavior. Localized ledgers
set the certificate sweep to `not_applicable` and perform no tracker,
Sertifier, certificate-notification, or Heartbeat writeback while their
manifest flags remain disabled.

## Release and rollback

Source completion is distinct from deployment and customer outcome. Release
requires the existing grader recalibration baseline, focused/full tests,
standalone grading validation, skill validation, exact artifact build, runner-
before-host activation if the deployed base still lacks per-turn proof, and a
sanitized per-locale Slack staging canary. The canary must confirm exact runtime
identity, host-bound locale context, correct-language acceptance, wrong-language
rejection, and no Heartbeat/certificate side effect.

Rollback is the normal immutable NanoClaw release rollback plus the prior
standalone grading tree commit. The personal skill can restore its prior
manifest/instructions independently. Do not roll back by deleting localized
records or rewriting historical attempts; no such migration is part of this
change.
