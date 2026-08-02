# NC-20260802-003/006 — Claude C5 implementation review R2

- Task IDs: `NC-20260802-003` (release activation), `NC-20260802-006` (Sales
  Slack work-item containment)
- Reviewer: Claude Code (Opus 5)
- Request: `docs/reports/NC-20260802-003-CODEX-REQUEST-R2.md`
- Prior review: `docs/reports/NC-20260802-003-CLAUDE-ARCHITECTURE-REVIEW-R1.md`
- Worktree: `/private/tmp/nanoclaw-sequence.oUOHVX/worktree`
- Branch/base: `codex/nc-20260802-003-company-os-sequence` @ `0f202249b79a02823225a9b03eb6ed2873b5a4cc`
- Class: C0 read-only review. No implementation or shared continuity file was
  modified; no stage, commit, deploy, Slack post, Heartbeat action, plist edit,
  or launchctl call occurred.
- Date: 2026-08-02T18:45Z

## 1. Verdict

**CHANGES REQUIRED.**

The verdict is driven entirely by `NC-20260802-006`. Two demonstrated
regressions are introduced on live Sales paths, both empirically confirmed
below against the tracked card formats and the shipped derivation functions.

Per slice:

| Slice | Verdict | Blocking |
| --- | --- | --- |
| `NC-20260802-003` release activation | **APPROVE WITH FOLLOW-UPS** | none |
| `NC-20260802-006` Sales containment | **CHANGES REQUIRED** | F1, F2 |

`NC-20260802-003` is materially correct. Every property in the request is
implemented and holds under inspection, and all four R1 findings against this
slice (P0-1, P0-2, P1-1, P1-2, P1-3) are genuinely closed — see §2. The five
follow-ups in §4 are hardening and operability items, not defects in the stated
contract.

`NC-20260802-006` correctly fixes the problem it set out to fix. But the
broadcast suppression is keyed on `hostDerivedAnchor` (every lead-anchored
post) rather than on "this post belongs to an open handoff-initiated cycle",
and the anchor is a single mutable pointer per lead. Those two choices produce
F1 and F2. Both are host-side and narrowly fixable.

## 2. NC-003 properties — proved

Each property from the request, with the evidence that settles it.

**Candidate derived from the installed plist; exactly three fields change.**
Holds. `readPlist()` (`src/release-activation-exec.ts:60-69`) decodes the
*installed* file via `plutil -convert json`; the tracked
`setup/launchd/com.nanoclaw.plist` is never read. `renderCandidate()`
(`src/release-activation.ts:133-150`) deep-clones the installed dictionary,
mutates only the three fields, and calls `assertOnlyActivationChanges()` on its
own diff before returning — so the guarantee is enforced at render time, not
only at review time. `diffCandidate()` (`:85-121`) is a full recursive
structural diff, so a fourth change anywhere in the tree is caught.
`src/release-activation.test.ts:49-70` proves both directions, including that
`ProgramArguments[0]`, `WorkingDirectory`, and
`MAX_CONCURRENT_CONTAINERS` survive untouched. **This closes R1 P0-1**: the
machine-local Node path recorded in `docs/ACTIVE-WORK.md:153-158` can no longer
be reverted by activation.

**Preflight order before any mutation.** Holds, and the ordering is correct.
`src/release-activation-exec.ts:215-229` resolves both paths through
`realpathSync`, lints the installed plist, verifies the *actual* interpreter
version against `manifest.nodePin` by executing it (`assertInterpreter`,
`:92-99`), verifies the **target** bundle and then the **current/rollback**
bundle with the release's own verifier under `--runtime` (`:101-107`), and only
then reads current health. **This closes R1 P1-1 and P1-2** — the interpreter
is probed rather than assumed, and the rollback target is proved to still
verify rather than merely to exist.

**Dry-run cannot mutate or call launchctl.** Holds. The `if (!options.apply)`
return at `:252-259` precedes every `launchctl` invocation and every write to
`plistPath`; the candidate is rendered into `os.tmpdir()` for dry runs
(`:239-242`). `src/release-activation-exec.test.ts:118-135` asserts both the
byte-unchanged plist and zero `/bin/launchctl` calls. I re-ran it (§6).

**Apply: host confirmation, rollback artifact, atomic replace, one bounded
cycle, health proof.** Holds. `--apply` requires `confirmHost === os.hostname()`
(`:231-235`) and the CLI prints the required hostname in its usage text
(`scripts/activate-release.mjs:23`). The rollback copy is taken with
`COPYFILE_EXCL` and independently linted (`:270-271`). `atomicReplace()`
(`:159-173`) writes a sibling temp file, lints it, and `rename(2)`s within the
same directory. Exactly one `unload` and one `load` occur, with a bounded wait
for the prior PID *and* the health listener to be released in between
(`:277-283`). **This closes R1 P1-3** — the `unload`/`load` race and the
`:8088` contention are now explicitly waited out rather than assumed.
`src/release-activation-exec.test.ts:137-165` asserts exactly one unload and
one load.

**Post-replacement failure restores the exact plist and attempts one bounded
rollback cycle.** Holds as stated. `:291-313` restores from the byte copy and
issues one `unload`/`load`. `src/release-activation-exec.test.ts:167-195`
asserts the restored file is byte-identical to the original and that exactly one
rollback artifact remains. Two gaps in the *reporting* of that path are F6.

**Startup fails closed outside the verified release; `/health` proves the
activated root.** Holds, in the strong form. `src/release-integrity.ts:206-212`
computes `releaseRoot` as `dirname(distDir)` where `distDir` derives from
`import.meta.url` — so the check compares the declared `NANOCLAW_CODE_ROOT`
against the directory the *executing artifact actually lives in*, and throws
when `requireManifest` is set and they differ. `codeRoot` and
`codeRootMatchesRelease` are on `ReleaseIdentity` (`:29-30`) and therefore in
`/health` via `src/index.ts:1431`. `assertHealthyRelease()`
(`src/release-activation.ts:184-206`) requires all three of verified, commit,
and code root before activation is called successful.

**This closes R1 P0-2**, which was the most consequential NC-003 finding: the
half of the pair that used to fail silently (`src/container-runner.ts:138`,
`process.env.NANOCLAW_CODE_ROOT || projectRoot`) is now both loud at startup and
externally observable.

One design detail worth crediting explicitly: `assertHealthyRollbackRelease()`
(`:213-240`) accepts a *pre-NC-003* running release that cannot report
`codeRoot`, but only when the field is absent — a present-and-wrong value still
fails. That is the correct transitional shape for the first activation on top of
the currently deployed `23ffb07`, and it does not weaken steady state.

`docs/RELEASE-INTEGRITY.md` is also honest about the tool's limits — "The
command does not replace the channel, listener, prompt-hash, or task-specific
live checks after activation." There is no doc/implementation overclaim here.

## 3. NC-006 blocking findings

### F1 — High — Daily `[FOLLOW-UP]` approval cards stop reaching the channel and land in an unbounded-age thread

**Severity:** High. Silently hides an approval-gated card on a daily automated
path.

**Evidence.**

- `src/channels/slack.ts:812` — `if (anchoredReply && !hostDerivedAnchor)
  baseOpts.reply_broadcast = true;`. Broadcast is suppressed for **every**
  lead-anchored reply, not only for posts inside an open handoff cycle.
- `src/channels/slack.ts:776-781` — when `hostDerivedAnchor` is true the generic
  `SLACK_THREAD_TTL_MS` rollover is skipped entirely, so an arbitrarily old
  anchor is reused.
- `src/lead-thread-key.ts:88` — `ENTRY_SUBJECT_RE =
  /^\s*(?:\[[^\]]*\]\s*)*(?:Lead|Entry)\s*#(\d+)\b/i` consumes leading bracket
  groups, so a bracketed card prefix does not prevent a subject-position match.
- `groups/sales/WORKFLOWS.md:278` — the tracked follow-up card format is
  `[FOLLOW-UP #{follow_up_count + 1}] Lead #{pipeline_entry_id}`.
- `src/followup-drop.ts:68` confirms that same shape is what the host's 👎
  drop handler parses, so these cards are approval-bearing control surfaces.

**Reproduced.** Executing the shipped derivation against the tracked card
format:

```
followupCard.entryRef = 243          # [FOLLOW-UP #2] Lead #243 - Renee Carr
```

`deriveLeadEntryRef` returns the entry id, so `deriveLeadKey`
(`src/channels/slack.ts:689-711`) resolves it to `lead:{email}` and
`hostDerivedAnchor` (`:751`) is true.

**Failure trace.** The daily follow-up cron produces
`[FOLLOW-UP #2] Lead #243 — Renee Carr` two weeks after that lead's original
handoff thread went quiet. `deriveLeadEntryRef` → 243 → `resolveLeadEmail` →
`lead:renee@…`. `startsSalesWork` is false (no `*→sales` token), an anchor
exists, `hostDerivedAnchor` is true, so `:776-781` reuses the two-week-old root
without a TTL check and `:812` suppresses the broadcast. The card is posted as a
quiet reply inside a collapsed, scrolled-off thread. The operator sees nothing in
`#gru-sales`, never reacts ✅ or 👎, the nudge is neither sent nor dropped, and
the same lead is re-carded the next day into the same invisible thread.

Before this change the identical card took the `anchoredReply` path with
`reply_broadcast = true` and appeared in the channel timeline. This is a
regression, not a pre-existing gap.

The comment this change deletes from `src/channels/slack.ts` (visible in
`git diff HEAD -- src/channels/slack.ts`) documents that this precise outcome —
a lead-anchored reply in a collapsed thread that never surfaces — already cost a
real customer email once (Oana Tue, Entry 938, 2026-07-28T12:27Z). It also
records that suppressing the broadcast for lead threads had been tried before,
on 2026-07-28, and was reverted for this reason. The new rationale ("the inbound
handoff is the only
channel-root/timeline item") is sound for handoff-initiated work and simply does
not cover cron-initiated work.

**Smallest safe correction.** Treat a scheduled Sales card as its own received
work item rather than as a reply inside someone else's. Generalize the predicate
at `src/lead-thread-key.ts:40-46` from "inbound handoff" to "starts a Sales work
item", matching `[HANDOFF: *→sales]` **or** a leading `[FOLLOW-UP…]` /
`[COLD…]` card. `src/channels/slack.ts:738` then rolls the anchor and posts a
fresh visible root for the daily card, and its own draft/approval cycle stays
contained underneath — the same contract, applied to the other producer.

If the owner prefers to keep follow-ups inside the lead's existing thread, the
alternative is to record the anchor's origin (`inbound_handoff` vs other) on
`slack_thread_anchors` and suppress broadcast at `:812` only when the current
root is handoff-originated. That is a schema change and strictly larger.

### F2 — High — With two open work items for one lead, a human reply in the older thread is answered in the newer thread

This is the scenario the request asked to analyze specifically.

**Severity:** High. Directly contradicts the operator contract this slice adds.

**Evidence.**

- `src/channels/slack.ts:768-773` — a new `*→sales` handoff calls `keyToRoll`,
  and `rollThreadAnchor` (`src/db.ts:959-973`) does
  `DO UPDATE SET thread_ts = excluded.thread_ts`. The prior root is
  **overwritten, not retained**. There is exactly one anchor per
  `(channel, lead)`.
- `src/channels/slack.ts:760-761` — for any lead-bearing message
  `effectiveThreadTs` is reset to `undefined`, discarding the caller's
  `threadTs`.
- `src/channels/slack.ts:776-781` — the post is then placed under
  `existing.threadTs`, i.e. whatever the anchor currently points at.

**Proved by two tests already in the suite, both passing.**

1. `src/channels/slack.test.ts:1633-1654` ("makes each new inbound Sales handoff
   a fresh root and repoints the lead anchor") asserts at `:1648-1652`
   `rollThreadAnchor(channel, 'lead:oana…', '1704067200.000100')` — the anchor
   now points at work item #2.
2. `src/channels/slack.test.ts:1674-1697` ("re-applies Sales containment when a
   queued draft flushes after reconnect") passes
   `threadTs: '1785510996.909199'` (`:1683`) and asserts at `:1691` that the
   post lands on `'1785230544.590929'` — an explicitly supplied thread is
   overridden by the current anchor.

Compose them: after handoff #2 the anchor is root2, and any subsequent
lead-bearing Sales output is forced to root2 regardless of the thread it is
answering.

**Failure trace.** Renee sends two separate inquiries an hour apart. Mailman
raises `[HANDOFF: mailman→sales]` twice, producing root1 and root2; the anchor
ends on root2. The operator opens root1 and replies "shorten this and drop the
pricing paragraph". The host routes that reply to Sales with root1's thread.
Sales emits the revised `[SALES REVIEW]` draft. `deriveLeadKey` →
`lead:renee@…` → `hostDerivedAnchor` → the revision posts under **root2**,
beneath the unrelated second inquiry. The operator's question in root1 gets no
visible answer; the revised draft for inquiry #1 appears under inquiry #2, where
approving it sends the wrong reply against the wrong context.

**Contract classification.** This violates the operator contract added by this
same change. `groups/sales/CLAUDE.md` (as modified) states: "If the same lead
sends a later inbound message, that later handoff becomes a new root with its
own contained response cycle." Two cycles are created but only one can receive
output, so the older cycle is not contained — it is silently redirected.

**Smallest host-verifiable fix.** Keep prior roots for the key and accept an
incoming `threadTs` **only** when the host itself recorded it as a root for that
same `(channel, thread_key)`. Concretely: on roll, retain the superseded
`thread_ts` (a `previous_thread_ts` column on `slack_thread_anchors`, or a small
append-only anchor-history table), and at `src/channels/slack.ts:760` accept
`opts.threadTs` when it matches a recorded root for this key instead of
discarding it. This preserves the rule that a model-retyped timestamp is never
authority — the accepted value must match a timestamp the *host* wrote — while
containing each cycle. It is testable purely host-side.

If the owner accepts the redirect as a residual instead, `groups/sales/CLAUDE.md`
and `groups/inbox/CLAUDE.md` must be corrected to say so, because they currently
promise the opposite.

## 4. Non-blocking findings

### F3 — Medium — A multi-chunk inbound handoff that fails after chunk 1 produces a duplicate channel root

**Evidence.** `src/channels/slack.ts:839-872` posts chunk 1, records/rolls the
anchor, and pins later chunks under it. `:879-885` catches a failure and
re-queues the **entire original text**. `:768-773` makes `startsSalesWork` roll
the anchor again on the retry.

**Trace.** A >4,000-character handoff (handoffs embed the original email) posts
chunk 1 as root1 and rolls the anchor to root1; chunk 2 raises a Slack error;
the whole text is re-queued; the next flush sees `startsSalesWork` and an
existing anchor, rolls again, and posts root2 with all chunks. Result: two
channel roots for one work item, chunk 1's content duplicated, and root1
orphaned.

Before this change the retry took the `keyToTouch` path and produced duplicated
content inside a single thread. The blast radius is new; the duplication is not.

**Correction.** On the catch path, when chunks were already posted, re-queue
with `opts.threadTs` set to the established root and the work-item-start
behaviour suppressed — or re-queue only the untransmitted remainder.

### F4 — Medium — `isInboundSalesHandoff` is unanchored and ungated by author, so a Sales message that merely mentions the token creates a spurious root

**Evidence.** `src/lead-thread-key.ts:40-41` —
`/\[HANDOFF:\s*[a-z0-9_-]+\s*(?:→|->)\s*sales\]/i` has no start-of-string or
start-of-line anchor, and `src/channels/slack.ts:738` applies it to every
outbound message regardless of `fromGroup`.

**Reproduced** at the function boundary:

```
quotedCard.isInboundSalesHandoff = true    # [SALES REVIEW] Lead #243 … "Original was [HANDOFF: mailman->sales]"
quotedCard.leadKey = lead:renee@example.com
```

Both conditions at `src/channels/slack.ts:766-773` are therefore satisfied and
the card rolls the anchor into a new channel root.

**Classification: residual risk, not a demonstrated production defect.** I have
no live Sales message containing the token — `groups/sales/CLAUDE.md:7` tells
the agent to emit only structured tokens and not to narrate. But this is exactly
the failure class of the 2026-07-22 sales review card misroute, where a card
footer matched the routing `HANDOFF_RE`, so the precedent for accidental matches
in Sales output is real.

**Correction (one line, cheap).** Require the token at the start of the message
and require `fromGroup !== 'sales'`. A genuine inbound handoff is posted by the
host on behalf of the source group and satisfies both; a Sales-authored quote
satisfies neither.

### F5 — Medium — No mutual exclusion between concurrent activators

The request asks about concurrent activators specifically. The stated property —
"creates an exclusive exact rollback artifact" — is literally satisfied by
`COPYFILE_EXCL` at `src/release-activation-exec.ts:270`, but it provides no
activation lock: `rollbackName()` (`:198-201`) embeds an ISO timestamp with
millisecond precision, so two real activators produce different filenames and
`EXCL` never fires.

**Trace.** Two `--apply` runs start seconds apart. Both read the same installed
plist, both plan `old → new`, both capture distinct rollback copies, both
`atomicReplace`, and both issue `unload`/`load`. The second `unload` can tear
down the daemon the first just proved healthy; each `waitUntil` observes the
other's PID transitions; either can conclude failure and restore *its* rollback
copy over the other's candidate. The end state is not determined by either run's
logic.

**Correction.** Take an exclusive fixed-name lock for the whole apply —
`fs.openSync(`${plistPath}.activation.lock`, 'wx')`, PID written inside, removed
in a `finally`, with a stale-lock message naming the holding PID.

### F6 — Medium — Rollback outcome is neither verified nor reported, and a failing rollback `load` masks the original error

**Evidence.** `src/release-activation-exec.ts:312` issues the rollback `load`
**without** `allowFailure`, and `:314` (`throw error`) is unreachable if it
throws. There is no health assertion after the rollback load, and because the
function throws rather than returns, no `ActivationResult` carries the rollback
path or status.

**Trace.** The candidate fails health; rollback restores the plist and reloads;
`launchctl load` fails because the service is still in a KeepAlive backoff. The
operator receives a `launchctl load … failed` message with no indication of
*why activation failed*, no rollback path, and no statement of whether
production is up. A failed rollback and a successful one are indistinguishable
from the output.

**Correction.** Wrap `:292-313` in its own try/catch; after the rollback load,
poll `assertHealthyRollbackRelease` once against `plan.current` with a bound;
attach `{rollbackPath, rollbackHealthy}` to the original error and always
rethrow the original.

### F7 — Medium — Activation is impossible when the daemon is already down or unhealthy

**Evidence.** `src/release-activation-exec.ts:226-229` requires the *currently
running* service to answer `/health` and match the installed plist's identity;
`:265-267` throws `installed launchd service has no running PID` when
`launchctl print` reports none.

**Trace.** A bad activation leaves the daemon in a KeepAlive crash loop.
`launchctl print gui/<uid>/com.nanoclaw` shows no `pid =` line, so `currentPid`
returns null and the tool refuses before doing anything. The health precondition
would have refused first anyway. The only remaining recovery is hand-editing the
installed plist — precisely the practice `docs/RELEASE-INTEGRITY.md` exists to
eliminate.

This is defensible fail-closed design, and the rollback path covers the
same-run case. It is a gap only for a *later* session, which is the realistic
incident shape. Whether to close it is an owner decision (§7).

**Correction if accepted.** An explicit `--recover-from-down` that skips the
current-health and prior-PID preconditions while still requiring both bundle
verifications, the interpreter probe, the exact `--confirm-host`, and full
target-health proof. Otherwise, document the manual recovery path in
`docs/RELEASE-INTEGRITY.md` so it is not discovered mid-incident.

### F8 — Low — `listenerPids` fails open

`src/release-activation-exec.ts:134-144` calls `lsof` with `allowFailure: true`,
which is required because `lsof` exits non-zero on the normal empty-result case
— but that also maps a missing binary, a permission denial, or any other failure
to "no listeners". The wait at `:278-282` then degrades to the PID check alone.
Practical risk is low because the listener belongs to the same process as
`priorPid`. **Correction:** probe `lsof` once up front and fail closed if it
cannot execute at all.

### F9 — Low — `plan.current.releaseDir` is resolved but not realpath-resolved

`src/release-activation.ts:162` uses `path.resolve` while
`src/release-integrity.ts:33-36` normalizes through `realpathSync`, and
`options.releaseDir` *is* realpath'd at `src/release-activation-exec.ts:215`. If
the installed `NANOCLAW_CODE_ROOT` ever contains a symlink component, once the
running release reports `codeRoot`, `assertHealthyRollbackRelease` compares a
realpath against a non-realpath and refuses every future activation.
**Correction:** realpath it, matching line 215.

### F10 — Low — Same-directory reactivation fails with an unexplained message

`assertOnlyActivationChanges` (`src/release-activation.ts:123-131`) demands
exactly three diffs, so re-extracting a new commit into the *same* directory
yields one diff and aborts with `must change exactly …; got
EnvironmentVariables.NANOCLAW_EXPECTED_RELEASE_COMMIT`. The constraint is correct
and `docs/RELEASE-INTEGRITY.md` already says "Never extract over the active
release"; only the error text fails to connect the two. Cosmetic.

### F11 — Low, accepted residual — real plist XML rendering is not unit-covered

`src/release-activation-exec.test.ts:13-25` mocks `execFileSync`, so
`plutil -convert xml1` never runs and the applied test parses the installed file
as JSON (`:155`). Real XML conversion and candidate linting are exercised only
live. Related and benign: `plutil -convert json` errors on plists containing
`<data>` or `<date>`, so `readPlist` fails closed rather than silently
retyping those values through the JSON round-trip — worth one sentence in the
runbook, since it would present as an opaque `plutil` error.

### F12 — Low, pre-existing — a queued message only flushes on reconnect

`flushOutgoingQueue` is called only from `connect()`
(`src/channels/slack.ts:527-530`) and `recreateApp()` (`:631-637`). A send that
fails for a non-connection reason while `connected` stays true is re-queued at
`:880` and then waits for the next reconnect. Unchanged by this slice; noting it
because F3's correction touches the same requeue path. Also: the flush now runs
`deriveLeadKey` — potentially a business-DB lookup — per queued item inside
`connect()`, so a slow resolver delays channel startup. Bounded by the
`splice(0)` snapshot, which is the right call.

## 5. NC-006 properties — settled

| Property | Result |
| --- | --- |
| New inbound `[HANDOFF: *→sales]` (Unicode or ASCII) is the only top-level post for that work item and rolls the anchor | **Holds** — `src/channels/slack.ts:768-773`; `src/lead-thread-key.ts:40-46`; tested at `slack.test.ts:1633-1654`, `lead-thread-key.test.ts:86-102`. Weakened by F4 (over-matching), not by under-matching. |
| Drafts/revisions/questions/approvals/outbound handoffs resolve quietly inside the root | **Holds for handoff-initiated work**; **fails for cron-initiated work** (F1). |
| No `reply_broadcast` for lead work | Holds — `:812`. This is the mechanism of F1. |
| No generic TTL rollover for lead anchors | Holds — `:776-781`. Also contributes to F1 by removing the last age bound. |
| No reliance on a model-retyped timestamp | Holds — `:760-761` discards `threadTs` for every lead-bearing post; tested with `threadTs: 'wrong-source-channel-ts'` at `slack.test.ts:1642`. This is also the mechanism of F2. |
| Queued message re-enters the same routing logic on reconnect | **Holds** — `flushOutgoingQueue` now calls `sendMessage` (`:1385-1405`), and `connected = true` precedes the flush on both paths (`:527-530`, `:631-637`). Tested at `slack.test.ts:1674-1697`. |
| A failed flush is bounded and leaves the item queued | **Holds** — `splice(0)` snapshots the batch (`:1398`) so a persistent failure cannot spin inside `connect()`; failures re-queue at `:880`. Ordering is not preserved across a partial failure (a failed item returns to the tail); losing an item — the prior behaviour, where `shift()` discarded it — is fixed. |
| Two simultaneous work items for one lead | **Fails** — F2. |
| Handoff missing an address | Degrades safely and is documented: `leadKey` is undefined, no anchor is recorded, the handoff posts at channel root, and a later card carrying the address becomes a second root. `groups/inbox/CLAUDE.md` states this consequence explicitly. Accepted residual. |
| Multi-chunk posts | **Partial** — chunk pinning is correct on the success path (`:852-867`); the failure path produces a duplicate root (F3). |
| Send failures | Bounded and non-lossy; see F12. |
| Anchor record/roll races | `recordThreadAnchor` is `ON CONFLICT DO NOTHING` and race-safe (`src/db.ts:940-957`). `rollThreadAnchor` is last-write-wins (`:959-973`); two concurrent handoffs for one lead now leave one root orphaned. Previously unreachable in practice because rolls required a stale anchor; now every handoff rolls. Low frequency, same corrective shape as F2. |
| Wrong/source-channel timestamp | **Holds** — tested. |

## 6. Independent verification

Run in this worktree; no file was modified.

| Check | Result | Interpretation |
| --- | --- | --- |
| `vitest run src/release-activation.test.ts src/release-activation-exec.test.ts src/release-integrity.test.ts` | **pass, 3 files / 19 tests** | Exactly reproduces Codex's focused release suite. |
| `vitest run src/channels/slack.test.ts src/lead-thread-key.test.ts` | **pass, 2 files / 114 tests** | Codex reports 3 files / 127 for this group; I could not identify the third file, so 13 tests are unreproduced. |
| Full suite (`vitest run`) | **143 files / 1,795 tests discovered; 12 files / 144 failed in my session** | File and test counts match Codex exactly. Every failure is environmental — see below. |
| Targeted behavioural probe of `lead-thread-key` against tracked card formats | ran | Confirmed F1 and F4 (§3, §4). |

**The 144 failures are the interpreter, not the change.** My shell's default
`node` is v26.5.0 while `.nvmrc` pins 22.23.2, and I could not invoke the pinned
binary directly under this session's execution policy. The decisive evidence:
`setup/platform.test.ts > getNodeMajorVersion > returns the pinned Node 22 major`
fails, and every other failure is `_initTestDatabase` (`src/db.ts:362`) raising
`ERR_DLOPEN_FAILED` from a `better-sqlite3` binary built for a different ABI.
This is the condition already recorded at `docs/PROJECT-MAP.md:822-823`. No
failing file touches `release-activation*`, `release-integrity`, `slack`, or
`lead-thread-key`.

I therefore **neither confirm nor refute** Codex's green full-suite claim. The
counts corroborate it; the interpreter prevented reproduction.

**Reproducibility note (not a defect).** `node_modules` in this worktree is a
symlink to `/private/tmp/nanoclaw-deploy-20260802.pEhLKh/release-src/node_modules`.
The dependency tree is not self-contained and will vanish when that scratch
directory is cleaned, which would make this branch unbuildable without a
reinstall. Worth recording alongside the verification evidence.

## 7. Owner decisions required

Four. The first two gate the NC-006 commit.

1. **F1 correction shape.** Make `[FOLLOW-UP…]` / `[COLD…]` cards their own
   visible work-item roots (smallest, no schema change), or add an anchor-origin
   column and suppress broadcast only for handoff-originated roots, or accept
   the visibility loss and remove the approval expectation from those cards.
   Doing nothing means a daily approval-gated card is invisible.

2. **F2: fix or document.** Retain prior roots per lead key and accept a
   host-recorded `threadTs` (recommended — narrow, host-verifiable, preserves
   the no-retyped-timestamp rule), or accept the cross-work-item redirect as a
   residual. If accepted, `groups/sales/CLAUDE.md` and `groups/inbox/CLAUDE.md`
   must be corrected, because they currently promise each later handoff gets
   "its own contained response cycle".

3. **F7: `--recover-from-down`.** Add the flag now, or accept that recovering a
   crash-looping daemon requires manual plist editing and document that path in
   `docs/RELEASE-INTEGRITY.md` before the first production activation.

4. **Carry-over, out of R2 scope: NC-004 submission identity.**
   `docs/reports/NC-20260802-004-HEARTBEAT-ID-OBSERVATION.md` closes R1's
   Decision 2 — the live titles match `references/decision-rules.md` exactly,
   confirming `~/dev/grading/registry.json` is the drifted copy — and correctly
   restates R1 Decision 1 as unresolved with three options. Its recommendation
   (option 1, bounded read-only discovery of the backing record ID) is the right
   one: option 2 reintroduces the composite identity `docs/ACTIVE-WORK.md:80-82`
   forbids, under a name that hides it. NC-004/005 being dark is not a defect in
   these two slices.

R1's remaining open item is unaffected and still stands: the eight canonical
titles are now *observed* but not yet *tracked* in a Git-versioned, release-
bundled mapping file, and `~/dev/grading` remains outside every provenance
guarantee in `docs/RELEASE-INTEGRITY.md`.

## 8. Scope, limits, and elapsed time

- Read-only. The only file created is this report.
- I did not stage, commit, deploy, post to Slack, touch Heartbeat, edit an
  installed plist, or run `launchctl`. The original shared checkout was not
  accessed.
- Verification limits, stated plainly: the full suite was not reproduced under
  the pinned interpreter (§6); `plutil` XML rendering and every `launchctl`
  interaction are mocked in the unit tests and therefore unproven outside a live
  run; F4 is confirmed at the function boundary but not against a captured live
  Sales message; F2's composed trace is derived from two passing tests rather
  than from a single end-to-end test, because none exists — adding one is the
  natural first step of its fix.
- Elapsed: 2026-08-02T18:33Z → 18:45Z, roughly 12 minutes, single session, no
  subagents.
