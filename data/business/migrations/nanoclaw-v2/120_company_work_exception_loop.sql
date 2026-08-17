-- 120_company_work_exception_loop.sql
--
-- Host-owned operator-attention state for the two Company OS ledger pilots.
-- The case lifecycle is a projection of the read-only exception report. An
-- acknowledgment records attention only; it cannot mutate a work item or prove
-- resolution. Raw customer, message, job-output, and approval content is absent.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE business_v2.company_work_exception_cases (
  id                       bigserial PRIMARY KEY,
  case_key                 text NOT NULL UNIQUE CHECK (
                             case_key ~ '^[0-9a-f]{64}$'
                           ),
  work_item_id             bigint NOT NULL
                           REFERENCES business_v2.company_work_items(id),
  occurrence               integer NOT NULL DEFAULT 1 CHECK (occurrence >= 1),
  work_item_version        integer NOT NULL CHECK (work_item_version >= 0),
  reason_kind              text NOT NULL CHECK (
                             reason_kind IN (
                               'contradictory_state', 'event_chain_gap',
                               'duplicate_fact', 'missing_receipt',
                               'source_gap', 'blocked', 'failed',
                               'deadline_overdue', 'outcome_missing',
                               'waiting_approval', 'stale'
                             )
                           ),
  reason_code              text NOT NULL CHECK (
                             reason_code ~ '^[a-z0-9][a-z0-9._:-]{0,159}$'
                           ),
  severity                 text NOT NULL CHECK (
                             severity IN ('critical', 'attention', 'watch')
                           ),
  state                    text NOT NULL DEFAULT 'open' CHECK (
                             state IN ('open', 'acknowledged', 'resolved')
                           ),
  opened_at                timestamptz NOT NULL,
  last_seen_at             timestamptz NOT NULL,
  acknowledged_at          timestamptz,
  acknowledged_by_uid      text,
  resolved_at              timestamptz,
  CONSTRAINT company_work_exception_cases_reason_uniq
    UNIQUE (work_item_id, reason_kind, reason_code),
  CONSTRAINT company_work_exception_cases_ack_pair_chk CHECK (
    (acknowledged_at IS NULL) = (acknowledged_by_uid IS NULL)
  ),
  CONSTRAINT company_work_exception_cases_actor_uid_chk CHECK (
    acknowledged_by_uid IS NULL OR
    acknowledged_by_uid ~ '^[UW][A-Z0-9]{6,31}$'
  ),
  CONSTRAINT company_work_exception_cases_state_chk CHECK (
    (state = 'open' AND acknowledged_at IS NULL AND resolved_at IS NULL) OR
    (state = 'acknowledged' AND acknowledged_at IS NOT NULL AND
      resolved_at IS NULL) OR
    (state = 'resolved' AND resolved_at IS NOT NULL)
  )
);

CREATE INDEX company_work_exception_cases_active_idx
  ON business_v2.company_work_exception_cases
    (severity, state, last_seen_at, id)
  WHERE state <> 'resolved';

CREATE INDEX company_work_exception_cases_work_idx
  ON business_v2.company_work_exception_cases
    (work_item_id, state, reason_kind);

CREATE TABLE business_v2.company_work_exception_briefs (
  id                       bigserial PRIMARY KEY,
  brief_fingerprint        text NOT NULL UNIQUE CHECK (
                             brief_fingerprint ~ '^[0-9a-f]{64}$'
                           ),
  window_key               date NOT NULL,
  report_generated_at      timestamptz NOT NULL,
  exception_count          integer NOT NULL CHECK (
                             exception_count BETWEEN 1 AND 500
                           ),
  status                   text NOT NULL DEFAULT 'pending' CHECK (
                             status IN ('pending', 'posted', 'uncertain')
                           ),
  slack_channel_jid        text,
  slack_message_ts         text,
  posted_at                timestamptz,
  failure_code             text,
  acknowledged_at          timestamptz,
  acknowledged_by_uid      text,
  ack_receipt_status       text NOT NULL DEFAULT 'none' CHECK (
                             ack_receipt_status IN (
                               'none', 'pending', 'posted', 'uncertain'
                             )
                           ),
  ack_receipt_ts           text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_work_exception_briefs_delivery_chk CHECK (
    (status = 'posted' AND slack_channel_jid IS NOT NULL AND
      slack_message_ts IS NOT NULL AND posted_at IS NOT NULL AND
      failure_code IS NULL) OR
    (status = 'pending' AND slack_channel_jid IS NULL AND
      slack_message_ts IS NULL AND posted_at IS NULL AND
      failure_code IS NULL) OR
    (status = 'uncertain' AND slack_message_ts IS NULL AND
      posted_at IS NULL AND failure_code IS NOT NULL)
  ),
  CONSTRAINT company_work_exception_briefs_slack_uniq
    UNIQUE (slack_channel_jid, slack_message_ts),
  CONSTRAINT company_work_exception_briefs_message_ts_chk CHECK (
    slack_message_ts IS NULL OR slack_message_ts ~ '^[0-9]{10,}\.[0-9]{6}$'
  ),
  CONSTRAINT company_work_exception_briefs_ack_pair_chk CHECK (
    (acknowledged_at IS NULL) = (acknowledged_by_uid IS NULL)
  ),
  CONSTRAINT company_work_exception_briefs_actor_uid_chk CHECK (
    acknowledged_by_uid IS NULL OR
    acknowledged_by_uid ~ '^[UW][A-Z0-9]{6,31}$'
  ),
  CONSTRAINT company_work_exception_briefs_ack_state_chk CHECK (
    (acknowledged_at IS NULL AND ack_receipt_status = 'none' AND
      ack_receipt_ts IS NULL) OR
    (acknowledged_at IS NOT NULL AND status = 'posted' AND
      ack_receipt_status IN ('pending', 'posted', 'uncertain') AND
      (ack_receipt_status = 'posted') = (ack_receipt_ts IS NOT NULL))
  )
);

CREATE INDEX company_work_exception_briefs_message_idx
  ON business_v2.company_work_exception_briefs
    (slack_channel_jid, slack_message_ts)
  WHERE status = 'posted';

CREATE TABLE business_v2.company_work_exception_events (
  id                       bigserial PRIMARY KEY,
  case_id                  bigint NOT NULL
                           REFERENCES business_v2.company_work_exception_cases(id),
  occurrence               integer NOT NULL CHECK (occurrence >= 1),
  event_type               text NOT NULL CHECK (
                             event_type IN (
                               'opened', 'reopened', 'briefed',
                               'acknowledged', 'resolved'
                             )
                           ),
  brief_id                 bigint REFERENCES
                           business_v2.company_work_exception_briefs(id),
  actor_uid                text,
  event_key                text NOT NULL UNIQUE CHECK (
                             btrim(event_key) <> ''
                           ),
  evidence_sha256          text NOT NULL CHECK (
                             evidence_sha256 ~ '^[0-9a-f]{64}$'
                           ),
  occurred_at              timestamptz NOT NULL,
  recorded_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_work_exception_events_actor_uid_chk CHECK (
    actor_uid IS NULL OR actor_uid ~ '^[UW][A-Z0-9]{6,31}$'
  ),
  CONSTRAINT company_work_exception_events_binding_chk CHECK (
    (event_type = 'briefed' AND brief_id IS NOT NULL AND actor_uid IS NULL) OR
    (event_type = 'acknowledged' AND brief_id IS NOT NULL AND
      actor_uid IS NOT NULL) OR
    (event_type IN ('opened', 'reopened', 'resolved') AND
      brief_id IS NULL AND actor_uid IS NULL)
  )
);

CREATE INDEX company_work_exception_events_case_idx
  ON business_v2.company_work_exception_events
    (case_id, occurrence, occurred_at, id);

CREATE INDEX company_work_exception_events_brief_idx
  ON business_v2.company_work_exception_events
    (brief_id, event_type, case_id)
  WHERE brief_id IS NOT NULL;

CREATE TRIGGER company_work_exception_events_append_only
  BEFORE UPDATE OR DELETE ON business_v2.company_work_exception_events
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();

COMMENT ON TABLE business_v2.company_work_exception_cases IS
  'Host-owned current operator-attention projection. Acknowledgment is not work-item resolution or action authority.';
COMMENT ON TABLE business_v2.company_work_exception_briefs IS
  'Exact deduplication and Slack-delivery state for privacy-minimized Company OS exception briefs.';
COMMENT ON TABLE business_v2.company_work_exception_events IS
  'Append-only case lifecycle and exact-brief acknowledgment facts; contains no operator message text or workflow action.';

ALTER TABLE business_v2.company_work_exception_cases OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.company_work_exception_briefs OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.company_work_exception_events OWNER TO nanoclaw_admin;

REVOKE ALL ON business_v2.company_work_exception_cases FROM PUBLIC;
REVOKE ALL ON business_v2.company_work_exception_briefs FROM PUBLIC;
REVOKE ALL ON business_v2.company_work_exception_events FROM PUBLIC;
REVOKE ALL ON SEQUENCE business_v2.company_work_exception_cases_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE business_v2.company_work_exception_briefs_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE business_v2.company_work_exception_events_id_seq FROM PUBLIC;

GRANT ALL ON business_v2.company_work_exception_cases TO nanoclaw_admin;
GRANT ALL ON business_v2.company_work_exception_briefs TO nanoclaw_admin;
GRANT ALL ON business_v2.company_work_exception_events TO nanoclaw_admin;
GRANT ALL ON SEQUENCE business_v2.company_work_exception_cases_id_seq TO nanoclaw_admin;
GRANT ALL ON SEQUENCE business_v2.company_work_exception_briefs_id_seq TO nanoclaw_admin;
GRANT ALL ON SEQUENCE business_v2.company_work_exception_events_id_seq TO nanoclaw_admin;

COMMIT;
