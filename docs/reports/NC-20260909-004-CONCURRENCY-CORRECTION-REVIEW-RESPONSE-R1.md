# NC-20260909-004 concurrency correction — bounded review R1 response

## Material findings

### Finding 1 (Q2): Live daemon can admit a new task container in the gap between the locked concurrency check and `launchctl unload`, which then gets forcibly killed

**Evidence:**

- `src/release-activation-exec.ts:432-443` — the exclusive-lock CAS check fetches health and calls `assertReleaseConcurrencySafe(lockedHealth)` at line 442. This is a point-in-time snapshot of the *live daemon's* queue state.
- `src/release-activation-exec.ts:445-452` — after that check passes, the code still performs: `fs.copyFileSync` + `plutil -lint` (445-446), then inside the try block `atomicReplace(plistPath, candidateXml)` (450, itself a `writeFileSync` + `plutil -lint` subprocess + `renameSync`), and only then `run('/bin/launchctl', ['unload', plistPath], ...)` (452).
- Nothing in this window pauses the *live* daemon process. The `shlock`-based `activation.lock` (acquired at line 425) only serializes concurrent `activateRelease` invocations against each other — it does not signal the running daemon to stop admitting new task closures (e.g., from `task-scheduler.ts`, out of scope but presumably still firing on its own interval).
- `src/group-queue.ts:1411-1477` (`GroupQueue.shutdown`) confirms what happens to any task container that starts in that window: on shutdown it is pushed into `activeContainers` (task containers only, 1420-1428) and force-stopped with a grace period then `SIGKILL` (1454-1475). Message containers are deliberately left running for adoption; task containers are not, because — per the file's own comment (1415-1419) — "their work is an in-process closure that cannot be adopted."

**Consequence:** A task container that begins after the locked check (line 442) but before `launchctl unload` (line 452) is exactly the class of work `assessReleaseConcurrency`/`assertReleaseConcurrencySafe` exists to protect. It will be forcibly killed mid-closure by the shutdown path this same activation triggers, with no adoption and no rollback for whatever partial side effects it already produced. This is a real, evidenced TOCTOU gap, not a theoretical one — the check and the mutation it gates are separated by multiple synchronous subprocess spawns (`plutil` invoked at least twice) and file I/O, not adjacent operations.

**Correction:** Close or shrink the gap to the actual mutation boundary:

1. Minimum fix within these files: re-fetch health and re-run `assertReleaseConcurrencySafe` again immediately before the `launchctl unload` call at line 452 (i.e., after `atomicReplace`, not only before it), so the assertion is adjacent to the irreversible step rather than several operations upstream of it.
2. Complete fix (requires a change outside the reviewed file set, but should be tracked): have the activator signal the live daemon to stop admitting new task-container work (an admission-pause sentinel or admin endpoint) before performing the locked check, and only clear it after `launchctl unload` succeeds or the attempt aborts. Narrowing the window per (1) reduces exposure but cannot fully eliminate it while the daemon's task scheduler remains free-running during the checked window.

## Other review questions

- **Q1** (adoptable-but-actually-unsafe containers): No defect found in the reviewed files. `assessReleaseConcurrency` fails closed on every malformed/ambiguous shape it doesn't recognize (`active_container_identity_missing`, `active_container_kind_unknown`, `queue_active_count_mismatch`, `runtime_active_count_mismatch`, `group_states_invalid`, etc. — `src/release-concurrency.ts:100-132`), and `pendingTaskCount` for a group is counted toward `pending_task_work` regardless of whether that group's *current* container is a task or message container (`src/release-concurrency.ts:115-118`), so a message container with a queued task behind it correctly blocks restart.
- **Q3** (conflicting/stale/orphaned/foreign-owner leases in `programctl.py`): No defect found. `claim-resource`/`renew-resource`/`release-resource` all execute inside the same `state_lock` (`fcntl.flock`) critical section as their read-check-write sequence, so no cross-process race window exists on a single host/filesystem. `apply-state`'s `changed_resource_lease_tasks` (lines 1214-1228, checked at 1381-1383) blocks any task from mutating a lease keyed to a different `task_id`. `validate_program`'s `orphan_resource_lease` and `resource_lease_conflict` checks (lines ~712-728) are a second, independent safety net against any of these paths producing an invalid state.
- **Q4** (recovery paths removing a foreign lock or weakening the gate): No defect found. `releaseActivationLock` (`src/release-activation-exec.ts:220-223`) only unlinks the lock file when it was written by the calling process's own PID. The rollback path (`src/release-activation-exec.ts:471-511`) restores the exact prior plist bytes and attempts exactly one rollback load without touching the activation lock's ownership semantics.

No other material findings.
