# NC-20260804-003 — Claude response R1

## 1. Verdict

**Verdict: CHANGES REQUIRED**

The core design correction is right and I do not reopen the guard's refusal of
mutated bytes. Host rehydration from the exact stored card closes the
literal-`&`/`&amp;` family for every field the request enumerates, and the
proposal-follow-up convergence on the one-time action/receipt ledger is sound.

One blocking defect: making the executed content authoritative also made the
one-time claim's content-hash comparison tautological, and that hash was the
only remaining cross-check on **which** durable action a Mailman call was bound
to. Action *selection* is still model-influenced (via `thread_id` or a copied
Action-ID), and the selector for the reply path has no ambiguity detection. The
net effect is that a superseded or wrong approval can now be executed
byte-perfectly where it previously held.

---

## 2. Blocking findings

### B1 — Card rehydration overwrites the claim hash, so a model-chosen `thread_id` (or a stale copied Action-ID) can execute the *wrong* approved card

**Files/lines**

- `src/ipc.ts:1006` — `approvedContentSha256 = execution.approvedContentSha256;`
- `src/approved-email-execution.ts:53-66` — `approvedContentSha256` is derived
  from the card and then **required to equal** `action.approvedContentSha256`.
- `src/ipc.ts:1086-1091` — `claimEmailActionExecution(actionId, approvedContentSha256, …)`
- `src/db.ts:1498-1504` — `if (current.approvedContentSha256 !== approvedContentSha256) return held`
- `src/ipc.ts:830-840` — action resolution from `getPendingSendByGmailThread(data.threadId)`
- `src/db.ts:1639-1648` — `getPendingSendByGmailThread` is `ORDER BY approved_at, rowid LIMIT 1`
  with **no ambiguity flag**

**Mechanism**

Before this delta, `approvedContentSha256` was `hash(model subject, model body)`
(`src/ipc.ts:845-855`). The claim therefore compared *what Mailman asked to
send* against *what the resolved action recorded as approved*. That comparison
was doing two jobs: rejecting mutated bytes (the job the delta correctly moves
to the host) **and** rejecting a request bound to the wrong action.

After the delta the value passed to the claim is derived from the resolved
action's own card and is proven equal to `action.approvedContentSha256` three
lines earlier. `current.approvedContentSha256 !== approvedContentSha256` is now
`x !== x`. Nothing downstream compares the model's request to the selected
action any more. Recipient, subject, thread and hash all agree because they were
all reloaded from the same row.

Meanwhile action selection is still driven by model-supplied values:
`explicitActionId` (`src/ipc.ts:802-806, 836-837`) or, for `gmail_reply`,
`data.threadId` → `getPendingSendByGmailThread` (`src/ipc.ts:830-835`), which
silently returns the **oldest** non-terminal row on that Gmail thread. This
resolver short-circuits before the hash-scoped lookup (`src/ipc.ts:856`, guarded
by `if (!approvedAction …)`) and before the ambiguity-aware fallback
(`src/ipc.ts:895-908`), so neither of those safety nets applies.

**Reproduction (variant A — superseded approval, no Action-ID needed)**

1. Sales posts `[SALES REVIEW]` card v1 for Lead #N; operator reacts ✅.
   `recordApproval` creates row1 (`state='approved'`, `action_id=A1`,
   `gmail_thread_id=T`, hash = H(v1)). `gmail_thread_id` is derived from the
   lead thread root (`src/index.ts:1966-1968`), so it is the same T for every
   card in that thread.
2. The agent stalls or the operator posts corrections; Sales posts card v2 in
   the same thread; operator reacts ✅. Row2 is created (`action_id=A2`,
   `gmail_thread_id=T`, hash = H(v2)). Row1 is still `approved` /
   `handoff_routed` / `mailman_started` — i.e. non-terminal.
3. Mailman handles v2 and emits `gmail_reply` with `thread_id: T`, omitting
   `action_id` — the exact omission documented in production for Lead #1029 and
   Lead #1032.
4. `getPendingSendByGmailThread(T)` returns **row1** (oldest). `approvedAction =
   A1`.
5. `buildHostApprovedEmailExecution` loads row1's `draft_ts` card — **card v1** —
   verifies it against row1's hash/subject/recipient (all consistent), and
   returns the v1 payload.
6. `approvedContentSha256` is set to H(v1); the claim on A1 succeeds; Gmail sends
   **the superseded v1 draft**.
7. The thread receives `✅ [EMAIL SENT] Action A1 …`. Row2 is never executed and
   later surfaces as `[SEND NOT OBSERVED]`.

Pre-delta behaviour at step 6: `claim(A1, H(v2))` → `held`,
`"subject/body hash does not match the approved action"`, nothing sent.

**Reproduction (variant B — no thread ambiguity required)**

Both `[EMAIL ACTION] Action-ID: …` messages live in the *same* Slack approval
thread (`src/index.ts:1991-1997`). Mailman copying A1 instead of A2 — a
plausible slip given the prompt tells it to read the Action-ID out of that
thread — resolves `approvedAction = A1` explicitly at `src/ipc.ts:836-837` and
reaches the identical outcome. Pre-delta this was also caught by the hash.

**Why this is blocking**

This is the `incident-2026-07-23` failure mode ("approved but the old version
was sent") reachable again, and this delta is what removes the check that was
catching it. It also violates the stated invariant "Exact approved
recipient/subject/body/card remain the authority" — the executed card is exact,
but it is the wrong exact card.

**Suggested repair (both parts needed)**

1. Make `getPendingSendByGmailThread` ambiguity-aware, mirroring
   `findPendingSendAction`: `LIMIT 2`, return `{action, ambiguous}`, and hold
   with the existing `[EMAIL ACTION HELD]` path when more than one non-terminal
   action shares a thread. Prefer newest, not oldest, when a single row is
   selected.
2. Keep the model-derived hash as a *corroborating* signal rather than deleting
   it. Compute `requestedContentSha256` from the raw request as today, and when
   more than one non-terminal action is a candidate — or when an explicit
   Action-ID is absent — require the requested hash to match exactly one
   candidate. It must not be a hard gate (that is the defect being fixed), but
   it is the only remaining evidence tying the request to an action, and
   discarding it entirely is what opens B1.

---

## 3. Non-blocking findings

Ordered by severity. None of these should stop activation on their own; B1
should.

### N1 — A pre-Gmail refusal that happens *after* the claim still tells the operator to reconcile a nonexistent receipt

`src/ipc.ts:1101-1121`. `priorGmailAttempt` is true whenever
`executionStartedAt` is set. `failEmailAction` (`src/db.ts:1583-1596`) does not
clear `execution_started_at`, so any action blocked *after* the claim but
*before* Gmail accepted anything — `recipient_guard`, `content_guard`,
`invalid_payload` (`src/gmail-ipc-handlers.ts:566, 597, 618`) — retains it.

Repro: an approved action clears rehydration, claims, then fails
`verifyPartyRecipient` (`recipient ... has no host-resolved party`). State
becomes `blocked` with `execution_started_at` set. Any subsequent IPC for that
action yields `⚠️ [EMAIL HELD] … Reconcile the Gmail receipt before any retry.`
Gmail's `messages.send` was never called.

This is the exact wording defect the delta set out to fix, surviving on the
post-claim branch. Fix: gate `priorGmailAttempt` on evidence of Gmail
acceptance, not on the claim timestamp — e.g. `state === 'executing' || state
=== 'uncertain' || gmailMessageId != null`, and treat `state === 'blocked'` with
a known deterministic `last_error_code` as "Gmail was not called".

N1 compounds with N2 below: deleting `leadId` makes the party-resolution block
more reachable, and its retry lands on exactly this wrong message.

### N2 — Deleting `leadId` removes the documented Party-ID fallback

`src/approved-email-execution.ts:108` deletes `leadId` unconditionally. The
recipient verifier treats it as a *fallback*, not a competing authority:
`partyId = resolvedPartyId ?? claimed` (`src/gmail-ipc-handlers.ts:210`), with
the comment at `:182-188` explaining that the hint exists for when host
resolution is unavailable. After this delta the fallback can never apply to an
approved action. A recipient that `business_v2.best_party_by_email` cannot
resolve and that has no prior outbound interaction on the thread now blocks
where a correct Sales-supplied Party ID previously rescued it.

Fail-closed, so no wrong send — but the failure is durable (`blocked`) and its
retry produces the N1 message. I could not exercise
`best_party_by_email`/`party_emails` here (no Postgres in this worktree, and the
production database is out of scope), so I cannot quantify how often the
fallback was load-bearing. Flagged as an owner decision in §8.

### N3 — Host-injected `threadId` on `gmail_send` creates a new post-restart denial with no durable terminal state

`src/approved-email-execution.ts:113` stamps `payload.threadId =
action.gmailThreadId` on a `gmail_send` even when the model omitted it.
Authorization then runs on the rehydrated payload (`src/ipc.ts:1017-1019`), and
`gmail_send` **with** a `threadId` requires a thread grant
(`src/gmail-ipc-policy.ts:271-279`). The resolver's mailman clause covers
`gmail_reply` only (`src/ipc.ts:1020-1025`), and
`resolveDurableGmailResource` returns `false` immediately for any group that is
not `sales` (`src/gmail-ipc-business-scope.ts:24`).

Grants are process-local (`src/gmail-ipc-policy.ts:56`) and minted at approval
(`src/index.ts:1998-2005`). Repro: operator approves; the host restarts
(deploy); Mailman then emits an unthreaded `gmail_send` — previously authorized,
and re-attached by the `Re:`-subject safety net at
`src/gmail-ipc-handlers.ts:535-556`. Now the host adds the thread, the grant is
gone, and the request is quarantined. On that path there is **no**
`failEmailAction` and **no** approval-thread status; the only immediate signal is
a generic `🚫 [GMAIL REQUEST HELD] gmail_send was denied by the host boundary`
posted to chief (`src/ipc.ts:1049-1051`). The action sits non-terminal until the
watchdog's `[SEND NOT OBSERVED]` sweep.

Fail-closed and eventually visible, so not blocking. Fix: extend the mailman
resolver clause to `gmail_send` when the requested thread equals
`approvedAction.gmailThreadId`, and/or route this denial through
`postActionStatus` + `failEmailAction` so the durable state is terminal.

### N4 — `emailType` is matched against the whole card, not the header

`src/approved-send-handoff.ts:182-187`. `gmailThreadId` is correctly scoped to
`header = lines.slice(0, headingIdx)`, but `emailType` tests
`/\[FOLLOW-UP\s+#\d+\]/i` against the entire `cardText`. Two consequences:

1. **False rejection.** A `[SALES REVIEW]` card whose narrative quotes a prior
   `[FOLLOW-UP #2]` is classified `follow-up`, then fails
   `if (emailType === 'follow-up' && !gmailThreadId) return null`. I confirmed
   this by executing `buildApprovedHandoff` on such a card: it returns `null`
   where the same card without the quoted marker parses. The Slack pre-post gate
   does not catch it (it only blocks *parseable* cards —
   `src/channels/slack.ts:1033-1041`), so the operator sees a normal card,
   approves it, and gets `[APPROVAL CARD REJECTED] … cannot be bound to one
   exact Email, fenced Subject, and body` — a reason that is false for that
   card — with the approval claimed so the agent never sees it.
2. **Customer-visible drift from body text.** A card that *does* carry a header
   `Thread-ID` and quotes the marker parses as `follow-up`, which makes
   `buildEmailFooter` append the unsubscribe block
   (`src/gmail-ipc-handlers.ts:257-267`) to an email the operator approved
   without one, and mislabels the tracking pixel and
   `logOutboundEmailInteraction` rows.

Fix: match `emailType` against `header`, exactly as `gmailThreadId` already
does.

### N5 — The approval-card marker surface widened further than the delta needs

`src/approved-send-handoff.ts:28-29` adds `FOLLOW-UP\s+#\d+` **and** the `i`
flag. `isApprovalCard` is the shared marker for three claim surfaces:

- `src/ipc.ts:492` (`isSalesReviewCard`) — suppresses `[HANDOFF: …→mailman]`
  routing. A real Sales→mailman handoff whose text happens to contain
  `[FOLLOW-UP #2]` is now diverted, fails `buildApprovedHandoff`, and is
  quarantined with a rejection instead of reaching Mailman.
- `src/send-watchdog.ts:222` — `rejected = isApprovalCard(cardText) && !pending`.
  A ✅ on *any* message containing `[follow-up #3]` in any case now posts
  `[APPROVAL CARD REJECTED]` and **claims** the approval
  (`src/index.ts:1990, 2007`), suppressing the normal agent path.
- `src/channels/slack.ts:1032`.

I verified `isApprovalCard('Recap: [follow-up #3] for Lead #12 is queued.')`
returns `true`. Fail-closed in every case, but it converts ordinary chatter into
a swallowed approval. Fix: anchor the marker to the start of a line
(`/^\s*\[(?:…)\]/m`) and keep `SALES REVIEW` case-sensitive as before.

### N6 — Rehydration failure is evaluated before confirmed-replay, so a duplicate IPC for an already-sent action can report "was NOT sent"

`src/ipc.ts:975-1016` runs before the claim at `:1086`. If the action is
`confirmed` and rehydration fails — the reachable case being
`approved_reply_thread_missing` (`src/approved-email-execution.ts:85-91`) when
Mailman retries `gmail_reply` for an action with no durable thread — the
operator gets `🚫 [EMAIL BLOCKED] Action X was NOT sent … Gmail was not called`
for an email that *was* sent. The durable row is protected
(`failEmailAction` is `WHERE … state <> 'confirmed'`), but the message invites a
manual resend, i.e. a duplicate customer email.

Fix: check `state === 'confirmed'` (or move the confirmed-replay branch of the
claim) ahead of the rehydration block.

### N7 — Proposal rows now share the `pending_sends` namespace

`src/proposal-approved-email.ts:71-83` inserts a `groupFolder: 'sales'` row.
Two interactions:

- The ambiguity-aware fallback at `src/ipc.ts:895-908` does not exclude
  `executing`, so while a proposal follow-up is in flight to a recipient, a
  Sales `gmail_send` to that same recipient with no Action-ID and a mutated body
  (exactly the recurring shape) sees two candidates and is held as ambiguous.
  Window is normally seconds; indefinite if the process dies between
  `recordAction` and `claimAction`.
- A row orphaned in `approved` by a crash is picked up by `listOverdueSends`
  and alerts `[SEND NOT OBSERVED]` in the Sales channel for a proposal.
  `rescueUnhandedSends` correctly declines to act on it —
  `buildApprovedHandoff` returns `null` for the `📋 *Proposal follow-up …*`
  card (`src/send-watchdog.ts:508-519`), so no send occurs. Noise only.

### N8 — The proposal path has no `GMAIL_TEST_RECIPIENT` pre-block

The approved-action path refuses outright when global test routing is active
(`src/ipc.ts:1060-1072`). `executeProposalApprovedEmail` has no equivalent: the
message is transmitted to the canary address,
`handleGmailSend` skips `onSendConfirmed` (`src/gmail-ipc-handlers.ts:683`), and
the action ends `uncertain` with the draft left pending. No duplicate and no
false success, but the customer never receives it and the state is `uncertain`
rather than a clean `blocked`. Asymmetric with the invariant "test-routing …
checks remain host-side".

---

## 4. Security and delivery invariant matrix

| Invariant | Result | Evidence |
| --- | --- | --- |
| No regenerated draft; no customer send during review | **Held** | Read-only review; no `sendEmail`/`replyToThread`/Slack call executed. Tests run are mocked at the Gmail boundary. |
| Exact approved recipient/subject/body/card remain the authority | **Partial** | Bytes are exact; *which* card is authoritative is still model-influenced — B1. |
| Confirmed replay never calls Gmail again | **Held** | `src/ipc.ts:1092-1098`; `src/db.ts:1485-1487`; `src/proposal-approved-email.ts:94-102`. Messaging on the replay is wrong in one case — N6. |
| Executing/uncertain prior acceptance never retried automatically | **Held** | `src/db.ts:1488-1494`; `src/ipc.ts:1099-1122`; `src/proposal-approved-email.ts:103-105`. |
| Recipient/Party checks host-side | **Held** | `src/gmail-ipc-handlers.ts:190-221, 352-378`; `approvedRecipient` is stamped from the durable row at `src/ipc.ts:1133-1134`. Fallback hint removed — N2. |
| Content checks host-side | **Held, strengthened** | `src/gmail-ipc-handlers.ts:305, 603`; now also `src/send-watchdog.ts:182` and `src/channels/slack.ts:1036-1041`. |
| Test-routing checks host-side | **Held for approved actions** | `src/ipc.ts:1060-1072`. Proposal path differs — N8. |
| Gmail-resource checks host-side | **Held** | `src/gmail-ipc-policy.ts:250-312`, run on the rehydrated payload. New denial surface — N3. |
| Interaction logging host-side | **Held** | `src/gmail-ipc-handlers.ts:443-449, 704-710`; receipt commit precedes logging, so a logging throw cannot un-send. |
| Receipt checks host-side | **Held** | `src/db.ts:1540-1574` (`state='executing'` + recipient match); `src/ipc.ts:1140-1155`. |
| Model-added CC never executed | **Held** | `src/approved-email-execution.ts:106`; asserted in `approved-email-execution.test.ts:83` and `ipc-gmail-auth.test.ts`. |
| Model-added raw-HTML flag never executed | **Held** | `src/approved-email-execution.ts:107` + `markdown: true` at `:104`; asserted at `approved-email-execution.test.ts:84` and `ipc-gmail-auth.test.ts:268`. |
| Legacy follow-up cards without exact fields fail visibly, mint no action | **Held** | `src/approved-send-handoff.ts:185-187`; `src/send-watchdog.ts:177, 216-235`. Over-triggers — N4/N5. |
| A proposal Gmail receipt prevents a second send even if logging or proposal-state persistence fails | **Held** | `src/proposal-approved-email.ts:152-168` returns the receipt on a post-acceptance throw; `handleProposalApproval` then runs `markSent`. Covered by `proposal-approved-email.test.ts:120-134`. |
| Approved subject still reaches the content guard on replies | **Held** | `src/approved-email-execution.ts:117-119` sets `payload.subject` for `gmail_reply`; `src/gmail-ipc-handlers.ts:305` consumes it; `replyToThread` is not given a subject, so the wire subject stays thread-derived. |
| Missing/changed stored card fails before Gmail with a durable terminal state | **Held** | `src/ipc.ts:981-1004` → `failEmailAction('blocked', …)` + approval-thread post + `continue`. Ordering caveat — N6. |
| Deterministic pre-Gmail claim refusal does not invite receipt reconciliation | **Partial** | Correct for `unknown action identity` and for `blocked` with no claim; wrong for `blocked` after a claim — N1. |
| Existing unrelated dirty work untouched | **Held** | `git status` unchanged apart from the single new response file. |

**Check 2 detail — post-resolution field control.** Once one action is resolved,
`recipient`, `subject`, `body`, `threadId`, `actionId`, `cc`, `html`, `leadId`,
`emailType` and `markdown` are all host-derived
(`src/approved-email-execution.ts:93-121`), and `groupFolder` is re-stamped at
`src/ipc.ts:1132`. `correctedFields` (`:123-134`) logs each replacement.

**Check 7 detail — residual model-controlled fields.** Retained from the request
are `type`, `source_container`, `timestamp`, `query`, `maxResults`, `messageId`.
Only `type` is load-bearing, and it is a **bounded residual**: `gmail_send`
sends under the approved subject, while `gmail_reply` derives the wire subject
from the Gmail thread (`replyToThread` is never given one). For an action whose
approved subject is not the thread's subject — a `[SALES REVIEW]` first response
that also carries a Thread-ID and chose a new subject — the model's choice of
tool still changes the customer-visible subject line. Recipient authority is not
affected (`prepareSend` enforces `approvedRecipient` at
`src/gmail-ipc-handlers.ts:352-361`). Deriving the tool from the durable action
rather than the request would close it; I classify it as separately bounded, not
blocking.

**Check 8 detail — `[FOLLOW-UP #N]` arming.** Cannot arm without: the marker
(`:137`), a header `Email:`/`To:` (`:139-140`), `DRAFT FOLLOW-UP:` (`:143-144`),
open and close fences (`:147-154`), a fenced `Subject:` (`:157-160`), a non-empty
body (`:164-169`), and a header `Thread-ID:` (`:185-187`). `emailType:
'follow-up'` is host-derived from the card and overwrites the model's value
(`src/approved-email-execution.ts:98-103`; asserted in
`approved-email-execution.test.ts:103-119`). `groups/sales/WORKFLOWS.md:286-292`
now emits all four fields. Confirmed correct, with the over-trigger caveat N4.

**Check 14 detail — pre-approval content parity.** A parseable card that would
fail the Gmail guard is replaced before Slack posts it
(`src/channels/slack.ts:1039-1056`, with a logged error at `:1163-1171`) and,
independently, cannot mint an Action-ID when a legacy copy is reacted to
directly (`src/send-watchdog.ts:182`, with the violation surfaced at `:224-232`).
Both paths are covered by tests and both passed here. The two gates are
independent, so a card that bypasses the pre-post gate is still caught.

---

## 5. Remaining outbound-email gaps

### Fixed by this delta

- Model-mutated body/subject bytes on an approved action (the literal
  `&`→`&amp;` family) no longer determine what is sent.
- A model-omitted or model-invented Action-ID no longer determines the executed
  `action_id`.
- Model-added `cc` and `html:true` can no longer be executed for an action whose
  approval record does not contain them.
- Model-supplied `leadId` and `emailType` no longer reach the boundary.
- Scheduled Sales `[FOLLOW-UP #N]` cards are now in the durable ledger instead of
  being invisible to it.
- Proposal follow-ups now claim and confirm on the same one-time ledger; a
  post-Gmail logging failure can no longer leave a resendable pending draft.
- Deterministic pre-claim refusals now say Gmail was not called (except the
  post-claim case, N1).
- Canonical Zoom / `book.stripe.com` / `tandemcoaching.com` / `tco.ac` links no
  longer force a re-draft; content policy now runs before an operator can
  approve something the host already knows it will refuse.

### Known, outside this incident class

- **`src/digest-delivery.ts:61`** calls `sendEmail` directly: no content guard,
  no recipient guard, no action ledger, no test-routing suppression, and up to
  three retries with no idempotency key. Recipients come from `.env`
  (`DIGEST_EMAIL_*`, `:31-40`), not from a model — internal scheduled delivery,
  correctly outside the approval-driven contract, but the retry loop can
  duplicate a digest if Gmail accepts and then the response is lost.
- **`src/email-transport-canary.ts:98`** calls `gmail.users.messages.send`
  directly. Host-owned, self-addressed canary. Correctly outside the contract.
- **Courses / other minions** have no independent Gmail send path; they route
  through mailman handoffs. `grep` over `src` finds no other `messages.send`,
  `sendEmail`, or `replyToThread` caller.
- **Link-guard host parsing.** `URL_RE` (`src/email-content-guard.ts:69`)
  permits a backslash inside the captured authority, so
  `https://evil.example\.zoom.us/j/1` satisfies `hostAllowed`'s
  `endsWith('.zoom.us')` while the WHATWG URL parser normalizes `\`→`/` and
  navigates to `evil.example`. I executed the guard to confirm: that URL returns
  `ok: true`. Pre-existing — `calendly.com`, `plutio.com`, `buy.stripe.com` and
  `coachingfederation.org` were already exposed to it — so it is not created by
  this delta, but adding four more well-known brands widens the target set.
  Recommend parsing with `new URL()` and reading `.hostname` instead of the
  regex capture. Not load-bearing for this approval.
- **`tco.ac` is a redirector.** Whitelisting a short-link domain means neither
  the guard nor the approving operator can see the final destination. Not a
  defect in the delta; an owner decision (§8).
- **Sales `gmail_search` with an `action_id`.** `explicitActionId` is honoured
  for every group (`src/ipc.ts:802-806`), but `approvedContentSha256` is only
  computed for mailman send actions, so a non-mailman request carrying an
  Action-ID reaches `src/ipc.ts:1073-1085` and blocks that approved action with
  `approved_content_unverifiable`. Pre-existing and unchanged by this delta.

### Newly discovered

- **B1** (blocking) — wrong-action execution after the claim hash became
  tautological.
- **N1** — post-claim deterministic block still says "reconcile the receipt".
- **N2** — Party-ID fallback removed.
- **N3** — new post-restart `gmail_send` denial with a non-terminal action state.
- **N4** — whole-card `emailType` matching (false rejection + unsubscribe-footer
  drift).
- **N5** — widened, case-insensitive approval-card marker across three claim
  surfaces.
- **N6** — rehydration evaluated before confirmed-replay.
- **N7** — proposal rows in the shared `pending_sends` namespace.
- **N8** — no `GMAIL_TEST_RECIPIENT` pre-block on the proposal path.

---

## 6. Mechanical checks run and results

Runtime: macOS, `/private/tmp/nanoclaw-sales-ack`, `node_modules` is a symlink to
`/Users/xbohdpukc/dev/NanoClaw/node_modules`. No `.env`, no `store/`, no
Postgres in this worktree.

| Check | Result |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | **Pass**, no diagnostics |
| `npx vitest run` over the 7 delta-touched files (`approved-email-execution`, `proposal-approved-email`, `approved-send-handoff`, `send-watchdog`, `email-content-guard`, `ipc-gmail-auth`, `channels/slack`), `--pool=forks --no-file-parallelism --maxWorkers=1` | **Pass** — 7 files, 187 tests |
| `npm run test:email-critical` | **Environment failure, not a product result** — 14/18 files pass, 398 pass / 93 fail / 1 skipped |
| Link-whitelist probe (executed `checkContent` over 10 URLs) | See below |
| Marker/`emailType` probe (executed `isApprovalCard` and `buildApprovedHandoff`) | Confirmed N4 and N5 |
| MCP schema cross-check (`container/agent-runner/src/ipc-mcp-stdio.ts:551-664`) | See below |

**On the `test:email-critical` failure.** All 93 failures across all 4 files
(`db`, `classify-ipc-handlers`, `email-delivery-path`, `routing`) come from a
single cause:

```
better_sqlite3.node was compiled against a different Node.js version using
NODE_MODULE_VERSION 127. This version of Node.js requires NODE_MODULE_VERSION 147.
```

Local `node -v` is `v26.5.1`; `.nvmrc` pins `22.23.2`, and the shared
`node_modules` was built for Node 22. I did **not** run `npm rebuild` — that
would mutate the production checkout's dependency tree, which is out of scope
here. I could not obtain a Node 22.23.2 runtime in this session. This is an ABI
mismatch and carries **no** information about the correctness of the delta; the
convergence record's independent Node-22.23.2 gate (18 files / 492 tests) stands
as the authoritative run, and B1/N1–N8 are all findings from reading and
executing code, not from these failures.

**Link-whitelist probe results** (check 13):

| URL | Result |
| --- | --- |
| `https://us06web.zoom.us/j/1` | ALLOW ✓ regional Zoom passes |
| `https://book.stripe.com/x` | ALLOW ✓ |
| `https://lnk.tco.ac/x` | ALLOW ✓ |
| `https://sub.tandemcoaching.com/x` | ALLOW ✓ |
| `https://zoom.us.evil.example/j/1` | BLOCK ✓ suffix lookalike |
| `https://tco.ac.evil.example/x` | BLOCK ✓ |
| `https://evilzoom.us/j/1` | BLOCK ✓ prefix lookalike |
| `https://zoom.us@evil.example/x` | BLOCK ✓ userinfo trick |
| `https://ZOOM.US/j/1` | ALLOW — case-folded, correct |
| `https://evil.example\.zoom.us/j/1` | **ALLOW — see the backslash gap in §5** |

The four added domains are each company-owned or an established transactional
host, and the exact/subdomain matching rule is unchanged.

**MCP schema cross-check** (check 12): `gmail_send` and `gmail_reply` accept
`to`/`thread_id`, `subject`, `body`, `cc`, `html`, `lead_id`, `action_id`,
`email_type` — and **no `markdown` argument**
(`container/agent-runner/src/ipc-mcp-stdio.ts:551-664`; the writer never emits a
`markdown` key). The old prompts instructed `markdown: true`, which was an
unsupported argument; the delta removes every occurrence from
`groups/mailman/OUTBOUND-EMAIL.md`, and the host now sets `markdown: true`
itself. That is a correct fix. `to`, `subject`, `body` remain required by the
schema, which matches `groups/mailman/CLAUDE.md`'s "the Gmail tool still requires
body fields for backward compatibility". No unsupported argument or
prompt/schema contradiction remains. One prompt/behaviour gap worth noting:
`OUTBOUND-EMAIL.md` says "Use the exact `To`, `Thread-ID`, `Party ID`, `Entry
ID` … supplied by the handoff", while the host now discards `lead_id`; the
instruction is harmless but no longer describes what happens.

---

## 7. Files written

```
docs/reports/NC-20260804-003-CLAUDE-RESPONSE-R1.md
```

Exactly one file. No implementation, test, prompt, continuity, or production
artifact was modified; `git status` is otherwise identical to the pre-review
snapshot. No email, Slack message, database write, service action, or commit was
performed. The confirmed Gmail receipts named in the request
(`19fcd16443172cb1`, `19fcd6a20fc986df`, `19fceafb937b9bfa`, `19fd3438954b40fe`,
`19fd44fd031fc6f1`) were not retried or reproduced.

---

## 8. Elapsed time and unresolved owner decisions

**Elapsed:** ~15 minutes wall clock (2026-08-06T00:15:16Z → 2026-08-06T00:30:32Z),
single Claude session, no subagents or parallel workflows.

**Unresolved owner decisions**

1. **B1 repair shape.** Ambiguity detection on `getPendingSendByGmailThread`
   alone closes the two-rows-on-one-thread case. Retaining the model hash as a
   corroborating tiebreak additionally closes the copied-stale-Action-ID case.
   My recommendation is both; the owner may consider the second redundant once
   Mailman is required to pass the Action-ID — but the production evidence in
   this very incident is that it does not.
2. **N2 — Party-ID hint.** Is `business_v2.best_party_by_email` plus the
   thread-history fallback sufficient for every approved recipient, including
   secondary `party_emails` addresses and freshly onboarded parties? If not, the
   hint should be re-admitted as a fallback while remaining non-authoritative. I
   could not measure this without the production database.
3. **N8 / test routing.** Should `executeProposalApprovedEmail` refuse outright
   when `GMAIL_TEST_RECIPIENT` is set, matching the approved-action path, or is
   redirect-then-`uncertain` acceptable for scheduled proposal nudges?
4. **`tco.ac` short links.** Whitelisting a redirector means neither the guard
   nor the approving operator sees the destination. Confirm that `tco.ac` link
   creation is human-controlled, or scope the entry to known path prefixes.
5. **`zoom.us` breadth.** The entry admits every `*.zoom.us` host, not only
   `/j/` meeting links. Acceptable if the intent is "any Zoom-hosted
   destination"; say so explicitly if the whitelist is meant to be narrower.
6. **N3 sequencing.** Whether to fix the post-restart `gmail_send` denial before
   activation or accept it as a bounded, watchdog-visible stall for this release.
7. **Deployment gate.** Reconciliation, commit and deployment remain pending per
   the convergence record; nothing in this review authorizes them.
