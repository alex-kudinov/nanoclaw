-- rollback_126_company_work_outcome_quality.sql
--
-- Not auto-discovered by run_migration.sh. Refuse to erase any assessment
-- history. Once a receipt exists, leave the additive schema dormant or use a
-- separately reviewed archival migration.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $rollback$
DECLARE
  v_receipts bigint := 0;
BEGIN
  SELECT count(*) INTO v_receipts
    FROM business_v2.company_work_outcome_quality_receipts;

  IF v_receipts <> 0 THEN
    RAISE EXCEPTION
      'outcome-quality receipt history exists (% rows); leave migration 126 dormant or perform a reviewed archival migration',
      v_receipts;
  END IF;
END
$rollback$;

DROP TABLE business_v2.company_work_outcome_quality_receipts;
DROP FUNCTION business_v2.fn_company_work_outcome_quality_validate();

COMMIT;
