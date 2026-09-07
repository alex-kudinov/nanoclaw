# NC-20260907-005 first catalog application

Status: exact proposal; unapplied

## Recommendation

Use exactly `supervision-inaugural` and `supervision-regular` as the first
publication-tooling population. They are the only two offer routes already in
the v1 identity bridge, share one frozen bundle and roster destination, and have
exact account-scoped native product/default-price identity. Together they prove
one currently active and one intentionally inactive checkout case without
expanding paid admission, access, fulfillment, capacity, or lifecycle behavior.

This is a useful delta over the bridge because it would turn hand-maintained,
multi-source agreement into a reproducible build envelope, schema check,
consumer-specific compatibility artifact, and unsafe-lowering test. It does not
claim global supervision publication readiness. MCS, locale, PCC attachment, and
service-policy decisions are independent populations.

## Exact proposed fixture

The following is a future source-fixture input for validation and generation. It
is not a canonical fact file and is not applied by this task.

| Field | Inaugural | Regular |
| --- | --- | --- |
| offer | `supervision-inaugural` | `supervision-regular` |
| entitlement catalog/bundle | revision 1 / `coaching-supervision-mastery:v1` | revision 1 / `coaching-supervision-mastery:v1` |
| expected checkout state | active | inactive |
| checkout declared total | USD 399,600 cents | USD 479,600 cents |
| checkout installment declaration | 4 monthly obligations of 99,900 cents | 4 monthly obligations of 119,900 cents |
| native namespace/account | `stripe:alt` / `acct_1G1wKzA7hTBWpVVq` | same |
| native product | `prod_UvqkpUONPWr8Bo` | `prod_UvqkMSjRqR4zho` |
| native default price | `price_1Tvz3MA7hTBWpVVqhF708kPv` | `price_1Tvz3MA7hTBWpVVq9gL3v49F` |
| consumer account key | `tandem`, activation held until actual configured-consumer identity probe | same |
| v1 roster target | `CSS` / `Coaching Supervision Mastery` | same |
| Heartbeat observations | group `fa5f5f09-a10e-4dfd-8bf2-0451f7cffa83` and course `1f2febfe-eb34-463a-818e-ce7d0cac1251` exist; course is present in managed source; accepted NC-004 snapshots/digests are recorded in `NC-20260907-005-TECHNICAL-GAP-RESOLUTION.json` | same |
| Heartbeat relationship limit | group-course attachment, participant access, progress, class, and completion unverified | same |
| native price limit | default-price identity verified; native amount, currency, recurrence, and duration unverified | same |
| historical effective interval | unknown; observation timestamps must not invent it | unknown; observation timestamps must not invent it |

The total and installment values above remain source declarations. One agreement
spans all installments; later receipts cannot create additional orders,
enrollments, or seats. This fixture reads no agreement or participant records and
does not authorize financial admission.

## Future implementation prerequisites

1. Start from the then-current NanoClaw production lineage and the then-current
   Tandemweb source lineage. Reconcile shared continuity by meaning. Do not deploy
   the NC-004 or NC-005 documentation base as live code.
2. Use the accepted concrete paths:
   `facts/catalogs/student-catalog-publication-v1.schema.json`,
   `facts/catalogs/student-catalog-publication-v1.json`,
   `scripts/build-student-catalog-publication.mjs`,
   `tools/contador/student-catalog-publication.test.ts`, and
   `facts/generated/student-product-bindings-v1.compat.json` in NanoClaw; and
   `data/generated/student-catalog-publication-v1.json` in Tandemweb. Source files
   stay authoritative; the coordination fixture carries references, versions,
   digests, evidence states, and consumer intent.
3. Probe the account identity through the actual configured `tandem` consumer or
   record equivalent non-secret configuration attestation plus native account
   readback. Hold activation until it equals the audited `stripe:alt` account.
4. Refresh the two exact supervision Heartbeat object-existence reads and managed
   course-source digest, or explicitly accept the cited NC-004 digests as still
   current. Record group and course existence separately and keep attachment,
   access, progress, class, completion, and fulfillment unverified.
5. Generate a `nanoclaw-v1-exact` compatibility artifact and prove byte-stable or
   semantic equivalence with the current two routes. Reject any lossy lowering.
6. Generate a static Tandemweb validation artifact that preserves inaugural
   active and regular inactive. Website checkout remains independent of a live
   NanoClaw call.
7. Review the exact fixture, outputs, tests, and source revisions. Stage and
   activate one consumer at a time; record prior and new release/artifact hashes
   and exact readback before advancing.
8. Keep the existing payment processor and legacy path active. Do not divert a
   paid event until every selected canonical and projection writer has separately
   reviewed execution/readback and explicit rollout authority. Never replay the
   resolved NC-20260907-001 production episode as a canary.

## Positive acceptance

- Compiling the inaugural fixture yields the same `tandem` offer/product/price
  indexes and CSS target as the current v1 binding.
- Compiling the regular fixture yields its distinct offer/product/price indexes
  and the same CSS target without making checkout active.
- Offer-only, product-plus-price, and matching live Product Map inputs resolve to
  the same route and binding revision as the current resolver.
- An unrelated unregistered product remains on the current legacy Product Map
  path.
- Every prepared payload records source revisions/digests and is byte-identical
  across two clean runs. Wall-clock preparation/activation/readback timestamps
  live in a separate receipt naming the payload digest and do not participate in
  deterministic payload hashing.
- Consumer coverage remains `validated`, `staged`, `activated`, or `read_back`
  independently. The roster identity consumer can be covered without claiming
  Heartbeat access or full lifecycle coverage.

## Negative acceptance

- With no in-scope known signal, an identity known only under another configured
  account returns `product_identity_scope_conflict`.
- A known in-scope offer/product plus an unknown or wrong-scope co-signal returns
  `product_identity_conflict`.
- Mixed inaugural/regular signals, `incomplete: true`, duplicate index keys,
  unknown offers, duplicate roster targets, catalog revision drift, and bundle
  drift fail closed.
- A Product Map target other than the exact CSS target returns
  `product_projection_conflict`; accounting remains separately receipted.
- Native product `active: true` cannot make regular checkout active.
- Missing or unverified `tandem` alias proof blocks activation even when fixture
  generation and resolver parity pass.
- Native price identity cannot be reported as native amount or recurrence proof.
- Native Heartbeat group and course existence cannot be reported as attachment,
  access, progress, class assignment, completion, or strict global publication
  eligibility.
- A future many-to-many, interval-scoped, or consumer-specific relationship that
  v1 cannot express fails unsafe lowering and requires a separately reviewed
  resolver design.

## Activation, partial failure, and rollback

Preparation, validation, and review create no deployed coverage. During a later
authorized rollout, each consumer continues using its current facts until its
own current-lineage release pins and reads back the exact artifact. If one
consumer activates and the next fails, stop. Leave the failed consumer on its
prior facts, record the partial state, and either retry the same reviewed artifact
or restore the activated consumer's prior known-good release/artifact. Rollback
does not edit historical terms, provider objects, roster/access records, payments,
or enrollments.

## Implementation entry and activation exit

Coding may start after Astra accepts this packet and a new implementation task
has authority over both then-current repository lineages. The schema, fixture,
generator, tests, consumer outputs, actual consumer alias probe, release packets,
and readbacks are implementation outputs and activation gates. Activation exits
only after those outputs are reviewed, the alias hold closes, each consumer's
normal release gates pass, and the exact pinned artifact is read back. NC-005
applies no fixture, creates no generator, and activates no consumer.
