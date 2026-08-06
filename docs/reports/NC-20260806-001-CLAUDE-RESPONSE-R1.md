# NC-20260806-001 — Claude review response R1

## Verdict

`CHANGES REQUIRED`

One blocking defect: the new recap suppression is a text predicate, and it
suppresses blocked/questioning final text in threads — the exact regression
class the threaded carve-out immediately above it exists to prevent (Entry 938).
Everything else in the repair holds, including the exact Marina failure path.

## Review basis

- Base commit `aff14c8e43128f41b5980d93c6a0aaff524c6200`, branch
  `codex/nc-20260806-001-approval-rejection-loop`, uncommitted worktree at
  `/private/tmp/nanoclaw-sales-ack`.
- Independently reproduced on the pinned runtime
  (`/opt/homebrew/opt/node@22/bin/node`, `v22.23.2`, matches `.nvmrc`):
  - `tsc --noEmit`: pass.
  - `vitest run src/approval-recap.test.ts src/ipc-handoff-echo.test.ts
    src/channels/slack.test.ts src/send-watchdog.test.ts
    src/approved-send-handoff.test.ts`: 5 files / 196 tests pass.
  - `container/agent-runner`: `tsc --noEmit` pass; `vitest run` 4 files /
    28 tests pass.
  - `node scripts/run-email-critical-tests.mjs`: 19 files / 505 tests pass
    (`src/approval-recap.test.ts` present, 7 tests).
  - `npm run docs:continuity-check`: pass (47 active/ready rows, 42 changelog
    entries).
- Behavioural probes run against the real modules (not the test doubles), not
  green tests taken on trust: `src/approved-send-handoff.ts`,
  `src/email-content-guard.ts`, `src/ipc.ts` exports, `src/approval-recap.ts`.

## Required adversarial checks

### 1. The exact Marina failure now produces a targeted correction turn — PASS

Probe against the live modules, using the sanitized card shape:

```
isSalesReviewCard: true
parses: true
contentOk: false  violations: ["AI-ism \"happy to help\" (banned client-facing phrasing)"]
corrected contentOk: true   (only "I am happy to help map out" -> "I can map out")
```

Chain, each link verified in code:

1. `container/agent-runner/src/ipc-mcp-stdio.ts:95-103` →
   `send-message-result.ts:9-11` returns "submitted for host validation … Do not
   claim it is awaiting approval" instead of `Message sent.`.
2. `src/ipc.ts:495` routes the card to the source channel branch;
   `src/ipc.ts:500` parses it; `src/ipc.ts:536-540` fails the same
   `checkContent` the transport uses; `src/ipc.ts:549-554` returns
   `[approval_card REJECTED] …` with the literal violation list to
   `data.source_container`; `src/ipc.ts:556-572` posts exactly one visible
   rejection into the host-derived work thread; `src/ipc.ts:573-577` quarantines
   the file; `continue` at `587` skips the `fs.unlinkSync` at `618`, so no
   double-handling.
3. Delivery lands as a new turn in the same session: `src/group-queue.ts:399-431`
   writes the input addressed to `state.containerName`; the runner drains it at
   `container/agent-runner/src/index.ts:328-348` after the current
   `claude --print` turn exits and re-prompts with `--resume`. Incident timing
   makes this safe with margin — the rejection is written ~0.2s after the card,
   the turn's final text landed ~2.3s later, and the wrapper idles for 420s.
4. The false recap cannot escape alongside it: `src/index.ts:663-684` suppresses
   it (test `src/approval-recap.test.ts:7` asserts the literal Marina string).

No self-wake loop: the visible rejection is posted with `fromGroup: 'sales'` into
the sales-owned channel, and `src/db.ts:665-670` only treats a bot message as a
spawn trigger when `from_group !== owner`. So the rejection cannot also re-enter
as inbound work and produce a second repost.

### 2. Concurrent Sales containers — PASS

`src/group-queue.ts:344-367` resolves a context only for an `active`,
non-task container whose `containerName` **and** `groupFolder` both match, so a
sibling never resolves. The write itself is addressed
(`src/group-queue.ts:426`, `target_container`), and the runner leaves
non-matching payloads in place (`container/agent-runner/src/index.ts:170-180`).
Existing coverage: `src/group-queue.test.ts:38-73` asserts undefined for a
different container name, a different folder, and after the run releases.

### 3. Exited / unavailable source container — PASS (untested, see F2)

`src/ipc.ts:275-284`: when `deliverSourceInput` returns false there is no
fallback file write and no untargeted delivery — it logs and returns. This is
deliberately unlike `writeDeniedGmailInput` (`src/ipc.ts:235-256`), which does
keep a legacy untargeted path; the asymmetry is correct here. The visible
rejection (`556-572`) and the quarantine (`573-577`) both run unconditionally
afterwards, so the card stays visibly rejected, quarantined, never posted, and
never rerouted to a sibling.

### 4. Accepted cards still post once, in the original work thread — PASS

The accepted path (`src/ipc.ts:589-596`) is byte-identical to before the change.
The preflight cannot newly block anything: it calls the same
`buildApprovedHandoff(data.text)` and the same `checkContent(subject, body)` on
the same bytes that `src/channels/slack.ts:1033-1041` already ran downstream, so
the block set is unchanged and only moves earlier. Because the card is now
stopped at IPC, the transport replacement no longer fires for it — exactly one
rejection message, not two. Thread placement is unchanged
(`outboundThreadTsFor` / `hostWorkUnitThreadTsFor`, `src/ipc.ts:422-441`);
`src/ipc-handoff-echo.test.ts:363,602,638` still pass.

### 5. Direct Slack transport keeps its independent guard — PASS

`git diff` touches no file under `src/channels/`. `src/channels/slack.ts:1030-1056`
still runs `isApprovalCard` → `buildApprovedHandoff` → `checkContent` and the
overlong check on every outbound path, including agent final text
(`src/index.ts:686`) and watchdog posts. 102 slack tests pass.

### 6. Recap suppression false positives — **FAIL (blocking, F1)**

`src/approval-recap.ts:10-15` matches on words alone. Probed against the real
export:

| Final text (suppressed = hidden from the operator) | matched |
| --- | --- |
| `Draft is ready. I could not post the review card because gmail_get_thread returned nothing for this lead, so nothing is awaiting approval yet.` | **true** |
| `Draft ready for Lead #1047, but the cohort schedule is missing the September date — I cannot finish until you confirm it. Holding the draft, awaiting approval to use the August cohort instead.` | **true** |
| `Error: send_message failed twice. The draft posted earlier is the only one awaiting approval.` | **true** |
| `Draft posted for Marina Minina (Lead #1047) — ACTC matched, awaiting approval in thread.` | true (intended) |

The first row is the Entry 938 shape verbatim — a stalled run that reads as a
completed one — and the comment at `src/index.ts:653-662` states that carve-out
is why threaded echoes were preserved in the first place. The new condition
`(!threadTs || suppressApprovalRecap)` re-opens it for any blocked turn whose
prose happens to pair "draft/review card" + "posted/ready/updated" with
"awaiting approval" inside 240 characters. `groups/sales/CLAUDE.md:21` reduces
the odds by telling Sales to end silently, but a blocked run is precisely the
case where the model writes prose instead.

Confirmed non-suppressed: Gmail receipts, `[EMAIL HELD]`, plain progress lines,
a pending-list answer, and — checked explicitly — the full `[SALES REVIEW]` card
template itself (`groups/sales/WORKFLOWS.md:80-106` ends "Waiting for approval",
not "awaiting approval", so a card emitted as final text is not swallowed).
Host-generated receipt/hold text is unreachable by this predicate: suppression
lives only in the `runAgent` output callback.

### 7. Approval markers and cross-group tool result — PASS with one nit

`container/agent-runner/src/send-message-result.ts:1-2` and
`src/approved-send-handoff.ts:28-29` carry byte-identical marker sets
(`SALES REVIEW | CLIENT SUPPORT REVIEW | SUPPORT-DRAFT | FOLLOW-UP #\d+`), both
with the `m` flag, so host and container agree even on a marker that appears on
a later line. All four are asserted in
`container/agent-runner/src/send-message-result.test.ts:6-16`.

Nit (F4): `send-message-result.ts:8` returns early on `targetGroup`, so
`send_message(text: "[SALES REVIEW] …", target_group: "chief")` still answers
`Message sent to chief.` — false on two counts, because `src/ipc.ts:495` forces
every card to the **source** channel and ignores `targetGroupFolder`. The
correction path still works there (`source_container` is set regardless of
target), so this is a wrong tool string, not a lost rejection.

### 8. Release packaging and the shared gate — PASS

- `scripts/run-email-critical-tests.mjs:8-12` includes
  `src/approval-recap.test.ts`; `scripts/build-release.mjs:43` runs that gate
  before packaging. Reproduced: 19 files / 505 tests.
- `scripts/build-release.mjs:92-110` bundles all tracked files under
  `container/`, so `send-message-result.ts` and its test ship once committed.
- No image rebuild is required for the runner change: `src/container-runner.ts:277-311`
  hash-copies `container/agent-runner/src` per group and mounts it at `/app/src`,
  and the entrypoint recompiles it at container start. A new file changes
  `computeDirHash`, so the copy is invalidated on the next spawn. Containers
  already running keep the old tool text until they recycle (owner decision D3).

### 9. Remaining post-preflight rejection routes without targeted feedback

- **R1 (F3, real):** an otherwise-valid card longer than
  `MAX_MESSAGE_LENGTH` (`src/channels/slack.ts:68`, 4000, plus the `[sales]\n`
  prefix). Probed: a clean card of 4479 chars returns `contentOk: true`, so the
  IPC preflight passes it, and `src/channels/slack.ts:1030-1048` replaces it with
  the overlong rejection. `deliverSourceInput` is not reachable from
  `src/channels/slack.ts` (it exists only in `src/ipc.ts` and `src/index.ts`), so
  this is the Marina shape with the feedback leg missing — visible rejection,
  silent agent. The repair leaves the operator strictly better off than before
  (the false recap is now suppressed), but no correction turn happens.
- **R2:** a card emitted as the agent's *final text* rather than through
  `send_message` bypasses the IPC preflight entirely (`src/index.ts:686`) and is
  handled only by the transport guard. For Sales this is mostly masked by
  `suppressFinalText`; other card-marker groups are not.
- **R3:** source group not registered → quarantine with no feedback
  (`src/ipc.ts:606-616`, pre-existing).
- **R4:** rejection at approval time (`src/send-watchdog.ts:216-235`) posts to
  the thread only — correct for that boundary, out of scope here.

## Findings

**F1 — blocking. Recap suppression is text-derived, so it hides blocked turns.**
`src/index.ts:663-669`, `src/approval-recap.ts:10-15`. Evidence in check 6.
Remedy (root-cause, not a pattern tweak): the host already knows the truth for
this run — it either posted the card or rejected it for that exact
`source_container`. Gate the threaded suppression on that state (suppress only
when a card from this container was accepted and posted during this work unit),
and drop the text match, or at minimum refuse to suppress when the text also
carries a blocking signal (`could not`, `cannot`, `blocked`, `error`, `waiting
on`, `?`). Either way the new behaviour needs a regression test in the
release-blocking gate alongside `src/approval-recap.test.ts`.

**F2 — required before deploy. The unavailable-container branch is untested.**
Every test sets `deliverSourceInput: vi.fn(() => true)`
(`src/ipc-handoff-echo.test.ts:401,445,494,530,564`; `src/ipc-gmail-auth.test.ts:212`).
Check 3 is the "never rerouted to a sibling" guarantee and it is exactly what a
future refactor of `writeRejectedApprovalCardInput` would silently break — a
false-returning case asserting (no sibling write, rejection still posted, file
still quarantined) belongs in the same gate the change already extends.

**F3 — residual gap (owner decision D1).** Overlong-card route R1 above. The
predicate is host-known at IPC time (`fromGroup` prefix + the 4000 limit), so
the same preflight could return targeted feedback instead of leaving it to the
transport.

**F4 — nit.** Cross-group tool string, check 7.

**F5 — nit.** `src/ipc.ts:542` says "The exact subject/body fail…" while
`src/channels/slack.ts:1054` says "its exact subject/body fail…"; `docs/PROJECT-MAP.md`
claims one operator vocabulary. Also `docs/PROJECT-MAP.md:790` is 110 characters
where the file wraps at ~79 — the new sentence was spliced in without rewrapping.

**F6 — environment hygiene, not a code defect.** This review checkout carries
`container/agent-runner/node_modules` as a symlink to
`/Users/xbohdpukc/dev/NanoClaw/...`. `.gitignore`'s `node_modules/` pattern does
not match a symlink, so it shows as untracked and would make
`scripts/build-release.mjs:19-28` (`--untracked-files=all`) refuse to package. It
must not exist in the checkout that builds the release. The production checkout
has a real directory there and is unaffected.

## What the repair gets right

- The rejection carries the literal violation list, so the correction turn is
  actionable rather than a guess.
- Feedback is directory-derived and container-addressed end to end; there is no
  legacy untargeted fallback on this path.
- The preflight neither widens nor narrows what is blocked — it only moves the
  same verdict earlier and adds the missing feedback leg.
- The container tool result no longer asserts an outcome it cannot observe, and
  `groups/sales/CLAUDE.md:21` / `groups/sales/WORKFLOWS.md:105-112` now describe
  the queue acknowledgement accurately.
- Documentation changes in `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, and
  `docs/PROJECT-MAP.md` match the implemented behaviour; the continuity check
  passes.

## Residual risks

1. **Rejection loop is unbounded.** A model that cannot self-correct the flagged
   phrase can cycle card → reject → repost indefinitely, posting a visible
   `[APPROVAL CARD REJECTED]` into the operator's thread each time. The
   malformed path had the same shape, but content violations are far more common
   than parse failures, so the surface is now materially wider. No counter
   exists in `src/ipc.ts`. Suggest a per-container/per-lead consecutive-rejection
   cap that escalates to chief.
2. **F1 until fixed:** a blocked Sales turn in a thread can go silent.
3. **F3 until fixed:** an overlong card leaves the agent with no failure signal.
4. `docs/ENGINEERING-CHANGELOG.md` is untouched. `CLAUDE.md` requires it in the
   same change at handoff/completion; the row is still `in_progress`, so the
   continuity check does not yet block, but the entry is owed before handoff.

## Owner decisions

- **D1 — scope of F3.** Close the overlong-card feedback gap inside
  NC-20260806-001 (add the length predicate to the IPC preflight so the same
  targeted rejection fires), or track it as a separate `NC-` task with the
  transport-only rejection accepted meanwhile.
- **D2 — F1 remedy shape.** State-derived suppression (recommended; the host has
  ground truth) versus keeping the text predicate with a blocking-signal veto.
  This decides whether R1 of the next round is a small patch or a change to how
  `processGroupMessages` tracks per-run card outcomes.
- **D3 — activation.** Whether to force-recycle running Sales containers at
  activation so the new tool string and runner source take effect immediately,
  or let them age out naturally (up to the 420s wrapper idle timeout plus any
  in-flight work).
- **D4 — live verification.** The `docs/ACTIVE-WORK.md` next action offers "one
  non-customer rejection canary or the next natural rejection". A canary proves
  the correction turn now; waiting proves it on real traffic. Recommend the
  canary — the correction turn is the whole point of the change and nothing in
  the test suite exercises a real container round-trip.
- **D5 — convergence record.** `docs/reports/NC-20260806-001-CONVERGENCE-STATE.md`
  still reads "Latest Claude response: pending" and "Current Claude session
  UUID: pending recovery". This review is scoped to writing only this artifact,
  so those two rows need updating by the owner or Codex.

## Cost

Review elapsed 2026-08-06T21:45:45Z → 2026-08-06T21:54:29Z (~9 minutes),
single Claude session, no subagents. Independent execution: 1 typecheck,
4 test invocations (196 + 28 + 505 host/runner/gate tests), 1 continuity check,
2 behavioural probes against live modules.
