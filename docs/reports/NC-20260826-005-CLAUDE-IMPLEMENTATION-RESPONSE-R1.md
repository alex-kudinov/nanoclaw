# NC-20260826-005 bounded implementation review response R1

Reviewed only the eight allowed artifacts plus the request. No files edited,
no Bash/web/MCP/provider tools used.

## Finding 1 — contact-form and Chaos adapters have no watermark, so the
5,000-row cap is a historical ceiling, not a per-run bound; crossing it
permanently disables the source

- File/function: `src/relationship-context-source-enrichment.ts:1111-1129`
  (`ingestContactFormLedgerWithClient`) and `:1264-1316`
  (`ingestChaosVerifiedLedgerWithClient`).
- Violated invariant: "bounded... non-blocking... aggregate-only in health"
  implies the source stays operable as data grows toward the documented caps
  (review question 6). As written, both queries re-scan the *entire*
  all-time `business_v2.webhook_inbox` (and, for Chaos, all-time
  `business_v2.interactions`) on every 15-minute tick with no cursor/id
  watermark — `ORDER BY id LIMIT $1` and the visitor `GROUP BY` both start
  from the beginning of the table every run.
- Realistic failure mode: once cumulative handled contact-form rows exceed
  5,000, or cumulative distinct Chaos visitor rows exceed 5,000, `complete`
  becomes `false` and the function throws (`contact_form_snapshot_incomplete`
  / `chaos_verified_snapshot_incomplete`) *before* `registerAdapter` or any
  fact write. That is correct fail-closed behavior for a single run, but
  because the scan window never shrinks (it is not "rows since last
  watermark"), every subsequent run will throw identically forever. The
  source silently and permanently stops ingesting new contact-form/Chaos
  evidence — visible only as `errorCodes` in
  `/health.relationshipContext.sourceEnrichment` — with no path back to
  `healthy` short of raising `SOURCE_ENRICHMENT_MAX_SOURCE_ROWS` or a code
  change. Stripe's per-object-family 100-page (10,000-row) cap has the same
  structural issue, just with more headroom at current volumes (624/1,013/32
  for the larger account).
- Smallest acceptable correction: persist a per-adapter watermark (e.g. the
  max processed `webhook_inbox.id`, or max Chaos visitor id/timestamp seen)
  and filter each run to rows newer than it, so the 5,000/10,000-row limit
  bounds *incremental* work per tick instead of total historical volume.

## Finding 2 — Stripe duplicate-account guard is skipped when one of the two
scope fetches fails, so a single-scope network failure can bypass the
distinct-account check for the surviving scope

- File/function: `src/relationship-context-source-enrichment.ts:1574-1588`
  (`runRelationshipContextSourceEnrichment`).
- Violated invariant: "Stripe verifies the credential handles resolve to two
  distinct account IDs" (decision rationale; review question 5, account
  scoping must remain truthful).
- Realistic failure mode: `duplicateStripeAccount` is computed only when
  `stripeAccountIds.length === STRIPE_SCOPES.length` (both fetches
  succeeded). If the `heartbeat` fetch throws (timeout, credential rotation,
  Stripe outage) while `tandem` succeeds, `duplicateStripeAccount` is `false`
  by construction — not because distinctness was verified, but because there
  is nothing to compare against — and the `tandem` snapshot is ingested
  without ever having its account ID checked against the sibling credential
  for that run. If `STRIPE_SECRET_KEY_ALT` were ever misconfigured to point
  at the same account as `STRIPE_RESTRICTED_KEY`, this failure mode is the
  only way the collision could go undetected for a run.
- Smallest acceptable correction: skip ingestion for the succeeding scope too
  when the sibling scope's fetch failed in the same run (fail closed on
  incomplete distinctness evidence, matching the fail-closed pattern used
  everywhere else in this module), rather than treating "couldn't compare"
  as "not a collision."

## Finding 3 — malformed Chaos `visitor_id` rows are silently dropped without
being counted anywhere in health

- File/function: `src/relationship-context-source-enrichment.ts:1339`
  (`if (!/^\d{1,40}$/.test(row.visitor_id)) continue;` inside
  `ingestChaosVerifiedLedgerWithClient`).
- Violated invariant: health must "report only aggregate source counts...
  completeness" truthfully (review question 2 — non-idempotent/inaccurate
  health).
- Realistic failure mode: a row whose joined `visitor_id` fails the numeric
  regex is skipped before `exactVisitorReferences`, `legacyVisitors`, or
  `identityConflicts` is incremented, and no error code is recorded. `scanned`
  (row count) will then not reconcile against
  `exactVisitorReferences + legacyVisitors`, understating what happened to
  those rows in every health snapshot and audit reconciliation.
- Smallest acceptable correction: route these rows through
  `recordTerminalLegacy`/`legacyVisitors` (or a distinct `malformedVisitors`
  counter) instead of an unaccounted `continue`.

## Not material

Identity resolution precedence (existing-exact-ref bypass, per-account email
uniqueness, ambiguous/duplicate-email fail-closed legacy, Chaos
interaction/inbox agreement and same-party-only reactivation), PII
minimization (contact-form/Chaos field scrubbing, `normalizeAttributionPage`
query/fragment stripping, amount/card/email exclusion from facts, bounded
error-code extraction preventing credential/message leakage into logs),
per-source transaction isolation, network-before-DB-transaction ordering, and
default-off/non-blocking/unref'ed startup wiring in `src/index.ts` all match
the accepted decision and runbook and show no defect in the read artifacts.
