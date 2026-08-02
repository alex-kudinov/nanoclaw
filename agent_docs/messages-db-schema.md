# Schema: messages.db

Generated: 2026-07-26T08:00:56Z
Structure-only reconciliation: 2026-07-30T17:50Z

## autonomy_draft_events

```
  draft_id                  TEXT         PK
  chat_jid                  TEXT         NOT NULL
  group_folder              TEXT         NOT NULL
  category                  TEXT         NOT NULL
  outcome                   TEXT         NOT NULL DEFAULT='pending'
  draft_ts                  TEXT         NOT NULL
  thread_ts                 TEXT
  resolved_ts               TEXT
```

Indexes:
  idx_autonomy_events_pending (outcome,group_folder)
  sqlite_autoindex_autonomy_draft_events_1 (draft_id) UNIQUE

## autonomy_pending

```
  draft_id                  TEXT         PK
  chat_jid                  TEXT         NOT NULL
  group_folder              TEXT         NOT NULL
  category                  TEXT         NOT NULL
  thread_ts                 TEXT
  draft_ts                  TEXT         NOT NULL
  notice_ts                 TEXT
  expires_at                TEXT         NOT NULL
  status                    TEXT         NOT NULL DEFAULT='pending'
  created_at                TEXT         NOT NULL
```

Indexes:
  idx_autonomy_pending_status (status,expires_at)
  sqlite_autoindex_autonomy_pending_1 (draft_id) UNIQUE

## autonomy_trust

```
  group_folder              TEXT         PK NOT NULL
  category                  TEXT         PK NOT NULL
  level                     INTEGER      NOT NULL DEFAULT=1
  streak                    INTEGER      NOT NULL DEFAULT=0
  drafts                    INTEGER      NOT NULL DEFAULT=0
  approved_clean            INTEGER      NOT NULL DEFAULT=0
  corrected                 INTEGER      NOT NULL DEFAULT=0
  vetoed                    INTEGER      NOT NULL DEFAULT=0
  auto_approved             INTEGER      NOT NULL DEFAULT=0
  updated_at                TEXT
```

Indexes:
  sqlite_autoindex_autonomy_trust_1 (group_folder,category) UNIQUE

## chats

```
  jid                       TEXT         PK
  name                      TEXT
  last_message_time         TEXT
  channel                   TEXT
  is_group                  INTEGER      DEFAULT=0
```

Indexes:
  sqlite_autoindex_chats_1 (jid) UNIQUE

## email_tracking

```
  tracking_id               TEXT         PK
  lead_id                   INTEGER      NOT NULL
  email_type                TEXT         NOT NULL DEFAULT='initial'
  sent_at                   TEXT         NOT NULL
  first_opened_at           TEXT
  last_opened_at            TEXT
  open_count                INTEGER      DEFAULT=0
  last_user_agent           TEXT
  last_notified_at          TEXT
```

Indexes:
  sqlite_autoindex_email_tracking_1 (tracking_id) UNIQUE

## job_run_logs

```
  id                        TEXT         PK
  job_name                  TEXT         NOT NULL
  triggered_by              TEXT         NOT NULL DEFAULT='cron'
  started_at                TEXT         NOT NULL
  finished_at               TEXT
  duration_ms               INTEGER
  exit_code                 INTEGER
  pid                       INTEGER
  status                    TEXT         DEFAULT='running'
  output                    TEXT
  error                     TEXT
  log_file                  TEXT
  retry_attempt             INTEGER      DEFAULT=0
```

Indexes:
  idx_job_run_logs_status (status)
  idx_job_run_logs_name (job_name,started_at)
  sqlite_autoindex_job_run_logs_1 (id) UNIQUE

## jobs

```
  name                      TEXT         PK
  description               TEXT         NOT NULL DEFAULT=''
  project                   TEXT         NOT NULL
  project_root              TEXT         NOT NULL
  script                    TEXT         NOT NULL
  args                      TEXT         DEFAULT='[]'
  cron                      TEXT         NOT NULL
  timezone                  TEXT         DEFAULT='America/Chicago'
  retries                   INTEGER      DEFAULT=0
  retry_delay_ms            INTEGER      DEFAULT=60000
  alert_level               TEXT         DEFAULT='alert'
  timeout_ms                INTEGER      DEFAULT=5400000
  lockfile                  TEXT
  enabled                   INTEGER      DEFAULT=1
  next_run                  TEXT
  last_run                  TEXT
  last_result               TEXT
  last_duration_ms          INTEGER
  last_output               TEXT
  run_interval_days         INTEGER
```

Indexes:
  idx_jobs_enabled (enabled)
  idx_jobs_next_run (next_run)
  sqlite_autoindex_jobs_1 (name) UNIQUE

## messages

```
  id                        TEXT         PK
  chat_jid                  TEXT         PK
  sender                    TEXT
  sender_name               TEXT
  content                   TEXT
  timestamp                 TEXT
  is_from_me                INTEGER
  is_bot_message            INTEGER      DEFAULT=0
  from_group                TEXT
  thread_ts                 TEXT
```

Foreign keys:
  chat_jid -> chats(jid)

Indexes:
  idx_thread (chat_jid,thread_ts,timestamp)
  idx_timestamp (timestamp)
  sqlite_autoindex_messages_1 (id,chat_jid) UNIQUE

## pending_sends

```
  draft_ts                  TEXT         PK
  group_folder              TEXT         NOT NULL
  chat_jid                  TEXT         NOT NULL
  thread_ts                 TEXT
  gmail_thread_id           TEXT
  recipient                 TEXT
  lead_ref                  TEXT
  approved_at               TEXT         NOT NULL
  handoff_observed_at       TEXT
  handoff_message_id        TEXT
  mailman_started_at        TEXT
  handoff_alerted_at        TEXT
```

Indexes:
  idx_pending_sends_gmail_thread (gmail_thread_id,approved_at)
  idx_pending_sends_group (group_folder,approved_at)
  idx_pending_sends_handoff (handoff_observed_at,mailman_started_at,handoff_alerted_at)
  sqlite_autoindex_pending_sends_1 (draft_ts) UNIQUE

## registered_groups

```
  jid                       TEXT         PK
  name                      TEXT         NOT NULL
  folder                    TEXT         NOT NULL
  trigger_pattern           TEXT         NOT NULL
  added_at                  TEXT         NOT NULL
  container_config          TEXT
  requires_trigger          INTEGER      DEFAULT=1
  is_main                   INTEGER      DEFAULT=0
```

Indexes:
  sqlite_autoindex_registered_groups_2 (folder) UNIQUE
  sqlite_autoindex_registered_groups_1 (jid) UNIQUE

## router_state

```
  key                       TEXT         PK
  value                     TEXT         NOT NULL
```

Indexes:
  sqlite_autoindex_router_state_1 (key) UNIQUE

## scheduled_tasks

```
  id                        TEXT         PK
  group_folder              TEXT         NOT NULL
  chat_jid                  TEXT         NOT NULL
  prompt                    TEXT         NOT NULL
  schedule_type             TEXT         NOT NULL
  schedule_value            TEXT         NOT NULL
  next_run                  TEXT
  last_run                  TEXT
  last_result               TEXT
  status                    TEXT         DEFAULT='active'
  created_at                TEXT         NOT NULL
  context_mode              TEXT         DEFAULT='isolated'
```

Indexes:
  idx_status (status)
  idx_next_run (next_run)
  sqlite_autoindex_scheduled_tasks_1 (id) UNIQUE

## sessions

```
  group_folder              TEXT         PK
  session_id                TEXT         NOT NULL
```

Indexes:
  sqlite_autoindex_sessions_1 (group_folder) UNIQUE

## slack_thread_anchors

```
  channel                   TEXT         PK NOT NULL
  thread_key                TEXT         PK NOT NULL
  thread_ts                 TEXT         NOT NULL
  created_at                TEXT         NOT NULL
  last_activity_at          TEXT         NOT NULL DEFAULT=''
```

Indexes:
  sqlite_autoindex_slack_thread_anchors_1 (channel,thread_key) UNIQUE

## task_run_logs

```
  id                        INTEGER      PK
  task_id                   TEXT         NOT NULL
  run_at                    TEXT         NOT NULL
  duration_ms               INTEGER      NOT NULL
  status                    TEXT         NOT NULL
  result                    TEXT
  error                     TEXT
```

Foreign keys:
  task_id -> scheduled_tasks(id)

Indexes:
  idx_task_run_logs (task_id,run_at)
