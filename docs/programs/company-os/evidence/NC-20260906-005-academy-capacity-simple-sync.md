# NC-20260906-005 — simple Academy capacity synchronization

Date: 2026-09-06

Program: `program:company-os`

Work item: `work:academy-capacity-simple-status-sync`

## Outcome

The owner-approved simple capacity design is live. NanoClaw records durable
seat commitments from exact mapped successful website payments and supports
versioned operator capacity changes, commitment transfers, and assignment
reconciliation. WordPress stores only the latest signed `available` or
`sold_out` projection and serves it from the existing cached pages. Checkout
creates no temporary capacity hold and has no synchronous NanoClaw dependency;
it still rejects the local published sold-out state immediately before payment
creation.

## Reviewed source and release

- Tandemweb commit `9e189a79e` is on `main`; the webhook-deployed production
  route rejected an unsigned request and then accepted the signed enablement
  readback with `enabled=true`.
- NanoClaw release `aa73538c84505212767628b81477e7d287e98af9` was rebased over
  the previously live Sales release `663b63be`, then rebuilt and independently
  verified with source tree `fe8bdeca`, artifact SHA-256 `acb89921`, 1,072
  artifact files, Node 22.23.2, and archive SHA-256 `6b6deaad`.
- Claude Sonnet/high R3 found the missing final sold-out checkout gate and the
  paid-sale stale-version race. Both findings were corrected before release;
  the correction tests cover live-option validation and bounded refreshed
  commitment retry. No fourth Claude round was authorized or used.

## Production migration and runtime

- The first `pg_dump -X` command refused its unsupported option before backup
  or migration. The corrected custom-format `business_v2` backup is 12,949,361
  bytes with SHA-256
  `41b0f5b0c144bcb6aa2dae521c43c8e1a93491ac74da6dde14b7f84ec175e87d`;
  `pg_restore --list` passes.
- Migration 145 is applied. The publication table, sequence, and occupancy view
  are owned by `nanoclaw_admin`; the table and view have zero non-admin grants.
  There were zero commitments and zero operator cases at cutover.
- `nanoclaw-agent:latest` was rebuilt as
  `sha256:bc64fbdcf4b5ac099e08ed607e5b8ad9dc85b1aff5198300ba8a791ff7450325`
  with retained rollback tag `rollback-NC-20260906-005-2b8e7f6d`. All 19
  runner snapshots match source hash `e08a1e8826a7ba853e37daba475d0865`;
  their pre-release archive SHA-256 is `b6f5753c`.
- The reviewed Capacity prompt is installed with exact source/live SHA-256
  `0cef06c5`. It was absent from the writable operational folder before this
  release, so rollback removes that exact new file.
- Activation changed only the three release pointers and retained rollback
  plist `com.nanoclaw.plist.rollback-663b63be2035-2026-09-06T23-36-41-069Z`.
  Live health proves exact release/root, connected Gmail and Slack, one idle
  listener, zero active/waiting containers, enabled Capacity operator, and a
  valid enabled publication configuration.

## Live capacity and cached-site proof

Five initial publications were delivered once with signed acknowledgements,
Cloudflare exact-URL purge, and origin prewarm:

| Delivery block | Capacity | Occupied | Available | Published |
| --- | ---: | ---: | ---: | --- |
| ACC Module 1 — 2026-09-07 | 12 | 21 | 0 | sold out |
| MCS Thursday — 2026-09-24 | 12 | 5 | 7 | available |
| MCS Friday — 2026-09-25 | 12 | 13 | 0 | sold out |
| MCS Thursday — 2027-01-07 | 12 | 1 | 11 | available |
| MCS Friday — 2027-01-08 | 12 | 0 | 12 | available |

The ACC and combined ACC/PCC pages render September 7 as sold out with a
waitlist link. The MCS pages render Thursday as selectable, Friday as `Sold
Out` with no checkout marker, and both January cohorts as selectable. Repeated
reads of every affected page returned Cloudflare `HIT` after prewarm, preserving
the cached SEO/performance path.

The live checkout configuration excludes September 7 for all three products:
`acc-module-1` at $399, `acc-full` at $3,999, and `acc-pcc-full` at $7,499.
Later cohorts remain returned. No lead, PaymentIntent, invoice, refund,
customer message, waitlist promotion, Student Roster write, or provider write
was manufactured for verification.

## Recovery

Disable WordPress simple sync through the signed config endpoint, use the
release helper to set NanoClaw publication mode off, and restore the retained
release plist. Restore the runner tag/snapshot archive and remove the new
operational Capacity prompt if a full code rollback is required. Migration 145
is additive and remains in place after code rollback; its SQL rollback refuses
once commitment or publication history exists, so the five delivered records
must be preserved rather than erased.
