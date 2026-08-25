# NC-20260825-003 — Relationship Context implementation correction review R2 — Response

Verdict: **R1 findings 1–3 closed with evidence. R1's rollback ambiguity is
resolved. R1's registry/adapter-catalog ambiguity is only partially resolved
by this packet — one unresolved source ambiguity remains, reported below
rather than assumed.**

Reviewed only the six allowed artifacts (R1 response, migration 137,
rollback 137, `relationship-context-registry.ts`,
`relationship-context-reference-adapter.ts`, `relationship-context-store.ts`,
`relationship-context.ts`, `relationship-context-ipc.ts`).

## 1. Transport delivery status — CLOSED

`137_relationship_context_dark.sql:382-407` adds `delivery_status`
(`pending|delivered|failed`, default `pending`) to
`party_context_query_receipts` with a CHECK tying `delivered`/`failed` to
`delivered_at`/`delivery_error_code` presence. Two triggers separate this
from the append-only evidence: `fn_relationship_context_query_receipt_immutable`
(lines 496-526) excludes `delivery_status`, `delivery_error_code`, and
`delivered_at` from its equality check, and
`fn_relationship_context_query_delivery_transition` (lines 528-547) allows
exactly one transition, only from `OLD.delivery_status='pending'` to
`NEW.delivery_status IN ('delivered','failed')`, raising otherwise.

`getRelationshipContext` (`relationship-context.ts:391-421`) still records
the receipt (with `policy_decision`/`result_status` reflecting the true
resolution) before the caller confirms deliverability — but delivery now
starts `pending`, not a false success. `dispatchRelationshipContextIpc`
(`relationship-context-ipc.ts:111-153`) explicitly closes the loop:

- oversized (`>32 KiB`, lines 114-127) → `markQueryDelivery({status:'failed',
  errorCode:'response_too_large'})` before throwing;
- `deliverSourceInput` returning `false` (lines 128-145) →
  `markQueryDelivery({status:'failed', errorCode:'source_container_unavailable'})`
  before throwing;
- only on confirmed delivery (lines 146-153) → `markQueryDelivery({status:'delivered', deliveredAt})`.

Both repository implementations enforce the one-way transition at the
application layer too:
`PostgresRelationshipContextRepository.markQueryDelivery`
(`relationship-context-store.ts:768-784`) issues
`UPDATE ... WHERE id=$1 AND delivery_status='pending'` and throws unless
`rowCount===1`; `InMemoryRelationshipContextRepository.markQueryDelivery`
(lines 345-362) does the equivalent in-memory check. No oversized or
undelivered pack can retain `delivery_status='pending'` read as success, and
none can be marked `delivered` twice or reverted.

## 2. Observation lineage retroactive linking — CLOSED

`PostgresRelationshipContextRepository.recordObservation`
(`relationship-context-store.ts:574-666`) now handles the `DO NOTHING`
conflict path (lines 621-665): it re-reads the existing row, still refuses a
value/fact_type mismatch (`relationship_context_observation_conflict`) and a
genuine different-Party assignment
(`current_party_id != null && current_party_id !== input.partyId` →
`relationship_context_observation_party_conflict`, lines 647-653), and — new
in this round — when `current_party_id IS NULL` and a resolved `partyId` is
now available, issues `UPDATE party_context_observations SET
current_party_id=$2,updated_at=now() WHERE id=$1 AND current_party_id IS
NULL` (lines 655-660), rechecking `rowCount===1` to guard the race window.
`current_party_id` is excluded from
`fn_relationship_context_observation_immutable`'s equality check
(migration lines 464-494, list at 470-489 omits `current_party_id`), so this
UPDATE does not trip the append-only trigger; `updated_at` is likewise
excluded. `party_context_observations_reject_merged`
(migration lines 727-731, `BEFORE INSERT OR UPDATE OF current_party_id`)
still applies to this UPDATE, so a retroactive link to an already-merged
Party is refused. The link happens exactly once (`WHERE current_party_id IS
NULL` cannot re-fire), and once set it is visible to
`fn_relationship_context_party_merged`'s sweep
(`UPDATE party_context_observations SET current_party_id=winner WHERE
current_party_id=NEW.id`, migration lines 607-609) on any later merge — the
lineage gap R1 identified no longer exists.
`InMemoryRelationshipContextRepository.recordObservation`
(`relationship-context-store.ts:263-291`) implements the equivalent
first-write-wins-until-resolved / conflict-on-mismatch logic.

## 3. Query-time resolver ambiguous/needs_identity/not_found — CLOSED

`getRelationshipContext` (`relationship-context.ts:323-344`) no longer
collapses every unresolved case to `not_found`. For an `external_ref`
subject that fails direct/canonical resolution, it now calls
`repository.findIdentityException(reference)` and falls back to
`needs_identity` only if that returns `null`
(`resolution = (await ...findIdentityException(...)) ?? 'needs_identity'`,
line 339-341). Both repository implementations scope the lookup to `open`
exceptions and map reason code to result:
`PostgresRelationshipContextRepository.findIdentityException`
(`relationship-context-store.ts:556-572`) filters
`WHERE status='open' AND evidence_refs->>'source_ref_sha256'=$1`, returning
`'ambiguous'` iff `reason_code='identity_ambiguous'` and `'needs_identity'`
otherwise; `InMemoryRelationshipContextRepository.findIdentityException`
(lines 245-261) applies the same reason-code mapping (its exception map has
no separate "closed" state to filter, but nothing in this packet writes a
resolved/no_action status into it, so behavior matches production input).
For a direct `party` subject, an ID that does not canonicalize to a known,
unmerged Party leaves `partyId` `null` and falls through to the final
`else { resolution = 'not_found' }` (line 342-344) — it is never routed
through `findIdentityException`, matching "unknown direct Party IDs remain
`not_found`." This closes the query/ingestion resolver-contract divergence
R1 flagged.

## 4. Rollback 137 — R1's Q1 ambiguity RESOLVED, rollback is safe

`rollback_137_relationship_context_dark.sql:9-29` refuses to proceed if
**any** row exists in `party_identifier_claims`, `party_identity_exceptions`,
`party_context_adapter_registrations`, `party_context_observations`,
`party_context_projections`, `party_context_query_receipts`, or
`party_context_plutio_projection_receipts`, or if `party_external_refs`
contains any row that is not exactly `adapter_key='legacy_party_source' AND
adapter_version='1.0.0' AND source_scope='legacy-primary'`. Only after that
guard passes does it `DELETE FROM party_external_refs WHERE
adapter_key='legacy_party_source' AND adapter_version='1.0.0' AND
source_scope='legacy-primary'` (lines 31-34) — an exact match on the values
the forward migration's `fn_relationship_context_backfill_legacy_refs`
inserted (migration lines 673-692). No other row in any relationship-context
table can exist when the DROP TABLE statements run, so no non-legacy
evidence is destroyed; the guard, not the DELETE, is what "preserves" it.
The rollback never touches `business_v2.parties` (no `ALTER TABLE parties`
statement anywhere in the file), so the legacy `source_provider`/`source_id`
columns the forward migration read from remain untouched. Drop order is
dependency-correct: views before tables, `party_identifier_claims` (which
FK's to `party_external_refs`) before `party_external_refs`, and the
`parties_relationship_context_merge` trigger on the pre-existing `parties`
table is dropped explicitly (line 38) before its backing function, since
`parties` itself is never dropped.

## 5. Registry / reference-adapter enforcement — R1's Q2 ambiguity PARTIALLY
   resolved; one source ambiguity remains open

Directly verifiable in `relationship-context-registry.ts`:

- **duplicate**: `registerAdapter` throws
  `relationship_context_adapter_duplicate` if `adapterKey` is already keyed
  (lines 43-47).
- **fact**: `registerAdapter` throws
  `relationship_context_adapter_fact_unregistered` if any declared
  `factTypes` entry is not already in `this.facts` (lines 48-54); `registerFact`
  itself refuses a conflicting redefinition of an existing `factType`
  (`relationship_context_fact_catalog_conflict`, lines 29-39).
- **scope**: `registerAdapter` throws
  `relationship_context_source_scope_duplicate` if any
  `sourceSystem\0scope` pair is already claimed by another adapter
  (lines 55-62).
- **conformance**: `adapter(adapterKey)` refuses to hand back the adapter
  instance unless `conformanceStatus==='passed'`
  (`relationship_context_adapter_unavailable`, lines 109-120); registration
  always starts `conformanceStatus:'pending'` (line 67).
- **circuit**: `recordFailure` opens the circuit after 3 accumulated
  failures (lines 91-99); `adapter()` also gates on `circuitStatus==='closed'`
  (lines 109-120).

Not verifiable from this packet:

- **version** and **privacy**: `registerFact`/`registerAdapter` delegate
  shape validation entirely to `validateFactCatalogEntry`/`validateManifest`
  (`relationship-context-registry.ts:1-9`, imported from
  `relationship-context-contract.js`). `relationship-context-contract.ts` is
  not in this round's allowed packet (as it was not in R1's), so whether
  `adapterVersion` format or `privacyClasses` declarations are actually
  enforced — as opposed to merely typed — cannot be confirmed from the given
  files. R1's confirmation of that module covered only
  `validateObservationBatch` (fact/reference checks at ingest time,
  `relationship-context-contract.ts:360-447` per R1's own citation), not
  `validateManifest`/`validateFactCatalogEntry` (adapter/fact registration-time
  checks), so that prior confirmation does not extend to this claim.
- **no-network / no-credential**: within `relationship-context-reference-adapter.ts`,
  the one registered adapter is a fixture: `credentialHandle: null` and
  `healthPolicy: 'fixture_no_network'` are declared in its manifest (lines
  30-31), `collectSnapshot` always throws
  `reference_lms_snapshot_fixture_required` rather than performing a live
  fetch (lines 237-246), `normalizeWebhook` only parses an already-provided
  payload object (lines 228-235), and the file imports nothing from `http`,
  `https`, `net`, `fetch`, or any credential module. That is a real,
  file-level absence of network/credential code in the one adapter reviewed.
  But `relationship-context-registry.ts` itself never inspects
  `manifest.credentialHandle` or `manifest.healthPolicy` — nothing in the
  registry structurally refuses a future adapter that declares or uses
  network/credential access; that boundary, if it exists, is enforced (or
  not) inside the same excluded `validateManifest`.

Per the response contract, this is reported as an unresolved source
ambiguity rather than resolved by reading outside the allowed packet.
**Bounded correction:** include `relationship-context-contract.ts` (at least
the bodies of `validateManifest` and `validateFactCatalogEntry`) in the next
review round to confirm version-format, privacy-class, and
credential/network-declaration enforcement; alternatively, have
`relationship-context-registry.ts` itself assert
`manifest.credentialHandle === null` and reject non-fixture `healthPolicy`
values as a defense-in-depth check independent of the contract module.
