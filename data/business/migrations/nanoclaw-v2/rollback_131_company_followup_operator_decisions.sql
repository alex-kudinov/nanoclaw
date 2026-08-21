-- Guarded rollback for migration 131.
-- Refuse to discard any durable operator decision evidence.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM business_v2.company_followup_events
     WHERE event_type = 'operator_decision'
        OR operator_decision IS NOT NULL
        OR operator_fingerprint IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'rollback_131 refused: Company follow-up operator decision evidence exists';
  END IF;
END;
$$;

ALTER TABLE business_v2.company_followup_events
  DROP CONSTRAINT company_followup_events_operator_decision_chk,
  DROP CONSTRAINT company_followup_events_event_type_chk,
  DROP COLUMN operator_decision,
  DROP COLUMN operator_fingerprint,
  ADD CONSTRAINT company_followup_events_event_type_check CHECK (
    event_type IN (
      'observed', 'projection_changed',
      'presented', 'presentation_failed'
    )
  );

COMMIT;
