# NC-20260804-003 — Codex request to Claude R1

## Objective

Adversarially review the proposed C5 repair that makes an approved-email Gmail
call execution intent only: the host must execute customer-facing fields parsed
from the exact Slack card the operator approved, never fields reproduced by
Mailman. The delta also brings scheduled Sales follow-up cards and direct
host-generated proposal follow-ups onto the same durable action/receipt
contract, and reconciles canonical Tandem meeting/checkout links with the host
content whitelist. Identify any remaining wrong-recipient, altered-content,
silent-drop, duplicate-send, false-receipt, or legitimate-link false-positive
path in this delta.

Write the review to:

`docs/reports/NC-20260804-003-CLAUDE-RESPONSE-R1.md`

Do not edit implementation, tests, prompts, continuity files, production state,
or any other artifact. The response file is the only authorized write.

## Incident facts accepted as evidence

- Durable action `4fae5b5b-7a56-4588-8c62-c16e769ae371` had exact approved
  recipient, subject, body hash, Slack card, and Gmail thread.
- The Sales handoff parsed to the same approved hash.
- Mailman omitted `action_id` and changed one literal `&` into `&amp;` in its
  `gmail_reply` body. The host hash guard refused it before an execution claim or
  Gmail call.
- The old generic `[EMAIL HELD]` text incorrectly instructed receipt
  reconciliation even though Gmail was never called.
- After explicit owner authorization, a bounded host recovery re-parsed the
  stored card, required no prior execution/uncertain/confirmed event, verified
  recipient/subject/hash/thread, and queued one exact reply. Gmail confirmed
  message `19fcd16443172cb1` on thread `19fccbd558f107e6` at
  `2026-08-04T14:03:36.867Z`. Do not retry or reproduce that send.
- A later approved Action `c4bdc122-ee80-47fd-848a-a18ddd6318b3` matched its
  durable recipient, subject, content hash, and Gmail thread but was blocked
  solely because `us06web.zoom.us` was absent from the static whitelist. A
  bounded Zoom-only recovery proved there was no prior receipt. Gmail confirmed
  message `19fcd6a20fc986df` on thread `19fcd3af14473697` at
  `2026-08-04T15:35:12.964Z`; the ledger contains exactly one confirmed event.
  Do not retry or reproduce that send.
- Before the pending fix was deployed, Lead #1019 Action
  `732cc8de-b9cc-4cb6-8d73-2e6b833e6d01` reproduced the original content
  mutation. Mailman supplied the correct Action-ID, recipient, and subject but
  expanded one approved literal `&` to `&amp;` (455 approved UTF-8 bytes versus
  459 attempted bytes). The host held before any execution claim. Read-only
  card, ledger, and Gmail Sent preflight proved no prior attempt; bounded
  exact-card recovery then produced Gmail message/thread `19fceafb937b9bfa` at
  `2026-08-04T21:30:50.684Z`. It is confirmed exactly once and must not be
  retried. Existing adversarial entity-drift tests cover this exact mechanism.
- Before the same pending fix was deployed, Lead #1029 Action
  `67a46d16-02d6-4ca8-a7da-4f311d8f2b2d` reproduced the combined path: Sales
  omitted the Action-ID from an unthreaded first-response handoff, and Mailman
  entity-escaped a literal ampersand in both subject and body. The host held
  before execution; Gmail Sent reconciliation returned no message; exact-card
  recovery produced Gmail receipt `19fd3438954b40fe` at
  `2026-08-05T18:50:46.831Z`. A focused IPC regression now requires unique
  recipient-context resolution and host replacement of all mutated fields.
- Before deployment, Lead #1032 Action
  `3d789365-c1e0-4eab-9e9d-8075f7a63859` reproduced the same path again.
  Mailman's unthreaded `gmail_send` omitted the Action-ID, preserved the exact
  approved recipient and subject, but changed one literal body `&` to `&amp;`
  (1,852 approved bytes versus 1,856 attempted bytes). The host held before
  execution; the ledger and exact Gmail Sent search proved no prior send;
  exact-card recovery produced Gmail receipt `19fd44fd031fc6f1` at
  `2026-08-05T23:43:48.546Z`. The Lead-#1029 regression is the stricter combined
  subject/body mutation case and therefore covers this body-only subset.

Do not reopen whether the guard correctly blocked the changed body. The defect
is that normal delivery still depended on a model reproducing immutable bytes.

## Authority order

1. Current source and tests in this worktree.
2. `CLAUDE.md`, `docs/PROJECT-MAP.md`, `docs/SECURITY.md`,
   `docs/CHANGE-PROTOCOL.md`.
3. `groups/mailman/CLAUDE.md` and `groups/mailman/OUTBOUND-EMAIL.md` for intended
   Mailman behavior.
4. `docs/ACTIVE-WORK.md` and append-only changelog evidence.
5. Prior NC-20260802-009 review files as historical design evidence only.

## Forbidden sources and actions

- Do not read `.env*`, credentials, OAuth stores, `store/`, `data/sessions`,
  production logs, Slack/Gmail customer content, or Claude transcript bodies.
- Do not send email or Slack messages, write databases, run activation, restart
  services, modify OAuth, commit, stage, or push.
- Do not include customer body text or addresses in the response.

## Delta to review

- `src/approved-email-execution.ts` (new pure boundary builder)
- `src/approved-email-execution.test.ts` (new field-drift regressions)
- `src/ipc.ts`
- `src/ipc-gmail-auth.test.ts`
- `src/approved-send-handoff.ts` and focused tests
- `src/send-watchdog.ts` and focused tests
- `src/proposal-approved-email.ts` and focused tests
- `src/email-content-guard.ts` and focused tests
- `src/index.ts` proposal approval wiring
- `package.json` (`test:email-critical` inclusion)
- `groups/sales/CLAUDE.md`
- `groups/sales/WORKFLOWS.md`
- `groups/mailman/CLAUDE.md`
- `groups/mailman/OUTBOUND-EMAIL.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/PROJECT-MAP.md`
- `docs/ACTIVE-WORK.md`

Review the complete `b28e38b..working-tree` diff, but report unrelated
pre-existing history only when it creates a load-bearing conflict.

## Required checks

1. Trace action resolution, card retrieval, host rehydration, authorization,
   one-time claim, handler conversion, Gmail acceptance, and receipt commit in
   exact execution order.
2. Verify model drift cannot control executed recipient, subject, body, Gmail
   thread, Action-ID, CC, `html`, `markdown`, `leadId`, or `emailType` once one
   action is resolved.
3. Verify the approved subject still reaches the content guard for replies even
   though Gmail derives the wire reply subject from its thread.
4. Verify a missing/changed stored card fails before Gmail and leaves a visible,
   durable terminal state.
5. Verify a deterministic pre-Gmail claim refusal never tells the operator to
   reconcile a nonexistent receipt, while a real prior execution/uncertain
   attempt still holds for reconciliation.
6. Test action inference when Mailman omits Action-ID: exact reply thread,
   unthreaded send with one candidate, concurrent same-recipient ambiguity, and
   a confirmed replay.
7. Inspect whether tool type or any other retained field can still change
   customer-visible bytes or recipient authority after host rehydration.
   Classify any residual as blocking or separately bounded.
8. Verify `[FOLLOW-UP #N]` cards cannot arm without exact Email, Thread-ID,
   fenced Subject, and fenced body, and that the parsed card supplies
   host-derived `emailType: follow-up`.
9. Trace proposal approval through record, claim, direct Gmail call, immediate
   receipt commit, PostgreSQL mark-sent, confirmed replay, pre-receipt
   uncertainty, and a throw after Gmail acceptance. Prove no retry can duplicate
   a receipt-confirmed proposal email.
10. Inventory remaining active outbound paths (digest, Courses, canary, and any
   other direct host Gmail call) and distinguish internal scheduled delivery
   from approval-driven customer email.
11. Run safe focused tests or typecheck if the local runtime permits. Do not
   downgrade an environment failure into a product conclusion.
12. Check the changed prompts against the actual MCP schema; flag any
    unsupported argument or contradiction.
13. Verify newly allowed domains are limited to canonical Tandem-owned or
    established transactional services, regional Zoom subdomains pass, and
    suffix lookalikes such as `zoom.us.evil.example` remain blocked.
14. Verify a parseable card that would fail the Gmail content guard is replaced
    by a visible rejection before Slack approval and cannot mint an Action-ID
    even if a legacy copy is reacted to directly.

## Protected invariants

- No regenerated draft and no customer send during review.
- Exact approved recipient/subject/body/card remain the authority.
- Confirmed replay never calls Gmail again.
- Executing/uncertain prior acceptance is never retried automatically.
- Recipient/Party, content, test-routing, Gmail-resource, interaction logging,
  and receipt checks remain host-side.
- A model-added CC or raw-HTML flag is never executed for an action whose
  approval record does not contain it.
- Legacy Sales follow-up cards missing exact execution fields fail visibly and
  do not mint an action.
- A proposal Gmail receipt prevents a second send even if downstream logging or
  proposal-state persistence fails.
- Existing unrelated dirty work is untouched.

## Required response shape

1. `Verdict: APPROVE` or `Verdict: CHANGES REQUIRED`.
2. Blocking findings first, with file/line and a concrete reproduction.
3. Security and delivery invariant matrix.
4. Remaining outbound-email gaps, explicitly separated into:
   - fixed by this delta;
   - known but outside this incident class;
   - newly discovered blockers.
5. Mechanical checks run and results.
6. Exact files written (must be only the response).
7. Elapsed time and unresolved owner decisions.
