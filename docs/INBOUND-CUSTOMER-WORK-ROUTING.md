# Inbound customer-work routing

Status: implemented under `NC-20260903-002`; deployment and live verification
remain separate evidence until recorded in the engineering changelog.

## Objective

Every accepted inbound Gmail message has one durable classification and one
explicit primary work owner. Classification, owner dispatch, escalation
visibility, and customer delivery are separate states; a Slack summary or a
security denial cannot substitute for any of them.

## Authority

1. Gmail supplies the exact source Message-ID, Thread-ID, sender, recipients,
   subject, and body.
2. `src/classification-policy.ts` is the executable label/disposition catalog.
3. Migration 141 reconciles the enabled PostgreSQL taxonomy with that catalog.
4. `email_classifications` is the durable per-message classification and route
   receipt.
5. Sales owns approval-gated customer-response drafting. Chief owns ambiguity,
   coordination, and visibility—not customer replies. Mailman executes only an
   exact host-approved email action.

`auto_archive` controls only Gmail inbox cleanup. It never decides whether an
email receives owner work; routing comes exclusively from the canonical
disposition policy.

## Flow

```text
Gmail source persisted
  -> Mailman classify_email once
  -> host binds proposal to stored Gmail source
  -> validate canonical enabled label before insert
  -> durable email_classifications row
  -> canonical host disposition
       support/refund -> Sales SERVICE work
       lead -> Sales or Inbox matching path
       payable/procurement/assets -> owning minion
       legal/personal/unknown -> Chief review
       routine noise -> classify only
  -> optional secondary visibility after primary ownership
```

Mailman never posts a parallel escalation during inbound classification. The
host owns all fan-out after the classification receipt.

## Recovery

The Gmail classification reaper scans a bounded seven-day window of retained
raw inbound Gmail rows after a 60-second grace period.

- No classification row: create one idempotent `MrGru/other`
  `mailman-host-fallback-v1` receipt and route the complete stored source.
- Valid actionable row with `routed_at IS NULL`: atomically claim and retry the
  existing classification route.
- A routed host fallback cannot be overwritten and re-routed by a late model
  classification. Operator correction remains a separately explicit path.

The reaper runs after startup and every minute. It never approves or sends an
email.

## Gmail denial semantics

Each Mailman turn receives a host-minted run identity and a host-recorded turn
kind. Gmail IPC carries that proof.

- An unapproved send/reply attempted during raw inbound classification is an
  expected policy denial. It is quarantined, Gmail is not called, the same
  container is told to classify once, and no customer-work Chief alert is
  created.
- An approval-binding, approved-action, authorization, safety, or Gmail failure
  on a real outbound handoff retains the existing Chief/approval-thread alert
  and fail-closed action state.

## Work identity

The current source tuple is `Lead Email/From + Message-ID + Thread-ID`. Gmail
may group templated outbound conversations from different recipients under one
mailbox Thread-ID, so Thread-ID alone is not Party or recipient identity. Slack
work remains sender-address anchored; final delivery remains bound to the exact
approved card, recipient, visible CC, Gmail thread, Action-ID, and one-time
provider receipt.

## Rollout plan

1. Apply migration 141 and verify the catalog/flags read back exactly.
2. Build and verify one immutable release from the reviewed commit.
3. Drain active Sales/Mailman work and pending email actions.
4. Activate the release and verify release identity, one listener, Gmail/Slack,
   queues, run-bound tools, and the reaper.
5. Use sanitized no-send route canaries for support, refund, invalid label,
   shared Thread-ID, missing classification, stalled route, and expected versus
   genuine Gmail denial.
6. Reclassify only the exact confirmed stranded overnight support messages
   after checking that no Sales work or customer send already exists. This may
   create approval-gated Sales work; it never approves or sends it.

Rollback disables the new release first, restores the prior release pointer,
and applies `rollback_141_classification_routing_integrity.sql` only if the new
labels must be removed. Existing action/approval/Gmail receipts are never
rewritten or deleted.
