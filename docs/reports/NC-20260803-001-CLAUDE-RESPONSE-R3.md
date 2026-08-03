# NC-20260803-001 Claude response R3 — blocker reconciliation review

- Reviewer: Claude Opus 5 (C5 validator), session `74a9751a-7355-4943-b2fe-623f98149b71`
- Round: R3, responding to `docs/reports/NC-20260803-001-CODEX-REQUEST-R3.md`
- Base: `fb8ed9e`; review target is the uncommitted working tree
- Snapshot reviewed: 34 modified files, +1370/−171
- Source code was not edited in this round.

## Verdict

**CHANGES REQUIRED** — one blocker. It is a direct consequence of the B1 fix and
it takes down a live operator flow that is not Sales.

Everything else in the R2 reconciliation is confirmed correct. B2, B3, B4, B5,
B6, B7, B8 are all properly closed and independently covered.

## The blocker

### R3-1 — Widening the pre-approval gate to `[SUPPORT-DRAFT]` blocks Chief's live support-reply flow

B1 made `isSalesReviewCard()` delegate to `isApprovalCard()` (`CARD_MARKER`,
three markers) and moved the gate off `handoffMatch`. That is the right fix for
the R2 finding. But the gate now rejects and quarantines **any** card of those
three markers that `buildApprovedHandoff` cannot parse — and Chief's live
`[SUPPORT-DRAFT]` template cannot be parsed.

The authoritative Chief template is `groups/chief/SUPPORT-REPLY.md`, referenced
by `groups/chief/CLAUDE.md:62` as the "full spec, composition rules, and worked
example". Its card shape is:

```
[SUPPORT-DRAFT]
Thread-ID: {id}
To: {recipient}
Subject: Re: {subject}

THEIR REQUEST:
{summary}

DRAFT REPLY:
{body}

React ✅ to approve | reply with edits to iterate
```

Three structural mismatches against `buildApprovedHandoff`:

1. The heading is `DRAFT REPLY:`; `DRAFT_HEADING`
   (`src/approved-send-handoff.ts:36`) accepts only `DRAFT RESPONSE:` or
   `DRAFT RESPONSE TO LEAD:`.
2. There is no `---` fence pair at all.
3. `Subject:` sits in the header block, not inside a fence.

Measured against that exact structure (placeholder content, no customer text):

```
isApprovalCard / isSalesReviewCard gate : true / true
isTrackableCard (arms on approval)      : true
parseApprovalCardRecipient              : person@example.com
buildApprovedHandoff                    : null
=> intercepted AND unparseable => quarantined, never posted: true
```

After activation, every Chief support draft is intercepted, fails validation, is
quarantined, and **never reaches Slack**. In its place the operator gets
`🚫 [SALES REVIEW REJECTED] … Sales must repost the full corrected card` posted
into `#gru-chief` — Sales-worded guidance for a card Chief authored, naming a
group that has nothing to do with it. The operator's client-escalation reply path
becomes a hard stop.

**This is partly pre-existing and that matters for how you fix it.** At `fb8ed9e`,
`isTrackableCard` already used the three-marker `CARD_RE`, so an approved
`[SUPPORT-DRAFT]` already ran through `recordApproval` → `buildApprovedHandoff`
→ null → `approvedContentSha256` undefined → `[EMAIL APPROVAL NOT ARMED]` and a
failed action. Chief's support replies have therefore been failing the same way
Justin's did since NC-009 activated — a second, undiagnosed instance of this
incident's own class. R3 does not create the incompatibility; it moves the
failure earlier and removes the operator's ability to see the draft at all.

**Compounding factor: the template is not under tracked authority.**
`groups/chief/SUPPORT-REPLY.md` is excluded by `.gitignore:28` (`groups/*/*`).
It exists only on the production host (5,245 bytes, last modified 2026-05-25).
This is exactly the drift class NC-20260802-009 closed for
`groups/mailman/OUTBOUND-EMAIL.md` — "required by the tracked Mailman prompt but
ignored by Git and absent from releases". A release-blocking validation gate now
depends on a template the repository cannot see, so no test in this diff can
detect the mismatch. The suite's support-card fixtures
(`src/approved-send-handoff.test.ts:114`, `src/send-watchdog.test.ts:164`,
`src/ipc-handoff-echo.test.ts:472`) all use the *conforming* fenced shape, which
is why 326 tests pass while the live flow would break.

Acceptable resolutions, in preference order:

- **(a)** Bring `SUPPORT-REPLY.md` under tracked authority and convert its card
  to the fenced `DRAFT RESPONSE:` + `---` + `Subject:` form, exactly as NC-009
  did for `OUTBOUND-EMAIL.md`. Add a fixture asserting the tracked template
  parses. This closes both the pre-existing arming failure and the new gate.
- **(b)** Teach `buildApprovedHandoff` to accept the Chief header-block shape
  (`DRAFT REPLY:` heading, header `Subject:`, unfenced body). Larger parser
  surface, more risk to the exact-bytes guarantee — not recommended mid-incident.
- **(c)** Scope the pre-approval gate to markers whose templates are tracked and
  verified conforming, and file the `[SUPPORT-DRAFT]` gap as its own ticket. This
  ships this incident's fix without breaking Chief, but leaves the pre-existing
  post-approval failure in place.

Whichever is chosen, the rejection text must not tell a non-Sales group that
"Sales must repost" the card.

## R2 reconciliation — verified

| R2 item | Status | Evidence |
| --- | --- | --- |
| B1 one marker surface | Implemented correctly. `isApprovalCard` is exported from `approved-send-handoff.ts` and consumed by both `ipc.ts:isSalesReviewCard` and `send-watchdog.ts:isTrackableCard`; `CARD_RE` and the duplicate `EMAIL_RE` are deleted. Validation surface now equals arming surface. See R3-1 for the consequence | code + probe |
| B2 ephemeral results excluded from rollback | Correct. `PipedWriteOpts.trackForRecovery` gates the `pipedMessages.set` (`group-queue.ts:432-440`); `deliverSourceInput` passes `trackForRecovery: false` (`index.ts:2397-2403`). Targeting and the exited-origin refusal are retained | code |
| B3 startup invariant fails closed | Correct and materially different from R2. `migrateSalesThreadPerMessageConfig` now takes injectable `persist`/`reload`, re-reads via `getAllRegisteredGroups()`, and asserts against the **persisted** rows before returning them. A silent persistence failure now throws | code |
| B4 divergence signal | Implemented. `slack.ts` emits an error-level `outgoing Sales lead differs from its host work root; refusing cross-lead binding` with both keys. Behaviour is unchanged (still refuses, still opens a new root) — this matches the minimum I asked for and leaves owner decision 3 open | code |
| B5 header-region Reply-To | Correct. Extraction is sliced to `content.slice(0, blankLineIdx)`, and the body offset now uses the matched separator length rather than a hard-coded 2, so CRLF content no longer leaks a stray character into the body | code |
| B6 distinct invalid-request message | Correct. Required-parameter checks happen in `dispatchGmailIpc` before the handler and emit `[GMAIL REQUEST INVALID]`; `[GMAIL RESULT HELD]` is now reachable only for a genuine exited origin | code |
| B7 documentation scope | Correct. `docs/SECURITY.md` and `docs/ARCHITECTURE.md` now state exclusion from dead-letter rollback and the header-derived Reply-To grant. The false recovery claim is gone | docs diff |
| B8 recipient parsing stops at the fence | Correct. `parseApprovalCardRecipient` slices before the first `DRAFT_HEADING` or `FENCE` line, and `recordApproval` uses it instead of the old unanchored `EMAIL_RE`. A body `To:` line can no longer become a recipient or a rejection anchor | code |

## Verification performed

| Check | Result |
| --- | --- |
| `npx tsc -p tsconfig.build.json --noEmit` | clean |
| `vitest run` over the 11 DB-free email-critical files | 11 files / 326 tests passed |
| `npm run docs:continuity-check` | passed — 40 active/ready rows, 36 changelog entries |
| Chief `[SUPPORT-DRAFT]` template probe | reproduces R3-1 |
| `git check-ignore groups/chief/SUPPORT-REPLY.md` | ignored via `.gitignore:28`; file present only on the production host |

`db.test.ts`, `routing.test.ts` and `email-delivery-path.test.ts` still cannot run
here: this host resolves Node v26.5.1, the sandbox blocks the `.nvmrc` switch to
22.23.2, and `better_sqlite3.node` is built for `NODE_MODULE_VERSION 127` against
this runtime's 147. Codex's pinned-runtime evidence (14 files / 413 tests)
remains authoritative for those three; nothing I observed contradicts it.

## Nonblocking follow-ups

### R3-2 — An untracked payload deleted at container exit leaves no signal

`trackForRecovery: false` correctly keeps ephemeral results out of the rollback
path, but `container-runner.ts:1098-1111` still unlinks every input file whose
`target_container` matches an exiting container, and now nothing records that it
happened: tracked payloads at least produce a `container.lifecycle.dead_letter`
log, untracked ones produce nothing. The exited-origin hold only fires when the
container is already gone at *write* time (`resolveContainerContext` returns
undefined); a container that exits between the write and the drain still loses
its result silently. This is strictly better than the pre-R1 sibling-theft
behaviour and the window is small, but it should log. Emit a warning when the
exit sweep deletes a targeted payload that was never acknowledged.

### R3-3 — Rolling-deploy ordering is now a correctness gate, not a nicety

The legacy untargeted fallback in `writeInputMessage` and
`writeDeniedGmailInput` is reachable whenever `source_container` is absent. A
host deployed ahead of the rebuilt container image emits no `source_container`,
so every Gmail result and denial silently reverts to the shared-input behaviour
that caused this incident — while the logs report only a `warn`. Make "container
image rebuilt and `data/sessions/*/agent-runner-src` refreshed" an explicit
precondition in the activation runbook, ordered before the host release, not a
parallel step.

### R3-4 — Unrelated reformatting inflates a C5 diff

`docs/ARCHITECTURE.md` carries a large prettier table-alignment reflow that has
nothing to do with this incident, and it dominates that file's diff. For a change
class that touches customer email and approval authority, keep cosmetic reflows
out of the reviewable surface or land them as a separate commit.

### R3-5 — B4's root validation is duplicated rather than shared

The new divergence check in `slack.ts` re-implements the root-shape test
(`root.id === ts`, `!root.thread_ts`, `isInboundSalesHandoff || isScheduledSalesWorkItem`)
inline instead of reusing `isRecordedSalesWorkRoot`. Functionally equivalent
today; two copies of one predicate will drift. Extract the shape test.

## Answers to the review questions

1. **Is the validation surface now exactly the arming surface for all approvable
   email cards?** Yes — both now call `isApprovalCard`. That is precisely what
   exposes R3-1: the surfaces agree, and one live template satisfies neither.
2. **Can an ephemeral Gmail result cross sessions, silently disappear, or
   influence chat-cursor recovery?** Cross-session: no. Cursor influence: no —
   `trackForRecovery: false` is correct and covered. Silent disappearance: one
   narrow residual window remains (R3-2), materially smaller than before.
3. **Does the persisted Sales startup invariant genuinely fail closed?** Yes.
   The assertion now runs against reloaded persisted rows and throws.
4. **Can a body line affect Reply-To identity, Gmail scope, card recipient, or
   rejection anchoring?** No, on all four. B5 confines Reply-To to the header
   region, the `gmail.ts` grant is header-derived, and B8 confines recipient
   parsing to the card header.
5. **Did B1-B8 introduce a new release blocker or a false authority claim?** One
   blocker: R3-1, from B1's widening. No false claim — the documentation
   corrections are accurate to the code as written.
6. **Verdict:** `CHANGES REQUIRED`.

## Required additional tests

Release-blocking:

1. The tracked Chief `[SUPPORT-DRAFT]` template parses through
   `buildApprovedHandoff` — a fixture built from the tracked template file, not
   a hand-written conforming card. This is the R3-1 regression and is only
   meaningful once the template is tracked.
2. A rejected card from a non-Sales group receives group-appropriate rejection
   text and does not instruct Sales to repost it.

Standard suite:

3. The container-exit sweep logs when it deletes an unacknowledged targeted
   payload (R3-2).

## Release and recovery order

Unchanged and still correct, with one gate added. Resolve R3-1 before commit —
option (a) also requires bringing `SUPPORT-REPLY.md` into the repository and into
release packaging, which is itself a tracked-authority change. Then: build and
verify under the pinned runtime; deploy the container image and refresh
`agent-runner-src` **before** activating the host release (R3-3); apply the
`threadPerMessage` configuration migration as its own reversible step; drain or
restart cleanly so the orphaned Sales `||root` container does not linger. The
customer send remains last and separately gated.

- Elapsed: ~20 minutes for this round (10:04–10:24 CDT, 2026-08-03).
- Cumulative for NC-20260803-001 review: ~65 minutes across R1, R2 and R3.

## Unresolved — owner decisions

1. **Recovery authority for the held reply.** Unchanged across all three rounds.
   R3's recovery boundary states recovery will "use the existing Gmail-thread
   subject", which is Path A's mechanism — host-derived, not invented. Confirm
   explicitly whether that binding requires a fresh operator approval (my
   recommendation) or proceeds on the original approval.
2. **Chief support-reply scope.** Whether R3-1 is fixed inside this ticket by
   tracking and converting `SUPPORT-REPLY.md` (option a), or deferred by
   narrowing the gate (option c). Option (c) ships sooner and leaves Chief's
   pre-existing post-approval failure live.
3. **Whether B4's divergence should merely log or let the host work root win.**
   Still open; R3 implements the logging half.
4. **Scope across non-Sales formatters.** Still open from R1; the added
   `Lead Email:` fields remain display-only outside Sales-directed handoffs.
