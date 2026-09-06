# NC-20260906-005 — Claude architecture correction request R2

Review only the following load-bearing corrections to R1. Do not reopen the
accepted simplification or repeat already-settled material.

## Verified R1 findings accepted

- A seven-day manual hold cannot represent a committed sale.
- A successful payment must not be turned into a participant assignment before
  exact payer/participant/enrollment evidence exists.
- Publication must not mutate `cohorts.json`.
- Capacity changes require a new versioned, reason/evidence-bound command.
- Publication must be host-owned, idempotent, retryable, and acknowledged.

## R1 corrections

1. R1 §4.5 says the existing WordPress `reserve_session_capacity` contract
   should remain unchanged. That contradicts the owner decision: no real-time
   checkout reservation or 30-minute hold. The new status projection must feed
   both display and server-side checkout validation. The old WordPress option
   reservation counter becomes disabled after parity verification, with
   `cohorts.json` retained only as a bootstrap/rollback status fallback.
2. R1 says `commit_class_assignment` is already an exposed Gate D operator
   command. It is an engine function but is not present in the live Capacity
   IPC/operator command union. This task must not claim otherwise or smuggle in
   assignment-authority cutover.
3. R1 did not inspect migration 143. Its `channel` is CHECK-constrained to
   `checkout|manual|waitlist_offer`, and manual/waitlist expirations are capped
   at seven days. A committed sale therefore requires migration change.

## Exact proposed plan

### Internal commitments

Reuse `academy_capacity_reservations` storage but add a distinct
`channel='commitment'`. This is an implementation reuse, not a temporary
reservation: no checkout request creates it and it has no short TTL.

- One record represents one committed seat.
- `source_scope` is one of bounded website sale, invoice, check, sponsor, or
  manual-sale scopes.
- `(channel,idempotency_key)` prevents duplicate PaymentIntent/invoice-seat
  delivery.
- `expires_at` for a commitment must equal the delivery block end (or a fixed
  bounded grace after it), so it cannot falsely reopen before the class it
  protects. It is released or reconciled explicitly before then.
- When an exact assignment later exists, a new `reconcile_commitment` command
  consumes the commitment after exact assignment readback, preventing double
  count. It does not create the assignment.
- Add `transfer_commitment` as one transaction that locks origin/destination,
  checks destination availability, moves the commitment, and bumps versions.
  Do not use a release-then-create race.
- Add `change_capacity`, version/reason/evidence bound. A reduction below
  occupied plus live commitments is refused; no student is evicted.

### Website success ingress

Use the existing host-side Stripe/Contador success path after provider fetch
has verified exact PaymentIntent and cohort metadata. Create only the
commitment with a PaymentIntent idempotency key and minimized evidence hash.
Do not add a second WordPress-to-NanoClaw synchronous call and do not block the
WordPress Stripe webhook response on NanoClaw publication.

Invoice/check/sponsor/manual commitments initially enter through the Capacity
operator with an exact non-PII source reference and one command per seat.
Automatic Plutio integration remains separate.

### Publication and cache

- Add an admin-only publication outbox/receipt relation. Enqueue only when the
  derived two-state projection changes (`open -> available`; `sold_out|closed
  -> sold_out`), plus a daily idempotent reconciliation scan.
- POST a signed, PII-free payload to one new WordPress endpoint. Reuse the
  existing `TANDEM_API_KEY` as the HMAC key for the raw body and API-key check;
  provision it to NanoClaw without exposing it. Do not mint another secret.
- WordPress stores a separate monotonic option keyed by exact program/date or
  pool mapping. It rejects stale revision/signature and returns an ack hash.
- `Tandem_Cohort_Capacity::status()` consults the accepted live option first
  for both rendering and `validate()`, falling back to `cohorts.json` only when
  no live projection exists or the feature is rolled back.
- Capacity-managed products are changed to status-managed; remove the
  `reserve_session_capacity`, release, commit, and 30-minute hold dependency
  from their checkout path after parity tests.
- On accepted state change, purge only mapped LiteSpeed program URLs, purge the
  same exact Cloudflare URLs through the existing host tooling, then prewarm
  them. Never purge the entire cache or object cache.
- If publication fails, retain last accepted WordPress status, keep checkout
  available according to that status, persist retry, and alert internally.
  The owner explicitly accepts the small stale/oversale risk over losing sales.

## Fixed owner choices resolving R1 §7

- Commitment lifetime: through the delivery block end; no arbitrary 370-day
  or seven-day expiry before the class.
- Pre-materialization movement: atomic `transfer_commitment`.
- Channel storage: migration adds the checked `commitment` value.
- Authentication: reuse existing `TANDEM_API_KEY` for request auth and HMAC.
- Publication outage: freeze last accepted badge/checkout state, retry and
  alert; do not disable checkout.

## Required response

Read this request, R1 response, migration 143, the operator IPC union, and the
current Tandemweb capacity/checkout/calendar files. Write
`docs/reports/NC-20260906-005-CLAUDE-PLAN-CORRECTION-RESPONSE-R2.md` with one
of `AGREE`, `AGREE WITH MATERIAL CORRECTION`, or `DO NOT AGREE`. Report only a
load-bearing error in the corrected plan; otherwise give a concise exact file
and acceptance-test map. Do not edit implementation files.

Do not inspect secrets, live data, auth stores, or unrelated files.
