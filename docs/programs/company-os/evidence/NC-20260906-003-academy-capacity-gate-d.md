# NC-20260906-003 — Academy Capacity Gate D operator pilot

Date: 2026-09-06  
Program: `program:company-os`  
Work item: `work:academy-capacity-minion-operator-workflow`

## Outcome

Gate D is live on `mini-claw.local` as a private, narrowly permissioned
Capacity operator pilot. Exact immutable release
`da2869fbc65586a76c80537623c34074c60a9896` is active under Node 22.23.2;
health proves the release root, connected Gmail and Slack channels, a valid
registered Capacity group, enforced Capacity capability, enabled operator
switch, zero outbound backlog, and no waiting groups.

The pilot reads host-owned aggregate inventory and exact enrollment state. Its
seven mutation commands are transaction-bound, case- and receipt-backed,
idempotent, version checked, and ambiguity refusing. The Capacity container has
no direct database role, provider credentials, network, Bash, general file
write, or messaging capability.

## Live inventory

| Delivery block | Capacity | Occupied | Available | State |
| --- | ---: | ---: | ---: | --- |
| ACC Module 1 — 2026-09-07 | 12 | 21 | 0 | sold out |
| MCS Thursday — 2026-09-24 | 12 | 5 | 7 | open |
| MCS Friday — 2026-09-25 | 12 | 13 | 0 | sold out |
| MCS Thursday — 2027-01-07 | 12 | 1 | 11 | open |
| MCS Friday — 2027-01-08 | 12 | 0 | 12 | open |

Rita remains settled in January Thursday and is not an exception or open
reconciliation item.

## Production proof

- A mode-0600 PostgreSQL backup was taken before migration 144: 12,920,233
  bytes, SHA-256
  `253933ed2222b8f8bcb239cacec183658d4fa5c380e36cd5dbd813d03d42df68`;
  `pg_restore --list` passed.
- Migration 144 is applied. Its 12 table, sequence, index, and view objects are
  all owned by `nanoclaw_admin`, with zero non-admin table/view grants.
- The Capacity agent image runs Node 22.23.2 and has index digest
  `sha256:2b8e7f6d1eaa138f047450815d7c98d73f5653a2deec3188b8b852fa5566b876`.
- Private `#gru-capacity` is registered as `slack:C0C003FEWP3`; the final
  release-native registration readback returned `unchanged`.
- The final archive SHA-256 is
  `db637838e3869fedcfb205e9871f9501347ed873bc1b16b297266181ffe99cd8`.
  Fresh extraction and post-activation bundle verification both passed.
- The prompt SHA-256 is
  `e5e4f273fb53c424e44bc5d602117417d3027635b1b431fde733617f3c27976e`.
  The old-prompt Capacity container exited before final activation.

## Natural canary and non-interference

Alex's natural read-only question in the private channel produced a queue
acknowledgment first and then the exact five-pool inventory after the host
result entered the same session. No duplicate canary was sent. The answer
correctly preserved both oversold pools and the Friday count-variance warning.

That otherwise correct answer offered unsupported follow-up participant detail
and reconciliation. No such action occurred. The final prompt now requires the
minion to answer and stop, forbids offering identity enumeration or unsolicited
mutation, and describes 21/12 and 13/12 as oversold rather than speculative data
errors. A static prompt/capability contract test locks this correction.

Immediate SQL readback after final activation remains zero operator cases,
operator receipts, reservations, waitlist entries, and waitlist offers.
Occupancy is unchanged. Read requests deliberately do not create operator
cases, so zero is the expected read-only canary result.

## Review and recovery

Claude Sonnet/high R1 found that zero-row persistence failures collapsed into a
generic stale-version result. The correction added exact write-conflict and
missing-reference codes, plus an injected transfer failure proving
`assignment_insert_missing_reference` and savepoint rollback. Fresh R2 returned
`NO MATERIAL FINDINGS`. Focused checks, typecheck/build, 45 agent-runner tests,
750 email-critical tests, and release gates passed. The full root is 3,582
passed / 32 skipped with only the two unchanged predecessor failures.

During staged deployment, adding the new folder to the old release allowlist
made that old daemon reject the unknown folder. No Capacity command or domain
write was enabled. The exact predecessor was restored, and deployment resumed
in the corrected order: activate the new release with Capacity disabled,
register the group, add enforcement, then restart once. The runbook now records
that sequence.

## Boundary

This release does not cut over checkout or Tandemweb, write a provider or
Student Roster, contact a customer, promote a waitlist automatically, issue a
refund/payment/certificate, or make the new schema authoritative for assignment
or capacity. Gate E/F remain separately governed.

The machine-readable receipt is
`docs/programs/company-os/evidence/NC-20260906-003-academy-capacity-gate-d.json`.
