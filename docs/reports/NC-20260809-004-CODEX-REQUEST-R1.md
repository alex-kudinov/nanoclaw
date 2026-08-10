# NC-20260809-004 — Sales request-first implementation, Claude request R1

## Role and continuity

You are Claude Code, the primary NanoClaw owner and the continuing Sales audit
reviewer in session `ae6931fb-c0e6-4714-9b81-ac8599a00f4f`. Codex is beginning
the implementation authorized by the owner after the converged
`NC-20260805-001` audit.

Read the repository authorities and the relevant current files yourself. Do not
rely on this brief as a substitute for source inspection.

## Authorization and boundary

This round is an adversarial design review before Codex edits source. You may
write only your response report:
`docs/reports/NC-20260809-004-CLAUDE-RESPONSE-R1.md`.

Do not edit source, prompts, tests, operational state, databases, schedules, or
configuration. Do not commit, push, deploy, post to Slack, or send email.
Task-scoped repository and audit data transfer between Codex and Claude is
authorized. Secrets, environment files, credential/authentication stores, raw
database dumps, and unrelated customer data remain excluded.

## Required authorities

Read at least:

1. `CLAUDE.md`
2. `docs/PROJECT-MAP.md`
3. `docs/ACTIVE-WORK.md`, especially `NC-20260809-004`,
   `NC-20260805-001`, and overlapping email-delivery entries
4. `docs/CHANGE-PROTOCOL.md`
5. `docs/reports/NC-20260805-001-SALES-JOURNEY-AUDIT-CLAUDE-RESPONSE-R5.md`
6. `docs/reports/NC-20260805-001-SALES-JOURNEY-AUDIT-CLAUDE-RESPONSE-R3.md`
   sections 11–12
7. `groups/sales/CLAUDE.md`
8. `groups/sales/WORKFLOWS.md`
9. `groups/sales/EMAIL-RESPONSE-GUIDELINES.md`
10. `src/autonomy-policy.ts` and `src/autonomy-policy.test.ts`

Also inspect the current dirty diffs before judging overlap.

## Branch-drift fact

The current branch is `codex/continuity-reconciliation` at `0a39380` with a
large shared dirty tree. It predates later commit `97ca2cc` (`fix: return
rejected sales cards to their author`) while carrying overlapping uncommitted
delivery-path work. Therefore this slice deliberately does not touch Mailman,
approval rejection, `pending_sends`, Gmail receipts, or other outbound runtime
mechanics. Absence of `97ca2cc` from this branch is drift, not permission to
reimplement H6 here.

## Proposed first implementation slice

Codex proposes a local C2 slice with four parts:

1. **Request-first Sales decision contract** in Sales prompt/workflow authority:
   `RELATIONSHIP → CURRENT MESSAGE → ANSWERABILITY → ROUTE/BUDGET`. The current
   message is the content authority. Program matching is downstream and
   conditional.
2. **Review-card and response policy** from R3 sections 11–12:
   required `Route`, `Confidence`, `RELATIONSHIP`, `ASK`, and `ANSWERABLE`;
   `ABSTAINED` and `ADDED BEYOND THE ASK` when applicable; commercial fields only
   for a genuinely commercial prospect route; route-specific suppression of
   unrequested price, cohort, program, booking, enrollment, and upsell content.
   LOW confidence produces no customer-facing draft.
3. **Path-signal demotion**: remove Pass 0’s authority to change any
   customer-facing token. Until its four signal divergences are repaired and a
   blinded path-on/path-off evaluation passes, browsing context is not model
   input for drafting.
4. **Isolated marker compatibility** in `src/autonomy-policy.ts`: recognize the
   canonical legal headings `DRAFT RESPONSE TO LEAD:` and `DRAFT FOLLOW-UP:`,
   plus the existing Client Support `DRAFT RESPONSE:` heading, without counting
   status prose as a draft; make follow-up fallback classification
   case-insensitive. Add focused tests. Do not alter autonomy levels or
   promotion thresholds.

Codex also plans offline prompt-contract tests that read the three Sales
authority files and fail if the old mandatory commercial template, confident
path-based recommendation, or additive universal pricing/cohort/free-module
rules return.

## Questions for adversarial review

1. Is this boundary safe and valuable as the first non-overlapping slice, even
   though R5 ranked all deterministic H1–H7 ahead of prompt work?
2. Identify any exact wording or state/route mistake that would still permit a
   sales-first response to a paid client, organization buyer, returning contact,
   vague stranger, or narrow factual question.
3. Resolve the `Known-To-Us` problem for this slice: host-resolved
   `RELATIONSHIP` is not implemented yet. What fail-closed prompt rule should
   prevent an auto-created prospect/visitor record from being treated as a
   real prior relationship?
4. Should `PROGRAM MATCH` and `ESTIMATED DEAL` be conditioned on relationship,
   route, readiness, or a simpler auditable predicate? Give the exact predicate.
5. Is expanding `isDraftMessage()` to the existing Client Support heading safe,
   or should the implementation instead restrict all producers to the two
   canonical headings? Account for the shared autonomy ledger and historical
   backfill.
6. Specify the smallest meaningful offline test matrix. Distinguish prompt
   text-contract tests from behavioral evaluation fixtures; do not pretend text
   presence proves response quality.
7. List any required authority/documentation updates for this exact slice.

## Required response

Write `docs/reports/NC-20260809-004-CLAUDE-RESPONSE-R1.md` containing:

- verdict: `ACCEPT`, `ACCEPT WITH CHANGES`, or `REJECT`;
- blocking findings first, with file/line evidence;
- an exact recommended contract for the unresolved relationship and commercial
  field predicates;
- the recommended marker implementation and tests;
- a concrete file-by-file change surface;
- a focused verification matrix;
- explicit statements of what remains deferred.

Do not edit anything else.
