# NC-20260803-001 Claude response R5 — R4 blocker reconciliation review

- Reviewer: Claude Opus 5 (C5 validator), session `74a9751a-7355-4943-b2fe-623f98149b71`
- Round: R5, responding to `docs/reports/NC-20260803-001-CODEX-REQUEST-R5.md`
- Base: `fb8ed9e`; review target is the exact current tree including the staged
  Chief template
- Snapshot reviewed: 39 modified files + 1 staged addition
  (`groups/chief/SUPPORT-REPLY.md`), +1765/−127
- Source code was not edited. No customer content or address was inspected or
  reproduced.

## Verdict

**APPROVE WITH FOLLOW-UPS**

R4-1 through R4-6 are closed. I found no blocker, no new silent-failure path, no
wrong-or-duplicate-send path, and no exact-bytes risk. Four nonblocking
follow-ups are recorded below; none needs to precede commit, build, or
deployment.

## R4 reconciliation — verified

### R4-1 — closed

`observeApprovalCard()` (`src/send-watchdog.ts:208-222`) wraps `recordApproval`
and posts one `[APPROVAL CARD REJECTED]` notice whenever the marker matches but
parsing fails. `src/index.ts:1930-1955` uses it, threads the notice under
`approvalThreadTs`, and posts `[EMAIL ACTION]` only when a real `actionId`
exists. Probed directly against a malformed backlog card (inert placeholders):

```
pending        : null
rows recorded  : 0
notices posted : 1
notice text    : 🚫 [APPROVAL CARD REJECTED] This approval was not armed because
                 the card cannot be bound to one exact Email, fenced Subject,
                 and body. It was NOT sent. Chief must repost the full corrected
                 card.
```

The R4-1 population is genuinely covered: the notice does not depend on the
pre-post IPC gate having run, so pre-activation backlog cards fail loudly.

Loop safety confirmed: `isApprovalCard(approvalCardRejectedText(...))` is
`false`, so approving the rejection itself records nothing and posts nothing —
re-approving produced zero additional notices in the probe.

### R4-2 — closed

`docs/RELEASE-INTEGRITY.md` now carries a second ordered activation gate
alongside the runner gate: compare and copy every reviewed changed group
instruction from the verified release into the writable operational `groups/`
workspace, recording source and destination hashes, "**before or atomically with
host activation, never after it**". It names all five files this release changes
(`groups/chief/CLAUDE.md`, `groups/chief/SUPPORT-REPLY.md`,
`groups/sales/CLAUDE.md`, `groups/sales/WORKFLOWS.md`,
`groups/mailman/OUTBOUND-EMAIL.md`) and states the correct rationale — the host
resolves `GROUPS_DIR` from the operational working directory rather than
`NANOCLAW_CODE_ROOT`. This is the gate R4-2 asked for, with the right force and
the right ordering.

### R4-3 — closed

`groups/chief/SUPPORT-REPLY.md` is staged (`A ` in `git status --porcelain`) and
`git ls-files --error-unmatch groups/chief/SUPPORT-REPLY.md` now succeeds, so
`build-release.mjs`'s `git ls-files -- … groups …` enumeration will include it in
the packaged artifact.

### R4-4 — closed

The malformed-card quarantine family is now the group-neutral
`approval-card-malformed` (`src/ipc.ts:522`), asserted by two regressions in
`src/ipc-handoff-echo.test.ts` (lines 469 and 546) via
`expect.stringMatching(/^approval-card-malformed-/)`. See R5-4 for the sibling
family that was left behind.

### R4-5 — closed, and it closes the R4-1 population at the source

`src/channels/slack.ts:1028-1037` detects `isApprovalCard(text)` and
`prefix.length + text.length > MAX_MESSAGE_LENGTH` **before** the split branch,
replaces the outbound text with a single rejection, and posts that. Because the
replacement text is short, the chunk loop at line 1081 is unreachable for
approval cards — no original fragment can be posted by any path, including the
disconnect queue and the retry queue, both of which re-enter `sendMessage` with
the original text and re-apply the refusal.

`storeOutbound` persists `outboundText`, so the stored row for that `ts` is the
rejection, not a card fragment. That matters: it means no partial card row exists
for an operator to approve later, which removes the chunked-card half of R4-1's
population rather than merely reporting it.

The regression asserts exactly one `postMessage` call, the rejection text
matching `/\[APPROVAL CARD REJECTED\].*4000-character limit.*Sales must repost/`,
absence of tail content (`not.toContain('Paragraph 399')`), and the
`refused to split an approval card` error log.

One property worth recording as correct-by-construction: `leadKey` is derived
from the original card text before the replacement, so the rejection inherits the
card's lead anchor and lands in the lead's work thread rather than at channel
root.

### R4-6 — closed

Runner-before-host ordering remains an explicit, non-parallel activation gate.
Recording the resolved image digest and refreshed snapshot paths in the
activation record is the right closure; nothing further is needed in code.

## Verification performed

| Check | Result |
| --- | --- |
| `npx tsc -p tsconfig.build.json --noEmit` | clean |
| `vitest run` over the 12 DB-free email-critical/incident files | 12 files / 351 tests passed |
| `npm run docs:continuity-check` | passed — 40 active/ready rows, 36 changelog entries |
| `git ls-files --error-unmatch groups/chief/SUPPORT-REPLY.md` | succeeds (staged) |
| Malformed-card approval probe | R4-1 closed; rejection posted, zero rows, loop-safe |
| Quarantine family strings | `approval-card-malformed` in code and in two assertions |
| `failEmailAction` after the index.ts import removal | still used at `src/ipc.ts:1017,1030,1102` — not orphaned |

`db.test.ts`, `routing.test.ts`, `email-delivery-path.test.ts` and
`classify-ipc-handlers.test.ts` cannot run on this host: it resolves Node
v26.5.1, the sandbox blocks the `.nvmrc` switch to 22.23.2, and
`better_sqlite3.node` is built for `NODE_MODULE_VERSION 127` against this
runtime's 147. Codex's pinned-runtime evidence (14 files / 417 tests) remains
authoritative for those; nothing I observed contradicts it. The broad gates
still need their pinned-runtime run on the converged snapshot before commit, as
the request states.

## Answers to the review questions

1. **Can a malformed backlog card now fail silently or mint an action?** No.
   `recordApproval` refuses to mint, and `observeApprovalCard` guarantees a
   visible notice on the same boundary. Probe-verified.
2. **Can an overlong approval card be split into separately approvable rows, or
   can any original fragment reach Slack?** No to both. The refusal precedes the
   split, the replacement is short enough that the chunk loop is unreachable, and
   the stored row is the rejection. The disconnect and retry queues re-enter the
   same guard.
3. **Does the activation contract guarantee the reviewed instructions reach the
   operational `GROUPS_DIR` before the new host depends on them?** Yes — an
   explicit ordered gate naming all five changed files, with hash recording, and
   the correct `GROUPS_DIR` rationale.
4. **Are R4-3 and R4-4 factually closed?** Yes. The template is staged and
   enumerable by the packager; the malformed family is group-neutral and
   asserted.
5. **Did this reconciliation create a new blocker or exact-bytes risk?** No
   blocker. No exact-bytes risk: `buildApprovedHandoff` is unchanged, the
   overlong path substitutes rather than truncates, and nothing on any new path
   rewrites customer-facing content.
6. **Verdict:** `APPROVE WITH FOLLOW-UPS`.

## Nonblocking follow-ups

### R5-1 — The length refusal never reaches the authoring container

The parse-failure path notifies the originating session
(`writeRejectedSalesReviewInput` → `deliverSourceInput`), which is the invariant
this ticket established. The length refusal does not: it happens inside
`SlackChannel.sendMessage`, after `ipc.ts` has already consumed and unlinked the
card file, and it only logs. The agent believes its card was posted and ends its
turn; only a human re-prompt restarts the loop.

This is visible rather than silent, and it is strictly better than posting
approvable-looking fragments, so it does not block. But the two rejection paths
should be symmetric. The clean fix is to evaluate the length alongside
`buildApprovedHandoff` in `ipc.ts`, where `data.source_container` and
`deps.deliverSourceInput` are already in scope; slack.ts can export the
threshold and prefix rule so there is one definition.

### R5-2 — Three different author names in one operator vocabulary

The same `[APPROVAL CARD REJECTED]` sentence names the author three ways:

- `src/ipc.ts:503` uses `sourceEntry[1].name` — production values are
  `#gru-sales`, `#gru-chief`, `mailman`, so the notice reads "#gru-sales must
  repost…".
- `src/index.ts:1939-1940` uses
  `registeredGroups[card.chat_jid]?.name ?? card.from_group` — same
  channel-name form, with a bare-folder fallback.
- `src/channels/slack.ts:1032-1034` uses
  `fromGroup.charAt(0).toUpperCase() + fromGroup.slice(1)` — "Sales", "Chief".

Cosmetic, but this is the single operator-facing sentence in the fail-closed
path and R4 claim 3 was specifically about getting it right. Separately,
`registeredGroups[card.chat_jid]?.name` names the *channel's* group rather than
the card's author; `card.from_group` is the accurate source for a backlog card
that was posted cross-channel.

### R5-3 — A refused approval leaves no ledger row

Before R4, an unparseable approval minted an action and immediately failed it as
`blocked` / `approval_card_unparseable`, leaving durable evidence in
`pending_sends`. Now nothing is minted, so the only durable traces are the stored
Slack rejection message and the log line. The direction is right — an unparseable
card must not mint an action — but the audit trail for "an operator approved
something the host refused" now lives outside the email action ledger. Consider a
structured counter or log field so this population is queryable without scraping
Slack.

### R5-4 — The sibling quarantine family is still Sales-named

R4-4 made the malformed family group-neutral, but the unregistered-source-group
path in the same block still uses `'sales-review-unroutable'`
(`src/ipc.ts:551`). Same cosmetic class, same triage impact, one line.

### R5-5 — Minor: the rejection may become the lead's thread anchor

When an overlong card is refused and the lead has no existing anchor, the
rejection notice becomes the recorded root for `lead:{recipient}`, so later
drafts thread under a rejection. Coherent — it is the work item's first visible
post — but worth knowing before it is seen in production and mistaken for a
threading bug.

## Release and recovery order

Unchanged and now unblocked:

1. Run the broad gates on this converged snapshot under the pinned runtime.
2. Commit (the staged template is included), then `release:build` — it enforces
   the clean-tree and pinned-runtime preconditions itself.
3. Rebuild the container image and refresh every `data/sessions/*/agent-runner-src`
   snapshot **before** activating the host; copy the five reviewed group
   instructions into the operational checkout with recorded hashes in the same
   window, never after.
4. Apply the Sales `threadPerMessage` configuration migration as its own
   reversible step; drain or restart cleanly so the orphaned `||root` container
   does not linger.
5. Only then the separately authorized recovery: reconstruct a corrected card
   from the stored exact recipient and body plus the existing Gmail-thread
   subject, require a fresh approval through the deployed normal path, and
   require a durable Gmail receipt before the reply is called sent.

- Elapsed: ~20 minutes for this round (10:30–10:50 CDT, 2026-08-03).
- Cumulative for NC-20260803-001 review: ~105 minutes across R1-R5.

## Unresolved — owner decisions

1. **R4-5 shape.** The fail-closed option was implemented rather than
   reassembly. That is my recommended choice and I endorse it; recording it as
   decided unless the owner wants long support cards to remain postable, which
   would require the reassembly variant instead.
2. **Divergence handling.** Whether a host-root/outgoing-lead mismatch should
   continue to refuse-and-log or let the host work root win. Open since R2;
   nothing in this round changes the trade-off.
3. **Non-Sales formatter scope.** Open since R1; the added `Lead Email:` fields
   remain display-only outside Sales-directed handoffs.
4. **Recovery approval.** Treated as agreed across R4 and R5: a corrected card
   and a fresh operator approval through the deployed normal path.
