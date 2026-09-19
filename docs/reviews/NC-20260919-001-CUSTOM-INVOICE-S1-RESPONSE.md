# NC-20260919-001 minimum-sufficient S1 response

## Disposition: KEEP

Proceed with the three-item operational-obligation delta exactly as scoped in
the request. No larger, smaller, or differently-owned path is justified by
the evidence presented.

## Largest avoidable operational burden

Every legitimate ad-hoc/custom-invoice payment currently lands in permanent
retry: the activation route rejects the valid contract pre-write on schema
grounds, and even a schema that admitted it would hit the Bookkeeper
recorder's hard Student Roster requirement, which ad-hoc coaching invoices
structurally cannot satisfy — producing indefinite 503 holds on Company OS
projection while Commerce payment truth is already correct and complete. This
is a live, evidenced correctness gap (signed TEST proof of a real payment
sequence blocked at the boundary), not a speculative one. It is the only item
in the request with standing operational cost today.

## Smallest feasible path validation

The proposed delta is already minimal against that burden:

1. **Validator extension** — a discriminated addition to an existing signed
   schema, reusing the current store and worker. No new store, no new worker.
2. **Migration 172** — a single `CHECK` constraint widening on an existing
   column. No table, column, index, owner, or grant change; reversible up to
   the first custom row, which is the correct boundary since reversal after
   that would silently corrupt already-charged obligations.
3. **`order.rosterPolicy` enum** — one signed field on an existing envelope,
   with applicability derived only from Commerce's own server-owned
   fulfillment mode, never inferred from payer/billing/product/email data.
   This is the narrowest fix that avoids the two explicitly named hazards
   (never place provider tokens in Company OS; never infer roster
   applicability from payer identity).

No item in the delta introduces a table, route, process, queue, scheduler,
worker, credential, provider adapter, or roster/Party/entitlement write,
matching the stated non-goals. A narrower path (e.g., special-casing
`rosterPolicy=none` in the recorder without a signed field) would recreate
the exact inference hazard the request rules out; a broader path (new
recorder or new schema family) is not supported by any evidence in this
checkpoint and would violate "preserve the existing two signed routes, one
NanoClaw process."

## Conditions attached to KEEP

- Do not proceed past the migration until the guarded-rollback test (rollback
  refuses after any custom row) is green against disposable PostgreSQL —
  this is the one step in the delta with irreversible-data risk if skipped.
- `rosterPolicy` must remain Commerce-derived only for server-owned
  fulfillment modes named in this checkpoint; any request to widen its
  derivation source is a new decision, not a continuation of this one.
- No item here authorizes a Live canary, customer message, or new provider
  call; the bounded work ends at exact replay/readback of the retained TEST
  jobs, per the request's explicit non-goals.
