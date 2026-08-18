# Company OS inbound Gmail gap reconciliation

Status: NC-005's proposal adapter and NC-006's unwired resumable shadow are
implemented. NC-007 deploys those exact bytes, and NC-008/009 add and activate
the real-ingestion disposition contract and cursor holdback in exact release
`263ac7c4`. The additive SQLite receipt table and two append-only triggers are
live after a WAL-safe backup; service/channel/non-interference checks pass.
No natural Gmail candidate appeared during the initial bounded observation.
Subsequent aggregate-only proof finds 18 unique terminal receipts: three
ordinary inbound persists, ten completed rule auto-archives, and five
own-outbound rejections. The current process has 67 successful push/safety
cycles with zero receipt, processing, or cursor-hold failures, so NC-009 is
complete. NC-010's default-off retained-host coverage auditor is now complete:
one aggregate-only production dry run accounts for all 3,041 retained IDs as
23 terminal receipts, 1,675 recoverable IDs, and 1,343 unknown IDs, with
identical before/after protected-state fingerprints. It did not query Gmail and
does not claim mailbox completeness. Migration 123 remains unapplied with no
runtime import, source registration/bootstrap, live reconciliation read, 404
recovery, or message recovery.

## Decision

An expired inbound Gmail history cursor is a durable gap, not a new baseline.
The existing `gmail_history_id` may not advance across that gap until a bounded
full-mailbox snapshot reaches a terminal page and every returned immutable
message ID has an explicit accepted or rejected disposition from durable
evidence.

The NC-005 adapter is proposal-only. It can construct a content-free
`gap_detected` or `gap_reconciled` input for the generic Company OS watermark
store. It cannot register a source, write either database, call the live Gmail
client by itself, route or deliver an email, create work, or grant action
authority.

NC-006 adds a separate shadow ledger around that same proof boundary. Its
Google wrapper exposes only `users.getProfile` and unfiltered
`users.messages.list`; its local store writes only resumable scan state and
content-free candidate receipts. A terminal shadow still calls the NC-005
proposal function, so resumability cannot weaken the original stable-head,
freshness, uniqueness, or exact-accounting requirements. The shadow does not
record the proposed generic watermark event.

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
- the one-shot NC-005 reader stops at 20 pages;
- the final page must omit `nextPageToken`.

NC-006 retains the 20-page bound per invocation but persists an opaque
continuation token and immutable page/candidate receipts across invocations.
It allows at most 10,000 total pages while retaining the same eight-day gap-age
and twenty-minute whole-attempt freshness budgets. A 20-page chunk therefore
returns `pending`, not truncated success; only the total cap invalidates the
attempt. Gmail's
`resultSizeEstimate` is deliberately not accepted as exact accounting.

Google documents `pageToken` only as the token used to retrieve a particular
result page; it does not document a frozen-mailbox snapshot guarantee. The
token therefore supplies resumability, not correctness. NanoClaw's additional
proof is that the current profile `historyId` equals the initial head before
every resumed chunk and again after the terminal page. Any drift invalidates
the attempt.

References: [Gmail history list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list),
[Gmail messages list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list),
and [Gmail profile](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile).

## Source contract

`createCompanyGmailInboundSource()` derives one immutable definition from a
non-address account alias:

| Field                     | Value                                         |
| ------------------------- | --------------------------------------------- |
| trigger kind / system     | `gmail` / `gmail`                             |
| source key                | `mailbox:<alias>:inbound-v1`                  |
| adapter                   | `gmail_inbound_full_snapshot` version `1.0.0` |
| cursor                    | unsigned Gmail history ID                     |
| recovery                  | `full_snapshot`                               |
| maximum gap age           | 691,200 seconds (eight days)                  |
| maximum attempt freshness | 1,200 seconds                                 |
| authority                 | fixed `none`                                  |

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

## Resumable read-only shadow

`createCompanyGmailReadOnlyPort()` is the exact Google client boundary:

- `users.getProfile({userId: 'me'})` returns only `historyId` to the adapter;
- `users.messages.list` always uses `userId: 'me'`, `maxResults: 500`, and
  `includeSpamTrash: true`;
- a null page token is omitted and a non-null token is passed unchanged;
- `q`, `labelIds`, `messages.get`, label mutation, send, and reply are absent.

Migration 123 defines three unapplied, host-admin-only tables:

| Table                                     | Durable purpose                                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `company_gmail_reconciliation_snapshots`  | exact source/gap binding, stable initial head, versioned status/counts, and the one active opaque continuation token |
| `company_gmail_reconciliation_pages`      | append-only page index, token hashes, candidate counts, and page fingerprint                                         |
| `company_gmail_reconciliation_candidates` | one append-only Gmail message ID plus accepted/rejected disposition, bounded reason key, and SHA-256 evidence        |

No table has a sender, recipient, address, subject, header, snippet, body,
payload, prompt, task, approval, capability, action, or arbitrary metadata
field. Page and candidate tables are append-only. One partial unique index
allows only one `pending`/`listed` attempt per exact source gap. Snapshot state
uses compare-and-swap versioning; exact page replay converges and changed or
stale replay fails closed. The raw continuation token exists only in the
admin-only active snapshot row and is cleared at terminal completion or
invalidation; append-only page history retains hashes only.

Each invocation performs this sequence:

1. Revalidate the source, watermark version, prior cursor, exact open gap,
   target, start time, and initial history head.
2. Read the current profile and invalidate on head drift.
3. Fetch and durably account at most 20 pages, committing each page and all of
   its candidate receipts atomically. An unknown candidate leaves the page
   uncommitted and the snapshot pending.
4. Return sanitized pending counts when a continuation remains; never expose
   the token.
5. After a terminal page, read the profile again, load every durable candidate
   receipt, verify stored counts, and pass the closed snapshot through the
   common NC-005 proposal function.
6. Mark only the shadow snapshot complete. The generic watermark state remains
   unchanged until a later, separately authorized caller records the proposal.

## Real-ingestion disposition evidence

NC-008 adds the SQLite producer/reader needed by the shadow accounting
port. `gmail_inbound_disposition_receipts` contains one immutable terminal row
per Gmail message ID and no email content or address fields. Accepted reasons
cover ordinary message persistence, direct classified-route persistence,
completed rule auto-archive, and an exact pre-existing inbound message row.
Rejected reasons cover own outbound, Spam/Trash, empty messages, hard filters,
and outbound messages found by the thread scanner.

The receipt follows the durable terminal operation. Exact semantic replay
converges even when the retry timestamp differs; a changed disposition, reason,
or evidence hash conflicts. An existing receipt skips Gmail refetch after
restart. If ordinary message persistence succeeded but receipt insertion
failed, only an exact row for the same Gmail JID with `is_from_me = 0` and
`is_bot_message = 0` can mint the bounded legacy receipt. The no-wake row staged
before direct host routing additionally requires the exact rules-runner
classification `routed_at` marker; an ambiguous staged route holds the cursor.
The in-memory `processedIds` set and outbound rows are never evidence.

For inbound push, every history candidate must already have or produce a
receipt. Any fetch, processing, receipt-storage, or accounting failure leaves
the prior `gmail_history_id` unchanged for replay. Separately, a delta whose
20th page still has `nextPageToken` now throws before any returned candidate is
processed, so truncated pagination cannot advance the cursor.

NC-009's preflight found a live restart-compatibility case that is distinct
from push cursor safety. Of 57 exact legacy SQLite rows staged for direct
Mailman routing, 21 have their one exact `rules-runner-v1` routed marker and 36
have no matching classification. The latter remain unknown; NanoClaw must not
mint an accepted receipt or refetch/deliver them. Cursorless label and thread
polls now isolate that per-candidate hold, continue unrelated messages, and
retry the unknown row on a later catch-up. Push processing deliberately keeps
the stronger whole-batch cursor hold.

## Retained-host historical coverage audit

NC-010 adds a separate default-off audit boundary before migration 123. It does
not call Gmail and is deliberately **not** a mailbox-completeness scan. Its
candidate scope is the content-free union of:

- immutable IDs already present in
  `gmail_inbound_disposition_receipts`; and
- immutable IDs retained in SQLite `messages` for the one configured Gmail
  channel JID.

The SQLite connection is opened `readonly` with `fileMustExist` and
`query_only`; its one bounded query selects only IDs, receipt fields,
`is_from_me`, `is_bot_message`, and `from_group`. Sender, sender name, address,
subject, content, thread content, and arbitrary metadata are never selected.
The explicit invocation bound is at most 100,000 IDs; exceeding it refuses the
report instead of truncating.

The audit separates five evidence outcomes without minting a receipt:

1. an existing validated terminal receipt;
2. an exact ordinary inbound SQLite row that can support later bounded
   acceptance;
3. direct-route staging with exactly one routed `rules-runner-v1`
   classification;
4. unresolved direct-route, outbound-without-receipt, or unsupported retained
   rows; and
5. contradiction or unavailable storage, which refuses the report.

PostgreSQL is entered with `BEGIN TRANSACTION READ ONLY`, selects grouped
content-free route-marker counts for only the staged IDs, and is always rolled
back. Duplicate IDs, a route marker outside the requested set, a routed marker
mixed with another classification, receipt/row mismatch, or an ID with neither
receipt nor retained row fails closed. Both databases are read twice; a change
to any coverage-relevant evidence between passes produces `source_drift`.

Output contains only closed aggregate categories plus mailbox-scope,
source-evidence, and report SHA-256 fingerprints. It explicitly reports
`basis=retained_host_evidence`, `mailboxComplete=false`, and
`gmailQueried=false`; raw IDs and the configured mailbox identity are hashed
into evidence but never printed. An unresolved retained ID returns a distinct
non-zero CLI status so automation cannot treat an incomplete inventory as a
promotion pass.

This audit cannot discover a message ID that exists only in Gmail and has no
retained host receipt or row. Closing that outer mailbox-coverage question
still requires the later separately gated live read-only full-snapshot design.

## Fail-closed outcomes

No reconciliation proposal exists when any of these occurs:

- wrong source/state or open-gap mismatch;
- stale/reversed cursor or profile head behind the notification;
- gap-age or freshness budget exceeded;
- Gmail/profile/list/accounting read failure;
- invalid/oversized page, repeated page token, or the total-page cap;
- invalid or duplicate message ID;
- unknown or malformed candidate disposition/evidence;
- profile head drift during the snapshot.

Because neither path writes the generic watermark store, all failures leave
the durable gap untouched. The shadow invalidates a permanently contradictory
attempt (head drift, pagination cycle, duplicate candidate, freshness expiry,
or total-page cap) and clears its raw token. A source error or unknown durable
disposition leaves the current page uncommitted so a later bounded retry can
resume safely.

## Evidence and limitations

NC-005 uses injected synthetic ports only. Focused tests prove deterministic
source/gap identity, terminal multi-page success, stable replay evidence,
empty-snapshot accounting, exact request bounds, and the refusal paths above.

NC-006 adds exact-wrapper, resumability, migration/privacy, replay, drift,
unknown-accounting, and pagination-cycle tests. A disposable PostgreSQL 16
rehearsal applied migrations 122 and 123, completed 10,001 candidates over 21
pages in two bounded advances, produced exact 5,001 accepted plus 5,000
rejected accounting, returned the same completion evidence on replay,
enforced append-only candidate rows, exposed only `nanoclaw_admin` table
grants, refused populated rollback, and accepted empty rollback. All data and
the cluster were synthetic and removed after the rehearsal.

NC-007 deploys exact release `de815e1d` with the NC-006 wrapper, orchestrator,
store, migration, and rollback bytes independently verified but deliberately
inactive. Production pre/post checks retain connected Gmail/Slack, empty
execution/outgoing queues, 66 confirmed plus six blocked and zero active email
actions, unchanged Gmail cursors, trigger counts 1/0/0/0, and absent
migration-123 tables. This is release availability, not a Gmail or database
shadow observation.

NC-008 focused local proof covers schema creation, append-only trigger
enforcement, exact replay/conflict, privacy, accepted/rejected accounting,
every current Gmail terminal reason, split-write and restart convergence,
partial-batch cursor hold, complete-batch advance, existing-receipt replay, and
non-terminal page-20 refusal. The exact focused set passes 143/143, combined
Company OS/Gmail passes 405/405, and the expanded email-critical gate passes
685/685 plus the independent runner's 43/43. NC-009 is the separately tracked
production activation and evidence gate for those bytes.

NC-009's aggregate-only production preflight confirmed the receipt table and
both append-only triggers were absent, SQLite `quick_check` was `ok`, critical
pending email actions were zero, and the selected Gmail cursor fingerprint was
stable at the pre-activation baseline. The staged-route split above contains
no duplicate or mixed classification rows. Exact Node 22.23.2 passes the new
label/thread starvation regressions locally.

Exact release `263ac7c4a25a6033adef13e4085c147d1237b559` was then built,
freshly extracted, transferred, independently verified, and activated after a
drained WAL-safe mode-0600 SQLite backup. Live readback proves Node 22.23.2,
one listener, connected Gmail/Slack, empty runtime/outgoing queues, SQLite
`quick_check` `ok`, and the receipt table plus its no-update/no-delete triggers.
Migration 123's three tables remain absent. During more than ten minutes of
bounded observation, one safety poll completed with zero Gmail candidates,
zero Gmail-row change, zero receipts, and zero Gmail errors or holds. Two
ambient message rows and two allowed action-safety decisions were attributable
to Slack only. Normal watch renewal and the successful empty safety poll
explain the changed Gmail lease/history/liveness state; critical pending counts
remain unchanged. This proves structure and non-interference, not natural
receipt creation.

The later natural observation closes that remaining gate. The live table holds
18 receipts with 18 distinct message IDs and 18 distinct fingerprints. Three
are `accepted/inbound_message_persisted`, each with its matching SQLite message
row; ten are `accepted/rule_auto_archive_completed`; five are
`rejected/own_outbound`. Receipt timestamps span 2026-08-18T00:01:04Z through
2026-08-18T01:58:53Z. The current PID completes 67 push/safety cycles with zero
receipt, processing, safety-poll, or cursor-hold errors. Two recent natural
one-candidate scans each report `newCount: 1` and monotonic cursor advancement.
SQLite `quick_check` remains `ok` and exact release/channel health is green.

This is not yet a live Gmail recovery fix:

- no production source row or watermark state exists;
- migration 123 is tracked but unapplied;
- the exact Google wrapper is installed but has not called a live mailbox;
- current inbound push still resets `gmail_history_id` on 404;
- NC-008/009 durable disposition evidence is deployed and naturally exercised;
  historical IDs without a receipt, exact retained
  ordinary inbound row, or durable routed marker still account as unknown;
- NC-010's completed retained-host audit does not enumerate Gmail-only IDs;
  1,343 retained IDs remain unknown and non-authoritative;
- the resumable design proves more than 10,000 candidates synthetically but
  has no production runtime, storage-cost, token-lifetime, or latency evidence;
- a message permanently deleted before a full snapshot is no longer visible in
  Gmail's current authoritative mailbox and cannot be recovered by this API;
- active mailboxes may need retry until one attempt observes a stable head;
- label-correction history expiry remains unchanged.

These are activation blockers, not successful-recovery claims.

## Promotion gates

The next production-facing milestones must remain separately tracked and must:

1. **complete under NC-010:** dry-run retained-host historical coverage and
   quantify unknown IDs without inventing dispositions or treating the
   in-memory cache as authority; this remains explicitly distinct from mailbox
   completeness;
2. back up PostgreSQL, apply migration 123 dark, and verify all three tables
   empty/admin-only before any reconciliation-shadow producer exists;
3. register and bootstrap one inbound source in production without changing
   `gmail_history_id` or wiring 404 behavior;
4. deploy the wrapper and shadow store still default-off, then observe a
   natural source gap or approve a separate gap-independent audit design; do
   not manufacture an expiry merely to exercise the ledger;
5. run a real read-only shadow and prove terminality, stable head, exact
   durable candidate accounting, privacy/token cleanup, runtime/API cost, and
   no source/work/email mutation;
6. only after those gates, separately promote natural-404 handling to
   `gap_detected`, recover any missing eligible candidates through the ordinary
   durable inbound path, and record `gap_reconciled` before advancing;
7. add watermark-age/operator attention and rollback/demotion evidence;
8. design and prove the label-correction source independently.

A forced expiry, synthetic production email, customer/internal message, task,
or action is not authorized by this dark milestone.
