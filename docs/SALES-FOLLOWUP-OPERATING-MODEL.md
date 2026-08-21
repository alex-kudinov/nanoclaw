# Sales, proposal, and receivables follow-up operating model

Status: process authority and live dark foundation; rejection correction deployed; no source/action wiring
Task: `NC-20260821-002`
Date: 2026-08-21

## 1. Outcome

Follow-up is not a daily list of people to email. It is a durable set of exact
business cases whose next action becomes eligible only when current evidence,
cadence, ownership, and authority all agree.

The process has three lanes:

| Lane               | Exact case identity              | Evidence owner                                             | Work owner                                             | Customer action                                                   |
| ------------------ | -------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- |
| Sales conversation | pipeline entry plus Gmail thread | PostgreSQL interactions plus Gmail delivery/reply receipts | Sales                                                  | exact-thread draft, human approval, Mailman send                  |
| Proposal signature | Plutio proposal ID               | current Plutio proposal                                    | assigned relationship owner through Sales              | proposal-link draft, human approval, Mailman send                 |
| Receivable         | Plutio invoice ID                | current Plutio invoice plus transactions                   | Contador for ledger truth; relationship owner for tone | no draft until collection review; human approval and Mailman send |

The three lanes share scheduling and receipt mechanics. They do not share
commercial authority, copy, cadence, or terminal rules.

## 2. Production finding and containment

On 2026-08-21 the scheduled `task-followup-daily` row was still active at
09:00 CT on weekdays, despite being understood as off. Ten consecutive runs
from 2026-08-12 through 2026-08-21 failed their completion contract. Recent
runs repeatedly selected the oldest five leads, queued asynchronous Gmail
reads, and ended without a complete visible artifact set. Because an approval
rejection produced neither a confirmed send nor a durable terminal decision,
the same proposed email could return as ostensibly new approval work on the
next weekday. The observed harm was repeated presentation, not repeated send.

The live Sales view contained 128 rows for 108 distinct parties:

- 120 rows / 100 parties at confirmed-follow-up count zero;
- five rows / five parties at count one;
- three rows / three parties at count two.

The view is per active pipeline entry while its outbound count and thread are
per party. It does not claim a case, exclude an already-pending draft, or prove
that the latest conversation event is our outbound message. A failed run
therefore leaves the same records eligible as apparently new work the next
day. Multiple active entries can also duplicate one party while sharing a
party-global count and thread.

The exact task was paused after a WAL-safe SQLite backup at
`NC-20260821-002-20260821T144453Z`; `quick_check` passed before and after the
guarded one-row update. It must not be resumed as the new process.

The separate proposal loop is active by default. The current Plutio snapshot
has five genuinely pending proposals totaling $38,300, with no approval,
auto-invoice, or project conversion markers. Its ledger has twelve sent, seven
expired, and two cancelled rows. Four of the five current proposals are stuck:
an expired sequence remains in `existingSequences`, preventing a replacement
draft forever. The 2026-08-21 host pass scanned five and skipped all five.

The current Plutio invoice snapshot has 20 issued-but-unpaid invoices. Only
eight are overdue, totaling $23,793.50 outstanding with no partial payments;
the other twelve, totaling $64,383.10, are future-due and are not collection
work. NanoClaw has no customer receivables follow-up workflow.

These counts are a read-only point-in-time baseline, not a backfill or an
authorization to contact anyone.

## 3. Shared case contract

Every candidate is represented by one stable case. A scheduler observes and
updates cases; it never invents a new work item merely because another day
started.

Required content-free fields:

- lane and stable source key;
- Party ID when resolved, plus pipeline entry for a Sales conversation;
- current owner group and, where required, assigned human owner;
- source status and source-evidence fingerprint;
- last inbound, outbound, confirmed attempt, and source observation times;
- confirmed attempt count for this exact case, never party-global email count;
- current disposition and named reason;
- next eligible business date;
- pending approval/action binding, if any;
- exact presentation identity and named-human decision receipt, if any;
- block, suppression, escalation, and terminal reason;
- optimistic version and append-only event/receipt identities.

Names, email addresses, subjects, bodies, proposal copy, invoice descriptions,
and arbitrary source JSON do not belong in the Company OS case ledger.

### Dispositions

| Disposition         | Meaning                                                                  |
| ------------------- | ------------------------------------------------------------------------ |
| `waiting`           | real case, but cadence or a current pending decision means no action now |
| `ready`             | one named next action is eligible now                                    |
| `claimed`           | one host worker owns this case/version for a bounded attempt             |
| `awaiting_approval` | exact immutable draft/action is waiting on a named human                 |
| `blocked`           | missing or contradictory evidence prevents safe action                   |
| `completed`         | the source reached a defined terminal outcome                            |
| `cancelled`         | exact suppression/operator decision ended this follow-up case            |

One case/version may have at most one active claim or approval. Failure,
expiry, or restart changes that same case's disposition and next eligible time;
it does not create a fresh daily candidate.

### Presentation rule

Operator surfaces distinguish:

- newly ready or materially changed cases;
- previously presented cases whose retry/escalation boundary is now due;
- unchanged waiting/blocked backlog shown only as aggregate health;
- source-closed cases shown only in receipts or requested history.

An unchanged fingerprint must never create another top-level Slack item.

Silence, an ignored card, and approval expiry are not rejection. They keep the
same case non-actionable and may appear in aggregate approval health, but they
do not mint a new daily card or regenerate identical bytes. A later retry must
be an explicit operator decision bound to that exact presentation and a new
case version.

## 4. Lane A: Sales conversation

### Owner

Sales owns the case and draft. Mailman alone executes an exact approved email.
Chief receives only policy, identity, source, or repeated-attempt exceptions.

### Eligibility

A customer draft is eligible only when all are true:

1. the pipeline entry is active and not paused, nurture, won, or lost;
2. the exact Gmail thread is bound to this pipeline entry;
3. a Gmail-confirmed outbound message is the latest customer-facing event;
4. no newer inbound reply is waiting for Tandem;
5. no pending draft, approval, action claim, or uncertain delivery exists;
6. there is no current open proposal for this case/party;
7. no DND, unsubscribe, operator suppression, or other stop rule applies;
8. the lane-specific confirmed-attempt cap has not been exceeded.
9. no named operator has declined this exact follow-up case.

Missing thread identity is a block, never permission to search broadly or send
a detached message. A newer inbound reply is response work, not follow-up.

### Default cadence

Cadence uses America/Chicago business dates; weekends are skipped. Holidays
remain an explicit future calendar dependency.

- Follow-up 1: three business days after the last confirmed outbound.
- Follow-up 2: five business days after confirmed delivery of follow-up 1.
- Close review: ten business days after follow-up 2, with no third email.

Close review recommends `nurture`, `lost`, snooze, or a human-owned next step.
It does not mutate the pipeline without a typed, read-back-verified action.

### Approval rejection

`lost` is the canonical terminal pipeline stage; there is no separate `dead`
stage. A named operator's explicit rejection of the exact Sales follow-up card
means all of the following, atomically or not at all:

1. append a content-free decision receipt bound to the exact case version and
   Slack presentation;
2. cancel the exact follow-up case with reason
   `operator_declined_followup`;
3. transition the associated pipeline entry to `lost` and read it back;
4. retain durable no-follow-up suppression so a duplicate/alias cannot re-arm
   the same case;
5. post one receipt describing only what durable state actually changed.

If current source evidence, case version, Party identity, or duplicate-entry
reconciliation does not agree, the rejection is blocked and visibly reported;
the host must not guess. Reopening later requires an explicit operator action.
This transition is a replacement activation requirement, not authority for the
currently unwired dark foundation to mutate the live pipeline.

## 5. Lane B: proposal signature

### Owner

Sales coordinates, but the assigned relationship owner determines sender and
commercial context. An unmapped owner blocks customer drafting and routes to
Chief. A fixed global sender is not acceptable authority.

### Eligibility

The host must read the current proposal immediately before both drafting and
approval execution. A customer draft requires:

- exact Plutio status `pending` and a real `pendingAt`;
- `approvedAt`, `autoInvoiceId`, and `projectId` all absent;
- resolved recipient and Party identity;
- assigned relationship owner;
- a previously verified client-facing proposal link;
- no newer reply, pending action, decline, cancellation, or suppression.

A Plutio `pending` status with any conversion marker is terminal won work, not
an unsigned proposal. Draft/issue dates do not substitute for `pendingAt`.

### Default cadence

- Touch 1: five business days after `pendingAt`.
- Touch 2: five business days after confirmed delivery of touch 1.
- Touch 3: eight business days after confirmed delivery of touch 2.
- Close/extend review: seven business days after touch 3; no fourth automatic
  customer email and no automatic Plutio cancellation.

An ignored or expired approval is not a sent touch. It may re-present the same
touch only after a three-business-day cooldown, as the same case and sequence,
with a new versioned approval binding. It must not become permanently stuck or
advance cadence.

## 6. Lane C: receivable

### Owner

Contador owns invoice/payment truth and the initial collection review. The
relationship owner owns tone and business exceptions. Mailman executes only an
exact approved customer email. Sales does not independently chase money.

### Eligibility

Future-due, draft, paid, cancelled, and zero-balance invoices are not
collection work. An overdue invoice first becomes eligible for internal review,
not an email. That review must establish:

- current Plutio status, due date, amount, amount paid, and outstanding amount;
- current transaction reconciliation;
- whether Stripe/ACH automation, a payment plan, partial payment, dispute,
  sponsor/AP process, or relationship exception applies;
- billing contact and assigned relationship owner;
- absence of a pending reminder, uncertain delivery, or suppression.

Unresolved or contradictory evidence blocks the case. It never defaults to a
customer reminder.

### Default cadence

- Collection review: three business days after the due date.
- Reminder 1: eligible only after that review explicitly marks the balance
  collectible; exact draft still requires human approval.
- Reminder 2: five business days after confirmed delivery of reminder 1, after
  fresh payment reconciliation.
- Escalation: ten business days after reminder 2. This is internal Chief and
  relationship-owner work, not a third automatic email.

Payment, cancellation, credit, approved payment plan, dispute hold, or an
operator stop is terminal or waiting according to its exact source receipt.

## 7. Attempt and approval rules

Every customer attempt follows the existing action boundary:

1. claim the exact case/version;
2. re-read and fingerprint the current source;
3. create one draft whose lane, recipient, source identity, sequence, and bytes
   are immutable;
4. bind it to the exact Slack message and named-human decision;
5. on explicit rejection, record the decision and terminal transition above;
6. on approval, revalidate source status and fingerprint at approval time;
7. hand the exact approved bytes to Mailman;
8. require Gmail message/thread receipt before counting the attempt;
9. append the confirmed attempt and compute the next eligible date.

Queued tools, model completion, Slack posting, or approval alone do not count
as a customer attempt. An uncertain Gmail boundary blocks retry until
reconciled.

## 8. Source events and stop rules

All lanes stop or change state immediately on a newer authoritative event:

- inbound reply or booking;
- proposal approved, declined, cancelled, superseded, invoiced, or converted;
- invoice paid, cancelled, credited, disputed, or put on an approved plan;
- DND/unsubscribe/operator suppression;
- exact named-operator rejection of a Sales follow-up presentation;
- owner reassignment, source identity conflict, or case merge;
- exact send/delivery failure or uncertainty.

A daily source scan may refresh `last_seen_at`. It may append an observation
only when source evidence changes and may present work only when the case first
becomes ready, a retry date arrives, or escalation materially changes.

## 9. Migration and rollout sequence

1. Keep `task-followup-daily` paused. Do not repair its prompt or resume it.
2. Add and test a pure, deterministic lane policy and privacy-minimized case
   fingerprint. No source read or write.
3. Add an admin-only durable case/event schema, default-off projector, and
   content-free named-operator rejection receipt, plus a read-only aggregate
   report. Do not produce drafts.
4. Shadow current sources and reconcile identities, duplicates, ball-in-court,
   conversion markers, expired proposal rows, and invoice payment state.
5. Run an operator-reviewed backlog disposition. Do not bulk-create drafts from
   the 108-party Sales backlog, five proposals, or eight overdue invoices.
6. Activate one lane at a time: Sales conversation, then proposal signature,
   then receivables review. Each requires a natural case, exact attempt receipt,
   unchanged-case no-op, source-close proof, and rollback evidence.
7. Retire the legacy Sales task and proposal loop only after the replacement
   proves parity. Their old tables remain historical evidence.

Deployment checkpoint (2026-08-21): steps 1-3 are complete through exact
release `a939af5a` and live migration 130. The case/event tables are empty and
admin-only, and the pure policy/store remain absent from daemon, scheduler,
IPC, agent, report, presentation, draft, approval, Plutio/payment, and send
composition. Step 4 is the next gate; none of the current backlog is imported.

Correction checkpoint (2026-08-21): exact release `6b9b5f27` deploys policy
version `2026-08-21.2` and live, empty, admin-only migration 131. Explicit Sales rejection evaluates
to terminal `cancelled`, and the schema can retain only a content-free
`declined` receipt. Neither can consume a Slack decision or change a live
pipeline entry; source/presentation/decision-adapter activation remains a
separate evidence gate.

Source-shadow checkpoint (`NC-20260821-005`, deployed and live-verified): policy version
`2026-08-21.3` and a default-dry-run one-shot host command now reconcile the
three lanes into content-free observations and an operator report. The report
shows only new/materially changed cases in detail and aggregates unchanged
waiting/blocked health. Apply requires the exact reviewed snapshot fingerprint,
an exact confirmation phrase, a clean source read, and the existing admin-only
transactional store. It remains absent from daemon, scheduler, IPC, Slack,
agent, draft, approval, and send composition.

The full content-free Mini source audit completed with zero source errors and
189 observations: 164 Sales, five proposals, and 20 invoices. Zero are ready;
165 are blocked, 12 waiting, and 12 terminal. The blocks are 111 unverified
Sales thread identities, 42 Sales source-identity conflicts, four unresolved
proposal owners, and eight invoices requiring payment reconciliation. The 12
waiting invoices carry USD 88,176.60 outstanding. The first deployed run also
found and failed closed on an N+1 Plutio-recipient read; the corrected release
batches those identities once and isolates source completeness by lane.

This completes source observation, not activation. The snapshot contains no
actionable ready work, so projecting it would create only blocked/waiting
records without fixing the underlying evidence. Repairing exact thread
bindings, assigned commercial ownership, and payment receipts is the next
process gate. Any reviewed projection, operator presentation, decision
consumer, draft, send, or schedule remains separately authorized.

No step in this document authorizes a customer email, proposal/invoice change,
payment action, bulk backfill, or scheduler activation.
