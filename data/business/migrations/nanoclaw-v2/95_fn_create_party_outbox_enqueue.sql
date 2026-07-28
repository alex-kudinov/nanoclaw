-- 95_fn_create_party_outbox_enqueue.sql
-- Phase 0.6 of webhook reliability initiative (docs/WEBHOOK-RELIABILITY.md).
--
-- Adds plutio_outbox(sync, party) enqueue to the new-insert branch of
-- fn_create_party. Existing-party return path is unchanged so this remains
-- idempotent. Uses the same outbox shape as fn_merge_parties for consistency
-- with plutio-outbox-reaper's dispatch logic
-- (src/plutio-outbox-reaper.ts:150 — operation='sync' kind='party' path).
--
-- Root cause closed: 44 parties created in 30-day window had no plutio_refs
-- because callers were expected to enqueue separately and none did. Heartbeat
-- USER_JOIN, contact-form, and Trafft-first parties are all affected
-- (memory: project-identity-unification-gap.md).
--
-- Online-safe: CREATE OR REPLACE FUNCTION; in-flight calls finish on old
-- definition, new calls use the new one. No schema changes.
--
-- Depends: 16_cutover_helpers.sql (defines fn_create_party signature)
-- Depends: 11_helpers.sql (fn_validate_outbox_payload, fn_merge_parties pattern)

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE OR REPLACE FUNCTION business_v2.fn_create_party(
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

  PERFORM pg_advisory_xact_lock(hashtextextended(p_email::text, 0));

  v_found := business_v2.best_party_by_email(p_email);
  IF v_found IS NOT NULL THEN
    v_canonical := business_v2.canonical_party_id(v_found);
    RETURN v_canonical;
  END IF;

  INSERT INTO business_v2.parties
    (party_type, display_name, primary_email, source_provider, last_updated_by)
  VALUES
    (p_party_type, p_display_name, p_email, p_source_provider, v_agent)
  RETURNING id INTO v_new_id;

  INSERT INTO business_v2.party_emails (party_id, email, is_primary)
  VALUES (v_new_id, p_email, true)
  ON CONFLICT (party_id, email) DO NOTHING;

  -- Phase 0.6: enqueue Plutio person sync. Reaper's (sync, party, party_id)
  -- path calls upsert-person.sh and writes plutio_refs. ON CONFLICT guards
  -- against rare double-enqueue races; the active-dedup unique index makes
  -- the conflict branch unreachable for fresh inserts.
  INSERT INTO business_v2.plutio_outbox
    (operation, kind, party_id, payload, last_updated_by)
  VALUES
    ('sync', 'party', v_new_id,
     jsonb_build_object(
       'kind', 'party',
       'reason', 'new_party',
       'source_provider', p_source_provider
     ),
     v_agent)
  ON CONFLICT (kind, party_id, operation) WHERE status IN ('pending', 'in_flight')
    DO NOTHING;

  RETURN v_new_id;
END;
$$;

ALTER FUNCTION business_v2.fn_create_party(text, text, citext, text, jsonb)
  OWNER TO nanoclaw_admin;

COMMIT;

----------------------------------------------------------------------
-- Smoke tests (wrapped in BEGIN/ROLLBACK — no data persists)
----------------------------------------------------------------------

-- Smoke test: fresh insert enqueues exactly one outbox row;
-- re-call by same email returns same party and does NOT leak a second row.
BEGIN;
DO $$
DECLARE
  v_party_id bigint;
  v_party_id2 bigint;
  v_outbox_count int;
  v_test_email citext := 'phase06-smoke-' || floor(random()*1e12)::text || '@nanoclaw.test';
BEGIN
  PERFORM set_config('app.current_agent', 'phase-0.6-smoke', true);

  v_party_id := business_v2.fn_create_party('person', 'Phase 0.6 Smoke', v_test_email, 'manual', '{}');

  SELECT count(*) INTO v_outbox_count
  FROM business_v2.plutio_outbox
  WHERE party_id = v_party_id AND kind = 'party' AND operation = 'sync';
  IF v_outbox_count <> 1 THEN
    RAISE EXCEPTION 'Smoke FAIL: expected 1 outbox row after create, got %', v_outbox_count;
  END IF;

  v_party_id2 := business_v2.fn_create_party('person', 'Phase 0.6 Smoke', v_test_email, 'manual', '{}');
  IF v_party_id2 <> v_party_id THEN
    RAISE EXCEPTION 'Smoke FAIL: re-call returned different party id (% vs %)', v_party_id2, v_party_id;
  END IF;

  SELECT count(*) INTO v_outbox_count
  FROM business_v2.plutio_outbox
  WHERE party_id = v_party_id AND kind = 'party' AND operation = 'sync';
  IF v_outbox_count <> 1 THEN
    RAISE EXCEPTION 'Smoke FAIL: re-call leaked outbox row, count=%', v_outbox_count;
  END IF;

  RAISE NOTICE 'Phase 0.6 smoke PASS: outbox enqueue + idempotency verified';
END $$;
ROLLBACK;
