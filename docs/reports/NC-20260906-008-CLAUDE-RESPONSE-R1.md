# Independent bounded persistence review — response

NO MATERIAL FINDINGS.

## Scope reviewed

- `src/student-enrollment-store.ts`
- `src/student-enrollment-store-mapping.ts`
- `scripts/verify-student-enrollment-store-disposable.mjs`
- `scripts/student-enrollment-store-disposable-worker.ts`
- `docs/reports/NC-20260906-008-CRITICAL-SCHEMA-EVIDENCE.md`

`applyEnrollmentIngress` internals were treated as trusted per the predecessor
facts and not re-derived; only the persistence contract around it was checked.

## Contract clauses checked against the code

- **Disposable namespace + Unix-socket guard before data access** —
  `assertEnrollmentStoreDatabase` (`student-enrollment-store-mapping.ts:9-12`)
  enforces the `nc_student_enrollment_store_[a-f0-9]{32}` pattern;
  `guardEnrollmentStore` (`:13-19`) additionally requires
  `inet_server_addr() IS NULL`, which is only true for Unix-domain-socket
  connections. `persistEnrollmentIngress` calls this *before* `BEGIN`
  (`student-enrollment-store.ts:40`), with a correct rationale in the comment
  (avoids pinning a stale serializable snapshot on the identity check itself).
- **SERIALIZABLE + ordered locks before snapshot** — `BEGIN ISOLATION LEVEL
  SERIALIZABLE` then a single `LOCK TABLE` statement over
  `ENROLLMENT_STORE_TABLES` in FK-dependency order (`:41-47`), before the first
  `loadEnrollmentStore` call. The worker's own `lock()` helper
  (`student-enrollment-store-disposable-worker.ts:59-60`) imports the same
  `ENROLLMENT_STORE_TABLES` array, so there is no risk of a second, divergently
  ordered lock list.
- **Version CAS** — `persistEnrollmentStore` UPDATEs use
  `WHERE id=$n AND version=$old.version` and require `rowCount === 1`, else
  throw `store_compare_and_swap_failed` (`student-enrollment-store-mapping.ts:400-407`).
  Covered by the stale-version test in the worker (`:592-603`).
- **Immutable history/evidence, append-only** — any mutation of an existing
  `appendOnly` row throws `store_append_only_conflict` (`:383`); array-typed
  tables (`history`, `events`) additionally reject any change to the existing
  prefix via a hash comparison (`:377-378`), so only appends are possible.
  Covered by the evidence-rewrite test (`:605-616`).
- **Exact FK resolution + readback** — writes translate domain keys to serial
  ids via the per-table `ids` index built table-by-table in FK order (`:386-392`);
  reads translate serial ids back to domain keys via the `keys` index
  (`:329-334`), throwing `store_missing_reference` on any gap. A full
  `loadEnrollmentStore` readback is hashed against the intended end state at
  the end of every `persistEnrollmentStore` call (`:411-413`).
- **One transaction for all sections; rollback on failure; COMMIT
  uncertainty** — `persistEnrollmentIngress` uses a single `client` for guard,
  lock, load, mutate, persist, readback, and commit. Any error before `COMMIT`
  triggers `ROLLBACK`; any error *at or after* `COMMIT` is unconditionally
  reported as `EnrollmentCommitUncertainError` and the connection is destroyed
  (`client.release(true)`) rather than returned to the pool
  (`student-enrollment-store.ts:52-74`). The worker's proxy-client test
  reproduces a lost COMMIT acknowledgement and confirms both the thrown
  `EnrollmentCommitUncertainError` and that retrying with the same intake key
  yields `disposition: 'duplicate'` with an unchanged state hash (`:421-453`).
- **Projection lease refusal** — `loadEnrollmentStore` throws
  `store_projection_lease_active` if any outbox row is `claimed` or holds a
  lease token/expiry (`:317-323`), exercised end-to-end in the worker
  (`:564-576`). This blocks the *entire* store on any single active lease,
  which is broad, but that is explicitly accepted for this local,
  full-snapshot proof rather than production throughput.
- **Migration 146 / rollback 146** — the forward migration adds
  `student_projection_outbox.version` (`>= 0`, default 0) and widens the
  history subject-type check constraint to include `evidence`. The rollback
  takes `ACCESS EXCLUSIVE` locks on both tables and refuses to run if the
  outbox is non-empty or if any `evidence` history rows exist, matching the
  "refuses populated outbox/evidence history" requirement. The disposable
  script runs rollback once while the DB is still empty and reapplies 146,
  matching the "empty rollback/reapply is tested" claim
  (`verify-student-enrollment-store-disposable.mjs:107-133`).
- **Evidence identity diff** — moving `subjectType`/`subjectKey` to
  `'evidence'` / `evidenceKey` in `attachEnrollmentEvidence` is consistent with
  the constraint widening in 146 (the old code would have needed `'evidence'`
  in the allowed values to write these rows at all under the *old* subject
  type, but more importantly the fix avoids collapsing multiple evidence rows
  attached to the same order onto one non-unique `(order, orderKey, version=0)`
  history identity) — the mapping layer's per-row identity function for
  `history` is `(subjectType, subjectKey, newVersion)`
  (`student-enrollment-store-mapping.ts:220-221`), so the pre-fix code path
  would have produced colliding identities for any order with more than one
  evidence attachment; the current mapping's append-only/array checks would
  have surfaced that as `store_append_only_conflict` rather than silently
  overwriting, so even the pre-fix defect could not have caused silent data
  loss through this layer — it would fail loudly, which is consistent with
  the described motivation for the fix (uniqueness, not silent corruption).
- **SQL injection / static schema surface** — all table and column names used
  in `student-enrollment-store-mapping.ts` come from the static `tables`
  allowlist; only values are parameterized. In the disposable script, the one
  string-interpolated identifier (`datname='${database}'`) is a host-generated
  UUID-derived name already validated against the `safe` regex before use, so
  no injection surface exists within the reviewed scope.

## No defects found

Nothing in the reviewed five artifacts contradicts the required contract or
the predecessor facts. No further action recommended from this review.
