# NC-20260802-009 — Claude C5 exact-diff review R1

## Reviewer, scope, and limits

- Reviewer: Claude Code, model `claude-opus-5`, session
  `b361d68b-688c-4dd0-bba0-a43188673962`
- Review root: `/private/tmp/nanoclaw-sequence.oUOHVX/worktree`
- Base commit: `177de7b791f3668df4ab91ee7bedb597c3e05472`
  ("docs: record aa1c821 production activation")
- Delta reviewed: the complete uncommitted working-tree delta — 23 paths,
  `1611 insertions(+), 144 deletions(-)`, including untracked
  `src/email-action.ts` and `groups/mailman/OUTBOUND-EMAIL.md`
- Elapsed: request artifact mtime `2026-08-02T22:08:47Z` → this report
  ≈ 17 minutes wall clock, spanning two context windows of one session
- Request executed: `docs/reports/NC-20260802-009-CODEX-REQUEST-R1.md`

Read-only limits actually observed:

- The only file created is this report. No implementation, continuity, prompt,
  or configuration file was edited.
- Nothing was staged, committed, packaged, activated, or restarted. No Slack
  post, no email, no production database read or write.
- `.env*`, OAuth/token material, `~/.claude` settings, `store/`, and database
  dumps were not read. The dirty operational checkout at
  `/Users/xbohdpukc/dev/NanoClaw` was not touched or read.
- One scratch file was written outside the worktree (`/tmp/nc009-probe.mjs`) to
  replay the delta's own SQL against a throwaway in-memory database. It touches
  no project file and no live data.
- Local execution policy blocks invoking `/opt/homebrew/opt/node@22/bin/node`.
  The default runtime here is Node `v26.5.0`. I therefore **corroborate but do
  not reproduce** the pinned-Node green suite; see "Reproduced checks".
- No named-operator, nonce, or approval-expiry semantics are proposed. No
  Procurement surface was exercised.

---

## Verdict

**CHANGES REQUIRED**

The delta gets the hard part right: a host-minted UUID, a length-prefixed
content hash, an append-only event ledger, a conditional single-claim
transition, and a confirmed-replay path that returns the stored receipt without
calling Gmail. `src/db.ts:1430-1492` and `src/db.ts:1494-1529` are sound, and
`src/ipc.ts:872-976` sequences claim → unlink → dispatch → confirm in the right
order.

It fails on three properties that the tracked documents already assert as true:

1. The "held for reconciliation" guarantee **expires after five minutes**. The
   send-watchdog rewrites `executing` to `attention_required`, which
   `claimEmailActionExecution` accepts as executable. A second Gmail call is
   then permitted for an action whose first attempt may already have been
   accepted. Reproduced executably below.
2. The new hard gate at `src/ipc.ts:784-799` denies **every** Mailman send that
   is not bound to an action, and an action exists only when an operator adds a
   ✅ **reaction** to a bot card that `buildApprovedHandoff` can fully parse.
   Typed approvals and unparseable cards now produce a denied, quarantined
   send **with no `pending_sends` row**, so the watchdog has nothing to alert
   on. That is silent operator-facing loss — the precise failure this ticket
   exists to eliminate, reintroduced through a different door.
3. The only host-configured internal test destination in this codebase,
   `GMAIL_TEST_RECIPIENT`, suppresses the confirmation callback
   (`src/gmail-ipc-handlers.ts:670-677`, `:404-411`). The bounded internal
   transport canary the request asks me to approve would therefore leave its
   action stuck in `executing`, emit a `[SEND NOT OBSERVED] … has NOT gone out`
   alert that is false, and then — via finding P0-1 — become re-claimable.

None of these are style objections. Each contradicts a sentence that this same
delta adds to `docs/SECURITY.md`, `docs/PROJECT-MAP.md`, or
`groups/mailman/OUTBOUND-EMAIL.md`. Per the request's instruction, a missing or
ambiguous safety property is treated as a blocker, and the green suite does not
soften them — the state machine's most dangerous edge has **zero** test
coverage (`attention_required` appears nowhere in `src/db.test.ts`).

---

## Blockers

### Commit blockers (P0)

| ID | Finding | Evidence |
| --- | --- | --- |
| P0-1 | The five-minute alert sweep converts `executing` into a re-claimable state, permitting a second Gmail call after an ambiguous attempt | `src/db.ts:1697-1702`, `src/db.ts:1470-1477`, `src/db.ts:1621-1628`, `src/send-watchdog.ts:521-527` |
| P0-2 | Every approved send that is not a ✅ reaction on a fully parseable card is hard-denied, with no row and therefore no watchdog alert | `src/ipc.ts:784-799`, `src/channels/slack.ts:388-393`, `src/index.ts:1811-1842`, `src/send-watchdog.ts:168-186`, `groups/chief/CLAUDE.md:60` |

### Deploy blockers (P0)

| ID | Finding | Evidence |
| --- | --- | --- |
| P0-3 | The internal transport canary mechanism leaves the action `executing`, produces a false "has NOT gone out" alert, and inherits P0-1; no canary procedure is tracked anywhere in the delta | `src/gmail-ipc-handlers.ts:670-677`, `:404-411`, `docs/ACTIVE-WORK.md:84-85` |
| P1-2 | Pre-activation `pending_sends` rows can never acquire an action identity, so any approval in flight across activation becomes permanently unsendable | `src/db.ts:1181-1185` |

### Follow-ups (P1/P2) — see "Residual risks"

P1-1 Action-ID never reaches the approving agent · P1-3 confirmation requires a
stored recipient · P1-4 the runner tool still answers "queued" · P2 ledger,
comment, retention, and coverage defects.

---

## Reproduced checks and exact counts

| Check | Result here | Codex claim | Assessment |
| --- | --- | --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | exit 0, no diagnostics | typecheck pass | corroborated (runtime-independent) |
| `npm run docs:continuity-check` | pass — sanitizer self-test passed; 37 active/ready task rows, 35 changelog entries | pass, schema self-test included | corroborated |
| `git diff --check` | clean | pass | corroborated |
| `npm run test:email-critical` (verbatim argv, Node 26.5.0) | **7 files, 170 tests** collected; 5 files / 108 tests pass; `src/db.test.ts` + `src/email-delivery-path.test.ts` fail — **61 failures, all one cause** | 7 files / 170 tests pass serially | file and test counts match exactly; failures are environmental |
| Full `npm test` | not re-run this round; prior rounds in this session showed the same native-module failure class | 144 files / 1,834 tests | not independently reproduced |

The 61 failures are a single environmental cause, quoted verbatim:

> The module `.../better-sqlite3/build/Release/better_sqlite3.node` was compiled
> against a different Node.js version using NODE_MODULE_VERSION 127. This
> version of Node.js requires NODE_MODULE_VERSION 147.
> — thrown at `_initTestDatabase` (`src/db.ts:427`)

`NODE_MODULE_VERSION 127` is Node 22; `147` is Node 26. Every failure traces to
that `new Database(':memory:')` call. The two failing files are exactly the two
that need the native driver. I did not rebuild `node_modules`, because that
would mutate the review worktree.

### Executable reproduction of P0-1

Because the native driver is unusable here, I replayed the delta's **own SQL**
— the `pending_sends` DDL from `src/db.ts`, the claim `UPDATE` from
`src/db.ts:1470-1477`, the `listOverdueSends` predicate from
`src/db.ts:1621-1628`, and the `markPendingSendAlerted` `UPDATE` from
`src/db.ts:1697-1702` — against `node:sqlite` in a throwaway in-memory
database:

```
1. state after approval          : approved
2. first Gmail claim changes     : 1 -> state executing
   [host crashes here: no confirmEmailAction, no failEmailAction]
3. second claim while executing  : 0 (0 = correctly held)
4. listOverdueSends sees the row : 1 row(s)  <-- state=executing is NOT excluded
5. after markPendingSendAlerted  : attention_required
6. claim again after the alert   : 1 -> state executing  <-- SECOND Gmail call permitted
```

Step 3 is the property the design intends. Step 6 is the property the design
loses, `SEND_GRACE_MS` (5 minutes, `src/send-watchdog.ts:38`) after step 2.

---

## Findings

### P0-1 — the hold for reconciliation expires after five minutes

`claimEmailActionExecution` refuses to re-claim an `executing` action
(`src/db.ts:1442-1448`), and that is correct. But `listOverdueSends`
(`src/db.ts:1621-1628`) excludes only `confirmed`, `blocked`, and `uncertain` —
so an `executing` row is *overdue*. `sweepPendingSends` posts the alert and
calls `markAlerted` (`src/send-watchdog.ts:526-527`), and
`markPendingSendAlerted` rewrites the row with only a `state <> 'confirmed'`
guard (`src/db.ts:1697-1702`), so `executing` becomes `attention_required`.
`attention_required` is inside the executable set of the claim `UPDATE`
(`src/db.ts:1475`).

Consequences, in order of severity:

- **A duplicate customer email is reachable.** Crash after the claim but after
  Gmail accepted (window 3 below) leaves `executing`; five minutes later the
  row is re-claimable; the next matching Mailman send calls Gmail again. The
  host has no way to distinguish that from a crash *before* Gmail accepted.
- **The alert text asserts something the host cannot know.** `alertText`
  (`src/send-watchdog.ts:324-336`) states "Gmail has never confirmed a send. The
  email to X has **NOT** gone out" and then instructs "send that text, do not
  redraft it." For an `executing` row that sentence is a guess, and the
  instruction is a resend order.
- **It contradicts three tracked documents this delta writes.**
  `groups/mailman/OUTBOUND-EMAIL.md:65-67` ("A process interruption after
  execution begins leaves the action uncertain and blocks automatic retry until
  Gmail receipt reconciliation"), `docs/SECURITY.md:195-197`, and
  `docs/PROJECT-MAP.md:638-640` all state an unconditional hold.

Note that the *automatic* host rescue is correctly blocked —
`markEmailActionHandoff` requires `state = 'approved'` (`src/db.ts:1387`), so
`rescueUnhandedSends` skips the row (`src/send-watchdog.ts:488`). The exposure
is the human/agent-driven resend that the alert itself requests.

The narrow correction is to keep an interrupted action out of the executable
set: either exclude `executing` from `listOverdueSends`, or have
`markPendingSendAlerted` map `executing → uncertain` while mapping every other
state to `attention_required`, or drop `attention_required` from the claim
predicate. Any one of the three closes it; the choice is the owner's.

### P0-2 — approvals outside the ✅-reaction-on-parseable-card path are silently lost

`src/ipc.ts:784-799` denies and quarantines any Mailman `gmail_send`/
`gmail_reply` that did not resolve to an action carrying an `actionId`. Mailman
is the **only** group with those capabilities (`src/gmail-ipc-policy.ts:28-34`),
so this is now the sole gate on all outbound customer email.

An action exists only if `recordApproval` ran, and `recordApproval` runs only
from `registerApprovalListener` (`src/index.ts:1811-1842`), which Slack fires
exclusively on a `reaction_added` check-mark event on one of the bot's own
messages (`src/channels/slack.ts:388-393`). Two reachable paths therefore lose
their email:

1. **Typed approval.** `groups/chief/CLAUDE.md:60` documents the live contract
   as "operator approves (✅ **or** \"Approved\") or edits → chief iterates → on
   approval, chief emits `[HANDOFF: chief→mailman]` `[APPROVED-REPLY]` with the
   byte-identical approved body." A typed approval creates no row. Chief then
   routes a handoff whose body a **human wrote**, and the host denies it.
2. **Unparseable card.** `recordApproval` records the row on the bare marker
   (`isTrackableCard`, `src/send-watchdog.ts:168`) but derives
   `approvedContentSha256` from `buildApprovedHandoff`, leaving it `undefined`
   when parsing fails (`src/send-watchdog.ts:180-183`). At execution,
   `claimEmailActionExecution` compares `undefined !== <hash>` and holds
   (`src/db.ts:1452-1458`). `buildApprovedHandoff` requires a whole-line
   `Email:`/`To:` address, a `DRAFT RESPONSE[ TO LEAD]:` heading, an opening and
   a closing `---` fence, and a `Subject:` line inside the fence
   (`src/approved-send-handoff.ts:100-132`) — a strict grammar emitted by an
   LLM. Before this delta that grammar mattered only for the host's best-effort
   rescue; it is now a precondition for sending at all.

Case 1 is the worse of the two: with no `pending_sends` row, `listOverdueSends`
has nothing to return, so **no watchdog alert ever fires**. The only signals are
`writeDeniedGmailInput` back into Mailman's own input and a host log line. The
operator who typed "Approved" is told nothing, indefinitely. Case 2 at least
produces a `[EMAIL HELD]` post in the approval thread
(`src/ipc.ts:899-905`).

The tracked documents do not disclose this narrowing. `docs/PROJECT-MAP.md:644`
addresses only legacy rows ("Legacy rows without an action ID remain readable
for operator diagnosis, but Mailman cannot execute them"); nothing states that
a human-approved email outside the reaction path can no longer be sent.

### P0-3 — the internal transport canary is broken by this delta

`GMAIL_TEST_RECIPIENT` is the codebase's host-configured internal test
destination (`src/config.ts:201-202`; `docs/ARCHITECTURE.md:482`: "ALL
`gmail_send` outbound emails are redirected to that address"). The delta adds
no other canary mechanism and no canary procedure — `docs/ACTIVE-WORK.md:84-85`
only constrains it ("no customer address or prompt-selected destination").

Both handlers wrap the confirmation callback in `if (!GMAIL_TEST_RECIPIENT)`
(`src/gmail-ipc-handlers.ts:670-677` and `:404-411`). That guard predates this
task and was correct when its only effect was leaving the row un-cleared. It is
no longer correct: the action was already claimed at `src/ipc.ts:886-891`, so a
test-routed send now leaves it in `executing` with no confirm and no fail. The
canary therefore produces, deterministically:

- an email delivered to the internal address;
- an action stuck in `executing`;
- five minutes later a `[SEND NOT OBSERVED] … The email to <customer> has NOT
  gone out` alert posted into the real approval thread — false, and naming the
  customer, not the test address;
- an `attention_required` row that P0-1 makes re-claimable.

Two further deployment facts matter: the guard is applied **after** the Party
recipient check (`src/gmail-ipc-handlers.ts:560-586`, then `applyTestRouting` at
`:609`), so a canary still requires a real Party-verified recipient — it is not
a free-standing internal test; and because the setting is global, every genuine
approved send during the canary window is redirected to the test address and
left in the same broken state. A canary run under this delta would not be a
truthful complement to the suite; it would manufacture the exact ambiguous state
the ticket is meant to eliminate.

### P1-1 — the Action-ID never reaches the agent that writes the handoff

`Action-ID:` is emitted in exactly one place, `src/approved-send-handoff.ts:150`,
reachable only from `buildApprovedHandoff(card, { actionId: row.actionId, … })`
at `src/send-watchdog.ts:460-464` — the host's 90-second `rescueUnhandedSends`
path. `registerApprovalListener` records the approval and grants Gmail resources
but never surfaces the identifier (`src/index.ts:1820-1839`).

So `groups/mailman/OUTBOUND-EMAIL.md:13-15` ("Copy `Action-ID` into the Gmail
tool's `action_id` argument whenever it is present"), the format block at
`:33`, `groups/mailman/CLAUDE.md:59-64`, and the new `action_id` MCP argument
(`container/agent-runner/src/ipc-mcp-stdio.ts:563-567`, `:617-621`) describe a
contract that steady-state traffic never exercises. In normal operation the
binding rests entirely on `hashApprovedEmailContent` agreeing across two
independent LLM transcriptions — Sales copying the card body into the handoff,
then Mailman copying the handoff body into the tool. Any single-character drift
holds the send.

This is fail-closed, and the VERBATIM RULE predates this change, so I do not
rate it a blocker. It is the largest availability risk in the delta, and the
mitigation the documents advertise is not actually wired. Passing the Action-ID
into the agent-visible approval message would make the documented path the real
one.

### P1-2 — legacy rows can never acquire an identity (deploy blocker)

`recordPendingSend`'s conflict clause updates `gmail_thread_id`, `recipient`,
`approved_subject`, and `approved_content_sha256`, but **not** `action_id`
(`src/db.ts:1181-1185`). Immutability of an existing identity is right; never
granting one is not. A `pending_sends` row that exists at activation has
`action_id NULL`; re-approving that draft keeps `action_id NULL`
(`ON CONFLICT` skips it), `recordApproval` returns the stored row so the fresh
UUID is discarded (`src/send-watchdog.ts:187-192`), and every subsequent Mailman
send for it is denied at `src/ipc.ts:784`. The operator's natural remedy —
✅ the card again — loops forever.

Two mitigations, both cheap: `action_id = COALESCE(pending_sends.action_id,
excluded.action_id)` in the conflict clause, which cannot overwrite an existing
identity; and an explicit activation precondition that `pending_sends` be drained
(no non-terminal rows) before the release is activated. I could not check
whether production currently has such rows — `store/` is out of scope for this
review — so the operator must confirm before activating.

### P1-3 — confirmation requires a stored recipient the approval may not have

`confirmEmailAction` requires `LOWER(COALESCE(recipient,'')) = ?`
(`src/db.ts:1510`). An action whose card had no whole-line `Email:`/`To:` match
stores `recipient = NULL` (`src/send-watchdog.ts:178`). `claimEmailActionExecution`
skips its recipient check for that case (`src/db.ts:1459-1469`, guarded on
`current.recipient` being truthy), so the send proceeds on the model-supplied
address — still Party-validated at `src/gmail-ipc-handlers.ts:560`, so not an
authorization hole. But on success `confirmEmailAction` matches `'' = <address>`
and returns 0, `src/ipc.ts:930-934` throws, and the catch marks the action
`uncertain` (`src/ipc.ts:966-975`). The customer received the email; the
operator is told delivery is uncertain and not to retry.

Secondary: at `src/ipc.ts:922`, a falsy `confirmedRecipient` routes to the
`else` branch, which calls `observeConfirmedSend` — for Mailman, the only sender,
that leaves the action in `executing` with no ledger entry at all.

### P1-4 — the runner still answers "queued" with no qualification

The incident basis names "'queued' was mistaken for delivered" as one of the six
links. The fix landed in prompt text (`groups/mailman/OUTBOUND-EMAIL.md:18`,
`groups/mailman/CLAUDE.md:60-61`) but the string the model actually sees in its
tool result is unchanged: `Reply queued for thread ${args.thread_id}.`
(`container/agent-runner/src/ipc-mcp-stdio.ts:591`) and
`Email queued to ${args.to}.` (`:644`). A one-line change to each would make the
tool output agree with the procedure.

### P2 — smaller defects

- `markPendingSendAlerted` appends an `attention_required` event
  unconditionally (`src/db.ts:1703-1707`) even when its `UPDATE` matched zero
  rows because the action was already `confirmed`. That writes a false terminal
  stage into an append-only ledger whose purpose is audit truth. Gate the append
  on `result.changes > 0`, as `markEmailActionHandoff`, `confirmEmailAction`,
  and `failEmailAction` all correctly do.
- Two comments now describe deleted behavior: `src/db.ts:1691` ("drop the row
  so a stuck send cannot spam") and `src/send-watchdog.ts:388-389`
  ("`markAlerted` removes the row"). The row is no longer dropped.
- Terminal rows now persist indefinitely in `pending_sends` and
  `email_send_events`. No retention or pruning policy is stated in
  `docs/PROJECT-MAP.md:400-407`. Volume is low, but an unbounded table with no
  documented lifecycle is a continuity gap.
- `parseSubjectAndBody` locates the body by the first line matching
  `^\s*Body\s*:\s*$` across the whole handoff (`src/approved-send-handoff.ts:57-59`),
  which includes the untrusted `Original-Message:` block. Injected text there
  degrades handoff correlation to the legacy recipient path. Not a send-safety
  issue — the execution-time hash is computed from the tool payload, not the
  handoff — but it makes `observeOutbound` attacker-influenceable.
- Test coverage: `attention_required` appears **zero** times in
  `src/db.test.ts`. The new tests cover approval, receipt lifecycle, confirmed
  replay, executing hold, hash mismatch, same-recipient separation, and the
  legacy no-recipient case — every state except the one that reopens the Gmail
  boundary.

---

## Answers to the ten review questions

**1. Identity and immutability.** Model input cannot mint an action: the MCP
`action_id` is `z.string().uuid()`
(`container/agent-runner/src/ipc-mcp-stdio.ts:563-567`), re-validated host-side
against a UUIDv4 regex (`src/ipc.ts:669-673`, `src/email-action.ts:3-4`), and an
unknown identifier is quarantined rather than trusted (`src/ipc.ts:767-783`).
Recipient and content are re-read from the host row, and `approvedRecipient` is
host-stamped over container input (`src/ipc.ts:915-916`). Hashing is consistent
and unambiguous — length-prefixed SHA-256 over `(subject, body)`
(`src/email-action.ts:26-40`) — and is computed pre-MIME on both sides, so the
RFC 2047 subject encoding at `src/gmail-api.ts:238` cannot perturb it.
Normalization is consistently `toLowerCase` on recipients at every comparison
site. **Not consistent across every path:** the identity is never handed to the
approving agent (P1-1), legacy rows can never receive one (P1-2), and an
unparseable card yields a NULL hash that permanently holds the action (P0-2
case 2).

**2. Single execution.** The claim is a single conditional `UPDATE` inside a
`better-sqlite3` transaction (`src/db.ts:1470-1477`), and better-sqlite3 is
synchronous on Node's single thread, so within the host process it is atomic.
Parallel IPC files are safe: the second file's claim returns `held`. Replay of a
confirmed action returns the receipt without calling Gmail
(`src/db.ts:1439-1441`, `src/ipc.ts:892-897`). Same-recipient concurrency is
separated by content hash rather than by recipient order. A changed payload
fails the hash and holds. **The answer is still no**, because of P0-1: after
`SEND_GRACE_MS` an interrupted action becomes claimable again, so a second Gmail
call is reachable. Note there is still no `busy_timeout` or WAL PRAGMA on this
database; that is pre-existing and safe only while exactly one process writes.

**3. Crash windows.** Answered in full in the next section.

**4. Final host boundary.** All pre-existing guards survive and run in the same
order: `verifyPartyRecipient` including the bigint-string path
(`src/gmail-ipc-handlers.ts:560-564`), CC held to the same policy
(`:565-567`), content guard on the raw composition (`:590-607`), Gmail resource
authorization (`src/gmail-ipc-policy.ts:262-278`), and test routing applied only
after all of them (`:609`). The action layer sits *before* these, never around
them, and each early return is now instrumented with `onSendFailed` — I checked
every `return` path in both handlers. One narrow widening: the authorization
resolver now also accepts `approvedAction` (`src/ipc.ts:801-808`), and the
fallback lookup at `src/ipc.ts:752-765` can bind a row whose `recipient` is NULL,
which `getPendingSendByGmailThread` would have excluded. The grant is still
keyed to the approved Gmail thread, so the widening is marginal, but it is a
widening. No guard is bypassed or weakened.

**5. Visibility and recovery.** `blocked`, `uncertain`, and `confirmed` are
durable columns plus append-only events, and `postActionStatus` posts to
`chatJid` + `threadTs` from the action row — the originating approval thread —
with Slack failure logged but deliberately not allowed to relabel the durable
state (`src/ipc.ts:851-870`). Wording is honest: `[EMAIL ALREADY SENT]`,
`[EMAIL HELD]`, `[EMAIL BLOCKED]`, `[EMAIL DELIVERY UNCERTAIN]`, and the
`[EMAIL SENT — FOLLOW-UP FAILED]` case correctly refuses to call a receipted
send unsent. Ambiguous requests are quarantined and logged at `error`. **But
the three pre-claim quarantine paths (`src/ipc.ts:674-690`, `:767-783`,
`:784-799`) return before `postActionStatus` is defined, so they post nothing to
the approval thread**; and in P0-2 case 1 there is no row at all, so no watchdog
alert either. That is not "visible enough for an operator". Separately, the
`[SEND NOT OBSERVED]` text asserts non-delivery for states where the host cannot
know it (P0-1).

**6. Schema and migration.** The migration is restart-safe. `ALTER TABLE … ADD
COLUMN state TEXT NOT NULL DEFAULT 'approved'` is legal in SQLite precisely
because a non-null default is supplied, and existing rows land in `approved`.
The partial unique index `… ON pending_sends (action_id) WHERE action_id IS NOT
NULL` correctly permits many NULL legacy rows while keeping identities unique.
`email_send_events` is append-only with an `AUTOINCREMENT` sequence and an
`(action_id, sequence)` index. Transition predicates are guarded correctly:
handoff requires `approved`, mailman-start requires `handoff_routed`/`approved`,
confirm requires `executing`, and `failEmailAction` cannot regress a `confirmed`
row (`src/db.ts:1542`). `findPendingSendAction` uses `LIMIT 2` and
`rows.length === 1` so a tie is ambiguity, not an arbitrary pick. Timestamps are
caller-supplied ISO strings, consistent with the rest of the file.
**Defects:** the `attention_required` state-regression path (P0-1); the
`action_id` conflict omission (P1-2); the ungated event append (P2); no
retention policy (P2). No coercion risk — every comparison is text-to-text, and
the node-postgres bigint-string hazard does not touch this SQLite path.

**7. Agent/tool contract.** The runner schema, the Mailman prompt, and the
tracked procedure agree with each other on `action_id`, verbatim body, and
"queued is not delivery" — but the procedure's central instruction is
unreachable in normal operation because the host never emits an `Action-ID`
outside the rescue path (P1-1). Unicode **is** preserved: no ASCII folding
exists anywhere in the send path, and `encodeHeaderValue`
(`src/gmail-api.ts:238`) emits RFC 2047 `=?UTF-8?B?…?=` with round-trip tests at
`src/gmail-api.test.ts:238-240`, so removing the obsolete ASCII-rewrite
instruction is truthful. Release packaging is correct: `.gitignore:34` now
un-ignores `groups/mailman/OUTBOUND-EMAIL.md`, and `groups` is already bundled.
"Queued" is explicitly non-final in the prompt but not in the tool response
itself (P1-4).

**8. Release gate and canary boundary.** `release:build` really does run the
suite against the exact clean commit before compiling: the Node pin check is at
`scripts/build-release.mjs:10-16`, the clean-worktree check at `:18-27`, the
commit/tree capture at `:29-35`, and the new `execFileSync` vitest invocation at
`:38-59` — all strictly before `fs.rmSync(dist)` and the compile. It uses
`process.execPath`, which the pin check has already constrained to the `.nvmrc`
version, and `--pool=forks --no-file-parallelism --maxWorkers=1` matches the
`test:email-critical` script exactly. The seven files exist and collect 170
tests, which I confirmed. One note: `src/email-delivery-path.test.ts` is in the
gate but is **unmodified** by this delta, so it validates the pre-existing
contract, not the new one. On the canary: **no**, as specified it is not a
truthful complement — see P0-3. Once P0-3 is fixed, a transport-only canary
would be a truthful check of Gmail transport and host receipt handling, and
should be described as exactly that, not as validation of the customer action
path, since the Party guard, business logging, and real recipient are all
different in a redirected send.

**9. Documentation truth.** The task row, changelog entry, project map, security
model, roadmap, release procedure, and prompts are mutually consistent and
correctly scoped — the changelog's `State: validating`, the "no external state"
statement, the rollback note ("never delete uncertain or confirmed receipt rows
during rollback"), and the explicit SEC-007 residual boundary are all accurate
and appropriately humble. Three claims do not match the code: the unconditional
hold at `docs/PROJECT-MAP.md:638-640`, `docs/SECURITY.md:195-197`, and
`groups/mailman/OUTBOUND-EMAIL.md:65-67` (contradicted by P0-1); the Action-ID
passthrough contract (P1-1); and the omission of P0-2's narrowing, which
`docs/PROJECT-MAP.md:644` addresses only for legacy rows.

**10. Regression and scope.** NC-006/008 Sales thread behavior is untouched — no
change to `src/channels/slack.ts`, `src/group-queue.ts`, or the anchor
lifecycle, and `ipc-handoff-echo.test.ts`, `send-watchdog.test.ts`, and
`ipc-gmail-auth.test.ts` all pass here. `observeOutbound` and
`observeMailmanStart` fall back to the legacy recipient path whenever the action
lookup misses (`src/send-watchdog.ts:243-250`, `:288-291`), so NC-006 handoff
observability is preserved. Test routing, procurement, classification, digests,
and the Hive path are untouched. Direct non-Mailman host email is unaffected
because no other group holds `gmail_send`/`gmail_reply`
(`src/gmail-ipc-policy.ts:28-39`). **The scope change that is not silent but is
under-documented is P0-2**: the Mailman send surface narrows from "any routed
handoff" to "only a ✅-reaction-backed, fully parseable approval."

---

## The five crash windows

| # | Window | Actual behavior | Correct? |
| --- | --- | --- | --- |
| 1 | Crash **before** claim | The IPC file is still on disk — `fs.unlinkSync` runs only after the claim block (`src/ipc.ts:908`). On restart the file is reprocessed, the action is still `approved`, and the claim succeeds. Exactly one Gmail call. | ✅ |
| 2 | Crash **after** claim, **before** Gmail | Row left `executing`; the IPC file is gone. Replay is held for 5 minutes (`src/db.ts:1442-1448`), then `attention_required` reopens it. Here a resend is in fact *correct* — but the host cannot tell this window from window 3. | ⚠️ correct outcome, wrong reasoning |
| 3 | Crash **after** Gmail accepts, **before** receipt commit | Identical row state to window 2 — `executing`, no receipt. The alert then asserts "has NOT gone out", the state becomes re-claimable, and a resend delivers a **duplicate**. | ❌ **P0-1** |
| 4 | Crash **after** receipt commit, **before** message/business logging | `confirmEmailAction` already committed inside its own transaction (`src/db.ts:1501-1528`), so `state = 'confirmed'` with `gmail_message_id` durable. A later throw is caught and re-checked against the live row, producing `[EMAIL SENT — FOLLOW-UP FAILED] … Do NOT resend` (`src/ipc.ts:958-965`). A subsequent claim returns `confirmed` with the stored receipt. | ✅ — the best-handled window in the delta |
| 5 | Slack status delivery fails | `postActionStatus` swallows and logs (`src/ipc.ts:855-869`), deliberately downstream of the durable transition, so a Slack outage cannot relabel a Gmail-confirmed action or make the deleted IPC file look unprocessed. The comment explains exactly this. | ✅ |

Windows 2 and 3 are indistinguishable from durable state alone — that is
inherent, not a defect, and the delta is right not to claim distributed
exactly-once delivery. The defect is the *response* to that ambiguity: the
design says hold and reconcile, the implementation blindly reopens after five
minutes. Windows 2 and 3 must resolve to the same terminal state (`uncertain`),
accepting that a genuine window-2 interruption will require an operator to
confirm no Gmail receipt exists before a fresh approval. That is the correct
trade for customer-facing email.

---

## Residual risks and follow-ups

| ID | Risk | Severity | Owner | Suggested disposition |
| --- | --- | --- | --- | --- |
| P0-1 | Interrupted action becomes re-claimable after 5 min | Blocker | Codex | Fix in this task before commit; add a `db.test.ts` case asserting `executing` → alert → claim returns `held` |
| P0-2 | Typed approvals and unparseable cards are denied with no alerting row | Blocker | Codex + owner | Fix in this task: either record a row for a routed handoff with no card, or fail loudly to the originating thread on the unbound path; and reconcile `groups/chief/CLAUDE.md:60` with the reaction-only reality |
| P0-3 | `GMAIL_TEST_RECIPIENT` leaves the action `executing`; no tracked canary procedure | Deploy blocker | Codex | Fix the callback (confirm the action, mark the receipt as test-routed) and add a tracked canary procedure before running one |
| P1-2 | Legacy `pending_sends` rows can never gain an identity | Deploy blocker | Codex | `COALESCE` the conflict clause; add an explicit "drain `pending_sends`" activation precondition to `docs/RELEASE-INTEGRITY.md` |
| P1-1 | Action-ID never reaches the approving agent | High | Codex | New `planned` row: surface the Action-ID in the approval-thread message so the documented passthrough is the live path |
| P1-3 | Confirmation requires a stored recipient the card may lack | Medium | Codex | Fold into this task or a `planned` row: fall back to the receipt recipient when the stored one is NULL |
| P1-4 | Runner tool still answers bare "queued" | Medium | Codex | One-line change in this task: name the host confirmation as the only receipt |
| P2-a | `attention_required` event appended when the update matched 0 rows | Low | Codex | Gate on `result.changes > 0` |
| P2-b | Stale comments at `src/db.ts:1691`, `src/send-watchdog.ts:388-389` | Low | Codex | Correct in this task |
| P2-c | No retention policy for `pending_sends` / `email_send_events` | Low | Codex | New `planned` row; document in `docs/PROJECT-MAP.md` |
| P2-d | `Body:` located inside the untrusted `Original-Message:` block | Low | Codex | New `planned` row: anchor the search after `---END-ORIGINAL---` |
| R-1 | Binding depends on byte-exact LLM transcription across two hops | Accepted risk | Owner | Disclose in `docs/ACTIVE-WORK.md`; monitor the `[EMAIL HELD]` rate after activation |
| R-2 | SEC-007 named-operator / nonce / expiry binding still open | Disclosed | Owner | Already recorded at `docs/COMPANY-OS-IMPROVEMENT-PLAN.md:1349-1353` — no change requested |
| R-3 | Pinned-Node green suite not independently reproduced here | Limitation | Reviewer | Counts corroborated (7 files / 170 tests); Codex's Node 22 run remains the authority |

Per `docs/CHANGE-PROTOCOL.md` §7, each follow-up above that is not fixed in this
task needs a `planned` row or an explicit recorded decline with a reason.

---

## Final statement

- **Commit:** not yet. P0-1 and P0-2 are commit blockers. Both are contained
  fixes — a state-mapping correction and a visibility/scoping correction — not
  redesigns.
- **Release build:** blocked by the commit blockers. The gate mechanism itself
  is correctly built and correctly ordered; once the blockers are closed,
  `release:build` is fit for purpose. Add the P1-2 activation precondition to
  `docs/RELEASE-INTEGRITY.md` in the same change.
- **Production activation:** blocked by P1-2 until either the `COALESCE` fix
  lands or the operator confirms `pending_sends` holds no non-terminal rows at
  the activation moment.
- **Bounded internal transport canary:** must not run under this delta. P0-3
  makes it produce a stuck action and a false non-delivery alert, and its global
  redirect would put any concurrent real approval into the same state. After the
  fix it may proceed, described precisely as a Gmail-transport-and-receipt check
  — not as validation of the customer action path, and not as outcome
  validation.

The architecture here is right and the ledger design is the correct answer to
the July 28–31 incident chain. What is missing is that two of the properties the
documents already assert — an unconditional hold after an interrupted attempt,
and no silent loss of an approved email — are not yet true in the code.

Return this to R2 with the blockers closed and the two contradicted document
claims either implemented or amended, and I expect to approve.
