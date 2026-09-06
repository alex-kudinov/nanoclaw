# Schema: nanoclaw_business (Postgres)

Generated: 2026-09-06T21:30:24.628Z

Covers the public.* and business_v2.* schemas. business_v2 tables are
headed with their schema prefix; access them via business_v2.v_* views and
business_v2.fn_*() helpers (see data/business/CLAUDE.md), not base-table DML.

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
  cohort                        text
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

## procurement_pursuit_events

```
  id                            bigint               NOT NULL DEFAULT=nextval('procurement_pursuit_events_id_seq'::regclass)
  pursuit_id                    bigint               NOT NULL
  pursuit_version               integer              NOT NULL
  event_type                    text                 NOT NULL
  from_state                    text
  to_state                      text                 NOT NULL
  actor_uid                     text                 NOT NULL
  action_epoch                  text
  reason                        text                 NOT NULL
  payload                       jsonb                NOT NULL DEFAULT='{}'::jsonb
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## procurement_pursuits

```
  id                            bigint               NOT NULL DEFAULT=nextval('procurement_pursuits_id_seq'::regclass)
  opportunity_id                integer              NOT NULL
  decision_version              integer              NOT NULL
  source_review_card_id         bigint
  pursuit_state                 text                 NOT NULL DEFAULT='qualifying'::text
  pursuit_version               integer              NOT NULL DEFAULT=0
  owner_uid                     text                 NOT NULL
  next_action                   text                 NOT NULL
  next_action_due               timestamp with time zone NOT NULL
  terminal_reason               text
  closed_at                     timestamp with time zone
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## procurement_reconciler_alerts

```
  id                            bigint               NOT NULL DEFAULT=nextval('procurement_reconciler_alerts_id_seq'::regclass)
  condition_key                 text                 NOT NULL
  subject_kind                  text                 NOT NULL
  subject_id                    text                 NOT NULL
  subject_version               text                 NOT NULL
  alert_text                    text                 NOT NULL
  channel_jid                   text
  thread_ts                     text
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  delivered_at                  timestamp with time zone
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

## procurement_source_run_opportunities

```
  source_run_id                 bigint               NOT NULL
  opportunity_id                integer              NOT NULL
  linked_at                     timestamp with time zone NOT NULL DEFAULT=now()
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
  adapter_version               text
  planned_units                 jsonb                NOT NULL DEFAULT='[]'::jsonb
  observed_units                jsonb                NOT NULL DEFAULT='[]'::jsonb
  missing_units                 jsonb                NOT NULL DEFAULT='[]'::jsonb
  coverage_evidence             jsonb                NOT NULL DEFAULT='{}'::jsonb
  terminal_reason               text
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

## v_procurement_pursuit_queue

```
  pursuit_id                    bigint
  pursuit_version               integer
  pursuit_state                 text
  owner_uid                     text
  next_action                   text
  next_action_due               timestamp with time zone
  opportunity_id                integer
  source                        text
  source_key                    text
  title                         text
  agency                        text
  close_date                    date
  category                      text
  days_until_close              integer
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

## business_v2.academy_capacity_events

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.academy_capacity_events_id_seq'::regclass)
  event_key                     text                 NOT NULL
  subject_type                  text                 NOT NULL
  subject_key                   text                 NOT NULL
  previous_version              integer
  new_version                   integer              NOT NULL
  event_type                    text                 NOT NULL
  evidence_sha256               text                 NOT NULL
  actor                         text                 NOT NULL
  occurred_at                   timestamp with time zone NOT NULL
  recorded_at                   timestamp with time zone NOT NULL
```

## business_v2.academy_capacity_operator_cases

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.academy_capacity_operator_cases_id_seq'::regclass)
  case_key                      text                 NOT NULL
  source_group                  text                 NOT NULL
  command_type                  text                 NOT NULL
  request_sha256                text                 NOT NULL
  request_summary               jsonb                NOT NULL
  state                         text                 NOT NULL
  version                       integer              NOT NULL DEFAULT=0
  result_code                   text
  result_sha256                 text
  result_summary                jsonb
  created_at                    timestamp with time zone NOT NULL
  updated_at                    timestamp with time zone NOT NULL
  completed_at                  timestamp with time zone
  updated_by                    text                 NOT NULL
```

## business_v2.academy_capacity_operator_receipts

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.academy_capacity_operator_receipts_id_seq'::regclass)
  receipt_key                   text                 NOT NULL
  case_id                       bigint               NOT NULL
  case_version                  integer              NOT NULL
  stage                         text                 NOT NULL
  outcome                       text                 NOT NULL
  result_code                   text                 NOT NULL
  evidence_sha256               text                 NOT NULL
  summary_json                  jsonb                NOT NULL
  actor                         text                 NOT NULL
  occurred_at                   timestamp with time zone NOT NULL
  recorded_at                   timestamp with time zone NOT NULL
```

## business_v2.academy_capacity_reservations

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.academy_capacity_reservations_id_seq'::regclass)
  reservation_key               text                 NOT NULL
  pool_id                       bigint               NOT NULL
  channel                       text                 NOT NULL
  source_scope                  text                 NOT NULL
  idempotency_key               text                 NOT NULL
  offer_key                     text                 NOT NULL
  catalog_revision              integer              NOT NULL
  order_id                      bigint
  seat_id                       bigint
  state                         text                 NOT NULL
  version                       integer              NOT NULL DEFAULT=0
  expires_at                    timestamp with time zone NOT NULL
  reason                        text
  source_evidence_sha256        text                 NOT NULL
  created_at                    timestamp with time zone NOT NULL
  updated_at                    timestamp with time zone NOT NULL
  updated_by                    text                 NOT NULL
```

## business_v2.academy_delivery_blocks

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.academy_delivery_blocks_id_seq'::regclass)
  delivery_block_key            text                 NOT NULL
  component_key                 text                 NOT NULL
  source_scope                  text                 NOT NULL
  source_object_id              text                 NOT NULL
  starts_at                     timestamp with time zone NOT NULL
  ends_at                       timestamp with time zone NOT NULL
  timezone                      text                 NOT NULL
  session_set_sha256            text                 NOT NULL
  schedule_evidence_sha256      text                 NOT NULL
  state                         text                 NOT NULL
  version                       integer              NOT NULL DEFAULT=0
  created_at                    timestamp with time zone NOT NULL
  updated_at                    timestamp with time zone NOT NULL
  updated_by                    text                 NOT NULL
```

## business_v2.academy_seat_pool_offers

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.academy_seat_pool_offers_id_seq'::regclass)
  mapping_key                   text                 NOT NULL
  pool_id                       bigint               NOT NULL
  offer_key                     text                 NOT NULL
  catalog_revision              integer              NOT NULL
  state                         text                 NOT NULL
  version                       integer              NOT NULL DEFAULT=0
  evidence_sha256               text                 NOT NULL
  created_at                    timestamp with time zone NOT NULL
  updated_at                    timestamp with time zone NOT NULL
  updated_by                    text                 NOT NULL
```

## business_v2.academy_seat_pools

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.academy_seat_pools_id_seq'::regclass)
  pool_key                      text                 NOT NULL
  delivery_block_id             bigint               NOT NULL
  capacity                      integer              NOT NULL
  operational_state             text                 NOT NULL
  close_reason                  text
  configuration_evidence_sha256 text                 NOT NULL
  version                       integer              NOT NULL DEFAULT=0
  created_at                    timestamp with time zone NOT NULL
  updated_at                    timestamp with time zone NOT NULL
  updated_by                    text                 NOT NULL
```

## business_v2.academy_waitlist_entries

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.academy_waitlist_entries_id_seq'::regclass)
  entry_key                     text                 NOT NULL
  pool_id                       bigint               NOT NULL
  offer_key                     text                 NOT NULL
  catalog_revision              integer              NOT NULL
  participant_party_id          bigint
  contact_reference_sha256      text                 NOT NULL
  sequence_number               bigint               NOT NULL
  state                         text                 NOT NULL
  version                       integer              NOT NULL DEFAULT=0
  joined_at                     timestamp with time zone NOT NULL
  updated_at                    timestamp with time zone NOT NULL
  updated_by                    text                 NOT NULL
```

## business_v2.academy_waitlist_offers

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.academy_waitlist_offers_id_seq'::regclass)
  waitlist_offer_key            text                 NOT NULL
  entry_id                      bigint               NOT NULL
  pool_id                       bigint               NOT NULL
  reservation_id                bigint               NOT NULL
  state                         text                 NOT NULL
  version                       integer              NOT NULL DEFAULT=0
  expires_at                    timestamp with time zone NOT NULL
  approval_evidence_sha256      text
  delivery_receipt_sha256       text
  created_at                    timestamp with time zone NOT NULL
  updated_at                    timestamp with time zone NOT NULL
  updated_by                    text                 NOT NULL
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

## business_v2.chaos_lifecycle_outbox

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.chaos_lifecycle_outbox_id_seq'::regclass)
  event_name                    text                 NOT NULL
  source_system                 text                 NOT NULL
  source_event_id               text                 NOT NULL
  canonical_transaction_id      text                 NOT NULL
  provider_event_ids            ARRAY                NOT NULL DEFAULT='{}'::text[]
  provider_object_ids           ARRAY                NOT NULL DEFAULT='{}'::text[]
  occurred_at                   timestamp with time zone NOT NULL
  amount_cents                  bigint
  currency                      text
  properties                    jsonb                NOT NULL DEFAULT='{}'::jsonb
  status                        text                 NOT NULL DEFAULT='pending'::text
  attempts                      integer              NOT NULL DEFAULT=0
  next_attempt_at               timestamp with time zone NOT NULL DEFAULT=now()
  last_attempted_at             timestamp with time zone
  sent_at                       timestamp with time zone
  last_error                    text
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.checkout_recovery_aliases

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.checkout_recovery_aliases_id_seq'::regclass)
  case_id                       bigint               NOT NULL
  stripe_account                text                 NOT NULL
  alias_kind                    text                 NOT NULL
  alias_id                      text                 NOT NULL
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.checkout_recovery_cases

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.checkout_recovery_cases_id_seq'::regclass)
  case_uuid                     uuid                 NOT NULL DEFAULT=gen_random_uuid()
  source_system                 text                 NOT NULL
  source_case_key               text                 NOT NULL
  stripe_account                text                 NOT NULL
  state                         text                 NOT NULL
  version                       integer              NOT NULL DEFAULT=0
  program_slug                  text
  product_slug                  text
  amount_cents                  bigint
  currency                      text
  contact_email                 USER-DEFINED
  email_sha256                  text
  consent_state                 text                 NOT NULL DEFAULT='unknown'::text
  consent_policy_version        text
  eligibility_state             text                 NOT NULL DEFAULT='unknown'::text
  suppression_code              text
  last_event_type               text                 NOT NULL
  last_source_event_key         text                 NOT NULL
  last_evidence_sha256          text                 NOT NULL
  started_at                    timestamp with time zone NOT NULL
  last_observed_at              timestamp with time zone NOT NULL
  shadow_due_at                 timestamp with time zone
  shadow_ready_at               timestamp with time zone
  purchased_at                  timestamp with time zone
  closed_at                     timestamp with time zone
  owner_review_deadline         timestamp with time zone
  shadow_notified_at            timestamp with time zone
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
  checkout_locale               text
  return_url                    text
  product_name                  text
  party_id                      bigint
  party_evidence_tier           text
  stripe_customer_id            text
  last_failure_code             text
  last_decline_code             text
  last_advice_code              text
  customer_guidance_key         text
  payment_method_brand          text
  payment_method_last4          text
  operator_incident_id          bigint
```

## business_v2.checkout_recovery_events

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.checkout_recovery_events_id_seq'::regclass)
  event_uuid                    uuid                 NOT NULL DEFAULT=gen_random_uuid()
  case_id                       bigint               NOT NULL
  schema_version                integer              NOT NULL
  source_system                 text                 NOT NULL
  stripe_account                text                 NOT NULL
  source_event_key              text                 NOT NULL
  event_type                    text                 NOT NULL
  observed_at                   timestamp with time zone NOT NULL
  received_at                   timestamp with time zone NOT NULL DEFAULT=now()
  webhook_inbox_id              bigint
  payload_sha256                text                 NOT NULL
  previous_state                text
  next_state                    text                 NOT NULL
  result_code                   text                 NOT NULL
  facts                         jsonb                NOT NULL DEFAULT='{}'::jsonb
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.checkout_recovery_operator_incident_cases

```
  incident_id                   bigint               NOT NULL
  case_id                       bigint               NOT NULL
  joined_at                     timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.checkout_recovery_operator_incidents

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.checkout_recovery_operator_incidents_id_seq'::regclass)
  incident_uuid                 uuid                 NOT NULL DEFAULT=gen_random_uuid()
  incident_key                  text                 NOT NULL
  group_key                     text                 NOT NULL
  subject_key                   text                 NOT NULL
  party_id                      bigint
  stripe_account                text                 NOT NULL
  incident_kind                 text                 NOT NULL
  product_key                   text                 NOT NULL
  product_name                  text
  amount_cents                  bigint
  currency                      text
  episode_started_at            timestamp with time zone NOT NULL
  episode_ends_at               timestamp with time zone NOT NULL
  last_failure_at               timestamp with time zone NOT NULL
  notify_due_at                 timestamp with time zone NOT NULL
  status                        text                 NOT NULL DEFAULT='open'::text
  version                       integer              NOT NULL DEFAULT=1
  notified_version              integer              NOT NULL DEFAULT=0
  case_count                    integer              NOT NULL DEFAULT=1
  payment_intent_count          integer              NOT NULL DEFAULT=0
  provider_failure_count        integer              NOT NULL DEFAULT=0
  customer_guidance_key         text
  payment_method_brand          text
  payment_method_last4          text
  reminder_state                text                 NOT NULL DEFAULT='not_sent_consent_missing'::text
  root_notified_at              timestamp with time zone
  last_notified_at              timestamp with time zone
  closed_at                     timestamp with time zone
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.checkout_recovery_receipts

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.checkout_recovery_receipts_id_seq'::regclass)
  receipt_uuid                  uuid                 NOT NULL DEFAULT=gen_random_uuid()
  case_id                       bigint               NOT NULL
  case_version                  integer              NOT NULL
  receipt_type                  text                 NOT NULL
  outcome                       text                 NOT NULL
  result_code                   text                 NOT NULL
  evidence_sha256               text                 NOT NULL
  source_event_key              text                 NOT NULL
  occurred_at                   timestamp with time zone NOT NULL
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.checkout_recovery_send_intents

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.checkout_recovery_send_intents_id_seq'::regclass)
  intent_uuid                   uuid                 NOT NULL DEFAULT=gen_random_uuid()
  case_id                       bigint               NOT NULL
  touch                         smallint             NOT NULL
  due_at                        timestamp with time zone NOT NULL
  status                        text                 NOT NULL DEFAULT='pending'::text
  attempt_count                 integer              NOT NULL DEFAULT=0
  next_attempt_at               timestamp with time zone NOT NULL
  lease_token                   uuid
  lease_expires_at              timestamp with time zone
  accepted_at                   timestamp with time zone
  suppressed_at                 timestamp with time zone
  held_at                       timestamp with time zone
  last_error_code               text
  payload_sha256                text
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.checkout_recovery_send_receipts

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.checkout_recovery_send_receipts_id_seq'::regclass)
  receipt_uuid                  uuid                 NOT NULL DEFAULT=gen_random_uuid()
  intent_id                     bigint               NOT NULL
  case_id                       bigint               NOT NULL
  touch                         smallint             NOT NULL
  attempt_number                integer              NOT NULL
  receipt_type                  text                 NOT NULL
  outcome                       text                 NOT NULL
  result_code                   text                 NOT NULL
  evidence_sha256               text                 NOT NULL
  occurred_at                   timestamp with time zone NOT NULL
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.cnpc_action_outbox

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.cnpc_action_outbox_id_seq'::regclass)
  intake_id                     bigint               NOT NULL
  action_type                   text                 NOT NULL
  idempotency_key               text                 NOT NULL
  approved_payload              jsonb                NOT NULL
  approved_payload_sha256       text                 NOT NULL
  status                        text                 NOT NULL DEFAULT='pending_review'::text
  approved_by                   text
  approved_at                   timestamp with time zone
  external_receipt              jsonb
  attempts                      integer              NOT NULL DEFAULT=0
  last_error                    text
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.cnpc_chemistry_calls

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.cnpc_chemistry_calls_id_seq'::regclass)
  intake_id                     bigint               NOT NULL
  coach_id                      bigint               NOT NULL
  status                        text                 NOT NULL DEFAULT='invited'::text
  soft_hold_expires_at          timestamp with time zone
  scheduled_at                  timestamp with time zone
  completed_at                  timestamp with time zone
  source_thread_id              text
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.cnpc_coach_capacity_snapshots

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.cnpc_coach_capacity_snapshots_id_seq'::regclass)
  coach_id                      bigint               NOT NULL
  availability_response_id      text
  effective_quarter             text
  current_client_count          integer              NOT NULL DEFAULT=0
  declared_available_slots      integer              NOT NULL DEFAULT=0
  client_progress_summary       text
  observed_at                   timestamp with time zone NOT NULL
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.cnpc_coaches

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.cnpc_coaches_id_seq'::regclass)
  applicant_party_id            bigint
  onboarding_response_id        text
  display_name                  text                 NOT NULL
  roster_status                 text                 NOT NULL DEFAULT='pending'::text
  icf_credential                text
  full_bio                      text
  matching_summary              text
  languages                     ARRAY                NOT NULL DEFAULT='{}'::text[]
  time_zones                    ARRAY                NOT NULL DEFAULT='{}'::text[]
  work_types                    ARRAY                NOT NULL DEFAULT='{}'::text[]
  chemistry_booking_url         text
  public_profile_url            text
  profile_source_updated_at     timestamp with time zone
  last_reconciled_at            timestamp with time zone
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
  last_updated_by               text                 NOT NULL DEFAULT='cnpc:host'::text
```

## business_v2.cnpc_engagements

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.cnpc_engagements_id_seq'::regclass)
  intake_id                     bigint               NOT NULL
  coach_id                      bigint               NOT NULL
  engagement_id                 bigint
  contract_document_id          bigint
  invoice_document_id           bigint
  contract_signed_at            timestamp with time zone
  payment_confirmed_at          timestamp with time zone
  ready_to_begin_at             timestamp with time zone
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.cnpc_intakes

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.cnpc_intakes_id_seq'::regclass)
  submission_id                 text                 NOT NULL
  webhook_inbox_id              bigint
  applicant_party_id            bigint               NOT NULL
  submitted_at                  timestamp with time zone NOT NULL
  organization_name             text                 NOT NULL
  organization_website          text
  organization_city             text
  organization_state            text
  organization_type             text                 NOT NULL
  operating_expense_band        text                 NOT NULL
  program_track                 text                 NOT NULL DEFAULT='cnpc'::text
  coaching_type                 text                 NOT NULL
  why_coaching                  text                 NOT NULL
  first_choice_coach            text
  second_choice_coach           text
  anything_else                 text
  lead_source                   text
  consent                       boolean              NOT NULL
  eligibility_status            text                 NOT NULL
  individual_price_cents        integer
  team_price_cents              integer
  currency                      text                 NOT NULL DEFAULT='USD'::text
  workflow_status               text                 NOT NULL DEFAULT='new'::text
  source_form_id                text                 NOT NULL
  source_entry_id               text                 NOT NULL
  source_payload                jsonb                NOT NULL
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
  last_updated_by               text                 NOT NULL DEFAULT='cnpc:host'::text
```

## business_v2.cnpc_match_candidates

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.cnpc_match_candidates_id_seq'::regclass)
  match_run_id                  bigint               NOT NULL
  coach_id                      bigint               NOT NULL
  capacity_snapshot_id          bigint
  rank                          integer              NOT NULL
  fit_score                     numeric
  reasons                       jsonb                NOT NULL DEFAULT='[]'::jsonb
  recommendation_role           text                 NOT NULL
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.cnpc_match_runs

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.cnpc_match_runs_id_seq'::regclass)
  intake_id                     bigint               NOT NULL
  roster_version                text                 NOT NULL
  prompt_version                text                 NOT NULL
  model_id                      text
  result_sha256                 text                 NOT NULL
  status                        text                 NOT NULL DEFAULT='draft'::text
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  reviewed_at                   timestamp with time zone
  approved_at                   timestamp with time zone
```

## business_v2.collector_state

```
  key                           text                 NOT NULL
  value                         jsonb                NOT NULL DEFAULT='{}'::jsonb
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.company_followup_cases

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.company_followup_cases_id_seq'::regclass)
  lane                          text                 NOT NULL
  source_system                 text                 NOT NULL
  source_key                    text                 NOT NULL
  party_id                      bigint
  pipeline_entry_id             bigint
  owner_group                   text                 NOT NULL
  policy_version                text                 NOT NULL
  source_fingerprint            text                 NOT NULL
  decision_fingerprint          text                 NOT NULL
  disposition                   text                 NOT NULL
  reason_code                   text                 NOT NULL
  next_action                   text                 NOT NULL
  sequence_no                   smallint
  next_eligible_business_date   date
  confirmed_attempt_count       smallint             NOT NULL DEFAULT=0
  block_code                    text
  terminal_code                 text
  version                       integer              NOT NULL DEFAULT=0
  last_observed_at              timestamp with time zone NOT NULL
  last_changed_at               timestamp with time zone NOT NULL
  last_presented_fingerprint    text
  last_presented_at             timestamp with time zone
  presentation_count            integer              NOT NULL DEFAULT=0
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
  relationship_owner_principal_keytext
  relationship_owner_assignment_idbigint
  relationship_owner_decision_reftext
```

## business_v2.company_followup_events

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.company_followup_events_id_seq'::regclass)
  case_id                       bigint               NOT NULL
  case_version                  integer              NOT NULL
  event_type                    text                 NOT NULL
  from_disposition              text
  to_disposition                text                 NOT NULL
  reason_code                   text                 NOT NULL
  actor                         text                 NOT NULL
  source_system                 text                 NOT NULL
  source_event_key              text                 NOT NULL
  idempotency_key               text                 NOT NULL
  source_fingerprint            text                 NOT NULL
  decision_fingerprint          text                 NOT NULL
  event_fingerprint             text                 NOT NULL
  occurred_at                   timestamp with time zone NOT NULL
  recorded_at                   timestamp with time zone NOT NULL DEFAULT=now()
  operator_decision             text
  operator_fingerprint          text
```

## business_v2.company_gmail_mailbox_audit_candidates

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

## business_v2.company_gmail_mailbox_audit_pages

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

## business_v2.company_gmail_mailbox_audits

```
  audit_id                      text                 NOT NULL
  audit_fingerprint             text                 NOT NULL
  definition_id                 text                 NOT NULL
  source_fingerprint            text                 NOT NULL
  expected_watermark_version    bigint               NOT NULL
  cursor_evidence_sha256        text                 NOT NULL
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
  unknown_count                 integer              NOT NULL DEFAULT=0
  completed_at                  timestamp with time zone
  final_history_id              text
  audit_evidence_sha256         text
  invalid_reason                text
  invalidated_at                timestamp with time zone
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.company_gmail_reconciliation_candidates

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

## business_v2.company_gmail_reconciliation_pages

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

## business_v2.company_gmail_reconciliation_snapshots

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
  reconciliation_evidence_sha256text
  proposed_event_fingerprint    text
  invalid_reason                text
  invalidated_at                timestamp with time zone
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.company_healer_resolution_observations

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.company_healer_resolution_observations_id_seq'::regclass)
  observation_key               text                 NOT NULL
  work_item_id                  bigint               NOT NULL
  catalog_version               smallint             NOT NULL
  resolution_fingerprint        text                 NOT NULL
  disposition                   text                 NOT NULL
  decision_code                 text
  decision_owner                text
  decision_actor_sha256         text
  evidence_sha256               text                 NOT NULL
  observed_at                   timestamp with time zone NOT NULL
  recorded_at                   timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.company_program_fact_observations

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.company_program_fact_observations_id_seq'::regclass)
  occurrence_id                 text                 NOT NULL
  work_item_id                  bigint               NOT NULL
  detector_version              smallint             NOT NULL
  outcome                       text                 NOT NULL
  finding_fingerprint           text                 NOT NULL
  facts_sha256                  text                 NOT NULL
  sales_kb_sha256               text                 NOT NULL
  products_sha256               text
  products_available            boolean              NOT NULL
  finding_count                 integer              NOT NULL
  checked_programs              integer              NOT NULL
  observed_at                   timestamp with time zone NOT NULL
  recorded_at                   timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.company_trigger_occurrences

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

## business_v2.company_trigger_sources

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
  max_reconciliation_window_secondsinteger
  freshness_budget_seconds      integer
  owner_key                     text                 NOT NULL
  alert_route_key               text                 NOT NULL
  registered_at                 timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.company_trigger_watermark_events

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

## business_v2.company_trigger_watermark_state

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

## business_v2.company_work_events

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

## business_v2.company_work_exception_briefs

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

## business_v2.company_work_exception_cases

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

## business_v2.company_work_exception_dispatch_events

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.company_work_exception_dispatch_events_id_seq'::regclass)
  dispatch_id                   bigint               NOT NULL
  attempt_number                integer              NOT NULL
  event_type                    text                 NOT NULL
  event_key                     text                 NOT NULL
  evidence_sha256               text                 NOT NULL
  occurred_at                   timestamp with time zone NOT NULL
  recorded_at                   timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.company_work_exception_dispatches

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.company_work_exception_dispatches_id_seq'::regclass)
  brief_id                      bigint               NOT NULL
  work_item_id                  bigint               NOT NULL
  work_item_version             integer              NOT NULL
  dispatch_fingerprint          text                 NOT NULL
  slack_channel_jid             text                 NOT NULL
  brief_message_ts              text                 NOT NULL
  packet_message_ts             text                 NOT NULL
  status                        text                 NOT NULL DEFAULT='posted'::text
  posted_at                     timestamp with time zone NOT NULL
  attempt_count                 integer              NOT NULL DEFAULT=0
  last_picked_up_at             timestamp with time zone
  last_attempt_finished_at      timestamp with time zone
  failure_code                  text
  attempt_receipt_status        text                 NOT NULL DEFAULT='none'::text
  attempt_receipt_ts            text
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.company_work_exception_events

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

## business_v2.company_work_items

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

## business_v2.company_work_outcome_quality_receipts

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

## business_v2.company_work_outcome_review_events

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.company_work_outcome_review_events_id_seq'::regclass)
  packet_id                     bigint               NOT NULL
  event_type                    text                 NOT NULL
  event_key                     text                 NOT NULL
  evidence_sha256               text                 NOT NULL
  occurred_at                   timestamp with time zone NOT NULL
  recorded_at                   timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.company_work_outcome_review_packets

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.company_work_outcome_review_packets_id_seq'::regclass)
  work_item_id                  bigint               NOT NULL
  delivery_event_version        integer              NOT NULL
  packet_version                smallint             NOT NULL DEFAULT=1
  packet_fingerprint            text                 NOT NULL
  source_key_sha256             text                 NOT NULL
  evidence_sha256               text                 NOT NULL
  evidence_occurred_at          timestamp with time zone NOT NULL
  status                        text                 NOT NULL DEFAULT='pending'::text
  slack_channel_jid             text
  slack_message_ts              text
  posted_at                     timestamp with time zone
  failure_code                  text
  decision_assessment           text
  decision_actor_sha256         text
  decision_reaction             text
  decided_at                    timestamp with time zone
  assessment_receipt_id         bigint
  decision_receipt_status       text                 NOT NULL DEFAULT='none'::text
  decision_receipt_ts           text
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.company_work_receipts

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

## business_v2.contact_roles

```
  key                           text                 NOT NULL
  label                         text                 NOT NULL
  description                   text                 NOT NULL DEFAULT=''::text
  enabled                       boolean              NOT NULL DEFAULT=true
```

## business_v2.contador_payment_fulfillment_aliases

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.contador_payment_fulfillment_aliases_id_seq'::regclass)
  case_id                       bigint               NOT NULL
  stripe_account                text                 NOT NULL
  alias_kind                    text                 NOT NULL
  alias_id                      text                 NOT NULL
  recorded_at                   timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.contador_payment_fulfillment_cases

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.contador_payment_fulfillment_cases_id_seq'::regclass)
  stripe_account                text                 NOT NULL
  payment_intent_id             text                 NOT NULL
  state                         text                 NOT NULL
  version                       integer              NOT NULL DEFAULT=0
  attempt_count                 integer              NOT NULL DEFAULT=1
  lease_token                   text
  lease_expires_at              timestamp with time zone
  owner_group                   text                 NOT NULL DEFAULT='contador'::text
  last_event_type               text                 NOT NULL
  last_source_object_id         text                 NOT NULL
  last_source_event_id          text                 NOT NULL
  last_error_code               text
  last_evidence_sha256          text                 NOT NULL
  review_deadline               timestamp with time zone
  first_observed_at             timestamp with time zone NOT NULL
  last_observed_at              timestamp with time zone NOT NULL
  resolved_at                   timestamp with time zone
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.contador_payment_fulfillment_receipts

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.contador_payment_fulfillment_receipts_id_seq'::regclass)
  receipt_key                   text                 NOT NULL
  case_id                       bigint               NOT NULL
  case_version                  integer              NOT NULL
  stage                         text                 NOT NULL
  outcome                       text                 NOT NULL
  result_code                   text                 NOT NULL
  evidence_sha256               text                 NOT NULL
  source_event_id               text                 NOT NULL
  actor                         text                 NOT NULL
  occurred_at                   timestamp with time zone NOT NULL
  recorded_at                   timestamp with time zone NOT NULL DEFAULT=now()
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

## business_v2.party_context_adapter_registrations

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.party_context_adapter_registrations_id_seq'::regclass)
  adapter_key                   text                 NOT NULL
  adapter_version               text                 NOT NULL
  source_system                 text                 NOT NULL
  source_scope                  text                 NOT NULL
  manifest_version              integer              NOT NULL
  manifest_sha256               text                 NOT NULL
  manifest                      jsonb                NOT NULL
  config_declaration            jsonb                NOT NULL DEFAULT='{}'::jsonb
  enabled                       boolean              NOT NULL DEFAULT=false
  conformance_status            text                 NOT NULL DEFAULT='pending'::text
  conformance_receipt_sha256    text
  circuit_status                text                 NOT NULL DEFAULT='closed'::text
  failure_count                 integer              NOT NULL DEFAULT=0
  last_error_code               text
  last_health_at                timestamp with time zone
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.party_context_observations

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.party_context_observations_id_seq'::regclass)
  observation_uuid              uuid                 NOT NULL DEFAULT=gen_random_uuid()
  schema_version                integer              NOT NULL
  adapter_key                   text                 NOT NULL
  adapter_version               text                 NOT NULL
  source_system                 text                 NOT NULL
  source_scope                  text                 NOT NULL
  source_fact_key               text                 NOT NULL
  fact_type                     text                 NOT NULL
  fact_schema_version           integer              NOT NULL
  original_party_id             bigint
  current_party_id              bigint
  related_party_ids             ARRAY                NOT NULL DEFAULT='{}'::bigint[]
  value                         jsonb                NOT NULL
  value_sha256                  text                 NOT NULL
  source_record_type            text                 NOT NULL
  source_record_id              text                 NOT NULL
  source_event_id               text
  effective_at                  timestamp with time zone
  observed_at                   timestamp with time zone NOT NULL
  verified_at                   timestamp with time zone
  fresh_until                   timestamp with time zone
  confidence                    text                 NOT NULL
  conflict_state                text                 NOT NULL DEFAULT='none'::text
  privacy_class                 text                 NOT NULL
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.party_context_plutio_projection_receipts

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.party_context_plutio_projection_receipts_id_seq'::regclass)
  plan_uuid                     uuid                 NOT NULL
  original_party_id             bigint               NOT NULL
  current_party_id              bigint               NOT NULL
  plutio_ref_entity_type        text                 NOT NULL DEFAULT='party'::text
  plutio_ref_entity_id          bigint
  projection_version            integer              NOT NULL
  projection_sha256             text                 NOT NULL
  proposed_fields               jsonb                NOT NULL DEFAULT='{}'::jsonb
  proposed_field_count          integer              NOT NULL
  mode                          text                 NOT NULL DEFAULT='dry_run'::text
  status                        text                 NOT NULL
  conflict_codes                jsonb                NOT NULL DEFAULT='[]'::jsonb
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.party_context_projections

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.party_context_projections_id_seq'::regclass)
  party_id                      bigint               NOT NULL
  section                       text                 NOT NULL
  projection_key                text                 NOT NULL
  version                       integer              NOT NULL DEFAULT=1
  value                         jsonb                NOT NULL
  value_sha256                  text                 NOT NULL
  source_watermarks             jsonb                NOT NULL DEFAULT='{}'::jsonb
  status                        text                 NOT NULL
  missing_codes                 jsonb                NOT NULL DEFAULT='[]'::jsonb
  conflict_codes                jsonb                NOT NULL DEFAULT='[]'::jsonb
  effective_at                  timestamp with time zone
  observed_at                   timestamp with time zone NOT NULL
  fresh_until                   timestamp with time zone
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.party_context_query_receipts

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.party_context_query_receipts_id_seq'::regclass)
  request_uuid                  uuid                 NOT NULL
  run_id                        uuid                 NOT NULL
  source_container_sha256       text                 NOT NULL
  work_item_id                  text                 NOT NULL
  actor_group                   text                 NOT NULL
  purpose                       text                 NOT NULL
  original_party_id             bigint
  current_party_id              bigint
  unresolved_subject_sha256     text
  requested_sections            jsonb                NOT NULL
  returned_sections             jsonb                NOT NULL
  projection_versions           jsonb                NOT NULL DEFAULT='{}'::jsonb
  source_watermarks             jsonb                NOT NULL DEFAULT='{}'::jsonb
  policy_decision               text                 NOT NULL
  result_status                 text                 NOT NULL
  error_code                    text
  response_sha256               text                 NOT NULL
  delivery_status               text                 NOT NULL DEFAULT='pending'::text
  delivery_error_code           text
  delivered_at                  timestamp with time zone
  started_at                    timestamp with time zone NOT NULL
  completed_at                  timestamp with time zone NOT NULL
  duration_ms                   integer              NOT NULL
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.party_emails

```
  party_id                      bigint               NOT NULL
  email                         USER-DEFINED         NOT NULL
  is_primary                    boolean              NOT NULL DEFAULT=false
  verified_at                   timestamp with time zone
```

## business_v2.party_external_refs

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.party_external_refs_id_seq'::regclass)
  party_id                      bigint               NOT NULL
  provider                      text                 NOT NULL
  source_scope                  text                 NOT NULL
  entity_type                   text                 NOT NULL
  external_id                   text                 NOT NULL
  adapter_key                   text                 NOT NULL
  adapter_version               text                 NOT NULL
  schema_version                integer              NOT NULL
  status                        text                 NOT NULL DEFAULT='active'::text
  verified_at                   timestamp with time zone
  first_seen_at                 timestamp with time zone NOT NULL
  last_seen_at                  timestamp with time zone NOT NULL
  source_receipt_sha256         text                 NOT NULL
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.party_identifier_claims

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.party_identifier_claims_id_seq'::regclass)
  party_id                      bigint               NOT NULL
  identifier_kind               text                 NOT NULL
  identifier_fingerprint        text                 NOT NULL
  restricted_value              text
  source_ref_id                 bigint
  verification_method           text                 NOT NULL
  confidence                    text                 NOT NULL
  status                        text                 NOT NULL DEFAULT='active'::text
  valid_from                    timestamp with time zone NOT NULL
  valid_until                   timestamp with time zone
  evidence_sha256               text                 NOT NULL
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.party_identity_exceptions

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.party_identity_exceptions_id_seq'::regclass)
  fingerprint                   text                 NOT NULL
  current_party_id              bigint
  candidate_party_ids           ARRAY                NOT NULL DEFAULT='{}'::bigint[]
  reason_code                   text                 NOT NULL
  status                        text                 NOT NULL DEFAULT='open'::text
  owner_group                   text                 NOT NULL DEFAULT='chief'::text
  evidence_refs                 jsonb                NOT NULL DEFAULT='{}'::jsonb
  occurrence_count              integer              NOT NULL DEFAULT=1
  first_seen_at                 timestamp with time zone NOT NULL
  last_seen_at                  timestamp with time zone NOT NULL
  resolution_code               text
  resolution_receipt_sha256     text
  resolved_at                   timestamp with time zone
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
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

## business_v2.relationship_owner_assignments

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.relationship_owner_assignments_id_seq'::regclass)
  scope_type                    text                 NOT NULL
  scope_key                     text                 NOT NULL
  principal_key                 text                 NOT NULL
  decision_ref                  text                 NOT NULL
  effective_from                timestamp with time zone NOT NULL
  supersedes_assignment_id      bigint
  assignment_fingerprint        text                 NOT NULL
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.relationship_owner_principals

```
  principal_key                 text                 NOT NULL
  principal_type                text                 NOT NULL
  display_name                  text                 NOT NULL
  managing_system               text                 NOT NULL
  action_authority              text                 NOT NULL DEFAULT='none'::text
  decision_ref                  text                 NOT NULL
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
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

## business_v2.student_class_assignments

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.student_class_assignments_id_seq'::regclass)
  assignment_key                text                 NOT NULL
  enrollment_id                 bigint               NOT NULL
  entitlement_id                bigint               NOT NULL
  delivery_block_key            text                 NOT NULL
  state                         text                 NOT NULL
  version                       integer              NOT NULL DEFAULT=0
  schedule_evidence_sha256      text                 NOT NULL
  starts_at                     timestamp with time zone
  ends_at                       timestamp with time zone
  created_at                    timestamp with time zone NOT NULL
  updated_at                    timestamp with time zone NOT NULL
  updated_by                    text                 NOT NULL
```

## business_v2.student_component_entitlements

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.student_component_entitlements_id_seq'::regclass)
  entitlement_key               text                 NOT NULL
  enrollment_id                 bigint               NOT NULL
  component_key                 text                 NOT NULL
  grant_episode                 integer              NOT NULL DEFAULT=1
  state                         text                 NOT NULL
  version                       integer              NOT NULL DEFAULT=0
  evidence_sha256               text                 NOT NULL
  created_at                    timestamp with time zone NOT NULL
  updated_at                    timestamp with time zone NOT NULL
  updated_by                    text                 NOT NULL
```

## business_v2.student_enrollment_evidence

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.student_enrollment_evidence_id_seq'::regclass)
  evidence_key                  text                 NOT NULL
  subject_type                  text                 NOT NULL
  subject_key                   text                 NOT NULL
  evidence_type                 text                 NOT NULL
  source_reference_id           bigint
  evidence_sha256               text                 NOT NULL
  observed_at                   timestamp with time zone NOT NULL
  recorded_at                   timestamp with time zone NOT NULL
  recorded_by                   text                 NOT NULL
```

## business_v2.student_enrollment_exceptions_v2

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.student_enrollment_exceptions_v2_id_seq'::regclass)
  exception_key                 text                 NOT NULL
  subject_type                  text                 NOT NULL
  subject_key                   text                 NOT NULL
  reason_code                   text                 NOT NULL
  state                         text                 NOT NULL
  severity                      text                 NOT NULL
  owner_role                    text                 NOT NULL
  version                       integer              NOT NULL DEFAULT=0
  occurrence_count              integer              NOT NULL DEFAULT=1
  evidence_sha256               text                 NOT NULL
  first_seen_at                 timestamp with time zone NOT NULL
  last_seen_at                  timestamp with time zone NOT NULL
  review_at                     timestamp with time zone NOT NULL
  resolved_at                   timestamp with time zone
  resolution_sha256             text
  updated_by                    text                 NOT NULL
```

## business_v2.student_enrollment_history

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.student_enrollment_history_id_seq'::regclass)
  subject_type                  text                 NOT NULL
  subject_key                   text                 NOT NULL
  previous_version              integer
  new_version                   integer              NOT NULL
  command_key                   text                 NOT NULL
  reason_code                   text                 NOT NULL
  evidence_sha256               text                 NOT NULL
  actor                         text                 NOT NULL
  occurred_at                   timestamp with time zone NOT NULL
  recorded_at                   timestamp with time zone NOT NULL
```

## business_v2.student_enrollment_order_source_refs

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.student_enrollment_order_source_refs_id_seq'::regclass)
  order_id                      bigint               NOT NULL
  source_scope                  text                 NOT NULL
  source_object_type            text                 NOT NULL
  source_object_id              text                 NOT NULL
  idempotency_key               text                 NOT NULL
  evidence_sha256               text                 NOT NULL
  observed_at                   timestamp with time zone NOT NULL
  recorded_at                   timestamp with time zone NOT NULL
  recorded_by                   text                 NOT NULL
```

## business_v2.student_enrollment_orders

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.student_enrollment_orders_id_seq'::regclass)
  order_key                     text                 NOT NULL
  source_channel                text                 NOT NULL
  offer_key                     text
  bundle_key                    text
  bundle_version                integer
  payer_party_id                bigint
  seat_count                    integer              NOT NULL
  financial_classification      text                 NOT NULL
  state                         text                 NOT NULL
  version                       integer              NOT NULL DEFAULT=0
  policy_revision               integer              NOT NULL
  evidence_sha256               text                 NOT NULL
  effective_at                  timestamp with time zone
  created_at                    timestamp with time zone NOT NULL
  updated_at                    timestamp with time zone NOT NULL
  updated_by                    text                 NOT NULL
```

## business_v2.student_enrollment_seats

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.student_enrollment_seats_id_seq'::regclass)
  seat_key                      text                 NOT NULL
  order_id                      bigint               NOT NULL
  seat_number                   integer              NOT NULL
  participant_party_id          bigint
  participant_evidence_sha256   text
  payer_relationship            text                 NOT NULL
  state                         text                 NOT NULL
  version                       integer              NOT NULL DEFAULT=0
  created_at                    timestamp with time zone NOT NULL
  updated_at                    timestamp with time zone NOT NULL
  updated_by                    text                 NOT NULL
```

## business_v2.student_enrollments_v2

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.student_enrollments_v2_id_seq'::regclass)
  enrollment_key                text                 NOT NULL
  order_id                      bigint               NOT NULL
  seat_id                       bigint               NOT NULL
  participant_party_id          bigint               NOT NULL
  offer_key                     text                 NOT NULL
  bundle_key                    text                 NOT NULL
  bundle_version                integer              NOT NULL
  catalog_revision              integer              NOT NULL
  state                         text                 NOT NULL
  version                       integer              NOT NULL DEFAULT=0
  effective_at                  timestamp with time zone
  ended_at                      timestamp with time zone
  materialization_sha256        text                 NOT NULL
  created_at                    timestamp with time zone NOT NULL
  updated_at                    timestamp with time zone NOT NULL
  updated_by                    text                 NOT NULL
```

## business_v2.student_financial_agreements

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.student_financial_agreements_id_seq'::regclass)
  agreement_key                 text                 NOT NULL
  order_id                      bigint               NOT NULL
  agreement_type                text                 NOT NULL
  state                         text                 NOT NULL
  source_reference_id           bigint
  version                       integer              NOT NULL DEFAULT=0
  evidence_sha256               text                 NOT NULL
  created_at                    timestamp with time zone NOT NULL
  updated_at                    timestamp with time zone NOT NULL
  updated_by                    text                 NOT NULL
```

## business_v2.student_financial_obligations

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.student_financial_obligations_id_seq'::regclass)
  obligation_key                text                 NOT NULL
  agreement_id                  bigint               NOT NULL
  sequence_number               integer              NOT NULL
  amount_minor                  bigint
  currency                      text
  due_at                        timestamp with time zone
  state                         text                 NOT NULL
  version                       integer              NOT NULL DEFAULT=0
  evidence_sha256               text                 NOT NULL
  created_at                    timestamp with time zone NOT NULL
  updated_at                    timestamp with time zone NOT NULL
  updated_by                    text                 NOT NULL
```

## business_v2.student_lifecycle_catalog_entries

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.student_lifecycle_catalog_entries_id_seq'::regclass)
  entry_key                     text                 NOT NULL
  catalog_revision              integer              NOT NULL
  catalog_sha256                text                 NOT NULL
  workspace                     text                 NOT NULL DEFAULT='community'::text
  heartbeat_community_id        uuid                 NOT NULL
  heartbeat_group_id            uuid
  heartbeat_course_id           uuid
  heartbeat_cohort_id           uuid
  offer_id                      text
  program_slug                  text
  language                      text                 NOT NULL DEFAULT='en'::text
  mapping_scope                 text                 NOT NULL
  lifecycle_enabled             boolean              NOT NULL DEFAULT=false
  policy_version                text                 NOT NULL
  source_ref                    text                 NOT NULL
  evidence_sha256               text                 NOT NULL
  effective_from                timestamp with time zone NOT NULL
  effective_until               timestamp with time zone
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.student_lifecycle_enrollments

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.student_lifecycle_enrollments_id_seq'::regclass)
  episode_uuid                  uuid                 NOT NULL DEFAULT=gen_random_uuid()
  enrollment_key                text                 NOT NULL
  version                       integer              NOT NULL DEFAULT=0
  workspace                     text                 NOT NULL DEFAULT='community'::text
  party_id                      bigint               NOT NULL
  heartbeat_community_id        uuid                 NOT NULL
  heartbeat_user_id             uuid                 NOT NULL
  heartbeat_group_id            uuid
  heartbeat_course_id           uuid
  heartbeat_cohort_id           uuid
  catalog_entry_id              bigint
  access_state                  text                 NOT NULL DEFAULT='unknown'::text
  activation_state              text                 NOT NULL DEFAULT='unknown'::text
  learning_state                text                 NOT NULL DEFAULT='not_started'::text
  grading_state                 text                 NOT NULL DEFAULT='unknown'::text
  feedback_state                text                 NOT NULL DEFAULT='missing'::text
  certificate_state             text                 NOT NULL DEFAULT='blocked'::text
  finance_state                 text                 NOT NULL DEFAULT='unknown'::text
  marketing_consent_state       text                 NOT NULL DEFAULT='unknown'::text
  contact_suppression_state     text                 NOT NULL DEFAULT='none'::text
  freshness_state               text                 NOT NULL DEFAULT='unknown'::text
  missing_fact_codes            ARRAY                NOT NULL DEFAULT='{}'::text[]
  last_event_id                 bigint
  last_reconciled_at            timestamp with time zone
  started_at                    timestamp with time zone NOT NULL
  ended_at                      timestamp with time zone
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.student_lifecycle_events

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.student_lifecycle_events_id_seq'::regclass)
  event_uuid                    uuid                 NOT NULL DEFAULT=gen_random_uuid()
  schema_version                integer              NOT NULL
  workspace                     text                 NOT NULL DEFAULT='community'::text
  delivery_id                   uuid                 NOT NULL
  source_system                 text                 NOT NULL DEFAULT='heartbeat'::text
  source_action                 text                 NOT NULL
  source_event_key              text                 NOT NULL
  event_name                    text                 NOT NULL
  observed_at                   timestamp with time zone NOT NULL
  received_at                   timestamp with time zone NOT NULL DEFAULT=now()
  webhook_inbox_id              bigint               NOT NULL
  reconciliation_run_id         bigint
  party_id                      bigint
  catalog_entry_id              bigint
  heartbeat_community_id        uuid                 NOT NULL
  heartbeat_user_id             uuid
  heartbeat_group_id            uuid
  heartbeat_course_id           uuid
  heartbeat_cohort_id           uuid
  heartbeat_lesson_id           uuid
  heartbeat_invitation_id       uuid
  heartbeat_event_id            uuid
  heartbeat_channel_id          uuid
  heartbeat_thread_id           uuid
  heartbeat_chat_id             uuid
  heartbeat_message_id          uuid
  heartbeat_document_id         uuid
  identity_fingerprint          text
  payload_sha256                text                 NOT NULL
  relay_authenticity            text                 NOT NULL DEFAULT='hmac_verified'::text
  provider_authenticity         text                 NOT NULL
  mapping_status                text                 NOT NULL
  processing_status             text                 NOT NULL
  facts                         jsonb                NOT NULL DEFAULT='{}'::jsonb
  supersedes_event_id           bigint
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.student_lifecycle_exceptions

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.student_lifecycle_exceptions_id_seq'::regclass)
  fingerprint                   text                 NOT NULL
  workspace                     text                 NOT NULL DEFAULT='community'::text
  event_id                      bigint
  enrollment_id                 bigint
  reconciliation_run_id         bigint
  reason_code                   text                 NOT NULL
  severity                      text                 NOT NULL
  status                        text                 NOT NULL DEFAULT='open'::text
  owner_group                   text                 NOT NULL DEFAULT='chief'::text
  occurrence_count              integer              NOT NULL DEFAULT=1
  evidence_sha256               text                 NOT NULL
  first_seen_at                 timestamp with time zone NOT NULL
  last_seen_at                  timestamp with time zone NOT NULL
  review_due_at                 timestamp with time zone NOT NULL
  resolution_code               text
  resolution_receipt_sha256     text
  resolved_at                   timestamp with time zone
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
  updated_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.student_lifecycle_identity_links

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.student_lifecycle_identity_links_id_seq'::regclass)
  workspace                     text                 NOT NULL DEFAULT='community'::text
  heartbeat_community_id        uuid                 NOT NULL
  heartbeat_user_id             uuid                 NOT NULL
  party_id                      bigint               NOT NULL
  binding_status                text                 NOT NULL DEFAULT='confirmed'::text
  source_event_key              text                 NOT NULL
  evidence_sha256               text                 NOT NULL
  bound_at                      timestamp with time zone NOT NULL
  revoked_at                    timestamp with time zone
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.student_lifecycle_reconciliation_runs

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.student_lifecycle_reconciliation_runs_id_seq'::regclass)
  run_uuid                      uuid                 NOT NULL DEFAULT=gen_random_uuid()
  run_key                       text                 NOT NULL
  workspace                     text                 NOT NULL DEFAULT='community'::text
  run_type                      text                 NOT NULL
  scope_key                     text                 NOT NULL
  catalog_revision              integer
  source_snapshot_sha256        text                 NOT NULL
  watermark_before              text
  watermark_after               text
  scopes_expected               integer              NOT NULL
  scopes_observed               integer              NOT NULL
  facts_new                     integer              NOT NULL DEFAULT=0
  facts_unchanged               integer              NOT NULL DEFAULT=0
  facts_conflicting             integer              NOT NULL DEFAULT=0
  facts_quarantined             integer              NOT NULL DEFAULT=0
  status                        text                 NOT NULL
  error_code                    text
  started_at                    timestamp with time zone NOT NULL
  completed_at                  timestamp with time zone
  created_at                    timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.student_lifecycle_state_history

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.student_lifecycle_state_history_id_seq'::regclass)
  enrollment_id                 bigint               NOT NULL
  enrollment_version            integer              NOT NULL
  axis                          text                 NOT NULL
  previous_value                text                 NOT NULL
  next_value                    text                 NOT NULL
  reason_code                   text                 NOT NULL
  event_id                      bigint
  reconciliation_run_id         bigint
  policy_version                text                 NOT NULL
  catalog_revision              integer
  effective_at                  timestamp with time zone NOT NULL
  recorded_at                   timestamp with time zone NOT NULL DEFAULT=now()
```

## business_v2.student_projection_outbox

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.student_projection_outbox_id_seq'::regclass)
  projection_key                text                 NOT NULL
  target                        text                 NOT NULL
  subject_type                  text                 NOT NULL
  subject_key                   text                 NOT NULL
  subject_version               integer              NOT NULL
  state                         text                 NOT NULL
  attempt_count                 integer              NOT NULL DEFAULT=0
  payload_sha256                text                 NOT NULL
  expected_readback_sha256      text                 NOT NULL
  payload_json                  jsonb                NOT NULL
  lease_token                   text
  lease_expires_at              timestamp with time zone
  last_error_code               text
  created_at                    timestamp with time zone NOT NULL
  updated_at                    timestamp with time zone NOT NULL
```

## business_v2.student_projection_receipts

```
  id                            bigint               NOT NULL DEFAULT=nextval('business_v2.student_projection_receipts_id_seq'::regclass)
  receipt_key                   text                 NOT NULL
  outbox_id                     bigint               NOT NULL
  subject_version               integer              NOT NULL
  stage                         text                 NOT NULL
  outcome                       text                 NOT NULL
  result_code                   text                 NOT NULL
  evidence_sha256               text                 NOT NULL
  actor                         text                 NOT NULL
  occurred_at                   timestamp with time zone NOT NULL
  recorded_at                   timestamp with time zone NOT NULL
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

## business_v2.v_academy_capacity_operator_cases

```
  case_key                      text
  command_type                  text
  state                         text
  version                       integer
  result_code                   text
  request_summary               jsonb
  result_summary                jsonb
  created_at                    timestamp with time zone
  completed_at                  timestamp with time zone
  receipt_count                 integer
  last_receipt_at               timestamp with time zone
```

## business_v2.v_academy_seat_pool_occupancy

```
  pool_key                      text
  delivery_block_key            text
  capacity                      integer
  occupied                      integer
  reserved                      integer
  available                     integer
  waitlist_count                integer
  public_state                  text
  pool_version                  integer
  source_updated_at             timestamp with time zone
  calculated_at                 timestamp with time zone
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

## business_v2.v_cnpc_match_pool

```
  coach_id                      bigint
  display_name                  text
  icf_credential                text
  matching_summary              text
  languages                     ARRAY
  time_zones                    ARRAY
  work_types                    ARRAY
  chemistry_booking_url         text
  public_profile_url            text
  profile_source_updated_at     timestamp with time zone
  capacity_snapshot_id          bigint
  current_client_count          integer
  declared_available_slots      integer
  capacity_observed_at          timestamp with time zone
  available_slots_after_holds   integer
```

## business_v2.v_inbound_documents

```
  document_id                   bigint
  party_id                      bigint
  party_name                    text
  party_legal_name              text
  party_email                   USER-DEFINED
  kind                          text
  status                        text
  currency                      text
  amount_cents                  integer
  invoice_number                text
  issued_at                     timestamp with time zone
  due_at                        timestamp with time zone
  vendor_name                   text
  source_email                  text
  subject                       text
  source_provider               text
  source_id                     text
  interaction_id                bigint
  metadata                      jsonb
  line_items                    jsonb
  created_at                    timestamp with time zone
  updated_at                    timestamp with time zone
  last_updated_by               text
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

## business_v2.v_party_context_health

```
  active_external_ref_count     bigint
  open_identity_exception_count bigint
  observation_count             bigint
  projection_count              bigint
  enabled_adapter_count         bigint
  last_observed_at              timestamp with time zone
  last_query_at                 timestamp with time zone
```

## business_v2.v_party_context_identity_exception_queue

```
  id                            bigint
  fingerprint                   text
  reason_code                   text
  status                        text
  owner_group                   text
  occurrence_count              integer
  first_seen_at                 timestamp with time zone
  last_seen_at                  timestamp with time zone
  resolution_code               text
  resolved_at                   timestamp with time zone
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

## business_v2.v_student_enrollment_dark_health

```
  order_count                   bigint
  seat_count                    bigint
  enrollment_count              bigint
  pending_projection_count      bigint
  open_exception_count          bigint
```

## business_v2.v_student_lifecycle_exception_queue

```
  id                            bigint
  fingerprint                   text
  reason_code                   text
  severity                      text
  status                        text
  owner_group                   text
  occurrence_count              integer
  first_seen_at                 timestamp with time zone
  last_seen_at                  timestamp with time zone
  review_due_at                 timestamp with time zone
  resolution_code               text
  resolved_at                   timestamp with time zone
```

## business_v2.v_student_lifecycle_health

```
  event_count                   bigint
  active_enrollment_count       bigint
  open_exception_count          bigint
  last_event_received_at        timestamp with time zone
  last_reconciliation_completed_attimestamp with time zone
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
