# NC-20260907-007 Claude review response (R1)

## Scope note

Read the request and the six listed evidence artifacts. For the two files
directly touched by the resolver-logic finding below, I also read the current
full contents of `tools/contador/lib/product-identity.cjs` (superset of what
the diff already showed, needed to trace branch order) and
`tools/contador/product-identity.test.ts` (to confirm whether an edge case was
exercised by the "64 passing" suite). No other files, and no Bash/MCP/network
tools, were used. Flagging this since the request scoped reads to the listed
packet.

## Material findings

### 1. Shared Toolbox `stripe_load_env` hardcodes a NanoClaw-specific path with override precedence, breaking cross-project isolation

`shared/stripe/lib/stripe-api.sh` (`codex/stripe-get-price-20260907`,
`stripe_load_env`): the new implementation builds `env_files` as `.env`, then
`${TOOLBOX_PROJECT_ROOT}/.env`, then unconditionally
`${HOME}/dev/NanoClaw/.env` if it exists — and loads them in that order,
letting later files overwrite earlier ones for
`STRIPE_KEY_PRIMARY|STRIPE_KEY_ALT|STRIPE_RESTRICTED_KEY|STRIPE_SECRET_KEY_ALT|TOOLBOX_STRIPE_API_KEY|STRIPE_ACCOUNT`.

`shared/stripe/lib/stripe-api.sh` is a general Toolbox library, not a NanoClaw
file — it is shared across every project that has adopted the Toolbox `stripe`
toolset (per this project's own `CLAUDE.md`, Toolbox is shared with
tandemweb, cnpcweb, and bizmgr). Because `~/dev/NanoClaw/.env` is loaded last
and unconditionally, any other project or user on the same machine that calls
`stripe/get-price` (or any other `stripe/*` tool built on this lib) without
its own `STRIPE_KEY_PRIMARY`/`STRIPE_KEY_ALT` set will silently receive
NanoClaw's Heartbeat/Tandem Stripe keys through the `stripe_key_for` fallback
chain (`STRIPE_KEY_PRIMARY:-STRIPE_RESTRICTED_KEY:-TOOLBOX_STRIPE_API_KEY`),
rather than failing closed with "no key configured." Previously the primary
fallback was only the toolbox-generic `TOOLBOX_STRIPE_API_KEY`; this change
introduces a hardcoded absolute path to one specific project's env file as a
higher-precedence, always-checked source for every caller of this shared
library, on any machine where that path happens to exist. This risks
cross-project reads against the wrong Stripe account for any other project
sharing this Toolbox install that doesn't define its own primary/alt keys —
not just NanoClaw's `get-price` use case this task was scoped to add.

### 2. `product-identity.cjs` picks `product_identity_conflict` instead of `product_identity_scope_conflict` for an unqualified in-account match plus a wrong-scope companion — diagnostic-label-only impact

The accepted authority states: "With an in-account managed match plus a
wrong-scope companion, preserve v1 `product_identity_conflict`; use
`product_identity_scope_conflict` only when no in-account managed match
exists." In `resolveProductIdentity` (`tools/contador/lib/product-identity.cjs:167-175`),
the wrong-scope branch selects the code from `known.length`
(`known = matches.filter(Boolean)`, computed against the full `compiled.index`),
not from the `qualifying` set (`route.resolution_profile.managed_signal_kinds`),
which is only computed later. For ALT MCS, `managed_signal_kinds` is
`["offer","price"]` (`facts/generated/student-product-bindings-v2.scoped.json`
route for `mcs-full`), so a bare ALT-product signal (no offer key, no admitted
price) is an in-account index hit but not a "managed" match by the accepted
definition. Combining that bare product signal with a wrong-scope companion
signal (e.g. the primary product id under the wrong account) yields
`known.length > 0` and therefore `product_identity_conflict`, where the
authority text calls for `product_identity_scope_conflict` since no managed
match is present. `tools/contador/product-identity.test.ts:326-346`
("holds known wrong-account and mixed managed/legacy MCS identities") only
asserts `status: 'conflict'`, not `code`, and none of its three cases isolate
an unqualified-match-plus-wrong-scope-companion combination, so this gap is
not covered by the "64 passing" figure. Downstream impact is currently
contained: `tools/contador/process-payment.cjs:772-808` maps every
`status: 'conflict'` outcome to the same `rosterMode: 'identity_conflict'` /
`errorCode: 'product_identity_conflict'` regardless of the resolver's specific
`code`, so this only changes the diagnostic string written to
`results.sheets_roster` (`held (${identity.code}; ...)`), not payment routing,
roster writes, or review classification.

## Checked and consistent with the authority document

- ALT MCS qualifies as managed on exact admitted price, or exact offer key
  with no price ids; bare ALT product alone (no offer/price) and ALT product
  plus only unlisted prices both fall through to Product Map legacy behavior
  when no wrong-scope or mixed-offer signal is present.
- Primary `mcs-full`/`prod_UWzqD2zowB8apy` resolves to the legacy Product Map
  path even under `incomplete: true` or an unlisted historical price.
- `manifest.population_keys` / `resolution_profiles[].offer_key` ordering
  (`supervision-inaugural`, `supervision-regular`, `mcs-full`) matches
  `EXPECTED_POPULATION` in `build-student-catalog-publication.mjs`.
- `mcs-full`'s `offer_preserves_legacy_product` relationship is cross-checked
  against `mcs_source_evidence`'s `primary_product.id` and is required to
  differ from the managed route's ALT product id.
- Supervision route resolution (schema/roster/access-group/evidence checks)
  is unchanged in behavior versus v1 outside the new scoped-binding shape.
- `installment_count` for MCS (3) is not hardcoded to 4 anywhere in the
  validator; recurrence is source-agreement policy per the authority text.
- Heartbeat group evidence requires `existence_verified: true` and
  `course_attachment_verified: false` (an explicit unverified hold, not a
  false claim of attachment).
- `get-price.sh` returns only public price catalog fields (id, account,
  product, active, currency, unit amount, type, billing scheme, recurrence,
  created) — no customer, payment, subscription, or credential data.
