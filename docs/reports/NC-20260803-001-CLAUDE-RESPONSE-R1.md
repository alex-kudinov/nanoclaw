# NC-20260803-001 Claude response R1 — incident design review

- Reviewer: Claude Opus 5 (C5 validator)
- Round: R1, responding to `docs/reports/NC-20260803-001-CODEX-REQUEST-R1.md`
- Base: worktree at `fb8ed9e` (documentation tip over production release `e1fa93e`)
- Scope reviewed: the request's five candidate repairs **and** the uncommitted
  working-tree implementation present at review time (8 modified files:
  `container/agent-runner/src/ipc-mcp-stdio.ts`, `src/channels/slack.ts`,
  `src/gmail-ipc-handlers.ts`, `src/gmail-ipc-handlers.test.ts`, `src/ipc.ts`,
  `src/ipc-gmail-auth.test.ts`, `src/types.ts`, `docs/ACTIVE-WORK.md`)
- Source code was not edited in this round.

## Verification performed

| Check | Result |
| --- | --- |
| `npx tsc -p tsconfig.build.json --noEmit` | clean |
| `vitest run src/ipc-gmail-auth.test.ts src/gmail-ipc-handlers.test.ts src/channels/slack.test.ts src/approved-send-handoff.test.ts src/ipc-handoff-echo.test.ts --pool=forks --no-file-parallelism --maxWorkers=1` | 177 passed / 5 files |
| Card-guard reachability probe against a structurally faithful malformed card | guard branch **not** entered (see F1) |
| `deriveLeadThreadKey` / `deriveLeadEntryRef` against the `fmtClientResponse` handoff shape | both `undefined` (see F2) |

Deviation to record: this host resolves `node v26.5.1`; `.nvmrc` pins `22.23.2`
and the sandbox blocked the version switch. Type-check and unit results above
are therefore indicative, not release-grade. The release gate must re-run them
under the pinned runtime before any activation.

## Verdict per candidate repair

### 1. Stamp `source_container` on every Gmail MCP request — **accept**

`container/agent-runner/src/ipc-mcp-stdio.ts` now stamps `source_container` on
all five Gmail tools, matching the pre-existing `send_message` stamp at the same
file. The value comes from the runner's `CONTAINER_NAME` env, not from model
arguments, so it is not prompt-forgeable. No objection.

One consequence to state explicitly rather than assume: the container image must
be rebuilt and `data/sessions/*/agent-runner-src` refreshed for this to take
effect. A host deployed with the new `src/` but a stale runner emits no
`source_container`, and every path below silently falls back to legacy
untargeted delivery. That is a deployment-ordering fact, not a code defect.

### 2. Carry provenance through `GmailIpcPayload` and target every async result — **accept with change**

The implementation is correct in shape: `GmailIpcPayload.source_container`,
`writeInputMessage(..., targetContainer)` for `gmail_search` / `gmail_read` /
`gmail_get_thread`, and `writeDeniedGmailInput(..., sourceContainer)` for all
five denial sites in `src/ipc.ts` (invalid Action-ID, ambiguous match, unknown
action, unbound send, and the authorization-reason denial). The untargeted
fallback is retained with an explicit `logger.warn`, as the request required.

**Required change — F4: a targeted result whose container has exited is now
destroyed silently.** `src/container-runner.ts:1098-1111` unlinks every input
file whose `target_container` equals the exiting container. Its comment justifies
that by dead-letter recovery, but recovery is scoped to
`GroupQueue.state.pipedMessages` (`src/group-queue.ts:423-429, 1074-1160`), which
only tracks payloads written by `queue.sendMessage`. Files written by
`gmail-ipc-handlers.writeInputMessage` and `ipc.writeDeniedGmailInput` are not
tracked, so nothing re-delivers them.

Before this change an orphaned result was mis-delivered to a sibling — wrong, but
visible. After it, the result is deleted with no successor and no alert. Three of
the five denial sites do post to chief via `postBoundaryFailure`, so those stay
visible; the `authorization.reason` denial (`src/ipc.ts` ~line 908) and all three
read-path results (`gmail_search`, `gmail_read`, `gmail_get_thread`) post
nothing. Those four paths convert a loud failure into a silent one.

Minimum acceptable fix: before writing a targeted async result, confirm the
target container is still active (the queue already answers this via
`resolveContainerContext`). If it is not, either register the payload for
dead-letter recovery or write it untargeted **and** emit an error-level log naming
the dead container and the operation. Do not leave the silent-delete path.

### 3. Validate `[SALES REVIEW]` cards with the canonical parser before posting — **change (blocking)**

The intent is right and `buildApprovedHandoff` is the correct canonical parser —
it is the same function `recordApproval` uses to arm the action
(`src/send-watchdog.ts:171`), so validating with it genuinely closes the
approve-then-discover gap.

**F1 (blocking): the guard is unreachable for the incident's card shape.** The
validation sits inside `src/ipc.ts:451`:

```ts
if (handoffMatch && isSalesReviewCard(data.text)) {
  ...
  if (!buildApprovedHandoff(data.text)) { /* reject */ }
```

`handoffMatch` is `data.text.match(HANDOFF_RE)`. A `[SALES REVIEW]` card only
carries an embedded `[HANDOFF: …→mailman]` marker when the prompt emits the
"ACTION ON APPROVAL" footer. The card in this incident carries no such footer —
it ends with the plain waiting-for-approval line. Probe against a structurally
faithful card (no customer content):

```
isSalesReviewCard          : true
HANDOFF_RE matches         : false
buildApprovedHandoff null? : true
=> guard branch entered?   : false
```

The malformed card therefore skips the guard entirely and is delivered by the
normal-message branch (`src/ipc.ts` ~line 645), reaching Slack and remaining
approvable. **The repair as implemented does not fix the reported defect.**

Required change: validate on `isSalesReviewCard(data.text)` alone, independent of
`handoffMatch`, so both the footer-bearing and the plain card shape are covered.
The existing misroute guard (Bernard Suman, 2026-07-22) must keep its
`handoffMatch` condition for the *routing* suppression; only the *validation*
moves out.

**F5: the rejected card's bytes are destroyed.** The reject path calls
`fs.unlinkSync(filePath)` where every other reject path in this file calls
`quarantineIpcFile(...)`. In this very incident the draft bytes survived only
because the card had already reached Slack; under the new guard they would not
have. Quarantine the malformed card — it is the only artifact from which an exact
recovery can later be reconstructed.

**F7: the rejection notice does not reach the lead's thread.** The notice text is
`🚫 [SALES REVIEW REJECTED] …`. `deriveLeadThreadKey` gates on `LEAD_BEARING`,
whose Sales pattern is the literal `/\[SALES REVIEW\]/`; `[SALES REVIEW REJECTED]`
does not contain that substring, and the notice carries no `Email:` line. So
`leadKey` is `undefined`, no anchor applies, and the notice lands wherever
`outboundThreadTsFor` resolves — channel root for a root-scoped Sales container,
which is exactly the configuration that produced this incident. Pass an explicit
host-derived `threadKey` of `lead:{recipient}` parsed from the rejected card, or
include a labelled `Email:` line and extend `LEAD_BEARING`. Otherwise the new
"cannot be silent" failure is a rootless line the operator has no reason to
associate with the lead.

**F6 (minor): contradictory instructions to the agent.** The container-side
denial text is `[sales_review DENIED] … Do not retry with a different ID or
address; escalate.` while the Slack notice says Sales must repost the corrected
card. Pick one. Reusing the Gmail-namespaced `writeDeniedGmailInput` for a
non-Gmail rejection also pollutes that channel's log taxonomy; a thin wrapper with
its own text is cleaner.

**Pre-existing, non-blocking:** `EMAIL_LINE` in
`src/approved-send-handoff.ts:29` is unanchored to the card header, so a card
lacking a header `Email:` line but containing a `To:` line inside the fenced draft
would bind the recipient from draft body text. Not reachable through the current
prompt shape; worth a bounded ticket, not this one.

### 4. Make Sales root posts first-class work units (`threadPerMessage`) — **change; it is necessary but not sufficient, and it is not in this diff**

Two distinct statements matter here and the request conflates them.

**F2 (blocking for the stated root cause): `threadPerMessage` cannot fix the
observed Slack split.** The work item arrived over the `email-active-client`
route, whose handoff is built by `fmtClientResponse`
(`src/host-router.ts:86-96`). That format emits `From: {senderName} <{email}>`
and no `Entry ID:` line. `ADDRESS_FIELD_RE`
(`src/lead-thread-key.ts:62-63`) is anchored `^…$` around a bare address and
cannot match the display-name form; `ENTRY_FIELD_RE` finds no entry field.
Measured:

```
deriveLeadThreadKey  : undefined
deriveLeadEntryRef   : undefined
```

So the inbound handoff posts unanchored and **records no lead anchor**. The
later `[SALES REVIEW]` card does carry a bare `Email:` line, so `deriveLeadKey`
resolves `lead:{email}`, `resolveThreadAnchor` finds nothing, and — because
`hostDerivedAnchor` is true — `effectiveThreadTs` is forced to `undefined`
(`src/channels/slack.ts:926-930`). The card becomes a new channel root **no
matter which container posted it**, because the host deliberately discards
container-derived `threadTs` whenever a lead anchor is derived. One container
would have produced the same split.

The comparison case confirms the mechanism: `fmtLeadSales`
(`src/host-router.ts:45-73`), the route the *other* workflow took, emits both
`Entry ID:` and a bare `From: {email}` — it anchors, and that workflow stayed in
one thread end to end.

Required change: fix the anchor at the producer. Either emit a bare labelled
address field (`Lead Email: {email}`) on every host-router handoff, or teach
`findLeadEmail` to accept the RFC-5322 display-name form. Note the same shape is
used by `fmtInbox`, `fmtChiefEscalation`, `fmtContador`, `fmtArchivarista` and
`fmtProcurementEmail`, so this is a systemic anchor miss, not a Sales-only one.
Whichever is chosen, `fmtLeadSales` must keep working unchanged.

**F3 (blocking, introduced by this diff): the new host-work-root path can merge
two leads into one thread.** `isRecordedSalesWorkRoot` gained a
`requireLeadMatch` parameter and is called with `false` for
`hostWorkUnitThreadTs` (`src/channels/slack.ts:874-879`). That accepts *any*
recorded Sales work root without checking it belongs to the same lead. When it
matches, `keyToBindHostRoot` fires and `rollThreadAnchor` repoints that lead's
anchor onto the accepted root (`src/channels/slack.ts:940-997`).

Failure scenario, reachable as soon as candidate 4 lands: a Sales container whose
work unit is lead A's inbound handoff emits a per-lead status line about lead B —
a shape the codebase explicitly supports (`deriveLeadEntryRef`'s bare
status-line case; the incident log contains exactly such a line). `deriveLeadKey`
yields `lead:B`; `requestedHostWorkRoot` is true because lead A's root starts
work and the lead is not checked; the post lands in lead A's thread and lead B's
anchor is durably repointed to lead A's root. Every later post about lead B then
threads under lead A's work item. `src/lead-thread-key.ts:17-20` states the
governing rule: a false merge is worse than no merge. Restore the lead check, or
gate the host-root path on `deriveLeadKey(root.content) === leadKey` with an
explicit, logged exception for the case where the root legitimately derives no
key.

**Inert today:** `hostWorkUnitThreadTsFor` (`src/ipc.ts:392-398`) returns
`sourceContext.threadTs`, which is `undefined` for a `||root` container. With
`threadPerMessage` absent from the live Sales `container_config`, the entire new
Slack path is dead code in production. It activates only together with candidate
4 — which is also when F3 becomes reachable. Ship them together or not at all.

On the mechanism question the request asks: make it a tracked runtime migration
plus a startup assertion that fails closed and logs the offending group, not a
silent host default. A silent default is indistinguishable from drift, and this
incident's config drift is precisely what went unnoticed.

### 5. Recover the stuck email only from exact operator-approved bytes — **change; and the owner's current instruction is not sufficient authority**

Ledger state: the action was failed as `blocked` with reason
`approval_card_unparseable` (`src/index.ts:1838-1848`). `listOverdueSends`
excludes `blocked` (`src/db.ts:1667-1677`) and `findPendingSendAction` excludes it
too (`src/db.ts:1287`), so the row cannot be re-matched and cannot raise another
alert. Two consequences: recovery is duplicate-safe against the old row, and
nothing is currently watching this lead.

Replay risk is closed: the unbound request was moved to
`data/ipc/quarantine/<group>/` by `quarantineIpcFile`
(`src/ipc.ts:188-201`), which is outside the watched `messages` directory. It
cannot re-execute.

What exists in exact operator-approved form: recipient (card header field) and
body (the fenced draft bytes, still retrievable from the stored card by
`draftTs`). What does not exist: a subject. The card never contained one — that
is the whole defect.

The owner authorized "completion of the stuck approved email" with "exact
content/recipient must not be regenerated or changed". Binding a subject that the
operator never saw is not covered by that authorization, however defensible the
source. It is also not simply invention: for a reply the subject has an
independent host-verifiable origin — Gmail's own thread subject, reachable via the
host-generated `Thread-ID:` on the inbound handoff. So there are two coherent
paths and they differ in who approves:

- **Path A (recommended).** The host reconstructs a corrected card: body bytes
  sliced verbatim from the stored approved card, plus `Subject: Re: {subject read
  from Gmail for that exact thread}`, posted into the lead's work thread. The
  operator approves it explicitly. Normal NC-009 arming, guards, one-time claim
  and Gmail receipt then apply unchanged. Cost: one operator action. Invention:
  none. Bytes changed: none.
- **Path B.** Extend the arming contract so a subject-less card is armable when
  it carries a host-verified `Thread-ID:` and the send is a reply, with the host
  stamping the Gmail-derived subject. This removes the operator step but changes
  the approval contract during an open incident and arms content in a form the
  operator never reviewed.

Recommend Path A now and Path B, if wanted, as a separate ticket with its own
review. Either way the send is not "sent" until a Gmail receipt is recorded.

## Failure-mode sweep requested

| Mode | Status |
| --- | --- |
| Wrong email sent | No new path found. Card validation only ever refuses; `buildApprovedHandoff` slices, never regenerates. |
| Duplicate email sent | No new path found. `blocked` rows are excluded from both lookup functions; the quarantined request cannot replay; `markActionHandoff` remains the single atomic claim. |
| Targeted result orphaned | **Present — F4.** Targeted async results and denials are deleted on container exit with no dead-letter and no alert. |
| Sales work item split | **Present — F2** (producer-side anchor miss, unfixed) and **F3** (new cross-lead merge). Candidate 4 alone does not close F2. |
| Failure made silent | **Present — F1** (malformed card still approvable for the incident's card shape), **F4** (four paths lose their only signal), **F7** (rejection notice lands rootless and lead-less). |

## Exact regression tests required

Blocking — none of these exist today (`grep` for `SALES REVIEW REJECTED`,
`hostWorkUnitThreadTs`, `sales_review` across all `*.test.ts` returns nothing):

1. `src/ipc.ts` guard, card **without** an embedded handoff marker: a
   `[SALES REVIEW]` card whose fenced draft has no `Subject:` is rejected, is not
   delivered to the Sales channel, and is quarantined rather than unlinked. This
   is the direct F1 regression and must fail against the current diff.
2. Same guard, card **with** an embedded handoff marker: still rejected, and the
   existing misroute suppression still routes a well-formed card to the Sales
   channel rather than mailman.
3. Well-formed card passes the guard unchanged and reaches the Sales channel with
   its bytes intact.
4. Rejection notice threading: the notice resolves to the lead's anchor (assert
   the `threadKey` or resolved `threadTs`), not the channel root.
5. `src/host-router.test.ts`: for every formatter, `deriveLeadThreadKey` on the
   emitted text returns `lead:{sender}` — table-driven across `fmtLeadSales`,
   `fmtClientResponse`, `fmtInbox`, `fmtChiefEscalation`, `fmtContador`,
   `fmtArchivarista`, `fmtProcurementEmail`. This is the F2 regression.
6. `src/channels/slack.test.ts`: a post about lead B from a container whose host
   work root belongs to lead A does **not** thread under lead A and does **not**
   repoint lead B's anchor. This is the F3 regression.
7. `src/channels/slack.test.ts`: with `hostWorkUnitThreadTs` set and the lead
   matching, the card threads under the host work root and the lead anchor binds
   to it — the positive case for the new path, currently untested.
8. Async-result orphan: a targeted `gmail_search` / denial whose target container
   is no longer active is either dead-lettered or written untargeted with an
   error-level log; assert it is not silently unlinked. F4 regression.
9. End-to-end ordering fixture: two concurrent same-group Mailman containers, one
   bound request and one unbound; assert each container receives only its own
   result and the escalation names its own entry. This is the misattribution the
   incident actually produced and nothing currently reproduces it.

Add 1–4 and 9 to `test:email-critical` (they are release-blocking by the NC-009
boundary); 5–8 belong in the standard suite.

## Safe order of operations

Strictly separated, as requested.

**Implementation (no side effects).** F1 guard relocation; F5 quarantine; F6 text;
F7 rejection threading; F2 producer-side anchor fix; F3 lead-match restoration;
F4 orphan handling. Then tests 1–9. Then `tsc` and the full suite under the
`.nvmrc` runtime.

**Configuration mutation (separate, reversible, tracked).** Sales
`container_config.threadPerMessage`, as an ordered migration plus a fail-closed
startup assertion. Do not apply before F3 is fixed — enabling it is what makes the
cross-lead merge reachable.

**Deployment (separate).** Rebuild the container image and refresh
`agent-runner-src` so `source_container` is actually emitted; build a clean
release artifact per `docs/RELEASE-INTEGRITY.md`; pin the commit; verify `/health`
reports the intended identity. A host-only deploy leaves every targeting path on
its legacy untargeted fallback.

**Customer send (separate, last, explicitly gated).** Only after the above are
verified live: reconstruct the corrected card by Path A, obtain explicit operator
approval, let the normal NC-009 machinery run, and require a recorded Gmail
receipt before the item is called sent. One send, one lead, no batch.

## Result

**CHANGES REQUIRED**

Blocking: F1 (validation unreachable for the incident's own card shape — the
implemented repair does not fix the reported defect), F2 (the Slack split is
caused by a producer-side anchor miss that `threadPerMessage` cannot address),
F3 (the new host-work-root path can durably merge two leads), F4 (targeted async
results are now silently destroyed when their container has exited).

Non-blocking but required before release: F5, F6, F7, and regression tests 1–9.

Accepted as designed and implemented: candidate 1 in full; candidate 2 in shape,
pending F4.

- Elapsed: ~25 minutes for this round (09:23–09:48 CDT, 2026-08-03).
- Runtime deviation: verification ran under Node v26.5.1, not the pinned
  22.23.2; re-run under the pin before any release decision.

## Unresolved — owner decisions

1. **Recovery authority.** Path A (host-reconstructed corrected card + explicit
   re-approval; recommended) or Path B (extend arming so a subject-less reply
   card is armable from a host-verified Thread-ID). The existing "complete the
   stuck email" instruction does not by itself authorize binding a subject the
   operator never approved.
2. **Anchor fix shape.** Add a bare `Lead Email:` field to every host-router
   handoff, or teach `findLeadEmail` to parse the display-name form. The second
   is smaller; the first is more explicit and keeps the parser narrow.
3. **`threadPerMessage` mechanism.** Enforced host invariant versus tracked
   runtime migration plus startup assertion. Recommendation: migration plus a
   fail-closed assertion, so drift is loud rather than silent.
4. **Scope boundary.** F2 affects six host-router formatters, not just the Sales
   path. Confirm whether all six are fixed in this ticket or only the Sales route,
   with the rest tracked separately.
