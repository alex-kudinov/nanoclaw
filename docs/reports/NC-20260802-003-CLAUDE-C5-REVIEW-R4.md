# NC-20260802-003/006 — Claude C5 review R4

- Task IDs: `NC-20260802-003` (release activation), `NC-20260802-006` (Sales
  Slack work-item containment)
- Reviewer: Claude Code (Opus 5), session `b361d68b-688c-4dd0-bba0-a43188673962`
- Request: `docs/reports/NC-20260802-003-CODEX-REQUEST-R4.md`
- Prior reports: R1 architecture, R2 (`CHANGES REQUIRED`), R3
  (`APPROVE WITH FOLLOW-UPS`)
- Branch/base: `codex/nc-20260802-003-company-os-sequence` @ `0f202249b79a02823225a9b03eb6ed2873b5a4cc`
- Class: C0 read-only. No source or shared continuity file was modified; no
  stage, commit, deploy, launchctl call, Slack post, or Heartbeat mutation.
- Date: 2026-08-02T19:26Z

## 1. Verdict

**APPROVE WITH FOLLOW-UPS.**

All twelve R3 items are either closed in code or carried as tracked `planned`
rows. The five delta mechanisms hold under adversarial reading, and 178 focused
tests pass — matching the claimed evidence exactly. **No commit or deploy
blockers.**

Two new findings, both Medium and both introduced by the R3 fixes themselves —
which is the expected shape at this stage, not a regression in judgement:

- **N1** — the stale-lock reclaim added for R3 A1 opens a narrow unlink/create
  TOCTOU window that can admit two concurrent activators, the exact condition
  R2 F5's lock prevents.
- **N2** — `[COLD]` carries no cycle number, so scheduled-card dedup can
  collapse a genuinely new cold cycle into an indefinitely-old cold thread.

Neither blocks: N1 needs a pre-existing stale lock *plus* a near-simultaneous
second activator, and the ordinary concurrent case still serializes correctly;
N2 affects an informational card whose 👎 deliberately does not drop the lead.

## 2. Answers to the seven required questions

### Q1 — Can `source_container` be forged or stale to select another Sales thread?

**Stale: no. Forged: yes, but contained by the Slack lead check, and the residue
is low-impact.**

*Staleness is closed.* `resolveContainerContext`
(`src/group-queue.ts:339-361`) matches only live queue state, and every exit
path nulls both fields it depends on: message runs
(`src/group-queue.ts:691`), task runs (`:729`), eviction (`:1025`), and
adoption finalize (`:1223`). A name from a finished container resolves to
`undefined`, and the caller then supplies no thread.

*Lifecycle coverage is correct.* Adopted containers are resolvable and should
be — `adoptContainer` (`:1170-1198`) sets `containerName`, `groupFolder`, and
`isTaskContainer = false`, and an adopted container is genuinely live and can
still emit IPC. Task containers are excluded by the explicit
`state.isTaskContainer` test (`:348`), which is what keeps a scheduled
`[FOLLOW-UP]` card from inheriting a thread and losing its own root. Both
`runTask` transitions (`:727-729`) are synchronous with no `await` between
clearing `isTaskContainer` and clearing `containerName`, so no observable
window exists for the single-threaded IPC watcher.

*Forgery is possible.* The value originates in the container
(`container/agent-runner/src/ipc-mcp-stdio.ts:24,84`, `process.env.CONTAINER_NAME`),
but the agent can write an IPC file directly into its writable
`data/ipc/<group>/messages/` mount, so `source_container` is agent-controlled.
`sourceGroup` is directory-derived and cannot be forged, so the only reachable
target is **another live container in the same group folder** — a second
concurrent Sales work unit. That is reachable: `threadKeyFor`
(`src/index.ts:209-215`) keys any threaded post by its `thread_ts` regardless of
`threadPerMessage`, so several Sales containers can be active on different lead
threads simultaneously.

*Three layers contain it.* Cross-group inheritance is blocked at
`src/ipc.ts:354-359` — `outboundThreadTsFor` requires both
`sourceGroup === 'sales'` and `sourceContext.chatJid === outboundJid`. Then the
Slack adapter re-validates independently: `isRecordedSalesWorkRoot`
(`src/channels/slack.ts:720-738`) requires the named root to derive to the
**same lead**, so a forged thread pointing at another lead's root fails, falls
through to `hostDerivedAnchor`, and lands on the correct lead's anchor.

*Residue.* Two cases survive, both minor. A forged name for a *same-lead*
sibling cycle validates and posts into that sibling — "wrong cycle, right lead",
which is the bounded remainder of R2 F2 rather than a new exposure. And a
**non-lead-bearing** Sales message has no `leadKey`, so neither
`hostDerivedAnchor` nor `requestedSalesRoot` applies and
`effectiveThreadTs = threadTs` (`src/channels/slack.ts:824-828`) is used
verbatim; the post lands in some other thread of the same channel. That matches
the pre-existing treatment of any agent-supplied `threadTs` for non-lead
messages and is not a new authority.

One cheap hardening, not required: `resolveContainerContext` does not test
`state.active`. All four clear paths null `containerName`, so it is unreachable
today; adding the check is defence in depth.

### Q2 — Does the work-unit default cover human feedback/approval replies without altering handoff roots or scheduled root creation?

**Yes, on all three counts, and the mechanism is the right one.**

*Feedback/approval replies are covered.* `threadKeyFor`
(`src/index.ts:213-214`) returns `msg.thread_ts` for any threaded post before
consulting `threadPerMessage`, so an operator reply inside root1 produces the
composite work-unit key `slack:SALES||root1`. `resolveContainerContext` splits
that key (`src/group-queue.ts:352`) and returns `threadTs: root1`, which
`outboundThreadTsFor` supplies when the model omits `thread_ts`
(`src/ipc.ts:354-359`). Sales does not need `threadPerMessage` for this to
work. `src/ipc-handoff-echo.test.ts:386-419` asserts the end-to-end default.

This is the correction R3 B1 asked for: older-cycle selection now has a
host-originated path instead of depending solely on the model retyping a
timestamp.

*Initial handoff roots are unaltered.* Two independent reasons. A routed
handoff carries `sourceGroup = 'mailman'` (or `inbox`), so the
`sourceGroup === 'sales'` guard at `src/ipc.ts:356` excludes it. And an inbound
handoff arrives as a channel-root post, so `threadKeyFor` yields the `'root'`
bucket, which `resolveContainerContext` maps to no `threadTs` at
`src/group-queue.ts:354-356`.

*Scheduled root creation is unaltered.* A scheduled card emitted from a task
container is excluded by `isTaskContainer` (`:348`); one emitted from a
root-bucket message container yields no `threadTs` by the same `'root'`
sentinel. Either way no default is supplied, `startsSalesWork` holds, and the
card becomes its own visible root.

*Model precedence preserved.* `data.thread_ts || (…)` at `src/ipc.ts:355` means
an explicit model value still wins — and is still subject to
`isRecordedSalesWorkRoot` validation downstream. The host default is a fallback,
not an override.

### Q3 — Can scheduled-card dedup collapse two distinct cycles, or still duplicate a root?

**Duplicate root: no, three independent guards cover it. Collapse: yes, for
`[COLD]` — finding N2.**

`scheduledSalesWorkMarker` (`src/lead-thread-key.ts:56-59`) normalizes the
leading bracket to an uppercase, whitespace-collapsed token, so
`[follow-up   #2]` and `[FOLLOW-UP #2]` unify while `#2` and `#3` stay distinct
(`src/lead-thread-key.test.ts:126-133`). `isScheduledSalesRevision`
(`src/channels/slack.ts:742-755`) then requires the **current lead anchor root**
to carry the same marker, be a root, and derive to the same lead.

*No duplicate root.* Three guards, any one sufficient:
`requestedSalesRoot` covers a partial-chunk retry (the requeue at
`src/channels/slack.ts:951-961` carries the established root) and any revision
that supplies `thread_ts`; the Q2 work-unit default covers a revision whose
container was woken inside the cycle; `scheduledRevision`
(`src/channels/slack.ts:795-800`) covers a bare repost with neither.

*Collapse — N2 (Medium follow-up).* `[COLD]` has no sequence number, so its
marker is always `"[COLD]"`. Lead anchors deliberately never expire
(`src/channels/slack.ts:845-852` bypasses the TTL), so if a lead is resurrected
and later goes cold again, the second `[COLD]` card matches the marker and lead
of a months-old `[COLD]` root and is treated as a revision: it posts quietly
into that old thread with no channel-timeline presence. That is the invisibility
class R2 F1 was raised about, reappearing in a much narrower form. Severity is
low in practice — the card is informational and `src/followup-drop.ts:67`
records that a 👎 on `[COLD]` deliberately does not suppress the lead.

The same shape applies if a follow-up cadence restarts and re-emits
`[FOLLOW-UP #2]` against an old `[FOLLOW-UP #2]` root.

**Correction:** bound revision equivalence in time or generation — require the
stored root to be recent (a retry/revision window rather than indefinite), or
include a cycle generation in the marker. Both are host-verifiable from data
already read.

*Related, narrower:* a late out-of-order revision (`[FOLLOW-UP #2]` arriving
after `[FOLLOW-UP #3]` has rolled the anchor) matches neither guard and rolls
the anchor **back** to a `#2` root. Unlikely; worth folding into the same
follow-up.

### Q4 — Does channel-scoped lookup preserve existing callers?

**Yes.** `getMessageById(messageId, chatJid?)` (`src/db.ts:648-660`) makes the
channel clause conditional on an optional second argument, and every
pre-existing caller still passes one argument:
`src/classify-ipc-handlers.ts:192` (Gmail message ID),
`src/followup-drop-deps.ts:36`, `src/index.ts:1793` and `:1835`, and
`src/channels/slack.ts:405` (the reaction handler). Only the two new Sales
call sites pass a channel (`src/channels/slack.ts:726`, `:750`). The Gmail
caller in particular must stay unscoped, since a Gmail message ID has no Slack
`chat_jid` — and it does.

This closes R3 B7 without touching non-Slack behaviour.

### Q5 — Is stale-lock recovery race-safe and fail-closed?

**Fail-closed for four of the five named cases. The concurrent-reacquire case
has a real race — finding N1.**

`acquireActivationLock` (`src/release-activation-exec.ts:151-184`):

| Case | Behaviour | Correct? |
| --- | --- | --- |
| Unreadable lock | `holder` stays `'unknown'`, `Number('unknown')` is `NaN`, the reclaim guard fails, throws | ✅ fail-closed |
| Malformed content | same `NaN` path | ✅ fail-closed |
| Live PID | `pidExists` true, throws naming the holder | ✅ fail-closed |
| Permission denied on unlink | `catch {}` falls through to the throw | ✅ fail-closed |
| Concurrent reacquire | see N1 | ⚠️ |
| Second EEXIST after reclaim | `attempt === 0` guard prevents a second reclaim, so a lock freshly created by a racing activator is never stolen | ✅ |

**N1 — Medium follow-up.** The reclaim is unlink-then-create, which is not
atomic:

1. lock `L0` exists with a dead PID; activators A and B both fail `openSync`;
2. both read `holder`, both see the PID is dead;
3. A unlinks `L0`, `openSync` succeeds, A holds `L_A`;
4. B — whose read predated A's create — unlinks, **removing `L_A`**, then
   `openSync` succeeds and B holds `L_B`;
5. both proceed to mutate the installed plist.

The compounding effect is in cleanup: the `finally` at
`src/release-activation-exec.ts:411-421` unlinks `lockPath` unconditionally
rather than only its own lock, so whichever activator finishes first removes the
other's lock and a third activator sees a free path.

Reachability is genuinely narrow — it requires a pre-existing stale lock *and*
two activators starting within the same few milliseconds (a retry script or a
double invocation). The ordinary concurrent case, with no stale lock, still
serializes correctly: both `openSync` calls fail, the holder PID is live, and
both throw. `src/release-activation-exec.test.ts:193-219` proves that path, and
`:221-238` proves single-activator reclaim.

**Correction (cheap, closes it):** after acquiring, re-read the lock and confirm
it contains this process's PID; and in the `finally`, unlink only if the content
still matches. A stricter alternative is to require an explicit
`--break-stale-lock` flag instead of automatic reclaim, trading ergonomics for
certainty.

### Q6 — Does the `lsof -v` preflight distinguish availability from the no-listener exit, without breaking macOS?

**Yes. Verified empirically on this host.**

I executed `/usr/sbin/lsof -v` through the same `execFileSync` shape the code
uses: **exit 0, empty stdout** (the version banner goes to stderr). So
`assertListenerProbe` (`src/release-activation-exec.ts:147-149`), which calls
`run` without `allowFailure`, passes on a healthy macOS and throws on a missing
or non-executable binary.

The distinction is real and necessary: the *query* form
`lsof -nP -iTCP:<port> -sTCP:LISTEN -t` exits non-zero when there is simply no
match, which is why `listenerPids` (`:135-145`) must keep `allowFailure: true`.
The `-v` probe is the only way to tell "no listeners" from "cannot ask", and it
closes R2 F8 / R3 A4. `src/release-activation-exec.test.ts:240-263` asserts
fail-closed with no `launchctl unload`, and does so under
`recoverFromDown: true` — precisely the mode where `priorPid` is null and the
listener check carries the wait alone.

**One placement note (Low).** `assertListenerProbe()` is called at
`src/release-activation-exec.ts:339`, *after* the dry-run return at `:322-329`.
A broken `lsof` therefore surfaces only at `--apply`, not during the dry-run
rehearsal the runbook prescribes. Moving the probe above the dry-run return
would surface it one step earlier at no cost.

### Q7 — Are the NC-007/008 dispositions sufficient, and are the docs accurate?

**Yes to both.**

*Dispositions.* `docs/CHANGE-PROTOCOL.md:257-259` requires every open follow-up
to become a `planned` active-work row with an owner or be explicitly declined.
`docs/ACTIVE-WORK.md:14-15` adds both rows with owner, class, scope, dependency,
and next action, and `:58-80` gives each a detail subsection with an explicit
boundary statement. I checked the mapping against my own R2/R3 findings and it
is complete:

| Finding | Disposition |
| --- | --- |
| R3 A1 stale lock, A2 finally masking, A4 lsof fail-open (= R2 F8) | closed in code |
| R3 A3 pruned-release diagnostic, A5 healthy-rollback branch, A6 real plist XML, R2 F10 same-directory error | NC-007 |
| R3 B1 host authority, B2 scheduled dedup, B3 dead branch, B4 retry fixture, B7 channel-scoped lookup | closed in code |
| R3 B5 negative rejection coverage, B6 resolver-downgrade telemetry, R2 F12 non-connection retry, anchor-roll race, in-thread chunk dedup | NC-008 |

This resolves the R3 §6 process finding.

*Documentation accuracy.* I checked each new claim against the code and found no
overstatement. `docs/RELEASE-INTEGRITY.md:135-140` describes the lock and probe
in exactly the terms the implementation supports — "a still-live or unreadable
lock fails closed, while a lock whose recorded PID no longer exists is removed
and exclusively re-acquired once", and "recovery never treats a missing or
denied probe as an empty port". It does not disclose the N1 window, but it
states nothing false. `docs/PROJECT-MAP.md` §Sales containment correctly
separates the three layers — runner stamps identity, host resolves it against
the active work unit, Slack adapter independently validates — and states
"Cross-group handoffs never inherit the source thread", which matches
`src/ipc.ts:356`.

Notably, `docs/ACTIVE-WORK.md:108-110` now says "the queue and IPC watcher
originate active work-unit context; the Slack adapter validates any explicit
historical root … Prompt instructions remain defense in depth." That is the
precise correction R3 B1 asked for: the earlier wording claimed host authority
the code did not yet have, and the code has now caught up to the claim rather
than the claim being quietly softened.

## 3. Findings

### N1 — Medium — stale-lock reclaim can admit two concurrent activators

Evidence, trace, and correction in §Q5. Not a blocker: requires a stale lock
plus near-simultaneous start; the no-stale-lock concurrent case still
serializes.

### N2 — Medium — `[COLD]` dedup can collapse a genuinely new cycle

Evidence, trace, and correction in §Q3. Not a blocker: the card is
informational and the lead-drop path is unaffected.

### N3 — Low — `assertListenerProbe` runs after the dry-run return

`src/release-activation-exec.ts:339` vs the dry-run return at `:322-329`. A
broken probe is invisible during rehearsal. See §Q6.

### N4 — Low — `resolveContainerContext` does not test `state.active`

`src/group-queue.ts:344-350`. Unreachable today because all four clear paths
null `containerName` (`:691`, `:729`, `:1025`, `:1223`), but the check is free
defence in depth against a future lifecycle path that forgets one.

### N5 — Low — non-lead Sales output still uses an inherited thread verbatim

When `leadKey` is undefined, neither `hostDerivedAnchor` nor
`requestedSalesRoot` applies and `effectiveThreadTs = threadTs`
(`src/channels/slack.ts:824-828`). A forged or inherited `source_container`
thread is therefore used as supplied for non-lead messages. Same channel, same
group, no lead misattribution; consistent with the pre-existing treatment of
agent-supplied `threadTs`. Recording the boundary rather than proposing a change.

All five belong in the existing NC-007 (N1, N3) and NC-008 (N2, N4, N5) rows
rather than as new task IDs.

## 4. Verification

| Check | Result |
| --- | --- |
| `vitest run` over the seven delta files | **pass, 7 files / 178 tests** — release-activation 7, release-activation-exec 7, release-integrity 9, slack 90, lead-thread-key 33, group-queue 18, ipc-handoff-echo 14 |
| `/usr/sbin/lsof -v` executed through the code's `execFileSync` shape | **exit 0**, empty stdout — confirms Q6 |

The focused count matches the claimed "7 files / 178 tests" exactly.

**Pinned-Node caveat, unchanged from R3.** This session's default `node` is
v26.5.0 and the execution policy does not permit invoking
`/opt/homebrew/opt/node@22/bin/node` (v22.23.2, present and verified) directly.
None of the seven delta files loads a native module, so their result is
interpreter-independent. I did not re-run the full suite this round; the R3 run
established that all failures under Node 26 are `better-sqlite3`
`ERR_DLOPEN_FAILED` plus two explicit pin assertions, and no delta file appears
among them. I therefore corroborate but do not independently reproduce the
pinned-Node typecheck and full-suite claims.

Reproducibility note, unchanged: `node_modules` here is a symlink into
`/private/tmp/nanoclaw-deploy-20260802.pEhLKh/release-src/node_modules`.

## 5. Blockers, follow-ups, and owner decisions

**Commit blockers:** none.

**Deploy blockers:** none.

**Recommended before the first production `--apply`:** N1. The reclaim path was
added for incident recovery, and its failure mode — two concurrent activators —
is the one condition the lock exists to prevent. The re-read-after-acquire fix
is a few lines and closes it.

**Owner decisions:**

1. **N1 shape** — re-read-after-acquire (keeps automatic reclaim, closes the
   window) or an explicit `--break-stale-lock` flag (certain, less ergonomic
   mid-incident)?
2. **N2 shape** — bound revision equivalence by recency, or add a cycle
   generation to the scheduled marker?
3. **Carry-over, out of scope here:** NC-004 submission identity remains
   blocked on the three options in
   `docs/reports/NC-20260802-004-HEARTBEAT-ID-OBSERVATION.md`; option 1
   (bounded read-only ID discovery) remains the right one.
4. **Carry-over from R1:** the eight canonical Heartbeat titles are observed but
   still not tracked in a Git-versioned, release-bundled mapping file, and
   `~/dev/grading` remains outside every provenance guarantee in
   `docs/RELEASE-INTEGRITY.md`.

## 6. Limits

- Read-only; the only file created is this report.
- `plutil` XML conversion and every `launchctl` interaction remain mocked, so
  the real activation path is still unproven outside a live run — tracked as
  NC-007 and correctly declared in `docs/ACTIVE-WORK.md:195-196`.
- N1's race is established by reading the unlink/create sequence, not by
  reproducing it; constructing the interleaving would require instrumenting
  source, which this review may not do.
- The forgery analysis in Q1 assumes an agent can write directly into its own
  IPC mount, consistent with the 2026-07-21 cross-session message-theft
  incident. I did not attempt to write an IPC file.
- Elapsed: 2026-08-02T19:21Z → 19:26Z, single session, no subagents.
