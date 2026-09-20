# NC-20260919-002 bounded correctness review

## Review decision

Review only the load-bearing payment-record boundary below. Report material
findings ordered by consequence, with exact file/line evidence. If there are no
material findings, return `PASS`. Write the response to
`docs/reviews/NC-20260919-002-CORRECTNESS-RESPONSE.md` and edit no other file.

## Objective

1. A signed Commerce delivery with `environment=test` must traverse host
   validation and produce a visible TEST receipt while touching no Payment Log,
   Student Roster, NanoClaw payment/refund projection or Capacity record.
2. LIVE payment delivery remains unchanged except that already-available fee
   economics may fill Payment Log G/H.
3. An exact LIVE Zentact `SETTLED` projection with `match_state=exact_order` and
   `processingCost` creates one replay-deduplicated job in the existing jobs
   table. That job uses the existing signed endpoint to update only the exact
   Adyen Payment Log row's fee/net cells after identity and arithmetic
   readback.
4. Commerce alone selects provider-fee precedence: detailed Adyen transaction
   facts if present, otherwise settled Zentact aggregate. Estimated Peri is
   added exactly once. NanoClaw validates the signed components and computes
   `gross - provider fee - Peri = net`; it never calls a fee provider or guesses.

## Accepted facts

- Read-only production evidence proved seven recent USD 1.00 offending rows
  were exact Commerce `environment=test` orders. No amount/name heuristic is
  permitted.
- The route is direct signed Commerce -> NanoClaw HTTPS, not n8n.
- Adyen authorization does not contain final fee components. Commerce already
  retains exact Zentact settlement projections and owns the existing detailed-
  over-aggregate precedence in `transaction_economics`.
- Payment Log is an operational diagnostic projection; Bizmgr/provider facts
  remain accounting authority.
- The owner already removed visible test rows. No historical test cleanup is in
  this diff.
- Minimum-sufficient review kept signed environment, explicit no-ledger TEST
  outcome, Commerce-owned fee components, existing-runner delayed
  reconciliation and exact Sheet readback; it removed any new database, queue,
  worker, scheduler or provider fetch.

## Protected invariants

- Missing/unknown environment, delivery kind, fee basis, invalid arithmetic,
  TEST fee-reconciliation requests and payment/refund kind mismatch fail before
  official writes.
- TEST returns before Sheets configuration/use, PostgreSQL, roster and
  Capacity.
- Fee reconciliation requires exactly one PSP row, exact gross/currency/PSP/
  provider/status, updates only G:H, and reads gross/fee/net/currency/PSP/
  provider back. Formatted `$` and comma values are parsed without formulas.
- An ordinary LIVE replay without fee evidence preserves existing G/H instead
  of blanking reconciled economics.
- Refund delivery remains separate and cannot carry fee economics.
- Zentact mismatch/unmatched/non-settled/no-cost events create no fee job;
  exact delivery replay creates no second projection or job.
- No new endpoint, schema, migration, service, process, worker, scheduler,
  credential, provider write, payment, refund, customer message or accounting
  authority.

## Allowed files

1. `/Users/xbohdpukc/dev/tandemweb/.worktrees/bookkeeper-test-fees-20260919/wordpress/tandem-commerce/includes/class-tandem-commerce-actions.php`
2. `/Users/xbohdpukc/dev/tandemweb/.worktrees/bookkeeper-test-fees-20260919/wordpress/tandem-commerce/includes/class-tandem-commerce-store.php`
3. `/Users/xbohdpukc/dev/tandemweb/.worktrees/bookkeeper-test-fees-20260919/wordpress/tandem-commerce/tests/test-zentact-webhook.php`
4. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/bookkeeper-test-fees-20260919/src/commerce-bookkeeper.ts`
5. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/bookkeeper-test-fees-20260919/src/webhook-server.ts`
6. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/bookkeeper-test-fees-20260919/tools/contador/process-commerce-payment.cjs`
7. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/bookkeeper-test-fees-20260919/src/commerce-bookkeeper.test.ts`
8. `/Users/xbohdpukc/dev/NanoClaw/.worktrees/bookkeeper-test-fees-20260919/src/webhook-server.test.ts`

Do not inspect environment files, credentials, provider payloads, customer
content, lockfiles, unrelated source or repository history.

## Verification already passed

- NanoClaw pinned Node 22.23.2: focused 78/78, typecheck, format check.
- Direct child-process TEST canary succeeded with all Sheets variables absent
  and returned `officialRecordSuppressed=true` plus all official write booleans
  false.
- Commerce: Zentact webhook, automatic receipt, core, transaction admin, fee
  settings and refund suites passed; changed PHP files lint clean.
- Read-only production census: nine exact LIVE settled Zentact projections have
  retained processing cost; no repair/backfill job has run.

## Questions

1. Can any TEST delivery reach an official sink or Capacity despite the signed
   environment?
2. Can any LIVE fee job attach economics to the wrong row, double-count Peri,
   regress/blank G:H, or report success without exact readback?
3. Can an authentic Zentact replay or non-final/mismatched event create
   duplicate or incorrect work?
4. Is deployment compatibility unsafe in either order? Recommend the safer
   order and name any bounded retry/drain requirement.
5. Are any result booleans or Slack/log claims materially misleading?
