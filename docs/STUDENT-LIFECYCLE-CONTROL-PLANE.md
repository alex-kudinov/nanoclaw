# Student Lifecycle Control Plane

Status: owner-reviewable design; no implementation or external mutation
Task: `NC-20260824-003`
Program item: `work:student-lifecycle-control-plane-design`
Date: 2026-08-24
Owner: Company OS / NanoClaw host

## 1. Decision summary

The student-lifecycle control plane is a deterministic host capability, not an
LLM workflow and not an Encharge flow. Its target path is:

`Heartbeat -> n8n -> NanoClaw ingress -> normalized facts -> reconciled student-course projection -> separately governed consumers`

The design makes six decisions:

1. Heartbeat remains authoritative for community membership, course access,
   progress, and completion. A webhook is a delivery hint until the fact is
   reconciled where the API exposes a current-state read.
2. n8n remains the public ingress perimeter. NanoClaw accepts only an
   authenticated, versioned, content-minimized relay over the private path.
3. The NanoClaw host performs validation, identity resolution, idempotency,
   state transitions, retries, replay, retention, observability, and every
   write. No minion participates in the webhook or snapshot path.
4. The projection is multi-axis. Access, activation, learning, grading,
   certificate, finance, consent, and suppression are not collapsed into one
   misleading linear status.
5. Progress is reconciled from catalog-scoped Heartbeat cohort snapshots.
   Heartbeat's public webhook API does not expose lesson-completion or progress
   events, even though Heartbeat-native Workflows have a lesson-completed
   trigger.
6. This control plane emits facts and exceptions only. Lifecycle actions,
   Encharge flows, emails, Slack messages, certificate issuance, and the
   proposed exception minion remain separate design/build/authorization items.

## 2. Authority and boundary

This document implements the accepted transfer contract in
`docs/programs/company-os/evidence/NC-20260824-002-student-lifecycle-transfer.md`.
It is subordinate to `PROGRAM.md`, accepted decisions, and current program
state.

Authorized here:

- read-only provider and repository inventory;
- the normalized event, state, security, privacy, reconciliation, migration,
  rollout, rollback, and verification design;
- exact proposed implementation slices and their gates.

Not authorized here:

- source code, migration, group prompt, or runtime changes;
- n8n import, activation, or credential changes;
- Heartbeat webhook create/delete/update;
- Encharge flow, event, person, consent, or suppression changes;
- email, Slack, notification, certificate, or other external action;
- deployment, restart, backfill, replay, or production database write.

## 3. Verified current topology

### 3.1 Heartbeat webhook surface

The supported business-toolbox read path was run from the business-operations
registry on 2026-08-24. It returned 18 registrations in the main community and
zero in the circle workspace. Opaque callback paths and registration IDs are
deliberately omitted from this document.

| Destination family | Registrations | Current purpose |
| --- | ---: | --- |
| WordPress `/tandem/v1/heartbeat-webhook` | 4 | two duplicate `USER_JOIN`, one unfiltered `GROUP_JOIN`, one unfiltered `COURSE_COMPLETED` |
| n8n community route | 8 | four channel-filtered `THREAD_CREATE` and four admin-filtered `DIRECT_MESSAGE`, transformed to Slack |
| Pabbly | 5 | three channel-filtered `THREAD_CREATE`, one `USER_JOIN`, one `EVENT_RSVP` |
| n8n journey route | 1 | group-filtered `ABANDONED_CART` |

The live registry therefore has duplicate first-login delivery, multiple
receiver families, and no single lifecycle intake. The n8n community route is
conversation routing, not student lifecycle. The journey route's live n8n
definition could not be inspected in this task: the available n8n browser was
not authenticated and the authenticated external browser was unavailable for
automation. That unknown is a cutover gate, not evidence that the workflow is
absent or correct.

### 3.2 Official Heartbeat event contract

The current official references are the
[webhook action reference](https://heartbeat.readme.io/reference/webhooks),
[API reference](https://heartbeat.readme.io/reference/authorization), and
[Heartbeat Workflows overview](https://help.heartbeat.chat/hc/en-us/articles/33257708447505-Workflows-Overview).
The public webhook API documents 11 actions:

| Action | Documented filter | Documented payload identity | Lifecycle treatment |
| --- | --- | --- | --- |
| `USER_JOIN` | none | user ID, name, email | activation observation; resolve identity, discard name/email from transport receipt |
| `USER_UPDATE` | none | user ID | reconciliation request only; fetch current user/membership state |
| `EVENT_CREATE` | none | event ID | catalog refresh request; no student transition |
| `EVENT_RSVP` | optional user type/event ID | event ID, user ID or guest email | supplementary participation fact; never attendance or course progress |
| `THREAD_CREATE` | channel ID | thread ID, channel ID | non-lifecycle; retain existing community route |
| `MENTION` | required user/group selection; optional channels | source thread/comment and mentions | non-lifecycle |
| `DIRECT_MESSAGE` | required admin user ID | sender, receiver, chat, message IDs | non-lifecycle; never store message content in lifecycle data |
| `COURSE_COMPLETED` | course ID | course ID/name and user ID | completion observation; reconcile course/user/catalog before projection |
| `GROUP_JOIN` | group ID | user ID and group ID | access/membership observation; not product, payment, or activation proof |
| `ABANDONED_CART` | optional invitation link and/or groups | email, invitation ID, groups | eligibility hint only; suppress on payment/access/consent conflicts |
| `DOCUMENT_CREATE` | none | document ID | non-lifecycle |

There is no public `LESSON_COMPLETED` webhook action. Heartbeat-native
Workflows expose a lesson-completed trigger, but that provider-owned automation
surface is not equivalent to an external durable event feed. Start, progress,
milestones, stall, and resume therefore require snapshot reconciliation.

### 3.3 Course and group scale

The supported read-only toolbox reported:

| Workspace | Courses | Cohorts | Lessons | Access groups | Webhooks |
| --- | ---: | ---: | ---: | ---: | ---: |
| Main community | 58 | 82 | 2,766 | 142 | 18 |
| Circle | 3 | 3 | 60 | 3 | 0 |

The website checkout catalog is schema version 1.2 dated 2026-08-16. It has 47
products, 37 active products, and every active product has at least one
Heartbeat group mapping. Fifteen group IDs are shared by two or more products.
Consequently, a group join can prove access to a group but cannot reliably
reverse-map to an exact paid offer, path, or cohort.

### 3.4 Existing WordPress receiver

The public WordPress REST index confirms the heartbeat route exists and accepts
POST. Current local source handles `USER_JOIN`, `GROUP_JOIN`, and
`COURSE_COMPLETED`, rate-limits by IP, and performs downstream Encharge or Chaos
writes.

Material current-state findings:

- the receiver has no provider signature or shared-header authentication;
- two live `USER_JOIN` registrations target it;
- the documented `GROUP_JOIN` payload contains user ID and group ID, while the
  handler requires an email and returns without work when email is absent;
- course completion now resolves the user by Heartbeat ID and records a stable
  measurement event, but it is still a WordPress-side measurement path rather
  than the Company OS lifecycle projection;
- provider acceptance or route existence does not prove that every event was
  handled or that the downstream provider outcome occurred.

### 3.5 Existing n8n evidence

`setup/n8n/heartbeat-community-workflow.json` describes an active-at-export
workflow with a POST webhook, deterministic transform, and Slack POST. It does
not forward events into NanoClaw or build student state. Export metadata is not
live workflow proof.

Repository inspection also found n8n workflow templates containing inline
credential literals. No value is reproduced here. The lifecycle workflow must
use n8n credentials or runtime environment references only. Existing exposed
credential material requires a separate, authorized remediation and rotation
decision before reuse or release.

### 3.6 Existing NanoClaw substrate

The live NanoClaw health endpoint reported a verified release at commit
`778545b353b22d63329d906505546a45ffb6a04a`, built with Node 22.23.2. The live
source has eight configured generic webhook IDs and no student-lifecycle
receiver or Heartbeat event-key extractor.

Reusable mechanics:

- `/hook/:id` checks a per-webhook or global relay secret;
- `business_v2.webhook_inbox` archives before asynchronous dispatch;
- `(source, event_id)` enforces perimeter idempotency when an extractor returns
  a stable key;
- secret-bearing headers are removed before archive;
- failed/stale rows are retried and eventually dead-lettered;
- mechanical Chaos and Stripe handlers bypass agents during replay.

Required changes for a future build:

- lifecycle must be another deterministic mechanical handler and reaper path,
  never generic minion dispatch;
- current static-secret relay authentication must be upgraded or wrapped with
  a signed timestamp/body contract;
- lifecycle payloads must be minimized before `raw_body` is archived;
- current generic statuses do not distinguish normalized, reconciled,
  projected, quarantined, and exception-owned lifecycle stages;
- live database shape and aggregate row health were not refreshed because the
  supported remote database path was unavailable from this task. The tracked
  structure-only schema and live release identity are evidence, not a live row
  audit.

## 4. Target architecture

```text
Heartbeat webhook                     Heartbeat snapshot collector
        |                                        |
        v                                        v
n8n public endpoint                    supported read-only toolbox/API
  - accept fast                                  |
  - add relay timestamp                          |
  - preserve action/filter                       |
  - sign exact body                              |
        |                                        |
        +-------------------+--------------------+
                            v
                 NanoClaw deterministic intake
                  - relay authentication
                  - schema/action allowlist
                  - minimize before archive
                  - identity/catalog resolution
                  - provider reconciliation status
                            |
             +--------------+----------------+
             v                               v
       normalized facts               durable exceptions
             |
             v
      projection transaction
       - compare-and-swap version
       - append transition history
       - no action side effects
             |
             v
  read-only lifecycle views / later separately governed consumers
```

The receiver acknowledges only after the minimized transport receipt is
durable. Projection may happen synchronously after archive or through the
reaper, but an acknowledgment never means that identity, reconciliation,
projection, provider delivery, or business outcome succeeded.

## 5. Trust and authenticity contract

### 5.1 Heartbeat to n8n

Heartbeat's documented webhook contract provides neither a signature nor
custom authentication headers. The public callback is therefore a capability
URL, not cryptographic proof of origin.

Required controls:

- TLS, an unguessable route stored only in the provider/runtime credential
  surfaces, Cloudflare/n8n rate limits, strict POST/content-type/body limits,
  and an action allowlist;
- a daily read-only registration inventory comparing action/filter/destination
  fingerprints to an accepted manifest;
- no sensitive or consequential state transition solely from callback
  possession;
- provider reconciliation for user, membership, course, and progress facts
  where Heartbeat exposes a read surface;
- explicit `source_asserted_unreconciled` state where the provider exposes no
  current-state proof.

### 5.2 n8n to NanoClaw

The target relay contract is:

- private/Tailscale destination;
- `X-Lifecycle-Schema-Version`;
- `X-Webhook-Timestamp` in UTC epoch seconds;
- `X-Webhook-Signature: v1=<HMAC-SHA256(secret, timestamp + '.' + exact_body)>`;
- five-minute skew window;
- constant-time signature comparison;
- replay key from signature, timestamp, and payload hash;
- secret stored in n8n credentials/runtime environment and NanoClaw `.env`,
  never in a tracked workflow export.

The existing `X-Webhook-Secret` mechanism may coexist only during a bounded
compatibility canary. It is not the final lifecycle authenticity contract.

### 5.3 Host and minion boundary

The host owns all parsing, API reads, database writes, policy, and receipts.
The future exception minion receives only an already-created, privacy-minimal
case and has no access to raw webhooks, credentials, Heartbeat, Encharge,
Gmail, database writes, or external actions.

## 6. Canonical normalized event

The host creates this envelope after validation and identity/catalog
resolution. It never persists raw name or email in the lifecycle event.

```json
{
  "schema_version": 1,
  "event_id": "host-uuid",
  "event_name": "course_completed",
  "source_system": "heartbeat",
  "source_action": "COURSE_COMPLETED",
  "source_event_key": "hb:v1:<community>:completion:<course>:<user>",
  "source_occurred_at": null,
  "received_at": "ISO-8601 UTC",
  "observed_at": "ISO-8601 UTC",
  "party_id": 123,
  "heartbeat": {
    "community_id": "uuid",
    "user_id": "uuid",
    "group_id": null,
    "course_id": "uuid",
    "cohort_id": null,
    "lesson_id": null,
    "invitation_id": null
  },
  "mapping": {
    "catalog_revision": 1,
    "offer_id": null,
    "program_id": null,
    "mapping_status": "course_known_offer_ambiguous"
  },
  "authenticity": {
    "relay": "hmac_verified",
    "provider": "provider_reconciled"
  },
  "facts": {},
  "origin": {
    "webhook_inbox_id": 456,
    "reconciliation_run_id": null
  }
}
```

Rules:

- `source_occurred_at` remains null when Heartbeat did not provide it. Never
  substitute receipt time as occurrence time.
- an unresolved or ambiguous party, course, cohort, or offer is recorded as an
  exception; it is never guessed;
- event properties use a per-event allowlist and bounded values;
- source IDs are opaque identifiers, not public links;
- the event name describes a fact, not an action recommendation.

## 7. Source-event identity and treatment

| Source action | Proposed stable key | Projection rule |
| --- | --- | --- |
| `USER_JOIN` | community + user | first activation observation; duplicate callbacks collapse |
| `USER_UPDATE` | unique transport receipt, then stable state-diff keys | callback only requests reconciliation; no direct transition |
| `GROUP_JOIN` | community + group + user | membership-present observation; a later absent->present snapshot opens a new membership episode |
| `COURSE_COMPLETED` | community + course + user | one completion fact per course enrollment unless an explicit reset episode exists |
| `ABANDONED_CART` | invitation/groups + HMAC identity + canonical-payload hash + bounded delivery window | eligibility hint; never marketing consent, non-payment, or non-access proof |
| `EVENT_RSVP` | event + user; guest uses HMAC email | supplementary RSVP only; never attendance |
| `EVENT_CREATE` | event | refresh catalog; no learner state |
| `THREAD_CREATE` | channel + thread | non-lifecycle |
| `MENTION` | source object + selection hash | non-lifecycle |
| `DIRECT_MESSAGE` | chat + message | non-lifecycle; no message body retained |
| `DOCUMENT_CREATE` | document | non-lifecycle |

For sources without a provider event ID, the original transport receipt is
retained even when a domain fact deduplicates. This preserves delivery evidence
without applying a state transition twice.

## 8. Identity and catalog contract

### 8.1 Person identity

The canonical internal key is `business_v2.parties.id`. Heartbeat identity is
scoped by `(community_id, user_id)` and stored as an external reference.

Resolution order:

1. exact existing Heartbeat external reference;
2. exact verified normalized email against `party_emails`;
3. one unique unverified email match, recorded as provisional;
4. otherwise create an identity exception. Do not merge or create a party from
   an ambiguous callback.

Email is a join input, not an event ID. ABANDONED_CART email uses a keyed HMAC
for transport dedupe and is discarded after scoped identity resolution. The
identity-fingerprint HMAC uses a stable host-only secret distinct from the n8n
relay-signature secret, so relay rotation cannot change durable pseudonyms.

### 8.2 Offer, course, cohort, and group mapping

A new versioned lifecycle catalog is required with:

- catalog revision and SHA-256;
- workspace/community, group, course, cohort, lesson/milestone identifiers;
- stable offer/product/program IDs and language;
- active interval and lifecycle-enabled flag;
- source authority and verification receipt;
- whether the mapping proves access family, exact offer, exact cohort, or only
  course identity;
- progress milestone and stall-policy version.

The catalog must not be inferred by reversing the website's group mapping.
Shared groups prove only the explicitly recorded scope. Payment/entitlement
receipts select paid offer and cohort; course completion alone cannot.

## 9. Durable data model

The future build should use ordered `business_v2` migrations and the existing
host role/function pattern.

### 9.1 Reused table: `webhook_inbox`

Use one source ID, `student-lifecycle`, with a stable transport event key.
Archive only the minimized allowlisted envelope plus payload hash. Link the row
to the normalized event in `related_entity`.

### 9.2 `student_lifecycle_events`

Append-only normalized facts:

- event UUID, schema version, event name;
- source system/action/event key and unique constraint;
- received/observed/source-occurrence timestamps;
- inbox and reconciliation-run references;
- party and Heartbeat scoped IDs;
- catalog revision, offer/program mapping, mapping status;
- authenticity/reconciliation status;
- bounded allowlisted facts;
- processing status: `normalized`, `reconciled`, `applied`, `quarantined`, or
  `superseded`;
- content hash, created timestamp, and writer identity.

No update may rewrite the original fact. Corrections append a superseding fact.

### 9.3 `student_lifecycle_enrollments`

One current projection per enrollment episode:

- internal enrollment UUID and monotonically increasing version;
- party, workspace, user, group, course, cohort;
- catalog revision, offer, program, language;
- start/end dates and source-specific enrollment references;
- independent state axes from section 10;
- last source event, last provider reconciliation, and freshness;
- missing/conflicting facts and exception count;
- created/updated timestamps and writer.

Unique identity is the accepted enrollment episode, not merely
`party + course`. A removal/rejoin or provider reset must open a new episode
through an explicit reconciled transition.

### 9.4 `student_lifecycle_state_history`

Append-only projection changes:

- enrollment/version;
- axis, previous value, new value;
- effective and recorded timestamps;
- event or reconciliation-run evidence;
- policy/catalog version;
- deterministic reason code and writer.

### 9.5 `student_lifecycle_reconciliation_runs`

One receipt per catalog, registry, membership, or cohort-progress scan:

- run ID/type/scope and catalog revision;
- watermark/window and started/completed timestamps;
- pages/scopes expected and observed;
- facts new/unchanged/conflicting/quarantined;
- source snapshot hash;
- terminal status/error code and next retry.

### 9.6 `student_lifecycle_exceptions`

Durable, owner-visible problems:

- stable fingerprint and affected enrollment/event/run;
- reason code, severity, first/last seen, occurrence count;
- privacy-minimal evidence references;
- owner, status, due/review time;
- verified resolution, named no-action, or accepted decision receipt.

No exception is closed by a Slack post, log line, or minion suggestion alone.

## 10. Projection state model

The current row carries independent axes:

| Axis | Values | Authority |
| --- | --- | --- |
| access | `unknown`, `pending`, `provisioned`, `failed`, `revoked` | provisioner receipt + Heartbeat group/membership |
| activation | `unknown`, `invited`, `activated` | invitation delivery receipt + Heartbeat user/join |
| learning | `not_started`, `started`, `progressing`, `stalled`, `resumed`, `completed`, `completion_unclassified` | Heartbeat snapshot/completion + versioned policy |
| grading | `not_applicable`, `unknown`, `in_progress`, `retry_required`, `approved` | Heartbeat submission/grading authority |
| feedback | `not_applicable`, `missing`, `submitted` | Heartbeat course-feedback authority |
| certificate | `not_applicable`, `blocked`, `ready`, `issued`, `failed` | joined grading/feedback gate + Sertifier receipt |
| finance | `unknown`, `not_required`, `pending`, `paid`, `refunded`, `disputed` | Contador/Stripe payment fulfillment authority |
| marketing consent | `unknown`, `opted_in`, `opted_out` | consent ledger/Encharge readback |
| contact suppression | `none`, `marketing`, `all_nonrequired` | party no-followup and applicable provider suppressions |

Transition rules:

- `GROUP_JOIN` can move access to `provisioned`; it cannot move finance,
  activation, or learning.
- `USER_JOIN` can move activation to `activated`; it cannot select an offer.
- the first observed completed lesson moves learning to `started`; a higher
  monotonic snapshot moves it to `progressing`.
- `stalled` is derived only when the catalog policy's elapsed-time and minimum
  evidence thresholds are met. Missing or stale snapshots produce `unknown`,
  not stalled.
- a later higher-progress observation moves stalled to `resumed` and then
  `progressing` through explicit history rows.
- completion does not imply grading approval, feedback, certificate, payment,
  renewal, or marketing eligibility.
- regressions, course resets, identity conflicts, and percentage decreases are
  exceptions until reconciled; never silently lower or create a new episode.

## 11. Snapshot and reconciliation design

### 11.1 Registry scan

Daily, compare the live Heartbeat webhook list to an accepted manifest using
only action, filter, destination family, workspace, and active identity. Opaque
paths remain secret. Duplicate, missing, or unexpected registrations create
exceptions; the scan never edits the provider.

### 11.2 Course and cohort catalog scan

Daily, read courses/groups and compare identifier/name/cohort structure to the
accepted lifecycle catalog. Archived and lifecycle-disabled courses are not
polled for learners but remain visible as catalog drift.

### 11.3 Progress scan

For each lifecycle-enabled active cohort:

1. read the complete cohort progress snapshot through the supported tool/API;
2. validate workspace, cohort, pagination/completeness, and expected learner
   count where a reliable reference exists;
3. stage identifiers, latest completed lesson/timestamp, and percentage in a
   short-lived work area;
4. resolve party/enrollment/catalog mappings;
5. emit only new or changed normalized facts;
6. commit the run receipt and projection transaction;
7. delete person-level staging data after success or quarantine it under the
   short retention tier after failure.

Default proposed cadence is daily, with a six-hour cadence only for explicitly
accepted high-touch cohorts. Polling all 85 current cohorts without an accepted
active catalog is prohibited.

### 11.4 Backfill

No historical backfill is implied. A later backfill must declare exact courses,
cohorts, window, source completeness, identity impact, expected row counts,
privacy disposal, replay key, and rollback. Historical current-state snapshots
must not invent occurrence timestamps.

## 12. Authoritative joins

| Fact | Required authority | Join rule | Prohibited inference |
| --- | --- | --- | --- |
| person | `business_v2.parties` + scoped Heartbeat external ref | exact ref, then unique verified email | name similarity or ambiguous email |
| course access | Heartbeat group/membership or verified provisioner receipt | exact community/group/user | purchase, login, or course start |
| offer/product | accepted versioned offer catalog | exact source product/offer receipt | reverse-map shared group |
| cohort | Heartbeat cohort or source payment/enrollment receipt | exact source identifier/accepted mapping | price, payment date, or weekday guess |
| payment/refund | host-validated Contador/Stripe fulfillment receipt | exact Stripe event/order/product identity | browser/Chaos purchase label |
| progress/completion | Heartbeat snapshot/webhook plus course catalog | exact community/user/course/cohort | Encharge event or email click |
| grading/feedback | Heartbeat assignment and feedback state | exact enrollment/course requirements | completion alone |
| certificate | Sertifier credential/readback plus readiness gate | exact campaign/recipient/enrollment | grader handoff or issue request |
| consent | purpose-specific consent ledger/provider readback | exact party/purpose/version | commercial relationship or group membership |
| suppression | party no-followup + provider suppression/readback | strictest applicable scope wins | absence of an opt-out row as opt-in |

Existing `programs`, `program_variants`, `engagements`, and
`variant_enrollments` are reusable relationship structures but do not currently
encode Heartbeat course state. The new projection should reference them where
an exact engagement exists, not overload their generic status fields.

## 13. Processing, retry, quarantine, and replay

### 13.1 Receipt sequence

`received -> authenticated -> normalized -> reconciled -> applied -> handled`

Failure branches:

- bad signature, timestamp, content type, size, action, or schema: reject before
  archive where safe and return a retryable/non-retryable status by contract;
- valid relay but malformed provider fact: minimized receipt -> `quarantined`;
- identity/catalog conflict: normalized event -> exception, no projection;
- transient provider/database failure: `failed` -> leased retry;
- max attempts: dead-letter + durable lifecycle exception;
- duplicate transport/domain fact: link to winning receipt and stop before
  projection.

### 13.2 Replay

Replay operates by receipt/event ID, never by pasting a payload. It:

- checks current schema/catalog/policy versions;
- records a new processing attempt linked to the immutable original;
- preserves the original received/observed timestamps;
- does not create a second normalized fact for the same source key;
- compare-and-swaps the enrollment projection version;
- records `no_change`, applied transition, or exception;
- never invokes an action consumer during the control-plane dark phase.

## 14. Privacy and retention

Proposed default policy, requiring owner acceptance before build:

| Data class | Stored form | Proposed retention |
| --- | --- | --- |
| inbound body/headers | allowlisted IDs, action, hashes; no raw email/name/message/token | 30 days |
| failed identity staging | encrypted/restricted normalized email only when resolution requires it | 7 days, then delete |
| normalized operational milestones | opaque IDs, state facts, evidence references | enrollment close + 24 months |
| completion/grading/certificate proof | minimum required Academy record receipt | Academy records policy; build blocked until exact period is recorded |
| payment/refund proof | reference only; financial detail remains with Contador/Stripe authority | financial records policy |
| state history/audit hash | no direct contact data | retained with the associated operational proof |

Absolute rules:

- no coaching content, assignment body, feedback text, DM/thread content,
  certificate URL, raw email, phone, postal address, or payment detail in the
  lifecycle event/projection;
- no credentials, opaque callback paths, or authorization headers in source,
  logs, receipts, or exceptions;
- no person-level lifecycle data in Slack or routine health output;
- aggregate-by-default reports; exact person views require scoped host access;
- deletion/retention jobs must produce counts and receipts without echoing PII.

## 15. Observability and ownership

Required health surfaces:

- last successful registry, catalog, membership, and progress reconciliation;
- expected/observed scopes and freshness;
- ingress counts by action/status, duplicates, rejects, quarantines, retries,
  dead letters, and reconciliation lag;
- projection counts by axis/state and mapping/authenticity status;
- unresolved exception counts/age/owner;
- drift: unexpected/missing/duplicate registrations, unknown course/group,
  ambiguous offer/cohort, progress regression, orphan payment/certificate;
- release commit, schema migration, catalog revision/hash, and policy version.

Initial service objectives:

- relay acknowledgment after durable receipt: p95 under 2 seconds;
- webhook facts normalized or owned as exception: under 5 minutes;
- active-catalog progress freshness: under 26 hours for daily scans;
- duplicate projection applications: zero;
- unowned P0/P1 lifecycle exceptions: zero;
- no action/outbox/message rows from the dark control-plane release.

Operational alerts must name an exception ID and owner, not include student
data. Slack is a projection of the exception ledger, never closure authority.

## 16. Coexistence, migration, rollout, and rollback

### Stage 0 — design acceptance

- accept/revise this contract;
- record exact retention periods and owners;
- complete read-only n8n workflow/export inventory;
- remediate or explicitly isolate inline credential material;
- accept the lifecycle catalog owner and initial active cohort set.

### Stage 1 — local dark foundation

- ordered reversible schema migrations in an isolated worktree;
- deterministic parser, normalizer, projector, reaper, and reconciliation
  runner with fixtures only;
- no provider/runtime configuration.

### Stage 2 — inactive relay

- import a disabled n8n workflow using credential references;
- verify static mapping and signed-body fixtures;
- no Heartbeat registration.

### Stage 3 — deploy dark host

- migrate and deploy exact reviewed release;
- health proves schema, code, catalog, and action-consumer-disable state;
- internal transport canary only under separate authorization.

### Stage 4 — shadow provider capture

- separately authorize and add only the accepted core registrations;
- keep WordPress, Pabbly, Heartbeat-native, and community n8n routes unchanged;
- run 14 days and at least two complete progress scans in dark mode;
- require natural or separately authorized test receipts for join, group access,
  completion, duplicate replay, and a progress change;
- compare counts and exception reasons; no lifecycle messages.

### Stage 5 — source-of-truth cutover

- owner accepts parity evidence and exact old-receiver disposition;
- remove only proven duplicate/obsolete lifecycle registrations;
- do not remove community thread/DM, unrelated RSVP, or provider-native service
  workflows under this design;
- WordPress/Encharge/Chaos measurement changes are separate releases;
- action runtime remains disabled.

### Rollback

At every stage:

- disable the new provider registration/relay first;
- retain immutable receipts and projection history;
- stop collector schedules and consumers;
- keep legacy receivers intact until parity acceptance;
- rollback source/config and reversible schema additions through the release
  manifest;
- never delete current state to simulate rollback;
- reconcile shadow-period events before any later retry.

## 17. Exact implementation slices and gates

| Slice | Deliverable | Required authority before execution |
| --- | --- | --- |
| A | lifecycle catalog schema/validator and sanitized fixtures | internal source/design acceptance |
| B | ordered DB migration, functions, views, roles, rollback, disposable proof | explicit schema implementation |
| C | host relay authentication, parser, normalizer, identity/catalog resolver, projector | explicit host implementation |
| D | deterministic reaper/replay/reconciliation runners and health metrics | explicit runtime implementation |
| E | inactive n8n workflow/export with credential references | explicit n8n draft/import authority |
| F | production migration, release, restart, health verification | explicit migration/deployment authority |
| G | Heartbeat registration and dark natural canaries | exact provider-write/canary authority |
| H | legacy receiver cutover | owner-approved parity and exact delete/disable manifest |
| I | any lifecycle action consumer | separate action-catalog/runtime item and action-family authority |
| J | exception minion | separate minion design/build item; initially read-only/dark |

No slice may treat a previous boundary as implicit permission for the next.

## 18. Verification plan

### Source and schema

- migration apply, replay, rollback, role/permission, and structure-only schema
  tests on disposable PostgreSQL;
- schema version, constraints, unique keys, foreign keys, indexes, and retention
  functions;
- no PII or credentials in fixtures, logs, snapshots, or tracked workflow JSON.

### Contract and security

- fixtures for all 11 official webhook actions and every filter/payload shape;
- unknown action/field forward compatibility without accepting invalid required
  fields;
- missing/invalid/expired/replayed HMAC, body mutation, clock skew, oversize,
  invalid JSON/content type, timing-safe comparison, and rate-limit tests;
- explicit test that no webhook or replay invokes an LLM or external action;
- redaction tests for email, name, headers, callback paths, DM/thread content,
  and nested unexpected fields.

### Identity, mapping, and state

- exact external reference, verified email, provisional unique email,
  ambiguous/missing identity;
- shared group, unknown course, unknown cohort, mismatched workspace/catalog,
  paid-status non-inference;
- duplicates, out-of-order join/completion, stale snapshot, progress decrease,
  reset/rejoin episode, completion-before-start, and late payment/refund;
- every state transition produces one history row and a compare-and-swap
  projection version;
- grading, feedback, certificate, finance, consent, and suppression remain
  unchanged when a learning fact arrives.

### Reconciliation and recovery

- complete pagination/scope accounting, partial-response refusal, watermark
  retention, retry convergence, quarantine, dead letter, exact replay, and
  no-change replay;
- snapshot data is deleted or quarantined according to retention policy;
- registry drift identifies duplicates/missing/unexpected destinations without
  editing the provider.

### Release and live proof

- pinned Node build, focused and full tests, container-runner checks if touched,
  continuity check, independent review, release manifest, migration receipt,
  deployed health, and rollback rehearsal;
- read back the exact Heartbeat registration set and active n8n workflow;
- natural dark canaries for core actions and progress, with exact inbox/event/
  projection receipts and zero action/message consumers;
- deployment is not business outcome proof; later action-family outcomes need
  their own natural receipts.

## 19. Owner-review decisions before build activation

1. Accept or revise the proposed 30-day ingress, 7-day failed-identity, and
   enrollment-close-plus-24-month operational retention defaults; record the
   exact Academy completion/grading/certificate retention period.
2. Accept daily polling as default and name any cohorts requiring six-hour
   freshness.
3. Accept HMAC timestamp/body relay authentication as the target contract.
4. Name the owner of the versioned lifecycle catalog and initial
   lifecycle-enabled course/cohort set.
5. Authorize a separate remediation for existing tracked n8n credential
   literals before any lifecycle workflow is derived from those templates.
6. Keep implementation, deployment, provider registrations, receiver removal,
   action consumers, messages, and minion capability as separate explicit
   gates.

## 20. Evidence and freshness

Current evidence used:

- Heartbeat official API/help documentation fetched 2026-08-24;
- supported toolbox webhook/course/group capability and live aggregate reads on
  2026-08-24;
- live WordPress REST route readback on 2026-08-24;
- live NanoClaw health/release readback on 2026-08-24;
- current repository source, structure-only schema, tracked n8n workflow, and
  webhook reliability design;
- Growth's 2026-08-22 lead/student control map and Tandemweb's 2026-08-20
  journey/state evidence.

Drift-prone claims that must be refreshed before build or cutover:

- exact n8n workflow definitions, activation, credentials, retry/error
  workflows, and execution history;
- live production database schema/row health;
- Heartbeat registrations, course/cohort/group inventory, native workflows,
  and progress API behavior;
- WordPress deployed source identity and downstream Encharge/Chaos behavior;
- payment fulfillment, Sertifier, consent, suppression, and roster joins.
