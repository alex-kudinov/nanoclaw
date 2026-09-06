# NC-20260906-002 Codex disposition of Claude R1

Claude Sonnet/high found two material reusable-safety gaps. Both are corrected
before production:

1. The apply-time manifest validator now binds `funding_source_unresolved` to
   the one held ACC Module 1 agreement,
   `cross_provider_email_alias_unresolved` to an ACC Full enrollment, and
   `mcs_friday_owner_count_variance` to the exact Friday delivery block. Tests
   move each exception to a wrong subject and require rejection.
2. Every generated pool, mapping, order, seat, agreement, enrollment,
   entitlement, assignment, projection, receipt, evidence, event, history, and
   exception key now uses the complete manifest `batch_key`. Every aggregate
   and zero-row readback uses that same batch prefix. Tests reject unscoped
   keys and prove the SQL contains no legacy aggregate prefix.

The key changes intentionally supersede the R1 private-manifest hash. The new
mode-0600 manifest validates at
`d44839d2b8ea08495fffd69fb5ca8c8aa6e30a9980c428477c3a4c3ea52793d8`.

Post-correction disposable proof again applies five blocks, 40 assignments,
310 entitlements, and three exact held exceptions; creates only three allowed
Parties; yields the required occupancy; grants no non-admin access; and inserts
zero rows on replay.
