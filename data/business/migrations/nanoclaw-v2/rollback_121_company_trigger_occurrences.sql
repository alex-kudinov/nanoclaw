-- rollback_121_company_trigger_occurrences.sql
--
-- History-preserving rollback for the dark Company OS trigger foundation.
-- Runtime rollback leaves the additive table dormant. DDL rollback is allowed
-- only before any trigger occurrence has been recorded.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $$
BEGIN
  IF to_regclass('business_v2.company_trigger_occurrences') IS NOT NULL AND
     EXISTS (SELECT 1 FROM business_v2.company_trigger_occurrences LIMIT 1) THEN
    RAISE EXCEPTION
      'refusing to drop populated company_trigger_occurrences history';
  END IF;
END;
$$;

DROP TABLE IF EXISTS business_v2.company_trigger_occurrences;

COMMIT;
