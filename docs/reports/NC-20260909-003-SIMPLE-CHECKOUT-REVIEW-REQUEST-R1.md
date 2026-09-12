# NC-20260909-003 simple checkout replacement review R1

Review mode: bounded independent code review. Report only material correctness,
payment-safety, data-lifecycle, or deployability findings. Do not restate the
design, propose a broader platform, inspect secrets/configuration, edit source,
run Bash, or create a backlog.

## Owner decision

The LIVE public MCS path must validate the form, record the submitted payment
attempt, and send the accepted Session to Adyen. Before confirmed payment it
must not create/deduplicate a Party, interaction, order, document, enrollment,
access job, or notice. Every deliberate form submission is a distinct purchase,
including identical email/details. Only exact request/attempt/provider-event
replay is idempotent. Confirmed card evidence may then create distinct
purchase-scoped Parties and continue existing atomic fulfillment. Terminal
unconfirmed payment must delete temporary PII and show an editable new attempt.
Pending/ambiguous payment must retain its PII until resolution and must never
invite or start a second payment.

## Intended implementation

- Migration165 makes existing identity evidence capable of carrying no Party
  IDs, adds one encrypted/deletable submission payload, and adds immutable
  post-confirm materialization.
- LIVE identity resolution writes purchase-scoped opaque references plus the
  encrypted payload, but no Party/interaction.
- The enrollment adapter calls the materializer only when authenticated current
  card evidence is eligible; the same serializable transaction then creates the
  order/enrollment. Materialization deliberately inserts a new Party even when
  email matches another Party and deletes the temporary payload.
- The restart-safe worker deletes refused/failed payloads and expired payloads
  that never acquired an attempt. It retains pending/ambiguous attempts.
- WordPress records the exact admission after Session acceptance but does not
  let an admission/reconciliation error prevent the accepted Session from
  reaching the browser. Return/status can replay the same admission.
- Browser Pay directly submits the already accepted Adyen component. Failed
  payment returns to the editable form and cannot request a same-order
  successor Session. Unfinished public setup is discarded without draft copy.

## Allowed files

1. `data/business/migrations/nanoclaw-v2/165_deferred_checkout_identity.sql`
2. `src/payment-identity-preparation-store.ts`
3. `src/payment-identity-preparation.ts`
4. `src/website-checkout-enrollment-adapter.ts`
5. `src/website-checkout-service.ts`
6. `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/wordpress/tandem-snippets/includes/class-checkout-dispatch-coordinator.php`
7. `/Users/xbohdpukc/dev/tandemweb/.worktrees/adyen-sessions-20260909/prototypes/adyen-checkout-poc/src/protected-preview-core.js`
8. This request.

You may use Glob/Grep only within those exact parent directories to locate
types directly referenced by an allowed file. Do not inspect `.env`, private
configuration, logs, databases, credentials, auth stores, unrelated reports,
or the untracked Tandemweb contract file.

## Evidence already produced

- Typecheck passes.
- Focused backend selection: 64/64, then 22/22 after lifecycle correction.
- Dedicated disposable PostgreSQL: zero Party before payment; two identical
  deliberate confirmed submissions create two distinct Parties; exact attempt
  replay creates none; failed submission purges payload and creates no Party.
- Tandem browser suite 95/95; 27 PHP checkout/payment files pass. One unrelated
  local ACC generated-asset precondition is excluded.
- Full Nano suite: 4,309 pass, 32 skip, 20 failures. None touch changed files;
  16 are missing retired external publication-worktree inputs, and four are
  established CNPC/capacity/timing baselines.

## Questions

1. Is there any path that creates or reuses a Party before confirmed payment?
2. Can a confirmed payment fail to reach post-confirm materialization solely
   because the browser closes?
3. Can failed or ambiguous evidence delete PII at the wrong time, or can failed
   PII remain indefinitely?
4. Can exact replay duplicate Party/order/enrollment, or can two deliberate
   identical purchases collapse into one?
5. Do migration constraints/rollback and LIVE schema gates work on populated
   migration164 state?
6. Does removing the browser pre-submit request create a material double-pay or
   stale-Session defect beyond the existing accepted Adyen Session semantics?

Write the answer only to
`docs/reports/NC-20260909-003-SIMPLE-CHECKOUT-REVIEW-RESPONSE-R1.md`.
Use `NO MATERIAL FINDINGS` if appropriate; otherwise list findings by severity
with exact file/function/SQL evidence and the smallest correction.
