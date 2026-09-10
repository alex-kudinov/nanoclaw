# NC-20260909-002 production-admission rollout packet

Status: prepared and validated; not authorized for execution.

Machine-readable authority:
`docs/work-packets/NC-20260909-002-PRODUCTION-ADMISSION-ROLLOUT.json`.
The adjacent schema and validator fail closed when any required target,
permission, migration, writer, evidence, abort, or rollback field is omitted.

## Recommendation

Do not arm the pilot yet. The exact source and destinations are identified, but
production still lacks migrations 146-148, the production admission/writer
facade, an accepted numeric capacity, Student Roster projection columns and
write proof, and a Heartbeat marker plus complete create/read/remove proof.

Once the four owner decisions below are accepted and all ten preflights pass,
run one natural event only:

- `supervision-inaugural` version 1;
- one undiscounted, USD 3,996, paid-in-full, fully settled self-purchase;
- fixed Tandem Stripe account and one canonical Payment Intent;
- exact checkout cohort `supervision` / `2026-10-07`;
- one source-authenticated participant and one seat;
- exact delivery block `supervision:2026-10-07` with confirmed capacity;
- Student Roster and Heartbeat both ready before the event is diverted.

Anything historical, synthetic, discounted, installment-based, sponsored,
invoiced, multi-seat, refunded, disputed, ambiguous, outside the exact offer or
class, or received outside the activation epoch stays on the established route
before a writer claim. Nothing is manufactured to obtain a canary.

## Exact lineage

Current production is verified at
`726f2c80b3d45ccddf80bfa0fe796281f54b19b1` under Node 22.23.2. The reviewed
projection closure is `d9e298567ae87f48ae5b36152b3322fbbe9b73f6`, but it is
not an ancestor of the live release. The rollout candidate must start from the
then-current live release or reviewed descendant and integrate the pinned
admission/store/projection implementation. Direct promotion of the projection
branch is prohibited because it would lose intervening live work.

## One owner for registration, accounting always continues

Both real Stripe entry paths already converge on
`src/stripe-payment-host.ts#handleStripePayment`: the request-time webhook and
the durable inbox reaper. The rollout must make that shared host path the only
selector.

For the one eligible Payment Intent, one SERIALIZABLE writer claim selects
`legacy` or `enrollment` before any registration effect. The selected pilot uses
`enrollment`. The legacy script runs in accounting-only mode and cannot touch the
roster after that claim. The new production facade writes the canonical order,
seat, enrollment, entitlements, assignment and projection requests in the same
transaction as authenticated receipts and the claim. Raw store functions keep
their disposable-only guard and receive no runtime import.

Payment Log, `public.payments`, and the Contador case remain independent. They
must be written and read back even if identity, capacity, enrollment, roster or
Heartbeat holds. A registration failure cannot erase or downgrade verified
accounting.

## Exact destinations

Student Roster is workbook `Tandem - Student Roster`, CSS tab
`1796552584`. Its current live header is:

`Email | Name | Coaching Supervision Mastery | Refunded | Joined`

The proposed exact target adds eight operational headers in F:M: projection
key/version, enrollment key, assignment key, participant key, offer, delivery
block and delivery start. The adapter captures an A:M preimage, updates or
appends one uniquely resolved participant row, and verifies the exact postimage.
An ambiguous response is read back and held, never blindly retried.

Heartbeat retains the existing content-access group
`fa5f5f09-a10e-4dfd-8bf2-0451f7cffa83` and course
`1f2febfe-eb34-463a-818e-ce7d0cac1251`. The exact proposed zero-content marker
is `class:supervision:live-practicum:2026-10-07:inaugural` beneath a new
`Student Markers` parent. Current documented API reads find neither group.
Creation must prove hidden, admin-controlled, non-joinable, active, and empty of
offers, courses, channels, events, resources and workflows. Both exact group
UUID memberships must be read back for the one exact user.

Encharge and Plutio are explicitly `not_applicable` for this offer/version.

## Migrations and rollback

Production structurally contains migrations 142-145 and exposes only
`nanoclaw_admin` ownership/grants on the inspected targets. Migrations 146, 147
and 148 are absent. Their exact source and rollback SHA-256 values are pinned in
the machine packet.

After a zero-work drain and verified mode-0600 private custom-format backup,
apply 146, 147 and 148 separately from the exact candidate release, then read
back columns, constraints, indexes, triggers, owners and zero non-admin grants.
The all-migrations runner must not be replayed over the populated schema.

Before an event, guarded SQL rollback runs 148, 147, 146 only while every
evidence guard is empty. After the event, never use SQL rollback or a database
restore to erase evidence. Disable future selection, retain accounting and
canonical history, and reconcile the one episode. Provider compensation is
limited to exact receipt-owned effects after preimage/postimage checks; groups
are never deleted and pre-existing access is never removed.

## Same-rollout acceptance

The two milestones are sequential and immediate:

1. Canonical admission: one agreement/order, seat, participant enrollment,
   frozen promises, class commitment/assignment, accounting receipts, target
   requests, and duplicate/alias suppression.
2. Provider projection: exact Student Roster A:M and both Heartbeat memberships
   applied or found idempotently and read back, with no unrelated phase or event
   between them.

A failed or uncertain target leaves the funded promise and class commitment
intact, opens one owned recoverable exception, blocks blind retry, and prevents
end-to-end acceptance.

## Owner decisions still required

1. Authorize the exact future C5/C4 one-event rollout and every external
   mutation enumerated in the machine packet.
2. Confirm the numeric capacity and accepted schedule evidence for
   `supervision:2026-10-07`; the current program statement of 9-12 is not a
   capacity value.
3. Accept the eight CSS operational columns and receipt-owned row/preimage
   update contract.
4. Accept the exact Heartbeat parent/marker identities and the bounded
   membership/compensation contract.

Until all four are accepted, no migration, release, Sheet, Heartbeat, writer,
payment, financial record, customer or student state changes.
