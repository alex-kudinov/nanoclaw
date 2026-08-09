# NC-20260809-003 — Proposal/action-binding correction request, Codex R6

- Requested reviewer: Claude Code Opus 5, exact NanoClaw owner session
  `942ee3f7-b76b-4b84-9036-5f19f9f7f3e3`
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`
- Authorization: read the non-secret R5 request/response and exact source files
  cited below; write only
  `docs/reports/NC-20260809-003-PROCUREMENT-PROPOSAL-SOURCE-CLAUDE-RESPONSE-R6.md`.
- Prohibited: production/database/browser/network/vault access; secrets; edits
  outside the named response; implementation, commit, deployment, or external
  action.

R5 returned `READY TO IMPLEMENT`. Codex independently rejects that verdict
until the following load-bearing gaps are resolved. Correct the design; do not
defend R5 merely for continuity.

## F1 — no durable binding exists for the three new human commands

R5 requires exact bound-thread/card/epoch authorization for `APPROVE`,
`RECORD-SUBMISSION`, and `OUTCOME`, but its six-table schema defines no action
card table and no extension to `procurement_review_cards`. The 114 review-card
table is opportunity/review-version/recommendation-specific and consumed by the
DECIDE function; it cannot silently bind packet, submission, and outcome
commands. Define the exact durable action-card model, cardinality, version,
expiry/epoch, actor-independent posting record, consumption semantics, and
function/card relationship. Every command must be authorized against its own
host-posted card in the same thread, and replay/stale/wrong-thread/wrong-action
must fail without mutation.

## F2 — the existing event uniqueness rejects ordinary proposal work

`procurement_pursuit_events` has
`UNIQUE (pursuit_id, pursuit_version, event_type)`. R5 proposes multiple
`artifact_registered` and `compliance_updated` events before the pursuit state
or version changes, so the second event of either kind collides. Define a
backward-compatible event idempotency model. It must preserve the 115 decision
and advance replay guarantees, permit multiple typed sub-entity events at one
pursuit version, and avoid treating arbitrary model text as an idempotency key.
State whether this requires an added `event_key`, a separate append-only action
ledger, or another explicit mechanism, including its unique constraint and
rollback behavior.

## F3 — packet drift has no coherent pursuit transition

R5 says artifact drift flips an approved packet to `superseded`, but leaves the
pursuit in `proposal_ready`. That creates a truthful-state contradiction and an
active queue row that may still look ready. Define the single-transaction state
effect, pursuit version/event, next action/due date, routed alert, and recovery
path after drift or missing bytes. Do not make the reconciler silently perform
a commercial approval; it may invalidate and block.

## F4 — host hashing and canonicalization need an executable boundary

PostgreSQL cannot read the vault. Define exactly which validations happen in
the trusted host before SQL and which facts SQL revalidates. The path must be
resolved beneath the configured Procurement vault root with traversal,
absolute-path, symlink, non-regular-file, and time-of-check/time-of-use defenses.
`canonicalJson` currently exists at `src/procurement-intake.ts:112` but is not
exported; say whether 116 exports a shared helper or introduces a dedicated
module. Do not claim the container supplies no hash while accepting an
unverified hash parameter through IPC.

## F5 — clarify versions and receipt truth

For each successful `APPROVE`, `RECORD-SUBMISSION`, and `OUTCOME`, specify:

- expected packet/pursuit/submission version before mutation;
- new pursuit/packet version and state after mutation;
- the exact card consumed;
- the durable routed outbox receipt inserted in the same transaction;
- what a Slack delivery failure may and may not say.

The submission record remains explicitly a named-human attestation bound to
host-verified bytes, not independent proof of portal/email delivery.

## Required result

Read R5 plus:

- `data/business/migrations/nanoclaw-v2/114_procurement_control_plane.sql`
- `data/business/migrations/nanoclaw-v2/115_procurement_pursuit.sql`
- `src/procurement-review.ts`
- `src/procurement-intake.ts`

Return a corrected decision-complete delta with one verdict:
`READY TO IMPLEMENT`, `CHANGES REQUIRED`, or `OWNER DECISION REQUIRED`.
Reconcile the table/function/test counts and update the smoke matrix where
needed. Include changed-file attestation, elapsed time, and cost.
