-- 126_company_work_outcome_quality.sql
--
-- Add the canonical, privacy-minimized assessment receipt required by the
-- third Sales-email service indicator. This migration is dark persistence
-- only: it adds no producer, daemon import, agent privilege, message path,
-- remediation action, or automatic customer-outcome classifier.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE business_v2.company_work_outcome_quality_receipts (
  id                       bigserial PRIMARY KEY,
  work_item_id             bigint NOT NULL,
  delivery_event_version   integer NOT NULL CHECK (
                             delivery_event_version >= 0
                           ),
  receipt_version          smallint NOT NULL DEFAULT 1 CHECK (
                             receipt_version = 1
                           ),
  assessment_revision      integer NOT NULL CHECK (
                             assessment_revision >= 1
                           ),
  assessment               text NOT NULL CHECK (
                             assessment IN (
                               'clean',
                               'customer_visible_defect',
                               'customer_visible_reversal',
                               'customer_visible_defect_and_reversal'
                             )
                           ),
  source_system            text NOT NULL CHECK (
                             source_system ~
                               '^[a-z0-9][a-z0-9:_-]{0,63}$'
                           ),
  source_key_sha256        text NOT NULL CHECK (
                             source_key_sha256 ~ '^[0-9a-f]{64}$'
                           ),
  evidence_sha256          text NOT NULL CHECK (
                             evidence_sha256 ~ '^[0-9a-f]{64}$'
                           ),
  assessor_kind            text NOT NULL CHECK (
                             assessor_kind IN ('operator', 'host_rule')
                           ),
  assessor_key_sha256      text NOT NULL CHECK (
                             assessor_key_sha256 ~ '^[0-9a-f]{64}$'
                           ),
  evidence_occurred_at     timestamptz NOT NULL,
  assessed_at              timestamptz NOT NULL,
  supersedes_receipt_id    bigint,
  recorded_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_work_outcome_quality_event_fk
    FOREIGN KEY (work_item_id, delivery_event_version)
    REFERENCES business_v2.company_work_events(
      work_item_id, work_item_version
    ),
  CONSTRAINT company_work_outcome_quality_source_uniq
    UNIQUE (source_system, source_key_sha256),
  CONSTRAINT company_work_outcome_quality_revision_uniq
    UNIQUE (work_item_id, delivery_event_version, assessment_revision),
  CONSTRAINT company_work_outcome_quality_supersedes_uniq
    UNIQUE (supersedes_receipt_id),
  CONSTRAINT company_work_outcome_quality_item_id_uniq
    UNIQUE (work_item_id, delivery_event_version, id),
  CONSTRAINT company_work_outcome_quality_supersedes_fk
    FOREIGN KEY (
      work_item_id, delivery_event_version, supersedes_receipt_id
    )
    REFERENCES business_v2.company_work_outcome_quality_receipts(
      work_item_id, delivery_event_version, id
    ),
  CONSTRAINT company_work_outcome_quality_assessment_time_chk
    CHECK (
      assessed_at >= evidence_occurred_at AND recorded_at >= assessed_at
    )
);

CREATE INDEX company_work_outcome_quality_item_idx
  ON business_v2.company_work_outcome_quality_receipts
    (work_item_id, delivery_event_version, assessment_revision DESC);

CREATE OR REPLACE FUNCTION
  business_v2.fn_company_work_outcome_quality_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = business_v2, pg_catalog
AS $$
DECLARE
  v_workflow_type text;
  v_event_type text;
  v_delivery_at timestamptz;
  v_prior_revision integer;
  v_prior_assessed_at timestamptz;
BEGIN
  SELECT i.workflow_type, e.event_type, e.occurred_at
    INTO STRICT v_workflow_type, v_event_type, v_delivery_at
    FROM business_v2.company_work_events e
    JOIN business_v2.company_work_items i ON i.id = e.work_item_id
   WHERE e.work_item_id = NEW.work_item_id
     AND e.work_item_version = NEW.delivery_event_version;

  IF v_workflow_type <> 'sales_email' OR
     v_event_type <> 'external_acknowledged' THEN
    RAISE EXCEPTION
      'outcome-quality receipt must bind one sales_email external_acknowledged event';
  END IF;

  IF NEW.evidence_occurred_at < v_delivery_at OR
     NEW.assessed_at < v_delivery_at THEN
    RAISE EXCEPTION
      'outcome-quality evidence and assessment cannot precede delivery';
  END IF;

  IF NEW.supersedes_receipt_id IS NULL THEN
    IF NEW.assessment_revision <> 1 THEN
      RAISE EXCEPTION
        'initial outcome-quality receipt must use assessment_revision 1';
    END IF;
  ELSE
    SELECT assessment_revision, assessed_at
      INTO STRICT v_prior_revision, v_prior_assessed_at
      FROM business_v2.company_work_outcome_quality_receipts
     WHERE id = NEW.supersedes_receipt_id
       AND work_item_id = NEW.work_item_id
       AND delivery_event_version = NEW.delivery_event_version;

    IF NEW.assessment_revision <> v_prior_revision + 1 THEN
      RAISE EXCEPTION
        'outcome-quality revision must immediately follow its predecessor';
    END IF;
    IF NEW.assessed_at < v_prior_assessed_at THEN
      RAISE EXCEPTION
        'outcome-quality revision cannot move assessment time backward';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER company_work_outcome_quality_validate
  BEFORE INSERT
  ON business_v2.company_work_outcome_quality_receipts
  FOR EACH ROW EXECUTE FUNCTION
    business_v2.fn_company_work_outcome_quality_validate();

CREATE TRIGGER company_work_outcome_quality_append_only
  BEFORE UPDATE OR DELETE
  ON business_v2.company_work_outcome_quality_receipts
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();

COMMENT ON TABLE business_v2.company_work_outcome_quality_receipts IS
  'Append-only, revisionable outcome-quality assessments bound to exact Sales-email Gmail delivery events. Stores only classifications, opaque hashes, roles, and timestamps; no customer identity, address, subject, message content, prompt, or remediation authority.';

ALTER TABLE business_v2.company_work_outcome_quality_receipts
  OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_company_work_outcome_quality_validate()
  OWNER TO nanoclaw_admin;

REVOKE ALL ON business_v2.company_work_outcome_quality_receipts FROM PUBLIC;
REVOKE ALL ON SEQUENCE
  business_v2.company_work_outcome_quality_receipts_id_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION
  business_v2.fn_company_work_outcome_quality_validate() FROM PUBLIC;

GRANT ALL ON business_v2.company_work_outcome_quality_receipts
  TO nanoclaw_admin;
GRANT ALL ON SEQUENCE
  business_v2.company_work_outcome_quality_receipts_id_seq
  TO nanoclaw_admin;
GRANT EXECUTE ON FUNCTION
  business_v2.fn_company_work_outcome_quality_validate()
  TO nanoclaw_admin;

COMMIT;
