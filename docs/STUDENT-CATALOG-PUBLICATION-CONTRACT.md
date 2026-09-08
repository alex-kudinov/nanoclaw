# Student catalog publication contract

Status: accepted under `NC-20260907-005`; supervision v1 activated by
`NC-20260907-006`; scoped MCS expansion in progress under `NC-20260907-007`

## Purpose and boundary

This contract defines how source-owned student product facts may become pinned,
consumer-specific artifacts without creating a second product master. It covers
deterministic preparation, validation, staged activation, exact readback, and
consumer-local rollback. It does not publish a catalog, add an allowlist, change
checkout, activate provider access, or change the current enrollment processor.

### Current-source correction applied by NC-20260907-006

The NC-005 packet's “regular inactive” assumption came from stale Tandemweb
branch `0e42c7dd2c27`. Current deployed/main source `c61fabf84f45`, reviewed in
`fbce5638da96`, makes both products active and binds availability to the selected
cohort: `supervision-inaugural` allows only `2026-10-07`, while
`supervision-regular` excludes that date and serves later cohorts. The
publication contract preserves that current behavior. Native Stripe product
activity cannot supply or override checkout/cohort eligibility.

The first proposed population is the two existing Coaching Supervision Mastery
routes. The contract is designed for later populations, but a v1 compatibility
export is allowed only when it can preserve the present resolver exactly.

### Scoped v2 expansion applied by NC-20260907-007

The current website `mcs-full` offer is one program enrollment whose selected
`mcs-practicum` cohort is a delivery assignment. The selected managed identity
is the exact ALT product/default-price pair used by the checkout source. The
primary account's `MCS - Standard path` product remains an explicit legacy
Product Map scope; it does not become another managed roster route, another
purchase, bundle issuance, cohort assignment, or certificate decision.

The entitlement catalog's flat product and price arrays cannot be copied into
both account indexes without inventing cross-account bindings. The scoped v2
consumer therefore carries exact product and price IDs inside each managed
account route and keeps legacy preservation separate. A known native ID in the
wrong account, mixed managed and legacy identities, or conflicting known offers
still holds. A primary legacy MCS event with an unlisted historical price or an
incomplete lookup retains the pre-v2 Product Map outcome when no proved
conflict exists. Unregistered products outside the selected population retain
their existing legacy behavior.

## Authority remains with the owning source

| Fact | Current authority | Publication treatment |
| --- | --- | --- |
| Program promise, cohort facts, expected checkout state | `facts/catalogs/coaching-supervision-mastery.json` plus its named course, website, checkout, and schedule sources | Reference by source revision and digest; do not copy the source into a new master |
| Offer, frozen bundle, component inclusion | `facts/catalogs/student-entitlements-v1.json` | Reference exact catalog revision, offer key, bundle key, and bundle version |
| Existing supervision Stripe-to-offer and legacy roster route | `facts/catalogs/student-product-bindings-v1.json` | Preserve the two accepted routes as source input; do not project MCS flat arrays across accounts |
| Website checkout configuration and active state | Tandemweb `data/checkout/products.json` at a pinned revision | Produce a static consumer artifact; checkout never calls NanoClaw live |
| Native Stripe account, object, and default-price relationship | Exact read-only provider read in its account scope | Store the relationship evidence class, native namespace, account ID, object IDs, observation time, and digest; do not infer price amount or recurrence |
| Heartbeat group and course existence | Exact documented read-only provider surfaces plus managed course source | Store separate existence observations. Attachment, access, progress, class, and completion require their own evidence |
| Product Map destination | Accepted roster mapping or the current v1 binding where that binding is already authoritative | Preserve target set exactly; a differing live target holds registration |
| Agreement, receipt, payer, purchaser, sponsor, participant, student | Their native agreement/payment and accepted party sources | Outside publication facts. No identity equality or order is inferred |

`NC-20260907-006` adds one coordination manifest at
`facts/catalogs/student-catalog-publication-v1.json`. That file contains
references, versions, digests, scopes, evidence states, and consumer intents. It
does not restate prices, curriculum, people, orders, or provider payloads.

## Required typed reference

Every reference in a future coordination manifest must carry:

| Field | Requirement |
| --- | --- |
| `namespace` | Stable source namespace, such as `stripe:alt`, `heartbeat:main`, `catalog:student-entitlements`, `checkout:tandemweb`, or `roster:student-roster` |
| `object_type` and `object_id` | Native or source-owned type and exact identifier; labels are display evidence only |
| `relationship_type` | A closed typed relation such as `offer_uses_product`, `product_default_price`, `offer_includes_bundle`, `checkout_represents_offer`, `offer_projects_to_roster`, `offer_declares_access_group`, or `bundle_declares_course` |
| `relationship_status` | `accepted`, `native_verified`, `source_declared`, `candidate`, `unverified`, `held`, `retired`, or `historical`; stronger states require named evidence |
| `source_ref`, `source_version`, `source_sha256` | Immutable source location, source-owned version, and content digest used for the build |
| `evidence_ref`, `observed_at` | Privacy-minimized receipt and UTC observation time for provider-backed claims |
| `effective_from`, `effective_to` | Inclusive start and optional exclusive end only when a source or accepted activation decision supplies them. Observation time is snapshot provenance, not a fabricated historical effective date. Unknown historical bounds stay explicitly held. A replacement appends a new interval and never rewrites historical terms |
| `owner` | Source owner for correction and consumer owner for activation/readback |

The manifest must reject duplicate active intervals for the same scoped
relationship, an end before its start, missing source versions or digests,
unrecognized relationship types, and relationship states stronger than their
evidence permits.

### Account aliases are explicit relationships

Consumer key `tandem` and provider namespace `stripe:alt` remain different
identifiers. Current code proves that the processor labels the
`STRIPE_SECRET_KEY_ALT` configuration slot `tandem`; provider `whoami` proves the
native identity selected by the separately configured toolbox `alt` slot. Those
facts alone do not prove that both runtime configurations currently select the
same account. A proposed `consumer_account_alias` record must bind `tandem` to
the audited native account ID only after a non-secret deployment/configuration
attestation and provider readback prove the relationship. The selected activation
time may start a future effective interval; the observation time does not invent
its historical start. The generator must fail if the alias is missing, held,
ambiguous, expired, or resolves to a different native account. It may not rename
the existing v1 route or assume every consumer uses the same key.

## Concrete implementation ownership and paths

The first implementation packet uses these paths. Current-lineage revalidation
may update base revisions and input digests, but changing responsibilities or
paths requires an explicit packet correction before coding.

| Repository | Path | Responsibility |
| --- | --- | --- |
| NanoClaw | `facts/catalogs/student-catalog-publication-v1.schema.json` | coordination-manifest schema |
| NanoClaw | `facts/catalogs/student-catalog-publication-v1.json` | source-reference fixture for the accepted population; editable coordination authority only after a separately authorized application |
| NanoClaw | `scripts/build-student-catalog-publication.mjs` | pure deterministic validation and consumer projection builder |
| NanoClaw | `tools/contador/student-catalog-publication.test.ts` | resolver-parity, unsafe-lowering, active-state, and hash tests |
| NanoClaw | `facts/generated/student-product-bindings-v1.compat.json` | pinned existing-processor identity/roster consumer output |
| NanoClaw | `facts/generated/student-product-bindings-v2.scoped.json` | current scoped processor identity/roster output: three managed routes plus one exact legacy scope |
| Tandemweb | `data/generated/student-catalog-publication-v1.json` | pinned static checkout-validation consumer output; no live NanoClaw dependency |
| Tandemweb | `data/generated/student-catalog-publication-v2.json` | current static checkout-validation output for both supervision routes and `mcs-full` |
| Each release packet | `docs/reports/NC-<task>-STUDENT-CATALOG-PUBLICATION-RECEIPT.json` | wall-clock preparation, activation, and readback receipts |

The accepted NC-004 source bases are NanoClaw
`0e6fb6050a304689561234d8fdbb0282674ae5bd`, Tandemweb snapshot HEAD
`681f9f72404c06434e163f59d6c5764bd9fa7ee2` with checkout file digest
`e7dc68f42709feaf1643971363c264bd73ec7d17c61fb64128b42890f5369011`,
and courses snapshot HEAD `062b346e0da0bea4fdab3e6ba67dea966add4fed`.
The accepted NanoClaw entitlement and v1 binding input digests are respectively
`d82a3c2b80e95bfb0cfd2f67e22851b1dfb056bf943616d01e874e0a63b2f72b`
and `08df8787fbf5fa621afe1f727bca7ffdb376da511537df5020db23c0f5a3e5ac`.
These are preparation provenance, not permission to code from stale branches.
Implementation starts from current production lineages and must either reproduce
these inputs or record and review the exact source delta.

## Immutable build envelope and outputs

One build envelope contains:

- publication schema version and build-tool version;
- exact Git revisions for every repository source;
- exact source versions and SHA-256 digests;
- selected population keys and coverage state before the build;
- one deterministic payload digest for each generated consumer artifact;
- the compatibility profile and validation receipt; and
- a `prepared_at` timestamp that does not become an effective or activation
  time.

Deterministic payloads exclude wall-clock fields, file modification times, local
paths, and provider observation timestamps that are not source facts. JSON keys
and ordered arrays use a canonical serialization before SHA-256. Two clean runs
over identical content and declared source revisions must produce byte-identical
payloads and digests. Wall-clock `prepared_at`, activation, and readback times live
only in a separate receipt that names the immutable payload digest; receipt bytes
are not expected to reproduce.

The proposed first implementation generates these immutable outputs in a
temporary directory before any repository write:

1. `nanoclaw-product-bindings-v1.compat.json`: the two-route projection accepted
   only when compile and resolution behavior is equivalent to current
   `student-product-bindings-v1.json`.
2. `tandemweb-checkout-publication-v1.json`: a static pinned projection of exact
   offer key, source version, price declarations, and expected active state for
   Tandemweb validation. It is build input or CI evidence, not a live NanoClaw
   request.
3. `student-catalog-publication-receipt-v1.json`: aggregate source/output hashes,
   per-population validation state, held populations, and no person, order,
   payment, member, or progress data.

The implementation may choose different final tracked paths after repository
overlap review, but it must preserve these three responsibilities and cannot use
generated output as editable authority.

## Compatibility profile for the existing processor

The `nanoclaw-v1-exact` profile must preserve all current
`compileProductBindings` and `resolveProductIdentity` behavior for the selected
population:

- each route references an existing entitlement offer and bundle;
- each account/offer, account/product, and account/price key is unique;
- every supplied offer, product, and price signal in a matched population must
  resolve to one route;
- `incomplete: true`, an unknown supplied co-signal, or signals resolving to
  different offers returns `product_identity_conflict`;
- when no supplied signal is known in the input account but at least one is
  recognized in another configured account, resolution returns
  `product_identity_scope_conflict`;
- when at least one supplied signal is known in the input account and another
  co-signal is unknown or belongs elsewhere, resolution returns
  `product_identity_conflict`;
- a live Product Map target set that differs from the bound roster target returns
  `product_projection_conflict`;
- an entirely unregistered population retains the existing legacy name route;
  and
- the exact bound route returns the same offer key, target rows, and binding
  revision as the current checked-in v1 source.

A future typed model may allow several products, prices, accounts, effective
periods, or destinations for one offer. The v1 exporter must reject any record it
cannot lower without losing scope, interval, relationship, evidence, or target
meaning. It must not flatten a many-to-many relationship into a v1 product or
price index. Such a population requires a separately reviewed resolver change.

The `nanoclaw-source-scoped-v2` successor preserves those v1 outcomes for both
supervision routes and adds only exact account-local identity arrays plus a
typed resolution profile. The ALT `mcs-full` route becomes managed when the
exact admitted price is present with no source key, or when the exact managed
offer key is present and no price IDs were supplied. An unknown or retired
offer key alongside the known price
retains Product Map behavior; a known other managed offer remains a conflict. A
qualified incomplete context or qualified context with an unknown companion
holds. Product-only ALT context and product plus only unlisted prices retain
Product Map behavior unless another known account or offer proves a conflict.
Its explicit primary MCS legacy scope recognizes the
known primary product without assigning a managed destination; Product Map
continues to decide the legacy result. The scoped consumer must never build the
Cartesian product of an offer's flat product and price arrays.

## Validation and coverage states

Validation is per population and per consumer. Passing JSON syntax or generation
alone is insufficient.

1. `prepared`: immutable inputs and outputs exist in a temporary build envelope.
2. `validated`: schema, source digests, typed relationships, authority rules,
   active-state parity, unsafe-lowering tests, and consumer compatibility pass.
3. `reviewed`: independent review has no unresolved material finding.
4. `staged`: the exact artifact is present in a consumer change but that consumer
   still runs its prior facts.
5. `activated`: the consumer release pins the exact artifact hash.
6. `read_back`: consumer behavior and release identity prove the exact artifact
   is in use.

Only `read_back` is deployed coverage for that consumer. The existing processor
is a roster identity/accounting-continuity consumer and does not provide
Heartbeat access. Matching its compatibility export can establish only that
consumer's identity-route coverage. Native group/course existence and the
unverified attachment and live-price semantics prevent any claim that the
supervision family is globally `strict_publish_eligible` or has full fulfillment
or lifecycle coverage. Coverage cannot silently grow from an audit record,
source generation, native object existence, a staged
file, or another consumer's activation. Unverified MCS attachment, learner
access, progress, class assignment, completion and certificate state, plus
locale, PCC attachment, and service-policy populations, stay held without
blocking independently validated identity/checkout populations.

Strict publication eligibility is a later enforcement decision. When enabled
for an accepted population, it must fail a new or changed publication if any
required relationship, destination, source digest, active-state rule, or pinned
consumer output is missing. It must not create a grandfathering exemption or
allowlist from NC-004 observations.

## Non-atomic activation sequence

Cross-repository activation is coordinated but is not atomic:

1. build all outputs from immutable source revisions in a temporary location;
2. validate every output, its cross-links, and the full build envelope;
3. review the exact artifacts and record consumer compatibility;
4. stage each consumer change with its expected prior release and prior
   known-good artifact hash;
5. activate one consumer through that repository's normal current-lineage
   release; read back release identity, pinned source versions, artifact hash,
   and relevant behavior before advancing;
6. activate and read back the next consumer; and
7. mark coverage independently for each consumer only after its readback.

Current live facts remain current for a consumer until that consumer release
activates. If an earlier consumer activates and a later consumer fails, stop the
sequence. Keep the later consumer on its prior facts; record the partial state and
either retry the exact reviewed artifact or roll the earlier consumer back. Do
not edit effective periods, change provider data, invent an exemption, or replay
enrollments to make versions appear aligned.

Later implementation must branch from then-current production lineages and
reconcile intervening authority changes. The NC-004 or NC-005 evidence base may
be a source reference; it is not a deployable live-code base.

## Rollback

Every consumer activation records the prior release, prior known-good artifact
hash, new release, new artifact hash, and readback. Rollback restores the prior
consumer release or pins the prior immutable artifact through the consumer's
normal release path. It never deletes the new evidence, rewrites historical
terms, removes a verified provider object, changes roster/access, or reprocesses
payments or enrollments. The resolved NC-20260907-001 production episode is
never a rollback or replay canary.

## Required positive and negative acceptance

The first implementation must prove exact inaugural and regular route parity,
preserve both active checkout routes plus the inaugural-only and
regular-excludes-inaugural cohort constraints, validate the `tandem` alias, and
reproduce the current resolved and legacy results.

It must also prove rejection or hold for:

- only a recognized product or price in the wrong account scope, producing the
  current scope-conflict result;
- a known in-scope offer or product plus an unknown or wrong-scope supplied price
  or product, producing the current identity-conflict result;
- product and price signals that resolve to different routes;
- incomplete provider evidence;
- a Product Map target differing from the bound CSS target;
- a source digest, catalog revision, bundle version, or output hash mismatch;
- an attempt to infer either route's active state or cohort eligibility from
  native product activity;
- an attempt to claim Heartbeat attachment or learner access from group/course
  existence; and
- any future scoped binding that cannot be lowered to the v1 index without loss.

These tests are implementation prerequisites. `NC-20260907-006` implements
them as source/build/release gates; it does not manufacture a payment,
enrollment, provider action, or student outcome.
