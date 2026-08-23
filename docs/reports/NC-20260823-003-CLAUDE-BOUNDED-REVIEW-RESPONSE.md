# Claude bounded review response: healer resolution loop

## Verdict

MATERIAL FINDINGS

## Finding 1 (high): `decisionActorSha256` is computed unconditionally on raw row data, not on the classified disposition — a stale `applied_action.rejected_by` value permanently breaks the one configured source

**Evidence**

- `src/healer/resolution-catalog.ts:326-338` (`itemFrom`):
  ```ts
  const identity = stableIncidentIdentity(row);
  const classification = classify(row, generatedAtMs);
  ...
  const decisionActorSha256 = row.decision_actor
    ? sha256(row.decision_actor)
    : null;
  ```
  `classification` is already computed at this point but is not consulted:
  `decisionActorSha256` is derived purely from `row.decision_actor`
  (`src/healer/resolution-catalog.ts:476`, `applied_action->>'rejected_by' AS decision_actor`),
  independent of which `classify()` branch produced the item's disposition.

- `classify()` (`src/healer/resolution-catalog.ts:198-324`) only sets
  `decided_no_action` in one branch — `status === 'wont_fix' && applied_action_kind
  === 'proposal_rejected' && decision_actor` (lines 211-223). Every other branch
  (`recurring` at 243-251, `diagnosed`/transient at 273-282, the
  `KNOWN_MONITORING` branch at 292-315, etc.) can be reached for a row whose
  `applied_action` JSONB column still carries an earlier `rejected_by` value —
  nothing in this module clears it when `status` moves off `wont_fix` (e.g. the
  incident recurs and re-enters `diagnosed`/monitoring). In that case the item
  ends up with `disposition !== 'decided_no_action'` **and** a non-null
  `decisionActorSha256`.

- That combination is exactly the invariant both layers of the accepted
  contract forbid:
  - `src/healer/company-work-ledger.ts:161-166` (`validatePlan`):
    ```ts
    if (
      (plan.resolutionDisposition === 'decided_no_action') !==
      Boolean(plan.decisionActorSha256)
    ) {
      invalid('named no-action state and decisionActorSha256 must agree');
    }
    ```
  - `data/business/migrations/nanoclaw-v2/132_company_healer_resolution_work.sql:76-81`
    mirrors the same check as a DB CHECK constraint.

**Why this violates the accepted contract**

Activation is bound to exactly one configured `healer:<fingerprint>` source
(`resolveHealerCompanyWorkAdapterConfig` / `selectHealerResolutionCatalog`,
`src/healer/company-work-adapter.ts:94-177`) with `MAX_ITEMS=1`. If that one
source's underlying incident ever had a rejected proposal (`wont_fix` +
`proposal_rejected` + named actor) and later recurs into any non-`wont_fix`
state, every future cycle throws `invalid_input` inside
`recordHealerObservationWithClient` (or earlier, inside `ensureHealerWorkItemWithClient`
via the same `validatePlan`), which `runHealerCompanyWorkCycle`
(`src/healer/company-work-adapter.ts:385-401`) swallows into a generic
`errorCode: 'projection_failed'`. Because the bound is exactly one source, this
is not a partial degradation — the adapter is permanently wedged for that
source with no way to make progress (no `no_op`, no `ensure_blocked`, no
closure), and the operator-facing signal gives no indication that the cause is
this specific data-shape mismatch rather than a transient DB issue.
This is a lost/stuck-work condition on the sole natural item the release is
scoped to, and it was not exercised by the recorded canary evidence ("One
natural item produced 1 work item / 1 observation / 2 events; replay was
no-op") — that canary incident evidently never had a populated
`decision_actor` outside a `wont_fix` state, so the live verification did not
cover this path. `resolution-catalog.test.ts` also only covers `decision_actor`
paired with `status: 'wont_fix'` (populated and null); no fixture exercises a
non-`wont_fix` status with a stale non-null `decision_actor`.

**Smallest correction**

Gate the field on the classification the module already computed, instead of
on the raw row:

```ts
const decisionActorSha256 =
  classification.disposition === 'decided_no_action' && row.decision_actor
    ? sha256(row.decision_actor)
    : null;
```

(`src/healer/resolution-catalog.ts:336-338`, using the `classification` local
already in scope at line 331.)

**Focused regression test**

Add a case to `src/healer/resolution-catalog.test.ts` alongside the existing
"keeps an anonymous rejection pending" test: a row with `status: 'diagnosed'`
(or any `KNOWN_MONITORING` status), `remediation_class: 'transient'`, and a
non-null `decision_actor` left over from an earlier rejection. Assert
`disposition !== 'decided_no_action'` and `decisionActorSha256 === null`. This
would fail against the current code and pass after the fix. Optionally pair it
with an adapter-level assertion (`company-work-adapter.test.ts`) that
`selectHealerResolutionCatalog` → `buildHealerCompanyWorkPlan` for such an item
produces a plan that `validatePlan` accepts without throwing.
