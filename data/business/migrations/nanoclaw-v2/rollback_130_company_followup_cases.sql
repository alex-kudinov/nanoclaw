-- Guarded rollback for migration 130.
-- Runtime/projectors must be disabled first. Recorded case or event evidence is
-- never erased by rollback.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM business_v2.company_followup_cases LIMIT 1) OR
     EXISTS (SELECT 1 FROM business_v2.company_followup_events LIMIT 1) THEN
    RAISE EXCEPTION
      'rollback 130 refused: company follow-up history exists; leave the additive tables dormant';
  END IF;
END $$;

DROP TABLE business_v2.company_followup_events;
DROP TABLE business_v2.company_followup_cases;

COMMIT;
