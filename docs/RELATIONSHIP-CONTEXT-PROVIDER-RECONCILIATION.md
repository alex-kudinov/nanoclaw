# Relationship Context provider reconciliation

Task: `NC-20260826-004`

Decision:
`.program/decisions/decision-relationship-context-best-effort-identity-reconciliation-2026-08-26.json`

## Outcome and vocabulary

Connect every provider identity that can be defended deterministically. The
word `legacy` means a historical Trafft customer/appointment that still lacks
an accepted corroborating provider reference after the complete reconciliation
run. It is an explicit terminal classification, not a guessed Party link and
not an implementation backlog euphemism.

## Evidence tiers

1. `trafft_source_created_party_v1`: the already-live exact creation-window
   rule remains highest authority.
2. `trafft_unique_party_plutio_ref_v1`: the Trafft customer ID occurs under one
   canonical Party across the ledger and that Party has one stable, unique
   Plutio person reference imported from `business_v2.plutio_refs`.
3. `trafft_unique_party_encharge_ref_v1`: the same unique Trafft condition and
   a stable Encharge person ID joined through an email fingerprint that occurs
   under exactly one canonical Party and exactly one Encharge record.
4. `legacy_unresolved`: no corroborating stable provider ref, multiple Parties,
   multiple provider records, or any conflict. No exact ref or projection is
   created.

Provider refs remain scoped. Plutio is native authority for its contact/object
ID and Encharge for its person/consent state; neither becomes appointment,
learning, relationship, payment, or Party-merge authority.

## Provider adapters

- `plutio_reference_ledger@1.0.0` imports the existing unique bidirectional
  reference ledger. It performs no provider call or Plutio write.
- `encharge_person_snapshot@1.0.0` accepts a private sanitized snapshot with
  Party ID, email fingerprint, Encharge person ID, update time, global
  unsubscribe state, and bounded communication-category states. It rechecks
  the fingerprint against the live Party-email graph before binding. Raw email,
  name, phone, address, IP, browsing, tags, and provider payload never enter the
  snapshot or Relationship Context.
- `trafft_host_ledger@1.0.0` consumes the resulting exact refs and emits
  appointment projections. Its health adds Plutio, corroborated, and legacy
  aggregate counts.

The adapter manifest/fact catalog/envelope/projection/policy contracts are
unchanged. A future LMS or coaching-client system follows the same
adapter/config/catalog/test/runbook path.

## Encharge least privilege and private-file flow

NanoClaw exposes only `encharge-read/bulk-get-people`; it wraps the shared
integration's exact bulk GET and cannot invoke upsert, archive, unsubscribe,
tag, event, campaign, template, or send operations. Each request contains at
most 100 exact identifiers and writes a new mode-0600 result file.

The operator flow is:

1. export Party IDs/emails to a private temporary file on the production host;
2. perform exact Encharge bulk reads through the read-only toolbox wrapper;
3. run `npm run relationship-context:prepare-encharge` locally to create a
   mode-0600 sanitized snapshot containing no email values;
4. transfer only that sanitized snapshot to the production host;
5. ingest it transactionally, run Trafft reconciliation, verify aggregate
   refs/projections/legacy counts, then delete all temporary raw files.

No credential or raw provider payload enters Git, the release, PostgreSQL, or
the evidence report.

## Pre-implementation aggregate

- 1,374 unique Party-to-Plutio rows;
- 1,242 of 1,428 unique Party emails resolve to one unique Encharge person; one
  shared Party email is refused;
- 173 Trafft customers/400 customer-identified appointments, with zero
  multi-Party customer IDs; 24 additional appointments have no customer ID;
- Plutio alone makes 146 customers/324 appointments connectable;
- Plutio plus Encharge makes 159 customers/358 appointments connectable;
- expected residual: 14 customers/42 customer-identified appointments plus 24
  unidentified appointments, for 66 appointment records classified legacy.

These are aggregate preflight expectations, not live completion claims.

## Live result

Exact release `1a381e48` is live-verified. It imported 1,364 Plutio and 1,242
Encharge person refs, then connected 159 Trafft customers and 358 appointment
records. The complete residual is explicitly legacy: 14 customers and 66
appointment records. All provider conflict counters are zero. Encharge and
Trafft replays are fully duplicate-only with zero projection changes. Raw
temporary files were deleted after aggregate readback; global query and every
scheduled/group context consumer remain off.
Host-only cross-provider canaries prove the joins: an exact Encharge ref
resolved consent and delivered receipt 2, while an exact Plutio ref resolved
two Trafft appointment projections and delivered receipt 3. Both packs were
stale and said so; output contained no identity or context values.

## Gates and exclusions

- fixture, ambiguity, duplicate-provider-ID, conflict, merge, replay,
  provider-unavailable, raw-field refusal, and disposable PostgreSQL tests;
- independent Claude Sonnet/high review with all material findings corrected;
- immutable exact-live release, zero-work drain, readable backups, activation,
  private snapshot import, aggregate readback, and replay;
- query/global consumer remains off unless separately authorized;
- no provider mutation, Party merge, customer communication, consent change,
  payment/contract action, broad minion access, checkout/lifecycle/Circle/
  legacy-receiver change, or raw-email evidence publication.
