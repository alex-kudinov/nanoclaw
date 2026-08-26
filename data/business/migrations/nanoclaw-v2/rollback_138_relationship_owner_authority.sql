-- rollback_138_relationship_owner_authority.sql
--
-- Guarded rollback. Refuse once a follow-up case references an assignment or
-- when the registry contains anything beyond the exact migration seed.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM business_v2.company_followup_cases
     WHERE relationship_owner_assignment_id IS NOT NULL
        OR relationship_owner_principal_key IS NOT NULL
        OR relationship_owner_decision_ref IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'rollback 138 refused: follow-up cases reference relationship-owner assignments';
  END IF;

  IF (SELECT count(*) FROM business_v2.relationship_owner_principals) <> 1 OR
     NOT EXISTS (
       SELECT 1
         FROM business_v2.relationship_owner_principals
        WHERE principal_key = 'team:tandem'
          AND principal_type = 'organizational_team'
          AND display_name = 'Tandem Team'
          AND managing_system = 'tandem_os'
          AND action_authority = 'none'
          AND decision_ref =
            '.program/decisions/decision-relationship-owner-tandem-team-2026-08-26.json'
     ) THEN
    RAISE EXCEPTION
      'rollback 138 refused: relationship-owner principal registry has changed';
  END IF;

  IF (SELECT count(*) FROM business_v2.relationship_owner_assignments) <> 3 OR
     EXISTS (
       SELECT 1
         FROM business_v2.relationship_owner_assignments
        WHERE scope_type <> 'followup_lane'
           OR scope_key NOT IN (
             'sales_conversation', 'proposal_signature', 'receivable'
           )
           OR principal_key <> 'team:tandem'
           OR decision_ref <>
             '.program/decisions/decision-relationship-owner-tandem-team-2026-08-26.json'
           OR effective_from <>
             '2026-08-26T13:44:52+00:00'::timestamptz
           OR supersedes_assignment_id IS NOT NULL
     ) THEN
    RAISE EXCEPTION
      'rollback 138 refused: relationship-owner assignment registry has changed';
  END IF;
END $$;

DROP INDEX business_v2.company_followup_cases_relationship_owner_idx;

ALTER TABLE business_v2.company_followup_cases
  DROP CONSTRAINT company_followup_cases_relationship_owner_fk,
  DROP CONSTRAINT company_followup_cases_relationship_owner_required_chk,
  DROP CONSTRAINT company_followup_cases_relationship_owner_pair_chk,
  DROP COLUMN relationship_owner_decision_ref,
  DROP COLUMN relationship_owner_assignment_id,
  DROP COLUMN relationship_owner_principal_key;

DROP TRIGGER relationship_owner_assignments_append_only
  ON business_v2.relationship_owner_assignments;
DROP TRIGGER relationship_owner_principals_append_only
  ON business_v2.relationship_owner_principals;
DROP TRIGGER relationship_owner_assignments_validate
  ON business_v2.relationship_owner_assignments;
DROP FUNCTION business_v2.fn_validate_relationship_owner_assignment();
DROP TABLE business_v2.relationship_owner_assignments;
DROP TABLE business_v2.relationship_owner_principals;

COMMIT;
