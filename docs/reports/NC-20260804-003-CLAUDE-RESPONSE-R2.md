# NC-20260804-003 — Claude response R2

## 1. Verdict

**Verdict: CONVERGED**

Every R1 finding is either fixed, rejected with evidence I independently
verified, or accepted as a bounded residual that cannot put unapproved content
in front of a customer. B1's incident mechanism — a superseded revision
executing byte-perfectly because the claim hash became tautological — is closed
at two independent layers (durable supersession, and ambiguity detection with
raw bytes demoted to corroboration only). I found no new blocking defect.

Two non-blocking items I would fold into the same commit are in §6. Neither is
a release blocker and I am not proposing them as one.

---

## 2. B1 closure analysis

The repair makes action *selection* durable rather than trying to re-establish a
content cross-check. That is the right axis: the whole point of the delta is
that the model cannot be depended on to reproduce bytes, so a hash equality was
never going to survive as a selector.

### 2.1 Same-work-thread supersession — closed

`src/db.ts:1266-1312`. Inside the same transaction as the upsert,
`recordPendingSend` blocks every older action in the same
`(group_folder, chat_jid, thread_ts)` whose state is
`approved | handoff_routed | mailman_started | attention_required`, writing
`superseded_by_newer_approval` to both the row and the append-only ledger
(`src/db.ts:1288-1310`).

Three properties matter and all hold:

- **`executing`, `uncertain` and `confirmed` are excluded** from the state set
  (`src/db.ts:1279`). An action that may already have reached Gmail is never
  retroactively cancelled.
- **Ordering is anchored to the stored row, not the call.** The comparison uses
  `stored.approved_at` / `storedIdentity.rowid` (`src/db.ts:1283-1287`), and the
  `ON CONFLICT … DO UPDATE` clause does not touch `approved_at`
  (`src/db.ts:1226-1231`). So re-reacting ✅ on an *older* card cannot supersede
  a newer approval — the stale card's `approved_at` is still the original. This
  is the property that makes the fix safe against operator retries, and it is
  correct.
- **A re-✅ cannot resurrect a superseded action.** `action_id` is preserved via
  `COALESCE(pending_sends.action_id, excluded.action_id)` and `state` is not
  reset, so the row stays `blocked`.

The thread key is the same value the approval listener already derives —
`approvalThreadTs = card.thread_ts ?? card.id` (`src/index.ts:1971`) — and Sales
revises in-thread, so v1 and v2 of a corrected card share it.

I re-walked my R1 reproduction against the current tree:

1. ✅ card v1 → row1 (`approved`, `gmail_thread_id = T`).
2. ✅ card v2 in the same Slack thread → `recordPendingSend` transitions row1 to
   `blocked / superseded_by_newer_approval`.
3. Mailman emits `gmail_reply` on thread `T` with no `action_id`.
4. `getPendingSendByGmailThread` (`src/db.ts:1684-1705`) excludes `blocked`, so
   row1 is not a candidate; row2 is the single candidate.
5. Rehydration loads **card v2**; the superseded draft is unreachable.

Covered by `src/db.test.ts` `supersedes an older pre-Gmail action in the same
Slack work thread`, which also asserts the ledger event and that a later claim
on the superseded ID returns `held / action is blocked`.

### 2.2 Ambiguous Gmail thread — closed

`getPendingSendByGmailThread` now returns `{action, candidates, ambiguous}` with
`ORDER BY approved_at DESC, rowid DESC LIMIT 2`, and `action` is populated
**only** when exactly one candidate exists (`src/db.ts:1700-1704`). The
silent-oldest selection is gone.

At the boundary (`src/ipc.ts:860-900`), an ambiguous thread is resolved by
hashing the *candidate's own stored subject* against the request body
(`src/ipc.ts:868-874`). This is the correct shape: it tolerates the subject
mutation that recurred in production, requires an exact body, and — critically —
the matched candidate's **card**, not the request bytes, is what executes.
Anything other than exactly one match quarantines and posts
`[EMAIL ACTION HELD]` (`src/ipc.ts:878-899`).

For the incident's own mutation shape (`&` → `&amp;` in the body) no candidate
matches, so an ambiguous thread **holds** rather than guessing. Fail-closed in
the exact production case.

Two edge cases I checked and consider safe:

- With three or more approvals on one thread, `LIMIT 2` means the oldest is not
  a candidate. If the true target is that third row, no candidate matches and
  the request holds. Fail-closed.
- `executing` is not excluded from the candidate query, so an in-flight v1 can
  still appear as a candidate — but the terminal pre-check
  (`src/ipc.ts:1035-1044`) catches `executing`/`uncertain` before rehydration and
  posts `[EMAIL HELD]`. No send.

Covered by `src/db.test.ts` `reports ambiguity when one Gmail thread belongs to
multiple work threads` and `src/ipc-gmail-auth.test.ts`'s ambiguous-thread reply
regression.

### 2.3 Missing Action-ID — closed

Both no-ID routes are now ambiguity-aware end to end:

- `gmail_reply` → `approvedReplyBinding` (§2.2).
- `gmail_send` → exact-hash lookup on `requestedContentSha256`
  (`src/ipc.ts:904-942`), then the recipient/thread context lookup
  (`src/ipc.ts:943-956`), which already returns `ambiguous` on two rows
  (`src/db.ts:1310-1319`). Unresolved → `[EMAIL ACTION HELD]`
  (`src/ipc.ts:980-1001`).

Note `requestedContentSha256` is now only computed when both `data.subject` and
`data.body` are strings (`src/ipc.ts:834-843`), which means it is always
`undefined` for `gmail_reply` — the MCP `gmail_reply` schema has no `subject`
field at all (`container/agent-runner/src/ipc-mcp-stdio.ts:554-577`). That is
consistent, not a gap: the reply path is served by the thread binding, and the
ambiguity corroboration deliberately uses the candidate's stored subject rather
than a model-supplied one.

The Lead #1029/#1032 recovery path — unthreaded `gmail_send`, no Action-ID,
`&amp;`-mutated subject *and* body — still resolves and executes the exact
approved card. Verified by the `unthreadedMutatedSend` regression in
`src/ipc-gmail-auth.test.ts`, which passed here.

### 2.4 Stale explicit Action-ID from the same work thread — closed

`getPendingSendByActionId` returns the superseded row, and the terminal
pre-check (`src/ipc.ts:1045-1051`) posts
`🚫 [EMAIL BLOCKED] … superseded_by_newer_approval. Gmail was not called.` and
`continue`s **before** card rehydration and before any Gmail call. The operator
sees the outcome in the originating approval thread.

### 2.5 Unrelated copied Action-ID — bounded residual, not a blocker

This is the case Codex asked me to rule on explicitly. An Action-ID copied from
a *different* lead's approval thread is not superseded (different `thread_ts`),
so the host rehydrates and executes that action's own durable card.

**Customer impact analysis.** The executed email is lead X's operator-approved
subject/body, sent to lead X's approved recipient, on lead X's Gmail thread,
against lead X's one-time claim and receipt. When Mailman later fires X's ID for
X itself, the terminal pre-check returns `[EMAIL ALREADY SENT]`, so X receives
it exactly once. Lead Y's action stays non-terminal and surfaces via the
watchdog. Net effect: **a mis-sequenced delivery of an approved email plus a
visible unsent-action alert.** No unapproved content, no wrong recipient, no
duplicate.

That is categorically different from B1's incident case, where content the
operator had explicitly revised away reached the customer. Pre-delta this case
was caught only *incidentally*, by a hash check whose real job was "did the model
reproduce the bytes" — the exact dependency being removed as a delivery
requirement. Losing an incidental backstop for a benign failure mode is an
acceptable trade.

**My answer to the request's question: no, additional source-work-unit binding
is not required before activation.**

I will note the cheapest future hardening, because the host already has the
signal and currently discards it: `observeOutbound` (`src/send-watchdog.ts:262-287`)
resolves the routed handoff by ANDing `actionId`, `groupFolder`, `recipient` and
the handoff's own content hash. A handoff carrying lead X's Action-ID with lead
Y's recipient and body matches **nothing**, and the code silently falls back to
recipient-keyed marking (`:288-291`). Turning that specific miss — an
`actionId` present but no AND-match — into a visible hold would catch
cross-thread contamination at routing time, upstream of Gmail, with no schema
change. Post-release cleanup, not a blocker.

---

## 3. R1 finding reconciliation

| R1 | Status | Evidence |
| --- | --- | --- |
| **B1** wrong-action execution via tautological claim hash | **fixed** (bounded residual §2.5) | `src/db.ts:1266-1312, 1684-1705`; `src/ipc.ts:845-900, 1027-1052`; regressions in `db.test.ts` and `ipc-gmail-auth.test.ts` |
| **N1** post-claim block still says "reconcile the receipt" | **fixed** | `src/ipc.ts:1194-1199` — `priorGmailAttempt` is now `executing`/`uncertain`/`gmailMessageId`/`gmailResultThreadId`; `executionStartedAt` no longer counts. The terminal pre-check (`:1045-1051`) also intercepts `blocked` earlier with a "Gmail was not called" message |
| **N2** Party-ID fallback removed | **rejected — evidence verified** | I read the tracked definition: `business_v2.best_party_by_email` selects from `business_v2.party_emails` ordered `is_primary DESC, verified_at DESC` (`data/business/migrations/nanoclaw-v2/11_helpers.sql:61-70`). It resolves every normalized address, not just a primary. The hint could only have helped when the address was already in `party_emails` for the claimed party — in which case host resolution finds it too, so the fallback was near-redundant. My R1 uncertainty is resolved; the rejection is correct |
| **N3** host-injected `threadId` denial after restart | **fixed** | Resolver now grants when `request.threadId === approvedAction.gmailThreadId` for `gmail_reply` **and** `gmail_send` (`src/ipc.ts:1099-1106`); the granted thread is host-derived, never model-supplied. A bound-action denial now terminalizes the action and posts to its own approval thread (`src/ipc.ts:1130-1139`) |
| **N4** whole-card `emailType` matching | **fixed** | `src/approved-send-handoff.ts:182-186` derives it from `header` with `^\s*\[FOLLOW-UP\s+#\d+\]`. I executed the parser: a marker inside the fenced body now yields `emailType=initial` (unsubscribe-footer drift closed). Residual narrowed to a line-start marker in the header region, which the `[SALES REVIEW]` template cannot produce and Slack quoting (`> `) does not match — negligible, fail-closed, visible. Regression: `does not classify quoted follow-up text inside a Sales card as a follow-up` |
| **N5** widened case-insensitive marker | **fixed** | `src/approved-send-handoff.ts:28-29` is line-anchored and case-sensitive. Verified by execution: `[follow-up #3]` in chatter → `false`; mid-line `[SALES REVIEW]` → `false`; `> [FOLLOW-UP #2]` → `false`; real card heads → `true`. Regression: `recognizes approval markers only at the start of a line` |
| **N6** rehydration evaluated before confirmed-replay | **fixed** | Terminal state now precedes rehydration (`src/ipc.ts:1023-1052`). A confirmed replay reports its receipt even with a missing card; the claim at `:1179` remains the authoritative transactional gate, so the earlier snapshot read is advisory only and opens no duplicate-send window |
| **N7** proposal rows share the ledger | **accepted bounded** — agreed, with one refinement | Codex's "ambiguity hold or watchdog noise" is right for the send path: a bound proposal row fails `buildApprovedHandoff` on the `📋 *Proposal follow-up …*` card, so the proposal card can never be sent through the Sales–Mailman path. One case Codex did not name: a proposal row *orphaned in `approved`* by a crash between `recordAction` and `claimAction` can be bound and terminally blocked by an unrelated Mailman request. `recordAction` and `claimAction` are adjacent synchronous better-sqlite3 calls on one event loop (`src/proposal-approved-email.ts:73-106`), so the window is a crash, not a race. Bounded; the row was already orphaned |
| **N8** no test-routing pre-block on the proposal path | **fixed** | `testRecipient` threaded from `GMAIL_TEST_RECIPIENT` (`src/index.ts:2237`) and blocked before claim and before Gmail (`src/proposal-approved-email.ts:89-99`). Regression: `blocks before claim or Gmail when global test routing is active` |
| R1 §5 URL-host parsing (backslash authority) | **fixed** | `src/email-content-guard.ts:69, 78-91` parses with WHATWG `URL` and reads `.hostname`. I executed the guard: `https://evil.example\.zoom.us/j/1` now resolves to `evil.example` and **blocks**; `https://zoom.us@evil.example/x` blocks; `https://%%%` blocks as an invalid link. Regressions added for both lookalike shapes |

---

## 4. Security and delivery invariant matrix

| Invariant | Result | Evidence |
| --- | --- | --- |
| No customer send or regenerated draft during review | **Held** | Read-only; all tests mock the Gmail boundary. No `.env`, `store/`, or database in this worktree |
| Exact approved recipient/subject/body/card are the authority | **Held** | Selection is durable (§2); every customer-facing field is rebuilt from the card (`src/approved-email-execution.ts:93-121`) |
| A superseded approval can never execute | **Held** | `src/db.ts:1288-1297` + `src/ipc.ts:1045-1051`; a re-✅ of the stale card neither unblocks it nor supersedes the newer one |
| One Gmail thread with multiple live approvals never auto-selects | **Held** | `src/db.ts:1700-1704`; `src/ipc.ts:860-899` |
| Raw model bytes are evidence, never execution authority | **Held** | Used only to filter candidates (`src/ipc.ts:865-875`, `:916`); the executed payload always comes from `buildHostApprovedEmailExecution` |
| Confirmed replay never calls Gmail again | **Held** | `src/ipc.ts:1027-1034` (pre-check) and `:1185-1191` (transactional claim); `src/proposal-approved-email.ts:107-115` |
| Executing/uncertain prior acceptance never retried automatically | **Held** | `src/ipc.ts:1035-1044`; `src/db.ts:1488-1494` |
| Deterministic pre-Gmail refusal never invites receipt reconciliation | **Held** | `src/ipc.ts:1045-1051, 1194-1214`; N1 closed |
| Bound-action authorization denial is durable and visible in its own thread | **Held** | `src/ipc.ts:1130-1139` |
| Recipient/Party checks host-side | **Held** | `src/gmail-ipc-handlers.ts:190-221, 352-378`; `approvedRecipient` stamped from the durable row (`src/ipc.ts:1227`) |
| Content checks host-side, and before approval | **Held** | `src/gmail-ipc-handlers.ts:305, 603`; `src/send-watchdog.ts:182`; `src/channels/slack.ts:1036-1041` |
| Test routing refused before claim on every approval-driven path | **Held** | `src/ipc.ts:1152-1165`; `src/proposal-approved-email.ts:89-99` |
| Gmail-resource checks host-side; granted thread is host-derived | **Held** | `src/ipc.ts:1096-1107`; the granted value is `approvedAction.gmailThreadId` |
| Model-added CC / raw-HTML / Party hint / email type never executed | **Held** | `src/approved-email-execution.ts:98-108`; asserted in `approved-email-execution.test.ts` and `ipc-gmail-auth.test.ts:268` |
| Legacy follow-up cards without exact fields fail visibly, mint no action | **Held** | `src/approved-send-handoff.ts:182-186`; `src/send-watchdog.ts:177-182, 221-233` |
| A proposal Gmail receipt prevents a second send even if downstream writes fail | **Held** | `src/proposal-approved-email.ts:152-168`; regression `returns a Gmail receipt even when downstream logging throws` |
| Suffix/userinfo/backslash link lookalikes blocked; canonical hosts pass | **Held** | Executed probe, §7 |
| Existing unrelated dirty work untouched | **Held** | `git status` unchanged apart from this one new file |

---

## 5. New blocking findings

**None.**

I specifically probed for defects introduced by the R2 changes and cleared each:

- Supersession cannot cancel an action that may have reached Gmail
  (`executing`/`uncertain`/`confirmed` excluded, `src/db.ts:1279`).
- Supersession cannot run backwards: the ordering predicate is anchored to the
  stored row's original `approved_at`/`rowid`, and the upsert does not refresh
  `approved_at`.
- Supersession cannot cross into the proposal path in any reachable way:
  proposal rows use `threadTs = draftTs = slackTs` of a top-level card
  (`src/proposal-approved-email.ts:75-78`), which no Sales card shares.
- The terminal pre-check's snapshot read is advisory; the one-time claim at
  `src/ipc.ts:1179` is still the transactional gate, so the `await` at `:1096`
  opens no duplicate-send window.
- The widened authorization resolver grants only `approvedAction.gmailThreadId`,
  a host-derived value; no model-chosen thread can be granted.
- The dropped `data.subject` fallback in `requestedContentSha256` is consistent
  with the MCP `gmail_reply` schema having no `subject`, and every reply path is
  served by the thread binding instead.
- `getPendingSendByGmailThread`'s new return shape has exactly one caller
  (`src/ipc.ts:850`); typecheck is clean.

---

## 6. Bounded residuals and owner decisions

Neither item below is a release blocker. I am flagging them because they are
cheap and belong with this commit, not because they gate it.

1. **Supersession is silent at the moment it fires.** The transition writes the
   row and the ledger event but posts nothing to Slack, and `blocked` is
   excluded from `listOverdueSends` (`src/db.ts:1672`),
   `listStalledMailmanHandoffs` (`src/db.ts:1700`) and therefore
   `rescueUnhandedSends`. In the dominant path this is invisible-but-correct:
   Mailman later calls Gmail for the stale ID and the operator sees
   `[EMAIL BLOCKED] … superseded_by_newer_approval` in the approval thread. The
   fully-silent variant is an older action whose handoff was never routed — and
   suppressing the rescue there is precisely the 2026-07-23 fix, so the silence
   is desirable in exactly the case it occurs. A one-line
   `ℹ️ [APPROVAL SUPERSEDED]` notice at transition time would remove the
   remaining ambiguity for an operator who approved two distinct cards in one
   thread on purpose. **Recommended, optional.**

2. **`docs/SECURITY.md` does not yet carry the new rule.** The send-boundary
   list (`docs/SECURITY.md:209-229`) documents the R1-era boundary but not
   durable supersession or the Gmail-thread ambiguity hold. `PROJECT-MAP.md`,
   `ACTIVE-WORK.md` and `ENGINEERING-CHANGELOG.md` do mention it. Under
   `CHANGE-PROTOCOL`'s documentation-impact matrix, a new host-owned
   authorization/lifecycle invariant belongs in `SECURITY.md`.
   **Recommended before commit.** I did not edit it — the R2 response file is my
   only authorized write.

**Owner decisions**

- **Tool-type residual (`gmail_send` vs `gmail_reply`) — my recommendation:
  safe for this release, no durable action-type field needed now.** Recipient,
  body, guard-inspected subject, Party identity, Gmail thread, footer
  classification and receipt identity are all host-derived. The only
  customer-visible difference is the wire subject line, and only for an action
  whose approved subject differs from its thread's subject. That is a
  presentation delta on approved content, not a content or recipient authority
  gap.
- **Unrelated copied Action-ID (§2.5) — my recommendation: accept for this
  release.** Worst case is a mis-sequenced delivery of an approved email plus a
  visible unsent-action alert. The `observeOutbound` hardening in §2.5 is the
  cheap follow-up if the owner wants it closed.
- **N7 namespace separation** — cleanup, as Codex classified it. Agreed.
- **`tco.ac` and `*.zoom.us` breadth** — accepted per Codex's rationale. Both
  now pass exact parsed-host checks; the redirector caveat I raised in R1 stands
  as a policy statement, not a defect.

---

## 7. Mechanical checks and results

Runtime: macOS, `/private/tmp/nanoclaw-sales-ack`, `node_modules` symlinked to
`/Users/xbohdpukc/dev/NanoClaw/node_modules`. No `.env`, no `store/`, no
Postgres. Local `node -v` = `v26.5.1`; `.nvmrc` pins `22.23.2`. Nothing was
sent, written to a database, activated, or committed.

| Check | Result |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | **Pass**, no diagnostics |
| `npx vitest run` over 7 delta-touched files, `--pool=forks --no-file-parallelism --maxWorkers=1` | **Pass** — 7 files, **190 tests** (up from 187 at R1) |
| `npm run test:email-critical` | **Environment limitation** — 14/18 files pass, 401 pass / 95 fail / 1 skipped of **497**, matching Codex's pinned-Node total |
| Link-guard probe — 15 URLs executed through `checkContent` | See below |
| Marker/`emailType` probe — `isApprovalCard` and `buildApprovedHandoff` executed on 8 shapes | Confirms N4/N5 fixed |
| `best_party_by_email` definition read from the tracked migration | `data/business/migrations/nanoclaw-v2/11_helpers.sql:61-70` — confirms Codex's N2 rationale |

**On the gate failure.** All 95 failures across all 4 files
(`db`, `classify-ipc-handlers`, `email-delivery-path`, `routing`) reduce to one
distinct error:

```
better_sqlite3.node was compiled against a different Node.js version using
NODE_MODULE_VERSION 127. This version of Node.js requires NODE_MODULE_VERSION 147.
```

I did not run `npm rebuild` — that would mutate the primary checkout's
dependency tree. This is a native ABI mismatch and carries no information about
the delta's correctness. I am not discounting Codex's pinned-Node-22.23.2
evidence; the 497-test total matches exactly, and every non-native file passes
here. All findings and clearances in this response come from reading and
executing code, not from these failures.

**Link-guard probe** (executed against the rewritten parser):

| Input | Result |
| --- | --- |
| `https://us06web.zoom.us/j/1` | ALLOW ✓ |
| `https://zoom.us:443/j/1` | ALLOW ✓ port stripped |
| `Visit https://tandemcoaching.com.` | ALLOW ✓ trailing sentence period |
| `See [our page](https://book.stripe.com/x) today` | ALLOW ✓ markdown link |
| `<https://us06web.zoom.us/j/9>` | ALLOW ✓ angle-wrapped |
| `https://lnk.tco.ac/x` | ALLOW ✓ |
| `https://zoom.us.evil.example/j/1` | BLOCK ✓ suffix lookalike |
| `https://evilzoom.us/j/1` | BLOCK ✓ prefix lookalike |
| `https://tco.ac.evil.example/x` | BLOCK ✓ |
| `https://evil.example\.zoom.us/j/1` | **BLOCK ✓ — R1 bypass closed**, resolves to `evil.example` |
| `https://zoom.us@evil.example/x` | BLOCK ✓ userinfo lookalike |
| `https://evil.example@zoom.us/x` | ALLOW ✓ correct — real host is `zoom.us` |
| `http://localhost:3000/x` | BLOCK ✓ |
| `https://%%%` | BLOCK ✓ `invalid link` |

**Marker/`emailType` probe**:

| Input | Result |
| --- | --- |
| `[SALES REVIEW] Lead #7` / `[FOLLOW-UP #2] Lead #7` at line start | `isApprovalCard` **true** ✓ |
| `Recap: [follow-up #3] for Lead #12 is queued.` | **false** ✓ (R1 N5 closed) |
| `Status update [SALES REVIEW] pending.` | **false** ✓ mid-line |
| `> [FOLLOW-UP #2] Lead #7` | **false** ✓ Slack quote |
| `[SALES REVIEW]` card, marker inside fenced body | parses, `emailType=initial` ✓ (R1 N4 drift closed) |
| `[SALES REVIEW]` card, marker at line start in header | `null` — narrowed residual, §3 N4 |

---

## 8. Files written, elapsed time, cost

**Files written**

```
docs/reports/NC-20260804-003-CLAUDE-RESPONSE-R2.md
```

Exactly one file. No source, test, prompt, continuity document, runtime data,
credential, or production artifact was modified. No Slack message, email,
PostgreSQL write, launchd action, or commit was performed. The Gmail receipts
named in the incident record were not retried or reproduced.

**Elapsed:** ~9 minutes wall clock (2026-08-06T00:48:19Z → 2026-08-06T00:57:05Z),
single Claude session, no subagents and no parallel workflows.

**Cost:** not available — this session exposes no token or cost telemetry to me,
and I will not estimate one. Scope for reference: 2 test invocations, 1
typecheck, 3 executed probe scripts, and roughly 25 file reads/greps.
