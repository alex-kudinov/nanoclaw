# Relationship Context client and customer projection

Task: `NC-20260826-006`

Program item: `work:relationship-context-client-relationship-projection`

Decision:
`.program/decisions/decision-relationship-context-client-relationship-projection-2026-08-26.json`

Status: NC-006 plus NC-009 are live in exact release `6a978328`; Plutio adds
one fresh active and one historical exact engagement while query/minion access
remains disabled.

## Objective and truth boundary

Maintain one deterministic `relationship.client_status.v1` projection for
every active canonical Party. The projection answers which relationship facts
are defensible now without treating convenient identity, attribution, or
activity signals as client authority.

The first policy version uses only:

- the latest exact source-bound Stripe state showing a succeeded PaymentIntent;
- the latest exact source-bound Stripe state showing an active subscription;
- the latest exact source-bound Plutio coaching-project observation, with
  freshness required for current engagement and Completed retained as
  historical engagement;
- active recorded client, student, and prospect roles as separately labeled
  non-authoritative evidence.

The live role table contains nine active client rows, two student rows, and
1,317 prospect rows. Every one has empty metadata, with no source or accepted
decision receipt. Version 1 therefore labels these as recorded roles but never
uses them as positive client/customer authority.

A succeeded payment proves paid-customer history. It does not prove an active
coaching engagement. An active subscription proves current subscription state,
not the service, participant, payer/sponsor relationship, assigned coach, or
contract. NC-009 adds separately authoritative Plutio project evidence under
the exact coaching-field/client-ref rules in
`docs/RELATIONSHIP-CONTEXT-PLUTIO-ENGAGEMENT.md`.

The worker never declares a client from Party existence, display name, email,
provider label, contact form, Chaos activity, website path, appointment alone,
pipeline presence, price, or current inquiry. It does not resolve or promote
legacy identity exceptions.

## Deterministic projection

The worker pages all active `person` and `org` Parties by numeric Party ID in a
single database transaction protected by both a process in-flight guard and a
transaction advisory lock. For each Party it reads:

- active role counts and that Party's role-row watermark;
- the latest observation for each exact Stripe PaymentIntent and subscription
  source record across both account scopes;
- the latest observation for each exact Plutio coaching project, including
  current freshness and historical completion;
- the Party's existing fixed projection version.

Precedence is:

1. `active_coaching_client` from a fresh latest In-progress project;
2. `paid_customer` from succeeded payment or active subscription;
3. `historical_coaching_client` from a latest Completed project;
4. `recorded_client`;
5. `recorded_student`;
6. `recorded_prospect`;
7. `unknown`.

The precedence chooses one summary state but does not erase overlapping facts.
The value retains booleans and aggregate counts for recorded client role, paid
history, active subscription, current/historical/stale coaching engagement,
student role, and prospect role separately. Active engagement is `current`
only from fresh evidence and otherwise remains `unknown`; no identity or
provider-record value is stored.

Each Party carries only its own role, Stripe, and Plutio observation watermarks
plus the accepted projection-policy decision. An unrelated Party's new fact
therefore does not advance every projection version. Exact replay with
unchanged value, status, and watermarks is a no-op.

All projections remain `partial`: a fresh current engagement removes
`active_engagement_evidence_unavailable`, while expired current evidence adds
`active_engagement_evidence_stale`. Otherwise active engagement remains
explicitly unavailable/unknown.
Parties without positive client/customer evidence also carry
`client_evidence_not_found`. A recorded client label additionally carries
`client_role_provenance_unavailable`. These codes mean no accepted evidence is
currently available, not that the Party is proven never to have been a client.

## Runtime and health

The runtime is separately default-off:

```text
RELATIONSHIP_CONTEXT_CLIENT_PROJECTION_ENABLED=0
```

When enabled, startup fires one non-blocking run and an unref'ed 15-minute
timer. `/health.relationshipContext.clientProjection` exposes only mode,
consumer state, timestamps, completion, active/projected Party counts, Party
type counts, aggregate evidence-state counts, changed-projection count, and
bounded error codes. It exposes no Party ID, name, email, provider object ID,
payment amount, contract detail, or projection value.

`consumerEnabled=false` is fixed. `RELATIONSHIP_CONTEXT_ENABLED=0`, absent
group grants, and the existing query policy remain separate and unchanged.

## Provider and action boundary

This worker reads and writes only the host-owned PostgreSQL Party Context. It
does not call Stripe, Plutio, Trafft, Heartbeat, Encharge, contact forms, Chaos,
Gmail, or any other provider. Source adapters remain responsible for exact
native facts and identity references.

NC-009 repairs the shared Plutio read loader without changing credentials and
adds a separately governed provider adapter. This aggregate worker still calls
no provider directly; it consumes only normalized source-bound observations.

No Party merge, role mutation, source-reference mutation, identity promotion,
provider/customer/payment/refund/contract/consent action, communication,
minion capability, checkout recovery, student-lifecycle, Circle, or legacy
receiver change is authorized.

## Verification and release gates

- precedence, overlap, malformed-count, default-off, and PII-negative unit
  tests;
- host startup/in-flight/unref wiring tests;
- disposable PostgreSQL proof over person and organization Parties, recorded
  roles, exact Stripe facts, multi-page scale, evidence addition/removal, exact
  replay, projection coverage, and privacy-negative readback;
- focused Relationship Context tests, format, typecheck, build, continuity,
  capability checks, full root suite, and independent runner tests;
- independent Claude Sonnet/high review with every verified material finding
  corrected and load-bearing corrections re-reviewed;
- immutable build/archive verification locally and on the Mini under the
  pinned Node runtime;
- natural zero-work drain plus readable PostgreSQL/SQLite/plist backup and
  retained prior release pointer;
- off-first activation, exact release/channel/queue/checkout/lifecycle/query
  verification, then one value-redacted flag enable and bounded reload;
- aggregate live readback proving one projection per active Party, defensible
  positive counts, unknown engagement, zero prohibited values, and one
  unchanged-version replay.

No synthetic Party, role, payment, subscription, contract, provider event, or
customer action is created for proof.

## Rollback

Disable `RELATIONSHIP_CONTEXT_CLIENT_PROJECTION_ENABLED` and reload the
verified service before restoring the prior release pointer if code rollback
is required. Disabling stops new projection reconciliation and changes no
provider or source system.

Do not delete existing relationship projections as an ordinary rollback. They
are versioned historical evidence under migration 137. Reclassification or
removal requires a separately reviewed data decision and migration.
