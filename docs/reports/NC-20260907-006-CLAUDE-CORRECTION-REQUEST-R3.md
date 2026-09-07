# NC-20260907-006 source-driven consumer correction R3

This third narrow review is authorized under the repository's standing
load-bearing correction/re-review contract and Astra's explicit NC-006 routing
decision. It is not new product or release authority.

Review only the source-driven correction after R2:

1. This request.
2. `scripts/build-student-catalog-publication.mjs` lines 830-855 and 900-922.
3. `/Users/xbohdpukc/dev/tandemweb-catalog-publication-current-20260907/tools/validate-student-catalog-publication.py`
   lines 1-240.

The current generated artifacts and business values are unchanged. The
generator no longer independently hard-codes October 7; it takes both route date
sets from the digest-pinned canonical program expectations, compares checkout
source exactly, and generically requires the inaugural allow-list to be nonempty,
the regular allow-list empty, and the regular exclusions equal the inaugural
allow-list.

The Tandem consumer no longer contains a handwritten price, native price ID, or
date table. It treats the self-hashed generated route as its pinned input and
checks the live selected checkout fields against it. It still enforces the exact
two offer keys, publication/profile/version/header, payload and selected hashes,
all eight evidence holds false, route structure/types, direct-vs-installment
price roles, positive total and installment arithmetic, cohort requirement,
nonempty program, ISO-shaped date lists, disjoint allow/exclude lists, and the
inaugural/regular partition. Unselected products remain outside its projection.

Focused evidence after correction:

- Nano generator/drift: 40/40; source-driven-date regression changes both
  canonical and checkout fixtures and proves the generated dates follow them.
- Nano fact sync: 8/8; typecheck and full generator artifact check pass.
- Tandem static consumer: 17/17; a source assertion proves its implementation
  contains none of the five current price/price-ID/date literals. Direct
  validator passes with unchanged file hash
  `9e6946410d25be5f8801d937ab40f0e347afa7ff834c26135cc94da93ce31db4`,
  payload hash
  `70657a2cd41c624e0345a8ec2e0e72190a7e686eb9d6bb1f4d468f2e66d3ec78`,
  and selected hash
  `2235d83be9169ab668e0475e19bd79ce212d73ea2b8ff8b960bbc6cfe63a9723`.

Check only whether this removes the duplicate fact master without weakening
selected drift, eligibility, price-role, arithmetic, evidence, or deterministic
artifact enforcement. Do not reopen accepted values. Do not read other files or
ranges; do not use Bash, web, MCP, or network. Write only
`docs/reports/NC-20260907-006-CLAUDE-REVIEW-RESPONSE-R3.md`. Report material
findings only; if none, write `NO MATERIAL FINDINGS`.
