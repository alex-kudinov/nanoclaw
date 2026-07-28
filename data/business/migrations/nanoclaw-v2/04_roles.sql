-- 04_roles.sql — party_roles, party_contact_roles, party_relationships
-- Part of NanoClaw Schema v2 Migration (Plan #1 of 4)
-- NOTE: party_roles has NO updated_at column (R1 lane 2 hard-bug fix).

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

-- party_roles — role assignments (prospect, client, coach, etc.)
CREATE TABLE business_v2.party_roles (
  id bigserial PRIMARY KEY,
  party_id bigint NOT NULL REFERENCES business_v2.parties(id),
  role_type text NOT NULL REFERENCES business_v2.role_types(key),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One active role per type per party
CREATE UNIQUE INDEX party_roles_active_uniq
  ON business_v2.party_roles (party_id, role_type) WHERE ended_at IS NULL;

COMMENT ON TABLE business_v2.party_roles IS 'Party role assignments. Partial unique enforces one active role per type. No updated_at by design.';

-- party_contact_roles — who plays what role for which org
CREATE TABLE business_v2.party_contact_roles (
  party_id bigint NOT NULL REFERENCES business_v2.parties(id),
  contact_role text NOT NULL REFERENCES business_v2.contact_roles(key),
  for_party_id bigint NOT NULL REFERENCES business_v2.parties(id),
  PRIMARY KEY (party_id, contact_role, for_party_id)
);

COMMENT ON TABLE business_v2.party_contact_roles IS 'Contact role assignments: person X plays role Y for org Z.';

-- party_relationships — directional relationships between parties
CREATE TABLE business_v2.party_relationships (
  id bigserial PRIMARY KEY,
  from_party_id bigint NOT NULL REFERENCES business_v2.parties(id),
  to_party_id bigint NOT NULL REFERENCES business_v2.parties(id),
  relationship_type text NOT NULL REFERENCES business_v2.relationship_types(key),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE business_v2.party_relationships IS 'Directional party-to-party relationships. Two reject-merged triggers in 12_triggers.sql.';

COMMIT;
