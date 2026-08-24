# Community student-lifecycle shadow runbook

Status: implementation and rollout authority for `NC-20260824-007`
Scope: Community stages 2-4 only; no legacy cutover or lifecycle consumers

Live status: exact release `cf05bca358c9` and the four-action provider shadow
are deployed/live-verified. Catalog, registry, and 143-member membership
receipts are complete. Progress remains fail-closed on `AUTH_ERROR`, so the
14-day/two-complete-progress-scan completion gate is still open.

## Immutable inputs

- Control-plane contract: `docs/STUDENT-LIFECYCLE-CONTROL-PLANE.md`
- Shadow manifest:
  `facts/catalogs/student-lifecycle-community-shadow-v1.json`
- Protected provider baseline:
  `facts/catalogs/student-lifecycle-community-provider-baseline-v1.json`
- Inactive relay template:
  `setup/n8n/student-lifecycle-community-shadow-workflow.json`
- Accepted authorization:
  `.program/decisions/decision-student-lifecycle-community-shadow-provider-2026-08-24.json`

The only new Heartbeat actions are `USER_JOIN`, `USER_UPDATE`, `GROUP_JOIN`,
and `COURSE_COMPLETED`. Their filters are empty and their destination must be
one exact new n8n callback. Every pre-existing registration is protected by
ID, action, filter, destination hostname, and callback URL SHA-256.

## Safety invariants

- Never query, register, or change Circle.
- Import the n8n workflow inactive; configure runtime values before activation.
- Keep WordPress, Pabbly, Heartbeat-native, and existing n8n workflows intact.
- Never store callback paths, API keys, relay/identity secrets, names, emails,
  message content, grading text, certificate URLs, or payment details in Git,
  reports, CLI output, n8n executions, or logs.
- The relay and host identity secrets are distinct. n8n receives only the relay
  secret; the host identity secret never leaves the Mini.
- `studentLifecycle.actionConsumers` and `circle` must remain false.
- No Heartbeat user, group, course, cohort, or student event is created for a
  canary. Transport canaries use reserved fixture UUIDs sent directly to n8n.

## Source verification

1. Validate the manifest and protected baseline.
2. Run the focused `src/student-lifecycle*.test.ts` suite and disposable
   PostgreSQL integration.
3. Run typecheck, build, full tests, format, documentation continuity, and diff
   checks under Node 22.23.2.
4. Run the toolbox Heartbeat/n8n registry, shell, dry-run, and read-only live
   inventory checks.
5. Obtain bounded Claude Sonnet/high review; fix and re-review only material
   load-bearing findings.

## Provider preflight

1. Use `heartbeat/inventory-webhooks` against `main` only. The exact 18-row
   baseline must pass `student-lifecycle:registry --check --phase baseline`.
2. Use `n8n/inventory-workflows`; prove the target ID is absent and record the
   24-workflow/23-active baseline without paths or parameters.
3. Verify the live NanoClaw release, one listener, channels, schema ownership,
   zero lifecycle rows, and no active webhook backlog.
4. Back up NanoClaw PostgreSQL/SQLite/plist, the n8n compose environment, n8n
   PostgreSQL, and all n8n workflows before the first configuration change.

## Activation order

1. Generate one opaque host path, one opaque n8n path, one relay secret, and a
   distinct host-only identity secret without printing them.
2. Render the n8n template to a mode-0600 temporary file. Run
   `n8n/import-workflow` dry-run, then import it inactive with exact readback.
3. Install only `HEARTBEAT_COMMUNITY_ID`, `STUDENT_LIFECYCLE_RELAY_SECRET`, and
   `STUDENT_LIFECYCLE_HOST_URL` in the protected n8n environment and restart
   n8n once; the workflow remains inactive.
4. Deploy the exact reviewed NanoClaw release. Install the opaque host path,
   relay secret, distinct identity secret, and `STUDENT_LIFECYCLE_ENABLED=true`
   only after the release and database backup are verified.
5. Apply the exact catalog with
   `student-lifecycle:shadow-catalog --apply` and verify one exact-cohort entry
   plus a completed catalog reconciliation receipt.
6. Activate the n8n workflow with protected backup, one restart, health, and
   active-state readback.
7. Send the same sanitized direct n8n transport fixture twice. Verify one
   normalized lifecycle event, duplicate handling, a durable identity hold,
   zero action/message rows, and mechanical reaper behavior.
8. Add the four Heartbeat registrations one at a time with
   `heartbeat/ensure-webhook`; after each, read back the full safe inventory.
9. Require exactly 22 registrations: the unchanged 18-row baseline plus four
   same-destination shadow rows. Record the completed registry receipt.

## Reconciliation

- Group membership uses `heartbeat/snapshot-group-membership`; it emits only a
  count and SHA-256 scope. Record through `student-lifecycle:reconcile`.
- Cohort progress uses `heartbeat/snapshot-cohort-state`; it emits only
  membership/progress hashes, counts, and watermarks. Any authentication,
  pagination, or response-shape failure freezes the watermark and keeps the
  rollout waiting.
- The 2026-08-24 refresh found the current progress endpoint rejects the
  configured API credential with HTTP 401. This is a fail-closed rollout gate,
  not permission to infer progress from completion, group membership, email,
  or Encharge.

## Rollback

1. Delete only the four new registrations using exact ID, expected action, and
   callback URL SHA-256 through `heartbeat/delete-webhook`.
2. Disable the n8n workflow, verify inactive, then restore the protected n8n
   environment/backup if needed.
3. Set `STUDENT_LIFECYCLE_ENABLED=false` and restart NanoClaw. Service rollback
   may point to the prior immutable release; additive lifecycle receipts stay.
4. Disable the catalog entry rather than deleting any history after evidence
   exists. The guarded migration rollback is eligible only while every
   lifecycle table is empty.
5. Verify all legacy registrations/workflows are byte-for-byte or
   hash-for-hash unchanged and reconcile any accepted shadow receipts before a
   later retry.

## Completion boundary

Provider activation is not source-of-truth cutover. Completion of the shadow
stage requires 14 days, at least two complete progress scans, natural core
receipts where available, zero unowned P0/P1 exceptions, and explicit parity
evidence. Lifecycle actions/messages and Circle remain separate items.
