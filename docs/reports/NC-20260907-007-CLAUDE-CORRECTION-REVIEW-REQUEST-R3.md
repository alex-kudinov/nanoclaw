# NC-20260907-007 tiny qualification correction review R3

Review only the post-R2 correction authorized by Astra. The accepted MCS
profile has two managed qualification paths:

1. the exact admitted price with no offer/source key; or
2. the exact managed `mcs-full` offer key only when no price IDs were supplied.

If `mcs-full` is accompanied only by unlisted historical price IDs, it remains
unqualified and must preserve the pre-v2 Product Map legacy result. The exact
required regression is:

```text
account=tandem
offerKey=mcs-full
productIds=[prod_Uk2OvW03ZwxmAj]
priceIds=[price_historical]
productName=MCS - Standard path
matching Product Map row -> legacy MCS / MCS Practicum
```

The correction adds generic profile field
`offer_key_requires_no_price_ids`. It must use all normalized supplied price
signals, including unrecognized IDs. Exact managed price plus an unknown
companion still conflicts; exact key with no prices plus `incomplete: true`
still conflicts; unknown/retired keys and primary legacy remain unchanged;
known other offers and wrong-account native IDs still hold before legacy
classification.

Read only this request and
`/tmp/NC-20260907-007-R3-CORRECTION.diff` (8,887 bytes), which contains the
complete correction across manifest/schema, generated binding, resolver,
focused regression, Tandem generated payload/validator/test. Do not read other
files or use Bash, MCP, web, or provider tools.

Focused identity/publication/payment/release checks pass 65/65, typecheck and
deterministic cross-repository check pass, and Tandem publication passes 19/19.

Write only
`docs/reports/NC-20260907-007-CLAUDE-CORRECTION-REVIEW-RESPONSE-R3.md`. Report
only unresolved material findings. If the correction meets the accepted
boundary, write `NO MATERIAL FINDINGS` with a brief branch-order verification.
