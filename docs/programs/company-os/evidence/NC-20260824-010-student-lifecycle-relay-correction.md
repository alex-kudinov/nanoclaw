# NC-20260824-010 lifecycle relay alert correction

Date: 2026-08-24
Program: `program:company-os`
Work item: `work:student-lifecycle-control-plane-build`
Evidence class: production incident diagnosis, exact rollback, reviewed
correction, immutable release, provider readback, direct canaries, no-error
observation

## Incident and root cause

The owner reported repeated errors in `#gru-chief` after Community lifecycle
activation. Privacy-safe n8n execution inspection found 16 shared-error-handler
alerts, all from workflow `Student Lifecycle Community - Four Action Shadow`,
node `Normalize and Sign Community Lifecycle`, error
`unsupported_heartbeat_action`. NanoClaw retained its unchanged 273-line error
baseline.

Heartbeat's live webhook bodies omit the registered action name. The original
single-callback relay required one, so every natural provider delivery failed
before signing/forwarding. The host also required `USER_JOIN.name` and
`COURSE_COMPLETED.courseName` even though the reviewed privacy-minimized relay
intentionally excluded both.

## Exact containment

- Safe main-Community inventory resolved exactly 22 rows and the four lifecycle
  targets by ID, action, empty filter, destination host, and callback SHA-256.
- Exact guarded deletion removed only:
  - `1875533a-c473-447d-93cd-4c70d4133fb8` `USER_UPDATE`
  - `6c2926cf-a2ca-4daf-b61d-0c327880e4c8` `GROUP_JOIN`
  - `c162a62c-1e72-4066-b6b9-1356a5e333f9` `USER_JOIN`
  - `c3952e72-7102-48e1-8fdf-0f58c04c5cef` `COURSE_COMPLETED`
- The protected 18-row baseline then matched exact snapshot
  `954aea197f8def2eeb658ad3f17ac8e51af5b7fdca3013203acb099dcf4051db`.
- Only `student-lifecycle-community-shadow` was disabled. n8n remained healthy
  with zero active executions; the shared-error count stayed 16 / max ID 33911
  across the bounded post-disable observation.
- Circle, legacy receivers, host configuration, catalog, migration 134, and all
  durable lifecycle receipts remained untouched.

## Correction and review

- Exact source branch:
  `codex/student-lifecycle-action-inference-live-20260824`.
- Exact pushed implementation:
  `8e475e036ad6d34bafe51d8f45c402b9c8bf1c38`, based on exact then-live
  checkout release `61b12648839c5b61a5be4ced1c0bfc1508c5e51e` so the active
  production checkout-send boundary is preserved.
- The tracked code-node source and embedded workflow bytes are identical. The
  relay infers exactly one mutually exclusive shape:
  `id+email`, `id`, `userID+groupID`, or `userID+courseID`; ambiguity and an
  explicit-action mismatch fail closed. Only existing minimized fields are
  forwarded.
- The host no longer requires discarded `name` or `courseName`; UUID/email,
  identity hashing, HMAC, size, idempotency, quarantine, projection, and
  no-action controls are unchanged.
- Focused current-lineage verification: 132 pass / 7 skipped across lifecycle,
  webhook, and checkout surfaces. Full root: 3,244 pass / 23 skip with only the
  unchanged CNPC wrapper failure. Typecheck/build/format/continuity/capability/
  diff pass; release-critical 742/742; runner 43/43.
- Bounded Claude Sonnet/high session
  `4f63b0e7-a644-453f-ad25-40bbed6742cf` returned
  `NO MATERIAL FINDINGS` in six calls / 91,943 maximum context tokens with no
  usage warning.

## Release, backups, and disabled-first deployment

- Source tree: `0d35a1f2e0183c7f4c333f261c92ff5ec0a7e97d`.
- Artifact: 948 files,
  `b61d41687e8e78ccf26218b06944b11bb673eebef6898222727faf93c431ed99`.
- Archive:
  `566965b79f2dbb785277d3e0412d723fcf286ecad6a0389b109118c5c15cc5bb`.
- Fresh Mini extraction/runtime verification passed under Node 22.23.2; exact
  workflow code SHA-256 is
  `efc6e68f9c7db2471329eb09071e0caea71d8dc255be197226b4aaa7156aa2d7`.
- Protected Mini backup:
  `~/.local/share/nanoclaw-deploy-backups/NC-20260824-010-20260825T033202Z`;
  lifecycle PostgreSQL `879a2eab…`, WAL-safe SQLite `ffe66710…`, plist
  `a59f18e7…`, and env `5e8b10b5…`.
- Shared toolbox commit `e269711` adds guarded inactive replacement with
  execution drain, exact/all-workflow backups, graph/settings readback, and
  rollback attempt. The local toolbox repository has no remote.
- Inactive n8n replacement passed exact readback with backup
  `~/.local/share/n8n-toolbox-backups/20260825T033302Z-student-lifecycle-community-shadow-replace`.
- A zero-work drain preceded the exact three-pointer host switch. Rollback plist:
  `com.nanoclaw.plist.rollback-61b12648839c-2026-08-25T03-33-26-020Z`.
- Live release `8e475e03…` preserves checkout recovery enabled with
  `customerSends=true`, production send mode, and the same prospective cutoff.

## Canary, provider restoration, and no-error proof

With all provider rows absent, only the corrected workflow was activated. Four
direct reserved-identity payloads—one per minimal shape—each returned HTTP 200
and produced exactly one host event. Final canary state was five total lifecycle
events: `USER_JOIN` 1, `USER_UPDATE` 1, `GROUP_JOIN` 2 including the prior
fixture, and `COURSE_COMPLETED` 1; four were quarantined identity holds and one
non-projecting update was applied. There are zero enrollments and zero
state-history rows. The lifecycle shared-error count remained exactly 16; target
workflow retained executions remained zero.

The same four empty-filter main-Community registrations were then restored with
exact callback SHA-256
`8a2a7758c4b62023ead03d15b09fc962f418412d4226dea83f8ecb3ac6e4e317`:

- `a5df8aa2-0fac-45e8-b633-57904eed3ecb` `USER_JOIN`
- `611e6e16-abfd-4aa7-abc1-3732323b5c4c` `USER_UPDATE`
- `3012afc4-a437-474b-8655-cbd5eac89f8a` `GROUP_JOIN`
- `6caef907-f204-4758-964e-1bc7a166bb64` `COURSE_COMPLETED`

Final registry receipt 4 records exact 18 + 4, legacy unchanged, action
authority none, and Circle false. During the full post-reactivation observation,
n8n remained at zero active executions and the shared-error count/max ID stayed
16/33911. Live NanoClaw reports exact release/tree/artifact/code root, one
listener, connected Gmail/Slack, empty queues, healthy lifecycle store,
`actionConsumers=false`, and `circle=false`; the error log remains 273 lines.

## Remaining boundary

The incident is corrected and the four-action shadow is restored, but the
original rollout remains outcome-incomplete. It still requires the 14-day
window, two complete progress scans after the provider `AUTH_ERROR` is resolved,
natural receipt/parity review, and owned exception review. No legacy cutover,
consumer/message/certificate/Encharge/minion change, Heartbeat user/group/course
mutation, or Circle access/change is authorized or implied.
