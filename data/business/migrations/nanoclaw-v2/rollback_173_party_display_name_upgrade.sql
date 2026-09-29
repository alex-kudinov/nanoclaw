-- Guarded rollback for migration 173 (NC-20260929-001).
-- Allowed only while no name has been upgraded. Once
-- party_display_name_changes holds a row, roll back host code only and keep
-- the audit: it is the record of every previous name. To restore one party's
-- previous name, set parties.display_name back to previous_display_name where
-- display_name still equals new_display_name, as a separately reviewed step.

BEGIN;
SET LOCAL search_path TO pg_catalog;

DO $$
BEGIN
  IF to_regclass('business_v2.party_display_name_changes') IS NOT NULL
     AND EXISTS (SELECT 1 FROM business_v2.party_display_name_changes LIMIT 1) THEN
    RAISE EXCEPTION 'rollback 173 refused: party display names were upgraded; restore code only and keep party_display_name_changes';
  END IF;
END $$;

DROP FUNCTION IF EXISTS business_v2.fn_upgrade_party_display_name(bigint, text, text, text);
DROP FUNCTION IF EXISTS business_v2.fn_display_name_upgrade_verdict(text, text);
DROP FUNCTION IF EXISTS business_v2.fn_display_name_normalize(text);
DROP TABLE IF EXISTS business_v2.party_display_name_changes;
DROP FUNCTION IF EXISTS business_v2.fn_party_display_name_changes_append_only();

COMMIT;
