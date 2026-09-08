# NC-20260907-007 narrow correction review R2

Review only the load-bearing corrections to the two material R1 findings and
the accepted final source-key qualification boundary. Do not reopen the full
implementation or repeat already accepted facts.

## Corrections to verify

1. The isolated shared Toolbox helper no longer hardcodes or loads
   `~/dev/NanoClaw/.env`. It retains caller-local env loading and maps the
   already established `STRIPE_RESTRICTED_KEY` / `STRIPE_SECRET_KEY_ALT` names
   only after the caller's project registry/configuration supplies them. The
   exact read succeeds through NanoClaw's project registry. Other projects with
   no configured account must fail closed.
2. Wrong-scope classification now uses the qualifying managed match set.
   A qualifying in-account match plus a wrong-scope companion returns
   `product_identity_conflict`; with no qualifying managed match it returns
   `product_identity_scope_conflict`.
3. Resolution profiles now express `unrecognized_offer` behavior. For MCS, the
   exact admitted price qualifies only when the offer key is absent or is the
   exact managed key. An unknown/retired key alongside the known price preserves
   v1 legacy behavior. A known other managed offer or wrong-account native ID
   still conflicts before that legacy decision. Exact offer-key/no-price plus
   `incomplete: true` remains held.

## Read scope

Read only this request and these three artifacts (under 20,000 characters
combined with this request):

- `tools/contador/lib/product-identity.cjs`
- `/tmp/NC-20260907-007-TOOLBOX-CORRECTION.diff`
- `/Users/xbohdpukc/dev/toolbox-mcs-price-20260907/shared/stripe/tools/stripe/get-price.sh`

Focused Nano resolver/publication/payment checks now pass 65/65, typecheck and
deterministic generation pass, Tandem publication passes 19/19, and the isolated
Toolbox strict registry/help/invalid-ID/exact-price checks pass. Full Nano is
3,670 pass / 32 skip / the same three predecessor failures.

The focused resolver tests specifically assert: exact price and absent offer
resolves; exact offer without price resolves; either qualified context with
`incomplete: true` conflicts; exact price plus unknown companion conflicts;
product-only and product plus only unlisted prices remain legacy; known price
plus retired source key matches the v1 legacy result; qualifying price plus a
wrong-scope native ID is `product_identity_conflict`; unqualified product plus
a wrong-scope native ID is `product_identity_scope_conflict`; known other offer
plus MCS price conflicts. The generated MCS profile is
`managed_signal_kinds=[offer,price]`, `unknown_companion=conflict`,
`unrecognized_offer=legacy`, `incomplete=conflict`, `unqualified=legacy`.

Do not use Bash, MCP, web, provider calls, or inspect credentials/config files.
Write only
`docs/reports/NC-20260907-007-CLAUDE-CORRECTION-REVIEW-RESPONSE-R2.md`.
Report only unresolved material findings. If the corrections close R1, write
`NO MATERIAL FINDINGS` and name the verified boundaries briefly.
