# Self-Healing Completion Plan

**Status:** Current completion authority
**Date:** 2026-07-30
**Task:** `NC-20260730-002`
**Safety posture:** observe and diagnose by default; model-authored actions
remain off until their later phase is explicitly reviewed, deployed,
configured, and canary-verified. The existing fixed daemon recovery remains a
separately controlled, default-on availability safeguard.

## 1. Where the work stopped

The healer is not an abandoned prototype. Visibility, persistence, Slack
reporting, heartbeat/liveness detection, trust-rated diagnosis, adversarial
review, approval polling, a transient rerun loop, and an experimental
implementation pipeline all exist. The fast and digest jobs have also produced
live incident history.

The incomplete part is the action boundary and operating model:

| Area | Current state | Completion gap |
| --- | --- | --- |
| Collection and incident store | Implemented and operating | JSONL rotation, collector health SLO, and recovery drills are not closed |
| Heartbeat and daemon-down detection | Implemented | Fixed `launchctl kickstart` recovery is separately controlled by default-on `HEALER_RESTART_ENABLED`; its cap, quiet stop, and controlled recovery canary still require deployment verification |
| Diagnosis | Agentic investigator, refuter, tie-breaker, and fallback exist | Runs synchronously inside the 5-minute job while one investigation can take 5 minutes; failure/stale-state recovery and throughput need separation |
| Trust | Confidence, cause/symptom, evidence, and review are persisted | `NC-20260730-002` requires a completed passing review at execution; an initial refutation can only be overturned by the existing independent tie-breaker path, and free-text review-state coupling remains to be typed |
| Human approval | Slack reactions/replies are polled | The original path accepted any non-bot user and reusable signals; the local safety slice replaces this with named operators, epochs, expiring nonces, final rechecks, and atomic claims |
| Tier-2 reruns | Code and circuit breaker exist; allowlist defaults empty | Raw commands must be replaced by typed host-owned actions before enablement; daily/global action caps and production canaries remain |
| Code implementation | Experimental detached pipeline exists | It runs with broad permissions in the operational checkout. It remains disabled until moved to a disposable worktree with restricted credentials and independent review |
| Deployment truth | Installed healer jobs are live; implementation is off | The new model-authored action boundary and separate restart control are local source only. Installed artifact/config and existing pending proposals have not been changed |

## 2. Completion definition

Self-healing is complete only when:

1. observation and diagnosis meet a measured freshness SLO without blocking
   collection;
2. every enabled remediation action is a typed host capability, not
   model-authored shell;
3. every human approval is named, fresh, one-time, auditable, and rechecked at
   the final boundary;
4. automatic actions are proven idempotent, capped, atomically claimed, and
   outcome-verified;
5. code changes occur only in disposable worktrees and can produce a reviewed
   draft PR, never a production mutation;
6. kill switches, stale-claim recovery, rollback, and recovery drills are
   live-verified;
7. deployment, live behavior, and outcome validation are recorded separately.

## 3. Phased completion sequence

### Gate A — Fail-closed prerequisite (`NC-20260730-002`)

Current local scope:

- default-off `HEALER_ACTIONS_ENABLED` above approval commands, allowlisted
  reruns, and implementation;
- separate default-on `HEALER_RESTART_ENABLED` for the fixed, capped,
  host-authored daemon recovery, with `HEALER_QUIET` as its emergency stop;
- explicit `HEALER_OPERATOR_UIDS`, non-empty `HEALER_ACTION_EPOCH`, bounded
  approval TTL, and `HEALER_QUIET` as a complete action kill switch;
- host-issued proposal epoch, nonce, and timestamp; old or model-supplied
  bindings are discarded;
- trust/class/fix/review recheck and atomic database claim immediately before
  execution;
- exact approver and redacted action evidence in the audit trail;
- stale claim recovery and no reuse of a proposal after rejection, action, or
  implementation result;
- tracked launchd defaults keep model-authored actions and implementation off
  while preserving deterministic daemon recovery.

Exit gate:

- pinned Node 22 typecheck, full tests, independent security review, and
  continuity checks pass;
- source is committed and reviewed;
- deployment is separately authorized;
- deploy the artifact with `HEALER_ACTIONS_ENABLED=0` and
  `HEALER_RESTART_ENABLED=1`, verify observation, diagnosis, and one controlled
  daemon-recovery canary, and rotate/disarm old pending proposals before any
  model-authored action canary.

### Gate B — Separate diagnosis from the fast collector

Build a dedicated diagnosis worker/job:

- fast loop only collects, reports, checks liveness, and performs bounded
  action polling;
- diagnosis rows are atomically leased with owner, start, expiry, and attempt
  metadata;
- investigator/refuter/tie-breaker run outside the 120-second fast-job budget;
- stale `investigating`, `adversarial_review`, and action claims recover to a
  visible manual state;
- per-stage latency, queue age, success/fallback rate, and token/transport
  failure are reported;
- `HEALER_INVESTIGATE_BASH` remains off unless a real command-level read-only
  sandbox replaces tool-level Bash permission. Today that escape hatch grants
  Bash to a `bypassPermissions` diagnosis process outside
  `HEALER_ACTIONS_ENABLED`; only `HEALER_QUIET` stops it globally.

Exit gate: collection stays within its interval under a seeded slow
investigation; no incident is orphaned after worker kill/restart.

### Gate C — Replace raw shell with a typed action registry

Do not enable the current command path. Replace `proposed_fix.command` execution
with host-owned action IDs and validated arguments, for example:

- rerun a specific registered sweeper/job;
- restart the NanoClaw launchd label;
- recheck a named integration;
- clear only a specifically proven recoverable state.

Each registry entry must define authorization, argument schema, idempotency
key, timeout, maximum attempts, audit redaction, verification query, and
rollback/escalation behavior. Unknown IDs and all legacy free-form commands are
manual-only suggestions.

Exit gate: negative tests prove unknown, malformed, stale, replayed,
wrong-operator, and policy-disabled requests cannot reach a process boundary.

### Gate D — Named-operator Tier-1 canary

- deploy the typed registry with global actions still off;
- choose actual operator UIDs and record ownership without publishing secrets;
- create a new action epoch for the reviewed release;
- disarm all pre-epoch proposals;
- enable one reversible, low-blast-radius typed action;
- verify named approval, atomic claim, action audit, recurrence check, rejection,
  TTL expiry, epoch rotation, quiet switch, and rollback;
- keep code implementation and automatic reruns off.

Exit gate: one controlled canary reaches `verified_fixed`, and all denial
canaries remain inert.

### Gate E — Tier-2 automatic reruns

- promote only registry actions with proved idempotency;
- require source/action allowlist agreement, per-incident cap, global daily cap,
  atomic claim, and a recurrence-free verification window;
- distinguish command failure, action success, and verified business recovery;
- automatically reopen or escalate rather than repeatedly acting.

Exit gate: controlled transient fixtures and one production-safe canary prove
single execution, cap behavior, and verified closure.

### Gate F — Disposable-worktree implementation

- create a clean, per-incident worktree from a reviewed base SHA;
- pass sanitized evidence and no production credentials;
- remove broad `bypassPermissions` where possible and enforce filesystem,
  network, command, timeout, and concurrency bounds outside the prompt;
- add an enforced process timeout and orphan cleanup; the current detached
  implementation pipeline is unbounded;
- require a reproducing test, focused/full green tests, scoped diff, draft PR,
  and independent review;
- never merge, deploy, restart services, mutate production data, or reuse the
  operational checkout;
- a completed PR returns to `needs_human`, not the shell-approval queue.
- keep implementation incidents out of the generic recurrence-based verifier;
  only the detached completion poller may decide their result.

Exit gate: an intentionally seeded repository fixture produces a bounded draft
PR in isolation and leaves the operational checkout byte-for-byte unchanged.

### Gate G — Operational completion

- implement JSONL rotation with offset/truncation tests;
- alert on missed fast/digest/diagnosis schedules and queue-age SLO breaches;
- drill Slack/Claude/PostgreSQL outage degradation and Pushover fallback;
- verify migration/schema reproducibility and status-state recovery;
- publish an operator runbook for enable, epoch rotation, quiet, disable,
  proposal disarm, rollback, and incident recovery;
- observe at least 30 days of precision, false-positive, time-to-diagnose,
  time-to-recover, recurrence, action, and human-escalation outcomes before
  increasing autonomy.

## 4. Decisions required before action enablement

1. Which Slack UIDs are authorized operators?
2. Which one or two typed actions qualify for the first canary?
3. What approval TTL and daily action cap are acceptable?
4. What recurrence-free window proves each action fixed the incident?
5. Is Phase-3 code implementation worth retaining after disposable-worktree
   cost and security review, or should it remain permanently manual?
6. What queue-age and missed-run thresholds page the operator?
7. Who owns daemon-down response when `HEALER_RESTART_ENABLED=0` is chosen for
   maintenance or rollback?

## 5. Explicit non-authorization

This plan and `NC-20260730-002` do not authorize installing the new artifact,
editing the installed launchd unit, enabling actions, configuring operator
identities or epochs, consuming current Slack reactions, changing production
incident rows, running a remediation command, restarting the daemon, opening a
PR, or deploying any code.
