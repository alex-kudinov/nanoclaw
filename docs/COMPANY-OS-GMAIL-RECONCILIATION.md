# Company OS inbound Gmail gap reconciliation

Status: local dark adapter implemented under `NC-20260817-005`; no production
source registration, Gmail wrapper, cursor bootstrap, runtime import, or
ingestion change

## Decision

An expired inbound Gmail history cursor is a durable gap, not a new baseline.
The existing `gmail_history_id` may not advance across that gap until a bounded
full-mailbox snapshot reaches a terminal page and every returned immutable
message ID has an explicit accepted or rejected disposition from durable
evidence.

The adapter is proposal-only. It can construct a content-free
`gap_detected` or `gap_reconciled` input for the generic Company OS watermark
store. It cannot register a source, write either database, call the live Gmail
client by itself, route or deliver an email, create work, or grant action
authority.

This decision covers the inbound push source only. The separately scheduled
Gmail label-correction poll owns `gmail_label_poll_history_id`, has different
candidate and side-effect semantics, and remains an independent unprotected
source.

## Why a full snapshot

Gmail's history API says an invalid or out-of-date `startHistoryId` typically
returns HTTP 404 and the client should perform a full sync. A recent-date query
is not an equivalent source boundary: the current push path observes all
`messageAdded` history records, while inserted or imported messages can have a
mailbox date older than the gap. Restricting the fallback by date or label
could therefore produce a terminal-looking scan while omitting a candidate the
normal history path would have seen.

The dark adapter instead models unfiltered `users.messages.list` pagination:

- no `q` filter;
- no label filter;
- `includeSpamTrash: true`;
- 500 IDs per page;
- no more than 20 pages (10,000 current mailbox messages);
- the final page must omit `nextPageToken`.

The page cap, eight-day gap-age limit, and twenty-minute freshness budget make
the attempt bounded. Hitting any bound leaves the gap open. Gmail's
`resultSizeEstimate` is deliberately not accepted as exact accounting.

References: [Gmail history list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list),
[Gmail messages list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list),
and [Gmail profile](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile).

## Source contract

`createCompanyGmailInboundSource()` derives one immutable definition from a
non-address account alias:

| Field | Value |
| --- | --- |
| trigger kind / system | `gmail` / `gmail` |
| source key | `mailbox:<alias>:inbound-v1` |
| adapter | `gmail_inbound_full_snapshot` version `1.0.0` |
| cursor | unsigned Gmail history ID |
| recovery | `full_snapshot` |
| maximum gap age | 691,200 seconds (eight days) |
| maximum attempt freshness | 1,200 seconds |
| authority | fixed `none` |

An email address is rejected as an alias. The common source normalizer derives
and verifies the definition ID and semantic fingerprint. Changing the adapter,
budgets, owner, or alert route under the same source identity is a conflict at
registration time.

## Gap detection proposal

`proposeCompanyGmailHistoryGap()` requires an initialized current watermark,
an exact source definition, and a notification history ID strictly greater
than the durable cursor. It produces:

- `gap_detected` with reason `history_expired`;
- the exact prior version and cursor;
- the notification history ID as the attempted next cursor;
- the prior cursor observation through detection as the observation window;
- zero observed/accepted/rejected candidates because the expired delta did not
  enumerate any;
- stable content-free event/evidence hashes;
- fixed `actionAuthority: none`.

When recorded by the generic store, that event increments the state version,
sets status `gap`, and leaves the durable cursor unchanged. NC-005 does not
record it or alter the current SQLite reset behavior.

## Full-snapshot reconciliation proposal

`reconcileCompanyGmailHistoryGap()` accepts only the exact durable open gap. A
successful proposal requires all of the following:

1. The gap state, definition ID, open event ID, prior cursor, and target
   history ID are valid and mutually consistent.
2. The attempt starts no more than eight days after the last successful cursor
   observation.
3. `users.getProfile` supplies a current history head at or beyond the gap's
   notification target.
4. The unfiltered current mailbox listing reaches a terminal page within 20
   pages. Every page is within the requested size; message IDs are valid and
   unique; page tokens do not cycle.
5. A read-only accounting callback classifies every sorted message ID as
   `accepted` or `rejected`, with a bounded reason key and SHA-256 evidence.
   `unknown`, missing, malformed, or failed accounting aborts the attempt.
6. A second profile read returns the exact same history head. Any mailbox
   change during listing/accounting aborts the attempt.
7. The attempt finishes within twenty minutes and exact arithmetic proves
   `observed = accepted + rejected`.

Only then does the function construct `gap_reconciled`, bound to the exact open
gap ID, with the stable profile head as the proposed next cursor and one digest
over the source, gap, bounds, page count, sorted IDs, dispositions, reason keys,
and per-candidate evidence. It returns no raw email content or addresses.

## Fail-closed outcomes

No reconciliation proposal exists when any of these occurs:

- wrong source/state or open-gap mismatch;
- stale/reversed cursor or profile head behind the notification;
- gap-age or freshness budget exceeded;
- Gmail/profile/list/accounting read failure;
- invalid/oversized page, repeated page token, residual page token at the cap;
- invalid or duplicate message ID;
- unknown or malformed candidate disposition/evidence;
- profile head drift during the snapshot.

Because the function never writes the generic store, all failures leave the
durable gap untouched when a later caller follows the proposal/record boundary.

## Evidence and limitations

NC-005 uses injected synthetic ports only. Focused tests prove deterministic
source/gap identity, terminal multi-page success, stable replay evidence,
empty-snapshot accounting, exact request bounds, and the refusal paths above.

This is not yet a live Gmail recovery fix:

- no production source row or watermark state exists;
- no Google client wrapper calls `users.getProfile` or `users.messages.list`;
- current inbound push still resets `gmail_history_id` on 404;
- current rejection paths are often in-memory rather than durably receipted, so
  a real accounting callback cannot yet classify every full-snapshot candidate;
- a mailbox above 10,000 current messages will retain the gap until a reviewed
  resumable/partitioned full-sync design exists;
- a message permanently deleted before a full snapshot is no longer visible in
  Gmail's current authoritative mailbox and cannot be recovered by this API;
- active mailboxes may need retry until one attempt observes a stable head;
- label-correction history expiry remains unchanged.

These are activation blockers, not successful-recovery claims.

## Promotion gates

The next production-facing milestone must remain separately tracked and must:

1. define durable accepted/rejected evidence for every current-mailbox message
   without treating the in-memory `processedIds` cache as authority;
2. implement and test the exact read-only Google client wrapper, preserving the
   unfiltered/full-snapshot request contract;
3. decide how a mailbox over 10,000 messages can complete through resumable,
   immutable partitions without weakening stable-head and exact-accounting
   proof;
4. register and bootstrap one inbound source in production without changing
   `gmail_history_id` or wiring 404 behavior;
5. run a read-only shadow snapshot and prove terminality, stable head, exact
   candidate accounting, privacy bounds, runtime cost, and no source/work/email
   mutation;
6. only after those gates, separately intercept a natural 404 as
   `gap_detected`, recover any missing eligible candidates through the ordinary
   durable inbound path, and record `gap_reconciled` before advancing;
7. add watermark-age/operator attention and rollback/demotion evidence;
8. design and prove the label-correction source independently.

A forced expiry, synthetic production email, customer/internal message, task,
or action is not authorized by this dark milestone.
