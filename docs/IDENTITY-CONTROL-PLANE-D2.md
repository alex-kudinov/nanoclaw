# Tandem Identity D2 Production Shadow

Status: independently reviewed, deployed, and live-verified in blocked shadow mode

Task: `NC-20260913-003`

Reviewed/deployed implementation commit:
`d99ca2589def4fc459fa129218ab83696b34b330`.

Authorization:
`.program/decisions/decision-tandem-identity-d2-production-shadow-2026-09-14.json`

## Exact contribution

D2 mirrors the existing immutable `business_v2.student_lifecycle_events`
ledger into Tandem Identity migration-167 records. It does not add another
Heartbeat hook and does not call Heartbeat. The source is already admitted by
the established HMAC relay and already contains provider IDs, payload hashes,
mapping state, and current Party-link evidence.

The D2 worker writes only:

- `identity_event_receipts` as `unverified_hint` / `held`;
- same-environment related group/course/cohort references attached to receipts;
- one append-only version-1, `open`, non-materializable candidate per distinct
  Heartbeat user;
- one privacy-minimized, Party-null `party_context_observations` fact per source
  event; and
- in-memory aggregate health exposed at `/health.tandemIdentityD2`.

It writes no resolution decision, external-reference binding, desired
projection, command, provider attempt/readback, reconciliation run, drift item,
Party, enrollment, entitlement, access state, or customer-facing projection.

## Frozen source prefix

Read-only production evidence at 2026-09-14T02:36Z:

| Measure | Value |
| --- | ---: |
| source rows / maximum ID | 379 / 379 |
| immutable prefix SHA-256 | `251fe76eed9db7710fbe7d96d11359f0c5231cd9f6cbd0c42ac4d1207642f955` |
| distinct Heartbeat users | 156 |
| rows with a current Party link | 71 |
| rows without a Heartbeat user | 0 |
| provider-reconciled rows | 0 |
| `source_asserted_unreconciled` rows | 379 |

The hash covers only row ID, existing payload SHA-256, relay/provider
authenticity, mapping status, and processing status in ID order. It stores no
name, email, provider ID, raw body, or customer content.

New append-only rows may arrive after the freeze. Validation accepts them only
when the first 379 rows remain byte-equivalent under the minimized fingerprint
and every current row still satisfies the closed D2 source contract. Any source
row without a user, HMAC relay evidence, provider-unreconciled status, allowed
event name, or valid payload hash stops the whole batch.

## Runtime behavior

- Default: `TANDEM_IDENTITY_D2_SHADOW_ENABLED=0`.
- Enabled boundary: batch ceiling 500; interval 300,000 ms.
- One transaction and one transaction-scoped advisory lock cover adapter
  registration, source selection, receipts, candidates, observations, and
  protected before/after counts.
- The exact receipt function makes replay a no-op. A changed payload under the
  same source event key conflicts.
- The worker selects only rows not already receipted, ordered by source ID, and
  holds source rows while copying them.
- Party and external-reference counts are compared inside the transaction;
  any change rolls back the batch.
- Any resolved fact or provider attempt anywhere in the D2 scope blocks the
  worker until a separately versioned stage is approved.
- Startup and interval ticks cannot overlap, never block daemon startup, and
  do not retain the event loop.

Because the provider has not independently reconciled these events, the only
truthful fully caught-up scoreboard is `blocked` with reason
`provider_authenticity_unreconciled`. The 71 current Party links are comparison
evidence only; D2 does not copy them into a canonical binding or even into the
observation's Party fields.

## Mechanical proof

The disposable PostgreSQL test applies migration 167 over a synthetic
production-shaped source and proves:

- bounded 2+2 catch-up and a third zero-write replay;
- four receipts and four held Party-null observations for four source rows;
- three non-materializable candidates for three distinct users;
- source Party-link counts remain visible only in aggregate;
- zero resolution decisions, projections, commands, attempts, readbacks,
  linked observations, materializable candidates, Party writes, ref writes,
  access writes, or provider writes;
- an unexpected provider-authenticity state rolls the entire batch back; and
- a userless source row becomes a terminal `blocked` unsupported subject while
  preserving its honest unmirrored count rather than claiming endless catch-up;
  and
- the generated database is removed.

The value-redacted configuration transaction pins only three non-secret keys,
requires exact host and immutable-release identity, takes a mode-preserving
backup, performs an atomic rename, verifies exact bytes, and supports guarded
restore.

## Production admission gates

Production may proceed only in this order:

1. verify `/health.release` is exact live `c190b957333ac1901b2d46a1f4b3f1cf75c6341c`,
   connected, idle, and rollback-capable;
2. run the release-bound validator at `preflight`; require the frozen prefix,
   source contract, and zero migration-167 objects;
3. pass focused/full tests, release build, independent Sonnet/high review, and
   exact archive verification;
4. acquire exclusive production migration/release leases;
5. freeze current Party/ref/source aggregates and create a mode-0600 complete
   custom-format `nanoclaw_business` backup outside the repository; verify its
   hash, size, and `pg_restore --list` readability;
6. apply only the reviewed migration-167 bytes from the immutable release;
7. run `post-migration`; require 12 tables, one view, zero non-admin grants and
   an empty target;
8. activate the exact release with D2 still off and verify health plus all
   protected aggregates;
9. dry-run then atomically enable only the three fixed D2 keys, reload once,
   and retain the environment backup plus prior release pointer;
10. run `post-enable`; require exact source/receipt/observation coverage,
    candidate/user parity and zero promoted/linked/materializable/resolution/
    projection/command/attempt/readback/reconciliation/drift state;
11. require `/health.tandemIdentityD2.status=blocked`, reason
    `provider_authenticity_unreconciled`, zero unmirrored rows, and the exact
    aggregate counts;
12. wait through another interval or invoke the same compiled worker and prove
    zero-write replay, then re-check release/channel/queue health.

Any mismatch stops before the next consequential step.

## Rollback and recovery

Before enablement, code rollback restores the prior immutable release and
leaves empty additive tables. After receipts exist, migration rollback is
forbidden: migration 167 must refuse rather than delete identity evidence.

Runtime rollback uses the release-bound config transaction to set D2 off,
reloads once, verifies the worker disabled, then restores the prior release if
needed. Receipts, candidates, and observations stay as append-only history.
Database loss uses the verified custom-format backup; D2 does not claim a
production RPO/RTO beyond this exact rehearsal.

## Explicit non-authority

D2 does not authorize or perform provider-hook changes, provider API reads or
writes, Party creation/merge, external-ref binding, auth-account binding,
email/name/group/product/payment inference, enrollment, entitlement, access,
customer authorization, payment, certificate, attendance, booking,
communication, minion access, automated repair, or full migration. D3 remains
a separate provider-snapshot and simulated-projection stage.

## Independent review

Bounded Claude Sonnet/high R1 found one material health defect: a future
userless source row was excluded from mirroring but would leave health at
`catching_up` forever. Health now subtracts structurally unmirrorable subjects
when deciding whether progress remains, reports `blocked` with
`unsupported_source_subject`, and keeps the raw unmirrored count visible. A
real PostgreSQL regression proves that state. No other material issue was
reported; the correction is mechanical and does not require a confirmation
round.

## Production receipt

At 2026-09-14T03:11Z the exact immutable release
`d99ca2589def4fc459fa129218ab83696b34b330` became active on `mini-claw.local`.
`/health` verifies source tree `cf952ed4db55d14f741de2475f4d258ce0867b09`,
artifact SHA-256
`416eec1baada64dde08573f627f75b0725a91ae12a01fc15051a70eb796a62b0`,
1,360 files, Node 22.23.2, matching code root, connected Gmail/Slack, zero
active containers, and an empty work queue.

Before migration, a complete custom-format backup was written mode 0600 at
`/Users/xbohdpukc/.local/share/nanoclaw-backups/NC-20260913-003-20260914T030951Z/nanoclaw_business_pre_167.dump`.
It is 14,858,133 bytes, SHA-256
`56f17f7e45ec8f5b716c0f5859e670b07e5f701d12d679fabedeae1988a361e5`,
and `pg_restore --list` accepts it. Migration 167 applied transactionally;
post-migration validation found 12 tables, one view, zero non-admin grants and
zero rows before enablement.

The one-key configuration transaction retained mode-0600 rollback
`/Users/xbohdpukc/dev/NanoClaw/.env.rollback-tandem-identity-d2-2026-09-14T03-11-34-067Z`.
Release activation retained
`/Users/xbohdpukc/Library/LaunchAgents/com.nanoclaw.plist.rollback-c190b957333a-2026-09-14T03-11-02-625Z`.

Live database and health readback agree:

- 379 source rows, 379 unverified/held receipts, 379 held Party-null
  observations, 156 open non-materializable candidates, zero unmirrored;
- zero promoted receipts, linked D2 observations, materializable candidates,
  accepted facts, desired projections, commands, attempts, readbacks,
  reconciliation runs or drift items;
- Party count 1,645, external-ref count 5,596, identifier claims zero and
  identity exceptions 1,196, unchanged across the shadow transition;
- scoreboard `blocked` / `provider_authenticity_unreconciled`, with no error;
- an immediate exact second execution scanned zero and inserted zero receipts,
  observations, or candidates.

This is production-shadow evidence, not provider completeness or canonical
identity migration. D3 remains unauthorized.
