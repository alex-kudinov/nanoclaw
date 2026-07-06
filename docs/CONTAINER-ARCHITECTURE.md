# Apple Container Architecture — Analysis & Target Design

Written 2026-07-06, immediately after the noop-swarm incident (see commit
`4dac626`). All numbers below were measured live on the Mac Mini that night.

## Measured facts

| Metric | Value | Source |
|---|---|---|
| VM boot → first agent output | ~9–12 s | log deltas, spawn → "Agent output" |
| Agent idle RSS inside VM | ~90 MB (node ~46 MB) | /proc/meminfo in container |
| Default VM allocation | 1024 MB / 4 CPU | Apple container v0.10.0 default |
| Capped allocation (ours) | 768 MB / 2 CPU | `-m`/`-c` in container-runner |
| buildkit VM (idle) | 4096 MB, ran 10 days | `container ls` |
| Mini base load (no containers) | ~18–19 GB of 24 GB | vm_stat |
| Practical concurrency ceiling | 4–5 VMs | MAX_CONCURRENT_CONTAINERS=4 |
| Noop container lifetime | ~35–46 s | completion durations |
| Real grading run | 170–580 s | completion durations |
| Spawns during the incident | 130 in 2 h (mostly noops) | log census |

## The Good

- **Isolation is real.** Each minion runs in its own lightweight Linux VM
  (Virtualization.framework). Arbitrary tool execution can't touch the host.
- **Cold start is not the problem.** ~10 s from spawn to a thinking agent is
  fine for jobs that run minutes (grading ≈ 3 min of real Claude work).
- **The mental model is simple.** One container per (group, thread) work
  unit; sessions persist on disk; queue with slots + waiting list; no k8s.
- **Caps are now bounded and tunable** (`CONTAINER_MEMORY`/`CONTAINER_CPUS`
  env, per-group `idleTimeout`), and the queue's park/drain mechanics are
  sound — nothing is dropped when slots are full.

## The Bad

- **8.5× memory overprovision.** 768 MB reserved per VM for a ~90 MB
  workload. The unit of scheduling (a VM) costs ~8× the thing it hosts.
- **The ceiling is 4–5, not 40.** The box's 5–6 GB of headroom fits 4–5 VMs;
  the same headroom would fit 40+ host processes doing identical work.
- **Slot contention couples unrelated minions.** The grader competes with
  newsletters, webhooks, and (during the incident) its own zombie herd. One
  misbehaving group starves everyone; there is no priority or preemption.
- **Idle-timeout tension has no good setting.** 30 s kills warm sessions
  (next reply pays the 10 s cold start again); 5 min squats a quarter of the
  fleet's capacity. The tension exists only because slot == VM == huge
  fixed cost.
- **Containers die with the daemon.** They're child processes, so every
  deploy/restart kills in-flight work → cursor rollback → recovery → herd
  risk. Most of the recovery machinery exists to compensate for this.

## The Ugly (what actually burned us on 2026-07-05)

- A **crossed positional-param binding** in `getMessagesSince` silently
  disabled the own-group exclusion. Every ack/reply a group posted came back
  as phantom "pending work"; every spawn posted an ack that re-armed the
  thread. A perpetual noop loop: 130 spawns in 2 h, real submissions buried
  behind 5-minute slot waits, and the user kicking threads by hand.
  Fixed + regression-tested in `4dac626`. Lesson: **feedback loops between
  the bot's own output and its input queue are the system's biggest hazard**,
  bigger than any VM overhead. Own-output must be excluded at the fetch
  layer, provably, with tests — not by prompt-side filtering.
- **`container stats` is a TUI** — unusable for monitoring. Measuring real
  usage requires `container exec <name> cat /proc/meminfo`.
- **buildkit squats 4 GB forever** once any image build runs. Stop it after
  builds (`container builder stop`); it restarts on demand.

## Target design — lean, in phases

Keep the daemon, the queue, the DB, the session model. Change the unit of
execution, not the orchestration.

### Phase 1 — LRU eviction instead of idle timers (small patch)

Let containers stay warm indefinitely; when the queue needs a slot and none
is free, evict the longest-idle container (the `notifyIdle` hook already
exists). Benefits: hot groups (grader mid-session) keep their warm session
and skip the cold start; nothing squats, because eviction is on demand, not
on a timer. This dissolves the 30 s-vs-5 min tension entirely.

### Phase 2 — host-process runtime for trusted minions (the big win)

Per-group flag `containerConfig.runtime: 'host' | 'container'`. Trusted,
first-party minions (grader, contador — they run our prompts with our
tools against our own repos) run as plain host processes: ~120 MB each,
zero cold start beyond SDK init, concurrency 20+ inside today's headroom.
Confine with per-group working dirs + the existing mount-allowlist logic
(enforced as path checks) or `sandbox-exec` profiles. The container path
remains the default for anything untrusted or experimental. This removes
the RAM ceiling AND most cold-start cost in one move, with the isolation
spent only where it buys something.

### Phase 3 — decouple container lifetime from daemon lifetime (only if
dev-restart churn stays high)

Run containers detached; the daemon re-attaches by name on boot (IPC is
already file-based under `data/ipc/`). Restarts stop killing in-flight
grades, which removes the cursor-rollback/recovery-herd class of problems
at the root rather than compensating for it.

### Non-goals

- No k8s, no Docker Desktop, no external schedulers.
- No warm-pool manager unless Phase 2 leaves a measurable cold-start pain
  (it likely won't — the untrusted groups are the low-traffic ones).

## Standing operational rules

- `container builder stop` after any image build; never leave buildkit up.
- Watch spawn rate: >15 spawns/10 min without matching human traffic is the
  swarm signature — the canary that would have caught this incident in
  minutes. (Log census: `grep -c "Spawning container agent"`.)
- MAX_CONCURRENT_CONTAINERS stays 4 (5 with buildkit stopped) until Phase 2
  changes the math.
- Every dynamic SQL in `db.ts` builds conditions and params in lockstep —
  see the regression tests in `db.test.ts` before touching them.
