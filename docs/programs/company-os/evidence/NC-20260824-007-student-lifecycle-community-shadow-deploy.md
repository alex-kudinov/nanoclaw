# NC-20260824-007 Community lifecycle shadow deployment

Date: 2026-08-24
Program: `program:company-os`
Work item: `work:student-lifecycle-control-plane-build`
Evidence class: reviewed source, protected backups, immutable release, provider
readback, sanitized transport, durable reconciliation, live health

## Authorized boundary

The owner authorized Community stages 2-4 after the dark foundation. The only
new provider registrations are `USER_JOIN`, `USER_UPDATE`, `GROUP_JOIN`, and
`COURSE_COMPLETED`, each with an empty filter and one new opaque n8n callback.
All 18 prior registrations remain protected.

Circle was not queried or changed. Legacy receivers were not deleted or
redirected. No lifecycle action consumer, message, certificate, Encharge
change, Heartbeat user/group/course mutation, manufactured provider student
event, or minion authority was enabled.

## Review and combined release

- Production advanced during preflight from lifecycle base `7364accd` to
  checkout-recovery release `ab3124a0`. The older lifecycle candidate was
  rejected without deployment and the change was rebased onto the exact live
  lineage under the non-colliding task ID `NC-20260824-007`.
- Exact pushed source: `cf05bca358c917f61b2fb01d53824c81f6445527` on
  `codex/student-lifecycle-community-shadow-live-20260824`.
- Source tree: `07e1dbfc9d7c1f8fcac7e1ab4cd5e846503006d2`.
- Artifact: 944 files,
  `eddd34eba9d8e8e368d7c3cffc143314a464efec7c221d12773349744d300af8`.
- Archive:
  `8d294ce2459b167f4ce63e65ed4caf2c364ead47a22e8e52bee260072cfebb9c`.
- Local and Mini extraction/runtime verification passed under Node 22.23.2;
  the bundle retains checkout-recovery migration 135 and all lifecycle facts,
  workflow, renderer, and CLIs.
- Fresh live-lineage Claude Sonnet/high R2 returned `NO MATERIAL FINDINGS`.
  Its 10 calls reached 110,334 maximum context tokens, recorded as a slight
  bounded-review warning. A live inactive-import rejection then exposed n8n's
  36-character workflow-ID limit. The target remained absent; source and shared
  tooling were corrected, focused tests passed, and bounded R3 returned
  `NO MATERIAL FINDINGS` in four calls / 47,028 maximum context tokens.
- Combined gates: lifecycle 83/83; production-shape PostgreSQL 4/4; full root
  3,206 pass / 19 skip with only the unchanged CNPC wrapper failure;
  typecheck/build/format/continuity/capability/diff; release-critical 742/742;
  runner 43/43; current toolbox n8n 10/10, Heartbeat guards 15/15, and prior
  full toolbox suites.

## Backups and protected preflight

- Main Community matched the exact 18-registration baseline before mutation.
  n8n had 25 workflows / 24 active, the lifecycle target was absent, and active
  executions were zero.
- Protected n8n backup:
  `/home/tca/.local/share/n8n-toolbox-backups/20260824T192416Z-NC-20260824-006-preflight`;
  PostgreSQL SHA-256
  `205c36877f9d9ff8296b1901253bffb875a24b0e9e65a03cdc93e3cab1f441ca`,
  all-workflow SHA-256
  `f3ef21d0c22b23b0c3bf57328126c4875f1e963c5ab6f5414df7b4f6d9c0cd14`,
  plus protected env/compose copies. Import, runtime-configuration, and
  activation tools also created their own mode-0700 backups.
- Protected NanoClaw backup:
  `~/.local/share/nanoclaw-deploy-backups/NC-20260824-006-20260824T192532Z`;
  lifecycle PostgreSQL SHA-256
  `70ac61df65af5f1dd43f734617dbc29a16e1e6b1d8a7d0c165083aa9318a3f04`,
  WAL-safe SQLite
  `8d11302745ef90f0b2105405e5cb582cc9a4f690863b4f54ad20c1034fb04b43`,
  plist `1eddbe999360badb5f86a47c700b9a2b6c71fc6a3ee01f6fc50a7f817930d229`,
  and env `c47ae126a829cc8ff9580d438c0ef3925b8e4578511fb7f1d73eba108b5b2d20`.
  An attempted broad dump correctly refused RLS-protected unrelated tables;
  only the verified affected-schema custom dump is relied on.

## Activation and provider readback

- The n8n workflow imported inactive, then received exactly the three
  allowlisted runtime keys through a backup/atomic/restart/SHA-only transaction.
  It activated separately after host readiness. Final n8n inventory is 26
  workflows / 25 active; the target is active with three nodes, no credentials,
  no success/error/progress retention, zero active executions, and zero retained
  target executions.
- A natural zero-work drain preceded the host switch. Activation changed only
  the three release pointers and retained rollback plist
  `com.nanoclaw.plist.rollback-ab3124a0312d-2026-08-24T19-47-50-527Z`.
- Live NanoClaw reports exact release/tree/artifact/code root, Node 22.23.2,
  one listener, connected Gmail/Slack, empty queues, unchanged 273-line error
  baseline, lifecycle enabled for Community with healthy aggregate store,
  `actionConsumers=false`, and `circle=false`. Checkout recovery remains live
  shadow with `customerSends=false`.
- A subsequent concurrent checkout-recovery merge release
  `7a36d79ca78773dbca7ddb8beddb18abe07a753c` includes lifecycle release
  `cf05bca3` as a direct parent and is now the exact active service. Final
  readback reports source tree `301f2b77e4adb43c4420a606c3a20f6a62dbadd7`,
  artifact `71b5a0eab620338ebaaebe8f0042a710a8a75e15c073f89d1986c841c1a68b03`,
  one listener, unchanged lifecycle/checkout boundaries and counts, empty
  queues, and the same 273-line error baseline. Its latest rollback plist
  points to exact lifecycle release `cf05bca3`.
- Catalog apply inserted one exact MCF cohort entry and completed receipt 1.
- Final provider inventory contains exactly 22 rows. All 18 legacy rows remain
  byte/hash-equivalent. Four new rows share destination
  `webhooks.tandemcoach.co`, URL SHA-256
  `8a2a7758c4b62023ead03d15b09fc962f418412d4226dea83f8ecb3ac6e4e317`,
  and empty filters:
  - `USER_JOIN` `c162a62c-1e72-4066-b6b9-1356a5e333f9`
  - `USER_UPDATE` `1875533a-c473-447d-93cd-4c70d4133fb8`
  - `GROUP_JOIN` `6c2926cf-a2ca-4daf-b61d-0c327880e4c8`
  - `COURSE_COMPLETED` `c3952e72-7102-48e1-8fdf-0f58c04c5cef`
- Provider registry receipt 2 records 18 baseline + 4 shadow, legacy unchanged,
  exact action set, no action authority, and Circle false.

The first guarded Heartbeat create attempt also failed safely before mutation:
the live API now requires flat `{action, filter, url}` rather than the stale
nested payload. Shared toolbox commit `8144c31` corrects both create paths and
adds a passing static contract; exact readback after every subsequent create
passed. The toolbox repository has no remote, so the reviewed changes are
installed locally and committed but cannot be pushed.

## Sanitized transport and reconciliation

- The same direct n8n `GROUP_JOIN` fixture was sent twice using reserved UUIDs;
  no Heartbeat user, group, course, or event was created. Exactly one ingress
  row and one lifecycle event exist, both handled/quarantined, with one durable
  `needs_identity` exception and duplicate suppression on the second delivery.
  There are zero enrollments and zero state-history rows. Health exposes only
  aggregate counts; action consumers remain false.
- Catalog, registry, and membership reconciliations are completed as receipts
  1, 2, and 3. The exact MCF group snapshot contains 143 members and only a
  count/SHA-256 watermark; no member identity was emitted or stored in evidence.
- The exact cohort-progress snapshot remains held: the provider returns
  `AUTH_ERROR` for the configured main credential. No progress receipt or
  watermark was written. Membership cannot substitute for progress.
- Callback paths, relay/identity secrets, and host URL have zero matches in the
  NanoClaw and n8n logs. Runtime values remain only in protected configuration
  and provider/workflow state.

## Remaining outcome gate and rollback

This is a deployed, live-verified shadow provider boundary, not lifecycle
cutover or outcome completion. Completion still requires 14 days, at least two
complete progress scans, natural core receipts where available, parity review,
and zero unowned P0/P1 exceptions. The sanitized `needs_identity` fixture hold
is expected test evidence and must be closed through the documented retention/
review path rather than erased.

Rollback order remains: delete only the four exact new registrations by ID,
action, and callback hash; disable the one n8n workflow; set lifecycle disabled
and restart or restore the retained prior release. Catalog, reconciliation,
event, and exception evidence is additive and is not destructively removed.
