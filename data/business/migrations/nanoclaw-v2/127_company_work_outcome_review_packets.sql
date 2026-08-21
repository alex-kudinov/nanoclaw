-- 127_company_work_outcome_review_packets.sql
--
-- Content-free delivery and decision state for exact operator review of one
-- Sales-email customer-visible outcome. Raw request/response content remains
-- in the existing private Slack/SQLite surfaces and is never persisted here.
-- This migration does not enable the producer, post a packet, classify an
-- outcome, or grant an agent any new authority.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE business_v2.company_work_outcome_review_packets (
  id                         bigserial PRIMARY KEY,
  work_item_id               bigint NOT NULL,
  delivery_event_version     integer NOT NULL CHECK (
                               delivery_event_version >= 0
                             ),
  packet_version             smallint NOT NULL DEFAULT 1 CHECK (
                               packet_version = 1
                             ),
  packet_fingerprint         text NOT NULL UNIQUE CHECK (
                               packet_fingerprint ~ '^[0-9a-f]{64}$'
                             ),
  source_key_sha256          text NOT NULL UNIQUE CHECK (
                               source_key_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  evidence_sha256            text NOT NULL CHECK (
                               evidence_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  evidence_occurred_at       timestamptz NOT NULL,
  status                     text NOT NULL DEFAULT 'pending' CHECK (
                               status IN (
                                 'pending', 'posted',
                                 'delivery_uncertain', 'decided'
                               )
                             ),
  slack_channel_jid          text,
  slack_message_ts           text,
  posted_at                  timestamptz,
  failure_code               text,
  decision_assessment        text CHECK (
                               decision_assessment IS NULL OR
                               decision_assessment IN (
                                 'clean',
                                 'customer_visible_defect',
                                 'customer_visible_reversal',
                                 'customer_visible_defect_and_reversal'
                               )
                             ),
  decision_actor_sha256      text CHECK (
                               decision_actor_sha256 IS NULL OR
                               decision_actor_sha256 ~ '^[0-9a-f]{64}$'
                             ),
  decision_reaction          text CHECK (
                               decision_reaction IS NULL OR
                               decision_reaction IN (
                                 'white_check_mark', 'heavy_check_mark',
                                 'ballot_box_with_check', 'bug',
                                 'leftwards_arrow_with_hook',
                                 'rotating_light'
                               )
                             ),
  decided_at                 timestamptz,
  assessment_receipt_id      bigint,
  decision_receipt_status    text NOT NULL DEFAULT 'none' CHECK (
                               decision_receipt_status IN (
                                 'none', 'pending', 'posted', 'uncertain'
                               )
                             ),
  decision_receipt_ts        text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_work_outcome_review_target_uniq
    UNIQUE (work_item_id, delivery_event_version),
  CONSTRAINT company_work_outcome_review_event_fk
    FOREIGN KEY (work_item_id, delivery_event_version)
    REFERENCES business_v2.company_work_events(
      work_item_id, work_item_version
    ),
  CONSTRAINT company_work_outcome_review_assessment_fk
    FOREIGN KEY (
      work_item_id, delivery_event_version, assessment_receipt_id
    )
    REFERENCES business_v2.company_work_outcome_quality_receipts(
      work_item_id, delivery_event_version, id
    ),
  CONSTRAINT company_work_outcome_review_slack_uniq
    UNIQUE (slack_channel_jid, slack_message_ts),
  CONSTRAINT company_work_outcome_review_channel_chk CHECK (
    slack_channel_jid IS NULL OR
    slack_channel_jid ~ '^slack:[A-Z0-9]+$'
  ),
  CONSTRAINT company_work_outcome_review_message_ts_chk CHECK (
    slack_message_ts IS NULL OR
    slack_message_ts ~ '^[0-9]{10,}\.[0-9]{6}$'
  ),
  CONSTRAINT company_work_outcome_review_receipt_ts_chk CHECK (
    decision_receipt_ts IS NULL OR
    decision_receipt_ts ~ '^[0-9]{10,}\.[0-9]{6}$'
  ),
  CONSTRAINT company_work_outcome_review_failure_code_chk CHECK (
    failure_code IS NULL OR
    failure_code ~ '^[a-z0-9][a-z0-9._:-]{0,159}$'
  ),
  CONSTRAINT company_work_outcome_review_state_chk CHECK (
    (
      status = 'pending' AND
      slack_channel_jid IS NULL AND slack_message_ts IS NULL AND
      posted_at IS NULL AND failure_code IS NULL AND
      decision_assessment IS NULL AND decision_actor_sha256 IS NULL AND
      decision_reaction IS NULL AND decided_at IS NULL AND
      assessment_receipt_id IS NULL AND
      decision_receipt_status = 'none' AND decision_receipt_ts IS NULL
    ) OR (
      status = 'posted' AND
      slack_channel_jid IS NOT NULL AND slack_message_ts IS NOT NULL AND
      posted_at IS NOT NULL AND failure_code IS NULL AND
      decision_assessment IS NULL AND decision_actor_sha256 IS NULL AND
      decision_reaction IS NULL AND decided_at IS NULL AND
      assessment_receipt_id IS NULL AND
      decision_receipt_status = 'none' AND decision_receipt_ts IS NULL
    ) OR (
      status = 'delivery_uncertain' AND
      slack_channel_jid IS NOT NULL AND slack_message_ts IS NULL AND
      posted_at IS NULL AND failure_code IS NOT NULL AND
      decision_assessment IS NULL AND decision_actor_sha256 IS NULL AND
      decision_reaction IS NULL AND decided_at IS NULL AND
      assessment_receipt_id IS NULL AND
      decision_receipt_status = 'none' AND decision_receipt_ts IS NULL
    ) OR (
      status = 'decided' AND
      slack_channel_jid IS NOT NULL AND slack_message_ts IS NOT NULL AND
      posted_at IS NOT NULL AND failure_code IS NULL AND
      decision_assessment IS NOT NULL AND
      decision_actor_sha256 IS NOT NULL AND
      decision_reaction IS NOT NULL AND decided_at IS NOT NULL AND
      assessment_receipt_id IS NOT NULL AND
      decision_receipt_status IN ('pending', 'posted', 'uncertain') AND
      ((decision_receipt_status = 'posted') =
        (decision_receipt_ts IS NOT NULL))
    )
  )
);

CREATE INDEX company_work_outcome_review_status_idx
  ON business_v2.company_work_outcome_review_packets
    (status, created_at, id);

CREATE TABLE business_v2.company_work_outcome_review_events (
  id                 bigserial PRIMARY KEY,
  packet_id          bigint NOT NULL
                     REFERENCES business_v2.company_work_outcome_review_packets(id),
  event_type         text NOT NULL CHECK (
                       event_type IN (
                         'claimed', 'posted', 'delivery_uncertain',
                         'decision_recorded',
                         'decision_receipt_posted',
                         'decision_receipt_uncertain'
                       )
                     ),
  event_key          text NOT NULL UNIQUE CHECK (btrim(event_key) <> ''),
  evidence_sha256    text NOT NULL CHECK (
                       evidence_sha256 ~ '^[0-9a-f]{64}$'
                     ),
  occurred_at        timestamptz NOT NULL,
  recorded_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX company_work_outcome_review_events_packet_idx
  ON business_v2.company_work_outcome_review_events
    (packet_id, occurred_at, id);

CREATE OR REPLACE FUNCTION
  business_v2.fn_company_work_outcome_review_packet_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = business_v2, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.work_item_id IS DISTINCT FROM OLD.work_item_id OR
       NEW.delivery_event_version IS DISTINCT FROM OLD.delivery_event_version OR
       NEW.packet_version IS DISTINCT FROM OLD.packet_version OR
       NEW.packet_fingerprint IS DISTINCT FROM OLD.packet_fingerprint OR
       NEW.source_key_sha256 IS DISTINCT FROM OLD.source_key_sha256 OR
       NEW.evidence_sha256 IS DISTINCT FROM OLD.evidence_sha256 OR
       NEW.evidence_occurred_at IS DISTINCT FROM OLD.evidence_occurred_at OR
       NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'outcome-review packet identity is immutable';
    END IF;

    IF NOT (
      (OLD.status = 'pending' AND
       NEW.status IN ('posted', 'delivery_uncertain')) OR
      (OLD.status = 'posted' AND NEW.status = 'decided') OR
      (OLD.status = 'decided' AND NEW.status = 'decided' AND
       OLD.decision_receipt_status = 'pending' AND
       NEW.decision_receipt_status IN ('posted', 'uncertain'))
    ) THEN
      RAISE EXCEPTION 'invalid outcome-review packet transition';
    END IF;

    IF OLD.status IN ('posted', 'decided') AND (
       NEW.slack_channel_jid IS DISTINCT FROM OLD.slack_channel_jid OR
       NEW.slack_message_ts IS DISTINCT FROM OLD.slack_message_ts OR
       NEW.posted_at IS DISTINCT FROM OLD.posted_at OR
       NEW.failure_code IS DISTINCT FROM OLD.failure_code) THEN
      RAISE EXCEPTION 'posted outcome-review delivery binding is immutable';
    END IF;

    IF OLD.status = 'decided' AND (
       NEW.decision_assessment IS DISTINCT FROM OLD.decision_assessment OR
       NEW.decision_actor_sha256 IS DISTINCT FROM OLD.decision_actor_sha256 OR
       NEW.decision_reaction IS DISTINCT FROM OLD.decision_reaction OR
       NEW.decided_at IS DISTINCT FROM OLD.decided_at OR
       NEW.assessment_receipt_id IS DISTINCT FROM OLD.assessment_receipt_id) THEN
      RAISE EXCEPTION 'outcome-review decision binding is immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER company_work_outcome_review_packet_validate
  BEFORE UPDATE
  ON business_v2.company_work_outcome_review_packets
  FOR EACH ROW EXECUTE FUNCTION
    business_v2.fn_company_work_outcome_review_packet_validate();

CREATE TRIGGER company_work_outcome_review_events_append_only
  BEFORE UPDATE OR DELETE
  ON business_v2.company_work_outcome_review_events
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();

COMMENT ON TABLE business_v2.company_work_outcome_review_packets IS
  'Host-owned current delivery/decision projection for exact operator outcome review. Stores only internal bindings, hashes, bounded states, and Slack receipts; no customer identity or message content.';
COMMENT ON TABLE business_v2.company_work_outcome_review_events IS
  'Append-only content-free lifecycle evidence for outcome-review packet delivery and decision receipts.';

ALTER TABLE business_v2.company_work_outcome_review_packets
  OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.company_work_outcome_review_events
  OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_company_work_outcome_review_packet_validate()
  OWNER TO nanoclaw_admin;

REVOKE ALL ON business_v2.company_work_outcome_review_packets FROM PUBLIC;
REVOKE ALL ON business_v2.company_work_outcome_review_events FROM PUBLIC;
REVOKE ALL ON SEQUENCE
  business_v2.company_work_outcome_review_packets_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE
  business_v2.company_work_outcome_review_events_id_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION
  business_v2.fn_company_work_outcome_review_packet_validate() FROM PUBLIC;

GRANT ALL ON business_v2.company_work_outcome_review_packets
  TO nanoclaw_admin;
GRANT ALL ON business_v2.company_work_outcome_review_events
  TO nanoclaw_admin;
GRANT ALL ON SEQUENCE
  business_v2.company_work_outcome_review_packets_id_seq TO nanoclaw_admin;
GRANT ALL ON SEQUENCE
  business_v2.company_work_outcome_review_events_id_seq TO nanoclaw_admin;
GRANT EXECUTE ON FUNCTION
  business_v2.fn_company_work_outcome_review_packet_validate()
  TO nanoclaw_admin;

COMMIT;
