# Proposal Follow-Up

Status: legacy live mechanism; not the target process. `NC-20260821-002`
documents the replacement authority in `SALES-FOLLOWUP-OPERATING-MODEL.md`.
The current loop remains approval-gated but is default-on, four of five current
open proposals are stuck behind expired sequence rows, and its fixed-sender,
four-touch cadence must not be copied into the replacement.

Daily, approval-gated email nudges for open (unsigned) Plutio proposals, so a
sent proposal that goes quiet gets a bounded, courteous follow-up sequence
instead of falling through the cracks.

Host-side and deterministic (no container, no agent in the loop): the mechanical
work — detect, schedule, dedupe, track — is plain TypeScript; only the email
*copy* is generated, via the Claude Print Bridge, so each touch is customized.

## Cadence

Four touches, then stop. Timing is in **business days** (weekends skipped).

| Touch | When | Angle |
|------|------|-------|
| 1 — reminder | proposal pending ≥ 5 business days | "Did it land? Questions?" + link |
| 2 — value + call | anchor + 5 | Reinforce the outcome, offer a 15-min call |
| 3 — soft check-in | anchor + 13 | "Still a fit, or has timing shifted?" |
| 4 — breakup | anchor + 20 | Gracious close: "I'll close this out; link stays live" |

**Anchor = the send date of touch 1**, not the proposal's original sent date.

- A *new* proposal: touch 1 fires at day 5, so the sequence lands on
  5 / 10 / 18 / 25 business days from sent.
- A *backlog* proposal (e.g. sent in March): touch 1 fires today, and 2–4 count
  from today — it restarts the clock at the first nudge rather than telescoping
  straight to the breakup.

A per-run cap (`PROPOSAL_FOLLOWUP_MAX_PER_RUN`, default 8) drains a large backlog
gradually instead of flooding the approval queue. A minimum 5-business-day gap
between touches throttles catch-up after daemon downtime.

### Close-out

A week (5 business days) after the breakup, if the proposal is still pending, it
is marked **cancelled** in our records (a sentinel row) and a notice posts to
Slack with the Plutio edit link. The Plutio REST API cannot set a pending
proposal's status, so the actual void in Plutio stays a one-click operator
action; this only stops our follow-ups and records the outcome.

## Flow

1. **Detect** (`proposal-followup.ts → runProposalFollowup`, hourly tick, fires
   once/day at/after `PROPOSAL_FOLLOWUP_HOUR`): list `status: pending` proposals
   from Plutio (`plutio-proposals.ts`).
2. **Schedule** (`proposal-followup-cadence.ts → selectNextTouch`): pick the due
   touch from the proposal's pending age and its follow-up history.
3. **Compose** (`proposal-followup-email.ts`): generate customized subject+body
   for the touch via the bridge, embedding the client-facing proposal link.
4. **Draft**: post the draft to `#gru-sales` and record a `pending_approval` row
   (`proposal-followup-store.ts`).
5. **Approve**: a ✅ on the draft is claimed by a host-side Slack approval
   listener (`handleProposalApproval`); it sends the email through the Gmail path
   (`handleGmailSend` — markdown→HTML, tracking pixel, interaction log) and marks
   the row `sent`. The claim suppresses the normal agent-approval injection so
   the sales container is not woken.
6. **Dedup with the pipeline follow-up**: the send logs an outbound
   `business_v2.interactions` row, so the existing sales pipeline follow-up
   (which skips anyone contacted in the last 3 days) won't double-nudge.

Unapproved drafts expire after `PROPOSAL_FOLLOWUP_EXPIRE_DAYS` (default 7).

## Data model

`business_v2.proposal_followups` (migration `102_proposal_followups.sql`): one
row per (proposal, touch). `status` ∈ `pending_approval | sent | cancelled |
expired`. The seq=1 `sent_at` is the cadence anchor; seq=5 is the cancelled
close-out sentinel. `UNIQUE (proposal_plutio_id, sequence_no)` makes drafting
idempotent.

## Links

- Public (client-facing, signable): `…/p/proposal/{plutio_id}`
- Edit (operator): `…/proposals/{plutio_id}/edit`

Base configured via `PROPOSAL_PUBLIC_URL_BASE`.

## Config (`.env`, all optional)

| Var | Default | Meaning |
|-----|---------|---------|
| `PROPOSAL_FOLLOWUP_ENABLED` | `true` | Master switch |
| `PROPOSAL_FOLLOWUP_CHANNEL_JID` | `slack:C0AHV1SGT6W` (#gru-sales) | Where drafts post |
| `PROPOSAL_PUBLIC_URL_BASE` | `https://business.tandemcoaching.academy/p/proposal` | Link base |
| `PROPOSAL_FOLLOWUP_SENDER` | `Alex` | Name signed on emails |
| `PROPOSAL_FOLLOWUP_MAX_PER_RUN` | `8` | Draft cap per run |
| `PROPOSAL_FOLLOWUP_HOUR` | `9` | Local hour the daily pass runs |
| `PROPOSAL_FOLLOWUP_EXPIRE_DAYS` | `7` | Unapproved-draft TTL |

## Deploy

1. Apply the migration to `nanoclaw_business`:
   `psql nanoclaw_business -f data/business/migrations/nanoclaw-v2/102_proposal_followups.sql`
2. Build + restart the daemon.
3. (Recommended first) set `GMAIL_TEST_RECIPIENT` to route the first real sends
   to yourself, and confirm the public proposal link opens logged-out before
   approving any client-bound nudge.

## Open items

- Confirm `PROPOSAL_FOLLOWUP_SENDER` (Alex vs Cherie vs per-proposal owner).
- One-time check that the public link renders + signs while logged out.
