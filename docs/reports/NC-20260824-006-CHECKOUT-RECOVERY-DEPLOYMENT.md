# NC-20260824-006 checkout recovery shadow deployment

Date: 2026-08-24
State: live shadow control; natural eligible-event outcome pending

## Reviewed implementation

- Claude Sonnet/high plan R1 required account-specific timing and the complete
  NanoClaw release protocol.
- Claude Sonnet/high implementation R1 found terminal-precedence,
  archive-minimization, registry-evidence, and timeout-documentation issues.
  Codex fixed the three verified defects and clarified the registry evidence.
- Fresh Sonnet/high correction R2 returned `NO MATERIAL FINDINGS`.
- During live verification Codex mechanically closed three additional
  deployment-contract defects: durable n8n trigger event definitions,
  downstream-before-acknowledgment website receipts, and clean report-CLI pool
  shutdown. Focused contract tests and live readback prove each correction.

## Source and release

- Tandemweb commit `0d09278fbc18100f25ce5535e7df5ef6d3b87368` is
  deployed from `main`; public checkout JavaScript is byte-identical.
- Toolbox implementation commits `9b06988438aec6563c35bc3a9c81149d94f17d63`
  and `8a10a07` are installed in the shared dirty worktree without replacing
  unrelated user changes; MCP discovery exposes all three new Stripe tools.
- NanoClaw checkout commits `ab3124a0`, `37b35c3e`, and `f39ad83f` were
  merged with the concurrently deployed student-lifecycle release
  `cf05bca3`. Exact merged release:
  - commit `7a36d79ca78773dbca7ddb8beddb18abe07a753c`
  - source tree `301f2b77e4adb43c4420a606c3a20f6a62dbadd7`
  - artifact SHA-256
    `71b5a0eab620338ebaaebe8f0042a710a8a75e15c073f89d1986c841c1a68b03`
  - 944 artifact files under Node 22.23.2
  - archive SHA-256
    `7f2eae33f260f7266f3482e8cb1ac4085245d94d19a07e322369b42704ddafa3`

The initial checkout release `ab3124a0` was live before the correction. A
concurrent student-lifecycle release then advanced production to `cf05bca3`.
The first corrective activation detected that lineage change in dry-run but
the apply command had already been issued; Codex immediately restored
`cf05bca3`, merged both reviewed lines, rebuilt, independently verified, and
activated only the converged `7a36d79c` release. No concurrent source or
capability remains overwritten.

## Backup and migration

- Protected backup:
  `~/.local/share/nanoclaw-deploy-backups/NC-20260824-006-20260824T192207Z`
  (directory mode 0700; contained files mode 0600).
- `business_v2` custom dump SHA-256:
  `50fea4118d4f5857fa5382339ab579cc060e4c2a7cf3f924ea5b1553b0ec0d52`.
- WAL-safe SQLite backup passed `quick_check`; the installed plist was
  preserved.
- Migration 135 produced four empty admin-only tables, three enabled
  append-only triggers, and zero non-admin grants. Payment-fulfillment and
  webhook aggregates were unchanged at the migration boundary.
- Final activation retained rollback plist
  `com.nanoclaw.plist.rollback-cf05bca358c9-2026-08-24T19-56-43-922Z`.

## Provider and live verification

- NanoClaw health reports exact merged release `7a36d79c`, verified source
  root/artifact/Node, one listener, connected Gmail and Slack, empty queues,
  `checkoutRecovery.enabled=true`, `mode=shadow`,
  `customerSends=false`, Tandem 45-minute capture timeout, Tandem five-minute
  failure delay, and Heartbeat event-only mode.
- The unrelated concurrent Community student-lifecycle shadow remains enabled
  and healthy on the same merged release; its source and live state were
  preserved.
- WordPress has the opaque relay URL and distinct ingress secret in
  `wp-config.php`; the config backup is mode 0600.
- The active n8n website workflow retains neither successes nor errors and uses
  `lastNode` response mode, so WordPress removes a retry only after NanoClaw
  acceptance.
- Both n8n-owned Stripe endpoints are enabled with exactly the preserved three
  events plus `checkout.session.expired` and
  `payment_intent.payment_failed`.
- One signed non-customer, consent-denied canary returned HTTP 200 only after
  NanoClaw acceptance. Owner readback shows one Tandem case in
  `captured/denied/ineligible`, zero shadow-ready/unnotified cases, and
  `customer_sends=false`.
- The daemon error log remains at the pre-release 273-line baseline.

## Boundary and remaining outcome

No customer email, recovery message, Encharge activation/category mutation,
historical outreach, purchase, payment, refund, spending, CRM/booking,
roster/access, or accounting action occurred. The deterministic canary proves
authenticated transport, durable receipt, suppression, and owner readback; it
does not prove a natural abandonment or later purchase suppression. Observe
only the next natural eligible failure/expiry/captured timeout and its exact
purchase/notification disposition.
