# NC-20260803-001 Claude response R4 — R3 reconciliation review

- Reviewer: Claude Opus 5 (C5 validator), session `74a9751a-7355-4943-b2fe-623f98149b71`
- Round: R4, responding to `docs/reports/NC-20260803-001-CODEX-REQUEST-R4.md`
- Base: `fb8ed9e`; review target is the uncommitted working tree
- Snapshot reviewed: 39 modified files + 1 new untracked authority file,
  +1486/−98
- Source code was not edited in this round. No customer content or address was
  inspected or reproduced.

## Verdict

**CHANGES REQUIRED** — two blockers. One is a new silent-failure regression
introduced by the R3 arming change; the other is a missing activation-ordering
gate without which R3-1 does not take effect in production at all.

All seven R3 reconciliation claims are otherwise implemented as described, and
one claim is factually overstated in a way that resolves at commit time.

## Blockers

### R4-1 — Approving a malformed card is now completely silent

R3 claim 2 tightened arming: `recordApproval` returns null when
`buildApprovedHandoff` returns null (`src/send-watchdog.ts:172-175`). The change
is correct in isolation — an unparseable card must not mint an action.

Its consequence is not. The approval listener at `src/index.ts:1943-1957` gates
the operator-visible failure notice on `pending?.actionId`:

```ts
if (pending?.actionId && (!pending.recipient || !pending.approvedContentSha256))
  → failEmailAction(...) + "🚫 [EMAIL APPROVAL NOT ARMED] …"
```

With `recordApproval` now returning `null` before an `actionId` exists, that
branch is unreachable dead code. Measured against a structurally malformed card
(inert placeholders):

```
isApprovalCard / isTrackableCard : true / true
buildApprovedHandoff null?       : true
recordApproval returns           : null
=> [EMAIL APPROVAL NOT ARMED] branch reachable? : false
```

So approving a malformed card now yields: no action row, no `[EMAIL ACTION]`,
no `[EMAIL APPROVAL NOT ARMED]`, and — because no pending row is written — no
later `[SEND NOT OBSERVED]` sweep either. Total silence. Before this change the
same approval produced a visible fail-closed notice.

The pre-approval gate does not cover this, because it only inspects cards
travelling through `ipc.ts`. Two populations reach the listener anyway:

1. **Cards already in Slack before activation** — including this incident's own
   held card and any Chief `[SUPPORT-DRAFT]` posted under the old template. An
   operator who approves one of those after activation gets nothing at all.
2. **Chunked cards.** `src/channels/slack.ts:62` sets
   `MAX_MESSAGE_LENGTH = 4000` and splits longer posts into sequential messages
   (`slack.ts:1067-1119`). `recordApproval` parses `card.content` from the single
   stored row named by the reacted `ts`, so a card split across rows may not
   parse from the row the operator reacted to. This is not hypothetical for
   support cards: the tracked Chief template instructs including the client's
   original message verbatim, which can carry a card past 4000 characters.

This ticket exists because a failure was silent and misattributed. Trading a
loud failure for a silent one is not an acceptable direction, even when the loud
one was rarer.

Fix, small and local: keep `recordApproval` returning null, and in the approval
listener post the rejection notice when `isApprovalCard(card.content)` is true
and `buildApprovedHandoff(card.content)` is null. Reuse the new
`[APPROVAL CARD REJECTED]` wording so the pre- and post-approval messages agree.

### R4-2 — Activating the release does not deliver the corrected Chief template to the runtime

R3-1's fix is the template, and the template does not ship through the release
path that R3-3 now orders.

`src/config.ts:24,35` resolves `GROUPS_DIR` from `process.cwd()`, and the
service's `WorkingDirectory` is the operational checkout, not
`NANOCLAW_CODE_ROOT`. `docs/RELEASE-INTEGRITY.md:190-200` states this directly:
group workspaces "remain under the operational checkout", prompt files are
"included and transport-verified in the archive", but the host "does not yet
cryptographically bind the writable live group workspace to that archived copy",
so "deployment must compare/copy the reviewed prompt files explicitly and record
their hashes."

Verified read-only against production: the live
`groups/chief/SUPPORT-REPLY.md` still contains `DRAFT REPLY:` (2 occurrences)
and zero `DRAFT RESPONSE:`. It is the 2026-05-25 file.

Therefore, if the host is activated without explicitly copying the corrected
template into the operational checkout, Chief keeps emitting the old shape, the
widened gate rejects it, and every Chief support draft is quarantined before it
reaches Slack — R3-1's outcome, unfixed, now with the release deployed. R3-3
received an explicit, ordered, bolded precondition for the container runner. The
group-prompt copy is an equally hard correctness gate for this specific release
and currently has only the generic residual paragraph.

Fix: add an ordered activation precondition of the same force as the R3-3
paragraph — copy the reviewed `groups/chief/SUPPORT-REPLY.md` (and any other
prompt this release changed: `groups/sales/CLAUDE.md`,
`groups/sales/WORKFLOWS.md`, `groups/mailman/OUTBOUND-EMAIL.md`,
`groups/chief/CLAUDE.md`) into the operational checkout and record their hashes,
before or with host activation, never after.

## Factual correction

### R4-3 — `groups/chief/SUPPORT-REPLY.md` is not yet tracked

R3 claim 1 says the file "is tracked authority". In this tree it is not:

```
git ls-files --error-unmatch groups/chief/SUPPORT-REPLY.md
  → error: pathspec … did not match any file(s) known to git
git status --porcelain → ?? groups/chief/SUPPORT-REPLY.md
```

The `.gitignore` negation is correctly in place (`!groups/chief/SUPPORT-REPLY.md`
at line 34, alongside the existing `!groups/mailman/OUTBOUND-EMAIL.md`), so the
file is no longer ignored — but it has not been added to the index.

This is not a latent hole, and I am recording it as a correction rather than a
blocker for two verified reasons:

- `scripts/build-release.mjs:18-27` runs
  `git status --porcelain=v1 --untracked-files=all` and refuses to package a
  non-clean worktree, so a release cannot be built while the file is untracked.
- Packaging enumerates inputs with `git ls-files -- … groups …`
  (`build-release.mjs:115-133`), so once added the file is included; until added
  the build fails rather than silently shipping without it.
- The new regression uses `fs.readFileSync` on the path and throws `ENOENT` if
  the file is absent, so it fails closed in a fresh checkout too.

It simply needs `git add` at commit. Worth stating because the R4 request
asserts a state the tree does not yet have.

## R3 reconciliation — verified

| R3 claim | Status | Evidence |
| --- | --- | --- |
| 1. Tracked Chief template, conforming, with a regression that reads it | Template shape correct — `DRAFT RESPONSE:`, `---` fence, `Subject:` inside, delimited by `APPROVAL-CARD-TEMPLATE:START/END`, plus an explicit "the two `---` lines are mandatory" rule. The regression extracts that exact block and substitutes inert placeholders. Tracking state corrected in R4-3; runtime delivery is R4-2 | file + test + `.gitignore` diff |
| 2. Arming requires parseability, not just marker match | Implemented (`send-watchdog.ts:172-175`), and the duplicate `CARD_RE`/`EMAIL_RE` are gone so the surfaces cannot drift. Correct in itself; see R4-1 for the consequence | code + probe |
| 3. `[APPROVAL CARD REJECTED]` names the authoring group | Implemented at `src/ipc.ts:503` using `sourceEntry[1].name`; covered by `it('uses the authoring group in a non-Sales rejection')` | code + test |
| 4. R3-2 exit-sweep warning | Implemented. `sweepExitedContainerInputs` is extracted and exported, warns only when `chat_cursor_recoverable === false`, and returns a count; covered by `it('warns when an unacknowledged ephemeral result is discarded')` | code + test |
| 5. R3-3 runner-before-host ordering | Implemented in `docs/RELEASE-INTEGRITY.md` as an explicit, ordered, non-parallel precondition with the correct rationale | docs diff |
| 6. R3-4 reflow removed | Confirmed. `docs/ARCHITECTURE.md` is now `1 file changed, 5 insertions(+)` — the table reflow is gone | diffstat |
| 7. R3-5 shared root-shape validation | Implemented. `recordedSalesWorkRoot()` is private on `SlackChannel` and consumed by both the strict binding path (line 768) and the divergence log (line 885) | code |

Also verified as a genuine improvement not claimed in the request: the new
`it('does not accept a recipient line injected inside the draft body')`
regression locks in R2-B8's header-anchored recipient parsing against injection.

## Verification performed

| Check | Result |
| --- | --- |
| `npx tsc -p tsconfig.build.json --noEmit` | clean |
| `vitest run` over the 12 DB-free email-critical/incident files | 12 files / 350 tests passed |
| `npm run docs:continuity-check` | passed — 40 active/ready rows, 36 changelog entries |
| `git ls-files --error-unmatch groups/chief/SUPPORT-REPLY.md` | not tracked (R4-3) |
| Malformed-card approval probe | reproduces R4-1 |
| Live production Chief template, read-only | still `DRAFT REPLY:`, confirming R4-2 |

`db.test.ts`, `routing.test.ts`, `email-delivery-path.test.ts` and
`classify-ipc-handlers.test.ts` cannot run on this host: it resolves Node
v26.5.1, the sandbox blocks the `.nvmrc` switch to 22.23.2, and
`better_sqlite3.node` is built for `NODE_MODULE_VERSION 127` against this
runtime's 147. Codex's pinned-runtime evidence (14 files / 416 tests) remains
authoritative for those; nothing I observed contradicts it.

## Nonblocking follow-ups

### R4-4 — Quarantine family is Sales-named for all three markers

`quarantineIpcFile(filePath, sourceGroup, 'sales-review-malformed')`
(`src/ipc.ts:515-519`) files a rejected Chief `[SUPPORT-DRAFT]` under a
Sales-named family. The rejection *message* was correctly de-Sales-ified by
claim 3; the quarantine path was not. Cosmetic, but it misleads triage and
undercuts the same fix.

### R4-5 — Approval parsing is keyed to one stored message row, but a card can span rows

Independent of R4-1's fix: `recordApproval` and the approval listener both read a
single `getMessageById(ts)` row, while `slack.ts` may split a card into several
rows at 4000 characters. Nothing reassembles them. Either refuse to chunk a card
that `isApprovalCard` matches (fail closed at post time, consistent with the new
gate), or reassemble the anchored chunk set before parsing. Bounded ticket, not
this one — but it is the structural reason R4-1's population is not empty.

### R4-6 — Rolling-deploy legacy fallback (carried from R3-3)

Now documented as an ordered precondition, so this drops from a correctness risk
to a checklist item. Keep it in the activation record with the resolved image
digest and the refreshed `agent-runner-src` paths.

## Answers to the review questions

1. **Does the tracked Chief template pass the same parse and arming boundary as
   Sales cards without widening the parser?** Yes. `buildApprovedHandoff` is
   unchanged apart from the header-anchored recipient helper; the template was
   moved to the parser's shape rather than the parser to the template's.
2. **Can any malformed card still reach Slack as approvable or arm a watchdog
   row?** It cannot arm a row, and it cannot reach Slack through the IPC path.
   But a malformed card can still be *approved* — from the pre-activation
   backlog or from a chunked post — and that approval is now silent (R4-1).
3. **Is an unacknowledged ephemeral result excluded from cursor rollback and
   visibly logged if the exit sweep removes it?** Yes to both, and both are
   covered by regressions.
4. **Is runner-before-host ordering explicit enough?** Yes for the runner. But a
   second, equally load-bearing ordering gate — copying the reviewed group
   prompts into the operational checkout — is missing, and without it R3-1 has
   no runtime effect (R4-2).
5. **Did R3 introduce a new blocker, false authority claim, or exact-bytes
   risk?** One new blocker (R4-1). No false authority claim — the documentation
   is accurate to the code. No exact-bytes risk: byte handling is unchanged and
   the new injection regression strengthens it.
6. **Verdict:** `CHANGES REQUIRED`.

## Required additional tests

Release-blocking:

1. Approving a card that `isApprovalCard` matches but `buildApprovedHandoff`
   cannot parse posts a visible rejection into the approval thread and mints no
   action. Fails today — the R4-1 regression.

Standard suite:

2. A rejected non-Sales card is quarantined under a group-neutral family name
   (R4-4).
3. An approval card exceeding `MAX_MESSAGE_LENGTH` either is not chunked or is
   reassembled before parsing (R4-5), whichever resolution is chosen.

## Release and recovery order

1. Fix R4-1; add the R4-2 activation precondition; `git add
   groups/chief/SUPPORT-REPLY.md` (R4-3).
2. Re-run the broad gates on the converged snapshot under the pinned runtime.
3. Commit, then `release:build` — it will refuse if anything from step 1 is
   incomplete.
4. Deploy the container image and refresh every `agent-runner-src` snapshot
   **before** activating the host (R3-3), and copy the reviewed group prompts
   into the operational checkout with recorded hashes in the same window (R4-2).
5. Apply the `threadPerMessage` configuration migration as its own reversible
   step; drain or restart cleanly so the orphaned Sales `||root` container does
   not linger.
6. Only then the separately authorized recovery: reconstruct the corrected card
   from the stored exact recipient and body plus the existing Gmail-thread
   subject, require a fresh approval through the normal path, and require a
   Gmail receipt before it is called sent.

- Elapsed: ~20 minutes for this round (10:19–10:39 CDT, 2026-08-03).
- Cumulative for NC-20260803-001 review: ~85 minutes across R1-R4.

## Unresolved — owner decisions

1. **Recovery approval.** R4's recovery boundary now states recovery "will
   require a fresh approval through the normal path", which matches my
   recommendation across all four rounds. Treating this as agreed unless the
   owner says otherwise.
2. **R4-5 resolution.** Refuse to chunk approval cards, or reassemble before
   parsing. Refusing is simpler and fails closed; reassembling preserves the
   ability to post long support cards with quoted originals.
3. **Divergence handling.** Whether a host-root/outgoing-lead mismatch should
   continue to only log, or let the host work root win. Still open from R2.
4. **Non-Sales formatter scope.** Still open from R1; the added `Lead Email:`
   fields remain display-only outside Sales-directed handoffs.
