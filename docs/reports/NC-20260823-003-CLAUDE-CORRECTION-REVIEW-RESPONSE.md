# Claude correction review response: stale healer decision actor

## Verdict

NO MATERIAL FINDINGS

## Evidence

- `src/healer/resolution-catalog.ts:336-339` (`itemFrom`) now gates the field
  on the classification the module already computed:
  ```ts
  const decisionActorSha256 =
    classification.disposition === 'decided_no_action' && row.decision_actor
      ? sha256(row.decision_actor)
      : null;
  ```
  This matches the smallest correction proposed in Finding 1 exactly, and it
  is the only site in the file that reads `row.decision_actor`
  (`src/healer/resolution-catalog.ts` grep confirms a single occurrence).

- `classify()` (`src/healer/resolution-catalog.ts:198-324`) only returns
  `decided_no_action` from the branch at lines 211-223, which already
  requires `row.decision_actor` to be truthy. So the corrected line produces
  a non-null `decisionActorSha256` if and only if
  `classification.disposition === 'decided_no_action'` — the field can no
  longer survive a status transition off `wont_fix` (e.g. a rejected
  incident recurring back into `diagnosed`/monitoring) while carrying a
  stale `applied_action.rejected_by` value.

- This satisfies the ledger invariant it was checked against,
  `src/healer/company-work-ledger.ts:161-166` (`validatePlan`):
  ```ts
  if (
    (plan.resolutionDisposition === 'decided_no_action') !==
    Boolean(plan.decisionActorSha256)
  ) {
    invalid('named no-action state and decisionActorSha256 must agree');
  }
  ```
  Disposition and `decisionActorSha256` now agree by construction at the
  catalog layer, so a stale actor can no longer reach `validatePlan` and
  wedge the sole configured `healer:<fingerprint>` source.

- `src/healer/resolution-catalog.test.ts:125-142` adds exactly the required
  regression: a row with `status: 'diagnosed'`, `remediation_class:
  'transient'`, `applied_action_kind: 'proposal_rejected'`, and a stale
  non-null `decision_actor: 'operator-1'`. It asserts
  `disposition: 'monitoring'` and `decisionActorSha256: null` — this fails
  against the pre-fix code and passes against the current code. No
  unrelated fixtures were changed.

## Regression check

No new gap introduced: the existing "distinguishes verified recovery and a
named no-action decision" test (`resolution-catalog.test.ts:80-104`) and the
"keeps an anonymous rejection pending" test (`resolution-catalog.test.ts:106-123`)
still hold under the gated expression, since both already have
`classification.disposition` equal to `decided_no_action` or
`pending_decision` matching the original raw-`decision_actor` truthiness in
those specific cases. The correction only changes behavior for the
previously-uncovered case the regression test now exercises.

## Scope note

No unrelated cleanup or redesign is proposed. Finding 1 is fully resolved by
the recorded change and its paired regression test.
