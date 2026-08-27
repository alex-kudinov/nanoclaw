# Stripe, contact-form, and verified-Chaos Relationship Context

Task: `NC-20260826-005`

Program item: `work:relationship-context-stripe-contact-chaos-enrichment`

Decision:
`.program/decisions/decision-relationship-context-stripe-contact-chaos-enrichment-2026-08-26.json`

Status: local implementation, disposable-PostgreSQL proof, and independent
Claude Sonnet/high review complete with no unresolved material finding; commit,
release, deployment, and live reconciliation remain separate gates.

## Objective and boundary

Extend the existing provider-neutral Party Context through three ordinary,
read-only adapters:

1. both fixed Tandem Stripe account scopes;
2. immutable archived Tandem contact-form submissions; and
3. only Chaos visitor/contact links whose verified inbox and interaction
   evidence agree on one canonical Party.

The adapters may write only host-owned Party refs, normalized observations,
deterministic projections, adapter registrations, identity exceptions, and
aggregate health. They may not mutate Stripe, payment/customer/subscription,
contact form, n8n, WordPress, Chaos, Party merges, consent, communications,
checkout recovery, lifecycle, Circle, legacy receivers, or minion grants.

`RELATIONSHIP_CONTEXT_ENABLED=0` remains the query boundary. The new source
flag grants no minion read and no downstream action.

## Verified aggregate baseline

Read-only discovery on 2026-08-26 found:

| Source | Aggregate coverage before import |
| --- | --- |
| Stripe Heartbeat | 173 customers, 412 payment intents, 14 subscriptions; 55 customer rows currently map to one canonical Party before account-local duplicate-email refusal |
| Stripe Tandem | 624 customers, 1,013 payment intents, 32 subscriptions; 43 customer rows currently map to one canonical Party before account-local duplicate-email refusal |
| Contact form | 191 handled immutable ingress rows; zero provider event/submission IDs, zero inbox Party bindings, and only 11 non-empty bounded entry pages |
| Form interactions | 208 current inbound form interactions with no source provider/ID, plus 39 historical WordPress-source interactions |
| Chaos | 1,331 stable visitor interactions over 1,225 canonical Parties; zero interaction-side visitor-ID multi-Party conflicts; 38 verified inbox rows lack a matching interaction and three disagree on Party |

Stripe also has 271 legacy `public.payments` rows, 11 current fulfillment
cases, and 12 checkout-recovery cases. Those ledgers remain authoritative for
their existing operational purposes; the adapter does not replay or rewrite
them.

The live baseline remained exact release `1a381e48` with query disabled,
healthy channels, and duplicate-only Trafft replay. Plutio refs had naturally
grown from 1,364 to 1,365; the Trafft exact/legacy totals remained 159/358 and
14/66.

## Evidence tiers

### Stripe

Each credential handle must resolve read-only to a distinct Stripe account.
Only its content-minimized account fingerprint is persisted in adapter
configuration/receipts; the account ID and credential remain transient.

Resolution precedence:

1. an existing active account-scoped exact Stripe customer ref remains exact,
   even if the provider email later changes or disappears;
2. otherwise the normalized customer email must occur exactly once among
   customers in that Stripe account and resolve to exactly one canonical
   Party;
3. missing email, duplicate account-local email, zero Party, or multiple
   Parties becomes terminal legacy;
4. a different-Party external-ref collision is isolated as a conflict.

Payment-intent and subscription refs/facts attach only through an exact
customer ref. Unattached native objects remain counted as held; they do not
select a Party. Persisted commercial facts contain only opaque object refs,
status, currency code, subscription end/cancel state, timestamps, confidence,
and exact-customer-link state. Amounts, card/payment-instrument data, names,
emails, addresses, metadata, invoice text, and raw provider objects are
discarded.

### Contact form

The current n8n contract omits Gravity Forms entry ID, so retry-level provider
deduplication is unavailable. The immutable `business_v2.webhook_inbox.id` is
therefore the exact first-party source record for this slice. It is not
presented as a Gravity Forms provider ID.

The submitted email is transient matching evidence and must resolve to exactly
one canonical Party. The adapter persists only the internal submission ref,
bounded entry page, effective/observed time, and exact-submission state. Name,
email, company, message, and raw form payload never enter Party Context.
Missing/unmatched/ambiguous submitted identity becomes terminal legacy.

### Chaos

A visitor ref binds only when all are true:

- a stable numeric visitor ID exists;
- its Chaos interaction rows resolve to exactly one canonical Party;
- at least one handled/duplicate inbox record says `identity_status=verified`;
- all non-null inbox Party evidence resolves to exactly the same Party.

Missing interaction linkage, absent inbox Party, multiple Parties, or any
canonical mismatch becomes terminal legacy. If a previously active Chaos ref
loses this agreement, the ref becomes `conflicted` before the legacy receipt is
recorded. Browsing behavior alone never binds identity.

The attribution fact retains only bounded form type, a normalized Tandem path
or `external:<hostname>`, source/effective time, and verified-link state. Query
strings, fragments, email, names, intent summaries, user agents, IP/device,
session, referrer, form fields, and browsing history are excluded.

## Runtime and health

The source runner is default-off:

```text
RELATIONSHIP_CONTEXT_SOURCE_ENRICHMENT_ENABLED=0
```

When enabled, startup fires one non-blocking run and an unref'ed 15-minute
timer. An in-flight guard refuses overlap. Stripe provider reads occur before
database transactions; each Stripe account and each host-ledger adapter then
reconciles in its own transaction, so one source failure cannot roll back a
different source.

Contact form and Chaos reuse the existing admin-only
`business_v2.sweeper_watermarks` authority with dedicated source keys. Contact
uses immutable inbox ID keyset pagination. Chaos stores a versioned pair of
interaction/inbox bigint cursors and reads a bounded numeric primary-key page
from both sources. It then loads full evidence only for the bounded changed
visitor-ID set through the existing source-reference indexes. Numeric table
columns, not text-cast aliases, own cursor ordering. Each ledger resets its own
position independently whenever its bounded cycle reaches the end; neither
lane parks behind the other's volume. This deliberate replay is what catches a
lower sequence ID whose transaction commits after a higher ID was already
visible. Persisted coverage flags distinguish first complete coverage from the
current per-lane page/cycle state. Later ticks drain without grouping all
historical Chaos rows or imposing an all-time ceiling. Replayed exact facts are
duplicate-only and terminal legacy remains stable.

Stripe remains a complete current-state snapshot rather than a created-only
cursor because payment/subscription statuses can change. Each object family is
limited to 100 pages per half-open `created` time partition; an overflowing
partition bisects recursively until complete. This removes the former 10,000-
object all-time ceiling while retaining bounded provider pages. A one-second
bucket that still exceeds the page limit fails closed with an explicit health
code. If either account fetch fails, neither account may ingest because
distinct-account evidence is incomplete.

`/health.relationshipContext.sourceEnrichment` reports only aggregate source
counts, exact refs, terminal legacy, held native facts, conflicts, replay and
projection counts, completeness, timestamps, and bounded error codes. It never
returns identities or context values. `consumerEnabled=false` is fixed.

## Verification and release gates

- manifest/scope/identity-tier/page-redaction tests;
- duplicate-account, sibling failure, recursive time-partition pagination,
  durable keyset cursor, provider failure, malformed object/visitor,
  ambiguity, collision, prior-exact, replay, and source-isolation tests;
- disposable PostgreSQL exact refs/facts/projections, dual-source cursor-cycle
  drain/replay, numeric cursor ordering, terminal legacy,
  conflicting Chaos evidence, zero non-admin grant, and PII-negative readback;
- focused Relationship Context tests, format, typecheck, build, continuity,
  capability checks, full root suite, and independent runner tests;
- independent Claude Sonnet/high review with every verified material finding
  corrected and re-reviewed;
- clean commit/push and immutable archive verification on both builder and
  Mini under Node 22.23.2;
- zero-work/email-action drain, readable PostgreSQL/SQLite/plist backup, and
  retained prior release pointer;
- deploy with the new flag off, prove exact release/health/non-interference,
  then apply only the value-redacted flag enable and restart once;
- read back aggregate refs/facts/exceptions/projections, run one exact replay,
  and prove zero provider/customer/form/Chaos writes and unchanged checkout,
  lifecycle, Circle, legacy receiver, Gmail, Slack, and query-grant state.

No synthetic customer, form, payment, subscription, or Chaos event is created
for proof.

## Rollback

First disable `RELATIONSHIP_CONTEXT_SOURCE_ENRICHMENT_ENABLED` and restart the
verified prior release. This stops provider reads and reconciliation while
preserving immutable evidence. The additive migration-137 tables remain.

Do not delete imported refs, observations, projections, exceptions, or
receipts as an ordinary rollback. A data removal/reclassification migration
requires separate review because these records may already explain identity
and context results. Provider systems require no rollback because this slice
never writes them.
