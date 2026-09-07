# NC-20260907-004 checkpoint A progress

Captured at: 2026-09-07T17:50:44.352Z

Saved a sanitized local-source baseline for the existing active program claim. Primary program authority validates at revision 252; the task checkout remains at ab8a3c99 on `codex/student-catalog-reconciliation-20260907`. No program, provider, business, runtime, or primary-checkout state was changed.

The baseline contains 47 checkout entries (37 active), 8 entitlement offers, 42 components, 7 bundles, and 2 binding routes. The Tandemweb checkout file is an uncommitted local working-tree source; its selected safe fields are unchanged from that repository HEAD. This is neither deployed checkout proof nor provider-native verification.

Initial local discrepancies:

- 31 active checkout entries have no same-key entitlement offer.
- `mcs-full` is present in the entitlement catalog and absent from this checkout snapshot.
- 6 of 8 entitlement offers have no route in the revision-1 binding catalog.
- All 7 overlapping offer records match the allowed currency, total-price, native-price-ID, and Heartbeat-group-ID fields when installment price IDs are included.

Next checkpoint: read the localized checkout/publishing owners and bounded provider/source-owner surfaces listed in the baseline, beginning with native Student Roster metadata/Product Map headers and the two supported Stripe account namespaces. Keep all provider reads sanitized and read-only.
