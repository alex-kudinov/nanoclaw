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

## Authorized terminal-state correction — reviewed, deployment pending

The owner's 2026-08-27 keep-going instruction is recorded as accepted decision
`decision:contador-terminal-case-correction-2026-08-27`. The bounded
implementation:

- adds migration/rollback 139 so charge aliases accept provider-supported
  `ch_` and `py_` objects while every other typed alias remains unchanged;
- validates processor aliases before final transition;
- converts processor execution or contract failures into returned durable
  `write_failed` results, allowing the webhook row to bind/handle the owned
  exception instead of reaper churn;
- adds a compiled default-dry-run exact-case terminalizer requiring case ID,
  version, attempt count, `processing` state, and an expired lease;
- writes only content-minimized failed-stage plus final exception receipts and
  clears the expired lease; it preserves the original source-observed time and
  never invokes Stripe, n8n, Payment Log, roster, `public.payments`, or another
  processor;
- makes exact terminalization replay a no-op and refuses partial batches,
  active leases, state/version/attempt drift, missing cases, and duplicates.

Disposable PostgreSQL proof applies migrations 133/139, accepts `py_`, dry-
runs and applies two exact expired cases, produces two terminal
`write_failed/expired_processing_terminalized` cases with five receipts each,
proves exact replay/no-op and version-mismatch refusal, makes rollback 139
refuse while a `py_` alias exists, then restores the old constraint only after
the disposable alias is removed. The disposable database was dropped.

Claude Sonnet/high R1 found one material no-replay defect: an ordinary later
delivery could reopen a host-terminalized `write_failed` case through the
pre-existing retry branch and launch the external processor. The correction
adds an exact `terminalHeld` admission state before ordinary retries, performs
no alias/receipt/case mutation, returns no lease, and makes the host return a
held result before `execFile` or finalization. Ordinary non-terminalized
`write_failed` cases remain retryable. Direct store and host regressions prove
the no-mutation/no-external path. R2 returned `NO MATERIAL FINDINGS`.

Review usage: the Info subscription attempt was rejected before reading files
and consumed zero tokens. Alex R1 used 14 turns, 122,256 cache-creation,
486,451 cache-read, and 22,977 output tokens; the maximum context crossed the
100k target and is recorded as orchestration debt. Narrow R2 used 11 turns,
61,208 cache-creation, 392,625 cache-read, and 4,157 output tokens. No third
round occurred.

Final local verification: focused host/store/source/webhook/reaper/safety/
migration/CLI 125/125; format, typecheck, build, documentation continuity, and
capability checks pass; full root is 3,347 pass / 31 skip with the sole
unchanged CNPC wrapper-literal assertion; independent runner build and 45/45
pass. Disposable PostgreSQL evidence remains green and removed. Commit,
immutable release, production migration, exact two-case terminalization, and
live proof remain pending. No production mutation occurred during
implementation/review.

## Terminal-state correction release and live outcome

Exact reviewed release
`6778be024ca10b6b0a9898b4d4250087a8bf885a` is live. Its source tree is
`4944e41fe7d0cf706e2041f98a5453e2f408e2b3`; the 1,012-file artifact SHA-256
is `7179bc8f07d1dad79719cae964b75eb19343d38d9e66f3d708733a4067d56693`;
and archive SHA-256 is
`4afd03c1f5396baef0cd0f1517b36f9deed40904e582d3c7ccc94ef47836a566`.
Fresh local and Mini extraction/runtime verification passed under Node
22.23.2, including migration/rollback 139 and the compiled terminalizer.

The first attempted full-cluster `pg_dump` refused before deployment because
an unrelated Procurement table has RLS; incomplete protected preflight
artifacts remain under
`~/.local/share/nanoclaw-deploy-backups/NC-20260823-006-20260827T183122Z`.
The accepted mode-0700 backup is
`~/.local/share/nanoclaw-deploy-backups/NC-20260823-006-20260827T183244Z`.
It contains readable custom-format `business_v2` and exact `public.payments`
dumps, WAL-safe SQLite, main/fast/watchdog plists, prior release manifest,
exact watchdog script, case/state/constraint/protected aggregates, and hashes.

After a natural zero-work drain, both main and watchdog jobs were stopped.
Migration 139 applied and read back the exact typed `ch_`/`py_` constraint.
The new compiled terminalizer dry-run accepted only cases 8:v3/a4 and
11:v2/a3 as processing/expired/exact. The established activator changed only
the three release pointers, retained rollback plist
`~/Library/LaunchAgents/com.nanoclaw.plist.rollback-6a9783281a74-2026-08-27T18-36-33-727Z`,
and verified the exact new release/code root before repair.

Applied terminalization returned both cases as
`write_failed/expired_processing_terminalized`, cleared both leases, preserved
their original source-observed timestamps, and appended exactly five receipts
per case: verified source-at-admission, failed Payment Log/PostgreSQL/roster,
and final exception. Exact applied replay returned both as
`alreadyTerminalized=true` with no new receipt or state change.

Final ledger state:

| State | Count |
| --- | ---: |
| Complete payments | 6 |
| Needs product | 2 |
| Write failed, including two terminalized | 3 |
| Refund needs review | 1 |
| Processing | 0 |

Protected readback proves `public.payments`, Stripe inbox rows, Stripe
dead-letter rows, and aliases unchanged; receipt delta is exactly +10. No
Stripe, n8n, Sheet, roster, payment processor, refund, customer, communication,
product/student, accounting, QuickBooks, ingress-parity, or missed-payment
action occurred.

Live health reports exact release/tree/artifact/code root, PID 92845, one
listener and one main job, connected Gmail/Slack, no waiting/outgoing backlog,
query off/zero grants, healthy Relationship Context replay, checkout production
mode preserved, and lifecycle consumers/Circle still off. One unrelated
natural non-task Slack conversation was active at final readback with zero
pending task. The external watchdog job is restored once with its previously
reviewed operational script hash `ec488448`; the merged Git source lineage
contains the same correction and the installed artifact was not recopied.

The host-admitted fulfillment case ledger now satisfies complete-or-owned-
terminal-exception. The distinct missed-ingress payment remains the separate
`work:stripe-payment-ingress-parity` candidate, and refund closure remains
separate.

Company OS revision 146 marks `work:contador-fulfillment-case-ledger` done with
all correction commitments individually closed. No active or eligible item
remains. The first priority candidate is now the separately unauthorized
Stripe-to-host ingress parity work; product and payer/student identity have
their ledger dependency satisfied but remain unselected/unauthorized. Refund
closure remains a distinct candidate, as the owner requested.
