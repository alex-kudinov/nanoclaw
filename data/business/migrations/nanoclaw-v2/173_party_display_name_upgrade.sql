-- 173_party_display_name_upgrade.sql — NC-20260929-001
--
-- fn_create_party names a person once, at creation. A brochure form that asked
-- only for a first name ("steve") therefore stays the name forever, even after
-- a checkout or booking knows the full name ("Steve Rivera"). This migration
-- adds the one rule that may improve such a name (owner rule, 2026-09-29,
-- applied exactly and never widened):
--
--   1. the current name is one word: no whitespace, no '@';
--   2. the new name, trimmed with inner whitespace collapsed, has two or more
--      words and no '@';
--   3. the new name's first word equals the current name, ignoring case.
--
-- Anything else leaves the name alone: no rename of a multi-word name, no
-- shortening, no change of first name, no email as a name. Only live
-- (unmerged) persons change. Two further refusals only narrow the rule: a
-- candidate over 200 characters, or one holding control, zero-width or
-- bidirectional-override characters.
--
-- An upgrade updates business_v2.parties (display_name, updated_at,
-- last_updated_by), which the Tandem Identity registry refresh fingerprints,
-- and appends one party_display_name_changes row keeping the previous name
-- for audit and reversal. Host-only: no agent role gets EXECUTE or SELECT.

BEGIN;
SET LOCAL search_path TO pg_catalog;

CREATE TABLE IF NOT EXISTS business_v2.party_display_name_changes (
  id bigserial PRIMARY KEY,
  party_id bigint NOT NULL REFERENCES business_v2.parties(id),
  previous_display_name text NOT NULL,
  new_display_name text NOT NULL,
  source text NOT NULL
    CONSTRAINT party_display_name_changes_source_check
    CHECK (source ~ '^[a-z][a-z0-9_.:-]{0,63}$'),
  changed_by text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT party_display_name_changes_differs
    CHECK (previous_display_name <> new_display_name)
);

CREATE INDEX IF NOT EXISTS party_display_name_changes_party_idx
  ON business_v2.party_display_name_changes (party_id, changed_at);

COMMENT ON TABLE business_v2.party_display_name_changes IS
  'Append-only audit of display_name upgrades made by fn_upgrade_party_display_name (NC-20260929-001).';

CREATE OR REPLACE FUNCTION business_v2.fn_party_display_name_changes_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'party_display_name_changes is append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS party_display_name_changes_append_only
  ON business_v2.party_display_name_changes;
CREATE TRIGGER party_display_name_changes_append_only
  BEFORE UPDATE OR DELETE ON business_v2.party_display_name_changes
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_party_display_name_changes_append_only();

DROP TRIGGER IF EXISTS party_display_name_changes_no_truncate
  ON business_v2.party_display_name_changes;
CREATE TRIGGER party_display_name_changes_no_truncate
  BEFORE TRUNCATE ON business_v2.party_display_name_changes
  FOR EACH STATEMENT EXECUTE FUNCTION business_v2.fn_party_display_name_changes_append_only();

-- Trim and collapse every whitespace run to one space.
CREATE OR REPLACE FUNCTION business_v2.fn_display_name_normalize(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT btrim(regexp_replace(p_name, '[[:space:]]+', ' ', 'g'), ' ');
$$;

-- The rule. Returns 'upgrade' or the first reason it refuses.
CREATE OR REPLACE FUNCTION business_v2.fn_display_name_upgrade_verdict(
  p_current text,
  p_candidate text
)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_current IS NULL OR p_current = '' THEN 'current_missing'
    WHEN position('@' IN p_current) > 0 THEN 'current_is_email'
    WHEN p_current ~ '[[:space:]]' THEN 'current_not_one_word'
    WHEN c.name IS NULL OR c.name = '' THEN 'candidate_missing'
    WHEN length(c.name) > 200 THEN 'candidate_too_long'
    WHEN c.name ~ '[[:cntrl:]\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]'
      THEN 'candidate_bad_characters'
    WHEN position('@' IN c.name) > 0 THEN 'candidate_is_email'
    WHEN position(' ' IN c.name) = 0 THEN 'candidate_one_word'
    WHEN lower(split_part(c.name, ' ', 1)) <> lower(p_current)
      THEN 'first_word_differs'
    ELSE 'upgrade'
  END
  FROM (SELECT business_v2.fn_display_name_normalize(p_candidate) AS name) c;
$$;

-- Apply the rule to one party. Follows the merge chain; changes only a live
-- person. p_expected_current, when given, must equal the current name
-- exactly (the backfill guard). Returns true only when the name changed.
CREATE OR REPLACE FUNCTION business_v2.fn_upgrade_party_display_name(
  p_party_id bigint,
  p_candidate text,
  p_source text,
  p_expected_current text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, pg_catalog, pg_temp
AS $$
DECLARE
  v_agent text := COALESCE(NULLIF(current_setting('app.current_agent', true), ''), 'unknown');
  v_party bigint;
  v_current text;
  v_new text;
BEGIN
  IF p_party_id IS NULL OR p_candidate IS NULL THEN
    RETURN false;
  END IF;

  v_party := business_v2.canonical_party_id(p_party_id);
  IF v_party IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.display_name
    INTO v_current
    FROM business_v2.parties p
   WHERE p.id = v_party
     AND p.party_type = 'person'
     AND p.merged_into IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_expected_current IS NOT NULL AND v_current IS DISTINCT FROM p_expected_current THEN
    RETURN false;
  END IF;

  IF business_v2.fn_display_name_upgrade_verdict(v_current, p_candidate) <> 'upgrade' THEN
    RETURN false;
  END IF;
  v_new := business_v2.fn_display_name_normalize(p_candidate);

  UPDATE business_v2.parties
     SET display_name = v_new,
         updated_at = now(),
         last_updated_by = v_agent
   WHERE id = v_party;

  INSERT INTO business_v2.party_display_name_changes
    (party_id, previous_display_name, new_display_name, source, changed_by)
  VALUES
    (v_party, v_current, v_new, p_source, v_agent);

  RETURN true;
END;
$$;

ALTER TABLE business_v2.party_display_name_changes OWNER TO nanoclaw_admin;
ALTER SEQUENCE business_v2.party_display_name_changes_id_seq OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_party_display_name_changes_append_only() OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_display_name_normalize(text) OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_display_name_upgrade_verdict(text, text) OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_upgrade_party_display_name(bigint, text, text, text) OWNER TO nanoclaw_admin;

REVOKE ALL ON business_v2.party_display_name_changes FROM PUBLIC;
REVOKE ALL ON SEQUENCE business_v2.party_display_name_changes_id_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_party_display_name_changes_append_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_display_name_normalize(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_display_name_upgrade_verdict(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_upgrade_party_display_name(bigint, text, text, text) FROM PUBLIC;

COMMIT;
