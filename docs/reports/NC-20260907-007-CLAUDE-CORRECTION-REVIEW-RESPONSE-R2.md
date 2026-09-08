# NC-20260907-007 narrow correction review R2 — response

NO MATERIAL FINDINGS.

## Verified boundaries

1. **Toolbox env-load scope.** The diff removes the unconditional
   `${HOME}/dev/NanoClaw/.env` source entirely; `stripe_load_env` now picks a
   single caller-local file (`./.env`, else `${TOOLBOX_PROJECT_ROOT}/.env`)
   and sources only that file. No cross-project file is read regardless of
   caller. The switch from a line-by-line whitelist filter to
   `set -a; source; set +a` exports the full contents of that one file, but
   since the file is always the caller's own project config (never a foreign
   project's), this is not a new leak path — it removes the actual R1 defect
   (any caller inheriting NanoClaw's Stripe keys) without introducing a
   cross-project one. `get-price.sh`'s fail-closed path (`stripe_key_for`
   empty → `MISSING_CONFIG` exit 1, or silent `continue` under `--account
   all`) is unchanged by this diff.

2. **Wrong-scope classification.** `resolveProductIdentity` computes
   `qualifying` (in-account matches whose `resolution_profile
   .managed_signal_kinds` includes the signal kind) before the `wrongScope`
   check, and the `wrongScope` branch selects `product_identity_conflict`
   when `qualifying.length` is nonzero, else `product_identity_scope_conflict`
   — exactly the described mapping (`product-identity.cjs:162-182`).

3. **`unrecognized_offer` resolution profile.** Field is schema-validated to
   `'conflict' | 'legacy'` (`product-identity.cjs:86`), and the generated MCS
   profile sets it to `'legacy'`. Branch ordering confirms the described
   precedence: `wrongScope` (native-ID wrong-account) is checked first
   (line 174), then `knownOfferKeys.size > 1` (known other managed offer)
   (line 186), both returning `product_identity_conflict` before the
   `unrecognized_offer === 'legacy'` short-circuit is reached (line 197).
   Exact-offer/no-price plus `input.incomplete` falls through to the final
   block and is forced to conflict regardless of qualification (line 216),
   consistent with the "remains held" claim. `unknown_companion` stays
   hard-locked to `'conflict'` (line 85), so unmatched product/price
   companions can't ride the legacy path.

All three corrections are supported by the code as described; no
contradiction found in the read-scoped artifacts.
