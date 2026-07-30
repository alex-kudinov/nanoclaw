# NC-20260729-004 — Independent pre-commit review of the Gmail authority and healer containment slice

- Date: 2026-07-30T03:55Z
- Reviewer: Claude Code 2.1.220
- Model / effort: `claude-opus-5[1m]` (Opus 5, 1M context), maximum effort
- Account label: `info-tandem` (operator-selected; no token, key, or credential
  value was read, printed, or transmitted)
- Repository state: branch `codex/continuity-reconciliation`, HEAD `cd78ad2`,
  51 changed paths in a dirty, concurrently operated worktree
- Change class under review: C3 — host authorization and the customer-email
  final-send boundary
- Implementer: Codex. This review changed no implementation code.

## VERDICT: CHANGES REQUIRED

The security model is sound and the implementation largely realizes it. Source
identity is directory-derived, the operation matrix is enforced before dispatch,
model-authored text cannot mint a grant, search grammar is tightly constrained,
recipient and CC validation now fail closed, reply recipients are Gmail-derived
and validated before message construction, test routing covers both sends and
replies, and the tracked healer template genuinely disarms a flag that source
actually reads. Every one of Codex's stated verification results reproduced
exactly on this machine.

Changes are required because the grant lifecycle has no reissue source for the
one path that matters most commercially. `gmail_reply` — the operation that
delivers every operator-approved customer answer — is authorized only from a
process-local grant, and the sole durable fallback is restricted to
`sales` + `{gmail_get_thread, gmail_search}`. After any daemon restart, an
approved reply on a thread with no prior *outbound* interaction cannot be
authorized by any code path in this change. That is P1-1 below. Two further
issues (P1-2, P2-1) are small, cheap, and belong in the same commit.

None of this argues against the design. It argues that the first slice is one
grant-reissue hook short of being safe to deploy.

---

## 1. Scope and evidence actually inspected

### Read in full

`CLAUDE.md`; `docs/PROJECT-MAP.md` (+ diff); `docs/ACTIVE-WORK.md` (NC-004 and
NC-003 rows and detail sections); `docs/CHANGE-PROTOCOL.md` v1.2;
`docs/ENGINEERING-CHANGELOG.md` NC-20260729-004 and NC-20260729-003 entries;
`docs/SECURITY.md`; `docs/COMPANY-OS-IMPROVEMENT-PLAN.md` diff;
`.claude/skills/get-qodo-rules/SKILL.md`.

### Implementation read

`src/gmail-ipc-policy.ts` (new, 318 lines, whole file);
`src/gmail-ipc-business-scope.ts` (new, 67 lines, whole file);
`src/gmail-ipc-handlers.ts` (whole file, 769 lines);
`src/ipc.ts` (diff plus surrounding loop structure `:195-265`, `:494-560`,
`:660-700`); `src/gmail-api.ts` (`replyToThread` diff, `findThreadForReply`
`:573-593`); `src/send-watchdog.ts` (diff plus `recordApproval` `:60-105`);
`src/db.ts`, `src/index.ts`, `src/email-recipient-guard.ts`,
`src/channels/gmail.ts`, `src/classify-ipc-handlers.ts`, `src/host-router.ts`
(whole file), `tsconfig.json` diffs.

### Read for cross-checking, not in the listed scope

`src/email-interaction-log.ts`, `src/lead-matcher.ts` (thread-id convention),
`src/healer/implement.ts:36`, `src/index.ts:1850-1875` (proposal-approval send
path), `container/agent-runner/src/ipc-mcp-stdio.ts:557-607` (container-side
tool return contract), `agent_docs/nanoclaw-business-pg-schema.md`,
`agent_docs/nanoclaw-business-v2-schema.sql` (stage taxonomy, grants, indexes),
`.gitignore`.

### Untracked NC-004 files read directly (absent from `git diff`)

`src/gmail-ipc-policy.ts`, `src/gmail-ipc-policy.test.ts`,
`src/gmail-ipc-business-scope.ts`, `src/gmail-ipc-business-scope.test.ts`,
`src/ipc-gmail-auth.test.ts`.

### Group procedures and template

`groups/mailman/CLAUDE.md`, `groups/mailman/OUTBOUND-EMAIL.md`,
`groups/sales/WORKFLOWS.md`, `groups/contador/CLAUDE.md`,
`groups/archivarista/CLAUDE.md`, `groups/chief/KNOWLEDGE-MANAGEMENT.md`,
`groups/chief/SUPPORT-REPLY.md`, `groups/chief/CLAUDE.md`,
`groups/_TEMPLATE/CLAUDE.md`, `setup/launchd/com.nanoclaw.healer.fast.plist`.

### Not inspected, by instruction

`.env*`, OAuth/token contents, `store/`, runtime databases or dumps, `data/`,
sessions, browser profiles, local MCP settings, production customer content. No
live Gmail, Slack, PostgreSQL, Stripe, Plutio, Trafft, or Firebase call was made.
No production row was read.

### Qodo rules

Followed `.claude/skills/get-qodo-rules/SKILL.md`. Step 2 passes (git repo,
origin `git@github.com:alex-kudinov/nanoclaw.git`). Step 3 fails closed:
`~/.qodo/` does not exist, `~/.qodo/config.json` is absent, and neither
`QODO_API_KEY` nor `QODO_ENVIRONMENT_NAME` is set. **No config file was
created.** Codex's recorded claim is confirmed exactly. No Qodo rules were
available; tracked repository instructions are the governing controls.

---

## 2. Verification independently reproduced

All run from the repository root on this Mac Studio checkout, pinned runtime, not
in a sandbox:

| Check | Command | Result |
| --- | --- | --- |
| Runtime pin | `npm exec --package=node@22 -- node --version` | `v22.23.2` (matches `.nvmrc` = 22) |
| Typecheck | `npm exec --package=node@22 -- npm run typecheck` | pass, no output |
| Root suite | `npm exec --package=node@22 -- npm test` | **127 files / 1,625 tests passed**, 0 failures |
| Runner build | `container/agent-runner`, `npm run build` @ Node 22 | pass |
| Runner suite | `container/agent-runner`, `npm test` @ Node 22 | **3 files / 22 tests passed** |
| Continuity | `npm run docs:continuity-check` | pass — 19 active/ready rows, 19 changelog entries |
| Whitespace | `git diff --check` | pass, exit 0 |

Every figure Codex recorded reproduced identically. The authoring shell is Node
26.5.0; native modules were not rebuilt and no dependency install was performed.

### Do the tests exercise the threat model?

Largely yes, and better than the average security patch. `gmail-ipc-policy.test.ts`
covers capability denial per group, invented thread/message IDs, propagation of
only source-held resources (with an `attacker@evil.co` CC in the handoff text
that correctly does **not** propagate), rejection of `newer_than:` operator
injection, rejection of a second address that is not granted, and that the
resolver cannot widen the matrix or the grammar. `gmail-ipc-business-scope.test.ts`
covers restart restoration, exact-address restriction, other-group refusal, and
fail-closed on database error. `gmail-ipc-handlers.test.ts` adds absent-`leadId`
blocking, unresolvable-party blocking on both send and reply, CC rejection on
replies, reply test routing with CC stripped, and — importantly — that a
test-routed delivery does **not** confirm a real customer's send.
`gmail-api.test.ts` proves the Gmail-derived recipient is validated before the
raw message is built. `ipc-gmail-auth.test.ts` proves end-to-end that a `grader`
`gmail_send` is quarantined while a `mailman` one dispatches.

Gaps the tests do **not** reach, each tied to a finding below: grant expiry and
restart behaviour for `mailman` (P1-1); the absence of any negative
acknowledgement to the container (P1-2); two concurrent expectations for one
address (P2-1); a spoofed `groupFolder` field present in the IPC JSON (P3-1 —
the code is correct, the assertion is simply missing); the quarantine directory
being enumerated as a source group (P3-2).

---

## 3. Findings

Severity: **P0** catastrophic/security blocker · **P1** commit-blocking
correctness or security · **P2** important, deferrable with explicit acceptance ·
**P3** improvement/backlog. Basis is stated per finding. No P0 was found.

---

### P1-1 · `gmail_reply` has no durable or reissuable grant, so every daemon restart strands operator-approved customer replies

**Confirmed** — evidence-supported from source; runtime frequency requires live
verification.

**Files.** `src/gmail-ipc-business-scope.ts:24`;
`src/gmail-ipc-policy.ts:214-222`, `:276-312`; `src/channels/gmail.ts:454-458`;
`src/ipc.ts:374-378`; `src/email-interaction-log.ts:33-38`;
`groups/chief/SUPPORT-REPLY.md:43`.

**Violated invariant.** Intended model item 7 — "process-local grants expire, but
scheduled Sales work may reconstruct…" — combined with `docs/SECURITY.md:96-97`,
"Other restart-stale context must be reissued by a host source." For
`gmail_reply` there is no host source that reissues. The invariant is documented
but unimplemented.

**Failure scenario.** There are exactly two grant origins in the codebase:
`src/channels/gmail.ts:454` (inbound Gmail message → grants `mailman` the
thread, message, and sender address) and `src/classify-ipc-handlers.ts:404`
(grants `chief` one correction message ID). Everything else flows through
`propagateGmailResources`, which can only move a resource the *source already
holds*. `resolveDurableGmailResource` returns `false` immediately for any group
other than `sales` (`:24`) and handles only `gmail_get_thread` and
`gmail_search`. Therefore:

1. A lead emails in at 09:00. `mailman` is granted the thread; the handoff
   propagates it to `sales`; `sales` drafts; the card is posted for approval.
2. The daemon restarts at 11:00 — a deploy, a crash, `launchctl kickstart`. The
   in-memory `grants` map (`gmail-ipc-policy.ts:54`) is empty.
3. The operator approves at 11:30. `sales` emits
   `[HANDOFF: sales→mailman]` carrying `Thread-ID:`.
   `propagateGmailResources('sales','mailman',…)` finds no active `sales` grant
   and returns at `:143` without granting anything.
4. `mailman` issues `gmail_reply`. `authorizeGmailIpc` rejects at `:216`
   ("thread was not assigned by the host"). The resolver refuses at `:24`
   because the group is not `sales`. The file is quarantined. **The approved
   customer reply is never sent.**

`sales` can sometimes self-heal, because a successful resolver call grants the
thread (`gmail-ipc-policy.ts:310`) and that grant then propagates onward — but
only when the durable proof exists. The proof query requires
`business_v2.interactions` with `channel='email'` and
`metadata->>'thread_id' = $1`. Grepping every writer, the **only** producer of
that metadata key is `logOutboundEmailInteraction` (`email-interaction-log.ts:33-38`),
which runs exclusively after a successful *outbound* send. No inbound path writes
it — `email-unsubscribe.ts:52` is the only other `channel='email'` inbound writer
and it carries unsubscribe metadata. Consequently:

- **Follow-ups recover** after restart (a prior outbound exists).
- **First replies to a new inbound lead never recover** — the highest-value,
  most time-sensitive case.
- **Chief's support-reply path never recovers**, in-process or not: chief is
  granted only message IDs, never thread IDs, so
  `[HANDOFF: chief→mailman]` with `Thread-ID:` (`SUPPORT-REPLY.md:43`)
  propagates nothing. In-process it works only because `mailman` still holds the
  inbound grant.

The blast radius is bounded by NC-20260729-003 — the send-watchdog will raise
`[SEND NOT OBSERVED]` roughly six minutes later — so this fails loud rather than
silent. It is still a customer-facing outage of the primary revenue path,
triggered by an ordinary operational event.

**Do tests detect it?** No. `gmail-ipc-business-scope.test.ts:6` covers the
`sales` restart case only. No test exercises `mailman` + `gmail_reply` with an
empty grant map.

**Smallest safe correction.** One of:

- (preferred) grant at the approval boundary: when the host records an approved
  send card, call `grantHostGmailResources('mailman', { threadId })` using the
  `Thread-ID` the *host* holds for that card, not the handoff text. This is a
  host source reissuing a host-origin resource and matches the documented model
  exactly; or
- extend `resolveDurableGmailResource` to accept `mailman` + `gmail_reply`,
  proving the thread from the same non-terminal-pipeline query, and additionally
  match `i.source_thread_id = $1` so inbound-only threads can qualify; or
- if neither is acceptable in this slice, populate `metadata.thread_id` (or
  `source_thread_id`) on inbound email interactions, which the improvement plan
  already lists as a gap, and accept that first replies still fail until then.

**Blocks this commit?** Yes — or, at minimum, it must be recorded as an explicit
pre-deploy gate in `ACTIVE-WORK` and the changelog. Committing is defensible only
if deployment is blocked on it; shipping this to the Mac Mini as-is will break
approved replies at the next restart.

---

### P1-2 · A quarantined Gmail IPC returns a success-shaped message to the agent and then never answers, reproducing the exact failure NC-20260728-003 was written about

**Confirmed** — evidence-supported.

**Files.** `src/ipc.ts:507-522`; `container/agent-runner/src/ipc-mcp-stdio.ts:565-581`
and `:590-606`; `src/gmail-ipc-handlers.ts:667-670`, `:688-691`, `:711-714`.

**Violated invariant.** Not one of the fourteen stated items — which is the
point. The design says denied requests are "quarantined rather than dispatched or
silently deleted" (item 6). They are. But nothing tells the *caller*, and the
container tool has already told the model the opposite.

**Failure scenario.** `gmail_read` and `gmail_get_thread` return immediately with
`"Read queued for message X. Content will arrive as a follow-up message."` The
real result is delivered asynchronously by `writeInputMessage` into the group's
`input/` directory. When the host quarantines the request, `writeInputMessage` is
never reached, so no follow-up ever arrives. The agent believes it succeeded and
waits.

This is precisely the sequence recorded in `ACTIVE-WORK` under NC-20260728-003:
the agent "logged 'Gmail search result arrived' … and by 10:57:14Z reported
'Still awaiting the Gmail search result', then classified the lead as 'already
posted and awaiting approval' — it had lost the approval itself," and separately
told the operator that "MCP connectivity issues blocked the send," a cause the
investigation found to be fabricated. A new, deliberately-frequent denial path
that produces no negative acknowledgement will regenerate that behaviour, and the
new group prompts actively instruct agents to "stop and escalate" on rejection —
which they cannot do, because they are never told.

Combined with P1-1, the compound case is: mailman's reply is quarantined, mailman
reports the send as queued, sales reports the lead handled, and the operator
learns the truth six minutes later from the watchdog.

**Do tests detect it?** No. `ipc-gmail-auth.test.ts:108` asserts the file is
quarantined and dispatch is not called; it does not assert anything is written
back.

**Smallest safe correction.** In the quarantine branch of `src/ipc.ts`, write one
`type:'message'` file into `data/ipc/<sourceGroup>/input/` —
`[gmail_${type} DENIED] ${authorization.reason}. Do not retry with a different
ID or address; escalate.` This is roughly ten lines, reuses the existing
`writeInputMessage` shape, leaks no resource the group does not already know
about (the reason strings name only the request's own fields), and turns a silent
stall into the escalation the prompts already ask for.

**Blocks this commit?** Yes. It is small, it is in-scope, and it is the
difference between fail-loud and fail-confusing on a path this change makes
common.

---

### P2-1 · `clearPendingSendsByRecipient` discharges every outstanding expectation for an address, so a second approved email to the same person becomes silent again

**Confirmed** — evidence-supported.

**Files.** `src/db.ts:960-970`; `src/send-watchdog.ts:139-151`;
`src/gmail-ipc-handlers.ts:351`, `:606`.

**Violated invariant.** Item 13 — "An approved-send expectation is cleared only
after Gmail confirms a real production delivery." Singular "an expectation"; the
implementation clears all of them.

**Failure scenario.** The DELETE is
`WHERE LOWER(COALESCE(recipient,'')) = ?` with no `draftTs`, no group, no
`LIMIT`, and no ordering. Two approved cards for the same lead — a reply to their
question plus an approved follow-up, or a re-approval after an earlier block, or
a `chief` support reply and a `sales` reply to the same person — produce two
`pending_sends` rows with the same recipient. The first confirmed send deletes
both. If the second is then blocked by the content guard, no row remains, the
sweep finds nothing overdue, and the operator sees silence after their own
approval. That is exactly the class of failure NC-20260729-003 exists to
eliminate, narrowed to the same-recipient case.

The join key genuinely cannot be the group folder — the NC-003 reasoning is
correct — but it can be tighter than the recipient alone.

**Do tests detect it?** No. `send-watchdog.test.ts` covers single-row clearing,
case-insensitivity, display-name unwrap, wrong-recipient no-clear, and undefined
recipient. There is no two-rows-one-address case.

**Smallest safe correction.** Delete the single oldest matching unfulfilled row:
`DELETE FROM pending_sends WHERE rowid = (SELECT rowid FROM pending_sends WHERE
LOWER(COALESCE(recipient,''))=? ORDER BY approvedAt LIMIT 1)`, and log when more
than one candidate existed. Returning `changes` still works for the existing log
line.

**Blocks this commit?** No — deferrable with explicit acceptance, but it is a
three-line SQL change and belongs here.

---

### P2-2 · Grants are group-global and monotonically accumulating, so "a resource the source already holds" is a weak constraint after minutes of uptime, and an attacker-controlled email body can widen Sales' search scope to any previously-seen address

**Confirmed** — evidence-supported. Exploitability requires prompt injection plus
prior contact; the memory-growth half is unconditional.

**Files.** `src/gmail-ipc-policy.ts:47-80` (`writableGrant`), `:97-104`
(`extractEmails`), `:137-167` (`propagateGmailResources`);
`src/channels/gmail.ts:454-458`; `src/host-router.ts:43-70` (`fmtLeadSales`
embeds the full inbound `Body`).

**Violated invariant.** Item 4 — "Host-issued resources may propagate through a
handoff only if the source already holds them." Satisfied literally; defeated in
spirit, because the source's holdings are not scoped to the work item.

**Failure scenario.** `writableGrant` refreshes `expiresAt` on every *write*, so
for `mailman` — which receives a grant for every inbound message
(`channels/gmail.ts:454`) — the 24-hour TTL never elapses on a live mailbox. The
`emailAddresses`, `messageIds`, and `threadIds` sets therefore grow for the whole
process lifetime and are never pruned. Two consequences:

1. **Authorization drift and cross-party disclosure.** `propagateGmailResources`
   extracts *every* address in the handoff text with `EMAIL_RE` and forwards each
   one that `mailman` holds. `fmtLeadSales` embeds the inbound email body
   verbatim (`host-router.ts:69`). An attacker who writes
   "please loop in victim@othercompany.com" gets `victim@othercompany.com`
   propagated to `sales` — provided `mailman` has seen mail from that address at
   any point since the daemon started, which after a week of uptime covers a
   large share of the customer base. `sales` may then run
   `gmail_search from:victim@othercompany.com OR to:victim@othercompany.com` and
   receive that correspondence as agent context. An injected instruction in the
   same body can ask it to do so. The policy test's `attacker@evil.co` case
   passes only because that address was never granted; it does not model an
   address the host legitimately holds for a *different* work item.
2. **Unbounded memory.** One `Set` entry per inbound message ID and thread ID,
   forever, on a long-lived daemon.

**Do tests detect it?** No. `gmail-ipc-policy.test.ts:67` tests propagation from a
grant containing exactly the one relevant address.

**Smallest safe correction.** Two independent mitigations, either helps:

- cap propagation to the addresses that appear in *host-generated header lines*
  (`From:`, `To:`, `CC:`) rather than anywhere in the text, and never scan the
  `Body:` region; and/or
- key grants by work item (thread) rather than by group, so a group's holdings
  are naturally scoped and expire with the item. That is the ledger/capability
  slice the plan already schedules — note it there rather than building it now.

At minimum, bound the sets (LRU or per-resource TTL rather than a single
whole-grant expiry refreshed on write).

**Blocks this commit?** No. Record as accepted residual risk with a follow-up
row; the containment is still a large net improvement over "every group can read
the whole mailbox."

---

### P2-3 · The NC-20260729-003 changelog entry now describes test-routing behaviour that is not in the build deployed to the Mac Mini, while retaining that deployment's evidence

**Confirmed** — evidence-supported.

**Files.** `docs/ENGINEERING-CHANGELOG.md:121-126` and `:153-167`;
`docs/ACTIVE-WORK.md:104-105`; `src/gmail-ipc-handlers.ts:351`, `:606`;
`docs/ENGINEERING-CHANGELOG.md:57-59` (NC-004's own account of the change).

**Violated invariant.** `docs/CHANGE-PROTOCOL.md:172-175` — "Never rewrite a
build as a deployment"; `docs/SECURITY.md:222-225` — uncommitted, committed,
deployed, live-verified and outcome-validated states must be recorded
separately.

**Failure scenario.** The NC-003 entry states the callback fires "only after
`replyToThread`/`sendEmail` returns for a production delivery. Under
`GMAIL_TEST_RECIPIENT`, neither send nor reply fires the callback." NC-004's own
entry says the opposite about history: "The overlapping NC-20260729-003 callback
also initially cleared a customer's expectation after a test-routed delivery; it
now fires only for a production recipient." The `if (!GMAIL_TEST_RECIPIENT)`
guards at `:351` and `:606` are NC-004 code. The build on the Mac Mini was
compiled at 2026-07-30T00:09Z from pre-NC-004 source (pid 2480), so the deployed
daemon does **not** have this behaviour — yet the NC-003 entry carries
`State: deployed_unverified`, the pid-2480 restart evidence, and the amended
description in one block, with no dated addendum separating them. A future reader
reconstructing production behaviour from tracked files will get it wrong.

Both entries are uncommitted, so no committed history was rewritten; the defect
is factual accuracy of the shared record, not protocol mechanics.

**Do tests detect it?** Not applicable. `docs:continuity-check` passes — it
validates structure, IDs, statuses and timestamps, not whether a description
matches a deployed artifact.

**Smallest safe correction.** In the NC-003 entry, restore the description of
what was actually deployed and append a dated addendum:
"2026-07-30T03:26Z — superseded in the worktree by NC-20260729-004, which
suppresses the callback under `GMAIL_TEST_RECIPIENT`. The Mac Mini build of
2026-07-30T00:09Z does not contain that guard." Mirror the note in the
`ACTIVE-WORK` NC-003 detail block.

**Blocks this commit?** No, but fix it in the same commit — it costs four lines
and the whole point of the register is that it can be trusted.

---

### P2-4 · The durable resolver's hot-path query has no supporting index

**Plausible** — structurally confirmed from the tracked schema; actual cost
requires live verification against production table sizes.

**Files.** `src/gmail-ipc-business-scope.ts:28-39`;
`src/gmail-ipc-handlers.ts:100-106`;
`agent_docs/nanoclaw-business-v2-schema.sql:2540`, `:2547`.

**Violated invariant.** None stated; this is the reliability/performance question
the review brief asks directly.

**Failure scenario.** The only indexes on `business_v2.interactions` are
`(party_id, occurred_at DESC)` and a partial `(source_provider, source_id)`.
There is no expression index on `(metadata->>'thread_id')`. Both the new
resolver and `resolvePartyId`'s thread fallback filter on exactly that
expression, so each call plans a sequential scan joined against
`pipeline_entries`. The resolver runs on the *authorization* path — on every
`sales` request that misses its process-local grant, i.e. on every request in the
window after a restart, which is exactly when load is highest. `lead-matcher.ts:47`
already uses the same pattern, so this is a pre-existing shape that the change
makes hotter rather than a new mistake.

**Do tests detect it?** No — `gmail-ipc-business-scope.test.ts` injects a stub
`queryFn`.

**Smallest safe correction.** Add a tracked migration under
`data/business/migrations/nanoclaw-v2/`:
`CREATE INDEX CONCURRENTLY interactions_email_thread_idx ON business_v2.interactions ((metadata->>'thread_id')) WHERE channel = 'email';`
Do not create it as part of this task — it is a schema change requiring its own
migration evidence and its own task ID.

**Blocks this commit?** No.

---

### P3-1 · `groupFolder` spoofing is correctly ignored but never asserted

**Confirmed** (the code is right; the coverage is missing).
`src/ipc.ts:502-506` authorizes from the directory-derived `sourceGroup`, and
`:543-547` re-stamps `groupFolder: sourceGroup` *after* the spread so a payload
field cannot survive. `ipc-gmail-auth.test.ts:86-93` writes a fixture with no
`groupFolder` at all, so the override is never actually exercised. Add
`groupFolder: 'mailman'` to the grader fixture and assert it is still
quarantined. Two lines. Does not block.

### P3-2 · The quarantine root is enumerated as a pseudo source group on every poll

**Confirmed.** `src/ipc.ts:207-210` filters `ipcBaseDir` entries by
`isDirectory() && f !== 'errors'`, and `quarantineIpcFile` creates
`DATA_DIR/ipc/quarantine/` directly under that root. `quarantine` is therefore
walked as a group name once per `IPC_POLL_INTERVAL`. It is inert today only
because the layout is `quarantine/<group>/file.json`, so
`quarantine/messages/` never exists — the scan finds no `messages`, `tasks`,
`jobs`, or `ack` subdirectory and moves on. It becomes live if a directory named
`messages`, `tasks`, `jobs`, or `ack` ever appears under `data/ipc/` and one of
its files is quarantined, at which point the quarantined file is re-read as a
message from source group `quarantine`. Container mounts do not currently permit
that, so this is hardening, not an exploit. Add `quarantine` to the exclusion at
`:209` alongside `errors`, or place the quarantine root outside `data/ipc/`.
Separately, nothing prunes quarantine, and there is no retention policy; the
directory is correctly Git-ignored (`.gitignore:11` via `/data/*`). Does not
block.

### P3-3 · Terminal pipeline stages are hardcoded rather than read from the taxonomy

**Confirmed.** `gmail-ipc-business-scope.ts:35`, `:52` use
`stage NOT IN ('won','lost')`. `business_v2.pipeline_stages` exists precisely as
the "stage taxonomy with terminal flag"
(`nanoclaw-business-v2-schema.sql:1454`). A future terminal stage added to the
taxonomy would silently keep authorizing. The rest of the codebase uses the same
literal pair (`:1846`, `:2575`), so this is consistent with existing practice
rather than a regression; note it against the taxonomy-consolidation backlog.
Does not block.

### P3-4 · `propagateGmailResources` forwards only the first held thread and first held message ID

**Confirmed.** `gmail-ipc-policy.ts:154-165` `break`s after the first match
because `GmailResourceGrantInput` carries singular fields. A legitimate handoff
naming two host-held threads propagates one. No current formatter emits two, so
this is latent. Widen the input to arrays when a caller needs it. Does not block.

### P3-5 · Documentation overstates two boundaries

**Confirmed.**

- `docs/SECURITY.md:88-89` says threaded `gmail_send` "requires the
  corresponding host grant." True for a caller-supplied `threadId`, but
  `resolveSendThreadId` (`gmail-ipc-handlers.ts:462-483`) recovers a thread via
  `findThreadForReply` *after* authorization and attaches the send to it. The
  recovered ID is Gmail-derived from an already-verified party address, so the
  behaviour is safe; the sentence is imprecise. (I checked the query
  construction at `gmail-api.ts:581` — `base` has quotes stripped and stays
  inside a quoted phrase, `addr` is a verified party address, so there is no
  operator-injection path.)
- `docs/SECURITY.md:99-114` states the final recipient boundary without
  qualification, but it governs the Gmail IPC path only. `digest-delivery.ts:61`
  calls `sendEmail` directly, and the `courses` SMTP path bypasses it entirely —
  the latter is already disclosed at `:151-154`, the former is not. Add
  `digest-delivery` to the same exception list.

Does not block.

### P3-6 · `groups/_TEMPLATE/CLAUDE.md` still advertises `gmail_send` / `gmail_reply` to every future group

**Confirmed.** Any group created from the template inherits instructions for two
operations the matrix denies, producing a quarantine on first use. Update the
template to state that Gmail capability is host-granted per group. Does not
block.

### P3-7 · The host-initiated proposal-approval send is attributed to `sales` and skips the confirmation callback

**Confirmed.** `src/index.ts:1857-1873` calls `handleGmailSend` directly with
`groupFolder: 'sales'`, bypassing the IPC boundary — correct, because the host
does not need to authorize itself, and `handleGmailSend` still performs full
party/recipient verification. Two notes: (a) the matrix in `PROJECT-MAP.md` and
`SECURITY.md` says "sales: no Gmail send/reply" without recording this
host-initiated exception, so the tables read as stricter than reality; (b) the
call passes no `onSendConfirmed`, which is harmless today only because
`recordApproval` fires exclusively on `[SALES REVIEW]` cards
(`send-watchdog.ts:63`, `:88`) and proposal drafts are a different card type — a
coupling worth stating rather than relying on. Does not block.

---

## 4. Hypotheses requiring live verification

Listed separately because the tracked repository cannot settle them.

1. **Restart frequency of the production daemon.** P1-1's severity is a direct
   function of how often the Mac Mini daemon restarts. A read-only
   `launchctl print` plus daemon-start log timestamps would size it.
2. **Installed healer unit state.** The tracked template now sets
   `HEALER_IMPLEMENT_ENABLED=0`, and `src/healer/implement.ts:36` genuinely gates
   on `=== '1'`, so the flag is real and default-off. On *this* Mac Studio
   checkout no `com.nanoclaw.healer.fast` unit is installed and `launchctl list`
   shows no healer job — but this is not the runtime host and proves nothing
   about the Mac Mini. Item 14 is verified as written: the change alters the
   tracked template only. Live state remains unestablished.
3. **`business_v2.interactions` row count and resolver latency** (P2-4).
4. **Whether any `pending_sends` rows currently share a recipient** (P2-1
   frequency).
5. **Whether the deployed Mac Mini build predates NC-004** (P2-3). Inferred from
   the 00:09Z build timestamp recorded in the changelog against source that now
   contains NC-004 guards; confirm by inspecting `dist/` on the Mini.

---

## 5. Intended security model — item-by-item disposition

| # | Item | Disposition |
| --- | --- | --- |
| 1 | Identity from source directory, not model-supplied `groupFolder` | **Holds.** `ipc.ts:502`, `:546`. Untested (P3-1) |
| 2 | Operation matrix per group | **Holds.** `gmail-ipc-policy.ts:26-39`; enforced `:206` |
| 3 | Model text cannot mint Gmail authority | **Holds.** `propagateGmailResources` intersects against source holdings |
| 4 | Handoff propagates only source-held resources | **Holds literally; weak in practice** — P2-2 |
| 5 | Search grammar limited to exact `from:`/`to:` | **Holds.** `:169-183`, anchored, whitespace-normalized, operator injection rejected |
| 6 | Denied requests quarantined, not dispatched or deleted | **Holds** for the file; **incomplete** for the caller — P1-2 |
| 7 | Grants expire; Sales may reconstruct from active pipeline | **Partially holds** — the Sales path works for follow-ups only, and no equivalent exists for the reply path — P1-1 |
| 8 | Database errors fail closed | **Holds.** `gmail-ipc-business-scope.ts:60-66`; `getPartyEmails` returns an empty set and `checkRecipient` now rejects an empty set (`email-recipient-guard.ts:76-81`) |
| 9 | `leadId`/recipient/thread/group are candidates, not authority | **Holds.** `verifyPartyRecipient:157-183` — a claimed party cannot add an address, because the allowlist always comes from `getPartyEmails(partyId)` |
| 10 | Host resolves and verifies final To and CC | **Holds** on the IPC path; two non-IPC senders are outside it — P3-5 |
| 11 | Reply recipient derived from Gmail and validated before construction | **Holds.** `gmail-api.ts:411-421` — `prepareSend` runs before `buildRawMessage`, and a `RecipientPolicyError` aborts before any send |
| 12 | Test routing redirects both, strips CC, does not clear the customer's expectation | **Holds.** `gmail-api.ts:412-413`; `gmail-ipc-handlers.ts:351`, `:606`; covered by tests |
| 13 | Expectation cleared only on confirmed production delivery | **Holds for one expectation; over-clears when two share an address** — P2-1 |
| 14 | Tracked healer default off ≠ installed unit changed | **Holds.** Template `=0`; `implement.ts:36` gates on `=== '1'`; docs consistently refuse to claim live state |

---

## 6. Documentation consistency

Checked `docs/PROJECT-MAP.md`, `docs/SECURITY.md`,
`docs/COMPANY-OS-IMPROVEMENT-PLAN.md`, `docs/ACTIVE-WORK.md`,
`docs/ENGINEERING-CHANGELOG.md`, and the six group procedures against the code.

**Accurate and unusually disciplined.** No document claims commit, deployment,
migration, live verification, or business outcome that did not occur. Every
Gmail-containment statement is explicitly labelled uncommitted
(`PROJECT-MAP.md` "uncommitted implementation state until the active-work and
changelog record says otherwise"; `SECURITY.md:70-71`; the plan's
"Implementation checkpoint" block). The healer template is consistently
distinguished from the installed unit in all four places it appears. Group
prompts match the matrix: `contador` and `archivarista` were correctly switched
from Thread-ID to Message-ID for `gmail_read`, and `sales/WORKFLOWS.md`'s
remaining `gmail_send`/`gmail_reply` mentions all describe what *Mailman* does,
not what Sales calls — no residual instruction tells a group to invoke an
operation it no longer holds.

**Inconsistencies found:** P2-3 (NC-003 entry describes undeployed behaviour),
P3-5 (two overstated boundaries), P3-6 (stale template), P3-7 (matrix omits the
host-initiated proposal send).

**Resumability.** A new Claude or Codex session can reconstruct what changed,
why, what is authoritative, what was verified and at which level, and what
remains open, entirely from tracked files. `docs/CHANGE-PROTOCOL.md:292-306` is
satisfied — with the P2-3 correction applied.

**Missing observability/rollback requirement.** Quarantine has no metric, no
alert, and no retention policy. A steady trickle of quarantined `gmail_*` files
is the primary signal that P1-1 is happening in production, and today nothing
surfaces it except a `logger.warn`. Before deployment, add either a periodic
count of `data/ipc/quarantine/**` to the health surface or a Slack notice on the
first quarantine per group per hour. Rollback for NC-004 is otherwise clean —
revert the source, prompt, and template changes together, as the changelog
states — but note the entanglement recorded under P2-3: NC-004 modifies files
NC-003 already deployed, so a revert of "NC-004 only" restores neither the
deployed Mini build nor a coherent NC-003 state without care.

---

## 7. Unrelated dirty files — preserved

The worktree carries changes outside NC-004's scope: `scripts/copiers/copy_chat.py`
and `copy_people.py` (NC-20260728-006), thirteen `knowledge/**` files
(NC-20260729-002), `src/markdown-to-email-html.ts` and its test, and the two
untracked NC-20260729-001 documents. `src/send-watchdog*`, `src/db.ts`,
`src/index.ts`, `src/ipc.ts`, `src/gmail-ipc-handlers.ts` and `tsconfig.json`
carry overlapping NC-20260729-003 work.

**Confirmed preserved.** This review ran no `git reset`, `git checkout --`,
`git clean`, `git stash`, formatting pass, generated-file rewrite, or dependency
install. `git status --short` reported 51 paths before the review and 51 paths
after it, plus this new report. No file outside
`docs/reports/NC-20260729-004-CLAUDE-IMPLEMENTATION-REVIEW.md`,
`docs/ACTIVE-WORK.md`, and `docs/ENGINEERING-CHANGELOG.md` was written, and the
latter two were limited to their NC-20260729-004 sections.

---

## 8. Does the evidence support committing the scoped change?

**Yes, after P1-1 and P1-2 are addressed** — and the commit must not be followed
by a deployment until P1-1 is resolved, not merely documented.

The reasoning: this change closes a genuinely critical hole. At the reviewed
baseline every one of roughly sixteen agent containers could invoke the entire
`gmail_*` family against the company mailbox, `gmail_send` made party
enforcement conditional on a model-supplied `leadId`, and `gmail_reply` skipped
recipient validation, CC validation, and test routing altogether. What replaces
it is a real host-enforced matrix with resource scoping, a tight search grammar,
fail-closed party resolution, and negative tests. Leaving that uncommitted while
perfecting the grant lifecycle would be the worse trade.

But P1-1 converts a security fix into a delivery outage on the primary revenue
path at the next restart, and P1-2 makes every denial look like a success to the
agent that caused it. Both are small. Fix them, rerun the affected suites plus
`npm run typecheck`, `npm test`, the runner build and suite,
`npm run docs:continuity-check`, and `git diff --check`, then commit the NC-003
and NC-004 work together with the P2-3 correction applied.

---

## 9. Residual risks and explicitly deferred work

Accepted for this slice, to be carried as backlog rows rather than fixed here:

1. **Approval is still not bound to the executed action.** A verified recipient
   proves the address belongs to a Party; it does not prove this is the message
   the operator approved. `docs/SECURITY.md:118-126` already names the host-owned
   action record (normalized recipient, body hash, nonce, approver, expiry,
   policy version) as the next slice. Unchanged by this task.
2. **Group-global grant accumulation** (P2-2), pending the work-item ledger.
3. **One shared MCP namespace.** Every group still *sees* every `gmail_*` tool;
   only the host refuses. Capability manifests are a later slice.
4. **`courses` raw SMTP** and **`digest-delivery`** remain outside the recipient
   boundary.
5. **No global external-write safe mode** at the final boundary — still absent,
   still the plan's Wave 0 item.
6. **Runtime drift.** `.nvmrc` pins 22; the authoring shell is 26.5.0 and the
   production Mac Mini was recorded at 25.8.2. No enforced runtime matches the
   pin. This review pinned 22 explicitly for every check.
7. **Inbound interactions carry no thread lineage**, which is what limits P1-1's
   durable-recovery option and is already recorded in the improvement plan.
8. **Quarantine growth and observability** (see §6).

---

## 10. Statement of no production change

No production change was performed by this review.

No commit, stage, push, branch, deployment, service start/stop/restart, launchd
load or unload, database migration, production write, credential read or
rotation, schedule change, approval, Slack message, or email occurred. No live
external system was contacted. No secret, token, credential, session file,
database row, log body, backup, or customer content was read, printed, or
transmitted. No implementation code was edited. Every command run was read-only
apart from the three permitted documentation writes and the test/build
toolchain's own temporary output, which writes only inside the repository's
ignored build and cache paths.

The account label used for this session is `info-tandem`, recorded as a label
only.
