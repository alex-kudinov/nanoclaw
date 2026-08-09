# NC-20260809-003 — Procurement proposal and source-next review, Codex R5

- Requested reviewer: Claude Code Opus 5, exact NanoClaw owner session
  `942ee3f7-b76b-4b84-9036-5f19f9f7f3e3`
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`
- Deployed runtime commit: `9aa23b4e7c394145487baabb64873beb5d321617`
- Authorization: read only the non-secret tracked files named below; write only
  `docs/reports/NC-20260809-003-PROCUREMENT-PROPOSAL-SOURCE-CLAUDE-RESPONSE-R5.md`.
- Prohibited: production/database/browser/network access; secrets; raw
  opportunity, customer, pricing, proposal, receipt, or credential content;
  edits outside the named response; commits, deployment, registration, terms
  acceptance, portal acknowledgement, or submission.

## Current production facts, sanitized

Migration 115 and immutable host release `9aa23b4e7c39` are deployed. Its
transactional live-schema smoke passed and rolled back all synthetic rows. The
legacy daily Procurement schedule is paused. The two Procurement taxonomy rows
now route instead of auto-archiving. Two uniquely resolved operators and a
fresh epoch are configured in launchd, but both ingest and review gates remain
disabled until a busy unrelated Sales container drains and the daemon can be
restarted safely. The operational Procurement spawn timeout was raised from 5
to 15 minutes because the accepted nine-unit coverage run cannot be treated as
failed merely because the legacy orchestration cap is too short.

The accepted owner boundary remains absolute: registration, acknowledgement,
terms acceptance, pricing/customer commitments, signature, attestation, and
submission are human-only. A real public opportunity must reach a named-human
`passed` terminal state before any new feed is connected.

## Review inputs

Read these full files:

- `docs/PROCUREMENT-RESURRECTION-PLAN.md`
- `docs/reports/NC-20260809-003-PROCUREMENT-SOURCE-CANDIDATES.md`
- `data/business/migrations/nanoclaw-v2/114_procurement_control_plane.sql`
- `data/business/migrations/nanoclaw-v2/115_procurement_pursuit.sql`
- `data/business/migrations/nanoclaw-v2/rollback_115_procurement_pursuit.sql`
- `groups/procurement/CLAUDE.md`
- `src/procurement-review.ts`
- `src/procurement-ipc-handlers.ts`
- `src/procurement-reconciler.ts`
- `scripts/register-procurement.ts`

Treat private vault files as evidence that exists but is not readable for this
review: 12 briefs, 6 analyses, 2 proposal drafts, 2 status files, and zero
recorded outcomes as of the audit. Do not infer their content.

## Required decisions

Design the smallest migration-116 slice that makes proposal preparation and
outcome closure truthful without automating submission. It must be implementable
in the existing modular monolith and must define:

1. typed artifact-manifest, compliance-matrix, proposal-packet,
   human-approval, manual-submission-receipt, outcome, and debrief records;
2. exact state transitions from `assessing`/`blocked` to `proposal_ready`, then
   from a verified human receipt to `submitted`, and finally to terminal
   outcome states;
3. required hashes, version binding, actor/evidence fields, idempotency keys,
   optimistic concurrency, RLS/grants, and append-only event semantics;
4. which host IPC operations exist, which group may call them, and which
   actions require an exact bound Slack card/command from an allowlisted human;
5. reconciler conditions for incomplete packets, expired evidence, approved
   but unsubmitted work, outcome follow-up, and closed work without debrief;
6. how private artifacts stay outside Git while their checksums and typed
   metadata remain reconstructable;
7. a forward migration, rollback boundary, transactional smoke matrix, focused
   TypeScript test matrix, and bounded public canary;
8. whether the source-candidate ranking is correct and what measurable gate
   must precede SAM.gov, email-alert, and HTML-source activation.

Pay special attention to false receipts, replay, stale version/card/epoch,
partial packet replacement, retroactive mutation of approved bytes, invented
company claims, unverified pricing, and treating an agent narrative as proof of
submission or outcome.

Do not write implementation. Return a decision-complete schema/API/state-machine
review with one verdict: `READY TO IMPLEMENT`, `CHANGES REQUIRED`, or
`OWNER DECISION REQUIRED`. Isolate only genuine owner choices; do not elevate
ordinary engineering decisions. Include inspected files, changed-file
attestation, elapsed time, and observable cost.
