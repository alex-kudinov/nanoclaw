# NC-20260905-008 bounded read-only capacity reconciliation review R1

## Objective

Independently review the privacy-minimized Academy capacity reconciliation,
validator, and durable exceptions. Challenge whether the evidence preserves
source authority, payer-versus-participant separation, fail-closed capacity,
the exact authorized population, and the no-write boundary.

## Authority and non-objectives

- Student Roster exact dated assignments are the current seat authority.
- Stripe and invoices are funding/refund evidence only. They never infer a
  participant or class assignment.
- Heartbeat program-wide membership is not a dated capacity counter.
- Current sold-out owner decisions remain fail-closed while counts are
  unresolved.
- This task may persist only aggregate counts, opaque hashes, public product
  keys, and owned exceptions.
- Do not inspect credentials, `.env` files, auth stores, raw provider data,
  student identities, or unrelated private files.
- Do not modify source. Write only the response file named below.
- No production/provider/roster/website/database/runtime/message/deployment
  action is authorized.

## Allowed files

1. `docs/programs/company-os/evidence/NC-20260905-008-academy-capacity-readonly-reconciliation.json`
2. `docs/programs/company-os/evidence/NC-20260905-008-academy-capacity-readonly-reconciliation.md`
3. `facts/catalogs/academy-capacity-reconciliation-evidence-v1.schema.json`
4. `scripts/validate-academy-capacity-reconciliation.mjs`
5. `src/academy-capacity-reconciliation.test.ts`
6. `/Users/xbohdpukc/dev/tandemweb-level1-capacity-20260905/tools/cohort-capacity.py`
7. `/Users/xbohdpukc/dev/tandemweb-level1-capacity-20260905/data/checkout/cohorts.json`

## Provider observations to treat as supplied evidence

All were read-only on 2026-09-05. No raw identity should be requested or
written.

- MCS roster: September Thursday 6 rows/1 refunded/5 active; September Friday
  13 active; January Thursday 1 active; January Friday 0. The owner-named
  deferral subject has exactly one current row at January Thursday. The scoped
  20-row canonical set and that exact row are hash-bound in the JSON.
- MCS Stripe: Thursday 7 matched charges, 6 successful seat identities, 1 fully
  refunded; Friday 11 matched, 10 successful, 0 fully refunded, 1 failed.
- ACC roster: 8 active September rows, 2 Module 1 and 6 Full Program; no
  refunds. The scoped set is hash-bound.
- ACC Stripe search across both accounts: 1 exact September 7 `acc-module-1`,
  1 `acc-full`, 0 `acc-pcc-full`; both matches are on the alt account and none
  is refunded.
- Product Map routes `acc-module-1` to ACC:M1; both full offers share
  ACC:Full Program, while the $7,499 offer also projects to PCC and ACTC.
- Plutio title/amount search found two possible paid $3,999 ACC invoices but
  could not bind participant and dated cohort, so neither is counted.
- Privacy-minimized Heartbeat snapshots: MCS full group 24, ACC full group 22,
  combined group 3; all are program-wide and not capacity authority.
- Current public readback: ACC September 7 and MCS September 25 show Sold Out
  plus dated waitlists; MCS September 24 remains open.

## Claims to challenge

1. MCS Thursday is safely open at 5/12, while the disputed deferral origin is
   still held separately.
2. MCS Friday must use the roster floor of 13/12 and record the owner estimate
   of 12 only as conflicting evidence. The current Tandemweb reconciler's lower
   override is a material promotion blocker even though public checkout stays
   sold out.
3. Current state proves the deferral destination but not its origin weekday;
   no other roster row may be changed from this evidence.
4. ACC September 7 must remain policy-only sold out: eight assignments are
   known, but numeric capacity and six exact offer/funding bindings are not.
5. The six exceptions are sufficient, accurately owned, and actionable without
   inventing source truth or authorizing repair.
6. The schema, validator, and tests reject material privacy, authority,
   population, arithmetic, and exception-integrity regressions.

## Current verification

- Validator: 5 delivery blocks, 6 exceptions, aggregate/hash-only — pass.
- Focused capacity/reconciliation tests: 19/19.
- Typecheck and documentation continuity/capability: pass.
- Artifact privacy scan: no email, raw Stripe ID, or owner-named identity.

## Response

Write only
`docs/reports/NC-20260905-008-CLAUDE-RECONCILIATION-RESPONSE-R1.md`.

Report material findings only, ordered by consequence, with exact file/evidence
references and the smallest safe correction. If no material findings remain,
say `NO MATERIAL FINDINGS` and name the load-bearing checks performed.
