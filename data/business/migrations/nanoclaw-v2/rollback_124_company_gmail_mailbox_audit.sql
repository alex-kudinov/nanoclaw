-- rollback_124_company_gmail_mailbox_audit.sql
-- Runtime rollback leaves additive audit history dormant. DDL rollback is
-- allowed only before any audit, page, or candidate evidence exists.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $$
BEGIN
  IF to_regclass('business_v2.company_gmail_mailbox_audits') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM business_v2.company_gmail_mailbox_audits LIMIT 1
     ) THEN
    RAISE EXCEPTION 'refusing to drop populated Gmail mailbox audit history';
  END IF;
  IF to_regclass('business_v2.company_gmail_mailbox_audit_pages') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM business_v2.company_gmail_mailbox_audit_pages LIMIT 1
     ) THEN
    RAISE EXCEPTION 'refusing to drop populated Gmail mailbox audit history';
  END IF;
  IF to_regclass('business_v2.company_gmail_mailbox_audit_candidates') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM business_v2.company_gmail_mailbox_audit_candidates LIMIT 1
     ) THEN
    RAISE EXCEPTION 'refusing to drop populated Gmail mailbox audit history';
  END IF;
END;
$$;

DROP TABLE IF EXISTS business_v2.company_gmail_mailbox_audit_candidates;
DROP TABLE IF EXISTS business_v2.company_gmail_mailbox_audit_pages;
DROP TABLE IF EXISTS business_v2.company_gmail_mailbox_audits;

COMMIT;
