# NC-20260905-005 — Academy capacity dark implementation

Date: 2026-09-05

Program: `program:company-os` charter 1.0.0

Work item: `work:academy-capacity-extension`

Decision: `.program/decisions/decision-academy-capacity-extension-2026-09-05.json`

## Result

The accepted capacity architecture is implemented as a local, reversible,
default-off extension of the reviewed student-enrollment foundation at
`deac91a8`.

Migration/rollback 143 add only the capacity-specific structures: delivery
blocks, exactly one seat pool per block in v1, many versioned offer mappings,
checkout/manual/internal-waitlist reservations, FIFO waitlist entries and
human-approved offers, append-only capacity events, and the aggregate
occupancy view. The migration remains unapplied.

`src/academy-capacity.ts` is a pure deterministic command layer over the
existing `EnrollmentFoundationState`. It uses the reviewed `assignClass`
command for assignment commit and retains the same assignment/history records
for transfer and withdrawal. It creates no capacity-owned participant,
enrollment, entitlement, financial agreement, obligation, projection, or
exception record.

## Load-bearing behavior

- Pending and active assignments consume capacity; only unexpired held
  reservations count as reserved.
- Pool-version compare-and-swap protects last-seat decisions in the pure
  model; exact command replay returns the prior result and conflicting reuse
  fails closed.
- Checkout holds are capped at 30 minutes. Manual and internal waitlist holds
  are capped at seven days; manual holds require a reason.
- Consuming a reservation creates one existing-foundation assignment and never
  double-counts the consumed hold.
- An enrollment cannot occupy the same delivery block twice, including through
  different entitlement rows; runtime and SQL both enforce it.
- Assignment and transfer refuse open or acknowledged enrollment exceptions.
- Transfer changes origin and destination occupancy atomically in the returned
  pair; withdrawal ends only the class assignment and infers neither refund nor
  enrollment cancellation.
- FIFO ordering is stable by joined time, sequence, and key. One active offer
  per pool is allowed. Approval evidence precedes outreach/acceptance; sent
  state requires a delivery receipt. Decline/expiry/cancellation releases the
  hold, and conversion consumes it.
- Composite SQL keys prevent mismatched order/seat and pool/entry/reservation
  relationships.
- New objects are `nanoclaw_admin` only; events are append-only; guarded
  rollback refuses after evidence and removes no migration-142 table.

## Verification

- Pinned Node 22.23.2 typecheck: pass.
- Formatting: pass.
- Focused capacity plus enrollment integration: 54/54 pass across four files.
- Documentation continuity and capability matrix: pass.
- Full root after rebuilding the pinned native SQLite binding: 3,523 passed,
  32 skipped, with exactly two unchanged predecessor failures:
  `cnpc-prompt-contract.test.ts` expects the older wrapper literal and the
  date-sensitive Trafft fixture classifies August evidence as stale.
- JSON/diff/unwired checks: pass.
- Exact implementation commit: `5b69e107a7b68499cbf5c9b0be3e08cf61ec0f2a`,
  pushed to `codex/academy-capacity-extension-20260905`.
- Immutable local release package: source tree `ffc69d8affa3d96c2f1eceabea536b50b9c08e6f`,
  1,048-file artifact hash
  `3337ecab4d4a55f689c144b9fd5f3308157fae685834f92cc9852e8ac8af71e9`,
  archive hash
  `5329c83dfe1a1bcea8fee1def8a0e2427a4c5fa64064961b53b93eb026ff9d88`.
  Release-critical tests passed 750/750 and the independent container runner
  passed build plus 45/45 tests. The archive was not deployed.

## Independent review

One bounded Claude Sonnet/high implementation review returned
`NO MATERIAL FINDINGS` after 13 load-bearing checks. It used 16 model calls,
170,284 cache-create tokens, 1,767,207 cache-read tokens, 34,477 output tokens,
and 178,850 maximum context tokens. The maximum exceeded the intended 150k
target because both the 65k capacity engine and the 62k predecessor command
engine remained load-bearing; no second round was needed.

Review artifacts:

- `docs/reports/NC-20260905-005-CLAUDE-IMPLEMENTATION-REVIEW-REQUEST-R1.md`
- `docs/reports/NC-20260905-005-CLAUDE-IMPLEMENTATION-REVIEW-RESPONSE-R1.md`

## Boundary preserved

No migration was applied. No real student, payment, enrollment, roster,
waitlist, Heartbeat, Encharge, Plutio, Stripe, Calendar, Tandemweb, cohort, or
provider record was read or changed. The Capacity minion was not created or
activated. No message was staged or sent. No runtime was wired, released,
deployed, restarted, or cut over.

## Next gates

Disposable PostgreSQL apply/replay/rollback proof, production empty-schema
migration, read-only reconciliation, Bookkeeper integration, operator/Capacity
minion workflow, Tandemweb reservation cutover, waitlist outreach, and final
authority cutover remain separate Company OS work and require their own
authorization/evidence. Revision 184 registers the synthetic-only capacity
proof as `work:academy-capacity-disposable-schema-proof` and makes it a
prerequisite of capacity reconciliation, so no later task can skip directly
from source SQL to real student data.
