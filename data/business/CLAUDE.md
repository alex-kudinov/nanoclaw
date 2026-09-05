# Business Database — business_v2 Schema

Status: tracked operating guide. Running PostgreSQL schema and permissions
remain implementation authority; ordered migrations in
`data/business/migrations/nanoclaw-v2/` are the portable change history.

PostgreSQL database for CRM and business operations. All agents access via `business_v2` schema views (reads) and SECURITY DEFINER helper functions (writes). Agent identity is transparently injected via PGOPTIONS session variables.

Migration 118 is the live host-only Company OS work-ledger foundation. It
grants no agent access. `NC-20260816-001` records its backed-up production
application and live-verified bounded, default-off host observer; the observer
does not grant agents access or become email authority. Do not infer the
current release or configuration from repository presence; follow
`docs/COMPANY-OS-WORK-LEDGER.md` and the active-work/changelog evidence.

Migration 119 was applied and live-verified under `NC-20260816-017`. It widens
the same host-only tables for `host_job_run`; five exact successful runs were
projected in one closed window and exact replay was duplicate-only. The
observer opens SQLite read-only, requires an explicit fixed window and batch
ceiling, and remains unscheduled and absent from the daemon/scheduler. SQLite
`jobs`/`job_run_logs` remain authority and Campanero receives no database
access. Follow `docs/COMPANY-OS-JOB-LEDGER.md`; release presence alone does not
authorize another projection.

Migration 120 went live under exact release `a2e6d35`; active release
`baed66d` preserves it and the `NC-20260816-018` operator-attention loop for one
owner-confirmed operator. One naturally sourced brief, exact named
acknowledgment, and threaded
receipt are verified; later source-derived resolution remains pending.
Acknowledgment records only that the operator saw exact cases, and no exception
operation may mutate a work item, event, receipt, job, email action, or
workflow. Follow `docs/COMPANY-OS-EXCEPTION-LOOP.md` and the current active-work
evidence rather than inferring state from schema presence.

Migration 121 is live under exact release `baed66d` through
`NC-20260817-002`. Its default-off observer live-proved one exact natural
scheduled-task claim boundary, wrote one hashed/content-free occurrence, and
returned duplicate on exact replay. The one-boundary configuration was expired
back to disabled; the append-only table retains that one evidence row. It
receives no task prompt/result and grants no task, agent, approval, capability,
message, or action authority. Other source adapters, recurring definitions,
watermarks, and task/action promotion remain separately gated. Use NC-002's
active-work/changelog evidence for exact backup, release, and canary state.

Migration 122 is live under exact release `070cde38` through
`NC-20260817-004`. It adds immutable, content-free source
definitions, a host-owned compare-and-swap cursor head, and append-only
checkpoint/gap history. Complete ranges require exact
`observed = accepted + rejected` accounting and source-specific monotonic
cursors. A gap event leaves the prior cursor fixed and blocks ordinary
advancement; only a reconciliation event bound to that exact open gap may
resume it. The live tables remain admin-only and the typed store is not
imported by the daemon. `NC-20260818-001` registered exactly one inbound
Gmail source plus one zero-count bootstrap event and version-1 current state
from the unchanged query-only SQLite cursor; no adapter runtime, task, agent,
approval, message, or action authority was added. Use NC-001's active-work/
changelog evidence rather than the older NC-004 zero-row checkpoint.

Migration 123 is live, empty, and admin-only under `NC-20260817-013`. It
defines the resumable state, append-only page receipts, and immutable per-
Gmail-message-ID accepted/rejected evidence for the inbound full-snapshot
shadow. The exact release-bound migration was applied only after a zero-work
drain and verified custom-format backup; all three production tables contain
zero rows and have zero non-admin grants. Its recovery producer remains
unwired. One separately bootstrapped source/current watermark now exists, but
no migration-123 snapshot/page/candidate row, cursor or 404 change, recovered
message, task, or action authority exists;
schema presence is inventory capacity, not recovery evidence. Follow
`docs/COMPANY-OS-GMAIL-RECONCILIATION.md`.

Migration 124 is live under `NC-20260818-002`. It is a separate host-admin-only,
gap-independent mailbox-audit target with resumable state and append-only page/
per-ID accepted/rejected/unknown evidence. After backup and an empty/admin-only
schema check, one separately invoked read-only audit reached a stable terminal
page with no retained token. It cannot write the generic watermark, recover a
message, create work, or grant action authority. The migration-123 recovery
tables remain empty and unwired; follow the active work/changelog before any
404 or recovery promotion.

Migration 125 is live under `NC-20260820-002` in exact release `8344524c`.
It adds the admin-only, append-only program-facts observation target and the
typed condition-work lifecycle. Live structure has 14 constraints, one enabled
append-only trigger, and zero non-admin table or sequence grants. One stable
production work item has two drift observations, zero reopens, and one open
owner-review exception/Chief brief after a direct exact-release canary and a
real Campanero scheduler replay. No agent receives access or fact-correction
authority. The owner must reconcile the source facts before an exact clean
scheduled receipt may complete the item and source-resolve the case; follow the
current active-work/changelog evidence.

Migration 126 is live and empty under exact release `265622bd` through
`NC-20260820-006/007`. It binds an immutable assessment chain to one exact
`sales_email` `external_acknowledged` event and stores no customer identity or
content. A later assessment may supersede a prior one without rewriting it,
but only one current chain head is legal. No daemon producer, agent grant,
message path, automatic classification, or remediation is part of the
migration. NC-20260820-007's deployed, separately gated host CLI is
default-dry-run, single-receipt only, and requires an explicit operator-reviewed
classification, opaque hashes, canonical timestamps, an unchanged 15-minute
plan fingerprint, and exact host/release/task confirmation before apply. It
does not read Gmail, Slack, SQLite, customer identity, or content and is not
imported by a daemon or agent. The service indicator may publish a rate only
with one current assessment for every exact customer-visible outcome in its
cohort. Release or command presence is not receipt evidence; the live table
remains empty, and active-work/changelog state remains authoritative before
relying on an assessment.

Migration 127 is the default-off NC-20260820-008 outcome-review packet ledger.
It stores only exact work/event bindings, hashes, bounded state, hashed operator
identity, and Slack delivery/decision receipts; request and response prose stay
transient in the existing private Slack/SQLite surfaces. The host reviewer may
assemble one bounded packet only after exact SQLite action/draft, routed source,
Gmail delivery, and outcome receipts agree. Only a configured Slack UID's exact
packet reaction can invoke migration 126's append-only assessment producer.
There is no agent grant, Gmail API/search/read, default-clean inference, bulk
mode, customer message, remediation, or work mutation. Repository/schema/code
presence is dark capacity, not authorization to post a packet or classify an
outcome; follow NC-20260820-008's active-work/changelog state for live status.

Migration 128 is NC-20260820-009's narrow Slack-reaction vocabulary extension.
Slack names 👍 as `+1`; that exact reaction by a configured operator on the
exact bound packet is an explicit `clean` decision, equivalent to the existing
check-mark variants. On startup/daily run, the host may read reaction metadata
for the one exact open packet and reconcile only one supported configured-
operator reaction. Zero or multiple supported reactions produce no decision.
The observation time is recorded because Slack's message reaction snapshot
does not expose the original click time. Slack's exact-message API returns a
message envelope, but the channel helper projects only reaction names and UIDs;
message content is neither inspected nor exposed to the review service, logged,
or persisted. This adds no channel search, model inference, default clean,
Gmail access, customer action, remediation, work mutation, or agent grant.

Migration 130 is NC-20260821-002's live-dark Company OS follow-up projection.
It stores one privacy-minimized current case per exact Sales conversation,
Plutio proposal, or Plutio invoice plus append-only changed-evidence events.
Both tables are empty, admin-owned, and expose no agent grants. The pure policy
and host store are not imported by the daemon, scheduler, IPC, agent, or any
presentation/draft/send path. Source systems and existing action ledgers remain
authoritative. Do not populate the tables, import the legacy backlog, or infer
customer-action authority from schema or release presence; follow
`docs/SALES-FOLLOWUP-OPERATING-MODEL.md` and current active-work/changelog
evidence.

Migration 131 is the live correction for explicit follow-up rejection under
exact release `6b9b5f27`. It extends the existing append-only event vocabulary with one
content-free `declined` operator decision and a SHA-256 operator fingerprint.
It does not consume Slack, change a case or pipeline entry, read a source,
schedule work, or send. The replacement adapter must bind the exact case
version/presentation, cancel the Sales case, transition the associated entry to
canonical `lost`, and read back both durable results before reporting closure.

Migration 132 is live under exact release `97026492b85e` through
NC-20260823-001's healer-resolution
Company Work extension. It adds the distinct `healer_resolution` workflow,
`healer_resolution_receipt` completion, and append-only minimized observations.
The host-only adapter defaults off and is not daemon/scheduler/Slack/action
wired. A terminal no-action observation requires a hashed named-decision actor;
anonymous rejection remains pending. Disposable PostgreSQL proves exact replay,
changed-evidence update, verified closure, recurrence reopening, named
no-action closure, append-only enforcement, zero non-admin grants, populated
rollback refusal, and clean empty rollback. The production table is empty,
admin-only, append-only, and has zero non-admin grants. Schema presence does
not authorize projecting live healer incidents.

`NC-20260823-002` adds the separately gated bounded producer. It defaults off
and requires exactly one configured natural source plus `MAX_ITEMS=1`; invalid
or missing source identity fails before a transaction. Fast-healer collection
and existing action controls continue independently. One-source configuration
does not grant a second projection, Slack presentation, or remediation.

Migration 133 is live and empty under exact release `b131071c74fc` through
`NC-20260823-006`. It is the Contador operational
payment/refund fulfillment ledger. It stores one current case per exact Stripe
account/payment-intent pair plus append-only opaque aliases and minimized stage
receipts. Only `nanoclaw_admin` receives access. Names, email, product text,
amount/card data, raw webhook content, Slack content, and accounting facts are
forbidden. Exact Payment Log, `public.payments`, and mapped-roster readback is
required for `complete`; refunds remain `needs_review`. Schema/release presence
does not authorize replaying historical Stripe events or any Bizmgr/QuickBooks
action. The guarded rollback refuses once any case, alias, or receipt exists.

Migration 137 is `NC-20260825-003`'s reviewed Relationship Context dark
foundation and was applied in production by `NC-20260825-004`. It adds
admin-only scoped external refs, identifier claims and
identity exceptions, disabled adapter manifests, bounded append-safe
observations, current section projections, content-minimized query receipts,
and dry-run-only Plutio projection receipts. It copies valid legacy Party
source pairs into exact compatibility refs but does not clear the legacy
columns. Conflicting ownership aborts the migration. Every persisted JSON
surface is capped at 8,192 bytes; no table contains a provider credential,
message body, payment instrument, executable provider outbox, or minion grant.
The guarded rollback removes only exact migration-created legacy compatibility
refs and otherwise refuses once evidence exists. NC-004 separately authorizes
the exact migration plus credential-free Trafft host-ledger shadow deployment.
It does not authorize `party_context_get` grants, guessed identity, provider
writes, or Plutio field/data changes.

`NC-20260826-003` adds no migration and does not broaden those provider or
action authorities. It may reconcile exact Trafft customer refs only for a
unique post-registration Party created by Trafft within the bounded creation
window; appointment refs additionally require that their canonical ledger
Party agrees with the exact customer ref. Booking checks an exact customer ref
before its historical email fallback, while legacy, shared, ambiguous, and
mismatched rows stay held. Same-family Party merges may re-canonicalize an
existing ref; different-family conflicts refuse. The separately invoked
host-only read canary consumes one exact Booking grant, requests only the
appointments section, and exposes status/count/receipt metadata rather than
Party identity or context values. It is not a scheduled or minion capability.
Exact live `adc0c5d8` reconciled 2 verified customer refs and 4 appointment
refs/current projections from 422 natural rows, retained 418 current-row holds,
and delivered one minimized host canary receipt with zero conflicts. Global
query remains disabled with zero active grants.

`NC-20260826-004` adds no migration. It imports stable Plutio person IDs from
the existing unique `plutio_refs` ledger and accepts only private sanitized
Encharge snapshots whose email fingerprints still map to one canonical Party.
Historical Trafft binds only when one canonical Party is corroborated by an
active verified Plutio or Encharge person ref; the uncorroborated remainder is
durably `legacy_identity` / `legacy_unresolved`. Provider writes, Party merges,
raw emails/provider payloads, and global/group context activation remain
forbidden.
Exact live `1a381e48` has 1,364 Plutio person refs, 1,242 Encharge person refs,
159 Trafft customer refs, 358 appointment refs, and 66 terminal legacy
appointment exceptions with zero provider conflicts. Query remains disabled.

`NC-20260826-005` adds no migration. Exact live release `d5375964` enables
read-only adapters for both fixed Stripe account scopes, immutable archived
contact submissions, and verified Chaos visitor links. Stripe retains an
existing exact customer ref or requires one account-local unique provider
email to one canonical Party; contact form requires one unique submitted
identity; Chaos requires one interaction Party plus agreeing handled verified
inbox evidence. Every unresolved or conflicting identity is terminal legacy;
a prior active Chaos ref becomes conflicted on later disagreement. Persisted
facts exclude raw payloads, emails, names, messages, amounts/card data, intent
summaries, and browsing history. `RELATIONSHIP_CONTEXT_ENABLED=0` and zero
minion grants remain unchanged. Follow
`docs/RELATIONSHIP-CONTEXT-STRIPE-CONTACT-CHAOS.md`.

The contact/Chaos adapters reuse migration 97's admin-owned
`sweeper_watermarks` with dedicated keys and exact keyset cursors; no new
migration is introduced. Chaos stores versioned interaction/inbox bigint
positions, reads bounded numeric-ID pages, and groups full evidence only for
the bounded changed visitor set. Each source ledger resets its cycle
independently so late commits with lower allocated sequence IDs are not skipped
and a low-volume lane cannot park behind a busier one. A fully processed page
may advance while first-coverage health remains incomplete until both ledgers
have completed at least one cycle.
Stripe uses complete created-time partitions and recursively bisects an
overflowing provider page range; one scope cannot ingest unless both account
identities were read and proved distinct in the same run.

Migration 138 is `NC-20260826-001`'s Tandem OS relationship-owner authority.
It registers the append-only `team:tandem` / `Tandem Team` organizational
principal with `action_authority='none'` and one exact decision-bound
assignment for each Sales conversation, proposal-signature, and receivable
lane. `company_followup_cases` retains the principal, assignment ID, and
decision receipt under a lane-bound composite foreign key. Missing or malformed
assignment evidence blocks actionable work; `createdBy`, sender, execution
group, pipeline duplication, and recent activity remain forbidden fallbacks.
The schema is admin-only and grants no draft, approval, send, provider-write,
follow-up-activation, payment, contract, credential, or minion authority.

Migration 142 is `NC-20260905-003`'s source-only multi-source student
enrollment dark foundation. It defines admin-only orders, append-only source
references/evidence, independently assignable seats, exact participant
enrollments, component entitlements, financial agreements/obligations, class
assignments, projection outbox/receipts, durable exceptions, history, and an
aggregate health view. It is packaged but unapplied and unwired. Its guarded
rollback refuses after any row exists. Repository presence grants no authority
to apply the migration, inspect/reconcile/backfill students, activate adapters
or projections, change a provider/Sheet/runtime, deploy, or communicate.
`NC-20260905-006` separately proves migration 142 on local disposable
PostgreSQL 16.15: 13 tables, one view, 13 sequences, exact admin ownership and
zero non-admin grants, representative synthetic constraints and append-only
refusal, populated rollback refusal with retained data, empty rollback,
reapply, and zero database residue. The verifier pins `/tmp:5432`, strips all
ambient `PG*` variables, requires a local server address, refuses existing or
production-like names, and never creates/alters a cluster role. This proof does
not authorize production migration, real-data reconciliation, adapters,
providers, runtime, deployment, or communication.

Migration 143 is `NC-20260905-005`'s source-only Academy capacity extension to
migration 142. It defines canonical delivery blocks, exactly one seat pool per
delivery block in v1, versioned many-offer mappings, checkout/manual/internal
waitlist reservations, FIFO waitlist entries and human-approved offer state,
append-only capacity events, and an aggregate occupancy view. Pending and
active class assignments consume seats; only unexpired held reservations count
as reserved. Composite foreign keys preserve order/seat and pool/waitlist/
reservation agreement, and the assignment delivery-block foreign key is
`NOT VALID` so no blind historical backfill is inferred. Migration 143 is
packaged but unapplied and unwired, grants only `nanoclaw_admin`, and its
rollback refuses after any capacity evidence exists. Repository presence does
not authorize real-student reconciliation, provider or Sheet writes, Capacity
minion activation, waitlist outreach, checkout or Bookkeeper wiring,
deployment, live cohort-state changes, or authority cutover.
`NC-20260905-007` separately proves the ordered 142-to-143 chain on generated
local PostgreSQL 16.15. It verifies seven tables, one view, seven sequences,
admin ownership and zero non-admin grants; shared-pool multi-offer occupancy;
live, expired, and consumed reservations; five reason-matched integrity
refusals; populated rollback retention; explicit removal of a class assignment
coupled to a capacity delivery block; empty rollback/reapply; and zero database
residue. The verifier reuses migration 142's pinned `/tmp:5432`, stripped-`PG*`,
generated-name-only safety boundary. This synthetic proof does not authorize
production migration or any real-data/provider/runtime action.
`NC-20260905-008` then performs a bounded read-only reconciliation without
populating migrations 142-143. The privacy-minimized evidence holds MCS
Thursday at 5/12 open, MCS Friday at 13 roster assignments against capacity 12
and sold out, one January Thursday assignment with disputed transfer origin,
and ACC September 7 at eight assignments but unknown numeric capacity. Seven
owned exceptions block import where owner count, transfer origin, offer,
funding, capacity, or the Tandemweb lower-override behavior remains unresolved.
The reusable validator and evidence schema are tracked, but they are not a
parallel assignment or capacity authority. Repository evidence does not grant
source repair, production population, provider write, or runtime authority.

## Connection

```bash
# From inside a container — credentials + PGOPTIONS are pre-set as env vars:
psql   # no args needed (PG* env vars + PGOPTIONS set automatically)

# From Mac Mini host (debugging/admin):
PGPASSWORD='<BUSINESS_DB_PASS_ADMIN>' psql -h 192.168.64.1 -U nanoclaw_admin -d nanoclaw_business
# Binary: /opt/homebrew/Cellar/postgresql@16/16.13/bin/psql
```

Host IP `192.168.64.1` is the Mac Mini as seen from container VMs. DB name: `nanoclaw_business`. Port: `5432`.

**Agent identity:** PGOPTIONS env var sets `app.current_agent` (group name) and `app.current_agent_role` (DB role) per container at connection time. Helper functions read these automatically — no agent-side boilerplate needed. Audit columns (`last_updated_by`, `transitioned_by`) capture the agent name.

## Access Pattern

**Read:** SELECT from `business_v2.v_*` views. Never SELECT from base tables directly.

```sql
SELECT * FROM business_v2.v_party_contact_card WHERE primary_email = 'jane@example.com';
SELECT * FROM business_v2.v_active_pipeline WHERE party_id = 10042;
```

**Write:** Call `business_v2.fn_*()` helper functions. Never INSERT/UPDATE base tables directly.

```sql
SELECT business_v2.fn_create_party('person', 'Jane Doe', 'jane@example.com', 'wordpress');
SELECT business_v2.fn_add_party_role(10042, 'prospect');
SELECT business_v2.fn_create_pipeline_entry(10042, 1, 'new', 10000, 'USD', '{}'::jsonb);
```

## Roles & Permissions

| Role | Access |
|------|--------|
| `nanoclaw_inbox` | SELECT views + EXECUTE helpers |
| `nanoclaw_sales` | SELECT views + EXECUTE helpers |
| `nanoclaw_mailman` | SELECT views + EXECUTE helpers |
| `nanoclaw_chief` | SELECT views + EXECUTE helpers |
| `nanoclaw_booking` | SELECT views + EXECUTE helpers |
| `nanoclaw_contador` | SELECT views + EXECUTE helpers |
| `nanoclaw_procurement` | SELECT views + RLS-limited legacy Bonfire access on public.procurement_opportunities; source-keyed migration 114 rows and all control-plane writes remain host-only |
| `nanoclaw_admin` | Full access (DDL + DML) |

Agent roles can SELECT from views and lookup tables, EXECUTE helper functions. They **cannot** SELECT/INSERT/UPDATE base tables in `business_v2` directly.

Credentials: `.env` as `BUSINESS_DB_PASS_INBOX`, `BUSINESS_DB_PASS_SALES`, etc.

## Core views (non-exhaustive)

### `v_party_contact_card` — identity + contact info
Resolves canonical party with primary email, active roles, merge status.
```sql
SELECT * FROM business_v2.v_party_contact_card WHERE primary_email = '{email}';
```

### `v_active_pipeline` — open pipeline entries
Shows active pipeline entries (not closed/won/lost) with party info and program.
```sql
SELECT * FROM business_v2.v_active_pipeline WHERE party_id = {id};
SELECT * FROM business_v2.v_active_pipeline WHERE stage IN ('qualifying', 'proposal', 'negotiating');
```

### `v_active_engagements` — current engagements
Active coaching/service engagements with party and program details.
```sql
SELECT * FROM business_v2.v_active_engagements WHERE engagement_status = 'active';
```

### `v_party_timeline` — chronological interaction history
All interactions for a party, ordered by occurrence.
```sql
SELECT * FROM business_v2.v_party_timeline WHERE party_id = {id} ORDER BY occurred_at DESC LIMIT 10;
```

### `v_client_status` — client overview
Current client status derived from engagements and roles.
```sql
SELECT * FROM business_v2.v_client_status WHERE client_status = 'current';
```

### `v_program_variant_seats` — program capacity
Program variants with seat availability.
```sql
SELECT * FROM business_v2.v_program_variant_seats;
```

### `v_sales_followup_queue` — leads eligible for a follow-up draft
Excludes operator-suppressed parties and carries the original inquiry/thread
context needed for an approval-gated follow-up.
```sql
SELECT * FROM business_v2.v_sales_followup_queue;
```

### `v_sales_needs_reply` — inbound leads awaiting a sales response
Use this view, rather than agent memory or Slack history, when reporting what
still needs a reply.

## Core callable helpers (non-exhaustive)

### Party Management
| Function | Signature | Purpose |
|----------|-----------|---------|
| `fn_create_party` | `(text, text, citext, text, jsonb) → bigint` | Idempotent party creation (find-or-create by email) |
| `fn_add_party_role` | `(bigint, text) → bigint` | Idempotent role assignment |
| `fn_merge_parties` | `(bigint, bigint, text) → void` | Merge two parties (admin) |
| `canonical_party_id` | `(bigint) → bigint` | Follow merge chain to canonical |
| `resolve_parties_by_email` | `(citext) → bigint` | Find party by email |
| `best_party_by_email` | `(citext) → bigint` | Best-match party by email |

### Pipeline & Documents
| Function | Signature | Purpose |
|----------|-----------|---------|
| `fn_create_pipeline_entry` | `(bigint, bigint, text, int, text, jsonb) → bigint` | Create pipeline entry (party_id, program_id, stage, amount_cents, currency, metadata) |
| `fn_advance_pipeline_stage` | `(bigint, text, text) → void` | Move pipeline entry to next stage (entry_id, new_stage, reason) |
| `fn_issue_document` | `(bigint, text, int, text, jsonb) → bigint` | Create document + interaction + outbox atomically |
| `fn_drop_followups` | `(bigint, text) → table` | Suppress a canonical party and park its open pipeline entries |
| `fn_resume_followups` | `(bigint, text) → boolean` | Clear party suppression without automatically changing stages |

### Interactions
| Function | Signature | Purpose |
|----------|-----------|---------|
| `fn_log_interaction` | `(bigint, text, text, text, timestamptz, jsonb) → bigint` | Log interaction (party_id, channel, direction, subject, occurred_at, metadata) |
| `fn_log_interaction_dedup` | `(bigint, text, text, text, timestamptz, jsonb, text, text) → bigint` | Dedup-aware interaction (adds source_provider, source_id for idempotent upsert) |

**Valid channels:** `email`, `meeting`, `call`, `form-submission`, `booking`, `payment`, `slack`, `whatsapp`, `other`

**Valid directions:** `inbound`, `outbound`, `internal`

## Lookup Tables (reference values)

Agents have SELECT access to all lookup tables for reference:

- `role_types` — valid role keys: prospect, client, coach, vendor, partner, admin, certifier, student
- `pipeline_stages` — valid stage keys: new, qualifying, proposal, negotiating, won, lost, closed
- `document_types` — valid doc types: proposal, contract, invoice, receipt, certificate
- `document_statuses` — valid doc statuses: draft, sent, signed, declined, paid, overdue, cancelled
- `interaction_channels` — 9 channel keys (see above)
- `interaction_directions` — inbound, outbound, internal
- `source_providers` — wordpress, trafft, gmail, stripe, plutio, manual, zoom, heartbeat, bonfire, other
- `programs` — seeded: coaching-inquiry, certification-inquiry, general-inquiry

### Program ID Resolution

Always resolve program_id by slug, never hardcode IDs:
```sql
SELECT id FROM business_v2.programs WHERE slug = 'coaching-inquiry';
```

## Common Workflows

### New Lead (inbox agent)
```sql
-- 1. Create party
SELECT business_v2.fn_create_party('person', 'Jane Doe', 'jane@example.com', 'wordpress');
-- Returns party_id

-- 2. Assign prospect role
SELECT business_v2.fn_add_party_role({party_id}, 'prospect');

-- 3. Resolve program
SELECT id FROM business_v2.programs WHERE slug = 'coaching-inquiry';

-- 4. Create pipeline entry
SELECT business_v2.fn_create_pipeline_entry({party_id}, {program_id}, 'new', 10000, 'USD', '{}'::jsonb);

-- 5. Log the interaction
SELECT business_v2.fn_log_interaction({party_id}, 'form-submission', 'inbound', 'Coaching inquiry', NOW(), '{}'::jsonb);
```

### Pipeline Advancement (sales/mailman)
```sql
-- Check current pipeline status
SELECT * FROM business_v2.v_active_pipeline WHERE party_id = {id};

-- Advance stage
SELECT business_v2.fn_advance_pipeline_stage({entry_id}, 'qualifying', 'initial review complete');

-- Issue proposal
SELECT business_v2.fn_issue_document({party_id}, 'proposal', 50000, 'USD', '{"terms": "6 sessions"}'::jsonb);
```

### Booking (booking agent)
```sql
-- Create/find party
SELECT business_v2.fn_create_party('person', 'Jane Doe', 'jane@example.com', 'trafft');

-- Log with dedup (idempotent for same trafft appointment)
SELECT business_v2.fn_log_interaction_dedup(
  {party_id}, 'booking', 'inbound', 'Coaching session',
  '{start_time}'::timestamptz,
  jsonb_build_object('trafft_appointment_id', '{apt_id}', 'service', '{service}', 'status', '{status}'),
  'trafft', '{apt_id}'
);
```

### Weekly Digest (chief agent)
```sql
SELECT
  (SELECT COUNT(*) FROM business_v2.v_active_pipeline WHERE stage = 'new') AS new_leads,
  (SELECT COUNT(*) FROM business_v2.v_active_pipeline WHERE stage IN ('qualifying','proposal','negotiating')) AS pipeline,
  (SELECT COUNT(*) FROM business_v2.v_active_engagements WHERE engagement_status = 'active') AS active_engagements,
  (SELECT COUNT(*) FROM business_v2.v_client_status WHERE client_status = 'current') AS active_clients;
```

## Procurement (hybrid access)

Procurement has a transitional split:

- **Legacy scanner:** migration 114 row-level security keeps direct
  `public.procurement_opportunities` access only for source-keyless Bonfire
  rows. The role cannot read or mutate source-keyed CaleProcure/email work.
- **New intake:** migrations 114-115 add host-only typed writes, immutable
  observations, idempotent source-run completion, host-bound Slack review
  cards, coverage-derived run state, atomic pursuit creation, a versioned
  pursuit event ledger, per-run opportunity associations, exact-thread
  advancement, and an acknowledged reconciliation/action-receipt outbox,
  `public.v_procurement_review_queue`, and
  `public.v_procurement_pursuit_queue`. CaleProcure/email adapters
  must use `src/procurement-intake.ts`, never model-authored SQL.
- **Vendor party operations:** use `business_v2` helpers

```sql
-- Create vendor party
SELECT business_v2.fn_create_party('org', 'Vendor Corp', 'vendor@example.com', 'manual');
SELECT business_v2.fn_add_party_role({party_id}, 'vendor');

-- Context lookup
SELECT * FROM business_v2.v_party_contact_card WHERE primary_email = '{org_email}';

-- Log interaction (use 'other' channel, NOT 'procurement')
SELECT business_v2.fn_log_interaction({party_id}, 'other', 'inbound', 'RFP response received', NOW(), '{}'::jsonb);

-- Legacy Procurement path only; new intake does not issue this SQL
INSERT INTO public.procurement_opportunities (...) VALUES (...);
```

The host administrator alone executes:

- `public.fn_begin_procurement_source_run(...)`;
- `public.fn_record_procurement_observation(...)`;
- `public.fn_complete_procurement_source_run(...)`;
- `public.fn_transition_procurement_review(...)`;
- `public.fn_record_procurement_review_card(...)`;
- `public.fn_apply_procurement_review_card_decision(...)`.
- `public.fn_begin_procurement_source_run_v2(...)`;
- `public.fn_complete_procurement_source_run_v2(...)`;
- `public.fn_link_procurement_run_opportunity(...)`;
- `public.fn_apply_procurement_pursuit_advance(...)`;
- `public.fn_reconcile_procurement(...)`;
- `public.fn_ack_procurement_reconciler_alert(...)`.

The Procurement container receives read-only
`public.v_procurement_review_queue` and `public.v_procurement_pursuit_queue`
through bounded IPC tools. Its CaleProcure batch and review-card requests
cross typed host gates; the final decision actor is derived from Slack and is
never accepted from the container. Submission is outside this database
boundary.

## Historical Data Note

Legacy `public.*` integration tables still coexist with the modern
`business_v2` model. Do not infer backfill completeness from this guide. Inspect
the current views/schema and use aggregate validation before relying on
historical coverage.

## Schema File Reference

- DDL: `data/business/migrations/nanoclaw-v2/` (01-18 base/cutover plus ordered
  post-cutover migrations through the latest tracked number)
- Validation: `data/business/migrations/nanoclaw-v2/validate.sql` (20 acceptance criteria)
- Smoke tests: `data/business/migrations/nanoclaw-v2/90_smoke_tests.sql`
