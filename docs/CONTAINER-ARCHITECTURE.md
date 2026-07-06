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

## Target design — lean, in phases (ALL THREE IMPLEMENTED 2026-07-06)

Keep the daemon, the queue, the DB, the session model. Change the unit of
execution, not the orchestration. Status: shipped and live-verified on the
mini the night of 2026-07-06 (eviction test, mid-run daemon kill + adoption
drill in #gru-heartbeat, pipe-into-adopted, finalize-on-exit).

### Phase 1 — warm containers + LRU eviction (SHIPPED)

Default idle window is now 20 min (IDLE_TIMEOUT default; the 30s plist
override was removed — the grader keeps its per-group 30s for one-shot
threads). Warm containers no longer squat: at the concurrency limit the
queue evicts the longest-idle warm container (container.lifecycle.evict)
and the parked group takes the slot when it exits. Busy containers are
never preempted. Closing is per-container now: the host writes a targeted
`_close-<containerName>` sentinel (CONTAINER_NAME env tells the runner its
own name), with the bare `_close` only as a folder-sole fallback — the
cross-thread close race is gone. The container-side wrapper idle backstop
follows the host window (+2 min) instead of a fixed 7 min.

### Phase 2 — right-size the VM allocation per group (PLUMBING SHIPPED)

`containerConfig.memory` / `containerConfig.cpus` per group now feed `-m` /
`-c` (global defaults still CONTAINER_MEMORY/CONTAINER_CPUS envs → 768M/2).
Every run samples /proc/meminfo every 20s (MEMORY_SAMPLE_INTERVAL_MS) and
logs `container.lifecycle.peak_memory` at exit — collect a week of peaks,
then set per-group values with margin. Numbers deliberately NOT guessed.

REJECTED ALTERNATIVE, kept for the record: "host-process runtime for
trusted minions" was proposed and dropped. There is no trusted minion —
the minion's code is ours, but its INPUT is adversarial-capable (student
docx files, inbound email, webhooks), and an LLM agent's behavior is a
function of its input. The VM + mount-allowlist boundary is what enforces
"minions only communicate through host-mediated channels" by topology
rather than convention; a host process running as the login user could
read keys, other minions' folders, and the DB. Every minion keeps its VM.

Instead, fix the economics inside the isolation model: 768 MB was chosen
as ~8.5× measured IDLE; nobody has measured PEAK under real load (docx
conversion is the fattest grader step). Measure the high-water mark over
a few real runs per group, then set per-group `containerConfig.memory` —
chatty minions at 384–512 MB, heavy ones at peak+margin. At 512 MB the
same 5–6 GB headroom runs 10–12 VMs instead of 4–5.

Caveat that stays true regardless: the VM confines prompt-injection blast
radius to the minion's mounts; it does not eliminate it. Mount minimalism
plus git/Syncthing history is the defense inside that boundary. And the
hard ceiling on the mini is the 18–19 GB base load — a diet pass there
buys more slots than any container tuning.

### Phase 3 — detached container lifetime + adopt-on-boot (SHIPPED)

Containers spawn detached (own process group; launchd AbandonProcessGroup)
with stdout/stderr in FILES under `data/containers/` and a sidecar JSON
carrying their identity (compositeKey, thread, session, log paths, pid,
routed-output offset). The daemon tails the file (LogTail) instead of a
pipe — identical parsing, but the stream survives daemon death. On boot,
`adoptOrphanContainers()` re-attaches to live sidecars: claims a queue
slot, resumes the tail from the last routed offset (no duplicate posts),
routes outputs to the original thread, and finalizes when the CLI PID
dies. Dead sidecars are swept; `cleanupOrphans` spares adoptables (boot)
and queue-owned message containers (shutdown). Task containers are still
stopped at shutdown — their work is an in-process closure, and the
scheduler re-runs them. Restarts no longer kill in-flight work, which
removes the cursor-rollback/recovery-herd class of problems at the root.

Sidecars are HOST-LOCAL: hostname-stamped, foreign-host and sync-conflict
files ignored, and `data/`, `store/`, `logs/` are excluded from Syncthing
at the ~/dev folder root (the nested NanoClaw/.stignore was inert — only
folder-root ignores count). Update the other machines' ~/dev/.stignore the
same way.

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
