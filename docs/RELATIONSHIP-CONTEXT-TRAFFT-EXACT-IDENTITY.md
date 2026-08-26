# Trafft exact identity rollout

Task: `NC-20260826-003`

Program item: `work:relationship-context-trafft-exact-identity`

## Rule

Trafft customer and appointment references may bind to a Party only when:

1. the Party was created with `source_provider='trafft'` after the tracked
   `trafft_host_ledger` adapter registration;
2. the customer's first interaction occurred from that Party within five
   minutes of Party creation;
3. exactly one Trafft customer ID appeared for that Party in the creation
   window; and
4. that customer ID has only one canonical Party across the ledger.

After a customer reference is exact-bound, later appointment references bind
only when the interaction's canonical Party agrees with the exact customer
reference. Any disagreement is counted as a conflict and remains unbound.
Legacy/returning customers selected through email remain held.

## Runtime behavior

- reference reconciliation and observation ingestion share one PostgreSQL
  transaction;
- exact refs carry a deterministic receipt and non-null `verified_at`;
- held observations remain immutable history; exact reconciliation creates a
  new `identity_state=exact_reference` observation and current projection;
- Booking/Sweeper identity resolution consults an exact customer ref before
  its legacy email fallback;
- health reports exact customer refs, appointment refs, and reference conflicts;
- a content-minimized host canary consumes one exact Booking policy grant,
  retrieves only the appointment section, records delivery, and outputs only
  resolution/status/count/receipt—not context values or identity.

## Natural evidence before implementation

The live shadow grew from 414 to 420 eligible observations after six natural
appointments. They covered three Trafft customers: one first seen after rollout
and two returning; no customer ID had multiple historical Parties. A stricter
source-created-party query currently identifies two safe customers and four
appointments. All other rows remain held.

## Gates

- safe source-created, legacy held, two-customer creation-window ambiguity,
  reference conflict, exact-first future resolution, replay, and one-shot canary
  tests;
- disposable PostgreSQL proof with exact refs, current projection, null legacy
  observation, no ambiguous attachment, and delivered query receipt;
- independent Claude Sonnet/high review;
- immutable exact-live release, drain/backups, deployment, and live readback;
- no provider/Plutio/customer/credential/payment/contract write, broad minion
  grant, or lifecycle/checkout/Circle/legacy change.

## Live result

Exact release `adc0c5d8` is live-verified. Startup reconciled 422 natural rows
into 2 verified customer refs, 4 verified appointment refs, and 4 current
appointment projections, with 418 current-row holds and zero conflicts. A
direct replay produced 422/422 duplicates and no projection change. One
host-only appointments canary resolved current and delivered minimized receipt
1; global query, scheduled/group consumers, provider writes, and external
actions remain off. The remaining legacy/returning holds require separate
authoritative identity evidence and cannot be promoted by email.
