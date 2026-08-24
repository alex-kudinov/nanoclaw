# NC-20260824-003 correction review response (R2)

Reviewed exactly the five listed paths. No source edited.

**NO MATERIAL FINDINGS.**

## Verification of the three R1 corrections

1. **Non-array `locales` crash (was Medium).** `src/program-facts-drift.ts:366-380`
   now guards with `Array.isArray(catalog.locales)`, checks every entry is a
   non-null, non-array object before calling `.map`, and only computes
   `languages` when `localeRecordsValid`. Any non-array `locales`, or any
   array containing `null`/primitive/array entries, falls through to
   `catalogValid = false` and returns `catalog_pack_mismatch` — traced by
   hand for every shape JSON.parse can produce (object, string, number,
   `null` entry, string entry, nested array entry); none reach `.map` on a
   non-array. `src/program-facts-drift.test.ts:187-211` exercises object,
   string, number, and mixed-array-entry cases and asserts
   `not.toThrow()` plus the `catalog_pack_mismatch` finding. Resolved.

2. **Asymmetric Python test coverage (was Low).**
   `tools/tests/test_sync_program_facts.py:96-136` now adds
   `test_mcs_locale_catalog_rejects_every_malformed_shape`, covering wrong
   `catalog_id`, non-integer `catalog_revision`, non-list `locales`,
   `locales` containing non-dict entries, and an incomplete language set,
   in addition to the existing wrong-hash and invalid-JSON cases in
   `test_mcs_locale_catalog_and_pack_are_exactly_hash_bound`. All guarded
   branches in `validate_mcs_locales`
   (`tools/sync-program-facts.py:109-147`) that R1 flagged as untested are
   now exercised. Resolved.

3. **Byte-hash asymmetry (was Low/informational).**
   `src/program-facts-drift.ts:489` now reads the MCS locales catalog with
   `fs.readFileSync(resolveMcsLocalesCatalogPath())` (no encoding → Buffer),
   passed straight into `detectMcsLocalesCatalogDrift` and hashed via
   `createHash('sha256').update(catalogSource)` on that Buffer
   (`src/program-facts-drift.ts:381`) — the same raw-bytes operation as
   Python's `catalog_path.read_bytes()` →
   `hashlib.sha256(catalog_bytes).hexdigest()`
   (`tools/sync-program-facts.py:115,127`). JSON parsing is decoded
   separately (`catalogText`, line 347-349) and does not affect the hash
   input. `src/program-facts-drift.test.ts:213-217` exercises the
   production Buffer path explicitly. Resolved.

## Invariants reconfirmed

- Fail-closed: no path in `detectMcsLocalesCatalogDrift` or
  `validate_mcs_locales` throws or silently passes on malformed JSON shapes;
  every malformed case returns a finding/error.
- Exact-byte hash binding is now the same operation (raw bytes in, SHA-256
  hex out) on both the TypeScript and Python sides for the MCS locales
  catalog.

## Non-material observation (not a finding)

`validate_mcs_locales`'s `catalog` root-not-a-dict branch
(`tools/sync-program-facts.py:120-121`, e.g. catalog JSON is a top-level
array) is still not exercised by any test. The guard itself is correct and
fails closed; this is a coverage gap outside the seven branches R1's
correction #2 named, not a behavioral defect.
