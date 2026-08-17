-- rollback_123_company_gmail_reconciliation_shadow.sql
--
-- Runtime rollback leaves the additive shadow tables dormant. DDL rollback is
-- allowed only before any snapshot, page, or candidate receipt exists.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $$
BEGIN
  IF to_regclass(
       'business_v2.company_gmail_reconciliation_snapshots'
     ) IS NOT NULL AND EXISTS (
       SELECT 1
         FROM business_v2.company_gmail_reconciliation_snapshots
        LIMIT 1
     ) THEN
    RAISE EXCEPTION
      'refusing to drop populated company Gmail reconciliation history';
  END IF;

  IF to_regclass(
       'business_v2.company_gmail_reconciliation_pages'
     ) IS NOT NULL AND EXISTS (
       SELECT 1
         FROM business_v2.company_gmail_reconciliation_pages
        LIMIT 1
     ) THEN
    RAISE EXCEPTION
      'refusing to drop populated company Gmail reconciliation history';
  END IF;

  IF to_regclass(
       'business_v2.company_gmail_reconciliation_candidates'
     ) IS NOT NULL AND EXISTS (
       SELECT 1
         FROM business_v2.company_gmail_reconciliation_candidates
        LIMIT 1
     ) THEN
    RAISE EXCEPTION
      'refusing to drop populated company Gmail reconciliation history';
  END IF;
END;
$$;

DROP TABLE IF EXISTS business_v2.company_gmail_reconciliation_candidates;
DROP TABLE IF EXISTS business_v2.company_gmail_reconciliation_pages;
DROP TABLE IF EXISTS business_v2.company_gmail_reconciliation_snapshots;

COMMIT;
