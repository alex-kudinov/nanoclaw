# NC-20260802-003/006 — Claude C5 review R3

- Task IDs: `NC-20260802-003` (release activation), `NC-20260802-006` (Sales
  Slack work-item containment)
- Reviewer: Claude Code (Opus 5), session `b361d68b-688c-4dd0-bba0-a43188673962`
- Request: `docs/reports/NC-20260802-003-CODEX-REQUEST-R3.md`
- Prior reports: `…-CLAUDE-ARCHITECTURE-REVIEW-R1.md`, `…-CLAUDE-C5-REVIEW-R2.md`
- Branch/base: `codex/nc-20260802-003-company-os-sequence` @ `0f202249b79a02823225a9b03eb6ed2873b5a4cc`
- Class: C0 read-only. No source or shared continuity file was modified; no
  stage, commit, deploy, launchctl call, Slack post, or Heartbeat mutation.
- Date: 2026-08-02T19:04Z

## 1. Verdict

**APPROVE WITH FOLLOW-UPS.**

Both R2 blockers are genuinely fixed, not papered over. All four NC-003
reconciliation properties and four of the five NC-006 properties hold under
adversarial reading and re-run tests. **There are no commit or deploy
blockers.**

| R2 finding | Status |
| --- | --- |
| F1 — scheduled `[FOLLOW-UP]` cards invisible | **Closed** (§3.1) |
| F2 — older cycle redirected to newer anchor | **Closed with a stated dependency** (§3.2, B1) |
| F3 — duplicate root on partial chunk retry | **Closed** (§3.4) |
| F4 — quoted handoff marker opens a root | **Closed** (§3.3) |
| F5 — no lock between concurrent activators | **Closed** (§4.1) |
| F6 — rollback unverified / original error masked | **Closed** (§4.2) |
| F7 — cannot activate a stopped daemon | **Closed** (§4.3) |
| F8 — `listenerPids` fails open | Open; weight increased by F7's fix (A4) |
| F9 — current release root not realpath-normalized | **Closed** (§4.4) |
| F10, F11, F12 | Open, unrecorded (§6) |

Thirteen follow-ups are listed in §5. The two that matter most are **B1** — the
older-cycle guarantee is an agent-cooperation property, while
`groups/sales/CLAUDE.md:11` states it as a host fact — and **A1**, a stale
activation lock that cannot be cleared by the very recovery path F7 added.

## 2. What I verified and how

- Read the complete working diff (18 modified files, 5 new files) against
  `0f20224`, plus `src/db.ts`, `src/ipc.ts`, `src/followup-drop.ts`,
  `groups/sales/WORKFLOWS.md`, and the four updated authoritative documents.
- Re-ran the focused suites (§7).
- Traced each of the six adversarial NC-006 scenarios and the four NC-003 paths
  the request names, including the failure branches.

## 3. NC-006 — properties settled

### 3.1 Scheduled cards start visible roots — holds (R2 F1 closed)

`isScheduledSalesWorkItem` (`src/lead-thread-key.ts:43` and `:51-53`,
`/^\s*\[(?:FOLLOW-UP[^\]]*|COLD)\]/i`) matches both tracked formats:
`[FOLLOW-UP #{follow_up_count + 1}] Lead #{pipeline_entry_id}`
(`groups/sales/WORKFLOWS.md:278`) and
`[COLD] Lead #{pipeline_entry_id} — …` (`:248`). The `[^\]]*` suffix on
`FOLLOW-UP` and its absence on `COLD` is correct rather than sloppy — the cold
card's bracket carries no suffix. `src/channels/slack.ts:770-775` then routes it
through `startsSalesWork`, producing a fresh visible root and a repointed anchor.

Covered by `src/channels/slack.test.ts:1664` ("makes a scheduled follow-up card
a new visible work-item root") and `src/lead-thread-key.test.ts:113-123`, which
also pins the negative — an embedded `[FOLLOW-UP #2]` inside a `[SALES REVIEW]`
does not start work.

The R2 F1 failure trace is dead: the daily card is no longer a quiet reply into
an unbounded-age thread. It is the only channel-timeline item for its own cycle,
which matches the operator contract rather than working around it.

### 3.2 Historical-root acceptance — holds mechanically (R2 F2 closed)

`isRecordedSalesWorkRoot` (`src/channels/slack.ts:719-736`) accepts a
caller-supplied thread only when **all** of these hold, each read directly from
host-persisted state:

1. the ts resolves to a stored message (`getMessageById`);
2. `root.id === threadTs` and `root.chat_jid === jid` — same channel;
3. `!root.thread_ts` — it is a root, not a reply;
4. it carries a work-item marker: an inbound handoff **from a non-`sales`
   group**, or a scheduled card;
5. `deriveLeadKey(root.content) === leadKey` — same lead.

This is the right shape for the R2 F2 fix: it proves *identity* against the
host's own message store rather than trusting the model, so a mistyped 16-digit
float cannot select anything. `src/channels/slack.test.ts:1636` exercises the
positive case — a newer anchor exists, the older recorded root is supplied, the
post lands on the older root, `rollThreadAnchor` is not called, and no broadcast
is emitted.

The dependency this creates is real and is recorded as **B1** (§5): the host
validates the older root but has no path to *originate* it.

What the validation deliberately does not prove is **currency** — any historical
root for that lead qualifies, with no recency bound. Combined with the
no-broadcast rule, a validated-but-wrong root would place a draft invisibly in an
old thread. Reaching that requires the agent to emit a timestamp that
coincidentally matches another real root for the same lead, which is not a
credible failure mode. Recording the boundary, not raising a finding.

### 3.3 Start-anchored and author-gated matching — holds (R2 F4 closed)

`INBOUND_SALES_HANDOFF_RE` (`src/lead-thread-key.ts:40-41`) is now
`/^\s*\[HANDOFF:\s*[a-z0-9_-]+\s*(?:→|->)\s*sales\]/i` — start-anchored — and
`src/channels/slack.ts:771` adds `fromGroup !== 'sales'`. Both halves are
independently tested (`src/lead-thread-key.test.ts:104-111`;
`src/channels/slack.test.ts:1713`). The R2 F4 reproduction — a `[SALES REVIEW]`
card mentioning `[HANDOFF: mailman->sales]` — now returns false and threads
normally.

The author gate deliberately does not apply to scheduled cards, because those
*are* Sales-authored. That asymmetry is correct and is the source of B2 (§5).

### 3.4 Partial-chunk retry — holds (R2 F3 closed)

`src/channels/slack.ts:926-935` requeues a failed multi-chunk send with
`threadTs` set to the root chunk 1 established. On retry,
`isRecordedSalesWorkRoot` validates that root (chunk 1 is persisted by
`storeOutbound` at `:1419-1439` with `thread_ts` unset, so it passes the
root test), `requestedSalesRoot` becomes true, and
`startsSalesWork = hasWorkItemMarker && !requestedSalesRoot` (`:775`) becomes
false. No second root. `src/channels/slack.test.ts:1775` asserts exactly one
`rollThreadAnchor` across the failure and the reconnect, and that every
post-retry chunk carries the established root.

The composition at `:775` is the load-bearing idea here, and it is the right one:
a repeated marker on a retry or revision is not a new work item when the host can
prove the caller is already inside one.

Residual, unchanged from R2: the whole logical message is re-posted, so chunk 1's
content is duplicated *inside* the thread. The duplicate **root** is what F3 was
about, and that is fixed.

### 3.5 Reconnect delivery — holds

`flushOutgoingQueue` (`:1441-1462`) still re-enters `sendMessage` on a
`splice(0)` snapshot, with `connected = true` set first on both paths
(`:527-530`, `:631-637`). Tested at `src/channels/slack.test.ts:1750`.

### 3.6 No draft, revision, approval, or outbound handoff is broadcast

`src/channels/slack.ts:858` — `if (anchoredReply && !hostDerivedAnchor)`. Every
lead-anchored reply is quiet. I checked the two paths that could reintroduce a
broadcast and neither does: the `requestedSalesRoot` path never sets
`anchoredReply` (see B3), and the `hostDerivedAnchor` path sets it but is gated
out. Non-lead entity threads keep their broadcast, which is unchanged behaviour.

Four of the five NC-006 tests added since R2 assert `reply_broadcast` is
undefined, and no test in the suite now asserts a broadcast on a lead thread.

## 4. NC-003 — properties settled

### 4.1 Exclusive lock spans the whole apply — holds (R2 F5 closed)

`src/release-activation-exec.ts:300-316` acquires a fixed-name lock
(`<plist>.activation.lock`) with `openSync(…, 'wx', 0o600)` and writes the
holder PID. The `try` at `:318` opens **before** `copyFileSync` of the rollback
artifact (`:319`) and closes at `:385-388`, so the lock covers rollback capture,
`atomicReplace`, both launchctl cycles, health proof, and rollback. Preflight
runs outside the lock, which is correct — it mutates nothing, so a losing
activator fails fast.

`src/release-activation-exec.test.ts:186` asserts a second activator is refused
by PID, that the installed plist is byte-unchanged, and that no `unload` ran.

### 4.2 Rollback health bounded and reported without masking — holds (R2 F6 closed)

`waitForRollbackHealth` (`:199-220`) bounds the check with `options.timeoutMs`.
The composed throw at `:375-383` prefixes the **original** activation message,
appends either `rollback restored and health-verified` or
`rollback not health-verified: …`, names the rollback artifact path, and passes
`{ cause: error }`. The inner rollback sequence is wrapped at `:349-373` so a
failing `launchctl load` can no longer replace the triggering error — the exact
defect R2 F6 described.

### 4.3 `--recover-from-down` — holds (R2 F7 closed)

Apply-only (`:239-241`). It skips exactly two things: the current-health
precondition (`:254-259`) and the no-PID refusal (`:296-297`). Everything else
still runs — target bundle verify (`:252`), rollback bundle verify (`:253`),
interpreter probe (`:251`), candidate plist render + lint (`:269-272`,
`:169`), exact hostname (`:261-265`), listener release (`:329-335`), target
health proof (`:337`), and the full rollback path. `unload` is allowed to fail
only in this mode (`:326-328`), which is right for an already-stopped job.
`src/release-activation-exec.test.ts:167` covers it. The CLI exposes the flag
with an accurate one-line description (`scripts/activate-release.mjs:23`).

### 4.4 Current release root realpath-normalized — holds (R2 F9 closed)

`:247` — `plan.current.releaseDir = fs.realpathSync(plan.current.releaseDir)`,
applied before both `verifyBundle` and `assertHealthyRollbackRelease`, matching
the `realpathSync` normalization that `src/release-integrity.ts:33-36` performs
on the value reported by `/health`.

## 5. Follow-ups (none blocking)

### A1 — Medium — a stale activation lock is unrecoverable, including by `--recover-from-down`

`src/release-activation-exec.ts:303` creates the lock with `wx`; the failure
handler at `:306-315` reads the file and reports `lock is held by PID <n>` with
**no liveness check**. If an apply is SIGKILLed, loses its terminal, or the host
reboots mid-switch, the file persists and every subsequent apply fails — including
the `--recover-from-down` path F7 added for exactly that incident. The operator
must know to delete an undocumented file while production is down, and the error
text actively misleads by naming a dead PID as the holder.

**Correction:** on `EEXIST`, read the PID and test `process.kill(pid, 0)`. If it
is not alive, report `stale activation lock from PID <n>; remove <path>` — or
break and re-acquire it. Note this in `docs/RELEASE-INTEGRITY.md` alongside the
recovery command.

### A2 — Low — the `finally` block can mask the error it is unwinding

`:385-388` calls `closeSync` and `unlinkSync` unguarded. If either throws, it
replaces the in-flight activation-or-rollback error — the same masking class F6
just fixed one level down. Wrap both in try/catch.

### A3 — Low — `realpathSync` on a pruned prior release degrades the diagnostic

`:247` throws an opaque `ENOENT` when the previous release directory no longer
exists, pre-empting the clearer `release verifier missing: …` from
`verifyBundle` (`:104-106`). Fails closed either way; only diagnosability
regresses. Resolve the path defensively and let `verifyBundle` produce the
message.

### A4 — Low — `listenerPids` still fails open, and `--recover-from-down` leans on it harder

Unchanged from R2 F8: `:135-145` passes `allowFailure: true`, which is required
because `lsof` exits non-zero on the normal empty case, but also maps a missing
binary or permission denial to "no listeners". In the normal path the
conjunction with `!pidExists(priorPid)` (`:329-335`) contains this. Under
`--recover-from-down`, `priorPid` is `null`, so the wait reduces to the lsof
result alone and passes instantly if lsof cannot run. **Correction:** probe
`lsof` once up front and fail closed if it cannot execute at all.

### A5 — Low — the healthy-rollback branch is untested

`src/release-activation-exec.test.ts:211` supplies eleven health responses, all
consumed before `waitForRollbackHealth` runs, so that test always exercises the
`rollback not health-verified` path. No test asserts the
`rollback restored and health-verified` message. One extra fixture entry closes
this; the branch is currently unproven.

### A6 — Low — plist XML rendering remains mocked

Unchanged from R2 F11: `src/release-activation-exec.test.ts:13-25` mocks
`execFileSync`, so `plutil -convert xml1` never runs and the applied test parses
the installed file as JSON. Real conversion and candidate linting are exercised
only live.

### B1 — Medium — the older-cycle guarantee is agent-cooperation, but the prompt states it as a host fact

**This is the most important item in this review.**

`isRecordedSalesWorkRoot` can only *validate* a supplied thread; it cannot
*originate* one. `src/ipc.ts:401`, `:427`, and `:562` pass
`threadTs: data.thread_ts` verbatim — the host never defaults it — and there is
no work-unit root in that scope to default from. So when Sales omits
`thread_ts`, output still goes to the newest anchor, which is R2 F2's original
failure.

In the designed flow this is fine: `groups/sales/WORKFLOWS.md:105`, `:109`, and
`:114` do instruct the agent to use the triggering message's `thread_ts` for
feedback and approval replies, and a human reply inside root1 carries root1's
`thread_ts`. So the mechanism is reachable and the containment normally works.

The problem is how it is described. `groups/sales/CLAUDE.md:11` asserts flatly:
"a human response in an older still-open thread stays in that older cycle."
That is conditional on the agent passing `thread_ts`, and the same file's next
paragraph still tells the agent it "do[es] not need to compute a `thread_key`
for lead work" without mentioning that `thread_ts` is now what preserves an
older cycle. Relatedly, `docs/ACTIVE-WORK.md` and `docs/PROJECT-MAP.md` say
"model-supplied timestamps and keys are not the only control" — accurate for
*rejecting* a bad timestamp, but for *selecting* an older cycle a model-supplied
timestamp is currently the only control.

R2 F2's point was that the host, not the model, should own cycle selection. What
shipped is a genuine and correct improvement — an unvalidated model timestamp can
no longer select anything — but it is a narrower guarantee than the prompt claims.

**Corrections, smallest first:**

1. Add one line to `groups/sales/CLAUDE.md` stating that replying inside an
   existing work item requires passing that message's `thread_ts`, and soften
   the assertion at `:11` to match.
2. Correct the "not the only control" wording in `ACTIVE-WORK`/`PROJECT-MAP` to
   distinguish rejection from selection.
3. Follow-up (larger, not for this slice): plumb the work-unit root through IPC
   so the host can default `opts.threadTs` when the agent omits it. That is the
   only change that would make the guarantee host-owned.

### B2 — Low-Medium — a scheduled card re-posted without `thread_ts` opens a duplicate root

A new failure mode created by the F1 fix, and strictly less severe than F1 was.
Because `[FOLLOW-UP …]` is now a root-starting marker, a revision that repeats
the card header and omits `thread_ts` sets `startsSalesWork` (`:775`) and rolls
the anchor into a second root for one follow-up cycle.
`groups/sales/WORKFLOWS.md:109` ("Re-post the FULL audited draft … in the same
thread using `thread_ts`") mitigates it, and the `!requestedSalesRoot`
composition handles the compliant case.

**Correction:** when an anchor already exists and its stored root content carries
the same scheduled marker and the same lead, treat the repeat as a revision
rather than a new work item. That is host-verifiable from data already read.

### B3 — Low — dead branch, and the anchor is never touched for a validated older root

`src/channels/slack.ts:814-817` (`else if (requestedSalesRoot)`) is unreachable.
`isRecordedSalesWorkRoot` returns false unless `threadTs` is truthy, so
`requestedSalesRoot === true` implies `effectiveThreadTs` is truthy at `:797`,
which means the enclosing `if (threadKey && !effectiveThreadTs)` (`:806`) is
always skipped.

Consequence: for a validated older-root reply, `anchoredReply` stays false and
`keyToTouch` is never set, so `touchThreadAnchor` never runs and
`last_activity_at` does not advance. There is no functional impact today because
lead anchors bypass the TTL entirely (`:820-826`), but the code states an
intent it does not execute, and the omission becomes a live bug if the TTL
bypass is ever revisited. Delete the branch or hoist the anchor touch so it
applies to validated roots.

### B4 — Low — the partial-retry test's root fixture is not faithful to production

`src/channels/slack.test.ts:1791-1798` sets `getMessageById` to return the
**whole** `longHandoff`, but production `storeOutbound` (`:1419-1439`) persists
only the posted **chunk**. Validation therefore really depends on chunk 1
containing both the `[HANDOFF: …]` marker (guaranteed — it is the first token)
and the `Email:` line consumed by `deriveLeadKey` (not guaranteed if a handoff
header ever exceeds one chunk). If the address fell outside chunk 1, validation
would fail and the retry would create a second root — precisely the outcome F3
fixed — and this test would not catch it. Return the persisted chunk in the
fixture.

### B5 — Low — no negative test for an unrelated recorded root

The suite covers "no stored root" (the default mock) and "valid historical
root", but none of the four rejection reasons at `:722-735`: a root in another
channel, a root that is itself a reply, a root without a work-item marker, and a
root deriving to a different lead. The checks read correctly; a test per reason
would lock them in, and they are the security-relevant half of B1's mechanism.

### B6 — Low — added per-send lookups, and a silent downgrade on resolver failure

`isRecordedSalesWorkRoot` adds one synchronous SQLite read plus a possible
business-DB lookup to every send carrying a `threadTs` and a lead, on top of the
existing `deriveLeadKey(text)` — doubling the concern R2 F12 raised for the
`connect()` → `flushOutgoingQueue` path. Bounded by the queue snapshot, so not a
hazard.

More notable: `deriveLeadKey` swallows resolver errors and returns `undefined`
(`:702-711`), so a transient business-DB failure makes
`deriveLeadKey(root.content) === leadKey` false, the validated older root is
silently rejected, and the reply lands in the newest cycle with no log line
naming the reason. Emit a debug line on that specific rejection.

### B7 — Low, informational — `getMessageById` is not keyed by channel

`src/db.ts:648-655` selects `WHERE id = ?` while `messages` is keyed
`(id, chat_jid)`. A ts present in two channels returns an arbitrary row; the
explicit `root.chat_jid !== jid` check then rejects it, so the outcome is a
false negative (fall back to the anchor), never a wrong-channel accept.
Fail-safe. A `(id, chat_jid)` lookup would be exact.

## 6. Process finding

R2's F8, F10, F11, and F12 are neither fixed nor recorded. `docs/ACTIVE-WORK.md`
and the changelog entries state that the R2 findings "are now reconciled", which
is accurate for the blockers and for F5/F6/F7/F9 but silently drops four
acknowledged Low items. `docs/CHANGE-PROTOCOL.md:257-259` requires every open
follow-up to become a `planned` active-work row with an owner or to be
explicitly declined with a reason. Recording them as declined-with-reason is
sufficient; leaving them unmentioned is what the protocol forbids.

Everything else in the continuity records is accurate. In particular the
changelog does not overstate boundaries: it says no Slack message, database row,
installed prompt, service, or production process was changed, and it explicitly
defers live behaviour to a separate reviewed deployment. `docs/RELEASE-INTEGRITY.md`
is candid that the activator "does not replace the channel, listener,
prompt-hash, or task-specific live checks after activation."

## 7. Verification

Run in this worktree; nothing was modified.

| Check | Result |
| --- | --- |
| `vitest run src/release-activation.test.ts src/release-activation-exec.test.ts src/release-integrity.test.ts src/channels/slack.test.ts src/lead-thread-key.test.ts` | **pass, 5 files / 142 tests** (release 7 + 5, integrity 9, slack 89, lead-key 32) |
| Full suite | **143 files / 1,804 tests discovered** — matches the changelog's counts exactly; 12 files / 144 failed in my session, all environmental |

**Pinned-Node caveat, per the request's instruction.** This session's default
`node` is v26.5.0 and the execution policy did not permit invoking
`/opt/homebrew/opt/node@22/bin/node` (v22.23.2, present and verified) directly.
The focused suites above touch no native module, so their result is
interpreter-independent and valid. The 144 full-suite failures are invalid
environment evidence and are treated as such: every failing file is either a
`better-sqlite3` `ERR_DLOPEN_FAILED` from `_initTestDatabase` (`src/db.ts:362`)
or an explicit pin assertion — `setup/platform.test.ts` ("returns the pinned
Node 22 major") and `src/release-bundle-verifier.test.ts`, which fails with
`release requires Node 22.23.2; verifier is running under 26.5.0`. That last one
is the release verifier correctly refusing the wrong runtime, which is the
behaviour under review working as designed. No failing file touches
`release-activation*`, `release-integrity`, `slack`, or `lead-thread-key`.

I therefore corroborate but do not independently reproduce the full-suite pass.

Unchanged reproducibility note from R2: `node_modules` here is a symlink into
`/private/tmp/nanoclaw-deploy-20260802.pEhLKh/release-src/node_modules`, so the
branch becomes unbuildable when that scratch directory is cleaned.

## 8. Blockers, follow-ups, and owner decisions

**Commit blockers:** none.

**Deploy blockers:** none. Two items should land in the same change as the
commit because they are documentation accuracy, not code:

- B1 corrections 1 and 2 — `groups/sales/CLAUDE.md:11` currently promises more
  than the host enforces.
- §6 — record or explicitly decline R2 F8/F10/F11/F12.

**Recommended before the first production `--apply`:** A1 (stale lock), because
it defeats the recovery path in the incident it was built for, and A4, because
`--recover-from-down` depends on the listener check alone.

**Owner decisions:**

1. **B1 correction 3** — plumb the work-unit root through IPC so the host can
   default `thread_ts`, making older-cycle selection host-owned rather than
   agent-cooperative? Larger than this slice; the alternative is to accept the
   dependency and state it plainly.
2. **B2** — add scheduled-card repost dedup now, or accept that a
   `thread_ts`-less revision opens a duplicate root?
3. **Carry-over, unchanged and out of scope here:** NC-004 submission identity.
   `docs/reports/NC-20260802-004-HEARTBEAT-ID-OBSERVATION.md` correctly reports
   that no stable submission ID is visible and offers three options; its
   recommendation (option 1, bounded read-only discovery) remains the right one.
   NC-004/005 being dark is not a defect in these two slices.
4. **Carry-over from R1:** the eight canonical Heartbeat titles are now observed
   but still not tracked in a Git-versioned, release-bundled mapping file, and
   `~/dev/grading` remains outside every provenance guarantee in
   `docs/RELEASE-INTEGRITY.md`.

## 9. Limits

- Read-only; the only file created is this report.
- `plutil` XML rendering and every `launchctl` interaction remain mocked, so the
  real activation path is unproven outside a live run — unchanged from R2 and
  unavoidable at unit level.
- B3 (dead branch) is established by reading, not by instrumentation, since
  adding a probe would have modified source.
- The full suite was not reproduced under the pinned interpreter (§7).
- Elapsed: 2026-08-02T18:59Z → 19:04Z, single session, no subagents.
