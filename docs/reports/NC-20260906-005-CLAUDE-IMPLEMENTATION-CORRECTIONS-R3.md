# NC-20260906-005 — Claude R3 implementation review corrections

Date: 2026-09-06

## Disposition

Both material findings were verified and corrected before release.

1. The simple-sync checkout path now performs a fresh server-side status check
   immediately before creating a payment object. A published `sold_out` state
   returns HTTP 409 with the cohort waitlist URL; an available state proceeds
   without creating a temporary hold. `Tandem_Cohort_Capacity::validate()` now
   uses the same live-status overlay, so initial checkout selection and final
   payment initiation agree.
2. Website-sale commitment ingress now retries a bounded three times after a
   `stale_version` result. Each optimistic attempt uses a case key scoped to the
   observed pool version, while the PaymentIntent-derived commitment and
   idempotency keys remain stable. A stale denial stays auditable, a refreshed
   attempt can commit the paid seat, and duplicate delivery cannot add a second
   seat.

## Verification

- Focused NanoClaw capacity tests cover a simulated version race and the
  refreshed successful commitment.
- Tandemweb capacity publication and checkout-selection tests cover live
  sold-out validation while confirming that simple sync creates no temporary
  hold.
