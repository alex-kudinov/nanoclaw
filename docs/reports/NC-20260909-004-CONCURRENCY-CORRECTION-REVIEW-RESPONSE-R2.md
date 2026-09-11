# NC-20260909-004 concurrency correction — load-bearing review R2 response

## Material findings

### Finding 1 (Q1): The bootstrap path retains R1's original TOCTOU gap; it is narrowed to a single one-time transition, not closed

**Evidence:**

- The admission-pause barrier only protects a restart when the *currently
  running* daemon actually reads and honors the barrier file. That capability
  is introduced by this same correction (`src/release-task-admission.ts`,
  `isReleaseTaskAdmissionPaused` wired into `src/task-scheduler.ts:86,
  451-483` and `src/index.ts:2369`). A daemon predating this change has no
  such code path — it cannot pause admission because it has never heard of
  the barrier file.
- `src/release-activation-exec.ts:368-378` and `:451-460` both special-case
  exactly this: when `currentSupportsAdmissionBarrier` is false, `--apply`
  requires `--allow-admission-barrier-bootstrap`, and the locked-health gate
  substitutes a raw `activeContainers === 0` snapshot
  (`assessReleaseConcurrency(lockedHealth).activeContainers !== 0` at line
  455) for the barrier-observed assertion. This is a deliberate, correctly
  documented escape hatch for the single transition from a pre-barrier
  release to a barrier-supporting one — it is not reachable once
  `currentSupportsAdmissionBarrier` is true (line 451 takes the strict branch
  unconditionally in that case, so the bootstrap flag becomes inert on every
  later release, as intended).
- But inside that escape hatch, the mutation sequence following the snapshot
  is byte-for-byte the same multi-step window R1 found unsafe:
  `fs.copyFileSync` + `plutil -lint` (`release-activation-exec.ts:464-465`),
  `atomicReplace` (469, itself `writeFileSync` + `plutil -lint` subprocess +
  `renameSync`), then `launchctl unload` (471-473). Nothing in this window
  signals the *old* daemon to stop admitting work, because the old daemon has
  no such signal to receive. If a scheduled task, host job, or webhook
  arrives in that gap — after the `activeContainers === 0` snapshot was taken
  but before `launchctl unload` completes — the old daemon will admit it the
  same way it always has, and `GroupQueue.shutdown` will force-kill it
  mid-closure exactly as described in the R1 finding.

**Consequence:** The correction fully closes R1's finding for every ordinary
release (current daemon supports the barrier). It does not, and structurally
cannot, close it for the one-time bootstrap release that first introduces the
barrier — the `activeContainers === 0` snapshot reduces the exposure window's
*likelihood* (nothing was mid-flight a moment ago) but does not pause
admission during the snapshot-to-unload gap the way the barrier does for
every subsequent release. This is a materially real, if narrow and
self-limiting, gap: it exists only for the single bootstrap activation and
disappears permanently once that one release is live.

**Suggested handling:** No further code correction seems required — this is
an accepted, documented tradeoff of introducing the barrier for the first
time (there is no daemon-side signal to rely on before the barrier exists).
Worth recording explicitly as a known limitation of the one-time bootstrap
activation, and worth treating that one activation as a change-controlled
event (quiet traffic window, operator watching) rather than a routine deploy,
since it is the only release where the new safety mechanism does not apply.

## Other review questions

- **Q1, non-bootstrap case:** No defect found. The correction replaces R1's
  point-in-time snapshot with a standing gate: `createTaskAdmissionBarrier`
  (`release-activation-exec.ts:431-435`) is written and fsynced before the
  locked health read, and every admission site
  (`task-scheduler.ts:86-92`, `:451-459`, `:466`, `src/index.ts:2369`) checks
  the barrier file fresh via `fs.existsSync`/`fs.readFileSync` on every call
  with no caching, so any admission decision made after the file exists sees
  it. `assertTaskAdmissionBarrierObserved`
  (`release-concurrency.ts:183-200`) additionally forces the *live* daemon to
  echo back the same `expectedCurrentCommit` and `activeHostJobs === 0`
  before the locked check can pass, so the gate is not just "a file exists"
  but "the running process has actually observed it." Because the check-then-
  enqueue at each admission site is synchronous with no `await` between the
  barrier read and the call into the queue (`index.ts:2368-2372`, `task-
  scheduler.ts:465-476`), there is no JS-level gap in which the check could
  pass and a stale decision could still be acted on afterward.
- **Q2, active host jobs:** No defect found. `activeHostJobs` is incremented
  synchronously before `runJob` is invoked and decremented only in
  `.finally()` on that same promise (`task-scheduler.ts:100-138`), so the
  count is accurate for the entire lifetime of dispatched work, and
  `/health.releaseActivation.activeHostJobs`
  (`index.ts:2304-2307`) reads that live counter at request time with no
  caching.
- **Q2, refused webhooks:** No defect found. `enqueueAgentTask` returns
  `false` without ever calling `queue.enqueueTask`
  (`index.ts:2368-2372`) when the barrier is present, so the webhook's work
  closure — including everything that would mark it handled — is never
  invoked. `webhook-server.ts:2217-2228` marks the inbox row failed with the
  stable reason `release_task_admission_paused` using the same
  `markWebhookFailed` path already used for the pre-existing circuit-open
  refusal (`webhook-server.ts:2013-2029`), so it is retried the same way.
- **Q3:** No defect found. `releaseTaskAdmissionBarrier`
  (`release-task-admission.ts:139-164`) refuses to unlink unless
  `record.ownerToken` matches the caller's token, so failure, rollback, and
  the `finally` cleanup (`release-activation-exec.ts:552-563`) can only ever
  remove the barrier this same invocation created — never a foreign one — and
  an unreadable/foreign barrier is left in place rather than deleted. The
  bootstrap flag is structurally inert once `currentSupportsAdmissionBarrier`
  is true (`release-activation-exec.ts:451`), so no normal future apply can
  use it to bypass the gate.

No other material findings.
