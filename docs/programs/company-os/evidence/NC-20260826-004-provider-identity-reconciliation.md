# NC-20260826-004 — Provider identity reconciliation evidence

Date: 2026-08-26

Program item: `work:relationship-context-best-effort-identity-reconciliation`

## Accepted outcome

Connect every defensible Trafft, Plutio, and Encharge identity through explicit
evidence tiers. Anything that remains unresolved or conflicting is named
`legacy`; it is never silently guessed.

## Aggregate preflight

- production has 1,436 active Parties, 1,374 unique Party-to-Plutio refs, and
  1,428 unique Party emails;
- the read-only Encharge account reports 5,922 people;
- 15 exact bulk reads returned 1,243 records; sanitized preparation matched
  1,242 unique Party/Encharge identities and refused one shared Party email;
- no raw email exists in the 1,242-record sanitized snapshot;
- 173 Trafft customers cover 400 customer-identified appointments with zero
  multi-Party customer IDs; 24 more appointments lack customer IDs;
- Plutio alone connects 146 customers/324 appointments; Plutio plus Encharge
  projects 159 customers/358 appointments connected and 14 customers plus 66
  appointment records legacy (42 identified, 24 missing customer ID).

## Implementation so far

- provider-neutral `plutio_reference_ledger@1.0.0` and
  `encharge_person_snapshot@1.0.0` adapters;
- least-privilege NanoClaw toolbox wrapper exposes only private bulk GET, not
  the shared Encharge mutation/send toolset;
- sanitized snapshot preparation and live fingerprint revalidation;
- explicit Trafft evidence tiers, exact prior-exception resolution, and
  terminal `legacy_identity` / `legacy_unresolved` classification;
- focused 30/30, root typecheck, toolbox bulk-read 6/6 plus registry 24/24,
  and disposable PostgreSQL 2/2 pass before review.

## Review and corrections

- Claude Sonnet/high R1 found four material defects: whole-batch abort on one
  external-ref collision, omitted missing/inconsistent Trafft identities,
  classification counted without guaranteed persistence outside the ingestion
  limit, and non-canonical external-ref reads after merge;
- it also found first-run round-trip scale and corresponding test gaps;
- corrections isolate only different-family conflicts, classify every
  appointment ID with a distinct legacy reason, ensure and verify terminal
  exception persistence, canonicalize reads, halve bind round trips, skip
  steady-state binds, and add exact negative/scale coverage;
- R2 verdict: `NO MATERIAL FINDINGS`;
- audited usage: 12 model calls / 293,883 maximum context tokens; the packet
  exceeded the bounded-review target and is recorded as orchestration debt.

## Final local verification

- focused 31/31; root format/typecheck/build/continuity/capability pass;
- disposable PostgreSQL 3/3, with 1,400 Plutio rows under 10 seconds, replay
  under 2 seconds, one conflict isolated, and all valid refs preserved;
- toolbox bulk-get 6/6 and registry 24/24; independent runner 45/45;
- full root: 3,304 pass / 28 skip with the sole unrelated CNPC wrapper
  assertion reproduced at the prior exact baseline.
- shared Encharge bulk-read source is locally committed as `8b843de`; its
  repository has no configured remote, so a push is unavailable. The runtime
  wrapper and completed private snapshot are present on the operating Studio.

## Pending

Program closure only.

## Immutable release and backup

- implementation/live commit: `1a381e48f746ee2fadee8aa45bdf610ce2bea53c`;
- source tree `efd83fe50841df7adcde661cc89957395d787b78`;
- 996-file artifact
  `d53636b12131970c610d965cda5ba791136f964a99f60927ff82dd7f510e2d19`;
- archive
  `f44c1cb2051bd483308b3a2c2df73d2b647bcd12ed9398d3d9017df52458e03d`;
- zero-work/zero-email-action drain and readable mode-0700 backup
  `~/.local/share/nanoclaw-deploy-backups/NC-20260826-004-20260826T220847Z`;
- retained rollback
  `com.nanoclaw.plist.rollback-adc0c5d8ac1b-2026-08-26T22-09-06-176Z`.

## Live outcome

- exact verified release/tree/artifact/code root, Node 22.23.2, sole
  launchd/listener PID 34401;
- 1,364 verified Plutio person refs;
- 1,242 verified Encharge person refs plus 1,242 minimized consent
  observations/projections; zero refused identities or conflicts;
- 159 verified Trafft customer refs and 358 verified appointment refs;
- 14 customer identities and 66 appointment records are durably
  `legacy_identity` / `legacy_unresolved`;
- 782 Trafft observations: 424 immutable null-Party held plus 358 exact;
- 358 appointment projections (7 current/351 stale) and 1,242 consent
  projections (63 current/1,179 stale); freshness is not overstated;
- 358 resolved exceptions and 66 terminal legacy exceptions;
- exact Encharge ref to consent canary delivered minimized receipt 2 (`stale`,
  one projection); exact Plutio ref to Trafft appointments canary delivered
  minimized receipt 3 (`stale`, two projections); neither output exposed
  identity or context values;
- Encharge replay 1,242/1,242 and Trafft replay 424/424 duplicates, zero new
  observations/projection changes/conflicts;
- zero prohibited raw/email/name/phone/address/IP/payload/tag/browser/device
  persisted keys;
- global query off/zero grants, Gmail/Slack healthy, queues empty, checkout
  sends preserved, Community lifecycle healthy with consumers/Circle off.

## Privacy cleanup and residual

Every temporary file containing Party emails or raw Encharge people, the
sanitized transfer snapshot, and transfer archives was deleted after durable
aggregate readback. Only minimized provider refs/facts, hashes, receipts, and
aggregate evidence remain. Future stable provider evidence may reclassify the
14/66 legacy remainder; email alone cannot.
