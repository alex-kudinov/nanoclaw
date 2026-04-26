# Schema: nanoclaw_business (Postgres)

Generated: 2026-04-26T08:00:34.813Z

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
