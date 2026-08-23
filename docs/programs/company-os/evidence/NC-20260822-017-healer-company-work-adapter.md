# NC-20260822-017 healer Company Work adapter evidence

Date: 2026-08-23
State: local `ready_for_review`; uncommitted, unapplied, unwired, undeployed
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

## Safety boundary

No production database or provider was read or written. No live incident was
projected. No Slack message, healer action, shell rerun, code implementation,
configuration activation, deployment, restart, credential, or external state
changed. Disposable clusters were stopped and moved to Trash after rehearsal.

## Separately gated next milestone

Review and commit this local candidate. Applying migration 132, importing the
adapter into a runtime path, enabling `COMPANY_HEALER_WORK_ENABLED`, projecting
live incidents, presenting owner work, or deploying remains unauthorized by
this evidence.
