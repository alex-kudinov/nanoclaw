# NC-20260803-001 Claude response R2 — implementation review

- Reviewer: Claude Opus 5 (C5 validator), session `74a9751a-7355-4943-b2fe-623f98149b71`
- Round: R2, responding to `docs/reports/NC-20260803-001-CODEX-REQUEST-R2.md`
- Base: `fb8ed9e`; review target is the uncommitted working tree
- Snapshot reviewed: 29 modified files, +888/−50. The tree changed twice during
  R1 and once during R2 (`src/channels/gmail.ts`, `src/classify-ipc-handlers.ts`,
  `src/gmail-parser.ts` and their tests appeared mid-round); all findings below
  are against the snapshot named here.
- Source code was not edited in this round.

## Verdict

**CHANGES REQUIRED** — two blockers. Review question 1 answers *yes*: a
malformed approval can still reach Slack and arm an action today.

## R1 reconciliation — confirmed

| R1 finding | Status |
| --- | --- |
| F1 guard unreachable without a handoff footer | Fixed for `[SALES REVIEW]`; **not fixed for the other two card markers** — see B1 |
| F2 active-client route derived no lead key | Fixed. `fmtClientResponse` emits `Lead Email:`, and Reply-To is now plumbed from Gmail headers through `classify-ipc-handlers` and the `gmail.ts` fast path. Residual risk in B4/B5 |
| F3 cross-lead merge via `requireLeadMatch = false` | Fixed. `isRecordedSalesWorkRoot` is back to the strict lead-matching form and the refusal is tested |
| F4 targeted results silently deleted on container exit | Behaviour fixed — results now route through `GroupQueue.sendMessage`, and an exited origin produces a chief-visible hold instead of a sibling delivery. But the recovery property claimed for it is not real — see B2 |
| F5 rejected card unlinked | Fixed — `quarantineIpcFile(..., 'sales-review-malformed')`, plus a new `sales-review-unroutable` quarantine on the unregistered-group path |
| F6 contradictory agent instructions | Fixed — dedicated `writeRejectedSalesReviewInput` with repair-specific text |
| F7 rejection posted rootless | Fixed — `parseApprovalCardRecipient` supplies `threadKey: lead:{recipient}` |

## Verification performed

| Check | Result |
| --- | --- |
| `npx tsc -p tsconfig.build.json --noEmit` | clean |
| `test:email-critical` (12 files) | 9 files / 279 tests pass; `db.test.ts`, `routing.test.ts`, `email-delivery-path.test.ts` fail or skip **solely** on a native-module ABI mismatch (`better_sqlite3.node` built for `NODE_MODULE_VERSION 127`, this host runs 147) — not a code defect |
| `npm run docs:continuity-check` | passed — 40 active/ready rows, 36 changelog entries |
| Card-marker coverage probe | reproduces B1 |
| Lead-key divergence probe | reproduces B4 |
| Reply-To header-vs-body probe | reproduces B5 |

This host resolves Node v26.5.1 and the sandbox blocks the `.nvmrc` switch to
22.23.2. Codex's pinned-runtime evidence (12 files / 362 tests) remains the
authoritative signal for the three ABI-blocked files; nothing I observed
contradicts it.

## Blockers

### B1 — Two of the three approvable card markers still bypass pre-approval validation

The new gate is `isSalesReviewCard(data.text)` (`src/ipc.ts:487`), backed by
`SALES_REVIEW_RE = /\[SALES REVIEW\]/` (`src/ipc.ts:154`). The *arming* surface
is wider: `CARD_RE` in `src/send-watchdog.ts:124` and `CARD_MARKER` in
`src/approved-send-handoff.ts:28` both cover
`SALES REVIEW | CLIENT SUPPORT REVIEW | SUPPORT-DRAFT`.

Measured against a malformed `[CLIENT SUPPORT REVIEW]` card (no fenced
`Subject:`):

```
isSalesReviewCard (new gate)   : false
isTrackableCard  (arms action) : true
buildApprovedHandoff null?     : true
```

So the card is not intercepted, not quarantined, reaches Slack, is approvable,
and `recordApproval` mints an action ID for it. `buildApprovedHandoff` then
returns null, `approvedContentSha256` is undefined, and the operator gets
`[EMAIL APPROVAL NOT ARMED]` *after* approving — the exact R1-F1 failure mode,
still live for two of three card types. Client-support cards are precisely the
route this incident's work item travelled (`[SOURCE: email-active-client]`).

Fix: gate on the same marker set the arming path uses. Export one shared
predicate from `approved-send-handoff.ts` and have `ipc.ts` and
`send-watchdog.ts` both consume it, so the validation and arming surfaces cannot
drift again.

### B2 — Gmail async results now ride the chat-cursor rollback path, and the documented recovery property does not exist

`deliverSourceInput` (`src/index.ts:2392`) resolves the container context and
calls `queue.sendMessage(queueKey, text)`. That records the payload in
`state.pipedMessages` (`src/group-queue.ts:424`). On container death,
`processPipedMessageRecovery` (`src/group-queue.ts:1076-1162`) reacts to an
unacked payload by setting `state.pendingMessages = true` and calling
`rollbackTimestampFn(groupJid, <payload wall-clock time>)` — it rolls back the
**chat-message cursor** and re-queries the DB.

Two consequences:

1. **The result itself is never recovered.** A Gmail search/read/thread result or
   a denial is not a stored chat message, so the DB re-query cannot re-deliver
   it. `docs/SECURITY.md` and `docs/ARCHITECTURE.md` in this diff both state
   these results are "eligible for dead-letter recovery" / "use its dead-letter
   tracking". That property is asserted in two authority documents and is not
   provided by the code.
2. **A new side effect.** An unacked Gmail *read* result can now roll the Sales
   or Mailman cursor back and re-enqueue already-handled inbound handoffs and
   operator messages, re-spawning the agent on them. Before this change these
   payloads were untracked plain file writes and could not move the cursor. A
   duplicate *email* is still blocked by the one-time action claim, but a
   duplicate draft or a repeated classification run is reachable — in a ticket
   whose stated invariant is that one work item is processed once.

Fix (either is small): mark queue payloads that must not influence the cursor
and skip them in `processPipedMessageRecovery`, or give Gmail results their own
targeted-delivery helper that does not enter `pipedMessages`. Then correct the
two documents to describe what recovery actually does.

## Follow-ups

### B3 — The `threadPerMessage` startup assertion cannot fail

`migrateSalesThreadPerMessageConfig` (`src/index.ts:291-311`) writes
`registeredGroups[chatJid] = migrated` **and** `setRegisteredGroup(...)`, then
asserts over the same in-memory map it just mutated. The assertion is therefore
satisfied by the in-memory write alone; a failed or silently-ignored persist is
undetectable, and the next restart repeats the migration without ever failing
closed. Re-read via `getAllRegisteredGroups()` after the write and assert on
that, or check the persist result.

The cursor migration itself is sound. `seedSalesThreadWorkUnitCursors` seeds only
roots at-or-before the legacy `||root` cursor, skips any key whose existing
cursor is newer, and `saveState()` runs before the completion markers — so a
crash between them re-runs an idempotent migration rather than marking it done
with unsaved cursors. Roots newer than the legacy cursor stay pending and are
processed. Answers review questions 3 and 4: no replay, no skipped newer root,
no cross-lead merge, no residual root/thread split.

### B4 — When the card's lead key differs from its work root's, the fix silently reverts to the original bug

`requestedHostWorkRoot` requires `deriveLeadKey(root.content) === leadKey`
(`src/channels/slack.ts:762-781`). Measured with a handoff whose `Lead Email:`
is the relay address and a card whose `Email:` is the customer address:

```
handoff key : lead:relay@relay.example
card key    : lead:customer@example.com
keys equal? : false
```

On `false` the code falls through to the `hostDerivedAnchor` branch,
`effectiveThreadTs` becomes `undefined`, `keyToAnchor` is set, and the card
becomes a new channel root — the incident behaviour, with no log and no operator
signal. Reply-To plumbing makes the common relay case agree, so this is residual
rather than routine, but two ordinary paths still reach it: an inbound with no
Reply-To header, and a Sales agent that writes an address on the card other than
the handoff's `Lead Email:` (the prompt tells it to include `Email:`/`To:`; it
never says to copy `Lead Email:` verbatim). Emit an error-level log when an
outgoing Sales post's derived key differs from its host work root's, and
consider preferring the host-derived work-root key over the card-derived one —
the work root's key comes from Gmail headers, the card's from model output.

### B5 — Reply-To is recovered by regex over stored content, so body text can supply it

`classify-ipc-handlers.ts:212` runs `/^Reply-To:\s*(.+)$/im` against the whole
stored message, which is the header block plus the body. With no genuine
Reply-To header and a forwarded-message body containing a quoted header line:

```
regex match : attacker@evil.example
```

That value becomes `leadEmail(p)` and therefore the `Lead Email:` field, the
derived thread anchor, and — if Sales copies it onto the card — the approved
recipient. Anchor the parse to the header region (content before the first blank
line), the same discipline `parseSubjectAndBody` applies with
`---END-ORIGINAL---`. The `gmail.ts` fast path is unaffected: it reads
`headers.replyTo` directly and is authoritative.

Separately, `gmail.ts` now grants the Reply-To address as a Gmail resource
alongside the sender. That is a real widening of the search/read grant. It is
defensible for relay traffic and the address is header-derived, but it should be
stated in `docs/SECURITY.md` rather than left implicit.

### B6 — "Container exited" is reported for parameter-validation failures

`handleGmailSearch`/`Read`/`GetThread` return `false` both when the request is
missing its `query`/`messageId`/`threadId` and when delivery fails.
`dispatchGmailIpc` maps every `false` to
`[GMAIL RESULT HELD] … completed after its originating container exited`
(`src/gmail-ipc-handlers.ts:893-911`). A malformed request therefore tells the
operator a container died. Return a discriminated result, or validate before
dispatch.

### B7 — `Lead Email:` on the five non-Sales formatters has no anchoring effect

`LEAD_BEARING` (`src/lead-thread-key.ts:34-38`) covers only `*→sales` handoffs,
`sales→mailman`, and `[SALES REVIEW]`. The new field on `fmtInbox`,
`fmtChiefEscalation`, `fmtContador`, `fmtArchivarista` and
`fmtProcurementEmail` is inert for threading. Harmless and arguably good for
future use, but the changelog wording implies a broader effect than the code
delivers, and the inbox route still does not anchor. R1 owner decision 4 (scope
across all formatters) is therefore still open rather than closed.

### B8 — `parseApprovalCardRecipient` is unanchored and now has a new consumer

`EMAIL_LINE` is `/^\s*(?:Email|To)\s*:\s*(addr)$/im` and matches anywhere,
including inside the fenced draft. A malformed card with no header `Email:` but a
`To:` line in its draft body will anchor the rejection notice to that address.
Pre-existing shape, newly load-bearing for the rejection `threadKey`. Low
severity; worth anchoring to the card header while this file is open.

### B9 — Activation transition notes

- `fmtLeadSales` now derives its key from `Lead Email:` (Reply-To preferred)
  instead of the bare `From:` envelope. Leads currently anchored on the envelope
  address will key differently after activation and their next post will open one
  fresh root. One-time, cosmetic, but it should not surprise the operator.
- The long-lived Sales `||root` container is orphaned by the migration: no new
  work routes to `||root` once `threadPerMessage` is on. Drain or restart the
  daemon cleanly at activation rather than leaving it to idle-timeout mid-work.

## Answers to the review questions

1. **Can any malformed approval still reach Slack or arm an action?** Yes —
   `[CLIENT SUPPORT REVIEW]` and `[SUPPORT-DRAFT]` (B1). `[SALES REVIEW]` is
   closed.
2. **Can any Gmail async result/denial cross same-group sessions, disappear
   without a visible signal, or bypass dead-letter tracking?** Cross-session
   delivery is closed — an exited origin refuses delivery and posts a chief-
   visible hold. Disappearance is signalled. But dead-letter tracking does not
   recover these payloads, and enrolling them in it introduces a chat-cursor
   rollback side effect (B2).
3. **Can Sales activation replay consumed roots, skip a newer root, merge two
   leads, or still split a work item?** No to all four, on the code as written.
   The residual threading risk is B4, which produces an extra root rather than a
   merge or a split.
4. **Is the startup config/cursor migration repeatable and safe on the deployed
   predecessor state?** The cursor migration is repeatable and safe. The config
   migration is repeatable but its fail-closed assertion does not actually test
   persistence (B3).
5. **Do formatter/prompt changes preserve exact content and avoid broadening
   email authority?** Content is preserved — nothing regenerates a draft, and
   `buildApprovedHandoff` still slices. Authority is broadened in two narrow
   places: the Reply-To grant in `gmail.ts` (defensible, undocumented) and the
   body-sourced Reply-To in `classify-ipc-handlers.ts` (B5, should be closed).
6. **Missing release-blocking tests/documentation.** Listed below.
7. **Verdict.** `CHANGES REQUIRED`.

## Required additional tests

Release-blocking:

1. A malformed `[CLIENT SUPPORT REVIEW]` card and a malformed `[SUPPORT-DRAFT]`
   card are both rejected and quarantined before approval, and neither arms an
   action. Fails today — this is the B1 regression.
2. A well-formed card of each of the three markers still reaches the channel
   unchanged.
3. An unacked Gmail async payload does not roll back the group's chat cursor and
   does not re-enqueue already-processed chat messages. B2 regression.

Standard suite:

4. `migrateSalesThreadPerMessageConfig` throws when the persisted group still
   lacks `threadPerMessage` after the write. B3.
5. A Sales post whose derived lead key differs from its host work root's emits
   the divergence signal. B4.
6. Reply-To is taken only from the header region; a body-quoted `Reply-To:` line
   is ignored. B5.
7. A Gmail request missing its required parameter produces a distinct operator
   message from the exited-container hold. B6.

## Documentation changes required

- Correct the dead-letter claim in `docs/SECURITY.md` and `docs/ARCHITECTURE.md`
  to describe actual behaviour (targeted delivery, refusal on exited origin,
  chief-visible hold) without asserting recovery of the payload.
- Record the Reply-To Gmail-resource grant widening in `docs/SECURITY.md`.
- Soften the changelog's "every host email formatter" phrasing, or state that
  only Sales-directed handoffs derive an anchor from the new field (B7).

## Release and recovery order

Unchanged from R1 and still correct as staged. Fix B1 and B2 (plus the
documentation corrections) before commit. Configuration mutation
(`threadPerMessage` migration) stays a separate, tracked, reversible step and
should be applied only after B3 makes its assertion real. Deployment must include
the container image rebuild and `agent-runner-src` refresh, or `source_container`
is never emitted and every targeting path silently uses its legacy fallback. The
customer send remains last, separately gated, and unchanged by this round.

- Elapsed: ~20 minutes for this round (09:49–10:09 CDT, 2026-08-03).
- Cumulative for NC-20260803-001 review: ~45 minutes across R1 and R2.

## Unresolved — owner decisions

1. **Recovery authority for the held reply.** Unchanged from R1 and still open:
   Path A (host-reconstructed corrected card, verbatim body, host-derived `Re:`
   subject, explicit re-approval — recommended) or Path B (extend arming so a
   subject-less reply card is armable from a host-verified Thread-ID). Code
   readiness does not decide this.
2. **Scope across non-Sales formatters (R1 decision 4).** Still open — B7 shows
   the added field is inert outside the Sales routes, so the inbox and other
   handoffs continue not to anchor.
3. **Whether B4's divergence should merely log or should let the host work root
   win.** Letting the host root win is stricter and matches the "host-derived
   beats model-supplied" principle already in `slack.ts`, but it changes which
   thread an operator sees for a mismatched card.
