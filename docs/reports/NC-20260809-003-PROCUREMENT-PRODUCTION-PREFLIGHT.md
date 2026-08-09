# NC-20260809-003 - Procurement production preflight

Date: 2026-08-09T19:49Z
Mode: aggregate-only/read-only except one disposable non-Procurement container
used solely to test CDP reachability
Environment: NanoClaw production Mac Mini

## Service and release

- One daemon runs verified immutable release
  `97ca2ccfb9d3185a5b86607fb8118b997e4ef70b` under Node 22.23.2.
- `/health` reports release mode, manifest verification, matching code root,
  Slack connected, Gmail connected, zero active containers, and no waiting
  groups.
- The operational checkout remains `main` at `a6e4b13` with 210 dirty paths.
  It is runtime state, not a deployment source.
- This implementation worktree therefore starts from exact live release commit
  `97ca2cc`, isolated at `/private/tmp/nanoclaw-nc-20260809-003`.

## Email routing

- Live taxonomy contains enabled `MrGru/procurement/rfp` and `/rfq` rows.
- Both have `auto_archive=true`, priority 2, and two Hive recipients.
- Aggregate classified-mail evidence:
  - legacy `class/procurement/rfp`: 1 total, 1 without `routed_at`;
  - `MrGru/procurement/rfp`: 454 total, 338 without `routed_at`;
  - `MrGru/procurement/rfq`: 12 total, 10 without `routed_at`.
- Total: 466 Procurement classifications, 348 without routing receipts.
- Source tracing proves both caller paths skip the host router when
  `auto_archive=true`; production confirms that configuration is live.

## Control plane and opportunity funnel

- `procurement_source_runs`: zero rows.
- `procurement_observations`: zero rows.
- `procurement_review_cards`: zero rows.
- All opportunities are source-keyless and `review_state=unreviewed`:
  - Bonfire: 385 total - 200 expired, 177 new, 6 rejected, 2 scraped;
  - CaleProcure: 9 total - 5 expired, 4 new;
  - email: 2 total - 2 new.
- No source-keyed `process` decisions exist.
- `procurement_review_state_check` exists but is not validated.
- Neither scraped row points to an existing `Brief.md` through its stored
  `vault_path`.

## Scheduler and configuration

- One active Procurement cron task remains scheduled for 08:00 America/Chicago
  with prompt `Run daily procurement scan`.
- It has 76 successful and 13 error run rows.
- The latest attempt, 2026-08-09, timed out after 1,230,000 ms; the scheduler
  still advanced its next run to 2026-08-10.
- The daemon environment contains none of the four Procurement collection,
  review, epoch, or operator keys. No values were read.

## Framework and browser boundary

- Private artifact counts: 12 briefs, 6 analyses, 2 proposal drafts, 2 status
  files.
- Kill-screen, qualification, pricing, bid-history, and pending-correction files
  all remain dated 2026-04-03/04. Only names, dates, sizes, and counts were read.
- The dedicated browser loopback endpoint is healthy.
- A disposable Alpine container outside Procurement reached the unauthenticated
  shared gateway endpoint. The CDP isolation finding remains live.

## Decisions applied for implementation

The owner's blanket authorization resolves the audit's blocking choices as
follows:

1. Primary and backup decision operators: Alex and Cherie. Exact existing Slack
   UIDs must be resolved host-side without entering Git or logs.
2. Set Procurement RFP/RFQ taxonomy `auto_archive=false`; archive only after a
   durable routing receipt.
3. The named decision actor becomes initial pursuit owner; reassignment remains
   possible through a typed host transition.
4. Default escalation lead time: 14 days, plus immediate escalation for any
   closer deadline or overdue stage.
5. A durable, evidenced `passed` decision is a successful closure canary.
6. Pause the legacy daily scan during cutover. Retire the shared CDP bridge;
   Bonfire returns only through an isolated adapter with measured incremental
   yield.
7. Submission, signature, attestation, registration, terms acceptance, pricing
   commitment, and customer-facing communication remain human-only.
8. No new source is enabled before a source-complete opportunity closes as
   `passed` or `proposal_ready` with every handoff recorded.

## Mutation prerequisites

- Additive schema and taxonomy migration reviewed from a clean commit.
- Back up installed service definition, taxonomy rows, task row, prompt, and
  relevant schema definitions before any production write.
- Produce and independently verify one immutable release artifact.
- Keep release `97ca2cc` and its service definition as host-code rollback.
- Run denial, replay, partial-run, caller-routing, post-decision visibility,
  and reconciler tests before migration or deployment.
