# Relationship Context Control Plane

Status: accepted design; migration 137 and the credential-free null-Party
Trafft shadow are live, while query/provider-write capabilities remain
disabled and relationship-owner authority is separately decision-bound
Tasks: `NC-20260825-001` through `NC-20260825-004`,
`NC-20260826-001`
Program items: `work:relationship-context-control-plane-design`,
`work:relationship-context-adapter-extensibility-design`,
`work:relationship-context-dark-foundation`,
`work:relationship-context-production-rollout`,
`work:relationship-owner-authority`
Last updated: 2026-08-26

## 1. Decision summary

Tandem needs one host-owned Relationship Context capability. An authorized
minion should be able to identify a person and request only the context needed
for its current purpose without querying SaaS products directly, treating an
email address as immutable identity, or guessing across incomplete records.

The target path is:

`source adapters -> source-bound observations -> canonical Party resolution -> deterministic projections -> capability-scoped context pack -> minion`

The design keeps these responsibilities separate:

1. Source systems remain authoritative for their native facts.
2. `business_v2.parties.id` is the internal Party key, not an external identity
   authority.
3. Company OS owns persistent source references, temporal identity claims,
   normalized observations, deterministic projections, conflicts, freshness,
   access policy, query receipts, and reconciliation.
4. Plutio is an operator-facing projection with sync receipts. It is not the
   canonical Party graph or the store for rich event history.
5. Minions receive purpose-filtered context packs. They receive neither
   credentials nor unrestricted provider clients.
6. `unknown`, `ambiguous`, `conflicting`, `stale`, `denied`, and `unavailable`
   are valid results and must block claims or actions that require certainty.
7. Adding a new person-enrichment system is an adapter/catalog extension, not
   a core-architecture change. A future LMS, coaching-client-management tool,
   CRM, assessment platform, or similar source must be able to contribute
   source-bound facts without changing Party identity, the fact envelope,
   query/receipt contracts, policy enforcement, or existing adapters.

This item produces design authority only. It does not answer the triggering
customer inquiry, change Sales or Booking behavior, create schema, populate
Plutio, activate a capability, deploy code, or write any provider/customer
record.

## 2. Authority and evidence boundary

### 2.1 Authority order

For each fact, the provider or accepted domain authority wins for its native
state. Company OS may reconcile and project that state but may not silently
replace it.

| Domain              | Native authority                                                                                                            | Company OS responsibility                                                                    | Explicitly non-authoritative                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Party identity      | exact provider identity plus verified identifier claims; accepted merge/split decisions                                     | canonical Party graph, scoped source references, conflicts, merge lineage                    | display-name similarity; one convenient email; Plutio alone                        |
| relationship        | accepted role/relationship records, completed payment/enrollment, active engagement, or earlier source-bound interaction    | temporal relationship projection and evidence receipt                                        | party existence, a current-inquiry prospect role, pipeline presence, website visit |
| appointments        | Trafft appointment/customer/service records; webhook-only custom answers for the event that supplied them                   | normalize appointment lifecycle, preserve webhook-only answers, reconcile current status     | Slack notification; Plutio activity note; service-name guess                       |
| commercial          | Stripe for charge/refund/payment state; Plutio for its invoice/proposal objects; accepted product catalog for product facts | join exact receipts, expose conflicts and accountable open work                              | price/date inference; browsing behavior; an unverified invoice title               |
| communications      | Gmail exact message/thread for email content and visible envelope; durable send/receipt records for delivery                | content-minimized interaction index, exact resource references, thread/current-message joins | Slack copy; agent memory; approval without Gmail receipt                           |
| learning            | Heartbeat for membership/course/progress; grader and certificate authorities for their states                               | join lifecycle projection and reconciliation receipts                                        | Encharge event, email click, shared group reverse mapping                          |
| consent/suppression | the accepted consent ledger and provider readback for the exact channel/purpose                                             | normalize purpose/channel state and conflicts                                                | subscription, purchase, group membership, or lack of a bounce                      |
| attribution         | exact form submission/entry page; Chaos as measured activity evidence                                                       | retain source-bound attribution with confidence and purpose limits                           | relationship, intent, program, answerability, or commercial authority              |
| open work           | Company Work/governed case state; pipeline only for its sales case                                                          | show accountable owner, status, next gate, and receipt                                       | minion memory, Slack post, or activity note                                        |
| Plutio projection   | Company OS projection receipt plus Plutio readback                                                                          | concise operator view and useful activity history                                            | canonical identity or event authority                                              |

### 2.2 Evidence freshness

Repository source and tracked schema were inspected on 2026-08-25 at branch
`codex/continuity-reconciliation`, HEAD `51185a5db669`. The checkout is a shared,
heavily dirty worktree and is not itself production identity.

The exact live student-lifecycle commit recorded by current evidence,
`8e475e036ad6`, is present in Git and contains migration 134 plus the lifecycle
store/reconciliation code, but those files are absent from this checkout's
HEAD. The live release and checkout must therefore be treated as distinct
authorities during implementation.

The handoff's PostgreSQL counts were produced by an earlier live read-only
audit: 1,419 parties, 1,300 active prospect roles, 9 client roles, 2 student
roles, no engagements/program variants/enrollments, 1,194 pipeline entries,
2,893 interactions, 419 Trafft booking interactions across 170 parties, and
1,108 interactions without source provider or source ID. They are historical
evidence as of the handoff, not refreshed counts. This host has no local
`nanoclaw_business` database, and the configured SSH toolbox lacks `SSH_HOST`,
so no production aggregate was refreshed in this task.

The current toolbox contract exposes read operations for Plutio, Trafft,
Heartbeat, Stripe, and Chaos. Encharge exists globally but is not included in
the NanoClaw project toolset. A live Plutio person-custom-field discovery call
failed before provider access because the current project environment file is
not shell-parseable. No provider data was changed, and no historical Plutio
field ID may be used until discovery and readback work again.

## 3. Implemented-contract audit

### 3.1 Identity

Current strengths:

- `parties`, `party_emails`, roles, directional relationships, engagements,
  and merge tombstones already provide a useful internal graph foundation.
- `canonical_party_id` follows merge lineage.
- `plutio_refs` provides one bidirectional reference per internal entity.
- source-bound interaction dedup exists on `(source_provider, source_id)`.

Current gaps:

- `src/identity-join.ts` names Plutio as identity system of record and calls
  email the durable join key. That is an implemented assumption, not the
  accepted target.
- `best_party_by_email` returns one row by ordering when an email maps to
  multiple parties. It converts ambiguity into an apparently certain match.
- `party_emails` intentionally has no global uniqueness, but callers generally
  do not surface that ambiguity.
- The live baseline stores Trafft customer IDs only inside interaction/create
  metadata. NC-20260826-003 adds a gated exact-ref candidate for uniquely
  Trafft-created Parties; it is not live authority until deployment/readback.
- `parties.source_provider/source_id` can describe only one origin and cannot
  represent multiple workspaces/accounts, identifier history, or verification.
- merges redirect several child rows but do not provide a general source-ref
  conflict/split workflow. A wrong merge is much harder to reason about than a
  held identity claim.

### 3.2 Relationship and work

`party_roles`, `party_contact_roles`, `party_relationships`, engagements,
pipeline entries, and interactions can represent much of the desired state,
but the live baseline described in the handoff is dominated by prospect roles
and pipeline rows while engagements and enrollments are empty. The model exists;
the population and evidence contracts do not.

Sales already has a sound policy definition: a relationship requires a fact
that predates the current inbound, such as a completed payment/enrollment,
active engagement, earlier interaction, or earlier role. The host does not yet
assemble that evidence into a single receipted relationship result. Inbox's
`Known-To-Us` line and the partial contact-card/timeline views are lossy,
prompt-dependent substitutes.

The separate `work:relationship-owner-authority` decision now assigns the
generic organizational principal `team:tandem` (`Tandem Team`) through a
tracked Tandem OS registry. This is organizational accountability only, not an
assigned coach, sender, or action grant. The context service must still return
`unknown` when the exact assignment receipt is missing and must never
substitute record creator, pipeline duplication, last sender, or another
convenient field.

### 3.3 Trafft and appointments

The current booked path is mechanically stronger than the retrieval path:

- booked webhooks normalize into a `booking` interaction and deduplicate by
  the exact Trafft appointment ID;
- webhook-only appointment form answers are parsed and retained because the
  Trafft v2 list/detail API does not return them;
- the sweeper can recover missed appointments;
- the Booking minion has no provider credentials and reads database state.

However, booking metadata is a JSON payload inside the generic interaction
ledger. NC-20260826-003 can derive a persistent exact customer/appointment ref
and current appointments projection only for the strict source-created cohort;
legacy/ambiguous history remains held. There is still no broadly enabled
one-call person lookup for upcoming/past/cancelled/rescheduled appointments or
Sales grant. This is why data can exist while Sales still cannot answer an
appointment question safely.

### 3.4 Plutio

Fresh Party creation enqueues a `sync/party` outbox item. The reaper upserts a
person using email/name and stores a `plutio_refs` mapping. Other workflows may
append Activity Log notes.

The projection is currently too thin:

- person sync sends identity only;
- existing-party resolution does not guarantee a fresh projection enqueue;
- outbox dedup protects only active `(kind, party_id, operation)` rows, not a
  projection version/hash;
- successful writes have a last-pushed timestamp but no canonical projection
  version, field-level readback, conflict policy, or drift receipt;
- Plutio notes can show activity but do not prove the corresponding source fact
  remains current;
- a prior Bizmgr audit found the historical Plutio CRM fields effectively
  empty, confirming that identity presence is not useful context population.

### 3.5 Gmail and communications

Gmail classification and routing retain exact Gmail message/thread IDs.
Outbound Gmail success is logged as an interaction with thread/message metadata.
Exact-resource host grants limit mailbox reads.

The current context layer remains incomplete:

- the interaction ledger is not a lossless Gmail thread store and should not
  become one;
- inbound context may depend on prompt-driven Inbox writes or classification
  records rather than one deterministic communication observation contract;
- `v_party_timeline` omits source-thread identity and message receipt status;
- thread recovery generally searches outbound interaction metadata;
- a current email address can resolve a pipeline/Party even when identity is
  ambiguous or the address has changed.

The context service should return exact Gmail resource references and safe
summaries. Reading message bodies remains a separately authorized exact-resource
operation; context packs must not become a broad mailbox export.

### 3.6 Stripe, products, and payments

The host Stripe path is deterministic and payment/refund processing is
idempotent across Stripe, Sheets, and PostgreSQL. Stripe tools support exact
read-only charge/customer/invoice/subscription lookups. But the current payment
ledger and product/cohort repair paths are not joined into a general Party
context projection. Payment by itself cannot prove learner identity, cohort,
relationship role, consent, or current engagement; those joins require exact
source references and an accepted catalog.

### 3.7 Heartbeat, Encharge, and lifecycle

The exact live lifecycle release already demonstrates useful primitives:
content-minimized events, identity exceptions, enrollment projections,
multi-axis state, reconciliation receipts, freshness state, and no-action
shadow boundaries. Relationship Context should reference those projections,
not duplicate or bypass them.

Heartbeat user/group/course/progress identifiers must become scoped external
references. Shared groups cannot reverse-resolve one product or cohort.
Encharge marketing consent/suppression requires an included, host-owned read
adapter and provider readback before it can be a supported context fact. The
current global-but-not-included toolset is discovery evidence only.

### 3.8 Chaos and attribution

Chaos creates source-bound visitor interactions and can link a verified email
to a Party, but its path evidence remains non-binding for Sales. Relationship
Context may return a narrow attribution fact such as an exact submitted form
or verified acquisition source. It must never turn browsing history into
relationship, purchase intent, program choice, answerability, or permission to
contact.

## 4. Canonical identity contract

### 4.1 Party is the internal join, not proof

`business_v2.parties.id` is the stable internal key. A Party result is usable
only when the resolver also returns how it was resolved and whether the match
is unique, verified, current, and permitted for the request.

Resolution precedence:

1. exact active external reference in the same provider/account/workspace and
   entity type;
2. exact accepted alias or merge lineage;
3. one unique, verified, temporally valid identifier claim;
4. one unique provider-confirmed identifier reconciled during this work item;
5. otherwise `ambiguous`, `not_found`, or `needs_identity`.

Display-name similarity, organization membership, website path, price, course
name, or an unverified email can generate candidates only. They never select a
Party automatically.

### 4.2 Required identity records

The first implementation slice should add:

- `party_external_refs`: Party, provider, account/workspace scope, entity type,
  opaque external ID, status, verified/first-seen/last-seen timestamps, source
  receipt, and uniqueness on the scoped provider identity;
- `party_identifier_claims`: typed normalized identifier hash plus restricted
  value where resolution requires it, validity interval, verification method,
  source, confidence, status, and Party;
- `party_identity_exceptions`: ambiguous candidates, conflict code, minimal
  evidence references, owner/decision state, and resolution receipt;
- append-only merge/split decision receipts. A split must be designed before
  automatically promoting email candidates.

Migration B must update `fn_merge_parties` and every merged-party write guard
for all new Party-scoped tables in the same transactionally reviewed change.
Source references, identifier claims, open exceptions, observations,
projections, and query/projection receipts must either follow the accepted
survivor or retain an explicit immutable loser-to-winner reference according to
their audit meaning. A merge may not leave an active external reference,
identifier claim, or exception attached only to a tombstoned loser. Merge tests
must cover conflicting email claims, duplicate scoped source references, open
exceptions, rollback, and retry; and must prove that a merge leaves no active
observation, projection, context-query receipt, or Plutio-projection receipt
referencing only a tombstoned loser Party.

The existing `parties.source_provider/source_id` columns are retained during a
compatibility window as first-seen provenance only. Migration B backfills every
valid scoped value into `party_external_refs` with an explicit provenance
receipt. Once that row exists, `party_external_refs` is authoritative for
external identity; new resolvers and adapters must not consult the legacy pair
to select a Party. Writes to the legacy pair are deprecated after adapter
migration, drift-tested during the window, and removed only in a separately
reviewed cleanup after all callers are proven migrated.

Email changes create or retire temporal claims. They do not rewrite provider
source identity or silently merge two Parties.

## 5. Observation and projection contract

### 5.1 Fact envelope

Every normalized fact uses this conceptual envelope:

```json
{
  "fact_type": "appointment.status",
  "subject_party_id": 123,
  "related_party_ids": [],
  "value": { "status": "booked" },
  "source_system": "trafft",
  "source_scope": "tandem-primary",
  "source_record_type": "appointment",
  "source_record_id": "opaque-id",
  "source_event_id": "opaque-event-id-or-null",
  "effective_at": "provider-time-or-null",
  "observed_at": "receipt-time",
  "verified_at": "reconciliation-time-or-null",
  "fresh_until": "policy-derived-time-or-null",
  "confidence": "source_verified",
  "conflict_state": "none",
  "classification": "internal"
}
```

Receipt time must never be substituted for missing provider occurrence time.
Values must follow a versioned fact catalog; the system must not become an
unbounded JSON scrapbook.

### 5.2 Required projections

The context service should calculate typed projections with version and source
watermarks:

- identity: canonical Party, active aliases/source references, ambiguity;
- relationship: evidence-bounded category, related organizations/people,
  effective interval, evidence timestamp, conflict;
- appointments: next and recent appointments, status, service, assigned person,
  webhook-only reason/source, currentness;
- commercial: supported product/offer, proposal/invoice/payment/refund state,
  payer/sponsor/student separation, accountable open work;
- communications: latest exact thread/resource references, direction,
  timestamps, delivery/response obligation, suppression;
- learning: Heartbeat access/progress/completion plus grading/feedback/
  certificate state by exact enrollment;
- attribution: exact form/referral/acquisition facts with binding level;
- consent: purpose/channel consent and suppression with provider/ledger receipt;
- open work: canonical case/work ID, owner, status, next gate, blocking fact;
- data quality: stale sections, conflicts, missing facts, and source outages.

Each projection is derived from immutable observations or accepted decisions.
Corrections append new evidence and advance the projection version; they do not
erase the fact that a prior result was returned.

### 5.3 Initial freshness policy

These are build defaults for owner review, not provider claims:

| Fact                            | Maximum age for an action-supporting pack                                             | When stale                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| exact identity/source reference | no fixed expiry; must be active and not conflicted                                    | revalidate on provider not-found, identifier change, merge/split, or high-impact action |
| appointment status/time         | 15 minutes for a same-day operational answer; 24 hours for general history            | return cached fact marked stale and require Trafft refresh for action                   |
| Gmail current thread/envelope   | exact latest-message read for a reply; index may be 5 minutes old for orientation     | require exact-resource refresh before reply/send                                        |
| Stripe payment/refund           | exact provider/fulfillment receipt for financial action; 15 minutes for status answer | no financial claim/action from stale cache                                              |
| Plutio proposal/invoice object  | 15 minutes for transaction action; 24 hours for operator orientation                  | refresh or report conflict with native authority                                        |
| Heartbeat membership/progress   | 26 hours after a complete daily snapshot; event receipts may be newer                 | return stale learning section; do not infer completion/access                           |
| consent/suppression             | provider/ledger readback within 15 minutes before marketing action                    | contact action blocked                                                                  |
| product/catalog fact            | exact accepted catalog revision                                                       | unsupported revision blocks price/cohort/program claim                                  |
| Chaos attribution               | historical evidence; never action-authorizing                                         | label non-binding; no automatic refresh for drafting                                    |
| open work                       | current Company Work/pipeline read in the request transaction                         | stale work never authorizes closure/action                                              |

Callers may request a lower maximum age. They may not relax a policy maximum.

### 5.4 Extensibility contract for new person-enrichment sources

#### 5.4.1 Architectural invariant

Relationship Context is provider-neutral at its core. Provider-specific code
ends at a versioned adapter boundary. The core resolver, observation store,
projection engine, capability policy, query API, and receipt ledger operate on
stable contracts and must not contain provider-name switch statements.

Onboarding an ordinary new enrichment source should normally change only:

- one adapter module;
- one tracked adapter manifest and non-secret configuration schema;
- namespaced fact-catalog entries and, when needed, a bounded mapping into an
  existing projection section;
- sanitized fixtures, conformance tests, and an operations runbook;
- capability allowlists only when an existing minion purpose should receive
  the new fact.

It should not require changes to `parties`, Party merge semantics, the external
reference model, the normalized fact envelope, `party_context_get`, query
receipts, policy evaluation, unrelated adapters, or existing provider data.
A genuinely new business domain may require a new projection type, but that is
an explicit reviewed domain extension rather than a side effect of installing
a connector.

#### 5.4.2 Tracked adapter manifest

Every adapter declares one reviewed manifest before it can run:

```json
{
  "manifest_version": 1,
  "adapter_key": "example_lms",
  "adapter_version": "1.0.0",
  "source_system": "example_lms",
  "supported_scopes": ["tandem-primary"],
  "external_reference_types": ["person", "course", "enrollment"],
  "fact_types": [
    "learning.enrollment.status@1",
    "learning.progress.percent@1",
    "learning.completion@1"
  ],
  "identity_claim_types": ["provider_user_id", "verified_email_candidate"],
  "collection_modes": ["webhook", "snapshot"],
  "projection_targets": ["learning"],
  "privacy_classes": ["internal", "restricted_identifier"],
  "credential_handle": "host-config-key-name-only",
  "health_policy": "example_lms_default",
  "conformance_suite": "person_enrichment_adapter_v1"
}
```

The manifest contains no credential, callback secret, customer record, or raw
provider payload. Registration fails closed for an unknown manifest version,
duplicate adapter/source key, undeclared fact/reference type, unsupported
privacy class, missing retention/freshness policy, or absent conformance proof.
The initial design uses a tracked, code-reviewed registry inside the modular
monolith. It does not dynamically download or execute third-party plugin code.
The implementation validates semantic adapter versions, declared privacy and
identity-claim classes, and exact source scopes before registration or ingest.
It bounds an observation batch to 262,144 UTF-8 bytes while retaining the
8,192-byte bound for every JSON value that can be persisted.

#### 5.4.3 Stable adapter interface

An adapter translates provider mechanics into core contracts. Conceptually it
implements:

```ts
interface PersonEnrichmentAdapterV1 {
  describe(): AdapterManifestV1;
  validateConfig(config: UnknownConfig): ConfigValidationResult;
  normalizeWebhook(input: BoundedWebhookInput): ObservationBatch;
  collectSnapshot(input: BoundedCollectionRequest): ObservationBatch;
  reconcile(input: BoundedReconciliationRequest): ReconciliationBatch;
  health(): AdapterHealthReceipt;
}
```

Only the methods declared by `collection_modes` are required. The host supplies
a bounded scope, cursor/watermark, deadline, output limit, correlation ID, and
an opaque credential handle resolved outside the adapter's stored artifacts.
The adapter returns only:

- scoped external references;
- identity candidates with verification/source evidence, never a selected
  Party or merge command;
- versioned normalized facts using the common envelope;
- completeness/watermark evidence and content-minimized errors.

The adapter cannot write core tables directly, call another provider, change a
Party, select a relationship, mutate a projection, grant a minion capability,
send a message, or perform a provider write. The host validates the batch,
resolves identity, persists observations, calculates projections, and records
receipts transactionally.

#### 5.4.4 Fact-catalog extension

Fact types are versioned semantic contracts, not provider field names. A new
adapter may reuse an existing type only when its meaning, unit, cardinality,
effective-time semantics, source-authority class, freshness rule, privacy
class, and conflict behavior all match. Otherwise it adds a namespaced or new
versioned fact definition plus an explicit projection rule.

A new fact is inert by default:

1. registration allows the adapter to submit it;
2. catalog validation allows the observation to persist;
3. a deterministic projection rule may consume it;
4. capability policy may expose the resulting field to named purposes/groups;
5. no fact or projection grants an action.

This prevents a newly connected LMS or CRM from silently redefining
`relationship`, `enrollment`, `completion`, `client`, `consent`, or `paid`.
Provider-specific raw fields may be hashed/discarded or retained briefly in
restricted quarantine for debugging, but never become an unbounded extension
bag in the Party object.

#### 5.4.5 Versioning, compatibility, and deprecation

The adapter API, manifest, fact schemas, and projection rules version
independently:

- additive manifest fields and new fact types are backward-compatible;
- changed meaning, units, identity semantics, or privacy class requires a new
  fact or adapter major version;
- the registry may run old and new adapter versions in shadow against the same
  sanitized fixtures, but only one version owns a source scope/cursor;
- observation records retain adapter/fact schema versions so they can be
  deterministically replayed through an approved migration;
- deprecation requires consumer inventory, a compatibility window, shadow
  parity, cursor handoff, rollback, and proof that no active projection or
  capability depends solely on the retiring version.

Core contracts change only through a separately reviewed architecture version.
An adapter must never force a coordinated rewrite of existing providers merely
because its source API is unusual.

#### 5.4.6 Failure isolation and operating limits

Each adapter/source scope has its own circuit state, cursor, retry budget,
freshness watermark, quarantine, health receipt, and rate/latency/output limits.
One failed LMS must make only its contributed facts stale or unavailable; it
must not prevent Gmail, Trafft, Stripe, Heartbeat, Plutio, or other context
sections from resolving. Partial results remain explicitly section- and
fact-scoped.

Malformed batches, incomplete pagination, cursor regression, undeclared facts,
identity ambiguity, and provider uncertainty are quarantined before projection.
Retries are idempotent by source fact/event identity. An adapter health check
or accepted webhook proves transport only, never identity, projection, action,
or business outcome.

#### 5.4.7 Adapter conformance suite

Every adapter must pass the shared `person_enrichment_adapter_v1` suite using
sanitized fixtures and fake credential handles:

- manifest/schema validation and duplicate registration refusal;
- exact scope, source-reference, event/fact identity, and replay idempotency;
- ambiguous/unverified identity produces candidates/exceptions, not Party
  selection or merge;
- effective time is distinct from observed time;
- declared freshness, privacy, retention, redaction, and output-size rules;
- unknown fact/version and undeclared projection target fail closed;
- complete/partial pagination, cursor advance/freeze, timeout, retry,
  quarantine, recovery, and circuit isolation;
- existing adapter fixtures and core query/receipt tests remain byte- or
  semantic-equivalent where the new source is not requested;
- disabling/removing the adapter leaves core and every other source healthy.

One fixture-only reference adapter should be built before any real new tool.
Its purpose is to prove that a source can be added without edits to the core
resolver, storage envelope, query API, policy engine, or existing adapters.

#### 5.4.8 Example: adding a future LMS

Suppose Tandem adopts `Example LMS`. The bounded onboarding is:

1. register `example_lms` with account/workspace scope and opaque host
   credential handle;
2. map exact LMS user, course, and enrollment IDs to scoped external
   references;
3. emit a verified email only as an identity candidate; the core resolver binds
   or quarantines it;
4. normalize provider records into existing versioned learning enrollment,
   progress, and completion facts;
5. declare provider-specific freshness and snapshot completeness rules;
6. map those facts into the existing `learning` projection without changing
   relationship, payment, consent, or open-work projections;
7. allow only named purposes/groups to receive the new learning fields;
8. pass conformance, shadow parity, rollback, and natural-case gates before
   activation.

Expected code/config surface: one adapter, one manifest/config schema, fact
catalog entries only where semantics are new, learning-projection mappings,
fixtures/tests, and a runbook. No Party schema change, core-query change,
existing-adapter edit, broad minion prompt rewrite, or provider write is
required.

A coaching-client-management tool follows the same path with exact client,
engagement, sponsor, assigned-coach, and session references. It may propose
relationship/engagement facts only under their catalog authority rules; it may
not declare someone a client, relationship owner, or assigned coach merely
because the provider calls a record `client` or exposes a default account
owner.

## 6. Capability-scoped query contract

### 6.1 Request

The host capability is `party_context_get`. The model-visible request contains:

```json
{
  "schema_version": 1,
  "request_id": "host-minted-uuid",
  "actor_group": "sales",
  "purpose": "answer_appointment_inquiry",
  "work_item_id": "host-bound-work-id",
  "subject": {
    "party_id": null,
    "source_ref": { "provider": "gmail", "scope": "primary", "id": "opaque" },
    "email_candidate": "host-supplied-current-sender"
  },
  "sections": ["relationship", "appointments", "communications", "open_work"],
  "as_of": "host-time",
  "max_age_seconds": { "appointments": 900 }
}
```

`actor_group`, purpose, work item, exact source resource, and subject candidates
are host-bound. A minion may request fewer sections; it may not alter those
bindings or ask for unrestricted history.

### 6.2 Response

Top-level resolution is one of:

`resolved | ambiguous | not_found | needs_identity | denied | unavailable`

Each requested section is one of:

`current | stale | partial | conflicting | unknown | denied | unavailable`

The response includes only allowed typed projections, fact envelopes needed to
explain them, missing/conflict codes, an `as_of`, and a receipt ID. It never
includes credentials, raw provider payloads, unrestricted message bodies,
secret callback paths, payment instruments, or unrelated people.

### 6.3 Capability matrix

The initial release should be deny-by-default. Candidate scopes for owner
acceptance:

| Group            | Allowed purposes/sections                                                                                        | Withheld by default                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Sales            | relationship, appointments, commercial summary, communication references, consent/suppression, open sales work   | raw Stripe detail, raw learning submissions, broad Gmail bodies, Chaos journey |
| Booking          | identity, appointment detail/history, relevant relationship label, open booking work                             | commercial detail, learning, broad communications                              |
| Inbox            | identity candidates, pre-inbound relationship evidence, communication reference, open intake work                | post-inquiry enrichment, raw commercial/learning history                       |
| Contador         | payer/student/sponsor identity links, exact commercial receipts, fulfillment-relevant learning/access references | broad communications and browsing                                              |
| Certifier/Grader | exact enrollment plus grading/feedback/certificate prerequisites                                                 | sales, payment detail beyond gate state, unrelated communications              |
| Chief            | exception-scoped pack for a named case                                                                           | broad person search or unrestricted provider history                           |

Every row becomes host policy and negative tests. Prompt text alone is not the
boundary.

### 6.4 Query receipt

Store a content-minimized receipt with request UUID, actor group, purpose,
host-bound work/case ID, Party ID or unresolved candidate fingerprint,
requested/returned section names, projection versions, source watermarks,
policy decision, result/status codes, response hash, started/completed times,
and error code. Do not store returned values or raw request identifiers merely
to prove that a query occurred.

## 7. Plutio operator projection

### 7.1 Projection content

Plutio should show a concise current snapshot, not a replica of Company OS:

- immutable Company OS Party reference and last reconciled time;
- evidence-bounded relationship category;
- current program/product/enrollment summary where exact;
- next appointment and status;
- payment/proposal/invoice gate summary without sensitive details;
- learning/access/completion summary by exact enrollment;
- last external contact and response obligation;
- current open-work owner/status;
- explicit stale/conflict/unknown indicator.

Meaningful source events may append a short idempotent Activity Log entry. Raw
email bodies, browsing journeys, provider payloads, grading content, payment
details, and conflict evidence do not belong in Plutio.

### 7.2 Discovery and mapping gate

Before any write, refresh the live Plutio person custom-field definitions and
record stable field IDs, types, allowed values, and readback behavior. Decide
whether to reuse existing empty fields or create a clearly prefixed Company OS
group. The current environment failure blocks this discovery but does not
block the design.

No implementation may hardcode an ID from an old migration note. Field
creation or modification is a separately authorized provider change.

### 7.3 Sync and reconciliation

Use a versioned projection hash and one outbox obligation per
`(party_id, projection_version)`. The worker:

1. requires one unambiguous active `plutio_refs` person reference;
2. reads the current provider projection fields;
3. compares provider values, last receipted values, and new projection;
4. holds operator edits or unknown drift as a conflict instead of overwriting;
5. writes only changed task-owned fields/activity entries;
6. reads back exact values;
7. records attempted, accepted, reconciled, conflict, and uncertain outcomes
   separately.

An uncertain provider response blocks retry until reconciliation.

### 7.4 Population/backfill

Backfill is a separate C3 provider-write item. Its dry-run manifest must name
the exact Party set, Plutio references, projection versions/hashes, proposed
field changes, skipped ambiguous/unlinked/conflicting Parties, expected write
counts, rollback snapshot, rate limits, and operator review sample.

Start with a small exact cohort of already linked, unambiguous active
relationships. Do not use all Plutio people, all Company OS parties, or the
historical 336-contact Heffl migration segment as an implicit scope. Expand
only after readback, drift, and operator usefulness evidence.

Rollback disables new writes and restores only task-owned projection fields
from the protected pre-write snapshot. It never deletes native Plutio identity,
invoice, proposal, contract, time, conversation, or operator-authored data.

## 8. Privacy, retention, and conflict rules

- Purpose limitation is enforced at the host capability, not delegated to the
  minion.
- Store provider IDs as opaque strings and restrict reversible identifiers.
  Query receipts use fingerprints when the Party is unresolved.
- Raw Gmail bodies remain in Gmail; context keeps exact references and minimum
  summaries. Raw webhook payload retention follows its source subsystem.
- Commercial context exposes states and receipt references, not payment
  instruments, bank data, or unnecessary amounts.
- Learning context exposes enrollment/state needed for the purpose, not
  submissions or feedback content.
- Chaos history is excluded from default packs.
- Identity candidates and restricted staging identifiers should expire after
  seven days unless attached to an active exception. Durable source references
  and accepted decisions follow the Party/relationship record policy.
- Query receipts should retain 90 days initially; projection and action
  receipts follow the governing business-record policy. Exact periods require
  owner acceptance before implementation.
- Provider deletions and subject-access requests must be able to identify
  Company OS projections and restricted identifiers without deleting factual
  transaction/audit receipts that have a separate lawful retention basis.

Conflict handling is fail-closed:

- multiple Parties for an identifier -> `ambiguous`, no automatic selection;
- one external reference claimed by two Parties -> identity exception;
- source and projection disagree -> source-specific conflict, no overwrite;
- two native authorities cover different meanings -> keep both dimensions;
- stale source -> return stale state and refresh requirement;
- unavailable source -> return last verified fact with age when policy allows,
  otherwise `unavailable`;
- unsupported inference -> `unknown`, not the most likely value.

### 8.1 Local dark implementation checkpoint (`NC-20260825-003`)

The isolated branch `codex/relationship-context-dark-foundation-20260825`
implements the first dark source boundary from exact lineage `683d61208e1c`:

- ordered migration/rollback 137 with eight admin-only authorities, bounded
  JSON, idempotent/conflict-refusing legacy source-ref backfill, merge lineage,
  append-safe evidence, and guarded rollback;
- typed manifest/fact/adapter contracts, in-memory/PostgreSQL repositories, and
  a fixture-only no-network/no-credential LMS adapter;
- fail-closed version/privacy/identity/source-scope registration and ingest,
  with a 256-KiB batch envelope and 8-KiB persisted-value bounds;
- exact scoped-ref then verified-claim identity resolution; ambiguous or absent
  identity creates a minimized exception and never selects the first email row;
- deterministic observation replay, versioned projections, freshness/conflict
  status, purpose-filtered context packs, and minimized query receipts with a
  one-way pending-to-delivered/failed transport status;
- a pure dry-run Plutio planner with no provider tool or execute method;
- `party_context_get` stamped with directory group plus host run/container
  identity, with no model-writable work ID, and denied unless one exact
  host-resolved grant is consumed;
- `RELATIONSHIP_CONTEXT_ENABLED=0` by default and no group/minion grant.

Disposable PostgreSQL verifies schema apply, compatibility backfill/replay and
conflict refusal, JSON bounds, merge lineage across all current/evidence
tables, zero non-admin grants, real store/query behavior, populated rollback
refusal, and empty rollback. This is local source evidence only. Real provider
adapters, production migration, Booking migration, Plutio fields/backfill,
minion activation, deployment, live verification, and natural outcomes retain
their separate gates below.

## 9. Implementation sequence and gates

| Slice | Deliverable                                                                                                                                                                                                                                                     | Gate and boundary                                                                                                                              |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | accepted fact catalog, source-authority/freshness matrix, minion capability matrix, retention decision                                                                                                                                                          | owner accepts design choices; no runtime/provider action                                                                                       |
| B     | reversible schema for source refs, identifier claims/exceptions, observations/projections, context-query receipts, and Plutio projection receipts; extend `fn_merge_parties` and merged-party write guards; backfill and deprecate the legacy Party source pair | migration reviewed and proven in disposable PostgreSQL, including merge/conflict/rollback tests; no production migration                       |
| B2    | provider-neutral adapter interface, tracked manifest registry, fact-catalog extension API, fake reference adapter, and shared conformance harness                                                                                                               | core resolver/envelope/query/policy and all existing adapters remain unchanged; default off; no real credential or provider access             |
| C     | identity resolver and read-only context service over database-only evidence; inventory every current email-first caller and produce a dry-run divergence report against `resolve_parties_by_email`                                                              | default off; no provider clients or minion capability; no write-path change                                                                    |
| D     | read-only Trafft, Gmail, Stripe/Plutio, Heartbeat/lifecycle, consent/Encharge, and Chaos adapters with exact scopes; populate exact scoped source references in shadow                                                                                          | each adapter separately authorized, timeout/budgeted, and negative-tested                                                                      |
| D2    | migrate Booking identity resolution from email-first selection to exact Trafft customer reference, with unique verified email fallback and an identity-exception hold for ambiguity; reconcile affected historical bookings                                     | separate host behavior/schema authority; staged shadow comparison first; no context capability activation while divergence remains unexplained |
| E     | deterministic projections and reconciliation workers                                                                                                                                                                                                            | shadow only; no provider writes or customer actions                                                                                            |
| F     | `party_context_get` IPC/host capability and deny-by-default group policy                                                                                                                                                                                        | exact-turn/work binding and content-minimized receipts; sanitized canaries                                                                     |
| G     | Plutio field discovery, mapping, dry-run projector, drift/readback tests                                                                                                                                                                                        | no provider write until exact field/backfill authorization                                                                                     |
| H     | small Plutio population cohort and reconciliation                                                                                                                                                                                                               | separate C3 authority, backup, readback, rollback, operator usefulness review                                                                  |
| I     | minion shadow evaluation and one-by-one read-only activation                                                                                                                                                                                                    | separate prompt/runtime release and natural-case proof                                                                                         |
| J     | any action that consumes context for send/write/closure                                                                                                                                                                                                         | separate action authority; context never grants the action                                                                                     |

Implementation should use an isolated clean worktree based on the intended
live lineage. The shared primary checkout contains extensive unrelated work and
does not include the exact live lifecycle source in HEAD.

Exact live NC-20260826-003 is the first bounded D2 implementation. It changes
future Booking resolution only when an exact Trafft customer ref already
exists; otherwise the historical fallback remains. It seeds refs solely from
the unique post-registration Trafft-created cohort, quarantines ambiguity and
Party disagreement, and appends exact observations without erasing held
history. Its host-only canary proves a single minimized appointments read, not
a group/minion rollout or downstream action authority. Live startup bound 2
customers/4 appointments and created 4 current projections while retaining 418
current-row holds; replay was 422/422 duplicates with zero conflicts. Canary
receipt 1 delivered, while global query, group/minion consumers, and every
downstream action remain off.

## 10. Verification plan

### Identity and temporal truth

- exact provider reference resolves one Party;
- shared/reused/unverified email returns ambiguity rather than first-row win;
- email change preserves provider identity and historical claim intervals;
- merge/split and tombstone lineage keep source references accountable;
- payer, sponsor, student, coach, buyer, and organization contacts remain
  distinct Parties with explicit relationships;
- the current inbound cannot manufacture pre-existing relationship evidence.

### Source and projection

- appointment booked/cancelled/rescheduled/no-show plus webhook-only form fields;
- Trafft sweep and webhook duplicate converge on one fact;
- Gmail latest-message/thread/visible-recipient reference and unavailable body;
- Stripe paid/refunded/disputed and Plutio invoice disagreement;
- Heartbeat access/progress/completion plus stale/incomplete snapshot;
- Encharge unavailable/conflicting consent and suppression;
- Chaos attribution never alters relationship or commercial projection;
- provider outage, partial pagination, timeout, malformed response, and stale
  cache all produce explicit non-success states.

### Adapter extensibility

- a fixture-only source registers through the manifest and contributes facts
  without edits to Party identity, the observation envelope, query/receipt
  contracts, policy evaluation, or existing adapters;
- duplicate/unknown manifests, undeclared fact/reference types, breaking schema
  versions, unsupported privacy classes, and missing conformance proof fail
  closed;
- adapter identity output remains candidate evidence and can never select or
  merge a Party;
- a new fact remains inert until separately cataloged, projected, and allowed
  for a named capability purpose;
- one adapter's failure changes only its own facts/sections to stale,
  unavailable, partial, or quarantined;
- old/new version shadowing, cursor ownership/handoff, replay migration,
  deprecation, disable, and rollback preserve all other sources;
- a reference LMS adapter passes the shared suite with no credentials, network,
  provider record, schema migration, or core contract edit.

### Capability and privacy

- every disallowed group/purpose/section combination is rejected host-side;
- one task/turn cannot replay another task's context receipt;
- packs exclude credentials, callback paths, raw payloads, unrelated Parties,
  broad message bodies, payment instruments, submissions, and browsing history;
- logs and receipts remain content-minimized under adversarial values;
- output size, source-call count, latency, and maximum-age budgets are bounded.

### Plutio

- dry run is deterministic and idempotent by projection version/hash;
- provider drift and operator edits hold rather than overwrite;
- successful write requires exact field readback;
- uncertain acceptance is reconciled before retry;
- backfill resume does not duplicate notes or rewrite unchanged fields;
- rollback touches only task-owned projection fields.

### Evaluation and release

Build a PII-free evaluation set from real failure classes: appointment lookup,
returning student, payer/sponsor mismatch, shared email, stale learning state,
refund conflict, explicit suppression, and no prior relationship. Run the same
cases with current context and the proposed context pack, blind the reviewer to
the source, and score factual completeness, unsupported inference, required
abstention, privacy leakage, and latency. Synthetic contract fixtures prove
mechanics; natural business cases are required for an outcome claim.

Release evidence must separately record schema, local tests, review, commit,
artifact, production migration, deployment, capability enablement, provider
write, live readback, and natural-case outcome. None implies the next.

## 11. Rollout and rollback

1. Accept the design decisions below.
2. Implement and test schema/service dark in an isolated worktree.
3. Implement the manifest registry, conformance harness, and fixture-only
   reference adapter; prove no core or existing-adapter change is required.
4. Deploy disabled and verify health plus zero new provider/context activity.
5. Enable read-only adapters and projections in shadow; no minion output change.
6. Compare the proposed resolver against every current email-first caller;
   record and resolve the build-window ambiguity backlog.
7. Separately migrate and live-verify Booking's exact-reference/ambiguous-hold
   path before treating Relationship Context as authoritative for Booking.
8. Compare context packs against exact source reads and operator judgments.
9. Enable the context capability for one group/purpose with no action change.
10. Separately authorize Plutio field setup and a small backfill.
11. Expand sections/groups only after natural evidence and conflict review.

Rollback at any stage disables adapters/capabilities/projectors, preserves
immutable observations/query/action receipts, freezes unresolved work, and
returns minions to the prior fail-closed behavior. Provider rollback uses the
protected pre-write snapshot and never retries uncertain writes blindly.

## 12. Owner decisions before build

1. Accept `business_v2.parties.id` as the internal canonical key while exact
   provider identities remain native authority.
2. Accept or revise the initial freshness table.
3. Accept the initial minion capability matrix.
4. Choose the Plutio operator field set after live field discovery and decide
   whether Company OS fields are visibly prefixed/grouped.
5. Select the first exact Plutio population cohort; no default bulk scope is
   proposed.
6. Accept or revise seven-day identity staging and 90-day query-receipt
   retention, with longer domain-record periods defined separately.
7. Decide whether Heffl remains an unrelated Bizmgr migration target or should
   later receive its own projection. This design does not make Heffl an
   authority or write target.
8. Accept or revise the requirement that the Relationship Context capability
   cannot become authoritative for Booking until the legacy email-first path
   is replaced by exact Trafft references plus an ambiguity hold and its
   build-window backlog is reconciled. The recommended safe default is to keep
   current production behavior unchanged during design/dark work, measure its
   divergence, then perform D2 as a separately authorized behavior release.
9. Accept the initial extension model as a tracked, code-reviewed adapter
   registry with stable manifests and conformance tests. The recommended safe
   default excludes runtime download/execution of arbitrary third-party plugin
   code; that would be a separate security/architecture decision.

## 13. Evidence index

Current checkout authority:

- `src/identity-join.ts`
- `src/booking-host-write.ts`
- `src/trafft-sweeper.ts`
- `src/trafft-custom-fields.ts`
- `src/plutio-outbox-reaper.ts`
- `src/lead-matcher.ts`, `src/lead-email-resolver.ts`, and
  `src/email-interaction-log.ts`
- `src/chaos-activity.ts`, `src/chaos-booking.ts`, and
  `src/chaos-reconciler.ts`
- `data/business/migrations/nanoclaw-v2/03_parties.sql`, `04_roles.sql`,
  `05_engagements.sql`, `06_programs.sql`, `08_interactions.sql`,
  `10_outbox.sql`, `11_helpers.sql`, `13_views.sql`, `16_cutover_helpers.sql`,
  and `95_fn_create_party_outbox_enqueue.sql`
- `groups/inbox/CLAUDE.md`, `groups/sales/WORKFLOWS.md`, and
  `groups/booking/CLAUDE.md`

Exact live-lineage evidence:

- Git commit `8e475e036ad6`, especially migration 134 and
  `src/student-lifecycle*.ts`
- `docs/STUDENT-LIFECYCLE-CONTROL-PLANE.md`
- `docs/programs/company-os/evidence/NC-20260824-010-student-lifecycle-relay-correction.md`

Historical/supporting evidence:

- `handoffs/2026-08-25-1226-relationship-context-control-plane.md`
- `/Users/xbohdpukc/dev/bizmgr/agent_docs/heffl-contact-migration.md`

The handoff and Bizmgr note support the gap analysis and prior counts. They do
not override current code, provider state, accepted decisions, or future live
readback.
