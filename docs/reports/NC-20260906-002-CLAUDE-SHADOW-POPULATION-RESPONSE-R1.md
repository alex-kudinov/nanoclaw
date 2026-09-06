# NC-20260906-002 bounded production-shadow review — response

Reviewed only the eight allowed paths. Did not open `.env`, credentials, the
real private manifest, roster snapshots, customer records, database contents,
browser/session state, or unrelated files.

## Material findings, ordered by consequence

### 1. The reusable apply-time gate does not bind the two participant-scoped exceptions to the participant state they claim to describe

`validateAcademyCapacityShadowManifest` is the function `loadPrivateManifest`
calls to gate every `--apply` run
(`scripts/populate-academy-capacity-shadow.mjs:872-888`), independent of which
tool produced the manifest. Its exception loop
(`scripts/populate-academy-capacity-shadow.mjs:312-360`) checks
`exception_key` format, `subject_type`, the participant/delivery-block XOR,
membership of `participant_key` in the participant set, `severity`,
`owner_role`, `evidence_sha256`, and `review_at`. It never checks that:

- the `funding_source_unresolved` exception's `participant_key` is the same
  participant whose `financial_classification` is `'held'` (the `'held'`
  count check is a separate, participant-key-agnostic assertion at
  `scripts/populate-academy-capacity-shadow.mjs:292-296`), or
- the `cross_provider_email_alias_unresolved` exception's `participant_key`
  belongs to an `acc-full` assignment.

For the currently approved manifest, this binding is only correct because
`build-academy-capacity-shadow-manifest.mjs` happens to enforce it by
construction: the same `heldFundingSha256`/`aliasSha256` CLI values are used
both to set `financial_classification` on the matching participant
(`scripts/build-academy-capacity-shadow-manifest.mjs:253-254`) and as the
exception's `participant_key`
(`scripts/build-academy-capacity-shadow-manifest.mjs:349-372`), guarded by the
offer-type checks at `scripts/build-academy-capacity-shadow-manifest.mjs:309-321`
(held funding must be `acc-module-1`; alias must be `acc-full`). Those guards
are exactly why an operator mistake that pointed either exception at a settled
MCS participant — the scenario the task explicitly excludes for Rita's January
assignment — would be caught at build time.

The gap is that this protection lives only in one builder script, not in the
schema validator that is the actual last line of defense at apply time. A
manifest produced any other way (hand-edited, or by a future generator) that
reuses the exact approved hash and satisfies every other structural rule could
still bind `funding_source_unresolved` or `cross_provider_email_alias_unresolved`
to the wrong participant, and `runAcademyCapacityShadowPopulation` would apply
it without complaint. This bears directly on the stated invariant that
"financial ... relations cannot drift from the manifest" — the drift is
possible within a schema-valid manifest, not just in the roster→manifest
translation.

Not blocking for this specific approved manifest and hash, since the exact
hash pin plus the builder's own offer-type guards already prevent it here.
Worth closing before this validator is trusted for a second batch or for
hand-authored manifests.

### 2. Batch aggregate/readback assertions are scoped to the `academy-shadow:` key prefix, not to `manifest.batch_key`

The final readback block
(`scripts/populate-academy-capacity-shadow.mjs:784-808`) and the aggregate
receipt (`scripts/populate-academy-capacity-shadow.mjs:809-832`) count rows by
`LIKE 'academy-shadow:...%'` against the full table, e.g.:

- `scripts/populate-academy-capacity-shadow.mjs:789-791` (assignment count),
- `scripts/populate-academy-capacity-shadow.mjs:792-794` (exception count),
- `scripts/populate-academy-capacity-shadow.mjs:816-825` (all `counts.*`
  fields in the receipt).

None of these filters include `manifest.batch_key`. For this one authorized
batch the effect is fail-safe: the namespace is empty beforehand, so the
counts are accurate, and any future unrelated write into the same prefix would
make these assertions fail closed (abort the transaction) rather than silently
under- or over-count. But the "40 assignment chains are exact" and "a second
apply inserts zero rows" guarantees are really guarantees about the whole
`academy-shadow:` namespace, not about this batch specifically, and the
aggregate receipt cannot be verified as scoped to `NC-20260906-002` from the
SQL alone. This will need to change (e.g., include `batch_key` in every
readback predicate) before the same tooling is reused for a second shadow
population, or the second batch's readback will collide with the first's rows.

## Not material (checked, no action needed)

- Manifest builder output boundary, no-overwrite, and mode-0600 handling
  (`scripts/build-academy-capacity-shadow-manifest.mjs:57-76, 382-407`) are
  correct and covered by
  `src/academy-capacity-shadow-manifest.test.ts:160-202`.
- Apply-time gates (exact manifest hash, exact hostname, allowed database
  name, migrations-present check, single advisory lock/transaction) are all
  present and in the right order
  (`scripts/populate-academy-capacity-shadow.mjs:897-965`, `403-419`).
- Party resolution reuses only exact-normalized-email matches, fails on
  multiple matches, restricts creation to the three manifest-flagged
  identities, and never sets a payer identity
  (`scripts/populate-academy-capacity-shadow.mjs:514-551, 582-592`).
- Error messages (`RAISE EXCEPTION ...`) only ever include a 16-character
  hash prefix of the participant key, never email or display name — no
  student identity is printed on failure.
- Component/entitlement/assignment relations cannot drift from the manifest
  bundle definitions; this is enforced twice (schema-side `sameComponents`
  check at line 238-243, plus a SQL-side entitlement-count readback at
  line 740-743).
- `build-release.mjs` packages both `populate-academy-capacity-shadow.mjs`
  and `build-academy-capacity-shadow-manifest.mjs` (plus their `.d.mts`
  files) into the tracked release bundle
  (`scripts/build-release.mjs:211-214`) and does not invoke
  `activate-release.mjs` or any daemon-activation step — matches the stated
  boundary that the live daemon stays on its existing release.
- The migration-presence guard only checks two of the tables introduced by
  migrations 142/143 (`scripts/populate-academy-capacity-shadow.mjs:413-418`).
  A partially-applied migration would surface as a generic Postgres
  relation-not-found error instead of the friendly message, but the
  transaction still aborts safely either way — a diagnostics-quality gap,
  not a safety gap.
