# Schema: nanoclaw_business (Postgres)

Generated: 2026-07-26T08:00:57.229Z

Reconciled from tracked migrations 113-114 on 2026-07-30: the two
`business_v2.parties.no_followup_*` columns and Procurement control-plane
structures below postdate the generated snapshot. Migration 114 was applied
and structurally verified in production on 2026-07-30. Run
`tools/refresh-schemas.sh` after the next authorized schema refresh to replace
these overlays with generated evidence.

Structure-only Company OS overlay: migrations 118, 119, and 120 are live under
`NC-20260816-001/017/018`. Exact active release `baed66d` preserves migration
120's one-operator attention loop; its first natural brief, exact
acknowledgment, and threaded receipt are verified. Migration 121 below was
applied under `NC-20260817-002`; exact release `baed66d` live-proved one natural scheduled-time
occurrence plus duplicate-only replay, then expired the observer configuration
back to disabled. The live append-only table contains one row. This overlay is
structure-only; running PostgreSQL remains row/count/permission authority.
Migration 122's source/watermark tables are live and empty under NC-004.
Migration 123's Gmail reconciliation shadow tables are live, empty, and admin-
only under NC-013; no source or shadow producer is activated.

Structure-only outcome-quality overlay: migration 126 is live under exact
release `265622bd` and defines the admin-only,
append-only `company_work_outcome_quality_receipts` contract. Each assessment
binds one exact `sales_email` `external_acknowledged` event and stores only a
bounded classification, opaque SHA-256 evidence/source/assessor keys, and
timestamps. Append-only revisions may supersede but never rewrite a prior
assessment. The live table has zero rows and zero non-admin grants. Migration
126 itself has no producer; NC-20260820-007 deploys a separately gated
standalone host command that is dry-run by default, accepts no customer
identity or content, and can insert only one exact operator-reviewed receipt
after an unchanged short-lived plan plus exact host/release confirmation. It is
not a daemon or agent capability. Repository/command presence alone does not
prove an assessment; use the current NC-20260820-006/007 active-work and
changelog evidence.

Covers the public.* and business_v2.* schemas. business_v2 tables are
headed with their schema prefix; access them via business_v2.v_* views and
business_v2.fn_*() helpers (see data/business/CLAUDE.md), not base-table DML.

## business_v2.company_work_items (migrations 118-119 live)

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.company_work_items_id_seq'::regclass)
  workflow_type                 text                 NOT NULL
  source_system                 text                 NOT NULL
  source_key                    text                 NOT NULL
  party_id                      bigint
  pipeline_entry_id             bigint
  completion_definition         text                 NOT NULL DEFAULT='gmail_ack_and_thread_close'::text
  stage                         text                 NOT NULL DEFAULT='accepted'::text
  disposition                   text                 NOT NULL DEFAULT='open'::text
  version                       integer              NOT NULL DEFAULT=0
  block_code                    text
  failure_code                  text
  deadline_at                   timestamp with time zone
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
  last_transition_at            timestamp with time zone NOT NULL DEFAULT=now()
  last_transition_by            text                 NOT NULL DEFAULT='company-work-ledger:host'::text
```

## business_v2.company_work_receipts (migration 118 live)

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.company_work_receipts_id_seq'::regclass)
  work_item_id                  bigint               NOT NULL
  receipt_type                  text                 NOT NULL
  receipt_system                text                 NOT NULL
  receipt_key                   text                 NOT NULL
  evidence_sha256               text                 NOT NULL
  external_action_id            text
  occurred_at                   timestamp with time zone NOT NULL
  recorded_at                   timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.company_work_events (migrations 118-119 live)

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.company_work_events_id_seq'::regclass)
  work_item_id                  bigint               NOT NULL
  work_item_version             integer              NOT NULL
  event_type                    text                 NOT NULL
  from_stage                    text
  to_stage                      text                 NOT NULL
  from_disposition              text
  to_disposition                text                 NOT NULL
  actor                         text                 NOT NULL
  source_system                 text                 NOT NULL
  source_event_key              text                 NOT NULL
  idempotency_key               text                 NOT NULL
  event_fingerprint             text                 NOT NULL
  evidence_sha256               text
  exception_code                text
  receipt_id                    bigint
  occurred_at                   timestamp with time zone NOT NULL
  recorded_at                   timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.company_work_outcome_quality_receipts (migration 126 live)

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.company_work_outcome_quality_receipts_id_seq'::regclass)
  work_item_id                  bigint               NOT NULL
  delivery_event_version        integer              NOT NULL
  receipt_version               smallint             NOT NULL DEFAULT=1
  assessment_revision           integer              NOT NULL
  assessment                    text                 NOT NULL
  source_system                 text                 NOT NULL
  source_key_sha256             text                 NOT NULL
  evidence_sha256               text                 NOT NULL
  assessor_kind                 text                 NOT NULL
  assessor_key_sha256           text                 NOT NULL
  evidence_occurred_at          timestamp with time zone NOT NULL
  assessed_at                   timestamp with time zone NOT NULL
  supersedes_receipt_id         bigint
  recorded_at                   timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.company_work_exception_cases (migration 120 live)

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.company_work_exception_cases_id_seq'::regclass)
  case_key                      text                 NOT NULL
  work_item_id                  bigint               NOT NULL
  occurrence                    integer              NOT NULL DEFAULT=1
  work_item_version             integer              NOT NULL
  reason_kind                   text                 NOT NULL
  reason_code                   text                 NOT NULL
  severity                      text                 NOT NULL
  state                         text                 NOT NULL DEFAULT='open'::text
  opened_at                     timestamp with time zone NOT NULL
  last_seen_at                  timestamp with time zone NOT NULL
  acknowledged_at               timestamp with time zone
  acknowledged_by_uid           text
  resolved_at                   timestamp with time zone
```

## business_v2.company_work_exception_briefs (migration 120 live)

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.company_work_exception_briefs_id_seq'::regclass)
  brief_fingerprint             text                 NOT NULL
  window_key                    date                 NOT NULL
  report_generated_at           timestamp with time zone NOT NULL
  exception_count               integer              NOT NULL
  status                        text                 NOT NULL DEFAULT='pending'::text
  slack_channel_jid             text
  slack_message_ts              text
  posted_at                     timestamp with time zone
  failure_code                  text
  acknowledged_at               timestamp with time zone
  acknowledged_by_uid           text
  ack_receipt_status            text                 NOT NULL DEFAULT='none'::text
  ack_receipt_ts                text
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.company_work_exception_events (migration 120 live)

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.company_work_exception_events_id_seq'::regclass)
  case_id                       bigint               NOT NULL
  occurrence                    integer              NOT NULL
  event_type                    text                 NOT NULL
  brief_id                      bigint
  actor_uid                     text
  event_key                     text                 NOT NULL
  evidence_sha256               text                 NOT NULL
  occurred_at                   timestamp with time zone NOT NULL
  recorded_at                   timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.company_trigger_occurrences (migration 121 live)

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.company_trigger_occurrences_id_seq'::regclass)
  contract_version              smallint             NOT NULL
  definition_id                 text                 NOT NULL
  occurrence_id                 text                 NOT NULL
  semantic_fingerprint          text                 NOT NULL
  trigger_kind                  text                 NOT NULL
  source_system                 text                 NOT NULL
  source_key                    text                 NOT NULL
  occurrence_key                text                 NOT NULL
  observed_at                   timestamp with time zone NOT NULL
  payload_sha256                text                 NOT NULL
  requested_operation           text                 NOT NULL
  workflow_type                 text                 NOT NULL
  work_source_system            text                 NOT NULL
  work_source_key               text                 NOT NULL
  recorded_at                   timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.company_trigger_sources (migration 122 live, dark under NC-20260817-004)

```
  registry_version              smallint             NOT NULL
  definition_id                 text                 NOT NULL
  source_fingerprint            text                 NOT NULL
  trigger_kind                  text                 NOT NULL
  source_system                 text                 NOT NULL
  source_key                    text                 NOT NULL
  adapter_key                   text                 NOT NULL
  adapter_version               text                 NOT NULL
  cursor_kind                   text                 NOT NULL
  reconciliation_mode           text                 NOT NULL
  max_reconciliation_window_seconds integer
  freshness_budget_seconds      integer
  owner_key                     text                 NOT NULL
  alert_route_key               text                 NOT NULL
  registered_at                 timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.company_trigger_watermark_events (migration 122 live, dark under NC-20260817-004)

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.company_trigger_watermark_events_id_seq'::regclass)
  definition_id                 text                 NOT NULL
  event_key                     text                 NOT NULL
  event_fingerprint             text                 NOT NULL
  event_type                    text                 NOT NULL
  expected_version              bigint               NOT NULL
  previous_cursor               text
  next_cursor                   text                 NOT NULL
  observed_from                 timestamp with time zone NOT NULL
  observed_through              timestamp with time zone NOT NULL
  evidence_sha256               text                 NOT NULL
  observed_count                integer              NOT NULL
  accepted_count                integer              NOT NULL
  rejected_count                integer              NOT NULL
  gap_reason                    text
  resolves_event_id             bigint
  recorded_at                   timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.company_trigger_watermark_state (migration 122 live, dark under NC-20260817-004)

```
  definition_id                 text                 NOT NULL
  version                       bigint               NOT NULL DEFAULT=0
  status                        text                 NOT NULL DEFAULT='uninitialized'::text
  cursor_value                  text
  cursor_observed_at            timestamp with time zone
  open_gap_event_id             bigint
  last_event_id                 bigint
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.company_gmail_reconciliation_snapshots (migration 123 live, dark under NC-20260817-013)

```
  snapshot_id                   text                 NOT NULL
  snapshot_fingerprint          text                 NOT NULL
  definition_id                 text                 NOT NULL
  source_fingerprint            text                 NOT NULL
  gap_event_id                  bigint               NOT NULL
  expected_watermark_version    bigint               NOT NULL
  previous_cursor               text                 NOT NULL
  cursor_observed_at            timestamp with time zone NOT NULL
  target_history_id             text                 NOT NULL
  started_at                    timestamp with time zone NOT NULL
  initial_history_id            text                 NOT NULL
  status                        text                 NOT NULL DEFAULT='pending'::text
  version                       bigint               NOT NULL DEFAULT=0
  next_page_token               text
  next_page_token_sha256        text
  pages_read                    integer              NOT NULL DEFAULT=0
  candidate_count               integer              NOT NULL DEFAULT=0
  accepted_count                integer              NOT NULL DEFAULT=0
  rejected_count                integer              NOT NULL DEFAULT=0
  completed_at                  timestamp with time zone
  final_history_id              text
  reconciliation_evidence_sha256 text
  proposed_event_fingerprint    text
  invalid_reason                text
  invalidated_at                timestamp with time zone
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.company_gmail_reconciliation_pages (migration 123 live, dark under NC-20260817-013)

```
  snapshot_id                   text                 NOT NULL
  page_index                    integer              NOT NULL
  page_fingerprint              text                 NOT NULL
  request_page_token_sha256     text
  next_page_token_sha256        text
  candidate_count               integer              NOT NULL
  accepted_count                integer              NOT NULL
  rejected_count                integer              NOT NULL
  recorded_at                   timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.company_gmail_reconciliation_candidates (migration 123 live, dark under NC-20260817-013)

```
  snapshot_id                   text                 NOT NULL
  gmail_message_id              text                 NOT NULL
  page_index                    integer              NOT NULL
  disposition                   text                 NOT NULL
  reason_key                    text                 NOT NULL
  evidence_sha256               text                 NOT NULL
  candidate_fingerprint         text                 NOT NULL
  recorded_at                   timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.company_gmail_mailbox_audits (migration 124 live under NC-20260818-002)

```
  audit_id                      text                 NOT NULL
  audit_fingerprint             text                 NOT NULL
  definition_id                 text                 NOT NULL
  source_fingerprint            text                 NOT NULL
  expected_watermark_version    bigint               NOT NULL
  cursor_evidence_sha256        text                 NOT NULL
  started_at                    timestamp with time zone NOT NULL
  initial_history_id            text                 NOT NULL
  status                        text                 NOT NULL DEFAULT='pending'
  version                       bigint               NOT NULL DEFAULT=0
  next_page_token               text
  next_page_token_sha256        text
  pages_read                    integer              NOT NULL DEFAULT=0
  candidate_count               integer              NOT NULL DEFAULT=0
  accepted_count                integer              NOT NULL DEFAULT=0
  rejected_count                integer              NOT NULL DEFAULT=0
  unknown_count                 integer              NOT NULL DEFAULT=0
  completed_at                  timestamp with time zone
  final_history_id              text
  audit_evidence_sha256         text
  invalid_reason                text
  invalidated_at                timestamp with time zone
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.company_gmail_mailbox_audit_pages (migration 124 live under NC-20260818-002)

```
  audit_id                      text                 NOT NULL
  page_index                    integer              NOT NULL
  page_fingerprint              text                 NOT NULL
  request_page_token_sha256     text
  next_page_token_sha256        text
  candidate_count               integer              NOT NULL
  accepted_count                integer              NOT NULL
  rejected_count                integer              NOT NULL
  unknown_count                 integer              NOT NULL
  recorded_at                   timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.company_gmail_mailbox_audit_candidates (migration 124 live under NC-20260818-002)

```
  audit_id                      text                 NOT NULL
  gmail_message_id              text                 NOT NULL
  page_index                    integer              NOT NULL
  disposition                   text                 NOT NULL
  reason_key                    text                 NOT NULL
  evidence_sha256               text                 NOT NULL
  candidate_fingerprint         text                 NOT NULL
  recorded_at                   timestamp with time zone NOT NULL DEFAULT=now()
```

## booking_events

```
  id                            integer              NOT NULL DEFAULT=nextval('booking_events_id_seq'::regclass)
  trafft_appointment_id         text
  event_type                    text                 NOT NULL
  status                        text
  customer_name                 text
  customer_email                text
  customer_phone                text
  service_name                  text
  employee_name                 text
  start_date_time               timestamp with time zone
  end_date_time                 timestamp with time zone
  raw_payload                   jsonb                NOT NULL
  follow_up_status              text                 DEFAULT='pending'::text
  follow_up_draft               text
  notes                         text
  created_at                    timestamp with time zone DEFAULT=now()
  plutio_person_id              text
```

## classification_backfill_pending

```
  id                            integer              NOT NULL DEFAULT=nextval('classification_backfill_pending_id_seq'::regclass)
  lesson_title                  text                 NOT NULL
  pattern_type                  text                 NOT NULL
  pattern_value                 text                 NOT NULL
  target_label                  text                 NOT NULL
  match_count                   integer              NOT NULL
  dry_run_summary               text
  status                        text                 NOT NULL DEFAULT='awaiting_confirmation'::text
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  expires_at                    timestamp with time zone NOT NULL DEFAULT=(now() + '24:00:00'::interval)
  resolved_at                   timestamp with time zone
  resolved_by                   text
```

## classification_rules

```
  id                            integer              NOT NULL DEFAULT=nextval('classification_rules_id_seq'::regclass)
  pattern_type                  text                 NOT NULL
  pattern_value                 text                 NOT NULL
  target_label                  text                 NOT NULL
  source                        text                 NOT NULL
  lesson_id                     integer
  hit_count                     integer              DEFAULT=0
  last_hit_at                   timestamp with time zone
  enabled                       boolean              DEFAULT=true
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  probation_until               timestamp with time zone
```

## classification_taxonomy

```
  id                            integer              NOT NULL DEFAULT=nextval('classification_taxonomy_id_seq'::regclass)
  label                         text                 NOT NULL
  parent_label                  text
  description                   text
  hive_share_target             ARRAY
  digest_priority               integer              DEFAULT=0
  enabled                       boolean              DEFAULT=true
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
  auto_archive                  boolean              NOT NULL DEFAULT=false
```

## clients

```
  id                            integer              NOT NULL DEFAULT=nextval('clients_id_seq'::regclass)
  contract_id                   integer
  name                          text                 NOT NULL
  email                         text
  coach_id                      integer
  start_date                    date
  session_count                 integer              NOT NULL DEFAULT=0
  status                        text                 NOT NULL DEFAULT='active'::text
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## coaches

```
  id                            integer              NOT NULL DEFAULT=nextval('coaches_id_seq'::regclass)
  name                          text                 NOT NULL
  email                         text
  capacity                      integer              NOT NULL DEFAULT=5
  current_clients               integer              NOT NULL DEFAULT=0
  certifications                jsonb
  status                        text                 NOT NULL DEFAULT='active'::text
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## contracts

```
  id                            integer              NOT NULL DEFAULT=nextval('contracts_id_seq'::regclass)
  proposal_id                   integer
  client                        text                 NOT NULL
  coach_assigned                text
  start_date                    date
  end_date                      date
  status                        text                 NOT NULL DEFAULT='active'::text
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## email_classifications

```
  id                            integer              NOT NULL DEFAULT=nextval('email_classifications_id_seq'::regclass)
  gmail_message_id              text                 NOT NULL
  gmail_thread_id               text                 NOT NULL
  sender_email                  text
  subject                       text
  label                         text                 NOT NULL
  confidence                    numeric
  classifier_version            text                 NOT NULL
  reasoning                     text
  classified_at                 timestamp with time zone NOT NULL DEFAULT=now()
  corrected_at                  timestamp with time zone
  corrected_from_label          text
  hive_synced                   boolean              DEFAULT=false
  hive_synced_at                timestamp with time zone
  reaper_attempts               integer              DEFAULT=0
  hive_sync_dead_lettered       boolean              DEFAULT=false
  routed_at                     timestamp with time zone
```

## invoices

```
  id                            integer              NOT NULL DEFAULT=nextval('invoices_id_seq'::regclass)
  contract_id                   integer
  amount                        numeric              NOT NULL
  status                        text                 NOT NULL DEFAULT='pending'::text
  due_date                      date
  paid_at                       timestamp with time zone
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## leads

```
  id                            integer              NOT NULL DEFAULT=nextval('leads_id_seq'::regclass)
  source                        text                 NOT NULL
  status                        text                 NOT NULL DEFAULT='new'::text
  name                          text
  email                         text
  company                       text
  message                       text
  assigned_to                   text
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
  follow_up_count               integer              NOT NULL DEFAULT=0
  last_contact_at               timestamp with time zone
  thread_id                     text
  plutio_person_id              text
```

## payments

```
  id                            integer              NOT NULL DEFAULT=nextval('payments_id_seq'::regclass)
  email                         character varying    NOT NULL
  name                          character varying
  product_name                  character varying
  product_id                    character varying    DEFAULT=''::character varying
  amount_cents                  integer
  currency                      character varying    DEFAULT='USD'::character varying
  stripe_session_id             character varying
  payment_status                character varying
  event_type                    character varying
  paid_at                       timestamp without time zone
  created_at                    timestamp without time zone DEFAULT=now()
```

## procurement_opportunities

```
  id                            integer              NOT NULL DEFAULT=nextval('procurement_opportunities_id_seq'::regclass)
  bonfire_id                    text                 NOT NULL
  bonfire_url                   text
  title                         text                 NOT NULL
  agency                        text
  close_date                    date
  category                      text
  search_keyword                text
  relevance                     text
  relevance_reason              text
  status                        text                 DEFAULT='new'::text
  rejection_reason              text
  vault_path                    text
  raw_snapshot                  jsonb
  detail_data                   jsonb
  scrape_attempts               integer              DEFAULT=0
  last_error                    text
  first_seen_at                 timestamp with time zone DEFAULT=now()
  last_seen_at                  timestamp with time zone DEFAULT=now()
  updated_at                    timestamp with time zone DEFAULT=now()
  reviewed_at                   timestamp with time zone
  scraped_at                    timestamp with time zone
  source                        text                 DEFAULT='bonfire'::text
  source_key                    text
  review_state                  text                 DEFAULT='unreviewed'::text
  review_reason                 text
  review_version                integer              NOT NULL DEFAULT=0
  decision_owner                text
  decision_at                   timestamp with time zone
```

## procurement_observations

```
  id                            bigint               NOT NULL DEFAULT=nextval('procurement_observations_id_seq'::regclass)
  source_run_id                 bigint
  opportunity_id                integer              NOT NULL
  source                        text                 NOT NULL
  source_key                    text                 NOT NULL
  observed_at                   timestamp with time zone NOT NULL
  payload_hash                  text                 NOT NULL
  title                         text                 NOT NULL
  agency                        text
  close_date                    date
  category                      text
  source_url                    text
  search_keywords               ARRAY                NOT NULL DEFAULT='{}'::text[]
  gmail_message_id              text
  gmail_thread_id               text
  raw_payload                   jsonb                NOT NULL
  recorded_at                   timestamp with time zone NOT NULL DEFAULT=now()
```

## procurement_source_runs

```
  id                            bigint               NOT NULL DEFAULT=nextval('procurement_source_runs_id_seq'::regclass)
  source                        text                 NOT NULL
  run_key                       text                 NOT NULL
  status                        text                 NOT NULL DEFAULT='running'::text
  started_at                    timestamp with time zone NOT NULL
  completed_at                  timestamp with time zone
  observations_seen             integer              NOT NULL DEFAULT=0
  observations_new              integer              NOT NULL DEFAULT=0
  error_code                    text
  metadata                      jsonb                NOT NULL DEFAULT='{}'::jsonb
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## procurement_review_cards

```
  id                            bigint               NOT NULL DEFAULT=nextval('procurement_review_cards_id_seq'::regclass)
  opportunity_id                integer              NOT NULL
  review_version                integer              NOT NULL
  channel_jid                   text                 NOT NULL
  message_ts                    text                 NOT NULL
  action_epoch                  text                 NOT NULL
  recommendation                text                 NOT NULL
  recommendation_reason         text                 NOT NULL
  state                         text                 NOT NULL DEFAULT='open'::text
  decision                      text
  decision_reason               text
  decision_owner_uid            text
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  decided_at                    timestamp with time zone
```

## v_procurement_review_queue

```
  opportunity_id                integer
  source                        text
  source_key                    text
  title                         text
  agency                        text
  close_date                    date
  category                      text
  source_url                    text
  review_state                  text
  review_reason                 text
  review_version                integer
  first_seen_at                 timestamp with time zone
  last_seen_at                  timestamp with time zone
  days_until_close              integer
```

## proposals

```
  id                            integer              NOT NULL DEFAULT=nextval('proposals_id_seq'::regclass)
  lead_id                       integer
  status                        text                 NOT NULL DEFAULT='draft'::text
  amount                        numeric
  sent_at                       timestamp with time zone
  signed_at                     timestamp with time zone
  notes                         text
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## tasks

```
  id                            integer              NOT NULL DEFAULT=nextval('tasks_id_seq'::regclass)
  from_agent                    text                 NOT NULL
  to_agent                      text                 NOT NULL
  type                          text                 NOT NULL
  payload                       jsonb                NOT NULL
  status                        text                 NOT NULL DEFAULT='pending'::text
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## vendors

```
  id                            integer              NOT NULL DEFAULT=nextval('vendors_id_seq'::regclass)
  name                          text                 NOT NULL
  category                      text
  cost                          numeric
  renewal_date                  date
  status                        text                 NOT NULL DEFAULT='active'::text
  notes                         text
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.attachments

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.attachments_id_seq'::regclass)
  interaction_id                bigint               NOT NULL
  filename                      text
  mime_type                     text
  size_bytes                    bigint
  storage_provider              text
  storage_url                   text
  metadata                      jsonb                NOT NULL DEFAULT='{}'::jsonb
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.collector_state

```
  key                           text                 NOT NULL
  value                         jsonb                NOT NULL DEFAULT='{}'::jsonb
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.contact_roles

```
  key                           text                 NOT NULL
  label                         text                 NOT NULL
  description                   text                 NOT NULL DEFAULT=''::text
  enabled                       boolean              NOT NULL DEFAULT=true
```

## business_v2.daemon_heartbeat

```
  name                          text                 NOT NULL
  last_beat                     timestamp with time zone NOT NULL DEFAULT=now()
  pid                           integer
  version                       text
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.document_kinds

```
  key                           text                 NOT NULL
  label                         text                 NOT NULL
  description                   text                 NOT NULL DEFAULT=''::text
  enabled                       boolean              NOT NULL DEFAULT=true
```

## business_v2.document_line_items

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.document_line_items_id_seq'::regclass)
  document_id                   bigint               NOT NULL
  line_order                    integer              NOT NULL
  description                   text
  quantity                      numeric              NOT NULL DEFAULT=1
  unit_price_cents              integer              NOT NULL DEFAULT=0
  subtotal_cents                integer              NOT NULL DEFAULT=0
  metadata                      jsonb                NOT NULL DEFAULT='{}'::jsonb
```

## business_v2.document_statuses

```
  key                           text                 NOT NULL
  label                         text                 NOT NULL
  description                   text                 NOT NULL DEFAULT=''::text
  enabled                       boolean              NOT NULL DEFAULT=true
```

## business_v2.documents

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.documents_id_seq'::regclass)
  party_id                      bigint               NOT NULL
  kind                          text                 NOT NULL
  status                        text                 NOT NULL
  issued_at                     timestamp with time zone
  due_at                        timestamp with time zone
  amount_cents                  integer
  currency                      text                 NOT NULL DEFAULT='USD'::text
  document_number               text
  source_provider               text
  source_id                     text
  interaction_id                bigint
  metadata                      jsonb                NOT NULL DEFAULT='{}'::jsonb
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
  last_updated_by               text                 NOT NULL DEFAULT='unknown'::text
```

## business_v2.email_followup_suppressions

```
  proposal_plutio_id            text                 NOT NULL
  party_id                      bigint
  email                         text
  reason                        text                 NOT NULL DEFAULT='open_proposal'::text
  last_seen_open_at             timestamp with time zone NOT NULL DEFAULT=now()
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.engagement_kinds

```
  key                           text                 NOT NULL
  label                         text                 NOT NULL
  description                   text                 NOT NULL DEFAULT=''::text
  enabled                       boolean              NOT NULL DEFAULT=true
```

## business_v2.engagement_participants

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.engagement_participants_id_seq'::regclass)
  engagement_id                 bigint               NOT NULL
  party_id                      bigint               NOT NULL
  participant_role              text                 NOT NULL
  started_at                    timestamp with time zone NOT NULL DEFAULT=now()
  ended_at                      timestamp with time zone
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.engagements

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.engagements_id_seq'::regclass)
  kind                          text                 NOT NULL
  status                        text                 NOT NULL DEFAULT='active'::text
  program_variant_id            bigint
  started_at                    timestamp with time zone
  ended_at                      timestamp with time zone
  metadata                      jsonb                NOT NULL DEFAULT='{}'::jsonb
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
  last_updated_by               text                 NOT NULL DEFAULT='unknown'::text
```

## business_v2.incidents

```
  id                            bigint               NOT NULL
  source                        text                 NOT NULL
  fingerprint                   text                 NOT NULL
  severity                      text                 NOT NULL DEFAULT='error'::text
  status                        text                 NOT NULL DEFAULT='new'::text
  occurrences                   integer              NOT NULL DEFAULT=1
  first_seen                    timestamp with time zone NOT NULL DEFAULT=now()
  last_seen                     timestamp with time zone NOT NULL DEFAULT=now()
  raw_context                   jsonb                NOT NULL DEFAULT='{}'::jsonb
  remediation_class             text
  diagnosis                     text
  proposed_fix                  jsonb
  applied_action                jsonb
  outcome                       text
  origin                        text                 NOT NULL DEFAULT='collector'::text
  restart_attempts              integer              NOT NULL DEFAULT=0
  proposal_channel              text
  proposal_ts                   text
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
  confidence                    text
  cause_or_symptom              text
  evidence                      jsonb
  review                        jsonb
  investigation_log             text
  thread_ts                     text
  thread_channel                text
```

## business_v2.interaction_channels

```
  key                           text                 NOT NULL
  label                         text                 NOT NULL
  description                   text                 NOT NULL DEFAULT=''::text
  enabled                       boolean              NOT NULL DEFAULT=true
```

## business_v2.interactions

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.interactions_id_seq'::regclass)
  party_id                      bigint
  engagement_id                 bigint
  channel                       text                 NOT NULL
  direction                     text                 NOT NULL
  subject                       text
  body                          text
  occurred_at                   timestamp with time zone NOT NULL
  source_provider               text
  source_id                     text
  source_thread_id              text
  metadata                      jsonb                NOT NULL DEFAULT='{}'::jsonb
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
  last_updated_by               text                 NOT NULL DEFAULT='unknown'::text
```

## business_v2.lost_reasons

```
  key                           text                 NOT NULL
  label                         text                 NOT NULL
  description                   text                 NOT NULL DEFAULT=''::text
  enabled                       boolean              NOT NULL DEFAULT=true
```

## business_v2.participant_roles

```
  key                           text                 NOT NULL
  label                         text                 NOT NULL
  description                   text                 NOT NULL DEFAULT=''::text
  enabled                       boolean              NOT NULL DEFAULT=true
```

## business_v2.parties

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.parties_id_seq'::regclass)
  party_type                    text                 NOT NULL
  display_name                  text                 NOT NULL
  legal_name                    text
  primary_email                 USER-DEFINED
  notes                         text
  source_provider               text
  source_id                     text
  merged_into                   bigint
  merged_at                     timestamp with time zone
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
  last_updated_by               text                 NOT NULL DEFAULT='unknown'::text
  dnd_at                        timestamp with time zone
  no_followup_at                timestamp with time zone
  no_followup_reason            text
```

## business_v2.party_contact_roles

```
  party_id                      bigint               NOT NULL
  contact_role                  text                 NOT NULL
  for_party_id                  bigint               NOT NULL
```

## business_v2.party_emails

```
  party_id                      bigint               NOT NULL
  email                         USER-DEFINED         NOT NULL
  is_primary                    boolean              NOT NULL DEFAULT=false
  verified_at                   timestamp with time zone
```

## business_v2.party_relationships

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.party_relationships_id_seq'::regclass)
  from_party_id                 bigint               NOT NULL
  to_party_id                   bigint               NOT NULL
  relationship_type             text                 NOT NULL
  started_at                    timestamp with time zone NOT NULL DEFAULT=now()
  ended_at                      timestamp with time zone
  metadata                      jsonb                NOT NULL DEFAULT='{}'::jsonb
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.party_roles

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.party_roles_id_seq'::regclass)
  party_id                      bigint               NOT NULL
  role_type                     text                 NOT NULL
  started_at                    timestamp with time zone NOT NULL DEFAULT=now()
  ended_at                      timestamp with time zone
  metadata                      jsonb                NOT NULL DEFAULT='{}'::jsonb
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.pipeline_entries

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.pipeline_entries_id_seq'::regclass)
  party_id                      bigint               NOT NULL
  program_id                    bigint               NOT NULL
  stage                         text                 NOT NULL
  amount_cents                  integer
  currency                      text                 NOT NULL DEFAULT='USD'::text
  dedupe_key                    text
  entered_stage_at              timestamp with time zone NOT NULL DEFAULT=now()
  expected_close_date           date
  notes                         text
  metadata                      jsonb                NOT NULL DEFAULT='{}'::jsonb
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
  last_updated_by               text                 NOT NULL DEFAULT='unknown'::text
```

## business_v2.pipeline_stage_history

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.pipeline_stage_history_id_seq'::regclass)
  pipeline_entry_id             bigint               NOT NULL
  from_stage                    text
  to_stage                      text                 NOT NULL
  transitioned_at               timestamp with time zone NOT NULL DEFAULT=now()
  transitioned_by               text                 NOT NULL DEFAULT='unknown'::text
  reason                        text                 NOT NULL DEFAULT='unspecified'::text
  metadata                      jsonb                NOT NULL DEFAULT='{}'::jsonb
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.pipeline_stages

```
  key                           text                 NOT NULL
  label                         text                 NOT NULL
  description                   text                 NOT NULL DEFAULT=''::text
  sort_order                    integer              NOT NULL
  is_terminal                   boolean              NOT NULL DEFAULT=false
  enabled                       boolean              NOT NULL DEFAULT=true
```

## business_v2.plutio_outbox

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.plutio_outbox_id_seq'::regclass)
  operation                     text                 NOT NULL
  kind                          text                 NOT NULL
  party_id                      bigint
  engagement_id                 bigint
  document_id                   bigint
  payload                       jsonb                NOT NULL
  status                        text                 NOT NULL DEFAULT='pending'::text
  attempts                      integer              NOT NULL DEFAULT=0
  last_attempted_at             timestamp with time zone
  last_error                    text
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
  last_updated_by               text                 NOT NULL DEFAULT='unknown'::text
```

## business_v2.plutio_outbox_operations

```
  key                           text                 NOT NULL
  label                         text                 NOT NULL
  description                   text                 NOT NULL DEFAULT=''::text
  enabled                       boolean              NOT NULL DEFAULT=true
```

## business_v2.plutio_outbox_statuses

```
  key                           text                 NOT NULL
  label                         text                 NOT NULL
  description                   text                 NOT NULL DEFAULT=''::text
  is_terminal                   boolean              NOT NULL DEFAULT=false
  sort_order                    integer              NOT NULL
  enabled                       boolean              NOT NULL DEFAULT=true
```

## business_v2.plutio_refs

```
  entity_type                   text                 NOT NULL
  entity_id                     bigint               NOT NULL
  plutio_entity_type            text                 NOT NULL
  plutio_id                     text                 NOT NULL
  plutio_url                    text
  last_pushed_at                timestamp with time zone
  last_pulled_at                timestamp with time zone
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.program_kinds

```
  key                           text                 NOT NULL
  label                         text                 NOT NULL
  description                   text                 NOT NULL DEFAULT=''::text
  enabled                       boolean              NOT NULL DEFAULT=true
```

## business_v2.program_variants

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.program_variants_id_seq'::regclass)
  program_id                    bigint               NOT NULL
  variant_key                   text                 NOT NULL
  display_name                  text                 NOT NULL
  capacity                      integer
  price_cents                   integer
  currency                      text                 NOT NULL DEFAULT='USD'::text
  is_active                     boolean              NOT NULL DEFAULT=true
  metadata                      jsonb                NOT NULL DEFAULT='{}'::jsonb
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.programs

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.programs_id_seq'::regclass)
  slug                          USER-DEFINED         NOT NULL
  kind                          text                 NOT NULL
  display_name                  text                 NOT NULL
  description                   text
  is_active                     boolean              NOT NULL DEFAULT=true
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
  last_updated_by               text                 NOT NULL DEFAULT='unknown'::text
```

## business_v2.proposal_actions

```
  id                            bigint               NOT NULL
  proposal_plutio_id            text                 NOT NULL
  proposal_number               text
  action                        text                 NOT NULL
  recipient_email               text
  party_id                      bigint
  reply_summary                 text
  slack_ts                      text
  status                        text                 NOT NULL DEFAULT='pending'::text
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  resolved_at                   timestamp with time zone
```

## business_v2.proposal_followups

```
  id                            bigint               NOT NULL
  proposal_plutio_id            text                 NOT NULL
  proposal_number               text
  sequence_no                   smallint             NOT NULL
  recipient_email               text
  recipient_name                text
  party_id                      bigint
  thread_id                     text
  subject                       text                 NOT NULL
  body                          text                 NOT NULL
  proposal_url                  text
  slack_channel                 text
  slack_ts                      text
  gmail_message_id              text
  status                        text                 NOT NULL DEFAULT='pending_approval'::text
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  sent_at                       timestamp with time zone
```

## business_v2.relationship_types

```
  key                           text                 NOT NULL
  label                         text                 NOT NULL
  description                   text                 NOT NULL DEFAULT=''::text
  enabled                       boolean              NOT NULL DEFAULT=true
```

## business_v2.role_types

```
  key                           text                 NOT NULL
  label                         text                 NOT NULL
  description                   text                 NOT NULL DEFAULT=''::text
  category                      text                 NOT NULL
  is_person_only                boolean              NOT NULL DEFAULT=false
  enabled                       boolean              NOT NULL DEFAULT=true
```

## business_v2.source_providers

```
  key                           text                 NOT NULL
  label                         text                 NOT NULL
  description                   text                 NOT NULL DEFAULT=''::text
  enabled                       boolean              NOT NULL DEFAULT=true
```

## business_v2.sweeper_watermarks

```
  source                        text                 NOT NULL
  last_seen_id                  text
  last_seen_at                  timestamp with time zone
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
  last_run_at                   timestamp with time zone
  last_run_status               text
  last_run_error                text
  last_run_recovered            integer              NOT NULL DEFAULT=0
  last_run_failed               integer              NOT NULL DEFAULT=0
```

## business_v2.v_active_engagements

```
  participant_id                bigint
  engagement_id                 bigint
  engagement_kind               text
  engagement_status             text
  party_id                      bigint
  display_name                  text
  participant_role              text
  started_at                    timestamp with time zone
  program_variant_id            bigint
  variant_name                  text
  program_id                    bigint
  program_slug                  USER-DEFINED
  program_name                  text
```

## business_v2.v_active_pipeline

```
  pipeline_entry_id             bigint
  party_id                      bigint
  display_name                  text
  program_id                    bigint
  program_slug                  USER-DEFINED
  program_name                  text
  stage                         text
  amount_cents                  integer
  currency                      text
  entered_stage_at              timestamp with time zone
  expected_close_date           date
  dedupe_key                    text
  notes                         text
  last_interaction_at           timestamp with time zone
```

## business_v2.v_client_status

```
  party_id                      bigint
  display_name                  text
  client_status                 text
  last_engagement_ended_at      timestamp with time zone
```

## business_v2.v_party_contact_card

```
  party_id                      bigint
  display_name                  text
  party_type                    text
  primary_email                 USER-DEFINED
  legal_name                    text
  source_provider               text
  active_roles                  ARRAY
  last_interaction_at           timestamp with time zone
```

## business_v2.v_party_timeline

```
  party_id                      bigint
  interaction_id                bigint
  occurred_at                   timestamp with time zone
  channel                       text
  direction                     text
  subject                       text
  source_provider               text
  source_id                     text
  engagement_id                 bigint
  pipeline_entry_id             bigint
  document_id                   bigint
  document_kind                 text
  document_status               text
```

## business_v2.v_program_variant_seats

```
  program_variant_id            bigint
  variant_name                  text
  program_slug                  USER-DEFINED
  seats_total                   integer
  seats_filled                  bigint
  seats_remaining               bigint
```

## business_v2.v_sales_followup_queue

```
  pipeline_entry_id             bigint
  party_id                      bigint
  display_name                  text
  primary_email                 USER-DEFINED
  stage                         text
  program_name                  text
  last_interaction_at           timestamp with time zone
  follow_up_count               bigint
  thread_id                     text
  original_subject              text
  inquiry_source                text
  inquiry_text                  text
  interest_page                 text
```

## business_v2.v_sales_needs_reply

```
  pipeline_entry_id             bigint
  party_id                      bigint
  display_name                  text
  primary_email                 USER-DEFINED
  stage                         text
  program_name                  text
  last_inbound_at               timestamp with time zone
  last_outbound_at              timestamp with time zone
  last_inbound_subject          text
  last_inbound_message          text
  thread_id                     text
  days_waiting                  numeric
```

## business_v2.variant_enrollments

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.variant_enrollments_id_seq'::regclass)
  variant_id                    bigint               NOT NULL
  engagement_id                 bigint               NOT NULL
  started_at                    timestamp with time zone NOT NULL DEFAULT=now()
  ended_at                      timestamp with time zone
  status                        text                 NOT NULL DEFAULT='active'::text
  metadata                      jsonb                NOT NULL DEFAULT='{}'::jsonb
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.webhook_inbox

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.webhook_inbox_id_seq'::regclass)
  source                        text                 NOT NULL
  event_id                      text
  event_type                    text
  received_at                   timestamp with time zone NOT NULL DEFAULT=now()
  delivery_path                 text                 NOT NULL DEFAULT='n8n'::text
  raw_headers                   jsonb
  raw_body                      jsonb                NOT NULL
  status                        text                 NOT NULL DEFAULT='received'::text
  attempts                      integer              NOT NULL DEFAULT=0
  last_error                    text
  last_attempted_at             timestamp with time zone
  handled_at                    timestamp with time zone
  handled_by                    text
  party_id                      bigint
  related_entity                jsonb
```
