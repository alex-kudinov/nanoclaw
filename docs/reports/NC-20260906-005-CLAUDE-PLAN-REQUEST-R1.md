# NC-20260906-005 — Claude architecture review request R1

## Objective

Agree on the smallest reliable implementation of the owner-accepted simplified
Academy capacity sync, then give Codex a concrete bounded implementation plan.
The solution must favor ordinary sales availability and operational simplicity
over last-seat reservation machinery.

## Owner-accepted direction

- Do not use real-time checkout reservations, 30-minute holds, or a synchronous
  NanoClaw dependency in checkout.
- Update internal inventory when a website sale succeeds and when an operator
  explicitly promises seats through an invoice, check, sponsor, or manual sale.
- Reconcile daily with the already-established Academy class/calendar process.
- Publish to the site when a class crosses `available <-> sold_out`.
- Keep WordPress and Cloudflare page caching. Reuse targeted page purge and
  warming rather than making program pages dynamic.
- Preserve a small accepted race risk instead of building airline inventory.
- Capacity changes and registration transfers must be operator-manageable.

## Existing authoritative facts

- Company OS/NanoClaw owns the new internal capacity domain. Gate D is live.
- Current production occupancy is ACC September 7 `21/12 sold_out`, MCS
  Thursday `5/12 open`, MCS Friday `13/12 sold_out`, January Thursday `1/12`,
  January Friday `0/12`. Rita is settled in January Thursday and is not open
  work.
- Multiple offers share one pool: ACC Module 1 `$399`, ACC Full `$3,999`, and
  Professional Coach `$7,499` all consume the September 7 ACC Module 1 pool.
- Student Roster remains current assignment evidence until the separate Gate F
  authority cutover. Stripe/payment/invoice evidence must not be assumed to be
  the student.
- Existing Gate D operator commands cover manual holds, releases, transfer,
  withdrawal, reconciliation, and waitlist staging. They do not yet expose a
  versioned capacity change or a simple committed-sale command.
- Existing Tandemweb code uses committed `cohorts.json` plus WordPress option
  reservations. It renders sold-out/waitlist UI and rejects crafted sold-out
  checkout requests server-side.
- Existing calendar tooling already refreshes program data, purges exact
  LiteSpeed URLs, purges exact Cloudflare URLs, and has a cache warm command.

## Design questions to resolve

1. What is the smallest durable representation for a successful sale or an
   explicit invoice/manual seat promise before its Student Roster assignment
   appears, without using an expiring reservation and without double-counting
   it once an assignment exists?
2. Should a website success with exact participant and cohort create a pending
   class assignment immediately, while an identity-incomplete invoice uses a
   separate committed-seat record? Or is one simpler commitment relation safer?
3. What exact idempotency keys and release/reconciliation semantics prevent
   duplicate Stripe webhooks, duplicated invoices, and payment/assignment
   double counts?
4. What minimal command surface is required for `commit_seats`,
   `release_commitment`, and `change_capacity`, while preserving the existing
   atomic transfer?
5. What is the smallest signed status-publication contract from NanoClaw to a
   local WordPress option/registry? It should carry no PII and publish only
   `available` or `sold_out` plus exact pool/date/revision/evidence.
6. How should daily publication and threshold-triggered publication share one
   idempotent path and durable retry/outbox?
7. How should targeted LiteSpeed purge, targeted Cloudflare purge, and prewarm
   be sequenced so a status flip is actually live without disabling normal page
   caching or flushing checkout transients?
8. What should happen when publication fails? The owner prefers retaining the
   sale over blocking checkout, but the failure must be visible and retryable.
9. Which portions can be implemented now without crossing Gate F or turning
   Bookkeeper/Student Roster/Heartbeat into a new authority?

## Candidate implementation boundary

Prefer a small additive NanoClaw migration and deterministic host service over
repurposing temporary reservations. Prefer one authenticated WordPress status
endpoint and the existing calendar/cache scripts over browser-side live API
calls. A successful sale event may be asynchronous after Stripe success;
checkout itself must remain independent of NanoClaw.

Explicit invoice/manual commitments may initially be entered through the
Capacity operator rather than requiring automatic Plutio integration. Full
Bookkeeper automation remains separately gated if it materially expands scope.

## Non-objectives

- no real-time reservation, TTL hold, or last-seat concurrency guarantee;
- no per-visitor capacity API or uncached program pages;
- no automatic waitlist customer message or promotion;
- no refund or payment execution;
- no broad historical replay;
- no direct agent database/provider authority;
- no full Student Roster, Heartbeat, Bookkeeper, or assignment-authority cutover;
- no reopening the settled Rita transfer or lowering the Friday roster fact.

## Allowed source artifacts

1. `docs/ACADEMY-CAPACITY-CONTROL-PLANE.md`
2. `src/academy-capacity.ts`
3. `src/academy-capacity-operator-store.ts`
4. `/Users/xbohdpukc/dev/tandemweb-capacity-simple-sync-20260906/wordpress/tandem-snippets/includes/class-cohort-capacity.php`
5. `/Users/xbohdpukc/dev/tandemweb-capacity-simple-sync-20260906/wordpress/tandem-snippets/includes/class-stripe-checkout.php`
6. `/Users/xbohdpukc/dev/tandemweb-capacity-simple-sync-20260906/wordpress/tandem-snippets/includes/class-program-calendar.php`
7. `/Users/xbohdpukc/dev/tandemweb-capacity-simple-sync-20260906/tools/update-calendars.sh`
8. `/Users/xbohdpukc/dev/tandemweb-capacity-simple-sync-20260906/SOPs/CLASS-CAPACITY-MANAGEMENT.md`

Do not inspect `.env`, credentials, auth stores, live databases, customer rows,
or unrelated private material.

## Required response

Write `docs/reports/NC-20260906-005-CLAUDE-PLAN-RESPONSE-R1.md` containing:

1. `AGREE`, `AGREE WITH CORRECTIONS`, or `DO NOT AGREE`;
2. material design findings only, with exact source references;
3. the smallest recommended state model and event transitions;
4. exact NanoClaw and Tandemweb changes, including migration/API/job boundaries;
5. failure, retry, idempotency, cache, security, and rollback behavior;
6. focused acceptance tests and live verification;
7. any item that genuinely requires another owner decision.

Do not edit implementation files. Do not create a speculative backlog or
restate the packet.
