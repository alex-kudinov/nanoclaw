# NC-20260802-009 — Claude C5 blocker-closure review R2

## Reviewer, scope, and limits

- Reviewer: Claude Code, model `claude-opus-5`, session
  `b361d68b-688c-4dd0-bba0-a43188673962` (same session as R1)
- Review root: `/private/tmp/nanoclaw-sequence.oUOHVX/worktree`
- Base commit: `177de7b791f3668df4ab91ee7bedb597c3e05472`
- Delta reviewed: full current working tree — 30 paths,
  `2162 insertions(+), 179 deletions(-)`; new since R1:
  `src/email-transport-canary.ts` (+ test), `src/slack-approval.ts`,
  `src/channels/slack.ts`, `groups/chief/CLAUDE.md`, `groups/sales/CLAUDE.md`,
  `groups/sales/WORKFLOWS.md`
- Prior report: `docs/reports/NC-20260802-009-CLAUDE-C5-REVIEW-R1.md`
  (`CHANGES REQUIRED`)
- Elapsed: request artifact mtime `2026-08-02T22:46:16Z` → this report,
  ≈ 22 minutes wall clock. Cost is not instrumented in this session; the round
  is one context window of reading plus four shell verification batches.

Read-only limits observed:

- The only file created is this report. No implementation, continuity, prompt,
  or configuration file was edited.
- Nothing staged, committed, packaged, activated, or restarted. No Slack post,
  no email, no production database read or write.
- `.env*`, OAuth/token material, `~/.claude` settings, `store/`, and database
  dumps were not read. `/Users/xbohdpukc/dev/NanoClaw` was not touched.
- One scratch file outside the worktree (`/tmp/nc009-r2-probe.mjs`) replays the
  delta's own SQL against a throwaway in-memory database. No project file, no
  live data.
- Local execution policy still blocks `/opt/homebrew/opt/node@22/bin/node`; the
  runtime here is Node `v26.5.0`. I corroborate but do not reproduce the pinned
  Node 22 green suite.

---

## Verdict

**APPROVE WITH FOLLOW-UPS**

All four R1 blockers are closed, and I verified the three durable ones
executably against the delta's own SQL rather than trusting the test names.
P0-1 is closed at the state-machine level, not merely papered over: an
interrupted action now terminates in `uncertain`, which the claim predicate
cannot reopen, while a never-started approval still recovers through
`attention_required`. P1-2 is closed with the exact `COALESCE` semantics
required — legacy rows gain an identity, existing identities are immutable.
The transport canary is genuinely isolated and honestly described.

Two residuals remain, both introduced by the P0-2 fix rather than left over
from R1. Neither can send a wrong email or a duplicate; both are approval-path
ambiguities that deserve a `planned` row before the next email slice, and one
of them is a scope widening the delta does not document. They do not block
commit, build, activation, or the canary.

---

## Blocker-by-blocker disposition

### P0-1 — interrupted action re-opened the Gmail boundary → **CLOSED**

`markPendingSendAlerted` (`src/db.ts:1717-1746`) now runs inside a transaction,
maps `executing → uncertain` with code `gmail_receipt_reconciliation_required`
and everything else to `attention_required`, guards on
`alerted_at IS NULL AND state NOT IN ('confirmed','blocked','uncertain')`, and
appends the event only when `result.changes > 0`. `claimEmailActionExecution`
still refuses `uncertain` at `src/db.ts:1462-1468` and its executable set
(`src/db.ts:1495`) does not contain it. `alertText` branches on
`row.state === 'executing'` (`src/send-watchdog.ts:329-337`) and says the email
"MAY have gone out. Do not resend or create a new action until an operator
reconciles the Gmail Sent mailbox and the stored action ledger." The alert is
built before `markAlerted` runs (`src/send-watchdog.ts:534-535`), so the branch
sees the real pre-transition state.

Replaying the exact new SQL — the R1 reproduction, re-run:

```
A) crash after claim -- the exact R1 P0-1 scenario
   claim                : 1 -> executing
   overdue alert        : changes 1 -> {"state":"uncertain","last_error_code":"gmail_receipt_reconciliation_required"}
   RE-claim after alert : 0  (0 = P0-1 CLOSED) -> uncertain

B) never-started approval must stay recoverable
   overdue alert        : changes 1 -> attention_required
   re-claim             : 1  (1 = still sendable) -> executing
```

Case B matters as much as case A: the fix distinguishes "never reached Gmail"
from "may have reached Gmail" instead of freezing both. Tests exist at
`src/db.test.ts:195` ("turns an overdue executing action uncertain without
reopening Gmail") and `:237` ("does not append a false alert event after Gmail
already confirmed").

### P0-2 — approvals lost outside the reaction path → **CLOSED, with residual N1/N2**

Four separate mechanisms now cover what R1 found silent:

1. **Typed approval.** `isExplicitApprovalText` (`src/slack-approval.ts:61-64`)
   accepts a bare check mark or exactly `approved` with optional terminal
   punctuation, nothing else. `src/channels/slack.ts:363-382` resolves the
   latest bot message in that same channel and thread, offers it to the
   approval listeners, and still falls through to the agent wake when no
   listener claims it.
2. **Malformed card.** `src/index.ts:1832-1845` blocks the action
   (`approval_card_unparseable`) and posts `🚫 [EMAIL APPROVAL NOT ARMED]` into
   the approval thread the moment a card yields no recipient or no content hash.
   The R1 "held forever with no explanation" path is gone.
3. **Boundary refusals.** `postToChief` is now hoisted above action resolution
   (`src/ipc.ts:674-694`), and all three pre-claim quarantine paths —
   invalid Action-ID, ambiguous match, unknown action, unbound send — post an
   `🚫 [EMAIL ACTION HELD]` line to Chief. R1's "posts nothing to any human"
   gap is closed.
4. **Prompts.** `groups/chief/CLAUDE.md:60` no longer says "✅ or 'Approved'"
   loosely; it names the check-mark or exact whole-message form in the draft's
   thread. `groups/sales/CLAUDE.md:62-64` distinguishes host approval from
   free-form feedback that merely contains the word.

Adversarial checks on the resolver, `getLatestBotMessageInThread`
(`src/db.ts:742-758`): it filters `chat_jid = ?`, `COALESCE(is_bot_message,0)
= 1`, and `(thread_ts = ? OR id = ?)`. So it **cannot** bind a draft from
another channel, another thread, or a human message. It **can** bind a
non-card bot message — see N1.

### P0-3 — canary / global test routing → **CLOSED**

`src/ipc.ts:898-911` checks `GMAIL_TEST_RECIPIENT` first inside the
`approvedAction?.actionId` block — before the content-hash check, before
`claimEmailActionExecution`, and before any Gmail call — blocks the action with
`global_test_routing_active`, and posts the reason into the approval thread.
The R1 failure mode (claim, redirect, no confirm, stuck `executing`) is
unreachable for an action-bound send.

The dedicated canary (`src/email-transport-canary.ts`) checks out against every
constraint in the request:

- no recipient argument; `main()` passes `GMAIL_MONITORED_EMAIL` only (`:142-155`);
- fixed host-authored subject and body (`:37-44`); no CC, no BCC anywhere;
- calls `getGmailClient()` directly, so it never enters `sendEmail`,
  `applyTestRouting`, `insertTrackingPixel`, `storeOutboundEmail`,
  `verifyPartyRecipient`, `observeConfirmedSend`, or any action/ledger write;
- requires a Gmail message **and** thread id, then re-reads the message and
  compares both (`:104-125`); a retrieval mismatch or failure raises an error
  that names the accepted ids and says "do not rerun blindly" — correct
  guidance after acceptance;
- gated on `NANOCLAW_EMAIL_CANARY_CONFIRM=NC-009-INTERNAL-TRANSPORT-CANARY`
  (`:137-141`);
- commit must be exactly 40 hex from `dist/release-manifest.json` (`:95-97`,
  `:145-152`), tying the canary to the activated release;
- stdout emits `recipientSha256`, never the address (`:129-132`);
- `main()` is guarded by an `import.meta.url === argv[1]` check (`:165-173`).

Reachability: the only references anywhere are the npm script
(`package.json:23`), the release gate's test entry, and
`docs/RELEASE-INTEGRITY.md:196-213`. It is not an IPC type, not a job, not a
scheduled task, and not in any group prompt — **no path to model input**.
`docs/RELEASE-INTEGRITY.md:206-213` and `docs/PROJECT-MAP.md:669-672` both state
plainly that it proves transport/OAuth only and not Party guards, business
logging, inbox placement, or the Sales/Mailman outcome.

### P1-2 — legacy rows could never gain an identity → **CLOSED**

`src/db.ts:1201` now reads
`action_id = COALESCE(pending_sends.action_id, excluded.action_id)`. Verified
both directions:

```
D) legacy NULL action_id on re-approval (P1-2)
   legacy row upgraded  : YES (P1-2 CLOSED)
   identity immutable   : YES
```

The activation precondition at `docs/RELEASE-INTEGRITY.md:108-116` is correctly
two-tiered, and I checked it is executable as written:

```
E) first-activation drain precondition (aggregate only, old schema)
   SELECT COUNT(*) on pre-action schema : 0 (no customer column read)
   state-filtered drain on old schema   : FAILS -> no such column: state
```

That is exactly why the doc requires an aggregate-empty check *before* the
first NC-009 activation and the state-filtered drain only on later releases. It
reads no customer column. The instruction that an `executing` row must be
reconciled to `confirmed` or `uncertain` — "never retried or deleted" — matches
the state machine.

### P1-1 — Action-ID never reached the approving agent → **CLOSED**

`src/index.ts:1849-1854` posts `[EMAIL ACTION] Action-ID: …` into
`approvalThreadTs` and awaits it inside the listener, which
`src/channels/slack.ts:369-376` (typed) and the reaction loop both run before
`onMessage` — so the ID is in Slack before the agent wake. `getThreadContext`
(`src/db.ts`) applies no `from_group` filter, so the agent reading its approval
thread sees the line even though it is tagged with the agent's own group.
`groups/sales/WORKFLOWS.md:135` and `:311` add the `Action-ID:` field to both
handoff templates; `groups/sales/CLAUDE.md:77-82`, `groups/chief/CLAUDE.md:60`,
and `groups/mailman/CLAUDE.md:59-64` all require unchanged passthrough.

The documented fallback is honest: the Sales prompt says that if the host line
is absent the agent may still hand off the exact approved bytes and "the host
must bind them to exactly one approval or fail visibly" — which is what
`findPendingSendAction` plus `claimEmailActionExecution` do. Note that
`getMessagesSince(..., excludeGroup)` (`src/db.ts:681-683`) does exclude
own-group rows, so the ID is visible through thread context, not through the
missed-message path. Approvals are threaded, so this is correct, not a gap.

### P1-3 — Gmail acceptance followed by failed confirmation on NULL recipient → **CLOSED**

`src/index.ts:1832-1845` moves any action lacking a recipient **or** a content
hash to `blocked` at approval time, before any handoff can be written.
`findPendingSendAction` (`src/db.ts:1261`) excludes `blocked`, so the content
and recipient fallbacks cannot rebind it; `getPendingSendByActionId` still
finds it, and `claimEmailActionExecution` returns `held` ("action is blocked").
`recordPendingSend` has exactly one production caller path
(`src/index.ts:1777` → `src/send-watchdog.ts:189`), so no other route creates a
recipient-less executable action. A legacy row upgraded by `COALESCE` inherits
`approved_content_sha256 = NULL`, which fails the hash comparison and holds.
I found no remaining route to Gmail acceptance followed by a failed confirm.

### P1-4 and the P2 set → **CLOSED**

- `container/agent-runner/src/ipc-mcp-stdio.ts:591` and `:644` now both append
  "This is not a delivery receipt; wait for the host's Gmail-confirmed result."
- False alert events are gated on `result.changes > 0` (`src/db.ts:1741`).
- Stale comments corrected: `src/db.ts:1716` and `src/send-watchdog.ts:398`.
- `parseSubjectAndBody` anchors the `Body:` search after `---END-ORIGINAL---`
  (`src/approved-send-handoff.ts:53-62`).
- Retention is now an explicit recorded decision, not an omission:
  `docs/PROJECT-MAP.md` states the action/event rows are "intentionally
  retained as low-volume safety/audit evidence; automatic pruning is declined
  until a reviewed retention rule can preserve confirmed and uncertain receipt
  history." That satisfies `docs/CHANGE-PROTOCOL.md` §7 as an explicit decline.

---

## Answers to the adversarial questions

**Can a typed `Approved` bind a draft from another channel/thread, a human
message, a mechanical status line, or a superseded draft?**

- Another channel: **no** — `chat_jid = ?`.
- Another thread: **no** — `(thread_ts = ? OR id = ?)` against the incoming
  message's own `threadTs`; and with no `threadTs` the listener block is skipped
  entirely (`src/channels/slack.ts:370`).
- A human message: **no** — `COALESCE(is_bot_message,0) = 1`.
- A superseded draft: **no** — the query is `ORDER BY timestamp DESC, rowid DESC
  LIMIT 1`, so it can only pick the newest, never an older one.
- A mechanical status line: **yes** — the resolver has no card filter. See N1.

**Does posting `[EMAIL ACTION]` before the agent wake preserve the NC-006/008
one-root rule and stay in the approval thread for root and reply drafts?**

Yes, verified through the send path. `approvalThreadTs = card.thread_ts ??
card.id` (`src/index.ts:1821`), so a reply draft posts under its existing thread
and a root draft gets a reply under the card itself — no new channel root
either way. The call passes neither `threadKey` nor a lead-bearing text, so
`leadKey` is undefined, `isRecordedSalesWorkRoot` short-circuits to false
(`src/channels/slack.ts:870-871`), `requestedSalesRoot` and therefore
`anchoredReply` stay false, and the broadcast gate
`if (anchoredReply && !hostDerivedAnchor)` (`src/channels/slack.ts:971`) never
fires. The post is a quiet in-thread reply. The same reasoning covers
`[EMAIL APPROVAL NOT ARMED]` and every `postActionStatus` line. Changing
`recordApproval`'s `threadTs` from `card.thread_ts ?? undefined` to
`card.thread_ts ?? card.id` also moves watchdog alerts for root drafts from the
channel root into the card's thread — an NC-006 improvement, not a regression.

**Can listener or Slack-post failure create a silent approved send, double
action, or customer-facing partial state?**

No silent send and no double action. `recordApproval` runs before any post, and
`recordPendingSend` is idempotent on `draft_ts` with an immutable `action_id`, so
a repeated listener invocation cannot mint a second action. A throwing listener
is caught in both paths (`src/channels/slack.ts:374-376` for text; the
equivalent guard on the reaction path) and the agent still wakes. If the
`[EMAIL ACTION]` post fails, the action exists but the ID is unpublished — the
agent then hands off exact bytes and the content hash binds it, or the send is
denied and surfaced to Chief. If the `[EMAIL APPROVAL NOT ARMED]` post fails,
the action is already `blocked`, so the worst case is that the operator learns
of it from the Chief boundary notice or the watchdog rather than the thread.
No path produces a customer-facing partial state.

**Can any stale watchdog list result regress `confirmed`, `blocked`, or
`uncertain`?**

No. Verified directly:

```
C) stale watchdog list must not regress a terminal state
   alert on confirmed   : changes 0 -> confirmed
   alert on blocked     : changes 0 -> blocked
   alert on uncertain   : changes 0 -> uncertain
```

`listOverdueSends` and `listStalledMailmanHandoffs` both exclude those three
states, and `markPendingSendAlerted`'s own `WHERE` repeats the exclusion, so a
row that turned terminal between listing and marking is still safe.

**Is global test routing checked before the execution claim and Gmail call?**

Yes — it is the first branch inside the action block, ahead of both the hash
check and `claimEmailActionExecution`, and it `continue`s after unlinking the
IPC file (`src/ipc.ts:898-911`).

**Does the canary have any path to a customer address, BCC, Party or business
record, action ledger, Slack post, or model input? Is its receipt
retrieval/retry guidance safe after Gmail acceptance?**

No to every path — see P0-3 above for the specific line evidence and the
reachability sweep. The retry guidance is safe: both the retrieval-failure and
receipt-mismatch branches name the already-accepted `messageId/threadId` and
say "do not rerun blindly", so an operator cannot read a failure as "nothing
was sent."

**Is the first-activation drain precondition executable against the old schema,
and does it avoid reading customer rows?**

Yes to both, demonstrated in probe E above. `SELECT COUNT(*)` runs on the
pre-action schema; the state-filtered variant errors there, which is precisely
why the doc scopes it to later releases. No customer column is read.

**Does the expanded release gate exactly match `test:email-critical`?**

Yes. `package.json:22` and `scripts/build-release.mjs:42-63` list the same ten
files in the same order with the same three flags (`--pool=forks`,
`--no-file-parallelism`, `--maxWorkers=1`). The gate still runs after the exact
Node pin check (`:10-16`), the clean-worktree check (`:18-27`), and the
commit/tree capture (`:29-35`), and before `fs.rmSync(dist)` and the compile.

---

## Reproduced checks and exact counts

| Check | Result here | Codex claim | Assessment |
| --- | --- | --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | exit 0, no diagnostics | typecheck pass | corroborated |
| `npm run test:email-critical` (verbatim argv, Node 26.5.0) | **10 files, 294 tests** collected; 8 files / 228 tests pass; `src/db.test.ts` + `src/email-delivery-path.test.ts` fail — 65 failures | 10 files / 294 tests pass serially | file and test counts match exactly; failures environmental |
| `npm run docs:continuity-check` | pass — sanitizer self-test passed; 37 active/ready task rows, 35 changelog entries | pass | corroborated |
| `git diff --check` | clean | — | corroborated |
| Release gate ≡ `test:email-critical` | identical file list, order, and flags | — | verified by inspection |
| Full `npm test` (145 files / 1,845) | not re-run | full suite pass | not independently reproduced |

The 65 failures are one environmental cause. Filtering the run's distinct error
strings yields exactly two: `Error: The module …` (the better-sqlite3
`NODE_MODULE_VERSION 127` vs `147` ABI mismatch thrown at `_initTestDatabase`,
`src/db.ts:427`) and `Error: slack down`, which is an intentional fixture inside
a passing test. Both failing files are the two that need the native driver. I
did not rebuild `node_modules`, which would mutate the review worktree.

Because the native driver is unusable here, the four durable claims were
verified by replaying the delta's own SQL — the `pending_sends` DDL and unique
index, the claim `UPDATE` (`src/db.ts:1490-1497`), the `markPendingSendAlerted`
transaction body (`src/db.ts:1717-1746`), and the `recordPendingSend` conflict
clause — against `node:sqlite`. Full output is quoted in the sections above.

---

## Residual risks and follow-ups

| ID | Risk | Severity | Owner | Suggested disposition |
| --- | --- | --- | --- | --- |
| N1 | Typed approval resolves the **latest bot message** with no card filter. When the newest bot message in the thread is a mechanical line — including the host's own `[EMAIL ACTION]` post — `recordApproval` returns null, nothing is armed, and **nothing is posted**. A second typed "Approved" in the same thread therefore always resolves to the `[EMAIL ACTION]` line and is a silent no-op. Fail-closed; no wrong or duplicate email. No test covers a non-card resolution. | Medium | Codex | New `planned` row: prefer the newest bot message matching the card marker, and post a short "that did not arm an approval" line when the resolved message is not a card |
| N2 | The typed path invokes **all** registered approval listeners, not just the email one. `src/index.ts:1729` (`isIncidentProposal`) can *claim* and suppress the agent wake, and `src/index.ts:2077` (`handleProposalApproval`) sends a proposal email directly through `handleGmailSend` with no NC-009 action. Both previously required an explicit ✅ reaction. `docs/SECURITY.md` says the host recognizes the typed form "for this record", which understates the reach. | Medium | Codex + owner | New `planned` row: either scope the typed path to the email listener or document and test the widened surface; correct the SECURITY.md wording |
| N3 | `parseSubjectAndBody` anchors `Body:` after `---END-ORIGINAL---`, but `SUBJECT_LINE` still matches the first `Subject:` anywhere in the handoff, and when the boundary line is absent `originalBoundary === -1` makes the anchor a no-op. Affects handoff correlation only — execution hashes the tool payload — so it degrades to the legacy recipient path rather than misbinding. | Low | Codex | New `planned` row |
| N4 | `buildTransportCanaryRaw` is exported and interpolates `commit` into the Subject without `cleanHeader`; the 40-hex validation lives in the caller. Only reachable from tests today. | Low | Codex | Fold into the next email slice: apply `cleanHeader` to the subject too |
| N5 | The `GMAIL_TEST_RECIPIENT` refusal sets the action to terminal `blocked`, but the Slack message does not tell the operator that a fresh draft is required to recover it. | Low | Codex | One-line message change |
| R-1 | Binding still depends on byte-exact content when the Action-ID is absent, and `groups/sales/CLAUDE.md:79-80` explicitly permits handing off without it. Correctly fail-closed, but the `[EMAIL HELD]` rate is the metric to watch after activation. | Accepted | Owner | Monitor post-activation; already disclosed |
| R-2 | SEC-007 named-operator / nonce / expiry binding remains open. | Disclosed | Owner | Recorded at `docs/COMPANY-OS-IMPROVEMENT-PLAN.md:1349-1353`; no change requested |
| R-3 | Pinned-Node green suite not independently reproduced here. | Limitation | Reviewer | Counts corroborated (10 files / 294 tests); Codex's Node 22 run remains the authority |

N1 and N2 are the only items I would not want to leave unrecorded. Neither
blocks this deployment: N1 fails closed and is strictly narrower than the R1
defect it replaced, and N2 is a trigger widening on paths that already existed
and already have their own final-boundary controls.

---

## Final decisions

- **Commit: proceed.** All four R1 blockers are closed and independently
  verified. Record N1–N5 as `planned` rows in `docs/ACTIVE-WORK.md` per
  `docs/CHANGE-PROTOCOL.md` §7 in the same change, or decline each with a
  stated reason.
- **Release build: proceed.** The gate matches `test:email-critical` exactly and
  runs after the Node pin and clean-worktree checks and before compilation.
  Run it under exact Node 22.23.2; my Node 26 run corroborates the collection
  counts only.
- **Production activation: proceed**, subject to the precondition the delta
  itself adds — before this first NC-009 activation, confirm
  `SELECT COUNT(*) FROM pending_sends` is `0` in the operational
  `store/messages.db`, pause new approvals during that window, and do not
  inspect customer rows. I could not check that count from this worktree; it is
  an operator step, not a code property.
- **Bounded internal transport canary: proceed**, once, after activation and
  health convergence, exactly as `docs/RELEASE-INTEGRITY.md:196-213` specifies.
  Report its result as transport and OAuth evidence for the activated release
  commit — not as validation of the Party guard, the approved-customer path,
  business logging, or inbox placement. The `[SEND NOT OBSERVED]` /
  `[EMAIL DELIVERY UNCERTAIN]` distinction and the first real approved send
  remain unproven in production until a natural customer cycle is observed.

Nothing above is approved because a suite is green. Each decision rests on the
state-machine behavior reproduced in this report; the two residuals are
recorded rather than waived.
