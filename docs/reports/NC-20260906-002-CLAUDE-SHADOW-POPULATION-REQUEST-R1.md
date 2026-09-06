# NC-20260906-002 bounded production-shadow review

## Objective

Review the Academy capacity production-shadow implementation before any
production migration or population. Report only material correctness, safety,
privacy, idempotency, or deployment-boundary findings.

## Owner-authorized outcome

- Apply migrations 142 and 143 to production after a verified custom-format
  backup.
- Populate five delivery blocks, 40 active assignments, and exactly three held
  exceptions in shadow mode.
- Keep checkout, providers, Sheets, public website, waitlist, communication,
  refunds, certificates, payments, Capacity minion/runtime consumers, and
  authority cutover unchanged.
- Rita's January assignment is settled and must not reappear as an exception.

## Accepted source facts

- ACC September 7: capacity 12, occupied 21, 10 Module 1 assignments, 11 ACC
  Full assignments, 0 Professional Coach assignments, one held Module 1 funding
  classification.
- MCS: September Thursday 5/12, September Friday 13/12, January Thursday 1/12,
  January Friday 0/12. Friday 13-versus-owner-12 remains an exception.
- One ACC Full participant has a roster/Heartbeat email alias held without
  provider rewrite.
- Production preflight: exact live release `886e25873072`, Node 22.23.2,
  healthy Gmail/Slack, zero active containers and waiting queue; migrations
  142-143 absent; prerequisites and admin membership/grants present.
- Exact participant email preflight: 40 unique, 37 resolve to one active Party,
  3 resolve to none and are explicitly allowed Party creation, 0 resolve to
  multiple Parties.
- The real private manifest is mode 0600 outside the repository. Do not read it.
  Approved hash:
  `6740de2ed4998c1ad698dc4d4c5908955a9d14c971e83c8e76d18adbb6d0895d`.

## Catalog delta summarized

Catalog revision 1 adds exact `acc-module-1:v1` containing only
`acc.module-1`, plus active `$399` `acc-module-1` with the current Stripe
product/price and Heartbeat Module 1 group. `enrollment_scope` adds `module`.
Required-offer validation and tests now require this offer. Current validation:
42 components, 7 bundles, 8 offers, 6 conflicts, 0 unresolved components.

## Allowed review paths

1. `scripts/populate-academy-capacity-shadow.mjs`
2. `scripts/build-academy-capacity-shadow-manifest.mjs`
3. `scripts/verify-academy-capacity-shadow-population-disposable.mjs`
4. `src/academy-capacity-shadow-population.test.ts`
5. `src/academy-capacity-shadow-manifest.test.ts`
6. `src/academy-capacity-shadow-population-disposable.test.ts`
7. `docs/ACADEMY-CAPACITY-SHADOW-POPULATION.md`
8. `scripts/build-release.mjs`

Do not inspect `.env`, credentials, the real private manifest/roster snapshots,
customer records, database contents, browser/session state, or unrelated files.

## Verification already run

- entitlement and capacity reconciliation validators pass;
- disposable population applies 5 blocks / 5 pools / 7 offer mappings / 40
  orders+enrollments+assignments / 310 entitlements / 3 exceptions / zero
  pending projections, reservations, or waitlist rows;
- occupancy reads 21/12 sold out, 5/12 open, 13/12 sold out, 1/12 open, 0/12
  open;
- exactly 3 synthetic Parties are created, replay inserts zero, and non-admin
  grants are zero;
- 60 focused tests, pinned typecheck, continuity/capability, and diff checks
  pass.

## Required invariants

- Manifest builder never writes private data inside the repository, overwrites
  an existing manifest, weakens mode 0600, or prints student identity.
- Apply requires the exact manifest hash, exact hostname, allowed database name,
  migrations present, and one transaction/advisory lock.
- Existing Parties are reused only by one exact normalized email. Multiple
  matches fail; new Parties are allowed only for the three manifest-bound exact
  roster identities. Payer identity remains null/unknown.
- Offer, bundle, component, financial, schedule, and delivery-block relations
  cannot drift from the manifest; idempotent conflict handling must not conceal
  a conflicting preexisting row.
- All 40 assignment chains and 310 entitlements are exact. The occupancy view,
  three exceptions, verified roster projection receipts, zero pending
  projections/reservations/waitlist, and aggregate receipt are read back before
  commit.
- A second apply inserts zero rows.
- The release packages both manifest and population commands, but the daemon is
  not activated for this operation.
- Repository and review artifacts contain no real student identity.

Write material findings, ordered by consequence with exact file/line evidence,
to `docs/reports/NC-20260906-002-CLAUDE-SHADOW-POPULATION-RESPONSE-R1.md`.
Change no other file. If none exist, write `NO MATERIAL FINDINGS`.
