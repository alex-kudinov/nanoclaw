-- rollback_122_company_trigger_source_watermarks.sql
--
-- History-preserving rollback for the dark trigger-source inventory and
-- watermark foundation. Runtime rollback leaves the additive tables dormant.
-- DDL rollback is allowed only before any source definition or checkpoint has
-- been recorded.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $$
BEGIN
  IF to_regclass('business_v2.company_trigger_sources') IS NOT NULL AND
     EXISTS (SELECT 1 FROM business_v2.company_trigger_sources LIMIT 1) THEN
    RAISE EXCEPTION
      'refusing to drop populated company_trigger source/watermark history';
  END IF;

  IF to_regclass('business_v2.company_trigger_watermark_events') IS NOT NULL AND
     EXISTS (
       SELECT 1 FROM business_v2.company_trigger_watermark_events LIMIT 1
     ) THEN
    RAISE EXCEPTION
      'refusing to drop populated company_trigger source/watermark history';
  END IF;

  IF to_regclass('business_v2.company_trigger_watermark_state') IS NOT NULL AND
     EXISTS (
       SELECT 1 FROM business_v2.company_trigger_watermark_state LIMIT 1
     ) THEN
    RAISE EXCEPTION
      'refusing to drop populated company_trigger source/watermark history';
  END IF;
END;
$$;

DROP TABLE IF EXISTS business_v2.company_trigger_watermark_state;
DROP TABLE IF EXISTS business_v2.company_trigger_watermark_events;
DROP TABLE IF EXISTS business_v2.company_trigger_sources;

COMMIT;
