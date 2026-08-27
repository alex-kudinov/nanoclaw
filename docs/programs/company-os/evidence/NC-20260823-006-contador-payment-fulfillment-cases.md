# NC-20260823-006 Contador payment-fulfillment case evidence

Date: 2026-08-24T03:35:00Z
Program: `program:company-os`
Work item: `work:contador-fulfillment-case-ledger`
Evidence class: reviewed source, schema rehearsal, immutable release,
production migration/service/non-interference proof; natural event outcome
pending

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
- Release preflight caught that the first `d46d52dc…` artifact did not contain
  migration 133 because `build-release.mjs` still ended its explicit migration
  allowlist at 132. Production migration/application did not begin. The builder
  now includes the exact migration and rollback, and a focused packaging
  regression passes; only a replacement commit/artifact may deploy.

## State boundary

Exact replacement release `b131071c74fcaa5395e40b31e45f7f1a886db481`
is live. Its source tree is `2ac5a754f01070376d287b937a0ff7e3c457458d`,
892-file artifact SHA-256 is
`d1f7adf3504b02c1d3a563b4aa587c539fe590a30a99b920fbcb213d2721f373`,
and archive SHA-256 is
`6c66db75900b5a31c18d8ddc74fdf6c44c6a2c64525799a3db3a7d45c4e4b764`.
Local and Mini verification agree under Node 22.23.2 and both migration 133
files are manifest-bound.

The mode-0600 deployment backup directory is
`~/.local/share/nanoclaw-deploy-backups/NC-20260823-006-20260824T0403Z`.
It contains custom-format PostgreSQL, WAL-safe SQLite, and main/fast plists.
Their SHA-256 values are `5aa8c34c…`, `7e5f1e55…`, `aa613c45…`, and
`f3e57f38…`. Fast/main activation retained exact rollback plists and changed
only three release pointers.

Live PID/listener 87358 reports the exact release/tree/artifact/code root,
Node 22.23.2, connected Gmail/Slack, and empty containers/queues. Migration 133
has three empty admin-owned tables, two enabled append-only triggers, and zero
non-admin grants. Protected aggregates remain 261 public payments and 249
Stripe inbox rows (248 handled, one historical dead-letter, zero active).
Main/fast error-line counts remain 273/24.

No historical or manufactured Stripe event was processed. No live Stripe,
Sheets, roster, payment, customer, Slack, accounting, QuickBooks, or schedule
mutation was performed for deployment proof. The first natural typed payment or
refund remains the outcome gate.

## Natural payment observation — 2026-08-27

The owner reported a course payment and explicitly allowed refund validation to
remain separate. Read-only Stripe reconciliation found two distinct succeeded
Foundations purchases on the Tandem/alternate account today, at 04:14 and 07:54
CDT. They have different customers, checkout tokens, emails, and Chaos session
tokens; this is not a duplicate-charge pair. No payer identity or raw provider
payload is retained here.

The 07:54 payment reached exact live release `6a978328`, which contains the
reviewed `b131071c` implementation. It produced:

- one version-0 `complete` case in one attempt and about five seconds;
- one payment-intent, one charge, and one event alias;
- verified `admission`, `stripe_source`, `payment_log`,
  `postgres_payment`, `student_roster`, and `final` receipts;
- one handled n8n `webhook_inbox` row bound to the exact case/state/version;
- one succeeded `public.payments` readback row.

The natural admitted-payment happy path is therefore outcome-validated. A
refund is not required for that proof and the separately proposed refund/
roster closure remains held.

The same audit exposed two distinct unresolved boundaries:

1. The 04:14 succeeded same-course payment has no NanoClaw webhook-inbox row,
   fulfillment case, or `public.payments` row. The n8n workflow and its Stripe
   event destination are currently active/enabled, but historical delivery
   cause is not proven. This is provider-to-host ingress parity, outside the
   admitted-case implementation, and must not be silently replayed.
2. Ledger-wide aggregate is six `complete`, two `needs_product`, one
   `write_failed`, one refund `needs_review`, and two stale `processing`. The
   two processing cases date to August 25–26, have expired leases, version
   3/2, four/three admission-only receipts, and no later stage receipt. Their
   exact source inbox rows are dead-lettered after five attempts with bounded
   error `invalid_charge_alias`.

The tracked alias schema and host validator accept `ch_` charge IDs; Stripe's
current charge tooling accepts `ch_` and `py_`. The latter is a strong
compatibility explanation for the bounded error, but exact offending values
were intentionally not retained in this evidence and implementation review
must confirm the causal payload shape.

No Stripe event, payment, Sheet, roster, PostgreSQL payment, case, refund,
provider, customer, message, configuration, or runtime state was replayed,
repaired, or changed during this observation. Exact live `6a978328` remains
healthy with Gmail/Slack connected and zero active/waiting/outgoing backlog.

The item remains `deployed_unverified`: the admitted happy path is proven, but
expired `processing` violates the promised complete-or-owned-exception
terminal invariant. A bounded correction must make charge-alias handling
compatible and terminalize the two existing cases host-side without external
replay under separately recorded authority. Missing provider delivery is a
separate ingress-parity work item. Product/student identity stays dependency-
blocked; refund closure stays separate.

Company OS revision 142 returns
`work:contador-fulfillment-case-ledger` to `waiting` with that exact correction
gate and no active claim. It registers candidate
`work:stripe-payment-ingress-parity` for content-minimized both-account
detection and owned exception capture without automatic replay. The refund
candidate remains separate; the product/student identity candidates remain
blocked on the terminal case-ledger invariant.
