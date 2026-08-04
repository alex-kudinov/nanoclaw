# NC-20260803-003 Claude response R3 — final bounded convergence check

Reviewer: Claude (Opus 5), independent read of the working-tree diff at
`codex/nc-20260803-003-forwarded-email-recovery` (base `0b6ccf1`).
Date: 2026-08-03T24:00Z (local 19:00 CDT).

## Verdict

`CONVERGED` — no blocking defect found in the diff. Checks 1–6 hold with code
evidence. Two non-code items must still close before deployment (check 7), and
four non-blocking findings are recorded.

## Blocking findings

None.

## Pre-deployment items (not diff defects)

1. **Pinned-Node full validation was not reproducible in this session.** The
   review sandbox exposes Node v26.5.1 and refused every attempt to select
   `.nvmrc`'s 22.23.2 (`nvm use`, `PATH=`-prefixed and absolute-binary
   invocations were all denied). Under v26.5.1 the five focused files ran
   **123/125 passed, 2 failed**; both failures are `better-sqlite3` native ABI
   errors at `src/db.ts:425` (`_initTestDatabase`) inside
   `classify-ipc-handlers.test.ts`, i.e. environment, not logic. The 125-test
   count in the request matches; Codex must rerun the focused set and the full
   suite on exact 22.23.2 on the final tree.
2. **Tracked-record accuracy.** `docs/ENGINEERING-CHANGELOG.md` states the five
   focused files "pass 120 tests"; the current count is 125. Correct the number
   before handoff — CHANGE-PROTOCOL requires build/test facts to be recorded
   exactly, and this is the tracked evidence a future session will trust.

Verified locally: `npx tsc --noEmit` clean; `npm run docs:continuity-check`
passed (42 active/ready rows, 38 changelog entries).

## Check 1 — subject guard vs realistic Re/Fw/Fwd forms

Holds. `isHumanReplySubject` (`src/classify-rules-runner.ts:104-110`) anchors at
string start, consumes any run of leading `[tag]` routing prefixes, then one or
more `re`/`re[N]`/`fw`/`fwd` tokens with optional whitespace on both sides of the
colon. Manually traced against the regression set at
`src/classify-rules-runner.test.ts:271-296`: `Fwd:Level 1`, `RE:x`, `Fwd : x`,
`[EXTERNAL] Fwd:`, `[SECURE] [EXTERNAL] RE:`, `Re[2]:`, `Re: Fwd:` all match;
`Reserve your seat` does not (`re` → `s` fails the `\s*:` requirement), so the
negative case at `:297` is preserved. The guard is consumed only by sender rules
(`src/classify-rules-runner.ts:170-181`: `humanReply && isSenderRule(rule)` →
`continue`), so subject/header rules the operator authored deliberately are
unaffected. The second half of the same protection is that actionable sender
rules can no longer be learned at all
(`src/classify-ipc-handlers.ts:119`, `if (autoArchive !== true) return;`) and
probationary rows are excluded from the runner query
(`src/classify-rules-runner.ts:59`), asserted at
`src/classify-rules-runner.test.ts:58-60`.

## Check 2 — forwarded bodies retained, ordinary reply history still stripped

Holds. `cleanBody` (`src/gmail-parser.ts:84-128`):

- `isForwardMarker` (`:89-97`) dequotes leading `>` runs before testing, so it
  recognizes Gmail (`---------- Forwarded message`), Apple Mail
  (`Begin forwarded message:`) and Outlook (`-----Original Message-----`) forms
  whether or not the marker itself is quoted.
- Outside a forward, an `On … wrote:` line still terminates the body, but only
  after a look-ahead confirms no forward marker appears below (`:107-111`) —
  that is what preserves a forward quoted beneath reply history.
- Once `inForwardedMessage` is set (`:116-117`), quoted lines are retained
  (`:122`), so a relayed inquiry cannot degrade to a signature fragment.
- Ordinary reply history is unchanged: with no forward marker anywhere below,
  the `On … wrote:` break fires and `>` lines are skipped exactly as before.

Regressions covering Gmail, quoted-Gmail, nested `On … wrote:` inside a forward,
Apple Mail, quoted-marker-below-reply-history, and Outlook are at
`src/gmail-parser.test.ts:75-144`.

## Check 3 — durable direct-route row

Holds on all four properties.

- **Before routing:** `storeMessageDirect` at `src/channels/gmail.ts:578` runs
  ahead of `routeClassifiedEmail` at `:592`; ordering is asserted via
  `invocationCallOrder` in `src/channels/gmail.test.ts:118-120`.
- **Cannot wake Mailman:** the row carries `is_bot_message: true` and
  `from_group: GMAIL_GROUP_FOLDER` (`'mailman'`, `src/channels/gmail.ts:70`).
  The Gmail JID is registered with `folder: 'mailman'`
  (`src/channels/gmail.ts:171-180`), `src/index.ts:804-807` builds `folderByJid`
  from exactly that registration, and `getNewMessages`
  (`src/db.ts:665-670`) suppresses a bot row whose `from_group` equals the JID
  owner. Same-group wake is therefore structurally impossible, not incidental.
- **Latest-inbound-readable:** the row is stored with `is_from_me: false`, and
  `getLatestInboundByThread` (`src/db.ts:754-764`) filters on `is_from_me = 0`
  only — it does not exclude bot rows — so both it and `getMessageById`
  (`src/db.ts:739-752`) return the row with the full formatted body,
  `Thread-ID` and `Message-ID`.
- **Safely replaced on fallthrough:** both writers use
  `INSERT OR REPLACE INTO messages` keyed on `id`
  (`src/db.ts:559-574` / `579-605`), and the fallthrough path re-stores the same
  Gmail `msg.id` through `onMessage` → `storeMessage` (`src/index.ts:1710`) with
  `is_bot_message: false`, `from_group` unset and a fresh timestamp — so the
  replacement row both replaces the no-wake copy and legitimately wakes Mailman.

## Check 4 — route/persistence failure paths

Holds; no loss, no duplication.

- Persistence throw: `storeMessageDirect` sits inside the try whose handler is
  `catch (routeErr)` at `src/channels/gmail.ts:608`; the route is never reached
  and execution falls to the ordinary `this.onMessage(...)` at `:635`. Asserted
  at `src/channels/gmail.test.ts:123-155` (route not called, `onMessage` called).
- Route throw or `routed: false`: same fallthrough; the durable row is then
  overwritten by the ordinary inbound row, so Mailman handles the email once.
- No handoff can be both written and re-delivered: every route path returns
  immediately after its single `writeHostMessage`, and `safeWrite`
  (`src/host-router.ts:223-234`) is the only writer — it returns
  `routed: false` only when the write itself threw. `routeLead` (`:306-310`) and
  `routeProcurementEmail` (`:312-339`) perform all fallible work *before* the
  write, so there is no post-write throw that could produce a duplicate.
  (Residual, pre-existing: a procurement intake that succeeds and whose IPC write
  then fails falls through to Mailman and relies on intake idempotency. Not
  introduced by this diff.)

## Check 5 — Chief fallbacks

Holds. All four Chief paths — `financial/refund` (`src/host-router.ts:288`),
`legal|recruiting|internal` (`:291`), `personal|other` (`:293`), and the
unrecognized-label fallback (`:300`) — now go through `routeChief`
(`:262-270`), which calls `grantHostGmailResources('chief', { messageId })`
*before* `writeChief`. `grep` confirms no other `fmtChiefEscalation` or
`[HANDOFF: mailman→chief]` producer exists outside `src/host-router.ts`.

Authority is not widened: the grant carries `messageId` only — no `threadId`,
no `emailAddresses` (`src/gmail-ipc-policy.ts:146-161`) — and Chief's capability
set is `['gmail_read']` alone (`src/gmail-ipc-policy.ts:38`), so no Gmail search
or thread read is reachable even with a valid grant.

Single Slack-sized handoff: `fmtChiefEscalation` (`:124-138`) emits exact
`Thread-ID`/`Message-ID`, a `Body-Complete: yes|no` declaration, the body capped
at `CHIEF_BODY_CHARS = 2_500` with an explicit `[truncated]` marker, and the
canonical `"call gmail_read once with the exact Message-ID above; do not search
Gmail"` recovery line. Asserted at `src/host-router.test.ts:505-633`, including
a 10,000-character body producing `Body-Complete: no` and a total under 4,000
characters. `groups/chief/CLAUDE.md:52-89` carries the matching agent-side rule
(exact read once, never a search) and now propagates `Message-ID` on the
chief→sales handoff.

## Check 6 — replay after deployment

Holds as a plan, with one caveat worth acting on.

The safe replay is **one exact inbound replay of the single Gmail message ID**
through the ordinary inbound path — not a thread replay, not a Gmail re-send,
not a bulk history re-scan. It is safe because:

- the 156 harmful auto rules are disabled and actionable auto-rules can no
  longer be created (`src/classify-ipc-handlers.ts:119`), and the `Fwd:` subject
  now suppresses any surviving sender rule
  (`src/classify-rules-runner.ts:175`), so the replay reaches Mailman's
  content-aware classifier rather than the host fast path;
- CRM dedup is the existing guard for the manually created party/pipeline work;
  the replay writes no CRM row directly;
- sending remains impossible without the separate operator approval and the
  Gmail-confirmed receipt: `routeClassifiedEmail` only writes IPC handoffs, and
  Chief/Sales hold no send capability (`src/gmail-ipc-policy.ts:28-39`).

Caveat to verify during the replay (see finding 1 below): confirm the resulting
Sales work item is bound to the **prospect's** address, not the internal
forwarder's, before any draft is approved.

## Check 7 — remaining deployment blockers

No code blocker. Remaining: the pinned Node 22.23.2 full-suite rerun on the
final tree, the changelog test-count correction, and the normal
`docs/RELEASE-INTEGRITY.md` immutable build/deploy with `/health` commit
verification. `docs/ACTIVE-WORK.md` correctly still reads `validating`.

## Non-blocking findings

1. **Forwarded mail keeps the forwarder's identity as the lead.** For a
   forwarded inquiry, `senderEmail` is the internal forwarder, so
   `fmtInbox`/`fmtLeadSales` (`src/host-router.ts:90-107`) and any downstream
   party binding key on that address. The preserved body now contains the
   prospect's real address, but nothing extracts it host-side. Failure scenario:
   the replayed inquiry produces a Sales work item labeled with the forwarder's
   email, and a subsequent draft is addressed to the forwarder. The approval
   step plus the recipient guard catch the send, but the party record is wrong.
   Worth a follow-up task (host-side extraction of the forwarded `From:` from
   the preserved body).
2. **Grant TTL is 24 h** (`src/gmail-ipc-policy.ts:41`). A Chief escalation
   picked up more than a day later loses its `gmail_read` authority with no
   re-grant path; recovery then requires re-routing the message.
3. **Body budget under the look-ahead rule.** An ordinary reply whose quoted
   history happens to contain an old forward marker now retains everything from
   that marker down, up to `MAX_BODY_LENGTH = 10_000`
   (`src/gmail-parser.ts:7,125`). Newest content sits at the top and truncation
   cuts the tail, so no fresh content is lost — but a bottom-posted forward
   buried under a very long history can still be truncated. The exact
   Message-ID recovery path is the intended mitigation; that is now correctly
   stated in the Chief handoff.
4. **Non-English/alternate prefixes are out of scope of the guard**: `AW:`,
   `WG:`, `TR:`, `SV:`, `Antwort:` and dash-separated `Fwd - …` do not match
   `isHumanReplySubject`. Low risk for this mailbox, cheap to add if a
   counterexample appears. Also expect a modest LLM-volume increase: automated
   senders whose subjects begin `RE:` now fall through to Mailman.

## Files and commands inspected

Files: `docs/reports/NC-20260803-003-CODEX-REQUEST-R3.md`,
`docs/reports/NC-20260803-003-CODEX-REQUEST-R2.md`,
`src/classify-rules-runner.ts` + test, `src/gmail-parser.ts` + test,
`src/host-router.ts` + test, `src/channels/gmail.ts` + test,
`src/classify-ipc-handlers.ts` + test, `src/gmail-ipc-policy.ts`,
`src/db.ts` (`storeMessage`, `storeMessageDirect`, `getNewMessages`,
`getMessageById`, `getLatestInboundByThread`), `src/index.ts` (message loop
`folderByJid`, `storeMessage` call site), `groups/chief/CLAUDE.md`,
`docs/ACTIVE-WORK.md`, `docs/ARCHITECTURE.md`, `docs/ENGINEERING-CHANGELOG.md`,
`docs/PROJECT-MAP.md`.

Commands: `git diff --stat`, `git diff -- src/`, `git diff -- docs/ groups/`,
targeted `grep -n` over the files above, `node -v` (v26.5.1),
`npx vitest run` over the five focused files (123/125; 2 `better-sqlite3` ABI
failures), `npx tsc --noEmit` (clean),
`npm run docs:continuity-check` (passed). No email, Slack, deploy, commit,
service restart, production data access, or secret inspection occurred.
