# NC-20260803-001 Codex request R3 — blocker reconciliation

- Reviewer: resume Claude session `74a9751a-7355-4943-b2fe-623f98149b71`
- Review mode: adversarial C5 implementation review; do not edit source
- Base: `fb8ed9e`
- Response path: `docs/reports/NC-20260803-001-CLAUDE-RESPONSE-R3.md`

## Objective

Review the current uncommitted tree after Codex reconciled both R2 blockers,
all release-relevant follow-ups B3-B8, the required tests, and the documentation
corrections. Decide whether this exact diff is safe to commit, build, activate,
and then use for the separately authorized exact recovery of the held reply.

## R2 reconciliation

1. B1: `isApprovalCard()` is exported by `approved-send-handoff.ts` and is the
   single marker predicate used by the IPC pre-approval gate and watchdog.
   Malformed cards for all three markers are rejected/quarantined before Slack;
   well-formed variants remain parseable and unchanged.
2. B2: `GroupQueue.sendMessage` accepts `trackForRecovery: false`. Exact-session
   Gmail async results use that mode: they retain runner-owned container
   targeting but never enter `pipedMessages`, never roll back the chat cursor,
   and never claim recovery the chat DB cannot provide. Authority docs now state
   the exited-origin hold rather than dead-letter recovery.
3. B3: startup reloads persisted groups after migration and asserts against the
   reloaded rows. A failed persistence regression throws.
4. B4: a host-root/outgoing-lead mismatch is still refused and now emits an
   error-level divergence signal covered by the Slack regression.
5. B5: post-classification `Reply-To` extraction is restricted to the stored
   header region. A body-quoted line cannot affect lead identity or grants. The
   narrow header-derived Reply-To grant is documented.
6. B6: dispatcher-level required-parameter validation emits `[GMAIL REQUEST
   INVALID]`, distinct from an exited-origin `[GMAIL RESULT HELD]`.
7. B7: docs now say only Sales-directed handoffs use the new lead identity for
   anchoring; other formatter fields are display-only.
8. B8: approval-card recipient parsing stops before the draft fence/heading, so
   body `To:` lines cannot become recipients or rejection anchors.
9. B9: the activation runbook will drain/restart existing containers. The
   expected one-time relay-envelope anchor transition is documented in R2.

## Independent evidence

- Exact Node 22.23.2 focused reconciliation: 8 files / 279 tests passed.
- Exact Node 22.23.2 `test:email-critical`: 14 files / 413 tests passed.
- TypeScript build-project no-emit check: passed after the R2 fixes.
- `git diff --check`: passed.
- Prior exact Node evidence remains: full 145 files / 1,859 tests, root build,
  agent-runner build and 3 files / 22 tests, and continuity. These broad gates
  will be rerun on the converged snapshot before commit/release.
- No production mutation and no customer send occurred in this task.

## Review questions

1. Is the validation surface now exactly the arming surface for all approvable
   email cards?
2. Can an ephemeral Gmail result now cross sessions, silently disappear, or
   influence chat-cursor recovery?
3. Does the persisted Sales startup invariant now genuinely fail closed?
4. Can a body line affect Reply-To identity, Gmail scope, card recipient, or
   rejection anchoring?
5. Did the B1-B8 fixes introduce a new release blocker or create a false claim
   in an authority document?
6. Give one verdict: `APPROVE`, `APPROVE WITH FOLLOW-UPS`, or
   `CHANGES REQUIRED`, separating blockers from nonblocking follow-ups.

## Recovery boundary

Do not inspect or reproduce customer body text. This round is source review
only. The held action remains unsent. Recovery will preserve the stored exact
recipient/body and use the existing Gmail-thread subject; it will not regenerate
customer-facing content.
