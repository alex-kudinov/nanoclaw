# NC-20260822-017 healer Company Work adapter evidence

Date: 2026-08-23
State: committed, deployed dark, structurally and live verified; adapter disabled
Program item: `work:self-healing-visible-resolution-loop`
Base: `502bf5a5` on `codex/self-healing-visible-resolution-20260823`

## Outcome

- Migration 132 defines the distinct `healer_resolution` workflow,
  `healer_resolution_receipt` completion, and append-only minimized
  observations.
- One healer-specific host writer maintains stable incident-fingerprint work,
  supports blocked evidence updates, requires exact terminal receipts, and
  reopens recurrence.
- Verified recovery and a hashed named no-action decision are the only terminal
  inputs. Anonymous rejection remains pending.
- The adapter defaults off and is not imported by the daemon, scheduler,
  Slack, collector, approval, remediation, or implementation paths.
- Company Work reporting recognizes healer work and validates event, receipt,
  observation, owner, and named-decision consistency.

## Verification

- Node: exact pinned `22.23.2`.
- Focused ledger/report set: 86/86 tests passed.
- Complete healer suite: 26 files / 230 tests passed; the environment-gated
  two integration tests are skipped in the ordinary run and passed separately.
- TypeScript typecheck, production build, formatting, and `git diff --check`
  passed.
- Full repository: 3,009 passed / 12 skipped / 1 failed. The sole failure is
  the unchanged base `src/cnpc-prompt-contract.test.ts` wrapper-literal
  assertion; NC-017 does not modify either side of that contract.
- Disposable PostgreSQL 16 applied migrations 118, 119, 121, 125, and 132 over
  the required base schema. One stable item passed open, exact replay, changed-
  evidence update, verified close, recurrence reopen, and hashed named
  no-action closure. Final durable counts were one item, five observations,
  two terminal receipts, and seven versioned events.
- The same rehearsal proved observation append-only enforcement, zero
  non-admin observation grants, populated rollback refusal, and successful
  empty rollback to the migration-125 workflow constraint set.

## Local implementation boundary

Before the separately authorized NC-20260823-001 deployment, no production
database or provider was read or written and no external state changed.
Disposable clusters were stopped and moved to Trash after rehearsal. The
deployment receipt below supersedes only the migration/service state; it does
not authorize live projection or action.

## Separately gated next milestone

Migration 132 and exact host release `97026492b85e…` are live under
`NC-20260823-001`. The adapter remains disabled/absent and no healer-resolution
row exists. Enabling `COMPANY_HEALER_WORK_ENABLED`, importing the adapter into
a runtime path, projecting live incidents, presenting owner work, or executing
remediation remains unauthorized by this evidence.

## Deployment receipt

- Release commit: `97026492b85e1fe86ea9387d2bb3c9dc74019546`.
- Source tree: `f8e9ddb4f4d4338f7eb7f537a00876aeb20b01ad`.
- Artifact: 876 files, SHA-256
  `fe170e94ceca79cd3b67f9a8bd5bd1fd6a32811000c554d475710aa073d09fc3`.
- Archive SHA-256:
  `c840ee53a8157534c2337e8fe5c592e28f35d3d4ccfc0f4951848ac6556c44d0`.
- Backup: `NC-20260823-001-20260823T141637Z`; valid custom-format
  `business_v2` dump plus prior plist, both mode 0600.
- Rollback plist:
  `com.nanoclaw.plist.rollback-1f474f908484-2026-08-23T14-17-15-477Z`.
- Live result: PID 83080, Node 22.23.2, one listener, Gmail/Slack connected,
  queues empty, no new error lines, adapter disabled, healer table/report empty,
  one append-only trigger, zero non-admin grants, and protected Company Work
  fingerprints unchanged.
