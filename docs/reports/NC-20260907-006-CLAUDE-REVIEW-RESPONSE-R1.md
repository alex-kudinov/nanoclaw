# NC-20260907-006 bounded implementation review R1 — response

Scope respected: only the request file and the three cited file/line ranges
were read. No Bash, web, MCP, or network used.

## Finding 1 — Bounded range excludes the functions the required "unsafe
lowering" and "duplicate interval" checks depend on

`scripts/build-student-catalog-publication.mjs` lines 477–485 call
`relationshipScopeKey(relation)` and `intervalsOverlap(prior, relation)`, and
lines 604–784 (`exactlyOne`, `assertLowerable`) are called at 580, 593,
604–605, 610, 693, 711, 754–786 — but none of these four functions are
defined inside the granted ranges (1–260, 296–630, 670–920). Given the file's
`function`-declaration style elsewhere, they must live in one of the two
gaps excluded from the projection: lines 261–295 or 631–669.

These four functions are the actual implementation of exactly the checks the
request asks to confirm: "v1 lowering rejects lost account, interval,
many-to-many, target, or consumer meaning" (`assertLowerable`, `exactlyOne`)
and the no-overlapping-active-interval guard (`intervalsOverlap`,
`relationshipScopeKey`). Everything read around their call sites is
consistent with correct behavior (consumer scoping on `rosterRelation` vs
`checkoutRelation`, shared scoping on `offerProduct`/`defaultPrice`,
`unsafe_lowering_many_to_many` passed as the failure code at each
multiplicity-sensitive call site), but the call sites cannot substitute for
reading the implementation, and I cannot read outside the granted ranges to
close this gap.

**Smallest correction:** re-issue a follow-up bounded request (R2) adding
lines 261–295 and 631–669 of `build-student-catalog-publication.mjs` so
`assertLowerable`, `exactlyOne`, `intervalsOverlap`, and
`relationshipScopeKey` are in scope before this item is marked reviewed.

## Finding 2 — `manifest.holds` key count (8) does not obviously match the
9-item authority list

`build-student-catalog-publication.mjs` line 490 requires
`Object.keys(manifest.holds).length !== 8` (all values `false`). The
accepted authority text in the request (line 20–22) lists: payment,
provider, roster, student, capacity, schedule, message, migration, "or
customer action" — nine nouns/phrases, not eight. The manifest content
itself (the actual key names in `facts/catalogs/student-catalog-publication-v1.json`)
is outside the granted read ranges, so I cannot confirm whether "customer
action" is meant to collapse into "student" (in which case 8 is correct) or
is a distinct ninth hold that the fixed-count check would silently accept
being absent from, since the check only tests cardinality and
all-`false`-ness, not the specific key names.

By contrast, the parallel Tandem-side check in
`validate-student-catalog-publication.py` (`FALSE_EVIDENCE_LIMITS`, lines
38–47) enumerates the 8 keys by name, so an unexpected/missing key there
would fail `publication_evidence_overreach`. The Nano-side check has no
equivalent per-name enumeration.

**Smallest correction:** replace the cardinality check at
`build-student-catalog-publication.mjs:490` with an explicit expected-key-set
comparison (`sameArray`-of-sorted-keys or a `Set` equality against a named
constant), mirroring the pattern already used for `FALSE_EVIDENCE_LIMITS` in
the Tandem validator, so a hold silently renamed or dropped fails loudly
instead of only being caught if it also changes the total count away from 8.

No other material correctness, safety, or activation defects found in the
granted ranges: manifest validation runs before any file reads
(`validateManifestSchema` → `validateManifestBeforeReads` → `readDeclaredSources`),
source paths are restricted to an exact allowlist with traversal and
symlink checks (`resolveAllowedSource`, `resolveAllowedSourceForRead`),
evidence-class-to-status gating is enforced, inaugural/regular cohort
eligibility is provably mutually exclusive (lines 826–847 of the build
script, matched by `EXPECTED` in the Python validator), price/installment
arithmetic is internally consistent and cross-checked against native
evidence, the static consumer only reads/validates the two selected
`POPULATION` offers, and the mirror-repair script's triple check
(`expectedAfter`, `withoutChangedFields`, `maskSelected`) plus
read-before-write/read-before-rename/read-after-write hash pinning make
concurrent or unrelated-edit overwrite in `reconcile-supervision-checkout-source.mjs`
implausible.
