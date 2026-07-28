-- 03_parties.sql — parties + party_emails
-- Part of NanoClaw Schema v2 Migration (Plan #1 of 4)
-- Sequence parties_id_seq START WITH 10000 reserves 1-9999 for Plan #4 historical imports.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

-- parties — core identity table
CREATE TABLE business_v2.parties (
  id bigint NOT NULL,
  party_type text NOT NULL CHECK (party_type IN ('person', 'org')),
  display_name text NOT NULL,
  legal_name text,
  primary_email citext,
  notes text,
  source_provider text REFERENCES business_v2.source_providers(key),
  source_id text,
  merged_into bigint REFERENCES business_v2.parties(id),
  merged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_updated_by text NOT NULL DEFAULT 'unknown',
  CONSTRAINT parties_pkey PRIMARY KEY (id),
  CONSTRAINT parties_merge_consistent CHECK ((merged_into IS NULL) = (merged_at IS NULL))
);

CREATE SEQUENCE business_v2.parties_id_seq
  AS bigint START WITH 10000 OWNED BY business_v2.parties.id;

ALTER TABLE business_v2.parties
  ALTER COLUMN id SET DEFAULT nextval('business_v2.parties_id_seq');

CREATE INDEX parties_merged_into_idx ON business_v2.parties (merged_into)
  WHERE merged_into IS NOT NULL;

COMMENT ON TABLE business_v2.parties IS 'Core identity: persons and organizations. merged_into chains form tombstone graph.';
COMMENT ON COLUMN business_v2.parties.party_type IS 'person or org — drives downstream validation.';
COMMENT ON COLUMN business_v2.parties.merged_into IS 'Points to survivor party; NULL = active.';
COMMENT ON COLUMN business_v2.parties.last_updated_by IS 'Agent/user who last modified. Set via app.current_agent session var.';

-- party_emails — multiple emails per party, composite PK
CREATE TABLE business_v2.party_emails (
  party_id bigint NOT NULL REFERENCES business_v2.parties(id),
  email citext NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  PRIMARY KEY (party_id, email)
);

COMMENT ON TABLE business_v2.party_emails IS 'Party email addresses. No global unique — different parties can share an address.';

COMMIT;
