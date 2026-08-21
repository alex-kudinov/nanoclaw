-- rollback_129_company_work_exception_dispatch_receipts.sql
--
-- Deliberately non-auto-discovered. Packet and attempt receipts are evidence;
-- refuse rollback once any row exists rather than erase that history.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $$
DECLARE
  dispatch_count bigint;
  event_count bigint;
BEGIN
  SELECT count(*) INTO dispatch_count
    FROM business_v2.company_work_exception_dispatches;
  SELECT count(*) INTO event_count
    FROM business_v2.company_work_exception_dispatch_events;
  IF dispatch_count > 0 OR event_count > 0 THEN
    RAISE EXCEPTION
      'company work exception dispatch history exists (dispatches %, events %); refusing rollback',
      dispatch_count, event_count;
  END IF;
END;
$$;

DROP TABLE business_v2.company_work_exception_dispatch_events;
DROP TABLE business_v2.company_work_exception_dispatches;

COMMIT;
