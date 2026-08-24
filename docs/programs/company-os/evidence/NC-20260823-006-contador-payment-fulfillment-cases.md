# NC-20260823-006 Contador payment-fulfillment case evidence

Date: 2026-08-24T03:35:00Z
Program: `program:company-os`
Work item: `work:contador-fulfillment-case-ledger`
Evidence class: local source, schema-only production-shape rehearsal, tests,
and read-only live aggregates; review, migration, deployment, and natural event
outcome pending

## Authorized outcome

Every host-admitted Stripe payment/refund must either finish with verified
operational readback or persist as a durable owned exception. The accepted
decision `decision:contador-fulfillment-case-ledger-authority` authorizes this
C4 implementation and normal reviewed release path.

This is not accounting authority. No historical replay/repair, manufactured
Stripe event, customer communication, QuickBooks/payable action, product-ID
mapping, payer/student redesign, schedule, or credential change is in scope.

## Verified current gap

- The host archived and retried Stripe webhooks durably, but marked an inbox row
  handled whenever the deterministic child exited successfully.
- `process-payment.cjs` reported Payment Log, roster, and PostgreSQL failures as
  summary strings while often still exiting zero.
- A Slack summary was therefore presentation rather than durable ownership or
  verified completion.
- Read-only production aggregate before implementation: 249 Stripe webhook
  inbox rows (248 handled, one dead-lettered) and 261 `public.payments` rows.
  The new fulfillment tables were absent.
- 247/249 archived Stripe envelopes carry a valid host-derived account; the two
  older missing-account rows are already historical. Current typed admission
  now requires both event type and account.
- Production has a pre-existing `public.payments.cohort` column from separate
  operational work whose source migration is not in this release lineage.
  Migration 133 does not touch or depend on it.

## Implemented boundary

- Resolve an exact Checkout Session read-only to its canonical Payment Intent
  before any external write.
- Commit one privacy-minimized `processing` case plus admission receipt before
  invoking the payment/refund processor.
- Hold a five-minute database lease across the bounded 120-second processor.
  Concurrent delivery returns retryable `inFlight` without a second child;
  expired-lease recovery creates one new version under the admission lock, and
  finalization requires the exact version plus lease token.
- Bind Payment Intent, Checkout, charge, invoice, refund, and provider-event
  aliases append-only; reject cross-case alias reuse.
- Require exact Payment Log, `public.payments`, and mapped-roster readback for a
  payment to become `complete`.
- Persist `needs_student`, `needs_product`, `write_failed`, or `needs_review`
  with owner, version, attempt, deadline, bounded code, and SHA-256 evidence.
- Keep refunds `needs_review` after Payment Log readback because operational
  refund/roster closure is a separate authorized slice.
- Bind `webhook_inbox.related_entity` to the exact fulfillment case/version
  before marking a direct or reaper-dispatched event handled.
- Skip all external writes on a verified-complete replay.
- Store no customer/student name, email, product description, amount/card,
  webhook body, Slack content, or accounting fact in the new ledger.

## Migration rehearsal

The exact tracked migration 133 was applied to a disposable database made from
a schema-only production dump; no production rows were copied. Proof:

- all three target tables were created;
- non-admin grants: zero;
- synthetic case, alias, and receipt inserts succeeded under
  `nanoclaw_admin`;
- receipt update was rejected by the append-only trigger;
- the empty guarded rollback removed all three tables;
- a separate populated rehearsal made rollback refuse and retained all three
  tables.

The first attempted empty bootstrap was abandoned because migration 17 expects
legacy public tables. That test database was dropped automatically. The
schema-only rehearsal tests the actual predecessor structure without copying
business data.

## Independent review

- Initial Claude Sonnet 5/high session
  `de963310-c9aa-44ff-ac83-0833508359d5` identified the material in-flight
  concurrency gap. The round was interrupted before response publication after
  19 model calls crossed the bounded-review drift threshold. Usage: 38 input,
  121,382 cache-create, 1,657,061 cache-read, 16,978 output, maximum context
  129,948; the audit warns `bounded-review-context-threshold-exceeded`.
- Codex independently reproduced the race and added the persisted lease,
  in-flight refusal, expired recovery, and exact-token finalization tests.
- Narrow Claude Sonnet 5/high correction session
  `ab45e390-129a-421c-a571-ad74c4bca24f` returned
  `NO MATERIAL FINDINGS`. Usage: 6 model calls, 12 input, 97,052 cache-create,
  270,604 cache-read, 24,702 output, maximum context 97,054; no audit warning.

## Current verification

- Focused migration/store/source/processor/host/webhook/reaper/safety suite:
  115/115.
- Focused source/store subset before webhook wiring: 61/61.
- Root typecheck: passed.
- Root build: passed.
- Full root suite: 3,081 passed / 12 skipped / the unchanged CNPC
  wrapper-literal failure.
- Independent agent-runner build and 43/43 tests: passed.
- `node --check` passes for both deterministic CommonJS processors.
- Disposable apply, lease constraint, append-only behavior, empty rollback,
  and populated rollback guard: passed.

## State boundary

The work is isolated on
`codex/contador-fulfillment-cases-20260823`. Production remains on exact release
`195dd3b3664a63651db16256b247ee7cda5a4a97`; migration 133 is not applied and
no live Stripe, Sheets, roster, payment, customer, Slack, accounting, or
schedule mutation was performed for implementation proof.
