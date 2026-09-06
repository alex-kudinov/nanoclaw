# NC-20260906-001 bounded source-resolution review

## Objective

Review the exact Academy capacity source-resolution implementation and evidence
against the owner-authorized outcome. Report only material correctness, safety,
privacy, or evidence defects.

## Owner decisions that must not be reopened

- Rita's move is final: origin September 2026 Friday MCS, destination January
  2027 Thursday. The roster already had the destination. Her historical origin
  is no longer an evidence request or active exception.
- September 7 ACC capacity is 12 and the exact active roster population is 21;
  one participant consumes one shared Module 1 delivery-block seat.
- Proceed with exact source repairs and readback. Unsupported payer,
  participant, offer, refund, or identity facts must remain held.

## Verified external receipts

- Heartbeat removed only the owner-named deferral's membership from `MCS
  Practicum - September 2026`; exact readback keeps the user and base `MCS -
  Standard path` access.
- Student Roster final readback: 21 active ACC `2026-09` rows, 10 Module 1, 11
  Full Program, zero post-boundary unlabeled; the May 27 row is `2026-06`.
- Payment Log: two invoice-description Product cells were updated with exact
  Stripe-ID and expected-value guards to the canonical ACC Full product.
- Exact current payment/invoice evidence: 9 paid Module 1, 11 paid `$3,999` ACC
  Full, 0 `$7,499` Professional Coach, one Module 1 assignment without a
  matching live offer, zero roster refunds.
- Heartbeat Full Course: all 11 ACC Full participants are present through ten
  exact-email matches and one exact-name/company email alias candidate; zero
  candidate Professional Coach memberships.
- Correcting the MCS origin separately exposes Thursday roster 5 versus Stripe
  floor 6 and Friday roster 13 (excluding the deferral) versus adjusted Stripe
  9. These remain exceptions and do not reopen Rita.

## Allowed review paths

1. `docs/programs/company-os/evidence/NC-20260906-001-academy-capacity-source-resolution.json`
2. `docs/programs/company-os/evidence/NC-20260906-001-academy-capacity-source-resolution.md`
3. `facts/catalogs/academy-capacity-source-resolution-v1.schema.json`
4. `scripts/validate-academy-capacity-reconciliation.mjs`
5. `src/academy-capacity-reconciliation.test.ts`
6. `/Users/xbohdpukc/dev/tandemweb-level1-capacity-20260905/data/checkout/cohorts.json`
7. `/Users/xbohdpukc/dev/tandemweb-level1-capacity-20260905/tools/tests/test_cohort_capacity.py`
8. `/Users/xbohdpukc/dev/toolbox-heartbeat-remove-group-20260906/reviews/heartbeat-remove-from-group-CODEX-DISPOSITION-R1.md`

Read only these files and their bounded diffs. Do not inspect `.env`, raw
customer rows, credentials, browser/session state, unrelated worktrees, or
external systems. The toolbox operation itself already received a separate
review; use its disposition only to check the cross-repository claim.

## Acceptance criteria

- Rita is represented as conclusively settled, absent from active exceptions,
  and projected Friday-to-January in Tandemweb without lowering roster floors.
- ACC 21/12/9 arithmetic, 10/11 assignment routes, 9/11/0 paid-offer split,
  one held funding assignment, and zero refunds balance mechanically.
- May 27 is no longer included in the September upper bound.
- Zero Professional Coach participants means no PCC/ACTC/Professional mutation;
  Heartbeat remains projection evidence, never capacity authority.
- Mutation counts distinguish writes performed from precondition conflicts
  already at the desired state.
- The evidence artifact persists no email, name, raw Stripe ID, invoice ID, or
  other unnecessary PII; hashes and aggregate counts are sufficient.
- Remaining MCS funding/roster and ACC identity/funding gaps stay explicit,
  owned, and do not leak back into resolved facts.
- Validator and tests fail on settled-deferral regression, arithmetic drift,
  invented Professional seats, false mutation counts, or missing readback.

Write the response to
`docs/reports/NC-20260906-001-CLAUDE-SOURCE-RESOLUTION-RESPONSE-R1.md` and change
no other file. Use `NO MATERIAL FINDINGS` if none exist.
