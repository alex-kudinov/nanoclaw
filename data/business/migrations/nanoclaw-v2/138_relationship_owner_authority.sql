-- 138_relationship_owner_authority.sql
--
-- Tandem OS owns relationship-owner authority. This migration records the
-- owner-approved generic organizational principal and one explicit assignment
-- for each governed follow-up lane. Ownership is accountability/routing only:
-- these tables grant no agent, approval, send, provider-write, or follow-up
-- activation authority.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE business_v2.relationship_owner_principals (
  principal_key       text PRIMARY KEY CHECK (
                        principal_key ~ '^[a-z][a-z0-9._:-]{0,127}$'
                      ),
  principal_type      text NOT NULL CHECK (
                        principal_type IN ('organizational_team', 'person')
                      ),
  display_name        text NOT NULL CHECK (
                        char_length(btrim(display_name)) BETWEEN 1 AND 160
                      ),
  managing_system     text NOT NULL CHECK (managing_system = 'tandem_os'),
  action_authority    text NOT NULL DEFAULT 'none' CHECK (
                        action_authority = 'none'
                      ),
  decision_ref        text NOT NULL CHECK (
                        char_length(decision_ref) BETWEEN 1 AND 500 AND
                        decision_ref !~ '[[:space:]]'
                      ),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE business_v2.relationship_owner_assignments (
  id                     bigserial PRIMARY KEY,
  scope_type             text NOT NULL CHECK (scope_type = 'followup_lane'),
  scope_key              text NOT NULL CHECK (
                           scope_key IN (
                             'sales_conversation',
                             'proposal_signature',
                             'receivable'
                           )
                         ),
  principal_key          text NOT NULL REFERENCES
                           business_v2.relationship_owner_principals(
                             principal_key
                           ),
  decision_ref           text NOT NULL CHECK (
                           char_length(decision_ref) BETWEEN 1 AND 500 AND
                           decision_ref !~ '[[:space:]]'
                         ),
  effective_from         timestamptz NOT NULL,
  supersedes_assignment_id bigint REFERENCES
                           business_v2.relationship_owner_assignments(id),
  assignment_fingerprint text NOT NULL CHECK (
                           assignment_fingerprint ~ '^[0-9a-f]{64}$'
                         ),
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT relationship_owner_assignments_effective_uniq
    UNIQUE (scope_type, scope_key, effective_from),
  CONSTRAINT relationship_owner_assignments_receipt_uniq
    UNIQUE (id, principal_key, decision_ref, scope_key)
);

CREATE FUNCTION business_v2.fn_validate_relationship_owner_assignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  prior business_v2.relationship_owner_assignments%ROWTYPE;
  current_assignment business_v2.relationship_owner_assignments%ROWTYPE;
BEGIN
  -- Assignment changes are rare admin decisions, but serialize one exact
  -- scope so concurrent inserts cannot both validate against the same prior
  -- assignment under READ COMMITTED.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.scope_type || ':' || NEW.scope_key, 0)
  );

  SELECT *
    INTO current_assignment
    FROM business_v2.relationship_owner_assignments
   WHERE scope_type = NEW.scope_type
     AND scope_key = NEW.scope_key
   ORDER BY effective_from DESC, id DESC
   LIMIT 1;

  IF NOT FOUND THEN
    IF NEW.supersedes_assignment_id IS NOT NULL THEN
      RAISE EXCEPTION
        'first relationship owner assignment cannot supersede another row';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.supersedes_assignment_id IS NULL OR
     NEW.supersedes_assignment_id <> current_assignment.id THEN
    RAISE EXCEPTION
      'relationship owner assignment must supersede the exact current scope assignment';
  END IF;

  SELECT *
    INTO prior
    FROM business_v2.relationship_owner_assignments
   WHERE id = NEW.supersedes_assignment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'relationship owner superseded assignment does not exist';
  END IF;
  IF prior.scope_type <> NEW.scope_type OR prior.scope_key <> NEW.scope_key THEN
    RAISE EXCEPTION
      'relationship owner assignment may supersede only the same exact scope';
  END IF;
  IF prior.effective_from >= NEW.effective_from THEN
    RAISE EXCEPTION
      'relationship owner assignment effective time must advance';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER relationship_owner_assignments_validate
  BEFORE INSERT ON business_v2.relationship_owner_assignments
  FOR EACH ROW EXECUTE FUNCTION
    business_v2.fn_validate_relationship_owner_assignment();

CREATE TRIGGER relationship_owner_principals_append_only
  BEFORE UPDATE OR DELETE ON business_v2.relationship_owner_principals
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();

CREATE TRIGGER relationship_owner_assignments_append_only
  BEFORE UPDATE OR DELETE ON business_v2.relationship_owner_assignments
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();

INSERT INTO business_v2.relationship_owner_principals
  (principal_key, principal_type, display_name, managing_system,
   action_authority, decision_ref, created_at)
VALUES
  ('team:tandem', 'organizational_team', 'Tandem Team', 'tandem_os',
   'none',
   '.program/decisions/decision-relationship-owner-tandem-team-2026-08-26.json',
   '2026-08-26T13:44:52+00:00'::timestamptz);

INSERT INTO business_v2.relationship_owner_assignments
  (scope_type, scope_key, principal_key, decision_ref, effective_from,
   supersedes_assignment_id, assignment_fingerprint, created_at)
SELECT
  'followup_lane',
  lane,
  'team:tandem',
  '.program/decisions/decision-relationship-owner-tandem-team-2026-08-26.json',
  '2026-08-26T13:44:52+00:00'::timestamptz,
  NULL,
  encode(
    sha256(
      convert_to(
        concat_ws(
          '|',
          'followup_lane',
          lane,
          'team:tandem',
          '.program/decisions/decision-relationship-owner-tandem-team-2026-08-26.json',
          '2026-08-26T13:44:52+00:00'
        ),
        'UTF8'
      )
    ),
    'hex'
  ),
  '2026-08-26T13:44:52+00:00'::timestamptz
FROM (
  VALUES
    ('sales_conversation'::text),
    ('proposal_signature'::text),
    ('receivable'::text)
) AS lanes(lane);

ALTER TABLE business_v2.company_followup_cases
  ADD COLUMN relationship_owner_principal_key text,
  ADD COLUMN relationship_owner_assignment_id bigint,
  ADD COLUMN relationship_owner_decision_ref text,
  ADD CONSTRAINT company_followup_cases_relationship_owner_pair_chk CHECK (
    (relationship_owner_principal_key IS NULL AND
     relationship_owner_assignment_id IS NULL AND
     relationship_owner_decision_ref IS NULL) OR
    (relationship_owner_principal_key IS NOT NULL AND
     relationship_owner_assignment_id IS NOT NULL AND
     relationship_owner_decision_ref IS NOT NULL)
  ),
  ADD CONSTRAINT company_followup_cases_relationship_owner_required_chk CHECK (
    disposition IN ('blocked', 'completed', 'cancelled') OR
    relationship_owner_assignment_id IS NOT NULL
  ),
  ADD CONSTRAINT company_followup_cases_relationship_owner_fk
    FOREIGN KEY (
      relationship_owner_assignment_id,
      relationship_owner_principal_key,
      relationship_owner_decision_ref,
      lane
    )
    REFERENCES business_v2.relationship_owner_assignments(
      id,
      principal_key,
      decision_ref,
      scope_key
    );

CREATE INDEX company_followup_cases_relationship_owner_idx
  ON business_v2.company_followup_cases
    (relationship_owner_principal_key, lane, updated_at DESC)
  WHERE relationship_owner_principal_key IS NOT NULL;

COMMENT ON TABLE business_v2.relationship_owner_principals IS
  'Tandem OS organizational/person accountability principals. action_authority is always none; action authorization remains a separate host boundary.';
COMMENT ON TABLE business_v2.relationship_owner_assignments IS
  'Append-only, decision-bound assignment policy for exact governed scopes. Newer effective rows supersede older rows without inference or rewrite.';
COMMENT ON COLUMN business_v2.company_followup_cases.relationship_owner_principal_key IS
  'Explicit Tandem OS accountability principal; never inferred from sender, creator, pipeline duplication, or recent activity.';

ALTER TABLE business_v2.relationship_owner_principals
  OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.relationship_owner_assignments
  OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_validate_relationship_owner_assignment()
  OWNER TO nanoclaw_admin;

REVOKE ALL ON business_v2.relationship_owner_principals FROM PUBLIC;
REVOKE ALL ON business_v2.relationship_owner_assignments FROM PUBLIC;
REVOKE ALL ON SEQUENCE
  business_v2.relationship_owner_assignments_id_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION
  business_v2.fn_validate_relationship_owner_assignment() FROM PUBLIC;

GRANT ALL ON business_v2.relationship_owner_principals TO nanoclaw_admin;
GRANT ALL ON business_v2.relationship_owner_assignments TO nanoclaw_admin;
GRANT ALL ON SEQUENCE
  business_v2.relationship_owner_assignments_id_seq TO nanoclaw_admin;
GRANT EXECUTE ON FUNCTION
  business_v2.fn_validate_relationship_owner_assignment() TO nanoclaw_admin;

COMMIT;
