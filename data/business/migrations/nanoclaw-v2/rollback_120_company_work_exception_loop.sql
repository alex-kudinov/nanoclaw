-- rollback_120_company_work_exception_loop.sql
--
-- Deliberately non-auto-discovered. Refuses to discard operator-attention,
-- delivery, or acknowledgment history. After live use, roll back runtime/config
-- and leave these host-only tables dormant.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $$
DECLARE
  case_count bigint;
  brief_count bigint;
  event_count bigint;
BEGIN
  SELECT count(*) INTO case_count
    FROM business_v2.company_work_exception_cases;
  SELECT count(*) INTO brief_count
    FROM business_v2.company_work_exception_briefs;
  SELECT count(*) INTO event_count
    FROM business_v2.company_work_exception_events;
  IF case_count > 0 OR brief_count > 0 OR event_count > 0 THEN
    RAISE EXCEPTION
      'company work exception loop contains history (cases %, briefs %, events %); refusing rollback',
      case_count, brief_count, event_count;
  END IF;
END;
$$;

DROP TABLE business_v2.company_work_exception_events;
DROP TABLE business_v2.company_work_exception_briefs;
DROP TABLE business_v2.company_work_exception_cases;

COMMIT;
