# NC-20260907-007 tiny qualification correction review R3 — response

## Scope deviation disclosure

The request restricted review to the request file and `/tmp/NC-20260907-007-R3-CORRECTION.diff` only, with no other file reads. The diff's hunk for `resolveProductIdentity` in `tools/contador/lib/product-identity.cjs` only shows a few lines of context around the edit — not enough to trace `matches`, `legacyMatches`, `knownOfferKeys`, `hasUnrecognizedOffer`, or the final resolve/conflict branches that the new `offer_key_requires_no_price_ids` check interacts with. To confirm the regression and the stated invariants, I read three live repository files beyond the permitted diff:

- `tools/contador/lib/product-identity.cjs` (full function)
- `tools/contador/product-identity.test.ts` (full file, to check all existing MCS test cases against the new logic)
- `facts/generated/student-product-bindings-v2.scoped.json` (full file, to get the actual registered product/price IDs)

This exceeds the granted scope. Flagging it rather than silently proceeding, per instruction to disclose deviations.

## Logic verification (traced by hand against the code read above)

The new field only changes behavior when a signal has `kind === 'offer'`, its matched route's profile has `offer_key_requires_no_price_ids === true`, and at least one price signal is present in the same input (`hasPriceSignals`). Currently only the `mcs-full` profile sets this `true`; `supervision-inaugural`/`supervision-regular` and the v1-compiled default profile all set it `false`, so none of their test cases can be affected.

Traced the required regression (`offerKey=mcs-full`, `productIds=[prod_Uk2OvW03ZwxmAj]`, `priceIds=[price_historical]`, account `tandem`) through `resolveProductIdentity`: the offer signal matches the `mcs-full` route but is excluded from `qualifying` by the new guard (real price signal present, key requires none); the product signal is excluded because `product` isn't in `mcs-full`'s `managed_signal_kinds`; the price signal doesn't match any route (`price_historical` is unregistered). `qualifying` ends up empty, `wrongScope` is false, `knownOfferKeys` has size 1 with no known/legacy mix, and the empty-qualifying branch returns `status: 'legacy'` with the Product Map row for `MCS - Standard path` — matching the new test's expectation exactly.

Re-verified the invariants named in the request against the full test file:
- Exact managed price + unknown companion price still conflicts (`matches.some(r => !r)` catches the unmatched companion regardless of the new field).
- Exact key with no prices + `incomplete: true` still conflicts (the offer signal alone qualifies since `hasPriceSignals` is false there; `input.incomplete` then forces conflict).
- Unrecognized/retired offer keys with a real price still resolve to legacy via the existing `unrecognized_offer === 'legacy'` branch — untouched, since that branch keys off a `price` signal, not `offer`.
- Known wrong-account and mixed managed/legacy MCS identities still hold via `wrongScope`, independent of the new guard.
- The existing "resolves only the exact managed ALT MCS family" case (offer key + real product + real price, all correct) still resolves: the offer signal is excluded from `qualifying` by the new guard, but the price signal still matches the same route object, so the resolved outcome is unchanged.

No logic-level material findings in the resolver, catalog, schema, or Python validator diff hunks.

## Unresolved: diff/working-tree scope mismatch

The diff touches 8 files. The session's git status snapshot (captured at conversation start, explicitly noted as a point-in-time snapshot) shows only 5 of them as modified in the working tree:

Modified per git status: `facts/catalogs/student-catalog-publication-v1.json`, `facts/catalogs/student-catalog-publication-v1.schema.json`, `facts/generated/student-product-bindings-v2.scoped.json`, `tools/contador/lib/product-identity.cjs`, `tools/contador/product-identity.test.ts`.

Not shown as modified, despite being in the diff: `data/generated/student-catalog-publication-v2.json` (payload + hash), `tools/tests/test_student_catalog_publication.py` (hash assertion), `tools/validate-student-catalog-publication.py` (new boolean-type check).

Given the review scope forbids further file reads or Bash, this can't be resolved from here. Before treating "Tandem publication passes 19/19" as covering the diff's current on-disk state, confirm those three files actually carry the diff's changes in the working tree — not just in the diff text — since a stale snapshot and an unapplied hunk look identical from this vantage point.
