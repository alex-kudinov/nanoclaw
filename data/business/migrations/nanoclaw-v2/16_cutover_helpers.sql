-- 16_cutover_helpers.sql — 3 new callable helpers for Plan #3 (agent cutover)
-- Part of NanoClaw Schema v2 Migration (Plan #3 of 4)
-- Depends: 11_helpers.sql, 14_grants.sql
--
-- Adds: fn_create_party, fn_add_party_role, fn_log_interaction_dedup
-- Pattern: SECURITY DEFINER, owned by nanoclaw_admin, session-var agent identity.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

----------------------------------------------------------------------
-- Preflight: Invariant #6 — never REPLACE existing function signatures
----------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('business_v2.fn_create_party(text,text,citext,text,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'fn_create_party already exists; invariant #6 forbids replacing signatures';
  END IF;
  IF to_regprocedure('business_v2.fn_add_party_role(bigint,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'fn_add_party_role already exists; invariant #6 forbids replacing signatures';
  END IF;
  IF to_regprocedure('business_v2.fn_log_interaction_dedup(bigint,text,text,text,timestamptz,jsonb,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'fn_log_interaction_dedup already exists; invariant #6 forbids replacing signatures';
  END IF;
END $$;

----------------------------------------------------------------------
-- 1. fn_create_party(text, text, citext, text, jsonb) RETURNS bigint
-- Idempotent party creation: finds by email or inserts new.
-- Advisory lock serializes concurrent creates for same email.
----------------------------------------------------------------------
CREATE FUNCTION business_v2.fn_create_party(
  p_party_type text,
  p_display_name text,
  p_email citext,
  p_source_provider text DEFAULT 'manual',
  p_metadata jsonb DEFAULT '{}'
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, public, pg_temp
AS $$
DECLARE
  v_agent text := COALESCE(NULLIF(current_setting('app.current_agent', true), ''), 'unknown');
  v_found bigint;
  v_canonical bigint;
  v_new_id bigint;
BEGIN
  -- Input normalization and validation
  p_email := nullif(trim(p_email::text), '')::citext;
  IF p_email IS NULL THEN
    RAISE EXCEPTION 'p_email required';
  END IF;
  p_display_name := nullif(trim(p_display_name), '');
  IF p_display_name IS NULL THEN
    RAISE EXCEPTION 'p_display_name required';
  END IF;
  p_party_type := lower(trim(p_party_type));
  IF p_party_type NOT IN ('person', 'org') THEN
    RAISE EXCEPTION 'p_party_type must be person or org, got: %', p_party_type;
  END IF;

  -- Advisory lock serializes check-then-insert for this email
  PERFORM pg_advisory_xact_lock(hashtextextended(p_email::text, 0));

  -- Check for existing party by email
  v_found := business_v2.best_party_by_email(p_email);
  IF v_found IS NOT NULL THEN
    v_canonical := business_v2.canonical_party_id(v_found);
    RETURN v_canonical;
  END IF;

  -- Insert new party
  INSERT INTO business_v2.parties
    (party_type, display_name, primary_email, source_provider, last_updated_by)
  VALUES
    (p_party_type, p_display_name, p_email, p_source_provider, v_agent)
  RETURNING id INTO v_new_id;

  -- Insert primary email record
  INSERT INTO business_v2.party_emails (party_id, email, is_primary)
  VALUES (v_new_id, p_email, true)
  ON CONFLICT (party_id, email) DO NOTHING;

  RETURN v_new_id;
END;
$$;

ALTER FUNCTION business_v2.fn_create_party(text, text, citext, text, jsonb)
  OWNER TO nanoclaw_admin;

----------------------------------------------------------------------
-- 2. fn_add_party_role(bigint, text) RETURNS bigint
-- Idempotent role assignment: returns existing active role or creates new.
----------------------------------------------------------------------
CREATE FUNCTION business_v2.fn_add_party_role(
  p_party_id bigint,
  p_role_type text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, public, pg_temp
AS $$
DECLARE
  v_agent text := COALESCE(NULLIF(current_setting('app.current_agent', true), ''), 'unknown');
  v_party_id bigint;
  v_role_id bigint;
BEGIN
  -- Guard: valid party_id
  IF p_party_id IS NULL OR p_party_id <= 0 THEN
    RAISE EXCEPTION 'p_party_id must be > 0';
  END IF;

  -- Guard: valid role_type
  IF NOT EXISTS (SELECT 1 FROM business_v2.role_types WHERE key = p_role_type) THEN
    RAISE EXCEPTION 'invalid p_role_type: %', p_role_type;
  END IF;

  -- Canonicalize party_id (follow merge chain)
  v_party_id := business_v2.canonical_party_id(p_party_id);
  IF v_party_id IS NULL THEN
    RAISE EXCEPTION 'unknown party_id: %', p_party_id;
  END IF;

  -- Upsert: partial unique index party_roles_active_uniq makes this race-safe
  INSERT INTO business_v2.party_roles (party_id, role_type)
  VALUES (v_party_id, p_role_type)
  ON CONFLICT (party_id, role_type) WHERE ended_at IS NULL
  DO NOTHING
  RETURNING id INTO v_role_id;

  -- If conflict (already exists), fetch the existing id
  IF v_role_id IS NULL THEN
    SELECT id INTO v_role_id
    FROM business_v2.party_roles
    WHERE party_id = v_party_id
      AND role_type = p_role_type
      AND ended_at IS NULL;
  END IF;

  RETURN v_role_id;
END;
$$;

ALTER FUNCTION business_v2.fn_add_party_role(bigint, text)
  OWNER TO nanoclaw_admin;

----------------------------------------------------------------------
-- 3. fn_log_interaction_dedup(bigint,text,text,text,timestamptz,jsonb,text,text)
-- Dedup-aware interaction logging. Inserts directly (not via fn_log_interaction)
-- to populate source_provider/source_id first-class columns for index-backed dedup.
----------------------------------------------------------------------
CREATE FUNCTION business_v2.fn_log_interaction_dedup(
  p_party_id bigint,
  p_channel text,
  p_direction text,
  p_subject text,
  p_occurred_at timestamptz,
  p_metadata jsonb,
  p_source_provider text,
  p_source_id text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, public, pg_temp
AS $$
DECLARE
  v_agent text := COALESCE(NULLIF(current_setting('app.current_agent', true), ''), 'unknown');
  v_existing bigint;
  v_new_id bigint;
BEGIN
  -- NULL guard: source_provider/source_id are the dedup key
  IF p_source_provider IS NULL OR p_source_id IS NULL THEN
    RAISE EXCEPTION 'source_provider and source_id required for dedup';
  END IF;

  -- Advisory lock serializes dedup check for this source pair
  PERFORM pg_advisory_xact_lock(hashtextextended(p_source_provider || ':' || p_source_id, 0));

  -- Check for existing interaction using interactions_source_idx
  SELECT i.id INTO v_existing
  FROM business_v2.interactions i
  WHERE i.source_provider = p_source_provider
    AND i.source_id = p_source_id
  ORDER BY i.id ASC LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Insert directly (not via fn_log_interaction) to populate source columns
  INSERT INTO business_v2.interactions
    (party_id, channel, direction, subject, occurred_at, metadata,
     last_updated_by, source_provider, source_id)
  VALUES
    (p_party_id, p_channel, p_direction, p_subject, p_occurred_at,
     p_metadata, v_agent, p_source_provider, p_source_id)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

ALTER FUNCTION business_v2.fn_log_interaction_dedup(bigint, text, text, text, timestamptz, jsonb, text, text)
  OWNER TO nanoclaw_admin;

----------------------------------------------------------------------
-- Grants: all 3 new helpers to all 7 agent roles
-- Pattern matches 14_grants.sql lines 72-102
----------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION business_v2.fn_create_party(text, text, citext, text, jsonb) TO
  nanoclaw_booking, nanoclaw_chief, nanoclaw_contador,
  nanoclaw_inbox, nanoclaw_mailman, nanoclaw_procurement, nanoclaw_sales;

GRANT EXECUTE ON FUNCTION business_v2.fn_add_party_role(bigint, text) TO
  nanoclaw_booking, nanoclaw_chief, nanoclaw_contador,
  nanoclaw_inbox, nanoclaw_mailman, nanoclaw_procurement, nanoclaw_sales;

GRANT EXECUTE ON FUNCTION business_v2.fn_log_interaction_dedup(bigint, text, text, text, timestamptz, jsonb, text, text) TO
  nanoclaw_booking, nanoclaw_chief, nanoclaw_contador,
  nanoclaw_inbox, nanoclaw_mailman, nanoclaw_procurement, nanoclaw_sales;

COMMIT;

----------------------------------------------------------------------
-- Smoke tests (wrapped in BEGIN/ROLLBACK — no data persists)
----------------------------------------------------------------------

-- Smoke test 1: fn_create_party idempotency + fn_add_party_role idempotency + agent identity
BEGIN;
DO $$
DECLARE a bigint; b bigint; r1 bigint; r2 bigint;
BEGIN
  -- Set agent identity for smoke test
  PERFORM set_config('app.current_agent', 'smoke_test', true);

  a := business_v2.fn_create_party('person', 'Smoke Test', 'smoke+party@test.com', 'manual', '{}');
  b := business_v2.fn_create_party('person', 'Smoke Test Again', 'smoke+party@test.com', 'manual', '{}');
  IF a <> b THEN RAISE EXCEPTION 'fn_create_party not idempotent: % vs %', a, b; END IF;

  r1 := business_v2.fn_add_party_role(a, 'prospect');
  r2 := business_v2.fn_add_party_role(a, 'prospect');
  IF r1 <> r2 THEN RAISE EXCEPTION 'fn_add_party_role not idempotent: % vs %', r1, r2; END IF;

  -- Verify agent identity capture
  IF (SELECT last_updated_by FROM business_v2.parties WHERE id = a) <> 'smoke_test' THEN
    RAISE EXCEPTION 'fn_create_party did not capture agent identity';
  END IF;

  RAISE NOTICE 'Smoke test 1 PASS: fn_create_party + fn_add_party_role idempotent, agent identity captured';
END $$;
ROLLBACK;

-- Smoke test 2: fn_log_interaction_dedup idempotency + source column population
BEGIN;
DO $$
DECLARE v_party bigint; v_i1 bigint; v_i2 bigint; v_sp text; v_sid text;
BEGIN
  PERFORM set_config('app.current_agent', 'smoke_test', true);

  -- Create a party to satisfy FK
  v_party := business_v2.fn_create_party('person', 'Dedup Test', 'smoke+dedup@test.com', 'manual', '{}');

  v_i1 := business_v2.fn_log_interaction_dedup(
    v_party, 'booking', 'inbound', 'Test booking', now(),
    '{"trafft_appointment_id":"999"}'::jsonb, 'trafft', '999'
  );
  v_i2 := business_v2.fn_log_interaction_dedup(
    v_party, 'booking', 'inbound', 'Test booking again', now(),
    '{"trafft_appointment_id":"999"}'::jsonb, 'trafft', '999'
  );
  IF v_i1 <> v_i2 THEN RAISE EXCEPTION 'fn_log_interaction_dedup not idempotent: % vs %', v_i1, v_i2; END IF;

  -- Verify source columns are populated (not NULL)
  SELECT source_provider, source_id INTO v_sp, v_sid
  FROM business_v2.interactions WHERE id = v_i1;
  IF v_sp <> 'trafft' OR v_sid <> '999' THEN
    RAISE EXCEPTION 'source columns not populated: provider=%, id=%', v_sp, v_sid;
  END IF;

  RAISE NOTICE 'Smoke test 2 PASS: fn_log_interaction_dedup idempotent, source columns populated';
END $$;
ROLLBACK;

-- Smoke test 3: fn_create_party validation guards
BEGIN;
DO $$
BEGIN
  PERFORM set_config('app.current_agent', 'smoke_test', true);

  -- NULL email should fail
  BEGIN
    PERFORM business_v2.fn_create_party('person', 'No Email', NULL, 'manual', '{}');
    RAISE EXCEPTION 'Expected exception for NULL email';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%p_email required%' THEN RAISE; END IF;
  END;

  -- Empty display_name should fail
  BEGIN
    PERFORM business_v2.fn_create_party('person', '  ', 'guard@test.com', 'manual', '{}');
    RAISE EXCEPTION 'Expected exception for blank display_name';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%p_display_name required%' THEN RAISE; END IF;
  END;

  -- Invalid party_type should fail
  BEGIN
    PERFORM business_v2.fn_create_party('bot', 'Invalid Type', 'guard2@test.com', 'manual', '{}');
    RAISE EXCEPTION 'Expected exception for invalid party_type';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%p_party_type must be%' THEN RAISE; END IF;
  END;

  -- NULL source_provider/source_id in dedup should fail
  BEGIN
    PERFORM business_v2.fn_log_interaction_dedup(1, 'other', 'inbound', 'x', now(), '{}', NULL, '123');
    RAISE EXCEPTION 'Expected exception for NULL source_provider';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%source_provider and source_id required%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'Smoke test 3 PASS: validation guards working';
END $$;
ROLLBACK;
