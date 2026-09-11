# NC-20260909-004 concurrency correction — load-bearing review R2

## Objective

Review only the correction to R1's material TOCTOU finding. Write
`docs/reports/NC-20260909-004-CONCURRENCY-CORRECTION-REVIEW-RESPONSE-R2.md`.
Report material findings only; write `NO MATERIAL FINDINGS` if the race is
closed without weakening restart, webhook retry, lock ownership, or rollback.

## R1 finding

R1 proved that a task could start after the activator's locked health snapshot
but before `launchctl unload`. That task would be non-adoptable and could be
killed mid-closure. The minimum extra health sample was rejected as still
TOCTOU-prone; the complete admission-pause correction was implemented.

## Correction

- The activator atomically creates an owner-token-bound mode-0600 barrier in
  the operational working directory while holding the existing activation
  lock.
- The scheduler checks the barrier before reading due tasks, before every task
  enqueue, and before host-job dispatch. Host jobs are counted until their
  promises settle.
- Webhook-agent enqueue checks the barrier; a refused archived webhook is
  marked failed with a stable reason so the existing reaper can retry it.
- `/health.releaseActivation` dynamically reports barrier validity, expected
  current commit, and active host-job count.
- The activator requires the current daemon to report the exact barrier and
  zero host jobs before mutation. The target daemon must start and report that
  same barrier before it is released.
- Only the first activation from a pre-barrier release may use an explicit
  bootstrap flag, and only with a completely empty current container snapshot.
  Normal later releases cannot bypass the barrier.
- Cleanup releases only the calling activator's barrier. An unreadable or
  foreign barrier remains fail-closed for explicit recovery.

## Allowed sources

- `docs/reports/NC-20260909-004-CONCURRENCY-CORRECTION-REVIEW-RESPONSE-R1.md`
- `src/release-task-admission.ts`
- `src/release-concurrency.ts`
- `src/release-activation-exec.ts`
- `src/task-scheduler.ts`
- `src/webhook-server.ts` (task enqueue/refusal path only)
- `src/index.ts` (health and enqueue wiring only)

Do not inspect other files, secrets, auth/session stores, logs, databases, or
provider state. Do not edit implementation. Write only the named response.

## Verification

- Barrier, concurrency, activator, scheduler and webhook focused suite:
  101/101 pass.
- Typecheck passes.
- Earlier combined enrollment/release suite: 153/153 pass.
- Program resource-lease tests: 25/25 pass.

## Review questions

1. Once a barrier-aware release is live, can scheduled, host-job, or
   webhook-agent task work still cross the final locked check and start before
   unload?
2. Can an active host job be missed or can a refused webhook become falsely
   handled/non-retryable?
3. Can failure, rollback, bootstrap, or cleanup remove another owner's barrier
   or leave normal future applies able to bypass it?
