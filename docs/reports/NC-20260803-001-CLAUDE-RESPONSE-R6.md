# NC-20260803-001 Claude response R6 — rejected-approval claim delta

- Reviewer: Claude Opus 5 (C5 validator), session `74a9751a-7355-4943-b2fe-623f98149b71`
- Round: R6, responding to `docs/reports/NC-20260803-001-CODEX-REQUEST-R6.md`
- Review mode: adversarial C5 delta review, scoped to the claim change
- Base: `fb8ed9e`; review target is the exact current tree
- Snapshot: 40 files, +1796/−132
- Source code was not edited. No customer content or address was inspected or
  reproduced.

## Verdict

**APPROVE**

The delta is correct, minimal, and closes a genuine control-flow gap that R5
missed. Both halves are probe-verified. No blocker, no new duplicate-send path,
no new silent-failure path, no exact-bytes risk. One nonblocking observation
(R6-1) is recorded, and the five R5 follow-ups remain open and unchanged.

## The gap was real

R5 verified that `observeApprovalCard()` posted a visible rejection and minted no
action, and I stopped there. I did not check what the listener returned. The
listener returned `false` unconditionally, and `false` is *unclaimed* in
`SlackChannel`'s approval chain:

```ts
for (const listener of this.approvalListeners) {
  if (await listener(event.item.ts, reactor)) return;   // slack.ts:426-432
}
… buildApprovalContent(…) → this.opts.onMessage(…)      // injection
```

So a rejected approval still fell through to the injection and woke the agent
with "✅ Approved …" for a card the host had just refused. The host said NOT
SENT while the agent was told it was approved — a contradiction of exactly the
kind this incident is about. Codex found it; the finding is correct and it was my
miss in R5.

## The delta — verified

`observeApprovalCard` now returns `{ pending, rejected }` with
`rejected = isApprovalCard(opts.cardText) && !pending`
(`src/send-watchdog.ts:216-217`), and the listener sets
`claimApproval = rejected` and returns it (`src/index.ts:1922, 1951-1952, 1969`).
`[EMAIL ACTION]` still posts only when `pending?.actionId` exists, and the
Gmail-resource grant is unchanged.

Probed directly against three shapes (inert placeholders):

```
malformed card           | isApprovalCard: true  | rejected: true  | actionId: none   | rows: 0 | notices: 1
valid card               | isApprovalCard: true  | rejected: false | actionId: minted | rows: 1 | notices: 0
proposal follow-up draft | isApprovalCard: false | rejected: false | actionId: none   | rows: 0 | notices: 0
```

That is exactly the intended matrix: rejected cards claim and suppress, valid
armed cards stay unclaimed so the agent path runs, and unmarked host drafts are
untouched.

## Claim-chain starvation — checked, and clear

Returning `true` short-circuits the **entire** remaining chain, not just the
injection, so the delta could in principle starve a later approval listener. I
enumerated all four registrations on the shared `SlackChannel`, in order:

| # | Site | Owner | Registered relative to the delta |
| --- | --- | --- | --- |
| 1 | `index.ts:1837` | incident proposal (`isIncidentProposal`) | before — can starve the email listener, not the reverse; unchanged behaviour |
| 2 | `index.ts:1921` | **email approval boundary (this delta)** | — |
| 3 | `index.ts:2181` | proposal follow-up (`handleProposalApproval`) — **sends an email** | after |
| 4 | `index.ts:2232` | decline approval (`handleDeclineApproval`) | after |

Listeners 3 and 4 are the ones that could be starved. Neither is reachable by a
claimed message:

- The proposal follow-up draft is built by `buildDraftMessage`
  (`src/proposal-followup.ts:100-121`) and opens with
  `📋 *Proposal follow-up #N — …*`. It carries none of the three approval-card
  markers, so `isApprovalCard` is false and `rejected` can never be true for it.
  Probe row 3 confirms.
- `handleDeclineApproval` keys on `getActionByTs(slackTs)`
  (`src/proposal-reply-actions.ts:25`), a distinct host-generated action card
  that likewise carries no approval-card marker.

The claim surface is further narrowed by the enclosing guard
`if (card?.content && card.from_group)`. Verified against production data that
human-authored Slack messages carry `from_group = NULL` (a channel sample over
the last two days: `(null)` for human rows, `sales`/`mailman`/`inbox` for bot
rows). So an operator message that merely quotes a card marker cannot be claimed
— only a bot message authored by a registered group can be.

Conclusion: no listener is starved today, and the valid-card path is byte-for-byte
unchanged.

## Answers to the review questions

1. **Does a malformed marked card post one rejection, mint zero actions, and
   suppress the normal agent approval path?** Yes — one notice, zero rows,
   `rejected: true` claims the chain and the injection never runs.
2. **Does a valid armed card remain unclaimed so the existing agent path runs?**
   Yes — `rejected: false`, `[EMAIL ACTION]` posts, the chain continues, the
   agent receives the approval and performs the normal handoff.
3. **Can the tagged result create a duplicate-send, silent-failure, listener
   ordering, or exact-bytes risk?**
   - *Duplicate send:* no. Claiming only happens when nothing was minted, so
     there is no action to execute twice; the one-time claim on the valid path is
     untouched.
   - *Silent failure:* no — the claim happens strictly after the visible
     rejection is posted, and the rejection is threaded under the card and
     stored. The suppressed injection is the intended outcome, not a lost signal.
   - *Listener ordering:* no live exposure (table above); see R6-1 for the
     structural fragility.
   - *Exact bytes:* none. `buildApprovedHandoff` is untouched and the delta
     changes only a boolean return.
4. **Verdict:** `APPROVE`.

## Verification performed

| Check | Result |
| --- | --- |
| `npx tsc -p tsconfig.build.json --noEmit` | clean |
| `vitest run` over the 12 DB-free email-critical/incident files | 12 files / 352 tests passed (+1 vs R5) |
| `npm run docs:continuity-check` | passed — 40 active/ready rows, 36 changelog entries |
| Three-shape claim probe | matrix above |
| Approval-listener enumeration and ordering | 4 registrations, no starvation path |
| `from_group` nullity for human messages | confirmed against production sample |

New regressions present and passing: `does not arm a malformed card even if its
marker is trackable`, `posts a visible rejection when a malformed approval mints
no action`, and `leaves a valid armed card unclaimed for the agent approval
path` — both halves asserted, as the request states.

`db.test.ts`, `routing.test.ts`, `email-delivery-path.test.ts` and
`classify-ipc-handlers.test.ts` still cannot run on this host: it resolves Node
v26.5.1, the sandbox blocks the `.nvmrc` switch to 22.23.2, and
`better_sqlite3.node` is built for `NODE_MODULE_VERSION 127` against this
runtime's 147. Codex's pinned-runtime evidence remains authoritative for those,
and the broad gates still owe their pinned-runtime run on the converged snapshot
before commit.

## Nonblocking observation

### R6-1 — The claim is positional, and nothing warns when it short-circuits

`claimApproval = rejected` is safe against today's four listeners because no
later one owns marker-bearing messages. That safety is a property of the current
registration list, not of the code. A future approval listener registered after
`index.ts:1921` that legitimately handles a message carrying `[SALES REVIEW]`,
`[CLIENT SUPPORT REVIEW]` or `[SUPPORT-DRAFT]` would be skipped silently.

This codebase already has the pattern for that problem: `rejectObservers`
(`src/channels/slack.ts:221-228`) run on every 👎 "regardless of what the
claim-chain does", precisely so a claiming listener cannot preempt an unrelated
side effect. Two cheap options, either is enough: log at `info` when a listener
claims the chain (naming the claimant and the ts), or split the email boundary
into an always-run observer plus a narrow claim. Neither needs to precede
commit.

## Carried follow-ups — still open, unchanged by this delta

R5-1 (the overlong-card refusal only logs and never notifies the originating
container), R5-2 (three different author-name forms in one rejection
vocabulary; `index.ts` names the channel's group rather than the card's author),
R5-3 (a refused approval leaves no email-action-ledger row), R5-4
(`sales-review-unroutable` is still Sales-named), R5-5 (a refusal can become a
lead's recorded thread anchor). None blocks commit, build, or deployment.

## Release and recovery order

Unchanged from R5 and still unblocked:

1. Broad gates on the converged snapshot under the pinned runtime.
2. Commit (the staged Chief template is included), then `release:build`.
3. Rebuild the container image and refresh every
   `data/sessions/*/agent-runner-src` snapshot **before** activating the host;
   copy the five reviewed group instructions into the operational checkout with
   recorded hashes in the same window, never after.
4. Apply the Sales `threadPerMessage` migration as its own reversible step;
   drain or restart cleanly.
5. Only then the separately authorized recovery: a corrected card built from the
   stored exact recipient and body plus the existing Gmail-thread subject, a
   fresh approval through the deployed normal path, and a durable Gmail receipt
   before the reply is called sent.

- Elapsed: ~15 minutes for this round (10:41–10:56 CDT, 2026-08-03).
- Cumulative for NC-20260803-001 review: ~120 minutes across R1-R6.

## Unresolved — owner decisions

Unchanged from R5:

1. **Divergence handling** — whether a host-root/outgoing-lead mismatch should
   continue to refuse-and-log or let the host work root win. Open since R2.
2. **Non-Sales formatter scope** — the added `Lead Email:` fields remain
   display-only outside Sales-directed handoffs. Open since R1.
3. **Recovery approval** — treated as agreed across R4-R6: a corrected card and a
   fresh operator approval through the deployed normal path.
