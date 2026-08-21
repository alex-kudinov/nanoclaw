-- 129_company_work_exception_dispatch_receipts.sql
--
-- Content-free host receipts for the actionable side of the Company Work
-- exception loop. A packet delivery, Chief-router pickup, and one agent turn
-- are observable facts; none is source resolution or workflow authority.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE business_v2.company_work_exception_dispatches (
  id                       bigserial PRIMARY KEY,
  brief_id                 bigint NOT NULL
                           REFERENCES business_v2.company_work_exception_briefs(id),
  work_item_id             bigint NOT NULL
                           REFERENCES business_v2.company_work_items(id),
  work_item_version        integer NOT NULL CHECK (work_item_version >= 0),
  dispatch_fingerprint     text NOT NULL CHECK (
                             dispatch_fingerprint ~ '^[0-9a-f]{64}$'
                           ),
  slack_channel_jid        text NOT NULL CHECK (
                             slack_channel_jid ~ '^slack:[A-Z0-9]+$'
                           ),
  brief_message_ts         text NOT NULL CHECK (
                             brief_message_ts ~ '^[0-9]{10,}\.[0-9]{6}$'
                           ),
  packet_message_ts        text NOT NULL CHECK (
                             packet_message_ts ~ '^[0-9]{10,}\.[0-9]{6}$'
                           ),
  status                   text NOT NULL DEFAULT 'posted' CHECK (
                             status IN (
                               'posted', 'picked_up', 'attempted', 'failed'
                             )
                           ),
  posted_at                timestamptz NOT NULL,
  attempt_count            integer NOT NULL DEFAULT 0 CHECK (
                             attempt_count >= 0
                           ),
  last_picked_up_at        timestamptz,
  last_attempt_finished_at timestamptz,
  failure_code             text CHECK (
                             failure_code IS NULL OR
                             failure_code ~ '^[a-z0-9][a-z0-9._:-]{0,159}$'
                           ),
  attempt_receipt_status   text NOT NULL DEFAULT 'none' CHECK (
                             attempt_receipt_status IN (
                               'none', 'pending', 'posted', 'uncertain'
                             )
                           ),
  attempt_receipt_ts       text CHECK (
                             attempt_receipt_ts IS NULL OR
                             attempt_receipt_ts ~ '^[0-9]{10,}\.[0-9]{6}$'
                           ),
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_work_exception_dispatches_brief_work_uniq
    UNIQUE (brief_id, work_item_id),
  CONSTRAINT company_work_exception_dispatches_packet_uniq
    UNIQUE (slack_channel_jid, packet_message_ts),
  CONSTRAINT company_work_exception_dispatches_thread_chk CHECK (
    brief_message_ts <> packet_message_ts
  ),
  CONSTRAINT company_work_exception_dispatches_lifecycle_chk CHECK (
    (status = 'posted' AND attempt_count = 0 AND
      last_picked_up_at IS NULL AND last_attempt_finished_at IS NULL AND
      failure_code IS NULL AND attempt_receipt_status = 'none' AND
      attempt_receipt_ts IS NULL) OR
    (status = 'picked_up' AND attempt_count >= 1 AND
      last_picked_up_at IS NOT NULL AND last_attempt_finished_at IS NULL AND
      failure_code IS NULL AND attempt_receipt_status = 'none' AND
      attempt_receipt_ts IS NULL) OR
    (status = 'attempted' AND attempt_count >= 1 AND
      last_picked_up_at IS NOT NULL AND
      last_attempt_finished_at IS NOT NULL AND failure_code IS NULL AND
      attempt_receipt_status IN ('pending', 'posted', 'uncertain') AND
      (attempt_receipt_status = 'posted') =
        (attempt_receipt_ts IS NOT NULL)) OR
    (status = 'failed' AND attempt_count >= 1 AND
      last_picked_up_at IS NOT NULL AND
      last_attempt_finished_at IS NOT NULL AND failure_code IS NOT NULL AND
      attempt_receipt_status IN ('pending', 'posted', 'uncertain') AND
      (attempt_receipt_status = 'posted') =
        (attempt_receipt_ts IS NOT NULL))
  )
);

CREATE INDEX company_work_exception_dispatches_status_idx
  ON business_v2.company_work_exception_dispatches
    (status, last_picked_up_at, id);

CREATE INDEX company_work_exception_dispatches_brief_idx
  ON business_v2.company_work_exception_dispatches
    (brief_id, work_item_id, id);

CREATE INDEX company_work_exception_dispatches_completed_fingerprint_idx
  ON business_v2.company_work_exception_dispatches
    (work_item_id, dispatch_fingerprint, id)
  WHERE status = 'attempted';

CREATE TABLE business_v2.company_work_exception_dispatch_events (
  id                       bigserial PRIMARY KEY,
  dispatch_id              bigint NOT NULL
                           REFERENCES business_v2.company_work_exception_dispatches(id),
  attempt_number           integer NOT NULL CHECK (attempt_number >= 0),
  event_type               text NOT NULL CHECK (
                             event_type IN (
                               'posted', 'picked_up',
                               'attempt_succeeded', 'attempt_failed'
                             )
                           ),
  event_key                text NOT NULL UNIQUE CHECK (
                             btrim(event_key) <> ''
                           ),
  evidence_sha256          text NOT NULL CHECK (
                             evidence_sha256 ~ '^[0-9a-f]{64}$'
                           ),
  occurred_at              timestamptz NOT NULL,
  recorded_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_work_exception_dispatch_events_attempt_chk CHECK (
    (event_type = 'posted' AND attempt_number = 0) OR
    (event_type <> 'posted' AND attempt_number >= 1)
  )
);

CREATE INDEX company_work_exception_dispatch_events_dispatch_idx
  ON business_v2.company_work_exception_dispatch_events
    (dispatch_id, attempt_number, occurred_at, id);

CREATE TRIGGER company_work_exception_dispatch_events_append_only
  BEFORE UPDATE OR DELETE
  ON business_v2.company_work_exception_dispatch_events
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();

COMMENT ON TABLE business_v2.company_work_exception_dispatches IS
  'Content-free host binding for one exact Chief exception packet and its latest bounded agent attempt; never source resolution or workflow authority.';
COMMENT ON TABLE business_v2.company_work_exception_dispatch_events IS
  'Append-only packet delivery, Chief-router pickup, and agent-turn outcome receipts; contains no customer or agent output text.';

ALTER TABLE business_v2.company_work_exception_dispatches
  OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.company_work_exception_dispatch_events
  OWNER TO nanoclaw_admin;

REVOKE ALL ON business_v2.company_work_exception_dispatches FROM PUBLIC;
REVOKE ALL ON business_v2.company_work_exception_dispatch_events FROM PUBLIC;
REVOKE ALL ON SEQUENCE
  business_v2.company_work_exception_dispatches_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE
  business_v2.company_work_exception_dispatch_events_id_seq FROM PUBLIC;

GRANT ALL ON business_v2.company_work_exception_dispatches TO nanoclaw_admin;
GRANT ALL ON business_v2.company_work_exception_dispatch_events TO nanoclaw_admin;
GRANT ALL ON SEQUENCE
  business_v2.company_work_exception_dispatches_id_seq TO nanoclaw_admin;
GRANT ALL ON SEQUENCE
  business_v2.company_work_exception_dispatch_events_id_seq TO nanoclaw_admin;

COMMIT;
