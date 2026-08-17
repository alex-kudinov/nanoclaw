# NanoClaw Business Data Model

**Status:** Draft v1.1 — under deliberation, not implemented. v1.1 folds in frontier-model review corrections from GPT-5 Pro + Gemini 3.1 Pro (see § v1.1 corrections below).
**Supersedes:** nothing yet (the current `nanoclaw_business` schema is an accretion, not a design; see "Current State" below)
**Complements:** `docs/business-agents-architecture.md` (tiers/channels/routing — different concern)
**Owner:** Alex Kudinov
**Last updated:** 2026-04-11 (v1.1)

**Current implementation addendum (2026-08-16):** This deliberation document
predates the implemented `business_v2` migration chain. Running PostgreSQL and
the tracked ordered migrations remain implementation authority. Separately,
`NC-20260815-010` adds migration-118 structures for
`company_work_items`, append-only `company_work_events`, and exact
`company_work_receipts`. Those host-only tables are a cross-agent work
projection linked to Party and pipeline IDs; they do not replace interactions,
pipeline state, or the SQLite approved-email action authority.
`NC-20260816-001` applied those tables in production and live-verified a
bounded, default-off host projection across completed, source-gap, and
duplicate-only cases. SQLite remains approved-email authority. See
`docs/COMPANY-OS-WORK-LEDGER.md` and `docs/ACTIVE-WORK.md` for current state.
`NC-20260816-014` adds a SELECT-only reconciliation report over the same
privacy-minimized structures; it changes no schema or authority.
`NC-20260816-015` deploys and live-verifies one bounded four-item production
read under exact release `cf96258`, with unchanged item/version/event/receipt
and SQLite email fingerprints before and after.
`NC-20260816-016` adds an unapplied migration-119 target plus an unwired typed
projection for a second `host_job_run` pilot. It permits null Party/pipeline
references only for that workflow under a workflow-specific constraint;
`sales_email` still requires both. SQLite `jobs`/`job_run_logs` remain host-job
authority, and no production schema or runtime state changes under NC-016. See
`docs/COMPANY-OS-JOB-LEDGER.md`.
`NC-20260816-017` adds the activation candidate: migration 119 and its guarded
rollback are bound into the verified release, the one-shot source reader opens
SQLite read-only and selects no result content, and the PostgreSQL report
reconciles `sales_email` and `host_job_run` with distinct milestone/receipt
rules. Schema application and projected production rows remain separate
evidence boundaries until the NC-017 deployment record says otherwise.

---

## Purpose

This document defines the canonical data model that the NanoClaw business subsystem should converge toward. It answers one question that the current Postgres schema cannot:

> "Who is this person, what are they to us, what have they done with us, and what are we doing with them right now?"

The current schema cannot answer that question because it has no notion of "a person." It has `leads` (partial), `clients` (empty), `booking_events` (Trafft mirror), `payments` (Stripe mirror), `coaches` (empty), `vendors` (empty), and none of them reference each other. Four data islands joined only by inconsistent email strings.

This document is **deliberation-stage**. Nothing here is built. Fields, enums, relationships, and scope are explicitly up for debate. The "Open Questions" section at the end enumerates decisions that must be made before any migration.

## Scope

**In scope:** the operational data model for people, programs, engagements, interactions, documents, and the pipeline funnel. Everything needed for inbox, sales, mailman, booking, contador, certifier, and courses agents to answer questions with a single SQL query instead of UNIONing across islands.

**Out of scope (explicitly):**
- Agent runtime state (that lives in `store/messages.db` — SQLite, not business DB)
- Agent knowledge (KNOWLEDGE.md files, not database)
- Email classification pipeline internals (`email_classifications`, `classification_taxonomy`, `classification_rules` — stays as-is, just gains a `party_id` FK)
- Gmail, Slack, Trafft raw storage (those are interaction inputs, mirrored into `interactions` at event time)
- Newsroom, blog, SEO data (different project, different DB)
- Reporting dashboards (BI concern, different tool)

## Guiding principles

1. **The Party is stable; everything else is a relationship.** A human being does not change. What they *are* to us (prospect, client, coach, trainer, vendor) is a role relationship with a start and an end. Model the human as an identity, model the roles as rows.

2. **Our DB is authoritative. Plutio is a sync target, not a dependency.** Every write path hits our Postgres first, in a single transaction. Plutio is updated asynchronously via an outbox queue. If Plutio is down for a week, nothing in NanoClaw breaks. When Plutio comes back, the outbox drains.

3. **Never use email as a person identity key.** Email is a contact method, not an identity. A person can have many emails (Luna Tovaglieri proved this: inquired from one address, booked from another). Matching by email is a cache lookup against `party_emails`, not a join condition.

4. **Every string-typed status/kind column is a candidate for drift.** We just lived through it: chief filed tasks with `type='client-reply'`, `type='close-leads'`, `type='db-fix'` — free-text chaos that nobody polled. Use Postgres enums, lookup tables, or `CHECK` constraints. If a value isn't in the canonical list, the insert fails.

5. **Foreign keys are invariants, not decoration.** The current schema has almost zero FK enforcement. Orphaned rows are a when, not an if. FKs with `ON DELETE RESTRICT` or `ON DELETE SET NULL` are the only way to keep the graph coherent as rows come and go.

6. **One unified event log, not N per-source logs.** Booking events, payment events, email events, form submissions, meeting bookings — they are all **interactions** with a party. One table. One query shape. `SELECT * FROM interactions WHERE party_id = X ORDER BY occurred_at` must work.

7. **Catalog data (programs, role types, stages) is reference data that evolves slowly.** Put it in tables, not enums that need migrations. Enums are for closed sets that will never grow (like `party_type IN ('person','organization')`). Programs, role types, and pipeline stages will grow and need admin management — keep them in lookup tables.

8. **Design for observability. Every row has `created_at`, `updated_at`, and a source attribution.** When Luna appears under two emails, we need to know where each came from and when. When a pipeline entry transitions stages, we need the history. Every table has audit columns and many tables have a companion history table.

9. **Don't model what we don't have.** This document proposes a lot of tables. Some are empty-by-default shells (e.g., `engagements` on day one has zero rows). That's fine. Empty-by-design is different from `clients` today, which is empty-by-neglect. Every table in this document has a clear owner (which agent writes to it) and a clear trigger (which event populates it).

10. **Prefer derived state over maintained state. Maintained state needs a janitor.** If a question can be answered by a view or a JOIN ("is this person currently a student of anything?"), don't add a column someone has to keep in sync. If a column must be maintained (pipeline stage), define its entry and exit criteria explicitly AND build a janitor that reconciles it on a cadence. **AI-maintained state that lacks a janitor will drift into bullshit within weeks.** The pipeline_entries.stage column is the canonical example — see Layer 5 § Stage transition rules + § Pipeline Janitor.

11. **Base tables are private; agents query views.** LLM-driven agents are bad at normalized 4NF traversal — they forget `WHERE ended_at IS NULL`, join on the wrong cardinality, and reinvent filter logic on every run. The physical schema is a backing store; a flat view layer (Layer 9) is the public interface for agent queries. Agent CLAUDE.md files reference views (`v_active_pipeline`, `v_party_contact_card`, `v_active_engagements`), never base tables (except for writes through controlled SQL helper functions).

12. **Idempotency is a write-path property, not an application concern.** Under AI agents + cron + webhooks + reapers, duplicates are the default failure mode, not the edge case. Every externally-triggered write has a `dedupe_key` or an external reference, and partial unique indexes enforce "at most one active thing" for every "active thing" concept (one active role per type, one active pipeline entry per program, one in-flight outbox push per target).

---

## v1.1 corrections (2026-04-11 review)

This section records the structural changes applied in v1.1 after independent critical reviews from two frontier models (GPT-5 Pro + Gemini 3.1 Pro) of the v1.0 draft. Each change is applied inline in the relevant layer below. This section is the changelog; the body of the document is the authoritative spec.

### Hard bugs fixed

- **Stage-history trigger would crash agent transactions.** v1.0 had `transitioned_by text NOT NULL` but also said "If unset, records NULL." If an agent forgot `SET LOCAL app.current_agent`, `current_setting(..., true)` returns NULL → NOT NULL constraint violation → agent transaction aborts → agents handle SQL errors extremely poorly. **Fix:** `COALESCE(current_setting('app.current_agent', true), 'unknown')` in the trigger body; `transitioned_by` stays NOT NULL. Day-one critical. See Layer 5 § Stage transition trigger.
- **`party_relationships.role_in_relationship` was uncontrolled.** v1.0 said "free-text OR references contact_roles lookup" — the exact string-drift the doc is trying to eliminate. **Fix:** split into `contact_role_key text REFERENCES contact_roles(key)` + `role_note text NULL`; also defines the `relationship_types` lookup table that v1.0 referenced but never declared. See Layer 1 § party_relationships.

### Merge semantics now enforced

- **v1.0 defined `merged_into` but never defined a redirect mechanism.** FKs could keep pointing at merged (loser) rows forever, silently reintroducing the Luna bug. **Fix:** merge procedure updates all child FKs to the survivor; loser row becomes a tombstone for external ID resolution only. A write-blocking trigger on every party-referencing table rejects inserts/updates where `parties.merged_into IS NOT NULL`. A `canonical_party_id(bigint)` SQL function follows the chain and is mandated in agent write paths. See Layer 1 § parties.

### Duplicate prevention across active state

- **v0 had no unique constraint on active pipeline entries, active roles, or in-flight outbox pushes.** AI retries + concurrent webhooks produce duplicates; the janitor's "merge older into newer" is lossy and complex. **Fix:** partial unique indexes on every "at most one active" concept:
  - `party_roles(party_id, role_type) WHERE ended_at IS NULL` — one active role per type
  - `pipeline_entries(party_id, program_id) WHERE stage NOT IN ('won','lost')` — one active pipeline entry per program
  - `plutio_outbox(entity_type, entity_id, operation, payload_hash) WHERE status IN ('pending','in_flight')` — no duplicate in-flight pushes
- Pipeline entries also gain a `dedupe_key text UNIQUE` column for externally-triggered idempotency (e.g. `gmail-thread:<id>:program:<slug>`).

### Email identity semantics reshaped

- **v1.0 had `party_emails.email UNIQUE` globally** — breaks on shared inboxes (`info@`, `billing@`, couples, assistants). **Fix:** uniqueness becomes per-party (`UNIQUE(party_id, email)`), and `resolve_party_by_email()` is replaced by two functions:
  - `resolve_parties_by_email(text) RETURNS SETOF bigint` — returns 0..N parties
  - `best_party_by_email(text) RETURNS bigint` — deterministic single result via `ORDER BY is_primary DESC, verified_at DESC NULLS LAST, first_seen_at ASC`
- Agents use `best_party_by_email()` for routing, `resolve_parties_by_email()` when disambiguation is required. See Layer 1 § party_emails.

### Interactions as the authoritative event backbone

- **v1.0 made `interactions.party_id` nullable with `ON DELETE SET NULL`**, which contradicted the "DB is authoritative" principle (interactions could become orphan facts). **Fix:**
  - `interactions.party_id` FK becomes `ON DELETE RESTRICT` — parties cannot be hard-deleted while interactions reference them
  - `interactions.party_id` stays nullable ONLY for explicit unresolved-intake state, paired with a new `unresolved_contact jsonb` column
  - `CHECK (party_id IS NOT NULL OR unresolved_contact IS NOT NULL)` prevents both-null rows
  - A dedicated "resolve-intake" agent workflow promotes `unresolved_contact` rows to real `party_id` values (never by agent inline judgment)

### External references as structured columns, not prefixed strings

- **v1.0 used `external_ref='trafft:12345'` in `interactions` and `documents`.** Breaks 1NF, agents have to `LIKE 'trafft:%'`, filtering by provider becomes error-prone. **Fix:** split into `source_provider text REFERENCES source_providers(key)` + `source_id text`, with a unique partial index on `(source_provider, source_id)`. Backwards lookup stays fast; provider filtering becomes an indexed equality.

### Derived state: `seats_filled` dropped

- **v1.0 had `program_variants.seats_filled` as a maintained column** — violates principle #10 and has race conditions on concurrent enrollment. **Fix:** drop the column, expose as a view (`v_program_variant_seats`) derived from `engagement_participants`.

### Writer identity protocol (connection-level session vars)

- Every agent DB session must `SET LOCAL app.current_agent`, `app.run_id`, `app.correlation_id` at connection open. These are readable via `current_setting('app.*', true)` from triggers and appear in audit history (`transitioned_by`, `plutio_outbox.correlation_id`, `interactions.metadata.run_id`). The wrapper that creates agent DB connections (new `src/business-db.ts` helper) sets these automatically so agent CLAUDE.md files never need to remember.

### Double-write protection for documents + interactions

- **v1.0 said "issuing a document creates a `documents` row AND an `interactions` row."** Two separate INSERTs = one of them gets forgotten. **Fix:** `fn_issue_document(party_id, kind, ...)` SQL function is the only way agents create documents. It atomically inserts both rows in a single transaction and returns the new `document_id`.

### Outbox payload shape enforced

- **v1.0 left `plutio_outbox.payload` as free-form jsonb** → agents will hallucinate schema shapes the reaper can't parse. **Fix:** per-operation JSON schema CHECK (or a BEFORE INSERT trigger that validates against a schema keyed on `operation`). The reaper rejects rows whose schema doesn't match before making the Plutio call.

### Trafft booking ↔ engagement reconciler

- **v1.0 relied on agents to set `interactions.engagement_id` on booking webhooks.** Trafft doesn't know our internal IDs, so every booking row lands with `engagement_id=NULL`, and "how many sessions are left in this package?" becomes unanswerable. **Fix:** add a Booking Reconciler row to the Pipeline Janitor table — a scheduled task that finds `interactions` with `channel='booking'` and `engagement_id IS NULL`, matches them to the party's active `coaching-package` engagements, and updates the row. Trafft time strings are converted to `timestamptz` using `persons.timezone` (not the host TZ) to prevent off-by-one-day boundary bugs on global calls.

### Layer 9 — Agent-facing views (new)

v1.1 introduces a formal "data mart" layer of flat views designed for LLM consumption. Agent CLAUDE.md files reference these views, never the base tables. New views in v1: `v_party_contact_card`, `v_active_pipeline`, `v_active_engagements`, `v_party_timeline`, `v_client_status`, `v_program_variant_seats`. See Layer 9 for definitions.

### Drift-risk guidance

- **JSONB dumping ground risk:** `context`/`metadata`/`notes` are for structured sidecars only, never status/state fields. If a piece of data needs filtering in a WHERE clause, it gets a typed column or a lookup table, never a JSON key.
- **`persons.key` write gate:** only staff can insert/update this column; enforced via role-based grant or a BEFORE trigger that checks `current_setting('app.current_agent')` is in an allow-list.
- **Terminal-stage companion fields:** entering `won` requires `won_at IS NOT NULL`; entering `lost` requires `lost_at IS NOT NULL` and `lost_reason IS NOT NULL`. Enforced by CHECK constraint, not convention.

---

## The layered model (overview)

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1 — IDENTITY                                         │
│  parties, persons, organizations, party_emails,             │
│  party_phones, party_handles                                │
│                                                             │
│  "Who is this?"                                             │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  Layer 2 — ROLES                                            │
│  party_roles                                                │
│                                                             │
│  "What are they to us, and since when?"                     │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  Layer 3 — CATALOG (what we offer)                          │
│  programs, program_variants                                 │
│                                                             │
│  "What do we sell or deliver?"                              │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  Layer 4 — ENGAGEMENTS (concrete delivery)                  │
│  engagements, engagement_participants                       │
│                                                             │
│  "What are we actually doing with them right now?"          │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  Layer 5 — PIPELINE (pre-sale funnel)                       │
│  pipeline_entries, pipeline_stage_history                   │
│                                                             │
│  "Where are they in the funnel, for which program?"         │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  Layer 6 — INTERACTIONS (unified event log)                 │
│  interactions                                               │
│                                                             │
│  "What has happened with them?"                             │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  Layer 7 — DOCUMENTS                                        │
│  documents                                                  │
│                                                             │
│  "What proposals, contracts, invoices, receipts exist?"     │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  Layer 8 — SYNC                                             │
│  plutio_refs, plutio_outbox                                 │
│                                                             │
│  "How does this flow to/from Plutio?"                       │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  Layer 9 — AGENT-FACING VIEWS (data mart)                   │
│  v_party_contact_card, v_active_pipeline,                   │
│  v_active_engagements, v_party_timeline,                    │
│  v_client_status, v_program_variant_seats                   │
│                                                             │
│  "The public interface for AI agent queries."               │
└─────────────────────────────────────────────────────────────┘
```

Each layer is independent of the layers above it in terms of write ordering — creating an interaction does not require first creating a pipeline entry, for example. The layers are a conceptual organization, not a write-order dependency.

**Layer 9 is special:** it is the only layer agent CLAUDE.md files should reference for reads. Writes still go through base tables (via controlled SQL helper functions where multi-row atomicity is needed), but read queries target the views so agents don't have to reimplement join logic or remember `ended_at IS NULL` filters.

---

## Layer 1 — Identity

The stable "who" layer. These tables change rarely after a party is created. Name corrections, email additions, phone updates — but never identity changes.

### `parties`

The abstract root. A party is either a person or an organization, and the rest of the system refers to party_id as the universal foreign key.

| column | type | notes |
|---|---|---|
| `id` | `bigserial PK` | Our internal canonical identity. Never exposed to external systems as the key. |
| `party_type` | `party_type_t NOT NULL` | Enum: `person`, `organization`. |
| `canonical_name` | `text NOT NULL` | The display name we use. For persons, typically "First Last". For orgs, legal or common name. Mutable. |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | Trigger-maintained. |
| `merged_into` | `bigint NULL REFERENCES parties(id)` | If this party was deduped/merged, points at the surviving party. Soft-delete semantic. |
| `merged_at` | `timestamptz NULL` | When the merge happened. Paired with `merged_into` — both NULL or both set. |

Constraint:

```sql
ALTER TABLE parties
  ADD CONSTRAINT parties_merge_consistent
  CHECK ((merged_into IS NULL AND merged_at IS NULL) OR
         (merged_into IS NOT NULL AND merged_at IS NOT NULL));
```

**Why `merged_into` and not hard delete:** when a party is merged, the loser row is kept as a **tombstone** for external-ID resolution only. The Plutio sync layer can still find "what Plutio ID did the old duplicate Luna have before we merged her" via `plutio_refs` keyed on the loser's party_id.

### Merge procedure (authoritative)

v1.0 left this ambiguous and the reviewers caught it: "keeping the row with a pointer preserves referential integrity" was wrong, because FKs pointing at the loser row would remain pointing at the loser — silently reintroducing the Luna bug in a different shape.

v1.1 merge invariant: **after a merge completes, no child FK anywhere in the database points at the loser row, except for `plutio_refs` which is intentional (for reverse-lookup of historical Plutio IDs).**

The merge is implemented as a SQL function that runs in a single transaction:

```sql
CREATE OR REPLACE FUNCTION fn_merge_parties(p_loser bigint, p_winner bigint, p_reason text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_loser = p_winner THEN RAISE EXCEPTION 'cannot merge a party into itself'; END IF;

  -- Refuse to merge into a party that is itself merged
  IF EXISTS (SELECT 1 FROM parties WHERE id = p_winner AND merged_into IS NOT NULL) THEN
    RAISE EXCEPTION 'winner party % is itself merged; use canonical_party_id first', p_winner;
  END IF;

  -- Redirect every table that references parties. This list is authoritative and
  -- must be kept in sync with the schema. The migration plan file enumerates it.
  UPDATE party_emails         SET party_id = p_winner WHERE party_id = p_loser;
  UPDATE party_phones         SET party_id = p_winner WHERE party_id = p_loser;
  UPDATE party_handles        SET party_id = p_winner WHERE party_id = p_loser;
  UPDATE party_relationships  SET from_party_id = p_winner WHERE from_party_id = p_loser;
  UPDATE party_relationships  SET to_party_id   = p_winner WHERE to_party_id   = p_loser;
  UPDATE party_roles          SET party_id = p_winner WHERE party_id = p_loser;
  UPDATE pipeline_entries     SET party_id = p_winner WHERE party_id = p_loser;
  UPDATE engagement_participants SET party_id = p_winner WHERE party_id = p_loser;
  UPDATE documents            SET party_id = p_winner WHERE party_id = p_loser;
  UPDATE interactions         SET party_id = p_winner WHERE party_id = p_loser;
  -- plutio_refs is INTENTIONALLY left alone: the loser's Plutio ID is preserved
  -- so reverse lookups from Plutio webhooks still resolve to the winner via
  -- canonical_party_id().

  -- Tombstone the loser
  UPDATE parties
    SET merged_into = p_winner, merged_at = now(), updated_at = now()
  WHERE id = p_loser;

  -- Record the merge as an interaction event on the winner for auditability
  INSERT INTO interactions (party_id, channel, direction, occurred_at, subject, metadata)
  VALUES (p_winner, 'note', 'internal', now(),
          format('party merge: %s → %s', p_loser, p_winner),
          jsonb_build_object('reason', p_reason, 'loser_party_id', p_loser));
END $$;
```

The authoritative redirect list above is kept in sync with the schema by the migration plan file — any new table with a `party_id`-style FK must be added to `fn_merge_parties` in the same migration. (A migration-test verifies this by pg_catalog introspection.)

### `canonical_party_id()` — required in all agent write paths

Even with the merge procedure, webhooks and reapers can arrive with stale IDs after a merge. A resolver function walks the `merged_into` chain:

```sql
CREATE OR REPLACE FUNCTION canonical_party_id(p_id bigint)
RETURNS bigint LANGUAGE sql STABLE AS $$
  WITH RECURSIVE chain(id, next_id, depth) AS (
    SELECT id, merged_into, 0 FROM parties WHERE id = p_id
    UNION ALL
    SELECT p.id, p.merged_into, c.depth + 1
    FROM parties p JOIN chain c ON c.next_id = p.id
    WHERE c.depth < 32  -- cycle guard; a merge chain of depth 32 is already pathological
  )
  SELECT id FROM chain WHERE next_id IS NULL LIMIT 1;
$$;
```

Agents never write `party_id = $1`; they write `party_id = canonical_party_id($1)`. Agent CLAUDE.md query snippets are updated accordingly.

### Write-blocking trigger on merged parties

To prevent new writes from accumulating on tombstones despite agent drift, every table that has a `party_id` FK gets a BEFORE INSERT/UPDATE trigger:

```sql
CREATE OR REPLACE FUNCTION fn_reject_writes_to_merged_party() RETURNS trigger AS $$
BEGIN
  IF NEW.party_id IS NOT NULL AND
     EXISTS (SELECT 1 FROM parties WHERE id = NEW.party_id AND merged_into IS NOT NULL) THEN
    RAISE EXCEPTION 'party % is merged into %, use canonical_party_id()',
      NEW.party_id, (SELECT merged_into FROM parties WHERE id = NEW.party_id);
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
```

Attached to `party_emails`, `party_phones`, `party_handles`, `party_roles`, `pipeline_entries`, `engagement_participants`, `documents`, `interactions`, `party_relationships` (both ends). Cost is a single hash lookup per write. This is the backstop that makes the Luna-bug-reintroduction-via-stale-id impossible.

### `persons`

1:1 subtype of `parties` where `party_type='person'`. Person-specific fields live here to keep `parties` narrow.

| column | type | notes |
|---|---|---|
| `party_id` | `bigint PK REFERENCES parties(id) ON DELETE RESTRICT` | 1:1 with parties. |
| `first_name` | `text` | |
| `last_name` | `text` | |
| `preferred_name` | `text NULL` | "Call me Cherie", overrides first_name in salutations. |
| `pronouns` | `text NULL` | |
| `timezone` | `text NULL` | IANA tz — "America/Chicago", "Europe/Rome". |
| `country` | `text NULL` | ISO-3166-1 alpha-2. |
| `languages` | `text[] NULL` | For agent tone and translation hints. |
| `linkedin_url` | `text NULL` | |
| `key` | `text NULL UNIQUE` | Short alias for agent-prompt references. NULL for most people. Set for staff and frequent collaborators: `alex`, `cherie`, `kalina`, `karen`, `toni`. Agents reference people by key in their prompts rather than by party_id. Note: Kalina's name is spelled with a K (Kalina Terzieva, Bulgarian). |
| `tandemweb_coach_slug` | `text NULL` | Superficial link to a coach's page on tandemweb. If set, tandemweb is the source of truth for that coach's bio, photo, long-form content, and about-us presence. This DB does NOT mirror or enrich tandemweb bio data (see Resolved Decisions § #3). |
| `notes` | `text NULL` | Free-form, for anything that doesn't fit. |

### `organizations`

1:1 subtype of `parties` where `party_type='organization'`.

| column | type | notes |
|---|---|---|
| `party_id` | `bigint PK REFERENCES parties(id) ON DELETE RESTRICT` | |
| `legal_name` | `text NULL` | |
| `industry` | `text NULL` | |
| `size_bucket` | `text NULL` | "1-10", "11-50", "51-200", "201-1000", "1000+". |
| `website` | `text NULL` | |
| `tax_id` | `text NULL` | EIN / VAT / equivalent. |
| `notes` | `text NULL` | |

### `party_emails`

This is where the Luna problem is solved. Many emails per party — **and one email can belong to more than one party** (shared inboxes, couples, assistants). v1.1 reshaped this after the frontier-model review caught that globally-unique email breaks on `info@`, `billing@`, family addresses, etc.

| column | type | notes |
|---|---|---|
| `id` | `bigserial PK` | |
| `party_id` | `bigint NOT NULL REFERENCES parties(id) ON DELETE CASCADE` | When a party is hard-deleted (rare), emails go with it. |
| `email` | `citext NOT NULL` | `citext` is the case-insensitive text type. Luna.Tovaglieri@... and luna.tovaglieri@... collapse to one match. |
| `is_primary` | `boolean NOT NULL DEFAULT false` | Exactly one primary per party, enforced by partial unique index. |
| `verified_at` | `timestamptz NULL` | Set when we confirm the email works (received a reply, opt-in click, etc). |
| `first_seen_source` | `text NOT NULL` | Where we learned of this email — 'contact-form', 'gmail-inbound', 'trafft-booking', 'stripe-payment', 'manual', 'plutio-sync'. |
| `first_seen_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |

Indexes:
- `CREATE UNIQUE INDEX ON party_emails (party_id, email);` — one row per (party, email) pair. An email can appear on multiple parties; the same party cannot have the same email twice.
- `CREATE UNIQUE INDEX ON party_emails (party_id) WHERE is_primary;` — exactly one primary per party.
- `CREATE INDEX ON party_emails (email);` — the hot lookup path for inbound emails.

**Why not globally unique:** shared mailboxes exist. `billing@client-org.com` could legitimately be on both the organization's party AND the point-of-contact person's party. A couple's `family@` might be on both spouses. Globally-unique forces us to invent fake "shared" parties or to merge unrelated people, either of which pollutes identity.

### Lookup functions (replace every `WHERE email = $1` query in agent CLAUDE.md files)

**Plural resolver** — returns 0..N parties. Use when disambiguation is the caller's job.

```sql
CREATE OR REPLACE FUNCTION resolve_parties_by_email(p_email text)
RETURNS SETOF bigint LANGUAGE sql STABLE AS $$
  SELECT DISTINCT canonical_party_id(party_id)
  FROM party_emails
  WHERE email = p_email::citext;
$$;
```

**Best-guess resolver** — returns exactly one party_id (or NULL), deterministically. Use for routing where a single answer is required.

```sql
CREATE OR REPLACE FUNCTION best_party_by_email(p_email text)
RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT canonical_party_id(party_id)
  FROM party_emails
  WHERE email = p_email::citext
  ORDER BY is_primary DESC,
           verified_at DESC NULLS LAST,
           first_seen_at ASC,
           party_id ASC  -- final tiebreaker for determinism
  LIMIT 1;
$$;
```

Both resolvers run `canonical_party_id()` on the result so merged (tombstoned) parties are transparently redirected to their survivors. Agents never see loser party IDs.

**Agent guidance:**
- Routing a single inbound email to one party → `best_party_by_email('...')`
- "Who are all the parties that could own this address?" (e.g., during merge review or ambiguous intake) → `resolve_parties_by_email('...')`
- Never join on `email` directly; always go through a resolver.

### `party_phones`

Same pattern as `party_emails`.

| column | type | notes |
|---|---|---|
| `id` | `bigserial PK` | |
| `party_id` | `bigint NOT NULL REFERENCES parties(id) ON DELETE CASCADE` | |
| `phone_e164` | `text NOT NULL` | E.164 format: +14155551234. |
| `label` | `text NULL` | 'mobile', 'office', 'whatsapp'. |
| `is_primary` | `boolean NOT NULL DEFAULT false` | |
| `verified_at` | `timestamptz NULL` | |
| `first_seen_source` | `text NOT NULL` | |
| `first_seen_at` | `timestamptz NOT NULL DEFAULT now()` | |

### `party_handles`

Social/messaging handles that aren't emails or phones. LinkedIn, X/Twitter, Slack user IDs, Discord tags.

| column | type | notes |
|---|---|---|
| `id` | `bigserial PK` | |
| `party_id` | `bigint NOT NULL REFERENCES parties(id) ON DELETE CASCADE` | |
| `platform` | `text NOT NULL` | 'linkedin', 'twitter', 'slack', 'discord', 'instagram', etc. |
| `handle` | `text NOT NULL` | The identifier on that platform. |
| `url` | `text NULL` | Direct link if known. |
| `first_seen_source` | `text NOT NULL` | |
| `first_seen_at` | `timestamptz NOT NULL DEFAULT now()` | |

Composite unique: `(platform, handle)` — one party per platform handle.

### `party_relationships`

Connections between two parties, with a role-in-relationship descriptor. This is how we model "person works at / represents / is employed by / is billing contact for an organization," and it's also how we model "coach serves client" or "mentor pairs with student" outside of engagement rosters.

Plutio's company-contact model is the inspiration: their `contact belongs to company` with a free-form "role at company" field. We extend it with a controlled set of role_in_relationship values so billing contacts and contracting contacts are first-class.

| column | type | notes |
|---|---|---|
| `id` | `bigserial PK` | |
| `from_party_id` | `bigint NOT NULL REFERENCES parties(id) ON DELETE CASCADE` | The "subject" of the relationship — usually a person. |
| `to_party_id` | `bigint NOT NULL REFERENCES parties(id) ON DELETE CASCADE` | The "object" — usually an organization, but can be another person. |
| `relationship_type` | `text NOT NULL REFERENCES relationship_types(key)` | 'employed-by', 'represents', 'affiliated-with', 'refers', 'reports-to', 'coaches'. |
| `contact_role_key` | `text NULL REFERENCES contact_roles(key)` | For org relationships: the person's controlled role inside that org. FK-enforced, no free text. One of `billing-contact`, `contracting-contact`, etc. (see lookup below). |
| `role_note` | `text NULL` | Free-form annotation paired with `contact_role_key`. Use this for "billing contact but only for the US entity" style nuance that doesn't warrant a new lookup value. Never used for filtering. |
| `is_primary_contact` | `boolean NOT NULL DEFAULT false` | One "primary" contact per org — the default person to contact. |
| `started_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `ended_at` | `timestamptz NULL` | NULL = currently active. Time-bounded like roles. |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | Structured sidecars only (per principle #11). Never stage/status. |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |

**v1.1 correction:** v1.0 defined `role_in_relationship` as "free-text OR references contact_roles" — exactly the string-drift this document tries to eliminate. v1.1 splits it into the FK-enforced `contact_role_key` column and a separate `role_note` annotation. Agents MUST use `contact_role_key` for any routing filter; `role_note` is display-only.

Indexes:
- `CREATE INDEX ON party_relationships (to_party_id, relationship_type) WHERE ended_at IS NULL;` — "find all current employees of ThoughtSpot"
- `CREATE INDEX ON party_relationships (from_party_id) WHERE ended_at IS NULL;` — "what orgs is this person currently affiliated with?"
- `CREATE UNIQUE INDEX ON party_relationships (to_party_id) WHERE is_primary_contact AND ended_at IS NULL;` — at most one active primary contact per org

### `relationship_types` (lookup)

Controlled set of relationship kinds between parties. v1.0 referenced this table in the `party_relationships.relationship_type` FK but never declared it — reviewer flagged as a hard correctness hole. Fixed in v1.1.

| key | meaning |
|---|---|
| `employed-by` | Person works for organization. The most common relationship for contact cards. |
| `represents` | Person acts as the public-facing agent/rep for an org or another person. |
| `affiliated-with` | Looser association than employment — advisor, board member, alumni. |
| `refers` | One party refers leads to another (used to track referral sources). |
| `reports-to` | Internal hierarchy within a party's employment (e.g., Courtney reports to their manager at ThoughtSpot). |
| `coaches` | Outside of formal engagement participation — e.g., informal coaching, mentorship relationships. |
| `partnered-with` | Business partnership between two orgs we work with. |

Lookup row shape:

| column | type | notes |
|---|---|---|
| `key` | `text PK` | |
| `label` | `text NOT NULL` | Human-readable. |
| `description` | `text NOT NULL` | Plain-language explanation for agent prompts. |
| `enabled` | `boolean NOT NULL DEFAULT true` | |

### `contact_roles` (lookup — the Plutio-extension value)

Controlled set of "this person's role inside that organization." Plutio has a free-text field here; we use a controlled vocabulary so agents can route accordingly.

| key | meaning |
|---|---|
| `primary-contact` | Default person to contact for anything. |
| `billing-contact` | Receives invoices and payment reminders. |
| `contracting-contact` | Signs contracts and legal documents. |
| `technical-contact` | Handles technical/integration questions. |
| `decision-maker` | Has authority to approve purchases. |
| `participant` | Will be in the engagement but isn't the buyer. |
| `champion` | Internal advocate for our services. |
| `gatekeeper` | Screens inquiries before they reach decision-makers. |
| `assistant` | Scheduling and logistics on behalf of someone else. |
| `other` | Use sparingly — annotate in `role_note`. |

### Why we reversed course on `party_relationships`

Original proposal deferred this table as premature. Alex's review surfaced the value: Plutio has this pattern, and even if Plutio's implementation is shallow, the structure unlocks things like "send the invoice to the billing-contact at ThoughtSpot, not Courtney (who is the decision-maker)" or "when negotiating the contract, loop in the contracting-contact by default."

This is exactly the kind of "intelligence layer above Plutio" we want to build. It's a table, not a refactor, and it buys us useful agent routing decisions.

**What we still don't do:** we don't track every person who's ever mentioned a company in an email. `party_relationships` rows only exist when there's an intentional, ongoing relationship between the party and the organization. Casual company mentions stay as `metadata` context on interactions.

---

## Layer 2 — Roles

A party's role is what they ARE to us at a given point in time. Roles overlap, roles change, roles end. A human being (Kalina) can simultaneously be a client, a coach, and a trainer. The model must allow that without duplicating the person.

### `party_roles`

| column | type | notes |
|---|---|---|
| `id` | `bigserial PK` | |
| `party_id` | `bigint NOT NULL REFERENCES parties(id) ON DELETE CASCADE` | |
| `role_type` | `text NOT NULL REFERENCES role_types(key)` | Lookup table, not enum — role types grow over time. |
| `started_at` | `timestamptz NOT NULL` | When this role began. |
| `ended_at` | `timestamptz NULL` | NULL = currently active. |
| `context` | `jsonb NOT NULL DEFAULT '{}'` | Role-specific fields. See examples below. |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |

Indexes:
- `CREATE INDEX ON party_roles (party_id, role_type);`
- `CREATE INDEX ON party_roles (role_type) WHERE ended_at IS NULL;` (find all current coaches, etc.)
- `CREATE UNIQUE INDEX ON party_roles (party_id, role_type) WHERE ended_at IS NULL;` — **at most one ACTIVE role of each type per party** (partial unique index). Historical rows are unconstrained.

**Overlapping roles are expected — across role types.** A party has (coach + trainer + vendor) simultaneously; that's four active rows with four different `role_type` values. What's NOT allowed is two simultaneously active `coach` rows for the same party. Historically, someone who was a coach, stopped, and started again has two rows — the old one with `ended_at` set, the new one with `ended_at IS NULL` — and the partial unique index permits this cleanly.

**v1.1 correction:** v1.0 explicitly rejected a UNIQUE constraint here. Frontier-model review (Gemini 3.1 Pro) pointed out that without any constraint, an AI agent loop on a retry-happy error path can insert 14 active `prospect` rows for the same party in an afternoon. The partial unique index is the correct compromise: historical churn is preserved, active state is enforced.

### `role_types` (lookup table)

| column | type | notes |
|---|---|---|
| `key` | `text PK` | Short key: 'prospect', 'client', 'coach', 'vendor', etc. |
| `label` | `text NOT NULL` | Human-readable: "Prospect", "Client", "Coach". |
| `description` | `text NOT NULL` | What this role means in plain language. |
| `category` | `text NOT NULL` | 'buyer', 'provider', 'internal', 'other' — coarse grouping. |
| `is_person_only` | `boolean NOT NULL DEFAULT false` | 'coach' and 'staff' don't apply to orgs; 'vendor' and 'partner' can be either. |
| `enabled` | `boolean NOT NULL DEFAULT true` | |

Seed values (the canonical set — see glossary for details). **Note: `student` and `alumni` are deliberately NOT role types** — everyone who buys anything is a `client`, and what they bought (and whether they're actively learning in a cohort) is captured in `engagement_participants`. See Resolved Decisions § #1-2.

| key | category | is_person_only |
|---|---|---|
| `prospect` | buyer | false |
| `client` | buyer | false |
| `coach` | provider | true |
| `trainer` | provider | true |
| `mentor` | provider | true |
| `supervisor` | provider | true |
| `vendor` | provider | false |
| `partner` | provider | false |
| `staff` | internal | true |
| `contact` | other | false |

**Why a lookup table instead of an enum:** adding a new role type tomorrow (e.g., "beta tester", "advisory board member") should not require a schema migration. Lookup table is a simple insert. Enforced via FK.

### Role context examples

The `context` JSONB holds role-specific metadata without requiring new columns:

```json
// role_type='prospect'
{ "primary_interest": "ACTC", "icf_level_current": "PCC", "source_campaign": "spring-2026" }

// role_type='client' (lightweight — most client detail lives in engagements)
{ "lifetime_value_cents": 450000, "first_purchase_at": "2023-01-15" }

// role_type='coach' (drives tandemweb bio content)
{ "credentials": ["PCC", "CPCC"], "specialties": ["executive", "team"], "bio_short": "...", "bio_long": "...", "photo_url": "...", "linkedin": "...", "max_clients": 8 }

// role_type='vendor' (SaaS example)
{ "vendor_kind": "saas", "monthly_cost_usd": 49, "renewal_date": "2026-12-31" }

// role_type='vendor' (contractor example — Toni the EA)
{ "vendor_kind": "contractor", "specialty": "executive-assistant", "contract_terms": "monthly-retainer" }
```

Queries against `context` use Postgres `jsonb` operators (`->>`, `@>`). Not indexed by default; add GIN indexes when a specific query pattern emerges.

---

## Layer 3 — Catalog (what we offer)

Slowly-changing reference data: the programs we sell and deliver.

### `programs`

The abstract offering. "ACC Level 1" is a program. Every cohort of it is a `program_variant` or an `engagement` (discussed below).

| column | type | notes |
|---|---|---|
| `id` | `bigserial PK` | |
| `key` | `text NOT NULL UNIQUE` | Short slug: 'acc-level-1', 'pcc-bridge', 'actc-full'. Used in URLs and agent references. |
| `name` | `text NOT NULL` | Display name. |
| `kind` | `text NOT NULL REFERENCES program_kinds(key)` | Lookup: 'cohort', 'self-paced', 'coaching-service', 'mentor-service', 'supervision', 'certification'. |
| `icf_level` | `text NULL` | 'ACC', 'PCC', 'MCC', or NULL. |
| `description` | `text NULL` | |
| `duration_weeks` | `integer NULL` | NULL for open-ended services. |
| `base_price_cents` | `integer NULL` | Informational — actual price per variant. |
| `currency` | `text NOT NULL DEFAULT 'USD'` | |
| `status` | `text NOT NULL DEFAULT 'active'` | `active`, `archived`, `draft`. |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | |

### `program_variants`

A specific instance — a cohort with dates, a pricing tier, a regional offering.

| column | type | notes |
|---|---|---|
| `id` | `bigserial PK` | |
| `program_id` | `bigint NOT NULL REFERENCES programs(id)` | |
| `key` | `text NOT NULL` | 'acc-2026-q2' — unique within program. |
| `name` | `text NOT NULL` | 'ACC Level 1 — April 2026 Cohort'. |
| `start_date` | `date NULL` | |
| `end_date` | `date NULL` | |
| `seats_total` | `integer NULL` | Capacity if the variant is capped. NULL = no cap. |
| `price_cents` | `integer NOT NULL` | Overrides `programs.base_price_cents`. |
| `status` | `text NOT NULL DEFAULT 'planned'` | `planned`, `open`, `closed`, `in-progress`, `completed`, `cancelled`. |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | |

Composite unique: `(program_id, key)`.

**v1.1 correction — `seats_filled` dropped.** v1.0 had a `seats_filled integer NOT NULL DEFAULT 0` column "maintained by trigger or application." This violates principle #10 (prefer derived state) and has race conditions on concurrent enrollment. v1.1 derives it from `engagement_participants`:

```sql
CREATE VIEW v_program_variant_seats AS
SELECT
  pv.id AS program_variant_id,
  pv.seats_total,
  COUNT(*) FILTER (
    WHERE ep.participant_role = 'student' AND ep.ended_at IS NULL
  ) AS seats_filled,
  pv.seats_total - COUNT(*) FILTER (
    WHERE ep.participant_role = 'student' AND ep.ended_at IS NULL
  ) AS seats_remaining
FROM program_variants pv
LEFT JOIN engagements e ON e.program_variant_id = pv.id AND e.status IN ('planned','active')
LEFT JOIN engagement_participants ep ON ep.engagement_id = e.id
GROUP BY pv.id, pv.seats_total;
```

Agents asking "how many seats left in PCC Q2 2026?" query `v_program_variant_seats`. It is always correct by definition. No maintenance drift possible.

---

## Layer 4 — Engagements

Where catalog meets reality. An engagement is a concrete thing we're doing with a party (or a set of parties).

### `engagements`

| column | type | notes |
|---|---|---|
| `id` | `bigserial PK` | |
| `program_variant_id` | `bigint NULL REFERENCES program_variants(id)` | NULL for bespoke/ad-hoc engagements. |
| `kind` | `text NOT NULL REFERENCES engagement_kinds(key)` | Lookup: 'cohort-delivery', 'coaching-package', 'mentor-pair', 'supervision-series', 'speaking-gig', 'bespoke'. |
| `name` | `text NOT NULL` | Human-readable: 'PCC Cohort Q2 2026', 'Luna ACTC coaching package'. |
| `status` | `text NOT NULL DEFAULT 'planned'` | `planned`, `active`, `completed`, `cancelled`, `on-hold`. |
| `started_at` | `timestamptz NULL` | |
| `ended_at` | `timestamptz NULL` | |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | Engagement-kind-specific fields. |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | |

### `engagement_participants`

Who is in the engagement, and in what capacity. A cohort has 15 students + 1-2 instructors + maybe a mentor. All one `engagement_id`, N rows.

| column | type | notes |
|---|---|---|
| `id` | `bigserial PK` | |
| `engagement_id` | `bigint NOT NULL REFERENCES engagements(id) ON DELETE CASCADE` | |
| `party_id` | `bigint NOT NULL REFERENCES parties(id) ON DELETE RESTRICT` | Cannot delete a party that's in an engagement. |
| `participant_role` | `text NOT NULL REFERENCES participant_roles(key)` | 'student', 'instructor', 'mentor', 'supervisor', 'observer', 'client', 'coach'. |
| `started_at` | `timestamptz NOT NULL` | |
| `ended_at` | `timestamptz NULL` | |
| `seat_cost_cents` | `integer NULL` | What the participant paid (students) or was paid (instructors). |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | e.g., seat number, assessment scores. |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |

Composite unique: `(engagement_id, party_id, participant_role)` — a party can't hold the same role twice in the same engagement (but can hold different roles, e.g., mentor + observer).

### Example

- Cohort engagement: `engagements(id=42, program_variant_id=pcc-q2-2026, kind='cohort-delivery', name='PCC Cohort Q2 2026', status='active')`
- 12 students: 12 rows in `engagement_participants` with `participant_role='student'`
- 2 instructors (Cherie, Alex): 2 rows with `participant_role='instructor'`
- 1 observer (training new trainer): 1 row with `participant_role='observer'`

Total: 15 participants in one engagement, all sharing Layer 1 identity, all with clean time-boundedness.

---

## Layer 5 — Pipeline

The pre-sale funnel. A party can be in the funnel for multiple programs at the same time (Donovan is interested in Phase II; he could also be interested in ACC separately). That's why pipeline isn't a status column on `parties` — it's its own table with `(party_id, program_id)` as the effective key.

### `pipeline_entries`

| column | type | notes |
|---|---|---|
| `id` | `bigserial PK` | |
| `party_id` | `bigint NOT NULL REFERENCES parties(id) ON DELETE RESTRICT` | Never cascade; losing a party must not silently drop its funnel history. Use merge, not delete. |
| `program_id` | `bigint NOT NULL REFERENCES programs(id)` | |
| `stage` | `text NOT NULL REFERENCES pipeline_stages(key)` | 'new', 'qualified', 'sent', 'replied', 'won', 'lost'. Six stages, no more. See Resolved Decisions § #5-6. |
| `source` | `text NOT NULL` | 'contact-form', 'email', 'booking', 'event', 'referral'. |
| `dedupe_key` | `text NOT NULL UNIQUE` | Idempotency key for externally-triggered creation. Format: `<source>:<ext-id>:program:<program-key>`, e.g. `gmail-thread:19d7cf3b2b4bb86a:program:actc-full`. On retry, the second INSERT fails on the unique constraint and the caller recovers by reading the existing row. |
| `entered_funnel_at` | `timestamptz NOT NULL DEFAULT now()` | When they first appeared in the pipeline for this program. |
| `entered_stage_at` | `timestamptz NOT NULL DEFAULT now()` | When they entered the CURRENT stage. Reset on stage transition. |
| `won_at` | `timestamptz NULL` | Set when stage transitions to 'won' (they bought). |
| `lost_at` | `timestamptz NULL` | Set when stage transitions to 'lost'. |
| `lost_reason` | `text NULL REFERENCES lost_reasons(key)` | Why they're lost. Distinguishes "explicit no" from "went silent" etc. — see glossary. |
| `assigned_to` | `bigint NULL REFERENCES parties(id)` | FK to a staff party (Alex, Cherie, or future staff). |
| `notes` | `text NULL` | |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | |

Indexes + constraints:

- `CREATE INDEX ON pipeline_entries (stage, entered_stage_at);` — watchdog queries like "find all leads stuck in `replied` for >5 days."
- `CREATE UNIQUE INDEX ON pipeline_entries (party_id, program_id) WHERE stage NOT IN ('won','lost');` — **at most one non-terminal pipeline entry per (party, program)**. Terminal entries (won, lost) are exempt so re-engagement creates a new row freely.
- Terminal-stage companion CHECK (v1.1):
  ```sql
  ALTER TABLE pipeline_entries ADD CONSTRAINT pipeline_terminal_shape CHECK (
    (stage = 'won'  AND won_at IS NOT NULL AND lost_at IS NULL AND lost_reason IS NULL) OR
    (stage = 'lost' AND lost_at IS NOT NULL AND lost_reason IS NOT NULL AND won_at IS NULL) OR
    (stage NOT IN ('won','lost') AND won_at IS NULL AND lost_at IS NULL AND lost_reason IS NULL)
  );
  ```

**v1.1 correction — duplicate prevention + idempotency.** Both frontier reviewers flagged this as the single highest-impact gap. v1.0 relied on the Janitor to "merge duplicates" — a lossy, complex operation. v1.1 prevents duplicates at the write path with a partial unique index and a `dedupe_key`. The Janitor still runs, but only catches edge cases (a pipeline_entries row with `stage='won'` but no corresponding `documents` row, for example), never duplicates.

**Terminal invariant:** once a row has `stage IN ('won','lost')`, it is immutable except for `notes`. The stage-transition trigger rejects updates that attempt to exit a terminal stage. Re-engagement is a NEW row.

### `pipeline_stage_history`

Event-sourced history of stage transitions. Every time `pipeline_entries.stage` changes, append a row here.

| column | type | notes |
|---|---|---|
| `id` | `bigserial PK` | |
| `pipeline_entry_id` | `bigint NOT NULL REFERENCES pipeline_entries(id) ON DELETE CASCADE` | |
| `from_stage` | `text NULL` | NULL for initial entry. |
| `to_stage` | `text NOT NULL` | |
| `transitioned_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `transitioned_by` | `text NOT NULL` | 'inbox-agent', 'sales-agent', 'mailman-agent', 'alex', 'cherie', 'booking-webhook', 'follow-up-cron'. |
| `reason` | `text NULL` | |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | |

This gives us "how long was Donovan in `replied` before someone did something?" queries for free, and an audit trail of who did what.

### Stage transition rules (must be enforced, not assumed)

Because agents maintain these stages — not humans — the model must specify **exactly** which event triggers which transition, and the pipeline must have unambiguous endpoints. Anything ambiguous will drift, and pipeline stages are the most visible symptom of drift (half-stuck leads are bullshit data that pollutes every query and report).

Each stage has an **entry criterion** (what causes a party to land here), an **exit criterion** (what causes them to leave), and an **expected agent** (which agent is responsible for the transition). A party that violates these rules is a data-quality incident the janitor catches.

| stage | entry criterion | exit criterion | expected transition agent |
|---|---|---|---|
| `new` | A contact-form submission, inbound email classified as a lead, or a direct consultation booking creates the pipeline_entries row | Triage decision by inbox agent: qualified → `qualified`, not a real lead → `lost` with `lost_reason='wrong-fit'` or `spam` | inbox |
| `qualified` | Inbox set `stage='qualified'` — the party is a genuine inquiry for this program | Sales sends initial info → `sent`. Sales disqualifies → `lost` with `lost_reason='wrong-fit'` | sales |
| `sent` | Mailman confirms an outbound email was sent (not when sales "approves" a draft — the gap in the current `approved` status gets fixed here) | Lead replies → `replied`. Follow-up cycle exhausts → `lost` with `lost_reason='went-silent'` | mailman (on send confirmation); sales follow-up cron (on exhaustion) |
| `replied` | Mailman detects a reply-match on inbound email that links to this pipeline_entries row (via thread_id or party_id lookup) | Sales drafts next response → back to `sent` on mailman confirm. Lead signs/pays → `won`. Lead explicitly declines → `lost` with `lost_reason='explicit-no'` | sales |
| `won` | A `documents` row with `kind='contract'` and `status='signed'` OR `kind='invoice'` with `status='paid'` is created for this pipeline_entry | TERMINAL. `won_at` is set. Creates or extends `role_type='client'` and an `engagements` row + `engagement_participants` row | contador (on payment) or sales (on contract signing) |
| `lost` | Any of: explicit decline, disqualification, 30+ days silence after final follow-up, marked duplicate, marked spam | TERMINAL. `lost_at` and `lost_reason` are set | inbox (spam/wrong-fit), sales (explicit-no, went-silent), janitor (exhausted follow-up) |

**Critical invariant: terminal stages are sticky.** `won` and `lost` entries are never re-entered. If a lost prospect comes back for a new program, that's a NEW `pipeline_entries` row with a new `program_id`. If a won client comes back for another product, also a new row. The history of each entry is preserved; old terminal entries are never reopened.

**Critical invariant: stage transitions emit history.** Every UPDATE to `pipeline_entries.stage` must be paired with an INSERT into `pipeline_stage_history`. This is enforced by a trigger, not by convention — agents can't forget because the trigger fires on UPDATE.

```sql
CREATE FUNCTION fn_pipeline_stage_history() RETURNS trigger AS $$
BEGIN
  -- Reject attempts to leave a terminal stage
  IF OLD.stage IN ('won', 'lost') AND NEW.stage IS DISTINCT FROM OLD.stage THEN
    RAISE EXCEPTION 'cannot transition out of terminal stage %; create a new pipeline_entries row instead', OLD.stage;
  END IF;

  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    INSERT INTO pipeline_stage_history
      (pipeline_entry_id, from_stage, to_stage, transitioned_at, transitioned_by, reason)
    VALUES
      (NEW.id, OLD.stage, NEW.stage, now(),
       COALESCE(current_setting('app.current_agent', true), 'unknown'),
       current_setting('app.current_reason', true));
    -- Reset entered_stage_at when the stage actually changes
    NEW.entered_stage_at := now();
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pipeline_stage_history
  BEFORE UPDATE ON pipeline_entries
  FOR EACH ROW EXECUTE FUNCTION fn_pipeline_stage_history();
```

**v1.1 correction — trigger hardening:**
- **COALESCE on `current_setting`:** v1.0 had `transitioned_by text NOT NULL` in `pipeline_stage_history` but relied on a nullable `current_setting()` result. If an agent forgot `SET LOCAL app.current_agent`, the NOT NULL constraint would fire and the agent's UPDATE would abort mid-transaction — a day-one production bug. v1.1 wraps the call in `COALESCE(..., 'unknown')` so the trigger never crashes the UPDATE.
- **Terminal-stage exit rejection:** v1.0 said "terminal stages are sticky" but had no enforcement. v1.1 raises an exception if an UPDATE attempts to transition out of `won` or `lost`.
- **`entered_stage_at` reset is now in the trigger**, not in application code (another maintained-state drift trap avoided).
- **Trigger is BEFORE UPDATE**, not AFTER, so the `entered_stage_at` reset actually takes effect.

### Writer identity protocol (connection-level session vars)

Every DB connection opened by an agent — whether from inside a container via psql or from host-side code via pg — MUST set three session variables at open time:

```sql
SET LOCAL app.current_agent = 'sales';        -- always required
SET LOCAL app.run_id        = 'nc-run-12345'; -- NanoClaw container run id
SET LOCAL app.correlation_id = 'abc-def-ghi'; -- IPC / webhook / cron correlation
```

These are read from triggers (`current_setting('app.current_agent', true)` returns NULL if unset — the trigger handles that via COALESCE) and by the `fn_*` SQL helpers. They flow into audit columns:

- `pipeline_stage_history.transitioned_by` ← `app.current_agent`
- `plutio_outbox.correlation_id` (new column) ← `app.correlation_id`
- `interactions.metadata.run_id` (via `fn_log_interaction`) ← `app.run_id`

**Implementation:** the TypeScript helper in `src/business-db.ts` that hands out connections to agent container-runner code sets all three automatically from the run context. Agents running raw `psql` inside their container get a shell wrapper (`bdb-psql`) that sets them before handing back a prompt. A BEFORE INSERT trigger on `pipeline_stage_history` (and any other audit-critical table) can optionally warn-log if `app.current_agent IS NULL` — configurable via a feature flag so we don't spam the log during migrations.

### The Pipeline Janitor (pipeline_janitor cron)

A mopping-up routine that runs on a cadence (every 6 hours — TBD) and fixes bullshit state. What it looks for and how it reacts:

| anomaly detected | action |
|---|---|
| `stage='new'` older than 24 hours | Warn to chief. Triage is stuck. |
| `stage='qualified'` older than 3 days with no interactions | Warn to sales. Lead is dropping through. |
| `stage='sent'` older than 30 days, `follow_up_count >= 3`, no reply | Auto-transition to `lost` with `lost_reason='went-silent'`. Log to pipeline_stage_history with `transitioned_by='janitor'`. |
| `stage='replied'` older than 5 days, no outbound interactions | Surface to `#gru-sales` for human response (the Donovan case — see § next subsection). |
| `stage='won'` but no `documents` row with paid/signed status | Warning. Either a human set it manually (acceptable — log the override) or there's a sync gap. Report both to chief. |
| `stage='lost'` but `lost_reason IS NULL` | Fix: set `lost_reason='other'` with a note. |
| `pipeline_entries` row exists but the party's `role_type='client'` is NULL and stage='won' | Error. `won` MUST produce a client role. Janitor creates the missing role retroactively. |
| Two active (non-terminal) `pipeline_entries` rows for the same `(party_id, program_id)` | **No longer possible** as of v1.1 — the partial unique index on `(party_id, program_id) WHERE stage NOT IN ('won','lost')` makes this a write-time error, not a janitor cleanup. If the janitor sees one, the index is corrupted and the right action is alert+halt. |
| `interactions.channel='booking'` AND `engagement_id IS NULL` AND party has an active `coaching-package` engagement for the same coach | **Booking Reconciler:** match the booking to the most-recent active coaching-package engagement for the party (one with the same coach if Trafft includes employee), set `interactions.engagement_id`. v1.1 added — Trafft webhooks land with NULL engagement because Trafft doesn't know our internal IDs. |
| `interactions` row with `unresolved_contact IS NOT NULL` older than 24h | **Resolve-intake:** surface to `#gru-inbox` for human review (or to the inbox agent for one more attempt). Never auto-create a new party — manual disambiguation only. Prevents identity re-fragmentation. |
| `plutio_outbox` row in `dead_letter` for >24h | Surface to chief as escalation. The reaper has given up; humans need to know. |

The janitor is the **only** component that can unilaterally transition a stage without a real-world event. Its transitions are always `transitioned_by='janitor'` so they're visible in history.

**v1.1 — timezone safety on Booking Reconciler:** when matching a booking to an engagement by time, the reconciler converts Trafft's local-time strings to `timestamptz` using the party's `persons.timezone` (NOT the host TZ, NOT `now()::timestamp`). Without this, global coaching calls hit off-by-one-day boundary bugs (a 9am Rome call becomes a 9am Chicago call after a naive cast). The conversion helper is in `tools/lib/booking_time.py`.

**Implementation note:** the janitor is not a new architectural thing. It's a scheduled task in `scheduled_tasks` with the prompt "Run the pipeline janitor — see DATA-MODEL.md § Pipeline Janitor." Which agent runs it is TBD (probably a new small "janitor" minion or just chief with a dedicated prompt).

### Stuck-lead watchdog (the Donovan gap)

The watchdog is a scheduled job (or sales agent enhancement) that runs:

```sql
SELECT pe.id, pe.party_id, pe.program_id, pe.stage, pe.entered_stage_at,
       p.canonical_name
FROM pipeline_entries pe
JOIN parties p ON p.id = pe.party_id
WHERE pe.stage = 'replied'
  AND pe.entered_stage_at < NOW() - INTERVAL '5 days'
  AND pe.assigned_to IS NOT NULL;
```

Stuck entries get surfaced to chief (legitimate escalation — the agent loop didn't respond in time) or to Alex directly. This replaces the chief-dispatches-tasks drift entirely.

---

## Layer 6 — Interactions

The unified event log. Everything that happened between us and a party flows here. This single table replaces `booking_events`, the event-log role of `payments`, and any ad-hoc per-channel message stores.

### `interactions`

| column | type | notes |
|---|---|---|
| `id` | `bigserial PK` | |
| `party_id` | `bigint NULL REFERENCES parties(id) ON DELETE RESTRICT` | NULL **only** for explicit unresolved-intake state (paired with `unresolved_contact`). NEVER null after resolve-intake. **v1.1: changed from `ON DELETE SET NULL` to `ON DELETE RESTRICT`** — interactions are the authoritative event backbone; orphaning them contradicts "DB is authoritative." Use merge, not delete. |
| `unresolved_contact` | `jsonb NULL` | When `party_id IS NULL`: the raw contact info we received (email, name, phone, source) so resolve-intake can promote this row to a real party_id later. CHECK ensures at least one of `(party_id, unresolved_contact)` is set. |
| `channel` | `text NOT NULL REFERENCES interaction_channels(key)` | 'email', 'meeting', 'call', 'form-submission', 'booking', 'payment', 'slack', 'document-signed', 'sms', 'whatsapp'. |
| `direction` | `text NOT NULL CHECK (direction IN ('inbound','outbound','internal'))` | 'internal' for things like "coach logged a note." |
| `occurred_at` | `timestamptz NOT NULL` | When the event happened (not when we recorded it). |
| `recorded_at` | `timestamptz NOT NULL DEFAULT now()` | When we wrote the row. |
| `thread_key` | `text NULL` | For grouping: gmail thread_id, meeting series id, stripe customer id. |
| `subject` | `text NULL` | Short description. Email subject, meeting title, payment descriptor. |
| `body_excerpt` | `text NULL` | First 500 chars of body. Searchable but not the full content. |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | Channel-specific structured sidecars (attachments list, phone duration, etc.). NEVER status/state — those are typed columns. |
| `source_provider` | `text NULL REFERENCES source_providers(key)` | Where this row came from: 'gmail', 'stripe', 'trafft', 'plutio', 'sertifier', 'manual', 'slack'. v1.1: replaces the prefixed `external_ref` string. |
| `source_id` | `text NULL` | The provider's own ID for this event: `19d7cf3b2b4bb86a` (gmail message id), `cs_xxx` (stripe session id), `12345` (trafft appointment id). v1.1: split out from `external_ref`. |
| `engagement_id` | `bigint NULL REFERENCES engagements(id) ON DELETE RESTRICT` | Tie to an engagement if applicable. Booking webhooks land with NULL — Booking Reconciler attaches them later. |
| `pipeline_entry_id` | `bigint NULL REFERENCES pipeline_entries(id) ON DELETE RESTRICT` | Tie to a pipeline entry if applicable. |
| `document_id` | `bigint NULL REFERENCES documents(id) ON DELETE RESTRICT` | For interactions like "document sent" or "document signed." |

Constraints + indexes:

- `CHECK (party_id IS NOT NULL OR unresolved_contact IS NOT NULL)` — never both null. v1.1: closes the orphan-fact loophole.
- `CHECK ((source_provider IS NULL) = (source_id IS NULL))` — both or neither.
- `CREATE INDEX ON interactions (party_id, occurred_at DESC);` — the hottest query path
- `CREATE UNIQUE INDEX ON interactions (source_provider, source_id) WHERE source_provider IS NOT NULL;` — dedupe (the same gmail message can't be ingested twice). v1.1: replaces the `external_ref`-based unique index.
- `CREATE INDEX ON interactions (thread_key) WHERE thread_key IS NOT NULL;`
- `CREATE INDEX ON interactions (channel, direction, occurred_at);`
- `CREATE INDEX ON interactions (unresolved_contact) WHERE unresolved_contact IS NOT NULL;` — fast scan for the resolve-intake worker

### `source_providers` (lookup)

v1.1: introduced when external_ref was split. Closed set; new providers require a one-row INSERT, not a migration.

| key | meaning |
|---|---|
| `gmail` | Inbound or outbound Gmail message (uses gmail message id). |
| `stripe` | Stripe payment / charge / session. |
| `trafft` | Trafft booking appointment. |
| `plutio` | Plutio entity (rarely the source — usually we push to it, but webhooks back from Plutio land here). |
| `sertifier` | Sertifier certificate issuance event. |
| `manual` | Hand-entered by a human or agent (no provider id required — `source_id` is a UUID we mint). |
| `slack` | Slack message (for parties that use our Slack). |
| `webform` | Contact form submission (`source_id` is the form submission UUID). |

### Resolve-intake workflow (replaces ad-hoc party creation)

When a webhook arrives whose contact info doesn't match any known party, agents are forbidden from "creating a new party as a guess." Instead:

1. Insert the `interactions` row with `party_id = NULL` and `unresolved_contact = jsonb_build_object('email', ..., 'name', ..., 'source', ..., 'received_at', ...)`.
2. The Booking Reconciler / Resolve-Intake janitor task (Layer 5) picks it up on the next run.
3. The resolver attempts an automated match (`best_party_by_email`, name fuzzy match on `persons.last_name`, phone match). If it finds a single confident match, it promotes the row and the matching party becomes `party_id`.
4. If there is no match or multiple matches, the row is surfaced to `#gru-inbox` for human disambiguation. Alex or Cherie clicks "this is Luna" or "this is a new person; create a party" and the worker handles the rest.

This eliminates the most common AI-agent identity-fragmentation pattern: "I don't recognize this email, so I'll create a new Luna." That's exactly the bug we just spent a day fixing.

### What belongs in `interactions` vs elsewhere

- **Belongs here:** the *event that happened.* "Luna booked a consultation." "Abhinav sent us an email." "Alex sent a reply." "Stripe charged $800." "Cherie had a meeting."
- **Does NOT belong here:** the resulting *state*. The consultation appointment itself (date, duration, location, Zoom link) lives in `engagements` or `metadata`. The reply body lives in our email system (or `body_excerpt` if short). The Stripe payment detail (amount, method, receipt) lives in `documents`. The meeting notes live in the vault.

**Rule of thumb:** `interactions` records WHAT happened and WHEN. Other tables record CURRENT STATE derived from those events.

---

## Layer 7 — Documents

Proposals, contracts, invoices, receipts, certificates. Anything with a "status" that represents a business artifact.

### `documents`

| column | type | notes |
|---|---|---|
| `id` | `bigserial PK` | |
| `kind` | `text NOT NULL REFERENCES document_kinds(key)` | 'proposal', 'contract', 'invoice', 'receipt', 'certificate', 'agreement'. |
| `party_id` | `bigint NOT NULL REFERENCES parties(id) ON DELETE RESTRICT` | The recipient/subject of the document. |
| `engagement_id` | `bigint NULL REFERENCES engagements(id) ON DELETE RESTRICT` | What engagement this document is for. Proposals precede engagements, so NULL is common. |
| `pipeline_entry_id` | `bigint NULL REFERENCES pipeline_entries(id) ON DELETE RESTRICT` | |
| `status` | `text NOT NULL REFERENCES document_statuses(key)` | 'draft', 'sent', 'viewed', 'signed', 'paid', 'overdue', 'void', 'cancelled', 'issued'. |
| `amount_cents` | `integer NULL` | |
| `currency` | `text NULL DEFAULT 'USD'` | |
| `issued_at` | `timestamptz NULL` | |
| `due_at` | `timestamptz NULL` | |
| `resolved_at` | `timestamptz NULL` | When status became terminal (paid, void, signed). |
| `source_provider` | `text NULL REFERENCES source_providers(key)` | v1.1: structured replacement for prefixed `external_ref`. 'plutio', 'stripe', 'sertifier', 'manual'. |
| `source_id` | `text NULL` | The provider's own ID for this document. |
| `file_path` | `text NULL` | Local cache if we pulled a PDF copy. |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | kind-specific structured sidecars (line items, signing history). NEVER status. |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | |

Constraints + indexes:
- `CHECK ((source_provider IS NULL) = (source_id IS NULL))`
- `CREATE INDEX ON documents (party_id, kind, status);`
- `CREATE UNIQUE INDEX ON documents (source_provider, source_id) WHERE source_provider IS NOT NULL;`
- Terminal-status companion CHECK:
  ```sql
  CHECK (
    (status IN ('paid','signed','void','cancelled') AND resolved_at IS NOT NULL) OR
    (status NOT IN ('paid','signed','void','cancelled') AND resolved_at IS NULL)
  )
  ```

**Relationship to interactions:** when a document is created, viewed, signed, or paid, an `interactions` row is appended with `document_id` set. So "the sequence of things that happened to this proposal" is a `SELECT * FROM interactions WHERE document_id = X ORDER BY occurred_at`.

### `fn_issue_document()` — atomic document + interaction creation

v1.1 correction: v1.0 said "issuing a document creates a `documents` row AND an `interactions` row." Two separate INSERTs from agent code = one of them gets forgotten under load, retry, or partial failure → fragmented timeline → "where did this document come from?" becomes unanswerable. v1.1 wraps both writes in a single SQL function that agents call instead of touching either table directly.

```sql
CREATE OR REPLACE FUNCTION fn_issue_document(
  p_party_id      bigint,
  p_kind          text,
  p_status        text,
  p_amount_cents  integer DEFAULT NULL,
  p_currency      text    DEFAULT 'USD',
  p_engagement_id bigint  DEFAULT NULL,
  p_pipeline_id   bigint  DEFAULT NULL,
  p_provider      text    DEFAULT NULL,
  p_provider_id   text    DEFAULT NULL,
  p_metadata      jsonb   DEFAULT '{}'::jsonb
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  v_canonical bigint;
  v_doc_id    bigint;
BEGIN
  v_canonical := canonical_party_id(p_party_id);
  IF v_canonical IS NULL THEN
    RAISE EXCEPTION 'fn_issue_document: party % not found', p_party_id;
  END IF;

  INSERT INTO documents
    (kind, party_id, engagement_id, pipeline_entry_id, status,
     amount_cents, currency, issued_at, source_provider, source_id, metadata)
  VALUES
    (p_kind, v_canonical, p_engagement_id, p_pipeline_id, p_status,
     p_amount_cents, p_currency, now(), p_provider, p_provider_id, p_metadata)
  RETURNING id INTO v_doc_id;

  INSERT INTO interactions
    (party_id, channel, direction, occurred_at, subject, source_provider, source_id,
     engagement_id, pipeline_entry_id, document_id, metadata)
  VALUES
    (v_canonical, 'document-signed', 'outbound', now(),
     format('%s issued', p_kind), p_provider, p_provider_id,
     p_engagement_id, p_pipeline_id, v_doc_id,
     jsonb_build_object('agent', current_setting('app.current_agent', true),
                        'run_id', current_setting('app.run_id', true)));

  -- Append to plutio outbox if Plutio cares about this kind
  IF p_kind IN ('proposal','contract','invoice','receipt') THEN
    INSERT INTO plutio_outbox (entity_type, entity_id, operation, payload, payload_hash, correlation_id)
    VALUES ('document', v_doc_id, 'create',
            jsonb_build_object('kind', p_kind, 'party_id', v_canonical, 'amount_cents', p_amount_cents),
            md5(jsonb_build_object('document', v_doc_id, 'op', 'create')::text),
            current_setting('app.correlation_id', true));
  END IF;

  RETURN v_doc_id;
END $$;
```

Agent CLAUDE.md files reference `SELECT fn_issue_document(...)` rather than INSERT statements. Three writes (document + interaction + outbox) become one atomic call. If any step fails, the transaction rolls back and nothing is half-written.

There are similar helpers for the other "must atomically write multiple rows" patterns:

- `fn_log_interaction(party, channel, direction, ...)` — for one-off interaction inserts; sets `metadata.run_id`/`metadata.agent` from session vars automatically
- `fn_create_pipeline_entry(party, program, source, dedupe_key, ...)` — atomically creates the entry and the initial `pipeline_stage_history` row
- `fn_advance_pipeline_stage(entry_id, new_stage, reason)` — wraps the UPDATE so the `app.current_reason` session var is set before the stage trigger fires

All write helpers are listed and specced in the schema migration plan file.

---

## Layer 8 — Plutio sync (the reliability layer)

This is the pattern that makes Plutio a sync target, not a dependency.

### `plutio_refs`

Maps our entities to their Plutio IDs. Read-only cache.

| column | type | notes |
|---|---|---|
| `entity_type` | `text NOT NULL` | 'party', 'engagement', 'document', 'interaction'. |
| `entity_id` | `bigint NOT NULL` | FK to the relevant table — cannot be a formal FK because the target table varies. |
| `plutio_entity_type` | `text NOT NULL` | 'contact', 'project', 'proposal', 'contract', 'invoice', 'note'. |
| `plutio_id` | `text NOT NULL` | |
| `plutio_url` | `text NULL` | Direct link — useful in Slack notifications. |
| `last_pushed_at` | `timestamptz NULL` | |
| `last_pulled_at` | `timestamptz NULL` | |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| | | PRIMARY KEY: `(entity_type, entity_id)` |

Also: `CREATE UNIQUE INDEX ON plutio_refs (plutio_entity_type, plutio_id);` — reverse lookup.

### `plutio_outbox`

Queue of pending pushes. Every write path that wants to sync to Plutio appends here in the same transaction as the local write.

| column | type | notes |
|---|---|---|
| `id` | `bigserial PK` | |
| `entity_type` | `text NOT NULL` | What local entity this push is about. |
| `entity_id` | `bigint NOT NULL` | |
| `operation` | `text NOT NULL REFERENCES plutio_outbox_operations(key)` | v1.1: FK-enforced. 'create', 'update', 'delete', 'add-note', 'log-activity'. |
| `payload` | `jsonb NOT NULL` | Snapshot of what to push. Immutable — retries use the same payload. v1.1: shape validated by per-operation CHECK (see below). |
| `payload_hash` | `text NOT NULL` | `md5(payload::text)`. Maintained by BEFORE INSERT trigger. Used for the in-flight dedupe partial unique. |
| `correlation_id` | `text NULL` | v1.1: from `app.correlation_id` session var. Lets us trace a single agent run across multiple outbox rows + audit logs. |
| `status` | `text NOT NULL DEFAULT 'pending'` | `pending`, `in_flight`, `done`, `dead_letter`. |
| `attempts` | `integer NOT NULL DEFAULT 0` | |
| `next_attempt_at` | `timestamptz NOT NULL DEFAULT now()` | Reaper only picks up rows where this is in the past. |
| `last_error` | `text NULL` | |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `resolved_at` | `timestamptz NULL` | |

Indexes:
- `CREATE INDEX ON plutio_outbox (status, next_attempt_at);` — reaper's hot query
- `CREATE INDEX ON plutio_outbox (entity_type, entity_id);` — debug: "show me all pending pushes for party X"
- `CREATE UNIQUE INDEX ON plutio_outbox (entity_type, entity_id, operation, payload_hash) WHERE status IN ('pending','in_flight');` — **v1.1: prevents duplicate in-flight pushes.** Two agents racing on the same entity → second INSERT silently dedupes against the first. Done/dead-letter rows are exempt so the same operation can re-fire after a successful prior push.

### v1.1 — payload shape validation

v1.0 left `payload` as free-form jsonb → AI agents WILL invent schema shapes the reaper can't parse → reaper gets stuck → outbox fills up → silent failure. v1.1 enforces a per-operation schema via a BEFORE INSERT trigger:

```sql
CREATE OR REPLACE FUNCTION fn_validate_outbox_payload() RETURNS trigger AS $$
DECLARE
  v_required text[];
  v_missing  text[];
BEGIN
  v_required := CASE NEW.operation
    WHEN 'create'      THEN ARRAY['kind','party_id']
    WHEN 'update'      THEN ARRAY['kind','plutio_id','fields']
    WHEN 'delete'      THEN ARRAY['kind','plutio_id']
    WHEN 'add-note'    THEN ARRAY['plutio_id','note_body']
    WHEN 'log-activity' THEN ARRAY['plutio_id','activity_type','occurred_at']
    ELSE ARRAY[]::text[]
  END;

  SELECT array_agg(k) INTO v_missing
  FROM unnest(v_required) k
  WHERE NOT (NEW.payload ? k);

  IF v_missing IS NOT NULL AND array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'plutio_outbox.payload missing required keys for operation %: %',
      NEW.operation, v_missing;
  END IF;

  -- Maintain payload_hash automatically
  NEW.payload_hash := md5(NEW.payload::text);
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_outbox_payload
  BEFORE INSERT ON plutio_outbox
  FOR EACH ROW EXECUTE FUNCTION fn_validate_outbox_payload();
```

The required-keys table is intentionally simple (no nested validation) — the reaper does the deep validation against the actual Plutio API contract. The trigger's job is to catch the obvious "the LLM made up a schema" failures at INSERT time, not to be a full JSON Schema validator.

### `plutio_outbox_operations` (lookup)

| key | meaning |
|---|---|
| `create` | New entity (party → Plutio contact, document → Plutio proposal, etc.). |
| `update` | Mutate an existing entity by Plutio ID. |
| `delete` | Soft-delete in Plutio. We rarely use this. |
| `add-note` | Append a note to an existing Plutio entity. |
| `log-activity` | Append a timeline activity event. |

### The reaper loop

A new background worker (mirror of `src/hive-sync-reaper.ts`) runs on a cron (e.g., every 60 seconds):

1. `SELECT ... FROM plutio_outbox WHERE status='pending' AND next_attempt_at <= now() ORDER BY id LIMIT 50 FOR UPDATE SKIP LOCKED`
2. For each row:
   - Mark `status='in_flight'`, commit (prevents double-execution if reaper is restarted mid-cycle)
   - Call the appropriate `toolbox/shared/plutio/tools/plutio/*.sh` script via the existing Bash bridge
   - On success: `status='done'`, `resolved_at=now()`, upsert `plutio_refs`
   - On failure: `attempts++`, `last_error=<error>`, `next_attempt_at = now() + backoff(attempts)`, `status='pending'` (or `dead_letter` after N attempts)
3. Metrics: pending count, dead_letter count, attempt histogram — surfaced via the heartbeat channel.

**Backoff:** exponential with jitter. Start at 60s, double each attempt, cap at 1h, dead-letter after 12 attempts (≈20h total retry window).

### Example outage scenario

**T+0:** Plutio API starts returning 500 errors.
**T+30s:** Reaper tries to push the next outbox row, gets a 500, marks it for retry.
**T+5m:** 10 new bookings + 5 new inbound emails during the outage. Each one writes locally + appends to outbox. Outbox is growing.
**T+1h:** Plutio still down. Outbox has 20 pending rows. Reaper backs off.
**T+6h:** Plutio comes back. Reaper picks up the oldest pending row, pushes successfully, proceeds to the next.
**T+6h 10m:** Outbox drained. Local DB and Plutio back in sync.

During the entire outage, NanoClaw agents answered inbound emails, routed leads, processed bookings, and generated reports using the local DB. Zero user-visible disruption.

### Where writes go through Plutio today (that need to move to this pattern)

Right now, agents call `toolbox/shared/plutio/tools/plutio/*.sh` directly from inside their containers during a run. That's a synchronous call to an unreliable API from inside a limited-time agent execution. Under the new pattern:

1. Agents never call Plutio directly.
2. Agents write to local DB + append to outbox.
3. Agents return immediately (local operation is fast).
4. Reaper handles Plutio push out-of-band.

This also fixes a latent bug: today, if Plutio is slow, agent containers hang for seconds to tens of seconds, eating into their timeout budget.

---

## Layer 9 — Agent-facing views (data mart)

**This is the public interface for AI agents.** Agent CLAUDE.md files reference these views, never the base tables. Writes still go through base tables (via `fn_*` SQL helper functions where atomicity matters), but read queries target views so agents don't have to remember `WHERE ended_at IS NULL` filters or join 4 tables to answer "is X a client?"

**Why a view layer is required (not optional):** both frontier-model reviewers independently arrived at this. LLMs are bad at normalized 4NF traversal — they forget filters, join on wrong cardinality, reinvent the same WHERE clauses on every run, and burn tokens building joins from scratch. A flat view layer is the highest-leverage thing we can do for agent quality.

**Stability contract:** view shapes are part of the public schema and change only via explicit migration with agent-side updates. Adding columns is fine; renaming or removing is a coordinated change.

### `v_party_contact_card`

The "who is this person" answer. One row per (canonical) party, with the most useful fields pre-joined and pre-filtered.

```sql
CREATE VIEW v_party_contact_card AS
SELECT
  p.id AS party_id,
  p.canonical_name,
  p.party_type,
  pers.first_name,
  pers.last_name,
  pers.preferred_name,
  pers.timezone,
  pers.country,
  pers.key AS person_key,                       -- alex/cherie/kalina
  pers.tandemweb_coach_slug,
  -- Primary email (deterministic)
  (SELECT email FROM party_emails pe
     WHERE pe.party_id = p.id AND pe.is_primary
     LIMIT 1) AS primary_email,
  -- Primary phone
  (SELECT phone_e164 FROM party_phones pp
     WHERE pp.party_id = p.id AND pp.is_primary
     LIMIT 1) AS primary_phone,
  -- Active roles as a flat array
  (SELECT array_agg(role_type ORDER BY role_type)
     FROM party_roles pr
     WHERE pr.party_id = p.id AND pr.ended_at IS NULL) AS active_roles,
  -- Org affiliation (most-recent active employed-by)
  (SELECT to_org.canonical_name
     FROM party_relationships rel
     JOIN parties to_org ON to_org.id = rel.to_party_id
     WHERE rel.from_party_id = p.id
       AND rel.relationship_type = 'employed-by'
       AND rel.ended_at IS NULL
     ORDER BY rel.started_at DESC
     LIMIT 1) AS current_org_name
FROM parties p
LEFT JOIN persons pers ON pers.party_id = p.id
WHERE p.merged_into IS NULL;  -- tombstones excluded
```

Agent query: `SELECT * FROM v_party_contact_card WHERE party_id = best_party_by_email('luna@...')` returns everything an agent needs for an email response in one row.

### `v_active_pipeline`

One row per **non-terminal** pipeline entry, joined with party and program. The base `pipeline_entries` table has historical won/lost rows that agents shouldn't see in routing queries.

```sql
CREATE VIEW v_active_pipeline AS
SELECT
  pe.id AS pipeline_entry_id,
  pe.party_id,
  p.canonical_name,
  pe.program_id,
  prog.key AS program_key,
  prog.name AS program_name,
  pe.stage,
  pe.entered_funnel_at,
  pe.entered_stage_at,
  EXTRACT(EPOCH FROM (now() - pe.entered_stage_at)) / 86400.0 AS days_in_stage,
  pe.assigned_to,
  staff.canonical_name AS assigned_to_name,
  pe.source,
  -- Last interaction summary
  (SELECT max(occurred_at) FROM interactions i
     WHERE i.pipeline_entry_id = pe.id) AS last_interaction_at,
  (SELECT count(*) FROM interactions i
     WHERE i.pipeline_entry_id = pe.id AND i.direction = 'outbound') AS outbound_count
FROM pipeline_entries pe
JOIN parties p ON p.id = pe.party_id AND p.merged_into IS NULL
JOIN programs prog ON prog.id = pe.program_id
LEFT JOIN parties staff ON staff.id = pe.assigned_to
WHERE pe.stage NOT IN ('won', 'lost');
```

Agent queries become trivial:
- "Stuck leads in `replied`" → `SELECT * FROM v_active_pipeline WHERE stage='replied' AND days_in_stage > 5`
- "All my leads" → `SELECT * FROM v_active_pipeline WHERE assigned_to_name = 'Alex Kudinov'`

### `v_active_engagements`

One row per active engagement participation. Forces `ended_at IS NULL` and `engagements.status` filtering — agents can't accidentally email past-cohort students.

```sql
CREATE VIEW v_active_engagements AS
SELECT
  ep.id AS participant_id,
  ep.engagement_id,
  e.name AS engagement_name,
  e.kind AS engagement_kind,
  ep.party_id,
  p.canonical_name,
  ep.participant_role,
  ep.started_at,
  pv.id AS program_variant_id,
  pv.name AS program_variant_name,
  prog.id AS program_id,
  prog.key AS program_key,
  prog.name AS program_name
FROM engagement_participants ep
JOIN engagements e ON e.id = ep.engagement_id
JOIN parties p ON p.id = ep.party_id AND p.merged_into IS NULL
LEFT JOIN program_variants pv ON pv.id = e.program_variant_id
LEFT JOIN programs prog ON prog.id = pv.program_id
WHERE ep.ended_at IS NULL
  AND e.status IN ('planned', 'active');
```

### `v_party_timeline`

The most-asked agent question: "what happened with this person?" One unified, pre-joined timeline.

```sql
CREATE VIEW v_party_timeline AS
SELECT
  i.party_id,
  i.id AS interaction_id,
  i.occurred_at,
  i.channel,
  i.direction,
  i.subject,
  i.body_excerpt,
  i.source_provider,
  i.source_id,
  i.engagement_id,
  i.pipeline_entry_id,
  i.document_id,
  d.kind AS document_kind,
  d.status AS document_status
FROM interactions i
LEFT JOIN documents d ON d.id = i.document_id
WHERE i.party_id IS NOT NULL  -- excludes unresolved-intake rows
ORDER BY i.party_id, i.occurred_at DESC;
```

Agent: `SELECT * FROM v_party_timeline WHERE party_id = best_party_by_email('...') LIMIT 50` returns the most-recent 50 events for that party.

### `v_client_status` (already specified in v1.0 — kept)

See § Current vs past client below in the glossary.

### `v_program_variant_seats` (defined in Layer 3 above)

Derived seat-fill count, replaces the dropped `program_variants.seats_filled` column.

### Enforcement

To ensure agents actually use views and not base tables, the migration plan grants the agent role `SELECT` on views and revokes `SELECT` on base tables (writes still go through `fn_*` helpers, which run as SECURITY DEFINER and bypass the SELECT revocation). This is a controllable enforcement layer — if views become too restrictive in some edge case, the grant can be widened — but the default posture is "agents see only the data mart."

Agent CLAUDE.md update is part of the agent-query-migration plan file: every `WHERE email = ...`, every `WHERE status = ...`, every `JOIN ON party_id` query gets rewritten to target the view layer.

---

## Enumerated value glossary

The canonical values. Anything not in this list needs a migration to add.

### `party_type`

| value | meaning |
|---|---|
| `person` | Individual human. |
| `organization` | Company, school, non-profit, government entity. |

### `role_types`

| key | category | meaning |
|---|---|---|
| `prospect` | buyer | In the funnel for at least one program but hasn't bought anything yet. |
| `client` | buyer | Has bought any product — coaching hours, cohort enrollment, mentor coaching, consulting. The specific product is captured in `engagement_participants`, not the role. |
| `coach` | provider | Provides coaching services under our umbrella. **This role drives tandemweb bio content** (About Us pages, individual coach pages). A coach we also pay externally has `coach` + `vendor` simultaneously — see Resolved Decisions § #3. |
| `trainer` | provider | Teaches in our programs. Usually held alongside `coach` by the same person. |
| `mentor` | provider | Provides mentor coaching (for ACC renewal, etc.). |
| `supervisor` | provider | Provides coaching supervision. |
| `vendor` | provider | Third party we buy from — SaaS (Sertifier, Plutio), contractors (bookkeeping), the EA (Toni), freelance coaches we pay. Can be person or organization. |
| `partner` | provider | Strategic partner (referral, co-delivery). |
| `staff` | internal | Alex + Cherie only. Co-founders/owners. Not expanding. Everyone else providing services is `coach` + `vendor` or just `vendor`. |
| `contact` | other | Someone we know with no active relationship (past inquiry, acquaintance, intro). |

**Why no `student` role:** A student is just a client whose engagement is a cohort enrollment. Their "student-ness" is visible via `engagement_participants.participant_role='student'` joined against an active cohort engagement. `role_type='student'` would be redundant with engagement participation and would drift out of sync when someone moves ACC → PCC → ACTC over multiple years. Agents querying "is this person a student of anything right now?" use:

```sql
SELECT 1 FROM engagement_participants ep
JOIN engagements e ON e.id = ep.engagement_id
WHERE ep.party_id = $1
  AND ep.participant_role = 'student'
  AND ep.ended_at IS NULL
  AND e.status = 'active'
LIMIT 1;
```

**Why no `alumni` role:** same reasoning. An alumnus is a `client` whose latest cohort `engagement_participants.ended_at` is set AND who is not currently enrolled in any other cohort. Derivable from engagement participation, not a separate role.

### Current vs past client — a view, not a column

The question "is this client currently engaged with us, or are they in the past?" is real. We answer it with a derived view, not a maintained column, because the moment we make it a column someone has to keep it up to date and it drifts.

```sql
CREATE VIEW v_client_status AS
SELECT
  p.id AS party_id,
  p.canonical_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM engagement_participants ep
      JOIN engagements e ON e.id = ep.engagement_id
      WHERE ep.party_id = p.id
        AND ep.ended_at IS NULL
        AND e.status IN ('planned', 'active')
    ) THEN 'current'
    ELSE 'past'
  END AS client_status,
  (SELECT MAX(ep.ended_at)
     FROM engagement_participants ep
     WHERE ep.party_id = p.id) AS last_engagement_ended_at
FROM parties p
WHERE EXISTS (
  SELECT 1 FROM party_roles pr
  WHERE pr.party_id = p.id AND pr.role_type = 'client'
);
```

Agents that need "current clients" query `v_client_status WHERE client_status='current'`. It's always correct by definition — if it's wrong, the bug is in how engagements get ended_at set, not in the view.

### Repeat clients (and re-prospects)

A client who comes back for another product is **still a client** — the `role_type='client'` row with `ended_at IS NULL` stays. A **new** `pipeline_entries` row is created for the new product with `stage='new'` (or `qualified` if they're known to be a real buyer). Their two dimensions coexist:

- **Role dimension:** `client` (stuck, sticky, lifetime)
- **Pipeline dimension:** one or more `pipeline_entries` rows, one per program they've ever been in the funnel for

So "Kalina is a past client but now a prospect for the ACTC advanced series" is simultaneously true: her `client` role is still there (she bought the PCC cohort in 2023), her `v_client_status` shows `'past'` (no current engagement_participants), AND she has a new `pipeline_entries` row for the ACTC program with stage='new'.

**Agents don't need to move her back to `role_type='prospect'`.** A client can have pipeline entries; that's normal. The agents that care about "new prospects only" filter `pipeline_entries` by stage, not by party role.

**One edge case:** if a party has NEVER bought anything and is in the funnel, they have `role_type='prospect'` and no `role_type='client'`. When they buy for the first time, the transition is: `prospect` role gets `ended_at` set, `client` role is created. That's a one-time transition — every subsequent purchase leaves the client role alone.

### `program.kind` (values in `program_kinds` lookup)

| key | meaning |
|---|---|
| `cohort` | Scheduled group program with fixed dates. |
| `self-paced` | On-demand content, no schedule. |
| `coaching-service` | 1:1 coaching hours. |
| `mentor-service` | Mentor coaching for credential renewal. |
| `supervision` | Supervision hours. |
| `certification` | Certification issuance (e.g., Sertifier-backed). |

### `engagement.kind` (values in `engagement_kinds` lookup)

| key | meaning |
|---|---|
| `cohort-delivery` | One cohort instance of a cohort program. |
| `coaching-package` | A bundled set of coaching hours for one client. |
| `mentor-pair` | A mentor pairing for an ACC renewal candidate. |
| `supervision-series` | A supervision engagement. |
| `speaking-gig` | A paid speaking engagement (we are the vendor). |
| `bespoke` | Custom engagement that doesn't fit the others. |

### `participant_role` (values in `participant_roles` lookup)

| key | meaning |
|---|---|
| `student` | Enrolled learner in a cohort. |
| `instructor` | Teaching the cohort. |
| `mentor` | Providing mentor coaching within the engagement. |
| `supervisor` | Providing supervision. |
| `observer` | Auditing, shadowing, or trainer-in-training. |
| `client` | The buying party of a coaching-package or bespoke engagement. |
| `coach` | The delivering party of a coaching-package. |

### `pipeline_stages` (lookup)

Six stages. Booking a consultation is an `interactions` row, not a stage transition. Signing/paying is a `won` transition and also creates a `client` role + engagement.

| key | meaning |
|---|---|
| `new` | Just entered the funnel — not yet triaged. |
| `qualified` | Inbox has triaged and confirmed genuine interest in a program we offer. |
| `sent` | Sales has sent initial information (or subsequent follow-ups). |
| `replied` | Lead responded to our outreach. Awaiting next action from us. |
| `won` | Terminal — they bought. `won_at` set, `client` role created, engagement started. |
| `lost` | Terminal — they didn't buy. `lost_at` + `lost_reason` set. Same party can re-enter the funnel later for a different program — that's a NEW `pipeline_entries` row. |

### `lost_reasons` (lookup)

Distinguishes flavors of "didn't buy" so we can report on them meaningfully.

| key | meaning |
|---|---|
| `explicit-no` | They said no explicitly (price, fit, timing, went with competitor). |
| `went-silent` | Follow-up cycle exhausted, no response. (This is what the old `cold` status captured.) |
| `wrong-fit` | We determined they weren't a fit and disqualified them. |
| `duplicate` | Duplicate inquiry — the real pipeline entry is elsewhere. |
| `spam` | Wasn't a real lead. |
| `other` | Free-text explanation in `pipeline_entries.notes`. |

### `interaction_channels` (lookup)

| key | meaning |
|---|---|
| `email` | Inbound or outbound email. |
| `meeting` | In-person or video meeting. |
| `call` | Phone call. |
| `form-submission` | Web form (contact form, newsletter signup). |
| `booking` | Scheduling tool event (Trafft). |
| `payment` | Payment event (Stripe, PayPal). |
| `slack` | Slack message (for parties that use our Slack, e.g. staff, coaches). |
| `document-signed` | Plutio/DocuSign/manual signature event. |
| `sms` | SMS/text. |
| `whatsapp` | WhatsApp message. |
| `note` | Internal note recorded by an agent or human. |

### `document_kinds` / `document_statuses` (lookups)

See the Layer 7 description. Seed values:

- `document_kinds`: `proposal`, `contract`, `invoice`, `receipt`, `certificate`, `agreement`
- `document_statuses`: `draft`, `sent`, `viewed`, `signed`, `paid`, `overdue`, `void`, `cancelled`, `issued`

---

## Case walkthroughs

Concrete mappings of real situations into the model.

### Kalina Terzieva (client, coach, trainer — all the same person)

**Layer 1:**
- `parties`: id=100, party_type='person', canonical_name='Kalina Terzieva'
- `persons`: party_id=100, first_name='Kalina', last_name='Terzieva', key='kalina' (short agent-prompt alias)
- `party_emails`: 1+ rows for party_id=100
- `party_phones`: 1 row

**Layer 2 — her concurrent roles (no `student` or `alumni` — those are derived from engagement history):**
```
party_roles:
  id=1: party_id=100, role_type='client',  started=2023-01-01, ended=NULL  (she bought the PCC cohort)
  id=2: party_id=100, role_type='coach',   started=2024-01-01, ended=NULL, context='{"credentials":["PCC"],"specialties":["team"]}'
  id=3: party_id=100, role_type='trainer', started=2024-09-01, ended=NULL
  id=4: party_id=100, role_type='vendor',  started=2024-01-01, ended=NULL, context='{"vendor_kind":"contractor","payment_terms":"per-engagement"}'
```

Four roles: `client` (she bought from us), `coach` (she provides coaching, and her record feeds tandemweb bio pages), `trainer` (she teaches cohorts), `vendor` (the financial side — we pay her per engagement).

**Layer 4 — her engagement history captures the studentness that used to live in `role_type='student'`:**
```
engagement_participants:
  engagement=PCC-2023-Q1-delivery, party_id=100, participant_role='student',    started=2023-01-01, ended=2023-06-01
  engagement=PCC-2025-Q3-delivery, party_id=100, participant_role='instructor', started=2025-07-01, ended=2025-12-01
  engagement=Elevate-2026-Q1,       party_id=100, participant_role='mentor',     started=2026-01-01, ended=NULL
```

The first row — `participant_role='student'` with `ended_at` set — is her PCC history. If she decides to pursue ACTC next year, that's a NEW `engagement_participants` row. No role change required. The system handles "ACC student → PCC student → ACTC student" as a sequence of engagement participations, not role transitions.

**Queries this enables:**
- "Show me everyone who was ever a student and is now a trainer." — Join `engagement_participants` (filter `participant_role='student'`) against `party_roles` (filter `role_type='trainer'`).
- "What's Kalina's full history with us?" — one query across `party_roles` + `engagement_participants` + `interactions` + `documents` filtered by party_id=100.
- "Find all active trainers." — `SELECT party_id FROM party_roles WHERE role_type='trainer' AND ended_at IS NULL`.
- "Is Kalina a student of anything right now?" — `SELECT 1 FROM engagement_participants WHERE party_id=100 AND participant_role='student' AND ended_at IS NULL` — empty result, she's not currently enrolled.
- "Kalina's bio for tandemweb" — `SELECT * FROM persons WHERE party_id=100` + `SELECT context FROM party_roles WHERE party_id=100 AND role_type='coach'` for credentials and specialties.

### Luna Tovaglieri (the original problem)

**Layer 1:**
- `parties`: id=200, party_type='person', canonical_name='Luna Tovaglieri'
- `persons`: party_id=200, country='IT', timezone='Europe/Rome'
- `party_emails`:
  - `(party_id=200, email='luna.tovaglieri@scuoladicoaching.it', is_primary=true, first_seen_source='contact-form', first_seen_at='2026-03-26')`
  - `(party_id=200, email='evaluna15@msn.com', is_primary=false, first_seen_source='trafft-booking', first_seen_at='2026-04-08')`

**Layer 2:**
- `party_roles`: id=X, role_type='prospect', started=2026-03-26, ended=NULL

**Layer 5:**
- `pipeline_entries`: party_id=200, program_id=(ACTC), stage='replied', source='contact-form', entered_funnel_at=2026-03-26, entered_stage_at=2026-04-08
- `pipeline_stage_history`: 4 rows — new → qualified → sent → replied (the booking is what flipped her to `replied` — it's how she responded)

**Layer 6:**
- `interactions` (chronological):
  - 2026-03-26: channel='form-submission', direction='inbound', subject='ACTC inquiry'
  - 2026-03-27: channel='email', direction='outbound', subject='Re: ACTC program details'
  - 2026-04-08: channel='booking', direction='inbound', subject='Consultation Call booked', metadata='{"employee_key":"cherie","start":"2026-04-14 17:00 CDT"}', source_provider='trafft', source_id='27'

**Note:** the booking is an `interactions` row, not a stage. Her stage is `replied` (she responded to our outreach — she just happened to respond by booking a call instead of writing back). If the consultation call converts her to a paying client, the stage flips to `won` and a new `engagements` row + `engagement_participants` row are created.

**Layer 8:**
- `plutio_refs`: `(entity_type='party', entity_id=200) → plutio_id='BZkESDS8cPRBjvaYo'`

**The Luna problem is solved.** When an inbound email arrives from `evaluna15@msn.com`, mailman's first query (using the v1.1 resolver + view layer) is:

```sql
SELECT * FROM v_party_contact_card
WHERE party_id = best_party_by_email('evaluna15@msn.com');
```

Returns one row for Luna (party 200) with her primary email, active roles `{prospect}`, and timezone — everything mailman needs in one query, no joins. Mailman then checks `v_active_pipeline WHERE party_id = 200` to find her ACTC entry stuck in `replied`. Handles the email as a reply to the ACTC inquiry, not a new lead. **Zero joins. Zero `WHERE ended_at IS NULL` traps.**

### Donovan Linder (stuck in replied)

**Layer 1:** party id=300, two `party_emails` rows (primary + one alias learned later).

**Layer 2:** `party_roles` id=X, role_type='prospect', started=2026-03-26, ended=NULL.

**Layer 5:** `pipeline_entries` with stage='replied', entered_stage_at='2026-03-30T16:27'.

**The stuck-lead watchdog:** runs daily, finds Donovan:

```sql
SELECT pe.id, p.canonical_name, pe.entered_stage_at, NOW() - pe.entered_stage_at AS age
FROM pipeline_entries pe
JOIN parties p ON p.id = pe.party_id
WHERE pe.stage = 'replied'
  AND pe.entered_stage_at < NOW() - INTERVAL '5 days';
```

Surfaces Donovan to `#gru-sales` (via bot post, not agent-triggering — same pattern we used in the manual drain). Alex decides whether to respond. **No chief involvement. No task table drift.**

### Abhinav Roy (active student support)

**Layer 1:** party_id=400, `persons` row.

**Layer 2:** `party_roles` role_type='client', started=(first-purchase date), ended=NULL.

**Layer 4:** `engagement_participants` row linking him to the Elevate cohort engagement with `participant_role='student'`, started=(enrollment date), ended=NULL (he's still enrolled).

**Layer 6:** `interactions` row for his inbound support email ("Recordings of classes"), direction='inbound', channel='email'.

**No pipeline_entries row.** He's not in a funnel; he already bought. His status is a `client` role + an active cohort engagement participation, not a pipeline stage. This distinction matters — the sales follow-up cron queries `pipeline_entries`, so it won't touch active students. Querying "is Abhinav currently a student of anything?" returns true because his `engagement_participants` row has `ended_at IS NULL` against an active engagement.

### Cherie Silas (staff + coach + trainer)

**Layer 1:** party_id=1 (staff get low IDs by convention), `persons` row.

**Layer 2:**
- `party_roles`: role_type='staff', started=(company founding), ended=NULL
- `party_roles`: role_type='coach', started=(company founding), ended=NULL
- `party_roles`: role_type='trainer', started=(company founding), ended=NULL

**Layer 4:** Cherie shows up in `engagement_participants` as `participant_role='instructor'` across many cohorts, and as `participant_role='mentor'` or `'supervisor'` in individual engagements.

**The booking table asks for "employee_name":** in the migration, `booking_events.employee_name='Cherie Silas'` resolves to party_id=1 via a name-match or a curated lookup. Once resolved, the booking is stored as an `interactions` row with metadata pointing at her party_id as the "other party" (alongside the prospect).

### A vendor that is a company (Sertifier)

**Layer 1:**
- `parties`: party_type='organization', canonical_name='Sertifier'
- `organizations`: website='https://sertifier.com', industry='saas'

**Layer 2:**
- `party_roles`: role_type='vendor', context='{"vendor_kind":"saas","monthly_cost_usd":49,"renewal_date":"2026-12-31"}'

**Layer 7:** their monthly invoices flow into `documents` with kind='invoice', party_id pointing at Sertifier's party.

### A vendor that is a person (freelance bookkeeper)

**Layer 1:**
- `parties`: party_type='person', canonical_name='Jane Smith'
- `persons`: ...

**Layer 2:**
- `party_roles`: role_type='vendor', context='{"vendor_kind":"professional-service","specialty":"bookkeeping"}'

Same mechanics. The `party_type` branch just changes which subtype table is populated.

---

## Migration map — current schema → new model

For each current table, what it maps to, and how.

### `leads` (39 rows) → parties + persons + party_emails + party_roles + pipeline_entries + interactions

| current column | new location |
|---|---|
| `id` | becomes `pipeline_entries.id` for the funnel row |
| `source` | `pipeline_entries.source` + first `interactions.channel` |
| `status` | `pipeline_entries.stage` (with value mapping — see below) |
| `name` | `persons.first_name` + `persons.last_name` split |
| `email` | `party_emails.email` with `is_primary=true` |
| `company` | If set, create `organizations` party + `party_relationships` row with `relationship_type='employed-by'` and `role_in_relationship='primary-contact'` (default — can be refined later). Many-to-one: multiple leads at the same company create one org, multiple person→org relationships. |
| `message` | First `interactions.body_excerpt` with channel='form-submission' |
| `assigned_to` | `pipeline_entries.assigned_to` (resolved to staff party_id) |
| `follow_up_count` | derivable from `pipeline_stage_history` count where to_stage IN ('sent','follow-up-sent'); drop the column |
| `last_contact_at` | derivable from `MAX(interactions.occurred_at) WHERE direction='outbound'`; drop the column |
| `thread_id` | `interactions.thread_key` on the first email interaction |
| `plutio_person_id` | `plutio_refs` row |

**Status value mapping:**

| current | new stage | new `lost_reason` | notes |
|---|---|---|---|
| `new` | `new` | — | |
| `qualified` | `qualified` | — | |
| `sent` | `sent` | — | |
| `follow-up-sent` | `sent` | — | Follow-up count derived from history |
| `replied` | `replied` | — | |
| `approved` | ? | — | **OPEN** — `approved` in current leads table is ambiguous. Need migration-time audit to determine whether it means "draft approved to send" (internal state, map to `sent`) or "prospect became a client" (map to `won`). See Emerged Questions. |
| `completed` | `won` | — | They bought. |
| `closed` | `lost` | `explicit-no` | |
| `cold` | `lost` | `went-silent` | |
| `archived` | `lost` | `other` | |

### `clients` (0 rows) → drop

Empty, never populated, CRM aspiration that didn't happen. Replaced by `party_roles` with `role_type='client'` + `engagements` with `kind='coaching-package'`.

### `contracts` (0 rows) → drop

Empty. Replaced by `documents` with `kind='contract'` + `engagements`.

### `proposals` (0 rows) → drop

Empty. Replaced by `documents` with `kind='proposal'`.

### `invoices` (0 rows) → drop

Empty. Replaced by `documents` with `kind='invoice'`.

### `payments` (18 rows) → documents + interactions (via `fn_issue_document`)

Each row becomes a single `fn_issue_document(...)` call, which atomically creates:

- `documents`: kind='receipt', status='paid', amount_cents, currency, source_provider='stripe', source_id=stripe_session_id, resolved_at=paid_at
- `interactions`: channel='payment', direction='inbound', party_id (resolved), document_id=new receipt, occurred_at=paid_at

`payments.email` resolves via `best_party_by_email(payments.email)`. If returns NULL, the backfill script creates the party + persons + party_emails row first (Stripe payment without a lead record means we're backfilling) and then calls `fn_issue_document`. v1.1: backfill never inserts directly into `documents` or `interactions` — always through the helper, so all the audit/outbox/dedupe machinery fires.

### `coaches` (0 rows) → drop

Empty. Replaced by `party_roles` with `role_type='coach'`.

### `vendors` (0 rows) → drop

Empty. Replaced by `party_roles` with `role_type='vendor'`.

### `booking_events` (26 rows) → interactions + engagements (maybe)

Each row becomes an `interactions` row (created via `fn_log_interaction`) with:
- channel='booking'
- direction='inbound'
- source_provider='trafft', source_id=trafft_appointment_id
- metadata containing `service_name`, `employee_name`, `start_date_time`, `status`, `raw_payload`
- party_id resolved via `best_party_by_email(customer_email)` — if no match, the row lands with `party_id=NULL` + `unresolved_contact={email,name,source}` and the resolve-intake worker promotes it
- `engagement_id` is left NULL on insert. The Booking Reconciler janitor task (Layer 5) attaches the booking to the right active coaching-package engagement on its next run, using the party's timezone for the time match
- If the booking represents a new engagement (e.g., a paid consultation that turns into a coaching package), `fn_create_engagement(...)` is called separately by the sales/booking agent after Alex confirms — never inferred from the booking row alone

**Luna's booking events specifically:** the duplicate `customer_email` (`evaluna15@msn.com`) that didn't match her lead row — during migration, we detect this, add the second email as a `party_emails` alias, and link all her booking interactions to the single Luna party.

### `email_classifications` (45 rows) → stays, gains party_id FK

This table is the email classification pipeline's internal log. It doesn't get folded into `interactions` — it serves a different purpose (tracking what label was applied, why, and sync status to Hive).

**Gains:** a nullable `party_id` FK column so classifications can be joined to parties. During migration, populate retroactively via email match.

The corresponding `interactions` row (one per email) references the classification via a new `classification_id` column on `interactions`, or via a join on `thread_key`.

### `classification_taxonomy`, `classification_rules`, `classification_backfill_pending` → stay as-is

Internal to the classification pipeline. No relationship to parties.

### `tasks` (12 rows) → redefine as "chief escalation audit log"

Per the architectural fix done on 2026-04-11, `tasks` is an audit log for escalations chief receives, not a dispatch queue. The schema stays. New constraints:

- `CHECK (to_agent = 'chief')` — enforces the invariant that chief is always the target
- `type` becomes a FK to a lookup table of valid escalation types
- Add `party_id` column (nullable FK) for when an escalation is about a specific party

### `procurement_opportunities` (15 rows) → stays

Standalone system (Bonfire scraping, RFP tracking). No party relationship by default. Could gain a party_id linking the opportunity to its awarding agency when that becomes a need.

---

## Reliability — why this survives Plutio outages

The key invariant: **no synchronous call to Plutio from an agent's hot path**.

Today, agents call `toolbox/shared/plutio/tools/plutio/*.sh` directly during a container run. That's:
- A shell exec out of the agent
- Which calls Plutio's HTTPS API
- With a 60-120 second timeout against the container's total budget
- With no retry if Plutio is slow
- With the agent's output blocked until Plutio returns

Under the new pattern:
- Agent writes to local Postgres (sub-millisecond)
- Same transaction appends to `plutio_outbox` (sub-millisecond)
- Agent returns immediately
- Reaper processes the outbox in the background, asynchronously
- If Plutio is slow, the reaper retries; the agent doesn't care

This is the same pattern used for `hive-sync-reaper.ts` for Hive writes, and for `classify-backfill.ts` for the email classification retry queue. **Three existing proofs that the pattern works in this codebase.**

**What we lose:** immediate confirmation of Plutio IDs. If an agent creates a new lead and needs the Plutio person ID in the same run (e.g., to include in a Slack message), it won't have it — the reaper hasn't pushed yet. Workarounds:
- For human-readable links, the Slack message says "Plutio: (sync pending)" and a follow-up comment adds the link when the reaper completes
- For agent-to-agent handoffs, the party_id (our local ID) is what gets passed. Plutio ID is looked up later if needed.

**What we gain:** Plutio can be down for an arbitrary period and NanoClaw keeps working. When Plutio comes back, the outbox drains in FIFO order. Ordering is preserved because each outbox row is timestamped and the reaper processes in ID order.

---

## Boost Space — why we're not using it

Revisited in depth during the 2026-04-11 deliberation session. Searched for current capabilities. Findings:

**What Boost Space offers:** an iPaaS (integration platform as a service) built on top of Make.com (which they acquired). Core pitch is "Single source of truth database for AI & automations." Has connectors to many common SaaS tools. Provides a proprietary "Space database" that mirrors data from sources.

**Why it's not a fit for us:**

1. **No dedicated Plutio connector.** Search for "Boost Space Plutio" in 2026 returns no native integration. We'd end up using generic HTTP webhook modules, at which point we're building the integration ourselves — just inside someone else's DSL, with operation-based pricing on top.

2. **Their data model is their data model.** The Space database is designed for typical SaaS shapes (contacts, deals, pipeline). The Party/Role/Engagement pattern with overlapping time-bounded roles doesn't map cleanly to their UI. We'd either fight their model or lose the semantics that make our model work.

3. **Per-operation pricing via Make.** Every inbound email, booking, payment would consume 2-5 Make operations. At ~50-100 events/day, that's 3,000-9,000 ops/month. Recurring cost that grows with our volume.

4. **Latency penalty.** Agent queries against Boost Space go: container → network → Boost Space → their DB → back. Our Postgres on localhost is ~1ms. Their hub is tens to hundreds of milliseconds per query. Agents making routing decisions in sub-second timeframes can't afford that.

5. **Another SaaS, another outage.** The reason we're doing this exercise is that we don't trust Plutio's uptime. Adding another commercial SaaS in the critical path changes which vendor we depend on, not whether we depend on one.

6. **Duplication.** We'd still need our own Postgres for NanoClaw operational state (agent sessions, IPC, queues). Boost Space would be a secondary system to keep in sync. Complexity goes up, not down.

**Where Boost Space would be the right answer:** if the goal were a unified reporting dashboard for non-technical users across many SaaS tools. That's a real use case — just not ours. Our goal is an operational data layer that survives vendor outages and gives agents fast, structured queries.

**Conclusion:** skip Boost Space. Revisit only if the scope changes to include cross-SaaS reporting dashboards for humans (not agents).

---

## Resolved decisions (2026-04-11 Alex review)

The original 12 open questions, answered during the first review pass. Each decision locked into the model above.

### 1. No `alumni` role; no `student` role — engagement_participants captures it

The doc originally proposed `student` and `alumni` as distinct roles. Problem: we don't have a reliable signal for when a student "ends" (Sertifier certificate issuance is a candidate but partial), and someone finishing ACC and starting PCC is still a student of something — so `ended_at` gets confusing.

**Decision:** drop both roles. Everyone who has bought anything is `role_type='client'`. Their student-ness is visible via `engagement_participants.participant_role='student'` against active engagements. Querying "is X a student right now?" is a JOIN, not a role flag. Moving from ACC to PCC adds a new `engagement_participants` row with no role change.

**Follow-up to explore:** Sertifier certificate issuance as an event that auto-closes `engagement_participants.ended_at` for cohort engagements. Useful but not required for v1. See Emerged Questions § A.

### 2. `client` is the only buyer role

Everyone who buys anything is a `client`. Product distinction is captured in `engagements` / `engagement_participants`, not in the role type. This is consistent with decision #1.

### 3. `coach` and `vendor` are separate roles; coaches can hold both. Tandemweb stays standalone.

External coaches (Kalina, Karen, etc.) have `role_type='coach'` AND `role_type='vendor'` simultaneously. The `coach` role is about identity and capability (credentials, specialties, active-status) for agent routing. The `vendor` role is about the financial relationship (we pay them, they invoice us).

**Tandemweb decision (reversed from first pass):** Tandemweb is a standalone content system. It has its own records, its own JSON file with bios and answers to the about-us questions, and it uses those to generate coach executive bio content for the book. **We do NOT merge or enrich either side.** The NanoClaw business DB does not store coach bios, photos, long-form content, or tandemweb-specific fields. Those stay in tandemweb.

The superficial link is a nullable `persons.tandemweb_coach_slug` column. If set, it says "this person's tandemweb content is at /coaches/{slug}". No mirroring, no sync, no enrichment — just a pointer so agents can link when asked.

Coach role `context` holds operational fields only (credentials for routing, specialties for matching, rate for proposals, max_clients for capacity), not marketing content.

### 4. `party_relationships` — REVERSED from first pass. It IS in v1.

First pass deferred this table. Alex's second review surfaced the real value: Plutio has a company-with-default-contact pattern and an on-relationship "role at company" field, but the value is that we can extend it with a controlled vocabulary — `billing-contact`, `contracting-contact`, `decision-maker`, `champion`, etc. — that enables agent routing like "send invoices to the billing-contact" and "loop in the contracting-contact on all legal matters."

This isn't an optional nice-to-have; it's the kind of intelligence layer we want to own above Plutio. Added to Layer 1 (Identity) as `party_relationships` + `contact_roles` lookup. See that section for the full shape.

`persons.company` was dropped — employment is now a proper relationship, not a denormalized text field.

### 5. `lost` and `cold` merged; `lost_reason` preserves the nuance

One stage `lost`, with a `lost_reason` FK to a lookup table: `explicit-no`, `went-silent`, `wrong-fit`, `duplicate`, `spam`, `other`. Reporting queries that care about the distinction do `WHERE lost_reason = 'went-silent'`.

**Re-engagement case (Alex's question):** "what if we lost one contract and they came for another?" Solved naturally: `pipeline_entries` is per-party-per-program. The old `lost` entry stays; a new entry for the second program starts at `new`. Both entries can coexist. The party's total history is `SELECT * FROM pipeline_entries WHERE party_id = X` — no ambiguity.

### 6. Pipeline stages simplified to 6: new, qualified, sent, replied, won, lost

Dropped `scheduled` and `enrolled` from the original proposal. A consultation booking is an **interaction** (event), not a stage transition. The prospect's stage reflects where they are in the conversation — if they booked a call, they've `replied` to our outreach. They move to `won` when they actually buy (signed/paid). No intermediate `enrolled`.

Simpler funnel, cleaner semantics, matches Alex's mental model: "they are a lead, when they bought a product they are a client."

### 7. Cold outreach out of scope

We don't do cold outreach. Removed from the proposal entirely. All pipeline entries originate from inbound signals (form submissions, inbound emails, bookings). If cold outreach becomes a thing in the future, we add an `outreach` source and a `contacted` stage then — not now.

### 8. Merged parties kept as audit trail (never hard-delete)

Confirmed. `merged_into` pointer stays forever. Table grows monotonically; fine at our volume.

### 9. `timezone` and `language` stay on `persons`

Confirmed. Best-effort metadata, updated opportunistically from interactions, used by agents for tone and scheduling hints.

### 10. `staff` role = Alex + Cherie only, and not expanding

Locked in tight. The `staff` role exists for exactly two people — co-founders/owners. Everyone else providing services (Kalina, Karen, Toni, any future trainer/coach/contractor) uses `coach` + `vendor` or just `vendor` (for non-coach contractors like Toni the EA).

This means agents that want "the owners" query `WHERE role_type='staff' AND ended_at IS NULL` and get exactly two rows. No drift.

### 11. `persons.key` added for short agent-prompt aliases

Confirmed. Column added to `persons` schema above. Seed values:

| key | full name |
|---|---|
| `alex` | Alex Kudinov |
| `cherie` | Cherie Silas |
| `kalina` | Kalina Terzieva |
| `karen` | Karen Bruns |
| `toni` | Toni Silas (EA) |

Agent prompts reference people by `key` instead of full name or party_id. CLAUDE.md docs can say "assign to kalina" or "Toni handles the contracts" and resolve at query time via `SELECT party_id FROM persons WHERE key = 'kalina'`.

### 12. Interaction retention — never archive, partition later

Default: no archival. Add Postgres declarative partitioning by `occurred_at` range when the table exceeds ~1M rows (which at current volume is 15-25 years away). Punted as TBD.

---

## Emerged questions — second review pass

### A. Sertifier integration — RESOLVED: certs are documents, recipient must pre-exist

Sertifier's own data model has a "student" concept, but we don't integrate at that level. What we DO provide to Sertifier on certificate issuance is a name, email, and the cert requirements (e.g., hours completed). What we DON'T currently do is ensure that cert recipient exists in our DB as a client — that's a gap.

**Decision:**
- Certificates become `documents` rows with `kind='certificate'`.
- Issuing a cert creates an `interactions` row (`channel='certificate-issued'`) and the `documents` row, linked to the party.
- **Pre-flight check required:** before the cert-issuance script can run, the recipient MUST already exist in our DB as `role_type='client'`. If they don't, the script either creates the party + role itself (with source='sertifier-issuance') or refuses to issue and errors.
- Certificate issuance does NOT change the party's client status. "Current vs past client" is derived from `engagement_participants`, not from cert issuance.
- Sertifier remains a one-way push (we tell it to issue; we don't sync its internal student list).

**Action:** the cert-issuance toolbox scripts (`~/dev/toolbox/shared/sertifier/`) need an update to comply with the pre-flight check. This is a post-migration task — handled in a plan file that comes after the schema migration.

### B. Tandemweb coach bio pipeline — RESOLVED: stay standalone, superficial link only

Tandemweb is its own thing. It has its own records, its own JSON bio file, its own content generation for the book. We don't merge, don't enrich, don't source from each other. The only crossover is `persons.tandemweb_coach_slug` — a nullable pointer so agents can include a link when asked. No data copying either direction. No sync reaper needed.

This fully closes question B — no discovery pass in tandemweb needed before migration. The coach role in NanoClaw's DB stays lean (operational fields only: credentials, specialties, rate, active status).

### C. The `approved` status in current leads — RESOLVED: all 3 map to `sent`

Queried the DB during the review. The three `approved` leads are:

| id | name | email | source | summary |
|---|---|---|---|---|
| 13 | Lynne Mangan | lynne@oboeweb.com | contact-form | Interested in ICF cert path, asking about module timing |
| 23 | Nancy Hamilton | nhamilton927@gmail.com | email | MSW + 30y executive coaching, interested in Level 2 PCC |
| 27 | Nataliia Petrushina | petrushina.coach@gmail.com | contact-form | "Exam preparation" short inquiry |

All three are mid-funnel prospects, not customers. The `approved` label came from sales's current workflow setting `status='approved'` when Alex approves a draft to send. **The underlying bug:** there's no transition from `approved` back to `sent` after mailman sends — so these leads are stuck in an internal sales state.

**Migration decision:** all `approved` rows map to `sent`. No hand-review needed; the audit confirmed they're all draft-approval stuck states, not sales-conversion states.

**Bug to fix separately:** the sales→mailman handoff pipeline should transition `approved` → `sent` on mailman's confirmation. Under the new schema, this is automatic because stage transitions are driven by events (the `sent` stage entry criterion is "mailman confirms an outbound email was sent").

### D. New emerged: Sertifier → Plutio person creation gap

Alex surfaced that currently when we issue a cert, we don't create a Plutio person for the recipient. If the recipient isn't already a Plutio contact (because they never went through the lead → proposal flow), they're a dark spot in our records.

Under the new model + outbox, this resolves automatically: cert issuance requires the recipient exists as `role_type='client'`, and creating that client appends to `plutio_outbox` which eventually creates the corresponding Plutio contact. No special case for cert recipients — they go through the same pipeline as every other client.

**Action:** note in the certification-script update task that Sertifier recipients who aren't yet clients trigger a full client-creation flow before the cert is issued.

---

## Non-goals

Things this document deliberately does NOT propose:

- **A CRM replacement for Plutio.** Plutio remains the human-facing CRM UI. We build the data layer that feeds it and survives when it's down.
- **Bidirectional Plutio sync.** Stage 1 is outbound only. Pulling changes back from Plutio via webhooks is a separate, harder problem (conflict resolution, ordering, reconciliation) and should be its own plan after outbound stabilizes.
- **Event sourcing purity.** Some tables have event logs (`pipeline_stage_history`), others don't. We're pragmatic, not doctrinaire.
- **A metrics/reporting store.** This DB is operational. If we need dashboards later, a read replica or a separate analytics DB is the right answer — not cramming BI queries into the operational schema.
- **Multi-tenancy.** This is a single-business data model. If tandemcoach.co ever becomes a multi-tenant platform, that's a schema redesign, not a gradual migration.
- **A full address/location system.** `persons.country` and `persons.timezone` are enough for agent tone and scheduling. Full addresses live in Plutio for invoicing; we don't mirror them unless we need to.
- **Version control on rows.** No `versions` table, no temporal tables. `updated_at` triggers are enough. If we ever need "who changed this field when," we add audit triggers on specific tables at that point.

---

## Migration philosophy

When the schema is agreed and the migration runs:

1. **Create the new schema in parallel.** New tables with `_v2` suffix or in a separate schema. Old schema stays intact.
2. **Backfill in read-only mode.** One-shot script reads current `leads`, `booking_events`, `payments`, `email_classifications` and creates corresponding `parties`, `party_emails`, `pipeline_entries`, `interactions`, `documents` rows. Old tables untouched.
3. **Validate.** Spot-check 10 parties, 20 pipeline entries, 50 interactions for accuracy. Fix bugs. Rerun.
4. **Dual-write window.** Agents write to BOTH old and new schema for 1-2 weeks. Queries read from the new schema; anomalies that would only appear in the old schema surface as drift warnings.
5. **Cutover.** Agents stop writing to old tables. Queries all go through new schema. Old tables become read-only.
6. **Grace period.** 30-60 days, old tables remain for emergency rollback.
7. **Drop old tables.** Schema cleanup migration. New schema is the only schema.

**No big-bang migration.** Every stage is reversible until step 7. The `clients`/`contracts`/`proposals`/`invoices`/`coaches`/`vendors` empty shells can be dropped at step 1 since they have no data to preserve.

---

## Next steps

**Review status (2026-04-11, v1.1):** v1.0 was reviewed by Alex twice. v1.1 folds in independent critical reviews from two frontier models (GPT-5 Pro + Gemini 3.1 Pro). Significant v1.1 changes:

- Hard bug fixed: stage-history trigger uses `COALESCE` so a missing `app.current_agent` no longer crashes agent transactions
- Merge enforcement: `fn_merge_parties()` redirects child FKs; `canonical_party_id()` resolver; write-blocking trigger on tombstones
- Duplicate prevention via partial unique indexes on `party_roles`, `pipeline_entries`, and `plutio_outbox`
- `pipeline_entries.dedupe_key` for externally-triggered idempotency
- `party_emails.email` is no longer globally unique — `UNIQUE(party_id, email)`; resolver split into `resolve_parties_by_email()` (SETOF) and `best_party_by_email()` (deterministic)
- `interactions.party_id` becomes `ON DELETE RESTRICT` + `unresolved_contact jsonb` for explicit unresolved-intake state
- `external_ref` strings replaced by structured `(source_provider, source_id)` columns + `source_providers` lookup
- `program_variants.seats_filled` dropped; replaced by `v_program_variant_seats` view
- `relationship_types` lookup table now actually defined (was a hard correctness hole in v1.0)
- `party_relationships.role_in_relationship` split into FK-enforced `contact_role_key` + free-form `role_note`
- Writer-identity protocol: every agent connection sets `app.current_agent`, `app.run_id`, `app.correlation_id`
- `fn_issue_document()` SQL helper guarantees document + interaction + outbox writes are atomic
- `plutio_outbox.payload` shape validation via per-operation BEFORE INSERT trigger; `payload_hash` column for in-flight dedupe
- Booking Reconciler janitor task added (attaches NULL-engagement Trafft webhooks to active packages, with timezone-safe time matching)
- **Layer 9 (Agent-facing views) is new:** `v_party_contact_card`, `v_active_pipeline`, `v_active_engagements`, `v_party_timeline`, `v_client_status`, `v_program_variant_seats` are the public read interface; agent CLAUDE.md files target views, not base tables
- Principle #11 added: base tables are private, agents query views
- Principle #12 added: idempotency is a write-path property, not application concern
- Terminal-stage companion CHECK constraint (`won` requires `won_at`; `lost` requires `lost_at` + `lost_reason`)

The model is ready for plan-file generation. The sequence:

1. **Plan file: `nanoclaw-schema-v2-migration.md`** — concrete migration sequence, DDL, rollback plan, validation queries. Generated via `/autonomous-plan`.
2. **Plan file: `nanoclaw-plutio-outbox.md`** — the outbox + reaper implementation, mirroring `src/hive-sync-reaper.ts`. DDL for the two tables, the reaper loop, backoff policy, metrics, alerts.
3. **Plan file: `nanoclaw-agent-query-migration.md`** — rewrite every `WHERE email = ...` and `WHERE status = ...` query in agent CLAUDE.md files to use the new schema. Per-agent changes documented.
4. **Plan file: `nanoclaw-data-backfill.md`** — the one-shot migration script that moves existing rows from old to new schema, handles the Luna-style duplicates, links up Plutio IDs, preserves history.

Each plan file is executed in sequence with its own validation gate. No plan proceeds until the previous one is validated in staging (or equivalent — for a single-node system, "validated" means run end-to-end on a Postgres snapshot and verified by agent dry-runs).

**Total estimated scope:** 4 plan files, each executable independently. The schema migration and backfill are one weekend of focused work. The query migration is the long tail — touches every agent's CLAUDE.md, which means each agent needs a testing pass.

---

## Related documents

- `docs/business-agents-architecture.md` — tiers, channels, routing (complements this doc)
- `docs/REQUIREMENTS.md` — original architecture decisions
- `~/.claude/projects/-Users-xbohdpukc-dev-NanoClaw/memory/` — project memory index
- `src/hive-sync-reaper.ts` — existing outbox/reaper pattern (proof of concept for the Plutio pattern)
- `toolbox/shared/plutio/tools/plutio/*.sh` — existing Plutio API scripts (the push layer for the outbox reaper)

## Glossary of terms used in this document

- **Party** — a person or organization we know about. The stable identity root.
- **Role** — what a party IS to us (student, coach, client, vendor...), time-bounded.
- **Program** — what we sell or deliver (catalog item).
- **Engagement** — a concrete instance of delivering a program to specific parties.
- **Pipeline entry** — a party's position in a pre-sale funnel for one specific program.
- **Interaction** — an event that happened between us and a party.
- **Document** — a business artifact (proposal, contract, invoice, etc.) tied to a party.
- **Outbox** — a queue of pending writes to an external system (Plutio), drained asynchronously.
- **Reaper** — a background worker that processes an outbox with retry and backoff.

---

**Feedback requested.** Every section is up for debate. The open questions are the minimum set to answer before migration. Other sections may also be wrong — tear them apart.
