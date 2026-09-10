# NC-20260909-001 load-bearing correction review R2

Review only the corrections for R1's two material findings. Write only
`docs/reports/NC-20260909-001-CLAUDE-REVIEW-RESPONSE-R2.md`.

Allowed reads:

1. `docs/reports/NC-20260909-001-CLAUDE-REVIEW-RESPONSE-R1.md`
2. `src/student-enrollment-projection.ts`
3. `src/student-enrollment-projection-store.ts`
4. `src/student-enrollment-projection.test.ts`
5. `scripts/student-enrollment-projection-disposable-worker.ts`

Correction summary:

- Enqueue now refuses a newer version while any older delivery is claimed,
  applied, or held. It supersedes only queued, failed, or verified versions.
- Claim-time stale cleanup supersedes only queued/failed work, never an active
  or held provider effect.
- Delivery checks the canonical/lease fence again after provider apply. Any
  post-apply version or lease loss writes a held receipt and owned exception
  atomically without requiring the old lease; it retains the real provider
  operation ID and blocks new-version enqueue until reconciliation.
- Receipt persistence failure after a successful apply follows the same durable
  uncertain path, never the definitive retry path.
- Provider idempotency lookup returns the genuine operation ID; replay reuses
  it and exact rollback uses it. No payload-derived operation ID remains.

Evidence: pinned typecheck passes; focused engine/catalog/migration/disposable
tests pass 15/15. The disposable proof now includes enqueue refusal during an
in-flight version bump, durable hold after apply/version change, durable hold
after simulated lease loss, and rollback that asserts the retained operation
ID. Unit tests cover replay operation-ID equality and post-apply receipt loss.

Report only unresolved material findings with exact file/line evidence and a
concrete fix. If the two load-bearing findings are fully corrected with no new
material regression, write `NO MATERIAL FINDINGS` and say so concisely.
