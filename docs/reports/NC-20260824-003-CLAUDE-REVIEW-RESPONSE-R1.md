# NC-20260824-003 bounded review response

Reviewed exactly the eight listed paths. No source edited.

## Findings (ordered by severity)

### 1. [Medium] Unguarded `.map` on `locales` can crash the TS detector instead of failing closed
`src/program-facts-drift.ts:363`

```ts
const languages = (catalog.locales ?? []).map((entry) => entry.language);
```

`??` only substitutes on `null`/`undefined`. If the pinned catalog's `locales`
field is present but not an array (e.g. corrupted to an object, string, or
number by a bad hand-edit), this throws an unhandled `TypeError` inside
`detectMcsLocalesCatalogDrift`, which is called with no surrounding
try/catch in `runProgramFactsDriftWithEvidence` (lines 495-501). The result
is an unhandled promise rejection in the daily drift job rather than a
`catalog_pack_mismatch` finding.

This contradicts the "fail closed on malformed input" requirement and the
sibling detector's own stated contract ("Notify-only... A human reconciles
on alert", `src/program-facts-drift.ts:8-13`): a crash produces no alert at
all, silently disabling detection instead of surfacing it.

The Python counterpart guards this exact case:
`tools/sync-program-facts.py:137-141`
```python
locales = catalog.get("locales")
if not isinstance(locales, list) or any(
    not isinstance(entry, dict) for entry in locales
):
    errors.append("MCS locales catalog has an invalid locales collection")
    languages = []
```
The TypeScript side has no equivalent `Array.isArray` guard before the
`.map`, so the two implementations diverge specifically on this malformed
shape — Python fails closed with a finding, TypeScript throws.

Non-array-typed `locales` is the one malformed shape in the review's list
(missing, stale-hash, wrong-revision, incomplete-language, non-exact KB)
that is not actually reached safely by the TypeScript side.

### 2. [Low] Asymmetric test coverage between the Python and TypeScript validators
`tools/tests/test_sync_program_facts.py:54-94`

`test_mcs_locale_catalog_and_pack_are_exactly_hash_bound` exercises
correct-match, wrong-hash, and invalid-JSON only. It does not exercise
`validate_mcs_locales`'s other guarded branches: wrong `catalog_id`,
missing/non-integer `catalog_revision`, non-list `locales` (the branch in
finding 1), or an incomplete/misordered language set. The TypeScript
suite (`src/program-facts-drift.test.ts:158-191`) does cover the
incomplete-language and KB-mismatch cases explicitly for the same guard.
The Python-only branches — including the exact `isinstance(locales, list)`
guard that finding 1 shows is load-bearing — are unverified by any
automated test.

### 3. [Low / informational] Hash binding is byte-equivalent, not byte-identical, across the two languages
`tools/sync-program-facts.py:115,127` vs `src/program-facts-drift.ts:361,369,395-397`

Python hashes raw bytes (`catalog_path.read_bytes()`). TypeScript reads the
same file as a decoded UTF-8 string (`fs.readFileSync(path, 'utf-8')`) and
hashes it via `createHash('sha256').update(value)`, which defaults to
re-encoding the string as UTF-8. This reproduces identical bytes only for
well-formed UTF-8 without a BOM or lone surrogates. It is not a true
raw-byte hash on the TypeScript side, only one that happens to coincide
with Python's for the current catalog (consistent with the passing
verification runs). No live discrepancy found; noting it because Q1 asked
specifically about byte-hash binding including encoding behavior, and the
two implementations are not structurally the same operation.

## Invariants checked and confirmed correct

- Idempotent injection and stale-block replacement for both the MCS locales
  block and its markers (`tools/sync-program-facts.py:65-75`,
  `tools/tests/test_sync_program_facts.py:39-52`).
- `sync-program-facts.py check`/`inject_local` reach all 13 tracked KBs via
  `knowledge_paths()` (`tools/sync-program-facts.py:78-81`) and validate the
  MCS catalog before any injection (`tools/sync-program-facts.py:150-160`).
- `validate-knowledge.sh` excludes only correctly ID-paired canonical blocks
  (backreferenced `BEGIN...END` regex, `tools/validate-knowledge.sh:92-99`)
  from the generic price/URL heuristic, and unconditionally still runs the
  exact catalog check afterward (`tools/validate-knowledge.sh:205-214`); the
  `--update` path re-injects the pinned facts after generic KB propagation
  (`tools/validate-knowledge.sh:172-173`).
- `detectMcsLocalesCatalogDrift` correctly fails closed on missing catalog/
  pack, stale hash, wrong revision, and non-exact Sales KB block
  (`src/program-facts-drift.ts:324-393`, tested at
  `src/program-facts-drift.test.ts:131-192`), and its addition to
  `runProgramFactsDriftWithEvidence` is purely additive alongside the
  existing Practitioner checks — no existing Practitioner logic was
  modified (`src/program-facts-drift.ts:487-501`).
- Sales-facing wording (`facts/catalogs/mcs-foundations-locales.minion.md`)
  states availability of the four localized self-paced journeys without
  claiming a localized live Standard Path cohort, translated ICF
  recognition, a localized price, or enrollment/purchase state — consistent
  with the accepted current facts and the review's forbidden-claims list.
