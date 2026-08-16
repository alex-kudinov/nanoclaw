-- rollback_118_company_work_ledger.sql
--
-- Not auto-discovered by run_migration.sh. Prefer leaving the host-only tables
-- dormant. This rollback refuses to delete any recorded work history.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $rollback$
DECLARE
  v_items bigint := 0;
  v_receipts bigint := 0;
  v_events bigint := 0;
BEGIN
  IF to_regclass('business_v2.company_work_items') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM business_v2.company_work_items'
      INTO v_items;
  END IF;
  IF to_regclass('business_v2.company_work_receipts') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM business_v2.company_work_receipts'
      INTO v_receipts;
  END IF;
  IF to_regclass('business_v2.company_work_events') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM business_v2.company_work_events'
      INTO v_events;
  END IF;

  IF v_items <> 0 OR v_receipts <> 0 OR v_events <> 0 THEN
    RAISE EXCEPTION
      'company work ledger contains history (items %, receipts %, events %); leave dormant or perform a reviewed archival migration',
      v_items, v_receipts, v_events;
  END IF;
END
$rollback$;

DROP TABLE IF EXISTS business_v2.company_work_events;
DROP TABLE IF EXISTS business_v2.company_work_receipts;
DROP TABLE IF EXISTS business_v2.company_work_items;
DROP FUNCTION IF EXISTS business_v2.fn_company_work_append_only();

COMMIT;
