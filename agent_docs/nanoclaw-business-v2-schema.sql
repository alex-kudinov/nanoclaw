--
-- PostgreSQL database dump
--

\restrict tSLILQYJyC1cvNNQYPK7zKR1xrj3OaDJXBT0SUWrkAjmxboo1yckojRtaM8NSwV

-- Dumped from database version 16.13 (Homebrew)
-- Dumped by pg_dump version 16.13 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: business_v2; Type: SCHEMA; Schema: -; Owner: nanoclaw_admin
--

CREATE SCHEMA business_v2;


ALTER SCHEMA business_v2 OWNER TO nanoclaw_admin;

--
-- Name: SCHEMA business_v2; Type: COMMENT; Schema: -; Owner: nanoclaw_admin
--

COMMENT ON SCHEMA business_v2 IS 'NanoClaw v2 normalized business schema — Party/Role/Engagement. See docs/DATA-MODEL.md v1.1.';


--
-- Name: best_party_by_email(public.citext); Type: FUNCTION; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE FUNCTION business_v2.best_party_by_email(p_email public.citext) RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT business_v2.canonical_party_id(pe.party_id)
  FROM business_v2.party_emails pe
  WHERE pe.email = p_email
  ORDER BY pe.is_primary DESC, pe.verified_at DESC NULLS LAST, pe.party_id ASC
  LIMIT 1;
$$;


ALTER FUNCTION business_v2.best_party_by_email(p_email public.citext) OWNER TO nanoclaw_admin;

--
-- Name: canonical_party_id(bigint); Type: FUNCTION; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE FUNCTION business_v2.canonical_party_id(p_id bigint) RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  WITH RECURSIVE chain AS (
    SELECT id, merged_into, 1 AS depth
    FROM business_v2.parties WHERE id = p_id
    UNION ALL
    SELECT p.id, p.merged_into, c.depth + 1
    FROM business_v2.parties p
    JOIN chain c ON c.merged_into = p.id
    WHERE c.merged_into IS NOT NULL AND c.depth < 10
  )
  SELECT id FROM chain WHERE merged_into IS NULL OR depth = 10
  ORDER BY depth DESC LIMIT 1;
$$;


ALTER FUNCTION business_v2.canonical_party_id(p_id bigint) OWNER TO nanoclaw_admin;

--
-- Name: fn_add_party_role(bigint, text); Type: FUNCTION; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE FUNCTION business_v2.fn_add_party_role(p_party_id bigint, p_role_type text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'business_v2', 'public', 'pg_temp'
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


ALTER FUNCTION business_v2.fn_add_party_role(p_party_id bigint, p_role_type text) OWNER TO nanoclaw_admin;

--
-- Name: fn_advance_pipeline_stage(bigint, text, text); Type: FUNCTION; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE FUNCTION business_v2.fn_advance_pipeline_stage(p_entry_id bigint, p_new_stage text, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  PERFORM set_config('app.current_reason', COALESCE(p_reason, 'unspecified'), true);

  UPDATE business_v2.pipeline_entries
  SET stage = p_new_stage,
      last_updated_by = COALESCE(NULLIF(current_setting('app.current_agent', true), ''), 'unknown')
  WHERE id = p_entry_id;

  PERFORM set_config('app.current_reason', '', true);
END;
$$;


ALTER FUNCTION business_v2.fn_advance_pipeline_stage(p_entry_id bigint, p_new_stage text, p_reason text) OWNER TO nanoclaw_admin;

--
-- Name: fn_create_party(text, text, public.citext, text, jsonb); Type: FUNCTION; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE FUNCTION business_v2.fn_create_party(p_party_type text, p_display_name text, p_email public.citext, p_source_provider text DEFAULT 'manual'::text, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'business_v2', 'public', 'pg_temp'
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


ALTER FUNCTION business_v2.fn_create_party(p_party_type text, p_display_name text, p_email public.citext, p_source_provider text, p_metadata jsonb) OWNER TO nanoclaw_admin;

--
-- Name: fn_create_pipeline_entry(bigint, bigint, text, integer, text, jsonb); Type: FUNCTION; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE FUNCTION business_v2.fn_create_pipeline_entry(p_party_id bigint, p_program_id bigint, p_stage text, p_amount_cents integer, p_currency text, p_metadata jsonb) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_canonical bigint;
  v_id bigint;
  v_agent text;
BEGIN
  v_agent := COALESCE(NULLIF(current_setting('app.current_agent', true), ''), 'unknown');
  v_canonical := business_v2.canonical_party_id(p_party_id);

  INSERT INTO business_v2.pipeline_entries
    (party_id, program_id, stage, amount_cents, currency, metadata, last_updated_by)
  VALUES
    (v_canonical, p_program_id, COALESCE(p_stage, 'new'),
     p_amount_cents, COALESCE(p_currency, 'USD'),
     COALESCE(p_metadata, '{}'::jsonb), v_agent)
  RETURNING id INTO v_id;

  -- Record initial stage in history
  INSERT INTO business_v2.pipeline_stage_history
    (pipeline_entry_id, from_stage, to_stage, transitioned_by, reason)
  VALUES
    (v_id, NULL, COALESCE(p_stage, 'new'), v_agent, 'initial entry');

  RETURN v_id;
END;
$$;


ALTER FUNCTION business_v2.fn_create_pipeline_entry(p_party_id bigint, p_program_id bigint, p_stage text, p_amount_cents integer, p_currency text, p_metadata jsonb) OWNER TO nanoclaw_admin;

--
-- Name: fn_issue_document(bigint, text, integer, text, jsonb); Type: FUNCTION; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE FUNCTION business_v2.fn_issue_document(p_party_id bigint, p_kind text, p_amount_cents integer, p_currency text, p_metadata jsonb) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_canonical bigint;
  v_doc_id bigint;
  v_agent text;
  v_direction text;
BEGIN
  v_agent := COALESCE(NULLIF(current_setting('app.current_agent', true), ''), 'unknown');
  v_canonical := business_v2.canonical_party_id(p_party_id);
  v_direction := COALESCE(p_metadata->>'direction', 'outbound');

  -- Insert document
  INSERT INTO business_v2.documents
    (party_id, kind, status, amount_cents, currency, metadata, last_updated_by)
  VALUES
    (v_canonical, p_kind, 'draft', p_amount_cents, p_currency,
     COALESCE(p_metadata, '{}'::jsonb), v_agent)
  RETURNING id INTO v_doc_id;

  -- Record interaction
  INSERT INTO business_v2.interactions
    (party_id, channel, direction, subject, occurred_at, metadata, last_updated_by)
  VALUES
    (v_canonical, 'other',
     CASE WHEN v_direction = 'inbound' THEN 'inbound' ELSE 'outbound' END,
     format('Document issued: %s #%s', p_kind, v_doc_id),
     now(),
     jsonb_build_object('document_id', v_doc_id, 'document_kind', p_kind),
     v_agent);

  -- Emit outbox for Plutio sync ONLY for outbound documents Tandem issues
  -- to clients. Inbound documents (vendor bills) are logged for the audit
  -- trail but never pushed to Plutio's /invoices /proposals /contracts —
  -- those endpoints are for documents we issue, not documents we receive.
  IF v_direction != 'inbound'
     AND p_kind IN ('proposal', 'contract', 'invoice', 'receipt') THEN
    INSERT INTO business_v2.plutio_outbox
      (operation, kind, party_id, document_id, payload, last_updated_by)
    VALUES
      ('create', p_kind, v_canonical, v_doc_id,
       jsonb_build_object('kind', p_kind, 'party_id', v_canonical,
                          'document_id', v_doc_id, 'amount_cents', p_amount_cents),
       v_agent);
  END IF;

  RETURN v_doc_id;
END;
$$;


ALTER FUNCTION business_v2.fn_issue_document(p_party_id bigint, p_kind text, p_amount_cents integer, p_currency text, p_metadata jsonb) OWNER TO nanoclaw_admin;

--
-- Name: fn_log_interaction(bigint, text, text, text, timestamp with time zone, jsonb); Type: FUNCTION; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE FUNCTION business_v2.fn_log_interaction(p_party_id bigint, p_channel text, p_direction text, p_subject text, p_occurred_at timestamp with time zone, p_metadata jsonb) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_canonical bigint;
  v_id bigint;
  v_agent text;
BEGIN
  v_agent := COALESCE(NULLIF(current_setting('app.current_agent', true), ''), 'unknown');
  v_canonical := business_v2.canonical_party_id(p_party_id);

  INSERT INTO business_v2.interactions
    (party_id, channel, direction, subject, occurred_at, metadata, last_updated_by)
  VALUES
    (v_canonical, p_channel, p_direction, p_subject,
     COALESCE(p_occurred_at, now()), COALESCE(p_metadata, '{}'::jsonb), v_agent)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


ALTER FUNCTION business_v2.fn_log_interaction(p_party_id bigint, p_channel text, p_direction text, p_subject text, p_occurred_at timestamp with time zone, p_metadata jsonb) OWNER TO nanoclaw_admin;

--
-- Name: fn_log_interaction_dedup(bigint, text, text, text, timestamp with time zone, jsonb, text, text); Type: FUNCTION; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE FUNCTION business_v2.fn_log_interaction_dedup(p_party_id bigint, p_channel text, p_direction text, p_subject text, p_occurred_at timestamp with time zone, p_metadata jsonb, p_source_provider text, p_source_id text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'business_v2', 'public', 'pg_temp'
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


ALTER FUNCTION business_v2.fn_log_interaction_dedup(p_party_id bigint, p_channel text, p_direction text, p_subject text, p_occurred_at timestamp with time zone, p_metadata jsonb, p_source_provider text, p_source_id text) OWNER TO nanoclaw_admin;

--
-- Name: fn_merge_parties(bigint, bigint, text); Type: FUNCTION; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE FUNCTION business_v2.fn_merge_parties(p_loser bigint, p_winner bigint, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_agent text;
BEGIN
  v_agent := COALESCE(NULLIF(current_setting('app.current_agent', true), ''), 'unknown');

  -- Validate: loser must not already be merged
  IF EXISTS (SELECT 1 FROM business_v2.parties WHERE id = p_loser AND merged_into IS NOT NULL) THEN
    RAISE EXCEPTION 'Party % is already merged', p_loser;
  END IF;
  IF p_loser = p_winner THEN
    RAISE EXCEPTION 'Cannot merge party into itself';
  END IF;

  -- Redirect child FKs from loser to winner
  UPDATE business_v2.party_emails SET party_id = p_winner WHERE party_id = p_loser;
  UPDATE business_v2.party_roles SET party_id = p_winner WHERE party_id = p_loser;
  UPDATE business_v2.party_contact_roles SET party_id = p_winner WHERE party_id = p_loser;
  UPDATE business_v2.party_contact_roles SET for_party_id = p_winner WHERE for_party_id = p_loser;
  UPDATE business_v2.party_relationships SET from_party_id = p_winner WHERE from_party_id = p_loser;
  UPDATE business_v2.party_relationships SET to_party_id = p_winner WHERE to_party_id = p_loser;
  UPDATE business_v2.engagement_participants SET party_id = p_winner WHERE party_id = p_loser;
  UPDATE business_v2.pipeline_entries SET party_id = p_winner WHERE party_id = p_loser;
  UPDATE business_v2.interactions SET party_id = p_winner WHERE party_id = p_loser;
  UPDATE business_v2.documents SET party_id = p_winner WHERE party_id = p_loser;
  UPDATE business_v2.plutio_outbox SET party_id = p_winner WHERE party_id = p_loser;

  -- Tombstone the loser
  UPDATE business_v2.parties
  SET merged_into = p_winner,
      merged_at = now(),
      last_updated_by = v_agent
  WHERE id = p_loser;

  -- Audit trail: record merge as internal interaction
  INSERT INTO business_v2.interactions
    (party_id, channel, direction, subject, occurred_at, metadata, last_updated_by)
  VALUES
    (p_winner, 'other', 'internal',
     format('Merged party %s into %s: %s', p_loser, p_winner, p_reason),
     now(),
     jsonb_build_object('merge_loser', p_loser, 'merge_reason', p_reason),
     v_agent);

  -- Emit outbox entry for Plutio sync (skip if one already pending for this party)
  INSERT INTO business_v2.plutio_outbox
    (operation, kind, party_id, payload, last_updated_by)
  VALUES
    ('sync', 'party', p_winner,
     jsonb_build_object('kind', 'party', 'merged_from', p_loser, 'reason', p_reason),
     v_agent)
  ON CONFLICT (kind, party_id, operation) WHERE status IN ('pending', 'in_flight') DO NOTHING;
END;
$$;


ALTER FUNCTION business_v2.fn_merge_parties(p_loser bigint, p_winner bigint, p_reason text) OWNER TO nanoclaw_admin;

--
-- Name: fn_pipeline_stage_history(); Type: FUNCTION; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE FUNCTION business_v2.fn_pipeline_stage_history() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_agent text;
  v_reason text;
BEGIN
  -- Backfill bypass
  IF current_setting('app.backfill_mode', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- No-op if stage unchanged
  IF OLD.stage = NEW.stage THEN
    RETURN NEW;
  END IF;

  -- Block terminal→non-terminal transitions
  IF OLD.stage IN ('won', 'lost') THEN
    RAISE EXCEPTION 'Cannot transition from terminal stage %', OLD.stage;
  END IF;

  v_agent := COALESCE(NULLIF(current_setting('app.current_agent', true), ''), 'unknown');
  v_reason := COALESCE(NULLIF(current_setting('app.current_reason', true), ''), 'unspecified');

  INSERT INTO business_v2.pipeline_stage_history
    (pipeline_entry_id, from_stage, to_stage, transitioned_by, reason)
  VALUES
    (NEW.id, OLD.stage, NEW.stage, v_agent, v_reason);

  -- Reset entered_stage_at
  NEW.entered_stage_at := now();

  RETURN NEW;
END;
$$;


ALTER FUNCTION business_v2.fn_pipeline_stage_history() OWNER TO nanoclaw_admin;

--
-- Name: fn_reject_writes_to_merged_from_party(); Type: FUNCTION; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE FUNCTION business_v2.fn_reject_writes_to_merged_from_party() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF current_setting('app.backfill_mode', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.from_party_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM business_v2.parties WHERE id = NEW.from_party_id AND merged_into IS NOT NULL) THEN
    RAISE EXCEPTION 'Cannot write relationship from merged party %. Use canonical_party_id() first.', NEW.from_party_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION business_v2.fn_reject_writes_to_merged_from_party() OWNER TO nanoclaw_admin;

--
-- Name: fn_reject_writes_to_merged_party(); Type: FUNCTION; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE FUNCTION business_v2.fn_reject_writes_to_merged_party() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Backfill bypass
  IF current_setting('app.backfill_mode', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.party_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM business_v2.parties WHERE id = NEW.party_id AND merged_into IS NOT NULL) THEN
    RAISE EXCEPTION 'Cannot write to merged party %. Use canonical_party_id() first.', NEW.party_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION business_v2.fn_reject_writes_to_merged_party() OWNER TO nanoclaw_admin;

--
-- Name: fn_reject_writes_to_merged_to_party(); Type: FUNCTION; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE FUNCTION business_v2.fn_reject_writes_to_merged_to_party() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF current_setting('app.backfill_mode', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.to_party_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM business_v2.parties WHERE id = NEW.to_party_id AND merged_into IS NOT NULL) THEN
    RAISE EXCEPTION 'Cannot write relationship to merged party %. Use canonical_party_id() first.', NEW.to_party_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION business_v2.fn_reject_writes_to_merged_to_party() OWNER TO nanoclaw_admin;

--
-- Name: fn_set_party_dnd(bigint); Type: FUNCTION; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE FUNCTION business_v2.fn_set_party_dnd(p_party_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE business_v2.parties
  SET dnd_at = now(), updated_at = now(), last_updated_by = 'unsubscribe-webhook'
  WHERE id = p_party_id AND dnd_at IS NULL;
END;
$$;


ALTER FUNCTION business_v2.fn_set_party_dnd(p_party_id bigint) OWNER TO nanoclaw_admin;

--
-- Name: fn_validate_outbox_payload(); Type: FUNCTION; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE FUNCTION business_v2.fn_validate_outbox_payload() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_required text[];
  v_key text;
BEGIN
  -- Backfill bypass
  IF current_setting('app.backfill_mode', true) = 'true' THEN
    RETURN NEW;
  END IF;

  CASE NEW.operation
    WHEN 'create'   THEN v_required := ARRAY['kind', 'party_id'];
    WHEN 'update'   THEN v_required := ARRAY['kind', 'party_id'];
    WHEN 'delete'   THEN v_required := ARRAY['kind', 'party_id'];
    WHEN 'sync'     THEN v_required := ARRAY['kind'];
    WHEN 'validate' THEN v_required := ARRAY['kind'];
    ELSE RAISE EXCEPTION 'Unknown outbox operation: %', NEW.operation;
  END CASE;

  FOREACH v_key IN ARRAY v_required LOOP
    IF NOT (NEW.payload ? v_key) THEN
      RAISE EXCEPTION 'plutio_outbox payload missing required key "%" for operation "%"',
        v_key, NEW.operation;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


ALTER FUNCTION business_v2.fn_validate_outbox_payload() OWNER TO nanoclaw_admin;

--
-- Name: resolve_parties_by_email(public.citext); Type: FUNCTION; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE FUNCTION business_v2.resolve_parties_by_email(p_email public.citext) RETURNS SETOF bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT DISTINCT business_v2.canonical_party_id(pe.party_id)
  FROM business_v2.party_emails pe
  WHERE pe.email = p_email;
$$;


ALTER FUNCTION business_v2.resolve_parties_by_email(p_email public.citext) OWNER TO nanoclaw_admin;

--
-- Name: update_timestamp(); Type: FUNCTION; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE FUNCTION business_v2.update_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION business_v2.update_timestamp() OWNER TO nanoclaw_admin;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: attachments; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.attachments (
    id bigint NOT NULL,
    interaction_id bigint NOT NULL,
    filename text,
    mime_type text,
    size_bytes bigint,
    storage_provider text,
    storage_url text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE business_v2.attachments OWNER TO xbohdpukc;

--
-- Name: TABLE attachments; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.attachments IS 'File attachments on interactions.';


--
-- Name: attachments_id_seq; Type: SEQUENCE; Schema: business_v2; Owner: xbohdpukc
--

CREATE SEQUENCE business_v2.attachments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE business_v2.attachments_id_seq OWNER TO xbohdpukc;

--
-- Name: attachments_id_seq; Type: SEQUENCE OWNED BY; Schema: business_v2; Owner: xbohdpukc
--

ALTER SEQUENCE business_v2.attachments_id_seq OWNED BY business_v2.attachments.id;


--
-- Name: contact_roles; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.contact_roles (
    key text NOT NULL,
    label text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);


ALTER TABLE business_v2.contact_roles OWNER TO xbohdpukc;

--
-- Name: TABLE contact_roles; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.contact_roles IS 'Contact role within an org relationship (billing, decision-maker, etc.).';


--
-- Name: document_kinds; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.document_kinds (
    key text NOT NULL,
    label text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);


ALTER TABLE business_v2.document_kinds OWNER TO xbohdpukc;

--
-- Name: TABLE document_kinds; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.document_kinds IS 'Document type taxonomy.';


--
-- Name: document_line_items; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.document_line_items (
    id bigint NOT NULL,
    document_id bigint NOT NULL,
    line_order integer NOT NULL,
    description text,
    quantity numeric(12,4) DEFAULT 1 NOT NULL,
    unit_price_cents integer DEFAULT 0 NOT NULL,
    subtotal_cents integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


ALTER TABLE business_v2.document_line_items OWNER TO xbohdpukc;

--
-- Name: TABLE document_line_items; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.document_line_items IS 'Line items for invoices, proposals, and other financial documents.';


--
-- Name: document_line_items_id_seq; Type: SEQUENCE; Schema: business_v2; Owner: xbohdpukc
--

CREATE SEQUENCE business_v2.document_line_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE business_v2.document_line_items_id_seq OWNER TO xbohdpukc;

--
-- Name: document_line_items_id_seq; Type: SEQUENCE OWNED BY; Schema: business_v2; Owner: xbohdpukc
--

ALTER SEQUENCE business_v2.document_line_items_id_seq OWNED BY business_v2.document_line_items.id;


--
-- Name: document_statuses; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.document_statuses (
    key text NOT NULL,
    label text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);


ALTER TABLE business_v2.document_statuses OWNER TO xbohdpukc;

--
-- Name: TABLE document_statuses; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.document_statuses IS 'Document lifecycle status taxonomy.';


--
-- Name: documents; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.documents (
    id bigint NOT NULL,
    party_id bigint NOT NULL,
    kind text NOT NULL,
    status text NOT NULL,
    issued_at timestamp with time zone,
    due_at timestamp with time zone,
    amount_cents integer,
    currency text DEFAULT 'USD'::text NOT NULL,
    document_number text,
    source_provider text,
    source_id text,
    interaction_id bigint,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_updated_by text DEFAULT 'unknown'::text NOT NULL
);


ALTER TABLE business_v2.documents OWNER TO xbohdpukc;

--
-- Name: TABLE documents; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.documents IS 'Business documents: proposals, contracts, invoices, certificates.';


--
-- Name: documents_id_seq; Type: SEQUENCE; Schema: business_v2; Owner: xbohdpukc
--

CREATE SEQUENCE business_v2.documents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE business_v2.documents_id_seq OWNER TO xbohdpukc;

--
-- Name: documents_id_seq; Type: SEQUENCE OWNED BY; Schema: business_v2; Owner: xbohdpukc
--

ALTER SEQUENCE business_v2.documents_id_seq OWNED BY business_v2.documents.id;


--
-- Name: engagement_kinds; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.engagement_kinds (
    key text NOT NULL,
    label text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);


ALTER TABLE business_v2.engagement_kinds OWNER TO xbohdpukc;

--
-- Name: TABLE engagement_kinds; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.engagement_kinds IS 'Engagement delivery type taxonomy.';


--
-- Name: engagement_participants; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.engagement_participants (
    id bigint NOT NULL,
    engagement_id bigint NOT NULL,
    party_id bigint NOT NULL,
    participant_role text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE business_v2.engagement_participants OWNER TO xbohdpukc;

--
-- Name: TABLE engagement_participants; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.engagement_participants IS 'Party participation in engagements with role and date range.';


--
-- Name: engagement_participants_id_seq; Type: SEQUENCE; Schema: business_v2; Owner: xbohdpukc
--

CREATE SEQUENCE business_v2.engagement_participants_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE business_v2.engagement_participants_id_seq OWNER TO xbohdpukc;

--
-- Name: engagement_participants_id_seq; Type: SEQUENCE OWNED BY; Schema: business_v2; Owner: xbohdpukc
--

ALTER SEQUENCE business_v2.engagement_participants_id_seq OWNED BY business_v2.engagement_participants.id;


--
-- Name: engagements; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.engagements (
    id bigint NOT NULL,
    kind text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    program_variant_id bigint,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_updated_by text DEFAULT 'unknown'::text NOT NULL,
    CONSTRAINT engagements_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'completed'::text, 'cancelled'::text])))
);


ALTER TABLE business_v2.engagements OWNER TO xbohdpukc;

--
-- Name: TABLE engagements; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.engagements IS 'Active service deliveries: coaching, mentoring, cohort, etc.';


--
-- Name: engagements_id_seq; Type: SEQUENCE; Schema: business_v2; Owner: xbohdpukc
--

CREATE SEQUENCE business_v2.engagements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE business_v2.engagements_id_seq OWNER TO xbohdpukc;

--
-- Name: engagements_id_seq; Type: SEQUENCE OWNED BY; Schema: business_v2; Owner: xbohdpukc
--

ALTER SEQUENCE business_v2.engagements_id_seq OWNED BY business_v2.engagements.id;


--
-- Name: interaction_channels; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.interaction_channels (
    key text NOT NULL,
    label text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);


ALTER TABLE business_v2.interaction_channels OWNER TO xbohdpukc;

--
-- Name: TABLE interaction_channels; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.interaction_channels IS 'Communication channel taxonomy for interactions.';


--
-- Name: interactions; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.interactions (
    id bigint NOT NULL,
    party_id bigint,
    engagement_id bigint,
    channel text NOT NULL,
    direction text NOT NULL,
    subject text,
    body text,
    occurred_at timestamp with time zone NOT NULL,
    source_provider text,
    source_id text,
    source_thread_id text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_updated_by text DEFAULT 'unknown'::text NOT NULL,
    CONSTRAINT interactions_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text, 'internal'::text])))
);


ALTER TABLE business_v2.interactions OWNER TO xbohdpukc;

--
-- Name: TABLE interactions; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.interactions IS 'All party communications: email, meeting, call, form, booking, payment, etc.';


--
-- Name: interactions_id_seq; Type: SEQUENCE; Schema: business_v2; Owner: xbohdpukc
--

CREATE SEQUENCE business_v2.interactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE business_v2.interactions_id_seq OWNER TO xbohdpukc;

--
-- Name: interactions_id_seq; Type: SEQUENCE OWNED BY; Schema: business_v2; Owner: xbohdpukc
--

ALTER SEQUENCE business_v2.interactions_id_seq OWNED BY business_v2.interactions.id;


--
-- Name: lost_reasons; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.lost_reasons (
    key text NOT NULL,
    label text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);


ALTER TABLE business_v2.lost_reasons OWNER TO xbohdpukc;

--
-- Name: TABLE lost_reasons; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.lost_reasons IS 'Reason a pipeline entry was marked lost.';


--
-- Name: participant_roles; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.participant_roles (
    key text NOT NULL,
    label text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);


ALTER TABLE business_v2.participant_roles OWNER TO xbohdpukc;

--
-- Name: TABLE participant_roles; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.participant_roles IS 'Role a party plays within an engagement.';


--
-- Name: parties; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.parties (
    id bigint NOT NULL,
    party_type text NOT NULL,
    display_name text NOT NULL,
    legal_name text,
    primary_email public.citext,
    notes text,
    source_provider text,
    source_id text,
    merged_into bigint,
    merged_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_updated_by text DEFAULT 'unknown'::text NOT NULL,
    dnd_at timestamp with time zone,
    CONSTRAINT parties_merge_consistent CHECK (((merged_into IS NULL) = (merged_at IS NULL))),
    CONSTRAINT parties_party_type_check CHECK ((party_type = ANY (ARRAY['person'::text, 'org'::text])))
);


ALTER TABLE business_v2.parties OWNER TO xbohdpukc;

--
-- Name: TABLE parties; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.parties IS 'Core identity: persons and organizations. merged_into chains form tombstone graph.';


--
-- Name: COLUMN parties.party_type; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON COLUMN business_v2.parties.party_type IS 'person or org — drives downstream validation.';


--
-- Name: COLUMN parties.merged_into; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON COLUMN business_v2.parties.merged_into IS 'Points to survivor party; NULL = active.';


--
-- Name: COLUMN parties.last_updated_by; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON COLUMN business_v2.parties.last_updated_by IS 'Agent/user who last modified. Set via app.current_agent session var.';


--
-- Name: COLUMN parties.dnd_at; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON COLUMN business_v2.parties.dnd_at IS 'When set, party has opted out of follow-up emails via unsubscribe link.';


--
-- Name: parties_id_seq; Type: SEQUENCE; Schema: business_v2; Owner: xbohdpukc
--

CREATE SEQUENCE business_v2.parties_id_seq
    START WITH 10000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE business_v2.parties_id_seq OWNER TO xbohdpukc;

--
-- Name: parties_id_seq; Type: SEQUENCE OWNED BY; Schema: business_v2; Owner: xbohdpukc
--

ALTER SEQUENCE business_v2.parties_id_seq OWNED BY business_v2.parties.id;


--
-- Name: party_contact_roles; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.party_contact_roles (
    party_id bigint NOT NULL,
    contact_role text NOT NULL,
    for_party_id bigint NOT NULL
);


ALTER TABLE business_v2.party_contact_roles OWNER TO xbohdpukc;

--
-- Name: TABLE party_contact_roles; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.party_contact_roles IS 'Contact role assignments: person X plays role Y for org Z.';


--
-- Name: party_emails; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.party_emails (
    party_id bigint NOT NULL,
    email public.citext NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    verified_at timestamp with time zone
);


ALTER TABLE business_v2.party_emails OWNER TO xbohdpukc;

--
-- Name: TABLE party_emails; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.party_emails IS 'Party email addresses. No global unique — different parties can share an address.';


--
-- Name: party_relationships; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.party_relationships (
    id bigint NOT NULL,
    from_party_id bigint NOT NULL,
    to_party_id bigint NOT NULL,
    relationship_type text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE business_v2.party_relationships OWNER TO xbohdpukc;

--
-- Name: TABLE party_relationships; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.party_relationships IS 'Directional party-to-party relationships. Two reject-merged triggers in 12_triggers.sql.';


--
-- Name: party_relationships_id_seq; Type: SEQUENCE; Schema: business_v2; Owner: xbohdpukc
--

CREATE SEQUENCE business_v2.party_relationships_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE business_v2.party_relationships_id_seq OWNER TO xbohdpukc;

--
-- Name: party_relationships_id_seq; Type: SEQUENCE OWNED BY; Schema: business_v2; Owner: xbohdpukc
--

ALTER SEQUENCE business_v2.party_relationships_id_seq OWNED BY business_v2.party_relationships.id;


--
-- Name: party_roles; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.party_roles (
    id bigint NOT NULL,
    party_id bigint NOT NULL,
    role_type text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE business_v2.party_roles OWNER TO xbohdpukc;

--
-- Name: TABLE party_roles; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.party_roles IS 'Party role assignments. Partial unique enforces one active role per type. No updated_at by design.';


--
-- Name: party_roles_id_seq; Type: SEQUENCE; Schema: business_v2; Owner: xbohdpukc
--

CREATE SEQUENCE business_v2.party_roles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE business_v2.party_roles_id_seq OWNER TO xbohdpukc;

--
-- Name: party_roles_id_seq; Type: SEQUENCE OWNED BY; Schema: business_v2; Owner: xbohdpukc
--

ALTER SEQUENCE business_v2.party_roles_id_seq OWNED BY business_v2.party_roles.id;


--
-- Name: pipeline_entries; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.pipeline_entries (
    id bigint NOT NULL,
    party_id bigint NOT NULL,
    program_id bigint NOT NULL,
    stage text NOT NULL,
    amount_cents integer,
    currency text DEFAULT 'USD'::text NOT NULL,
    dedupe_key text,
    entered_stage_at timestamp with time zone DEFAULT now() NOT NULL,
    expected_close_date date,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_updated_by text DEFAULT 'unknown'::text NOT NULL
);


ALTER TABLE business_v2.pipeline_entries OWNER TO xbohdpukc;

--
-- Name: TABLE pipeline_entries; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.pipeline_entries IS 'Sales pipeline: one active entry per (party, program). Stage transitions recorded in history.';


--
-- Name: pipeline_entries_id_seq; Type: SEQUENCE; Schema: business_v2; Owner: xbohdpukc
--

CREATE SEQUENCE business_v2.pipeline_entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE business_v2.pipeline_entries_id_seq OWNER TO xbohdpukc;

--
-- Name: pipeline_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: business_v2; Owner: xbohdpukc
--

ALTER SEQUENCE business_v2.pipeline_entries_id_seq OWNED BY business_v2.pipeline_entries.id;


--
-- Name: pipeline_stage_history; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.pipeline_stage_history (
    id bigint NOT NULL,
    pipeline_entry_id bigint NOT NULL,
    from_stage text,
    to_stage text NOT NULL,
    transitioned_at timestamp with time zone DEFAULT now() NOT NULL,
    transitioned_by text DEFAULT 'unknown'::text NOT NULL,
    reason text DEFAULT 'unspecified'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE business_v2.pipeline_stage_history OWNER TO xbohdpukc;

--
-- Name: TABLE pipeline_stage_history; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.pipeline_stage_history IS 'Immutable audit trail of pipeline stage transitions.';


--
-- Name: COLUMN pipeline_stage_history.reason; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON COLUMN business_v2.pipeline_stage_history.reason IS 'NOT NULL with default unspecified — eliminates NULL ambiguity (ARFPF A-24).';


--
-- Name: pipeline_stage_history_id_seq; Type: SEQUENCE; Schema: business_v2; Owner: xbohdpukc
--

CREATE SEQUENCE business_v2.pipeline_stage_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE business_v2.pipeline_stage_history_id_seq OWNER TO xbohdpukc;

--
-- Name: pipeline_stage_history_id_seq; Type: SEQUENCE OWNED BY; Schema: business_v2; Owner: xbohdpukc
--

ALTER SEQUENCE business_v2.pipeline_stage_history_id_seq OWNED BY business_v2.pipeline_stage_history.id;


--
-- Name: pipeline_stages; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.pipeline_stages (
    key text NOT NULL,
    label text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    sort_order integer NOT NULL,
    is_terminal boolean DEFAULT false NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);


ALTER TABLE business_v2.pipeline_stages OWNER TO xbohdpukc;

--
-- Name: TABLE pipeline_stages; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.pipeline_stages IS 'Sales pipeline stage taxonomy with terminal flag.';


--
-- Name: plutio_outbox; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.plutio_outbox (
    id bigint NOT NULL,
    operation text NOT NULL,
    kind text NOT NULL,
    party_id bigint,
    engagement_id bigint,
    document_id bigint,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_attempted_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_updated_by text DEFAULT 'unknown'::text NOT NULL
);


ALTER TABLE business_v2.plutio_outbox OWNER TO xbohdpukc;

--
-- Name: TABLE plutio_outbox; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.plutio_outbox IS 'Async Plutio sync queue. Reaper polls pending/failed entries (Plan #2).';


--
-- Name: plutio_outbox_id_seq; Type: SEQUENCE; Schema: business_v2; Owner: xbohdpukc
--

CREATE SEQUENCE business_v2.plutio_outbox_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE business_v2.plutio_outbox_id_seq OWNER TO xbohdpukc;

--
-- Name: plutio_outbox_id_seq; Type: SEQUENCE OWNED BY; Schema: business_v2; Owner: xbohdpukc
--

ALTER SEQUENCE business_v2.plutio_outbox_id_seq OWNED BY business_v2.plutio_outbox.id;


--
-- Name: plutio_outbox_operations; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.plutio_outbox_operations (
    key text NOT NULL,
    label text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);


ALTER TABLE business_v2.plutio_outbox_operations OWNER TO xbohdpukc;

--
-- Name: TABLE plutio_outbox_operations; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.plutio_outbox_operations IS 'Plutio outbox operation types.';


--
-- Name: plutio_outbox_statuses; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.plutio_outbox_statuses (
    key text NOT NULL,
    label text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    is_terminal boolean DEFAULT false NOT NULL,
    sort_order integer NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);


ALTER TABLE business_v2.plutio_outbox_statuses OWNER TO xbohdpukc;

--
-- Name: TABLE plutio_outbox_statuses; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.plutio_outbox_statuses IS 'Plutio outbox processing status with terminal flag.';


--
-- Name: plutio_refs; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.plutio_refs (
    entity_type text NOT NULL,
    entity_id bigint NOT NULL,
    plutio_entity_type text NOT NULL,
    plutio_id text NOT NULL,
    plutio_url text,
    last_pushed_at timestamp with time zone,
    last_pulled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE business_v2.plutio_refs OWNER TO xbohdpukc;

--
-- Name: TABLE plutio_refs; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.plutio_refs IS 'Bidirectional reference map: business_v2 entity ↔ Plutio entity.';


--
-- Name: program_kinds; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.program_kinds (
    key text NOT NULL,
    label text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);


ALTER TABLE business_v2.program_kinds OWNER TO xbohdpukc;

--
-- Name: TABLE program_kinds; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.program_kinds IS 'Program delivery model taxonomy.';


--
-- Name: program_variants; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.program_variants (
    id bigint NOT NULL,
    program_id bigint NOT NULL,
    variant_key text NOT NULL,
    display_name text NOT NULL,
    capacity integer,
    price_cents integer,
    currency text DEFAULT 'USD'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE business_v2.program_variants OWNER TO xbohdpukc;

--
-- Name: TABLE program_variants; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.program_variants IS 'Program delivery instances with capacity and pricing.';


--
-- Name: program_variants_id_seq; Type: SEQUENCE; Schema: business_v2; Owner: xbohdpukc
--

CREATE SEQUENCE business_v2.program_variants_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE business_v2.program_variants_id_seq OWNER TO xbohdpukc;

--
-- Name: program_variants_id_seq; Type: SEQUENCE OWNED BY; Schema: business_v2; Owner: xbohdpukc
--

ALTER SEQUENCE business_v2.program_variants_id_seq OWNED BY business_v2.program_variants.id;


--
-- Name: programs; Type: TABLE; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE TABLE business_v2.programs (
    id bigint NOT NULL,
    slug public.citext NOT NULL,
    kind text NOT NULL,
    display_name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_updated_by text DEFAULT 'unknown'::text NOT NULL
);


ALTER TABLE business_v2.programs OWNER TO nanoclaw_admin;

--
-- Name: TABLE programs; Type: COMMENT; Schema: business_v2; Owner: nanoclaw_admin
--

COMMENT ON TABLE business_v2.programs IS 'Program catalog: certification tracks, coaching services, etc.';


--
-- Name: programs_id_seq; Type: SEQUENCE; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE SEQUENCE business_v2.programs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE business_v2.programs_id_seq OWNER TO nanoclaw_admin;

--
-- Name: programs_id_seq; Type: SEQUENCE OWNED BY; Schema: business_v2; Owner: nanoclaw_admin
--

ALTER SEQUENCE business_v2.programs_id_seq OWNED BY business_v2.programs.id;


--
-- Name: relationship_types; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.relationship_types (
    key text NOT NULL,
    label text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);


ALTER TABLE business_v2.relationship_types OWNER TO xbohdpukc;

--
-- Name: TABLE relationship_types; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.relationship_types IS 'Directional party-to-party relationship taxonomy.';


--
-- Name: role_types; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.role_types (
    key text NOT NULL,
    label text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    category text NOT NULL,
    is_person_only boolean DEFAULT false NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);


ALTER TABLE business_v2.role_types OWNER TO xbohdpukc;

--
-- Name: TABLE role_types; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.role_types IS 'Party role type taxonomy (buyer/provider/internal/other).';


--
-- Name: source_providers; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.source_providers (
    key text NOT NULL,
    label text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL
);


ALTER TABLE business_v2.source_providers OWNER TO xbohdpukc;

--
-- Name: TABLE source_providers; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.source_providers IS 'External system that originated a record.';


--
-- Name: sweeper_watermarks; Type: TABLE; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE TABLE business_v2.sweeper_watermarks (
    source text NOT NULL,
    last_seen_id text,
    last_seen_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_run_at timestamp with time zone,
    last_run_status text,
    last_run_error text,
    last_run_recovered integer DEFAULT 0 NOT NULL,
    last_run_failed integer DEFAULT 0 NOT NULL,
    CONSTRAINT sweeper_watermarks_status_chk CHECK (((last_run_status IS NULL) OR (last_run_status = ANY (ARRAY['success'::text, 'frozen'::text, 'error'::text]))))
);


ALTER TABLE business_v2.sweeper_watermarks OWNER TO nanoclaw_admin;

--
-- Name: TABLE sweeper_watermarks; Type: COMMENT; Schema: business_v2; Owner: nanoclaw_admin
--

COMMENT ON TABLE business_v2.sweeper_watermarks IS 'Per-source reconciliation watermark. last_seen_at is only advanced when a sweeper run reaches full terminal-state convergence for the window. last_run_status=frozen means at least one synthesized event did not reach terminal state — operator action required.';


--
-- Name: v_active_engagements; Type: VIEW; Schema: business_v2; Owner: xbohdpukc
--

CREATE VIEW business_v2.v_active_engagements AS
 SELECT ep.id AS participant_id,
    ep.engagement_id,
    e.kind AS engagement_kind,
    e.status AS engagement_status,
    ep.party_id,
    p.display_name,
    ep.participant_role,
    ep.started_at,
    e.program_variant_id,
    pv.display_name AS variant_name,
    pv.program_id,
    pr.slug AS program_slug,
    pr.display_name AS program_name
   FROM ((((business_v2.engagement_participants ep
     JOIN business_v2.engagements e ON ((e.id = ep.engagement_id)))
     JOIN business_v2.parties p ON ((p.id = ep.party_id)))
     LEFT JOIN business_v2.program_variants pv ON ((pv.id = e.program_variant_id)))
     LEFT JOIN business_v2.programs pr ON ((pr.id = pv.program_id)))
  WHERE ((ep.ended_at IS NULL) AND (e.status = ANY (ARRAY['active'::text, 'paused'::text])));


ALTER VIEW business_v2.v_active_engagements OWNER TO xbohdpukc;

--
-- Name: VIEW v_active_engagements; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON VIEW business_v2.v_active_engagements IS 'Active engagement participants with program and variant details.';


--
-- Name: v_active_pipeline; Type: VIEW; Schema: business_v2; Owner: xbohdpukc
--

CREATE VIEW business_v2.v_active_pipeline AS
 SELECT pe.id AS pipeline_entry_id,
    pe.party_id,
    p.display_name,
    pe.program_id,
    pr.slug AS program_slug,
    pr.display_name AS program_name,
    pe.stage,
    pe.amount_cents,
    pe.currency,
    pe.entered_stage_at,
    pe.expected_close_date,
    pe.dedupe_key,
    pe.notes,
    ( SELECT max(i.occurred_at) AS max
           FROM business_v2.interactions i
          WHERE (i.party_id = pe.party_id)) AS last_interaction_at
   FROM ((business_v2.pipeline_entries pe
     JOIN business_v2.parties p ON ((p.id = pe.party_id)))
     JOIN business_v2.programs pr ON ((pr.id = pe.program_id)))
  WHERE ((pe.stage <> ALL (ARRAY['won'::text, 'lost'::text])) AND (p.merged_into IS NULL) AND (p.dnd_at IS NULL));


ALTER VIEW business_v2.v_active_pipeline OWNER TO xbohdpukc;

--
-- Name: VIEW v_active_pipeline; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON VIEW business_v2.v_active_pipeline IS 'Non-terminal pipeline entries with party and program details. Excludes tombstoned and DND parties.';


--
-- Name: v_client_status; Type: VIEW; Schema: business_v2; Owner: xbohdpukc
--

CREATE VIEW business_v2.v_client_status AS
 SELECT p.id AS party_id,
    p.display_name,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM (business_v2.engagement_participants ep2
                 JOIN business_v2.engagements e2 ON ((e2.id = ep2.engagement_id)))
              WHERE ((ep2.party_id = p.id) AND (ep2.ended_at IS NULL) AND (e2.status = ANY (ARRAY['active'::text, 'paused'::text]))))) THEN 'current'::text
            ELSE 'past'::text
        END AS client_status,
    ( SELECT max(ep3.ended_at) AS max
           FROM business_v2.engagement_participants ep3
          WHERE ((ep3.party_id = p.id) AND (ep3.ended_at IS NOT NULL))) AS last_engagement_ended_at
   FROM (business_v2.parties p
     JOIN business_v2.party_roles pr ON ((pr.party_id = p.id)))
  WHERE ((pr.role_type = 'client'::text) AND (pr.ended_at IS NULL) AND (p.merged_into IS NULL));


ALTER VIEW business_v2.v_client_status OWNER TO xbohdpukc;

--
-- Name: VIEW v_client_status; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON VIEW business_v2.v_client_status IS 'Parties with active client role: current (has active engagement) or past.';


--
-- Name: v_party_contact_card; Type: VIEW; Schema: business_v2; Owner: xbohdpukc
--

CREATE VIEW business_v2.v_party_contact_card AS
 SELECT id AS party_id,
    display_name,
    party_type,
    primary_email,
    legal_name,
    source_provider,
    ( SELECT array_agg(DISTINCT pr.role_type ORDER BY pr.role_type) AS array_agg
           FROM business_v2.party_roles pr
          WHERE ((pr.party_id = p.id) AND (pr.ended_at IS NULL))) AS active_roles,
    ( SELECT max(i.occurred_at) AS max
           FROM business_v2.interactions i
          WHERE (i.party_id = p.id)) AS last_interaction_at
   FROM business_v2.parties p
  WHERE (merged_into IS NULL);


ALTER VIEW business_v2.v_party_contact_card OWNER TO xbohdpukc;

--
-- Name: VIEW v_party_contact_card; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON VIEW business_v2.v_party_contact_card IS 'Party contact card: identity + primary email + active roles + last interaction. Excludes tombstones.';


--
-- Name: v_party_timeline; Type: VIEW; Schema: business_v2; Owner: xbohdpukc
--

CREATE VIEW business_v2.v_party_timeline AS
 SELECT i.party_id,
    i.id AS interaction_id,
    i.occurred_at,
    i.channel,
    i.direction,
    i.subject,
    i.source_provider,
    i.source_id,
    i.engagement_id,
    NULL::bigint AS pipeline_entry_id,
    NULL::bigint AS document_id,
    NULL::text AS document_kind,
    NULL::text AS document_status
   FROM business_v2.interactions i
  WHERE (i.party_id IS NOT NULL)
UNION ALL
 SELECT d.party_id,
    NULL::bigint AS interaction_id,
    COALESCE(d.issued_at, d.created_at) AS occurred_at,
    'other'::text AS channel,
    'outbound'::text AS direction,
    format('%s — %s'::text, d.kind, d.status) AS subject,
    d.source_provider,
    d.source_id,
    NULL::bigint AS engagement_id,
    NULL::bigint AS pipeline_entry_id,
    d.id AS document_id,
    d.kind AS document_kind,
    d.status AS document_status
   FROM business_v2.documents d
UNION ALL
 SELECT pe.party_id,
    NULL::bigint AS interaction_id,
    psh.transitioned_at AS occurred_at,
    'other'::text AS channel,
    'internal'::text AS direction,
    format('Pipeline: %s → %s (%s)'::text, COALESCE(psh.from_stage, 'new'::text), psh.to_stage, psh.reason) AS subject,
    NULL::text AS source_provider,
    NULL::text AS source_id,
    NULL::bigint AS engagement_id,
    pe.id AS pipeline_entry_id,
    NULL::bigint AS document_id,
    NULL::text AS document_kind,
    NULL::text AS document_status
   FROM (business_v2.pipeline_stage_history psh
     JOIN business_v2.pipeline_entries pe ON ((pe.id = psh.pipeline_entry_id)));


ALTER VIEW business_v2.v_party_timeline OWNER TO xbohdpukc;

--
-- Name: VIEW v_party_timeline; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON VIEW business_v2.v_party_timeline IS 'UNION of interactions + documents + pipeline transitions. ORDER BY occurred_at DESC at query time.';


--
-- Name: v_program_variant_seats; Type: VIEW; Schema: business_v2; Owner: xbohdpukc
--

CREATE VIEW business_v2.v_program_variant_seats AS
 SELECT pv.id AS program_variant_id,
    pv.display_name AS variant_name,
    pr.slug AS program_slug,
    pv.capacity AS seats_total,
    COALESCE(filled.cnt, (0)::bigint) AS seats_filled,
        CASE
            WHEN (pv.capacity IS NULL) THEN NULL::bigint
            ELSE (pv.capacity - COALESCE(filled.cnt, (0)::bigint))
        END AS seats_remaining
   FROM ((business_v2.program_variants pv
     JOIN business_v2.programs pr ON ((pr.id = pv.program_id)))
     LEFT JOIN LATERAL ( SELECT count(*) AS cnt
           FROM (business_v2.engagement_participants ep
             JOIN business_v2.engagements e ON ((e.id = ep.engagement_id)))
          WHERE ((e.program_variant_id = pv.id) AND (ep.participant_role = 'student'::text) AND (ep.ended_at IS NULL) AND (e.status = ANY (ARRAY['active'::text, 'paused'::text])))) filled ON (true))
  WHERE pv.is_active;


ALTER VIEW business_v2.v_program_variant_seats OWNER TO xbohdpukc;

--
-- Name: VIEW v_program_variant_seats; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON VIEW business_v2.v_program_variant_seats IS 'Variant seat utilization: total/filled/remaining. NULL capacity = no cap.';


--
-- Name: variant_enrollments; Type: TABLE; Schema: business_v2; Owner: xbohdpukc
--

CREATE TABLE business_v2.variant_enrollments (
    id bigint NOT NULL,
    variant_id bigint NOT NULL,
    engagement_id bigint NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    status text DEFAULT 'active'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE business_v2.variant_enrollments OWNER TO xbohdpukc;

--
-- Name: TABLE variant_enrollments; Type: COMMENT; Schema: business_v2; Owner: xbohdpukc
--

COMMENT ON TABLE business_v2.variant_enrollments IS 'Engagement-to-variant enrollment with seat tracking.';


--
-- Name: variant_enrollments_id_seq; Type: SEQUENCE; Schema: business_v2; Owner: xbohdpukc
--

CREATE SEQUENCE business_v2.variant_enrollments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE business_v2.variant_enrollments_id_seq OWNER TO xbohdpukc;

--
-- Name: variant_enrollments_id_seq; Type: SEQUENCE OWNED BY; Schema: business_v2; Owner: xbohdpukc
--

ALTER SEQUENCE business_v2.variant_enrollments_id_seq OWNED BY business_v2.variant_enrollments.id;


--
-- Name: webhook_inbox; Type: TABLE; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE TABLE business_v2.webhook_inbox (
    id bigint NOT NULL,
    source text NOT NULL,
    event_id text,
    event_type text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    delivery_path text DEFAULT 'n8n'::text NOT NULL,
    raw_headers jsonb,
    raw_body jsonb NOT NULL,
    status text DEFAULT 'received'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    last_attempted_at timestamp with time zone,
    handled_at timestamp with time zone,
    handled_by text,
    party_id bigint,
    related_entity jsonb,
    CONSTRAINT webhook_inbox_delivery_path_chk CHECK ((delivery_path = ANY (ARRAY['n8n'::text, 'direct'::text, 'sweep'::text]))),
    CONSTRAINT webhook_inbox_status_chk CHECK ((status = ANY (ARRAY['received'::text, 'dispatched'::text, 'handled'::text, 'failed'::text, 'duplicate'::text, 'dead_lettered'::text])))
);


ALTER TABLE business_v2.webhook_inbox OWNER TO nanoclaw_admin;

--
-- Name: TABLE webhook_inbox; Type: COMMENT; Schema: business_v2; Owner: nanoclaw_admin
--

COMMENT ON TABLE business_v2.webhook_inbox IS 'Phase 1: inbound webhook envelope archive (every /hook/* receiver writes here before dispatch). Phase 2 adds (source,event_id) idempotency wiring. Phase 3 adds inbox-reaper for failed/stuck rows.';


--
-- Name: COLUMN webhook_inbox.delivery_path; Type: COMMENT; Schema: business_v2; Owner: nanoclaw_admin
--

COMMENT ON COLUMN business_v2.webhook_inbox.delivery_path IS 'n8n: came through n8n perimeter. direct: direct provider→NC. sweep: synthesized by reconciliation sweeper.';


--
-- Name: COLUMN webhook_inbox.status; Type: COMMENT; Schema: business_v2; Owner: nanoclaw_admin
--

COMMENT ON COLUMN business_v2.webhook_inbox.status IS 'received → dispatched → handled | failed → dispatched (retry) | dead_lettered (after MAX_ATTEMPTS) | duplicate (idempotency hit, Phase 2)';


--
-- Name: webhook_inbox_id_seq; Type: SEQUENCE; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE SEQUENCE business_v2.webhook_inbox_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE business_v2.webhook_inbox_id_seq OWNER TO nanoclaw_admin;

--
-- Name: webhook_inbox_id_seq; Type: SEQUENCE OWNED BY; Schema: business_v2; Owner: nanoclaw_admin
--

ALTER SEQUENCE business_v2.webhook_inbox_id_seq OWNED BY business_v2.webhook_inbox.id;


--
-- Name: attachments id; Type: DEFAULT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.attachments ALTER COLUMN id SET DEFAULT nextval('business_v2.attachments_id_seq'::regclass);


--
-- Name: document_line_items id; Type: DEFAULT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.document_line_items ALTER COLUMN id SET DEFAULT nextval('business_v2.document_line_items_id_seq'::regclass);


--
-- Name: documents id; Type: DEFAULT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.documents ALTER COLUMN id SET DEFAULT nextval('business_v2.documents_id_seq'::regclass);


--
-- Name: engagement_participants id; Type: DEFAULT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.engagement_participants ALTER COLUMN id SET DEFAULT nextval('business_v2.engagement_participants_id_seq'::regclass);


--
-- Name: engagements id; Type: DEFAULT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.engagements ALTER COLUMN id SET DEFAULT nextval('business_v2.engagements_id_seq'::regclass);


--
-- Name: interactions id; Type: DEFAULT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.interactions ALTER COLUMN id SET DEFAULT nextval('business_v2.interactions_id_seq'::regclass);


--
-- Name: parties id; Type: DEFAULT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.parties ALTER COLUMN id SET DEFAULT nextval('business_v2.parties_id_seq'::regclass);


--
-- Name: party_relationships id; Type: DEFAULT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.party_relationships ALTER COLUMN id SET DEFAULT nextval('business_v2.party_relationships_id_seq'::regclass);


--
-- Name: party_roles id; Type: DEFAULT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.party_roles ALTER COLUMN id SET DEFAULT nextval('business_v2.party_roles_id_seq'::regclass);


--
-- Name: pipeline_entries id; Type: DEFAULT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.pipeline_entries ALTER COLUMN id SET DEFAULT nextval('business_v2.pipeline_entries_id_seq'::regclass);


--
-- Name: pipeline_stage_history id; Type: DEFAULT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.pipeline_stage_history ALTER COLUMN id SET DEFAULT nextval('business_v2.pipeline_stage_history_id_seq'::regclass);


--
-- Name: plutio_outbox id; Type: DEFAULT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.plutio_outbox ALTER COLUMN id SET DEFAULT nextval('business_v2.plutio_outbox_id_seq'::regclass);


--
-- Name: program_variants id; Type: DEFAULT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.program_variants ALTER COLUMN id SET DEFAULT nextval('business_v2.program_variants_id_seq'::regclass);


--
-- Name: programs id; Type: DEFAULT; Schema: business_v2; Owner: nanoclaw_admin
--

ALTER TABLE ONLY business_v2.programs ALTER COLUMN id SET DEFAULT nextval('business_v2.programs_id_seq'::regclass);


--
-- Name: variant_enrollments id; Type: DEFAULT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.variant_enrollments ALTER COLUMN id SET DEFAULT nextval('business_v2.variant_enrollments_id_seq'::regclass);


--
-- Name: webhook_inbox id; Type: DEFAULT; Schema: business_v2; Owner: nanoclaw_admin
--

ALTER TABLE ONLY business_v2.webhook_inbox ALTER COLUMN id SET DEFAULT nextval('business_v2.webhook_inbox_id_seq'::regclass);


--
-- Name: attachments attachments_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);


--
-- Name: contact_roles contact_roles_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.contact_roles
    ADD CONSTRAINT contact_roles_pkey PRIMARY KEY (key);


--
-- Name: document_kinds document_kinds_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.document_kinds
    ADD CONSTRAINT document_kinds_pkey PRIMARY KEY (key);


--
-- Name: document_line_items document_line_items_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.document_line_items
    ADD CONSTRAINT document_line_items_pkey PRIMARY KEY (id);


--
-- Name: document_statuses document_statuses_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.document_statuses
    ADD CONSTRAINT document_statuses_pkey PRIMARY KEY (key);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: engagement_kinds engagement_kinds_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.engagement_kinds
    ADD CONSTRAINT engagement_kinds_pkey PRIMARY KEY (key);


--
-- Name: engagement_participants engagement_participants_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.engagement_participants
    ADD CONSTRAINT engagement_participants_pkey PRIMARY KEY (id);


--
-- Name: engagements engagements_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.engagements
    ADD CONSTRAINT engagements_pkey PRIMARY KEY (id);


--
-- Name: interaction_channels interaction_channels_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.interaction_channels
    ADD CONSTRAINT interaction_channels_pkey PRIMARY KEY (key);


--
-- Name: interactions interactions_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.interactions
    ADD CONSTRAINT interactions_pkey PRIMARY KEY (id);


--
-- Name: lost_reasons lost_reasons_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.lost_reasons
    ADD CONSTRAINT lost_reasons_pkey PRIMARY KEY (key);


--
-- Name: participant_roles participant_roles_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.participant_roles
    ADD CONSTRAINT participant_roles_pkey PRIMARY KEY (key);


--
-- Name: parties parties_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.parties
    ADD CONSTRAINT parties_pkey PRIMARY KEY (id);


--
-- Name: party_contact_roles party_contact_roles_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.party_contact_roles
    ADD CONSTRAINT party_contact_roles_pkey PRIMARY KEY (party_id, contact_role, for_party_id);


--
-- Name: party_emails party_emails_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.party_emails
    ADD CONSTRAINT party_emails_pkey PRIMARY KEY (party_id, email);


--
-- Name: party_relationships party_relationships_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.party_relationships
    ADD CONSTRAINT party_relationships_pkey PRIMARY KEY (id);


--
-- Name: party_roles party_roles_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.party_roles
    ADD CONSTRAINT party_roles_pkey PRIMARY KEY (id);


--
-- Name: pipeline_entries pipeline_entries_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.pipeline_entries
    ADD CONSTRAINT pipeline_entries_pkey PRIMARY KEY (id);


--
-- Name: pipeline_stage_history pipeline_stage_history_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.pipeline_stage_history
    ADD CONSTRAINT pipeline_stage_history_pkey PRIMARY KEY (id);


--
-- Name: pipeline_stages pipeline_stages_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.pipeline_stages
    ADD CONSTRAINT pipeline_stages_pkey PRIMARY KEY (key);


--
-- Name: plutio_outbox_operations plutio_outbox_operations_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.plutio_outbox_operations
    ADD CONSTRAINT plutio_outbox_operations_pkey PRIMARY KEY (key);


--
-- Name: plutio_outbox plutio_outbox_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.plutio_outbox
    ADD CONSTRAINT plutio_outbox_pkey PRIMARY KEY (id);


--
-- Name: plutio_outbox_statuses plutio_outbox_statuses_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.plutio_outbox_statuses
    ADD CONSTRAINT plutio_outbox_statuses_pkey PRIMARY KEY (key);


--
-- Name: plutio_refs plutio_refs_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.plutio_refs
    ADD CONSTRAINT plutio_refs_pkey PRIMARY KEY (entity_type, entity_id);


--
-- Name: program_kinds program_kinds_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.program_kinds
    ADD CONSTRAINT program_kinds_pkey PRIMARY KEY (key);


--
-- Name: program_variants program_variants_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.program_variants
    ADD CONSTRAINT program_variants_pkey PRIMARY KEY (id);


--
-- Name: programs programs_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: nanoclaw_admin
--

ALTER TABLE ONLY business_v2.programs
    ADD CONSTRAINT programs_pkey PRIMARY KEY (id);


--
-- Name: programs programs_slug_key; Type: CONSTRAINT; Schema: business_v2; Owner: nanoclaw_admin
--

ALTER TABLE ONLY business_v2.programs
    ADD CONSTRAINT programs_slug_key UNIQUE (slug);


--
-- Name: relationship_types relationship_types_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.relationship_types
    ADD CONSTRAINT relationship_types_pkey PRIMARY KEY (key);


--
-- Name: role_types role_types_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.role_types
    ADD CONSTRAINT role_types_pkey PRIMARY KEY (key);


--
-- Name: source_providers source_providers_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.source_providers
    ADD CONSTRAINT source_providers_pkey PRIMARY KEY (key);


--
-- Name: sweeper_watermarks sweeper_watermarks_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: nanoclaw_admin
--

ALTER TABLE ONLY business_v2.sweeper_watermarks
    ADD CONSTRAINT sweeper_watermarks_pkey PRIMARY KEY (source);


--
-- Name: variant_enrollments variant_enrollments_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.variant_enrollments
    ADD CONSTRAINT variant_enrollments_pkey PRIMARY KEY (id);


--
-- Name: webhook_inbox webhook_inbox_pkey; Type: CONSTRAINT; Schema: business_v2; Owner: nanoclaw_admin
--

ALTER TABLE ONLY business_v2.webhook_inbox
    ADD CONSTRAINT webhook_inbox_pkey PRIMARY KEY (id);


--
-- Name: documents_source_uniq; Type: INDEX; Schema: business_v2; Owner: xbohdpukc
--

CREATE UNIQUE INDEX documents_source_uniq ON business_v2.documents USING btree (source_provider, source_id) WHERE (source_id IS NOT NULL);


--
-- Name: engagement_participants_active_uniq; Type: INDEX; Schema: business_v2; Owner: xbohdpukc
--

CREATE UNIQUE INDEX engagement_participants_active_uniq ON business_v2.engagement_participants USING btree (engagement_id, party_id, participant_role) WHERE (ended_at IS NULL);


--
-- Name: interactions_party_occurred_idx; Type: INDEX; Schema: business_v2; Owner: xbohdpukc
--

CREATE INDEX interactions_party_occurred_idx ON business_v2.interactions USING btree (party_id, occurred_at DESC);


--
-- Name: interactions_source_idx; Type: INDEX; Schema: business_v2; Owner: xbohdpukc
--

CREATE INDEX interactions_source_idx ON business_v2.interactions USING btree (source_provider, source_id) WHERE (source_provider IS NOT NULL);


--
-- Name: parties_merged_into_idx; Type: INDEX; Schema: business_v2; Owner: xbohdpukc
--

CREATE INDEX parties_merged_into_idx ON business_v2.parties USING btree (merged_into) WHERE (merged_into IS NOT NULL);


--
-- Name: party_roles_active_uniq; Type: INDEX; Schema: business_v2; Owner: xbohdpukc
--

CREATE UNIQUE INDEX party_roles_active_uniq ON business_v2.party_roles USING btree (party_id, role_type) WHERE (ended_at IS NULL);


--
-- Name: pipeline_dedupe_key_uniq; Type: INDEX; Schema: business_v2; Owner: xbohdpukc
--

CREATE UNIQUE INDEX pipeline_dedupe_key_uniq ON business_v2.pipeline_entries USING btree (dedupe_key) WHERE (dedupe_key IS NOT NULL);


--
-- Name: pipeline_one_active_per_program; Type: INDEX; Schema: business_v2; Owner: xbohdpukc
--

CREATE UNIQUE INDEX pipeline_one_active_per_program ON business_v2.pipeline_entries USING btree (party_id, program_id) WHERE (stage <> ALL (ARRAY['won'::text, 'lost'::text]));


--
-- Name: plutio_outbox_active_dedup; Type: INDEX; Schema: business_v2; Owner: xbohdpukc
--

CREATE UNIQUE INDEX plutio_outbox_active_dedup ON business_v2.plutio_outbox USING btree (kind, party_id, operation) WHERE (status = ANY (ARRAY['pending'::text, 'in_flight'::text]));


--
-- Name: plutio_outbox_reaper_idx; Type: INDEX; Schema: business_v2; Owner: xbohdpukc
--

CREATE INDEX plutio_outbox_reaper_idx ON business_v2.plutio_outbox USING btree (status, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]));


--
-- Name: plutio_refs_plutio_uniq; Type: INDEX; Schema: business_v2; Owner: xbohdpukc
--

CREATE UNIQUE INDEX plutio_refs_plutio_uniq ON business_v2.plutio_refs USING btree (plutio_entity_type, plutio_id);


--
-- Name: program_variants_program_key_uniq; Type: INDEX; Schema: business_v2; Owner: xbohdpukc
--

CREATE UNIQUE INDEX program_variants_program_key_uniq ON business_v2.program_variants USING btree (program_id, variant_key);


--
-- Name: variant_enrollments_active_uniq; Type: INDEX; Schema: business_v2; Owner: xbohdpukc
--

CREATE UNIQUE INDEX variant_enrollments_active_uniq ON business_v2.variant_enrollments USING btree (variant_id, engagement_id) WHERE (ended_at IS NULL);


--
-- Name: webhook_inbox_dispatched_idx; Type: INDEX; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE INDEX webhook_inbox_dispatched_idx ON business_v2.webhook_inbox USING btree (last_attempted_at) WHERE (status = 'dispatched'::text);


--
-- Name: webhook_inbox_idempotency; Type: INDEX; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE UNIQUE INDEX webhook_inbox_idempotency ON business_v2.webhook_inbox USING btree (source, event_id) WHERE (event_id IS NOT NULL);


--
-- Name: webhook_inbox_reaper_idx; Type: INDEX; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE INDEX webhook_inbox_reaper_idx ON business_v2.webhook_inbox USING btree (status, received_at) WHERE (status = ANY (ARRAY['received'::text, 'failed'::text]));


--
-- Name: webhook_inbox_source_received_idx; Type: INDEX; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE INDEX webhook_inbox_source_received_idx ON business_v2.webhook_inbox USING btree (source, received_at DESC);


--
-- Name: pipeline_entries trg_pipeline_stage_history; Type: TRIGGER; Schema: business_v2; Owner: xbohdpukc
--

CREATE TRIGGER trg_pipeline_stage_history BEFORE UPDATE OF stage ON business_v2.pipeline_entries FOR EACH ROW EXECUTE FUNCTION business_v2.fn_pipeline_stage_history();


--
-- Name: documents trg_reject_merged_documents; Type: TRIGGER; Schema: business_v2; Owner: xbohdpukc
--

CREATE TRIGGER trg_reject_merged_documents BEFORE INSERT OR UPDATE ON business_v2.documents FOR EACH ROW EXECUTE FUNCTION business_v2.fn_reject_writes_to_merged_party();


--
-- Name: engagement_participants trg_reject_merged_engagement_participants; Type: TRIGGER; Schema: business_v2; Owner: xbohdpukc
--

CREATE TRIGGER trg_reject_merged_engagement_participants BEFORE INSERT OR UPDATE ON business_v2.engagement_participants FOR EACH ROW EXECUTE FUNCTION business_v2.fn_reject_writes_to_merged_party();


--
-- Name: interactions trg_reject_merged_interactions; Type: TRIGGER; Schema: business_v2; Owner: xbohdpukc
--

CREATE TRIGGER trg_reject_merged_interactions BEFORE INSERT OR UPDATE ON business_v2.interactions FOR EACH ROW EXECUTE FUNCTION business_v2.fn_reject_writes_to_merged_party();


--
-- Name: party_contact_roles trg_reject_merged_party_contact_roles; Type: TRIGGER; Schema: business_v2; Owner: xbohdpukc
--

CREATE TRIGGER trg_reject_merged_party_contact_roles BEFORE INSERT OR UPDATE ON business_v2.party_contact_roles FOR EACH ROW EXECUTE FUNCTION business_v2.fn_reject_writes_to_merged_party();


--
-- Name: party_emails trg_reject_merged_party_emails; Type: TRIGGER; Schema: business_v2; Owner: xbohdpukc
--

CREATE TRIGGER trg_reject_merged_party_emails BEFORE INSERT OR UPDATE ON business_v2.party_emails FOR EACH ROW EXECUTE FUNCTION business_v2.fn_reject_writes_to_merged_party();


--
-- Name: party_relationships trg_reject_merged_party_relationships_from; Type: TRIGGER; Schema: business_v2; Owner: xbohdpukc
--

CREATE TRIGGER trg_reject_merged_party_relationships_from BEFORE INSERT OR UPDATE ON business_v2.party_relationships FOR EACH ROW EXECUTE FUNCTION business_v2.fn_reject_writes_to_merged_from_party();


--
-- Name: party_relationships trg_reject_merged_party_relationships_to; Type: TRIGGER; Schema: business_v2; Owner: xbohdpukc
--

CREATE TRIGGER trg_reject_merged_party_relationships_to BEFORE INSERT OR UPDATE ON business_v2.party_relationships FOR EACH ROW EXECUTE FUNCTION business_v2.fn_reject_writes_to_merged_to_party();


--
-- Name: party_roles trg_reject_merged_party_roles; Type: TRIGGER; Schema: business_v2; Owner: xbohdpukc
--

CREATE TRIGGER trg_reject_merged_party_roles BEFORE INSERT OR UPDATE ON business_v2.party_roles FOR EACH ROW EXECUTE FUNCTION business_v2.fn_reject_writes_to_merged_party();


--
-- Name: pipeline_entries trg_reject_merged_pipeline_entries; Type: TRIGGER; Schema: business_v2; Owner: xbohdpukc
--

CREATE TRIGGER trg_reject_merged_pipeline_entries BEFORE INSERT OR UPDATE ON business_v2.pipeline_entries FOR EACH ROW EXECUTE FUNCTION business_v2.fn_reject_writes_to_merged_party();


--
-- Name: plutio_outbox trg_reject_merged_plutio_outbox; Type: TRIGGER; Schema: business_v2; Owner: xbohdpukc
--

CREATE TRIGGER trg_reject_merged_plutio_outbox BEFORE INSERT OR UPDATE ON business_v2.plutio_outbox FOR EACH ROW EXECUTE FUNCTION business_v2.fn_reject_writes_to_merged_party();


--
-- Name: documents trg_updated_at_documents; Type: TRIGGER; Schema: business_v2; Owner: xbohdpukc
--

CREATE TRIGGER trg_updated_at_documents BEFORE UPDATE ON business_v2.documents FOR EACH ROW EXECUTE FUNCTION business_v2.update_timestamp();


--
-- Name: engagements trg_updated_at_engagements; Type: TRIGGER; Schema: business_v2; Owner: xbohdpukc
--

CREATE TRIGGER trg_updated_at_engagements BEFORE UPDATE ON business_v2.engagements FOR EACH ROW EXECUTE FUNCTION business_v2.update_timestamp();


--
-- Name: parties trg_updated_at_parties; Type: TRIGGER; Schema: business_v2; Owner: xbohdpukc
--

CREATE TRIGGER trg_updated_at_parties BEFORE UPDATE ON business_v2.parties FOR EACH ROW EXECUTE FUNCTION business_v2.update_timestamp();


--
-- Name: pipeline_entries trg_updated_at_pipeline_entries; Type: TRIGGER; Schema: business_v2; Owner: xbohdpukc
--

CREATE TRIGGER trg_updated_at_pipeline_entries BEFORE UPDATE ON business_v2.pipeline_entries FOR EACH ROW EXECUTE FUNCTION business_v2.update_timestamp();


--
-- Name: program_variants trg_updated_at_program_variants; Type: TRIGGER; Schema: business_v2; Owner: xbohdpukc
--

CREATE TRIGGER trg_updated_at_program_variants BEFORE UPDATE ON business_v2.program_variants FOR EACH ROW EXECUTE FUNCTION business_v2.update_timestamp();


--
-- Name: programs trg_updated_at_programs; Type: TRIGGER; Schema: business_v2; Owner: nanoclaw_admin
--

CREATE TRIGGER trg_updated_at_programs BEFORE UPDATE ON business_v2.programs FOR EACH ROW EXECUTE FUNCTION business_v2.update_timestamp();


--
-- Name: variant_enrollments trg_updated_at_variant_enrollments; Type: TRIGGER; Schema: business_v2; Owner: xbohdpukc
--

CREATE TRIGGER trg_updated_at_variant_enrollments BEFORE UPDATE ON business_v2.variant_enrollments FOR EACH ROW EXECUTE FUNCTION business_v2.update_timestamp();


--
-- Name: plutio_outbox trg_validate_outbox_payload; Type: TRIGGER; Schema: business_v2; Owner: xbohdpukc
--

CREATE TRIGGER trg_validate_outbox_payload BEFORE INSERT ON business_v2.plutio_outbox FOR EACH ROW EXECUTE FUNCTION business_v2.fn_validate_outbox_payload();


--
-- Name: attachments attachments_interaction_id_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.attachments
    ADD CONSTRAINT attachments_interaction_id_fkey FOREIGN KEY (interaction_id) REFERENCES business_v2.interactions(id);


--
-- Name: document_line_items document_line_items_document_id_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.document_line_items
    ADD CONSTRAINT document_line_items_document_id_fkey FOREIGN KEY (document_id) REFERENCES business_v2.documents(id);


--
-- Name: documents documents_interaction_id_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.documents
    ADD CONSTRAINT documents_interaction_id_fkey FOREIGN KEY (interaction_id) REFERENCES business_v2.interactions(id);


--
-- Name: documents documents_kind_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.documents
    ADD CONSTRAINT documents_kind_fkey FOREIGN KEY (kind) REFERENCES business_v2.document_kinds(key);


--
-- Name: documents documents_party_id_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.documents
    ADD CONSTRAINT documents_party_id_fkey FOREIGN KEY (party_id) REFERENCES business_v2.parties(id);


--
-- Name: documents documents_source_provider_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.documents
    ADD CONSTRAINT documents_source_provider_fkey FOREIGN KEY (source_provider) REFERENCES business_v2.source_providers(key);


--
-- Name: documents documents_status_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.documents
    ADD CONSTRAINT documents_status_fkey FOREIGN KEY (status) REFERENCES business_v2.document_statuses(key);


--
-- Name: engagement_participants engagement_participants_engagement_id_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.engagement_participants
    ADD CONSTRAINT engagement_participants_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES business_v2.engagements(id);


--
-- Name: engagement_participants engagement_participants_participant_role_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.engagement_participants
    ADD CONSTRAINT engagement_participants_participant_role_fkey FOREIGN KEY (participant_role) REFERENCES business_v2.participant_roles(key);


--
-- Name: engagement_participants engagement_participants_party_id_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.engagement_participants
    ADD CONSTRAINT engagement_participants_party_id_fkey FOREIGN KEY (party_id) REFERENCES business_v2.parties(id);


--
-- Name: engagements engagements_kind_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.engagements
    ADD CONSTRAINT engagements_kind_fkey FOREIGN KEY (kind) REFERENCES business_v2.engagement_kinds(key);


--
-- Name: engagements engagements_variant_fk; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.engagements
    ADD CONSTRAINT engagements_variant_fk FOREIGN KEY (program_variant_id) REFERENCES business_v2.program_variants(id);


--
-- Name: interactions interactions_channel_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.interactions
    ADD CONSTRAINT interactions_channel_fkey FOREIGN KEY (channel) REFERENCES business_v2.interaction_channels(key);


--
-- Name: interactions interactions_engagement_id_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.interactions
    ADD CONSTRAINT interactions_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES business_v2.engagements(id);


--
-- Name: interactions interactions_party_id_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.interactions
    ADD CONSTRAINT interactions_party_id_fkey FOREIGN KEY (party_id) REFERENCES business_v2.parties(id);


--
-- Name: interactions interactions_source_provider_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.interactions
    ADD CONSTRAINT interactions_source_provider_fkey FOREIGN KEY (source_provider) REFERENCES business_v2.source_providers(key);


--
-- Name: parties parties_merged_into_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.parties
    ADD CONSTRAINT parties_merged_into_fkey FOREIGN KEY (merged_into) REFERENCES business_v2.parties(id);


--
-- Name: parties parties_source_provider_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.parties
    ADD CONSTRAINT parties_source_provider_fkey FOREIGN KEY (source_provider) REFERENCES business_v2.source_providers(key);


--
-- Name: party_contact_roles party_contact_roles_contact_role_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.party_contact_roles
    ADD CONSTRAINT party_contact_roles_contact_role_fkey FOREIGN KEY (contact_role) REFERENCES business_v2.contact_roles(key);


--
-- Name: party_contact_roles party_contact_roles_for_party_id_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.party_contact_roles
    ADD CONSTRAINT party_contact_roles_for_party_id_fkey FOREIGN KEY (for_party_id) REFERENCES business_v2.parties(id);


--
-- Name: party_contact_roles party_contact_roles_party_id_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.party_contact_roles
    ADD CONSTRAINT party_contact_roles_party_id_fkey FOREIGN KEY (party_id) REFERENCES business_v2.parties(id);


--
-- Name: party_emails party_emails_party_id_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.party_emails
    ADD CONSTRAINT party_emails_party_id_fkey FOREIGN KEY (party_id) REFERENCES business_v2.parties(id);


--
-- Name: party_relationships party_relationships_from_party_id_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.party_relationships
    ADD CONSTRAINT party_relationships_from_party_id_fkey FOREIGN KEY (from_party_id) REFERENCES business_v2.parties(id);


--
-- Name: party_relationships party_relationships_relationship_type_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.party_relationships
    ADD CONSTRAINT party_relationships_relationship_type_fkey FOREIGN KEY (relationship_type) REFERENCES business_v2.relationship_types(key);


--
-- Name: party_relationships party_relationships_to_party_id_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.party_relationships
    ADD CONSTRAINT party_relationships_to_party_id_fkey FOREIGN KEY (to_party_id) REFERENCES business_v2.parties(id);


--
-- Name: party_roles party_roles_party_id_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.party_roles
    ADD CONSTRAINT party_roles_party_id_fkey FOREIGN KEY (party_id) REFERENCES business_v2.parties(id);


--
-- Name: party_roles party_roles_role_type_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.party_roles
    ADD CONSTRAINT party_roles_role_type_fkey FOREIGN KEY (role_type) REFERENCES business_v2.role_types(key);


--
-- Name: pipeline_entries pipeline_entries_party_id_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.pipeline_entries
    ADD CONSTRAINT pipeline_entries_party_id_fkey FOREIGN KEY (party_id) REFERENCES business_v2.parties(id);


--
-- Name: pipeline_entries pipeline_entries_program_id_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.pipeline_entries
    ADD CONSTRAINT pipeline_entries_program_id_fkey FOREIGN KEY (program_id) REFERENCES business_v2.programs(id);


--
-- Name: pipeline_entries pipeline_entries_stage_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.pipeline_entries
    ADD CONSTRAINT pipeline_entries_stage_fkey FOREIGN KEY (stage) REFERENCES business_v2.pipeline_stages(key);


--
-- Name: pipeline_stage_history pipeline_stage_history_pipeline_entry_id_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.pipeline_stage_history
    ADD CONSTRAINT pipeline_stage_history_pipeline_entry_id_fkey FOREIGN KEY (pipeline_entry_id) REFERENCES business_v2.pipeline_entries(id);


--
-- Name: plutio_outbox plutio_outbox_document_id_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.plutio_outbox
    ADD CONSTRAINT plutio_outbox_document_id_fkey FOREIGN KEY (document_id) REFERENCES business_v2.documents(id);


--
-- Name: plutio_outbox plutio_outbox_engagement_id_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.plutio_outbox
    ADD CONSTRAINT plutio_outbox_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES business_v2.engagements(id);


--
-- Name: plutio_outbox plutio_outbox_operation_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.plutio_outbox
    ADD CONSTRAINT plutio_outbox_operation_fkey FOREIGN KEY (operation) REFERENCES business_v2.plutio_outbox_operations(key);


--
-- Name: plutio_outbox plutio_outbox_party_id_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.plutio_outbox
    ADD CONSTRAINT plutio_outbox_party_id_fkey FOREIGN KEY (party_id) REFERENCES business_v2.parties(id);


--
-- Name: plutio_outbox plutio_outbox_status_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.plutio_outbox
    ADD CONSTRAINT plutio_outbox_status_fkey FOREIGN KEY (status) REFERENCES business_v2.plutio_outbox_statuses(key);


--
-- Name: program_variants program_variants_program_id_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.program_variants
    ADD CONSTRAINT program_variants_program_id_fkey FOREIGN KEY (program_id) REFERENCES business_v2.programs(id);


--
-- Name: programs programs_kind_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: nanoclaw_admin
--

ALTER TABLE ONLY business_v2.programs
    ADD CONSTRAINT programs_kind_fkey FOREIGN KEY (kind) REFERENCES business_v2.program_kinds(key);


--
-- Name: variant_enrollments variant_enrollments_engagement_id_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.variant_enrollments
    ADD CONSTRAINT variant_enrollments_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES business_v2.engagements(id);


--
-- Name: variant_enrollments variant_enrollments_variant_id_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: xbohdpukc
--

ALTER TABLE ONLY business_v2.variant_enrollments
    ADD CONSTRAINT variant_enrollments_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES business_v2.program_variants(id);


--
-- Name: webhook_inbox webhook_inbox_party_id_fkey; Type: FK CONSTRAINT; Schema: business_v2; Owner: nanoclaw_admin
--

ALTER TABLE ONLY business_v2.webhook_inbox
    ADD CONSTRAINT webhook_inbox_party_id_fkey FOREIGN KEY (party_id) REFERENCES business_v2.parties(id);


--
-- Name: SCHEMA business_v2; Type: ACL; Schema: -; Owner: nanoclaw_admin
--

GRANT USAGE ON SCHEMA business_v2 TO nanoclaw_booking;
GRANT USAGE ON SCHEMA business_v2 TO nanoclaw_chief;
GRANT USAGE ON SCHEMA business_v2 TO nanoclaw_contador;
GRANT USAGE ON SCHEMA business_v2 TO nanoclaw_inbox;
GRANT USAGE ON SCHEMA business_v2 TO nanoclaw_mailman;
GRANT USAGE ON SCHEMA business_v2 TO nanoclaw_procurement;
GRANT USAGE ON SCHEMA business_v2 TO nanoclaw_readonly;
GRANT USAGE ON SCHEMA business_v2 TO nanoclaw_sales;


--
-- Name: FUNCTION best_party_by_email(p_email public.citext); Type: ACL; Schema: business_v2; Owner: nanoclaw_admin
--

REVOKE ALL ON FUNCTION business_v2.best_party_by_email(p_email public.citext) FROM PUBLIC;
GRANT ALL ON FUNCTION business_v2.best_party_by_email(p_email public.citext) TO nanoclaw_booking;
GRANT ALL ON FUNCTION business_v2.best_party_by_email(p_email public.citext) TO nanoclaw_chief;
GRANT ALL ON FUNCTION business_v2.best_party_by_email(p_email public.citext) TO nanoclaw_contador;
GRANT ALL ON FUNCTION business_v2.best_party_by_email(p_email public.citext) TO nanoclaw_inbox;
GRANT ALL ON FUNCTION business_v2.best_party_by_email(p_email public.citext) TO nanoclaw_mailman;
GRANT ALL ON FUNCTION business_v2.best_party_by_email(p_email public.citext) TO nanoclaw_procurement;
GRANT ALL ON FUNCTION business_v2.best_party_by_email(p_email public.citext) TO nanoclaw_sales;


--
-- Name: FUNCTION canonical_party_id(p_id bigint); Type: ACL; Schema: business_v2; Owner: nanoclaw_admin
--

REVOKE ALL ON FUNCTION business_v2.canonical_party_id(p_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION business_v2.canonical_party_id(p_id bigint) TO nanoclaw_booking;
GRANT ALL ON FUNCTION business_v2.canonical_party_id(p_id bigint) TO nanoclaw_chief;
GRANT ALL ON FUNCTION business_v2.canonical_party_id(p_id bigint) TO nanoclaw_contador;
GRANT ALL ON FUNCTION business_v2.canonical_party_id(p_id bigint) TO nanoclaw_inbox;
GRANT ALL ON FUNCTION business_v2.canonical_party_id(p_id bigint) TO nanoclaw_mailman;
GRANT ALL ON FUNCTION business_v2.canonical_party_id(p_id bigint) TO nanoclaw_procurement;
GRANT ALL ON FUNCTION business_v2.canonical_party_id(p_id bigint) TO nanoclaw_sales;


--
-- Name: FUNCTION fn_add_party_role(p_party_id bigint, p_role_type text); Type: ACL; Schema: business_v2; Owner: nanoclaw_admin
--

GRANT ALL ON FUNCTION business_v2.fn_add_party_role(p_party_id bigint, p_role_type text) TO nanoclaw_booking;
GRANT ALL ON FUNCTION business_v2.fn_add_party_role(p_party_id bigint, p_role_type text) TO nanoclaw_chief;
GRANT ALL ON FUNCTION business_v2.fn_add_party_role(p_party_id bigint, p_role_type text) TO nanoclaw_contador;
GRANT ALL ON FUNCTION business_v2.fn_add_party_role(p_party_id bigint, p_role_type text) TO nanoclaw_inbox;
GRANT ALL ON FUNCTION business_v2.fn_add_party_role(p_party_id bigint, p_role_type text) TO nanoclaw_mailman;
GRANT ALL ON FUNCTION business_v2.fn_add_party_role(p_party_id bigint, p_role_type text) TO nanoclaw_procurement;
GRANT ALL ON FUNCTION business_v2.fn_add_party_role(p_party_id bigint, p_role_type text) TO nanoclaw_sales;


--
-- Name: FUNCTION fn_advance_pipeline_stage(p_entry_id bigint, p_new_stage text, p_reason text); Type: ACL; Schema: business_v2; Owner: nanoclaw_admin
--

REVOKE ALL ON FUNCTION business_v2.fn_advance_pipeline_stage(p_entry_id bigint, p_new_stage text, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION business_v2.fn_advance_pipeline_stage(p_entry_id bigint, p_new_stage text, p_reason text) TO nanoclaw_booking;
GRANT ALL ON FUNCTION business_v2.fn_advance_pipeline_stage(p_entry_id bigint, p_new_stage text, p_reason text) TO nanoclaw_chief;
GRANT ALL ON FUNCTION business_v2.fn_advance_pipeline_stage(p_entry_id bigint, p_new_stage text, p_reason text) TO nanoclaw_contador;
GRANT ALL ON FUNCTION business_v2.fn_advance_pipeline_stage(p_entry_id bigint, p_new_stage text, p_reason text) TO nanoclaw_inbox;
GRANT ALL ON FUNCTION business_v2.fn_advance_pipeline_stage(p_entry_id bigint, p_new_stage text, p_reason text) TO nanoclaw_mailman;
GRANT ALL ON FUNCTION business_v2.fn_advance_pipeline_stage(p_entry_id bigint, p_new_stage text, p_reason text) TO nanoclaw_procurement;
GRANT ALL ON FUNCTION business_v2.fn_advance_pipeline_stage(p_entry_id bigint, p_new_stage text, p_reason text) TO nanoclaw_sales;


--
-- Name: FUNCTION fn_create_party(p_party_type text, p_display_name text, p_email public.citext, p_source_provider text, p_metadata jsonb); Type: ACL; Schema: business_v2; Owner: nanoclaw_admin
--

GRANT ALL ON FUNCTION business_v2.fn_create_party(p_party_type text, p_display_name text, p_email public.citext, p_source_provider text, p_metadata jsonb) TO nanoclaw_booking;
GRANT ALL ON FUNCTION business_v2.fn_create_party(p_party_type text, p_display_name text, p_email public.citext, p_source_provider text, p_metadata jsonb) TO nanoclaw_chief;
GRANT ALL ON FUNCTION business_v2.fn_create_party(p_party_type text, p_display_name text, p_email public.citext, p_source_provider text, p_metadata jsonb) TO nanoclaw_contador;
GRANT ALL ON FUNCTION business_v2.fn_create_party(p_party_type text, p_display_name text, p_email public.citext, p_source_provider text, p_metadata jsonb) TO nanoclaw_inbox;
GRANT ALL ON FUNCTION business_v2.fn_create_party(p_party_type text, p_display_name text, p_email public.citext, p_source_provider text, p_metadata jsonb) TO nanoclaw_mailman;
GRANT ALL ON FUNCTION business_v2.fn_create_party(p_party_type text, p_display_name text, p_email public.citext, p_source_provider text, p_metadata jsonb) TO nanoclaw_procurement;
GRANT ALL ON FUNCTION business_v2.fn_create_party(p_party_type text, p_display_name text, p_email public.citext, p_source_provider text, p_metadata jsonb) TO nanoclaw_sales;


--
-- Name: FUNCTION fn_create_pipeline_entry(p_party_id bigint, p_program_id bigint, p_stage text, p_amount_cents integer, p_currency text, p_metadata jsonb); Type: ACL; Schema: business_v2; Owner: nanoclaw_admin
--

REVOKE ALL ON FUNCTION business_v2.fn_create_pipeline_entry(p_party_id bigint, p_program_id bigint, p_stage text, p_amount_cents integer, p_currency text, p_metadata jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION business_v2.fn_create_pipeline_entry(p_party_id bigint, p_program_id bigint, p_stage text, p_amount_cents integer, p_currency text, p_metadata jsonb) TO nanoclaw_booking;
GRANT ALL ON FUNCTION business_v2.fn_create_pipeline_entry(p_party_id bigint, p_program_id bigint, p_stage text, p_amount_cents integer, p_currency text, p_metadata jsonb) TO nanoclaw_chief;
GRANT ALL ON FUNCTION business_v2.fn_create_pipeline_entry(p_party_id bigint, p_program_id bigint, p_stage text, p_amount_cents integer, p_currency text, p_metadata jsonb) TO nanoclaw_contador;
GRANT ALL ON FUNCTION business_v2.fn_create_pipeline_entry(p_party_id bigint, p_program_id bigint, p_stage text, p_amount_cents integer, p_currency text, p_metadata jsonb) TO nanoclaw_inbox;
GRANT ALL ON FUNCTION business_v2.fn_create_pipeline_entry(p_party_id bigint, p_program_id bigint, p_stage text, p_amount_cents integer, p_currency text, p_metadata jsonb) TO nanoclaw_mailman;
GRANT ALL ON FUNCTION business_v2.fn_create_pipeline_entry(p_party_id bigint, p_program_id bigint, p_stage text, p_amount_cents integer, p_currency text, p_metadata jsonb) TO nanoclaw_procurement;
GRANT ALL ON FUNCTION business_v2.fn_create_pipeline_entry(p_party_id bigint, p_program_id bigint, p_stage text, p_amount_cents integer, p_currency text, p_metadata jsonb) TO nanoclaw_sales;


--
-- Name: FUNCTION fn_issue_document(p_party_id bigint, p_kind text, p_amount_cents integer, p_currency text, p_metadata jsonb); Type: ACL; Schema: business_v2; Owner: nanoclaw_admin
--

REVOKE ALL ON FUNCTION business_v2.fn_issue_document(p_party_id bigint, p_kind text, p_amount_cents integer, p_currency text, p_metadata jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION business_v2.fn_issue_document(p_party_id bigint, p_kind text, p_amount_cents integer, p_currency text, p_metadata jsonb) TO nanoclaw_booking;
GRANT ALL ON FUNCTION business_v2.fn_issue_document(p_party_id bigint, p_kind text, p_amount_cents integer, p_currency text, p_metadata jsonb) TO nanoclaw_chief;
GRANT ALL ON FUNCTION business_v2.fn_issue_document(p_party_id bigint, p_kind text, p_amount_cents integer, p_currency text, p_metadata jsonb) TO nanoclaw_contador;
GRANT ALL ON FUNCTION business_v2.fn_issue_document(p_party_id bigint, p_kind text, p_amount_cents integer, p_currency text, p_metadata jsonb) TO nanoclaw_inbox;
GRANT ALL ON FUNCTION business_v2.fn_issue_document(p_party_id bigint, p_kind text, p_amount_cents integer, p_currency text, p_metadata jsonb) TO nanoclaw_mailman;
GRANT ALL ON FUNCTION business_v2.fn_issue_document(p_party_id bigint, p_kind text, p_amount_cents integer, p_currency text, p_metadata jsonb) TO nanoclaw_procurement;
GRANT ALL ON FUNCTION business_v2.fn_issue_document(p_party_id bigint, p_kind text, p_amount_cents integer, p_currency text, p_metadata jsonb) TO nanoclaw_sales;


--
-- Name: FUNCTION fn_log_interaction(p_party_id bigint, p_channel text, p_direction text, p_subject text, p_occurred_at timestamp with time zone, p_metadata jsonb); Type: ACL; Schema: business_v2; Owner: nanoclaw_admin
--

REVOKE ALL ON FUNCTION business_v2.fn_log_interaction(p_party_id bigint, p_channel text, p_direction text, p_subject text, p_occurred_at timestamp with time zone, p_metadata jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION business_v2.fn_log_interaction(p_party_id bigint, p_channel text, p_direction text, p_subject text, p_occurred_at timestamp with time zone, p_metadata jsonb) TO nanoclaw_booking;
GRANT ALL ON FUNCTION business_v2.fn_log_interaction(p_party_id bigint, p_channel text, p_direction text, p_subject text, p_occurred_at timestamp with time zone, p_metadata jsonb) TO nanoclaw_chief;
GRANT ALL ON FUNCTION business_v2.fn_log_interaction(p_party_id bigint, p_channel text, p_direction text, p_subject text, p_occurred_at timestamp with time zone, p_metadata jsonb) TO nanoclaw_contador;
GRANT ALL ON FUNCTION business_v2.fn_log_interaction(p_party_id bigint, p_channel text, p_direction text, p_subject text, p_occurred_at timestamp with time zone, p_metadata jsonb) TO nanoclaw_inbox;
GRANT ALL ON FUNCTION business_v2.fn_log_interaction(p_party_id bigint, p_channel text, p_direction text, p_subject text, p_occurred_at timestamp with time zone, p_metadata jsonb) TO nanoclaw_mailman;
GRANT ALL ON FUNCTION business_v2.fn_log_interaction(p_party_id bigint, p_channel text, p_direction text, p_subject text, p_occurred_at timestamp with time zone, p_metadata jsonb) TO nanoclaw_procurement;
GRANT ALL ON FUNCTION business_v2.fn_log_interaction(p_party_id bigint, p_channel text, p_direction text, p_subject text, p_occurred_at timestamp with time zone, p_metadata jsonb) TO nanoclaw_sales;


--
-- Name: FUNCTION fn_log_interaction_dedup(p_party_id bigint, p_channel text, p_direction text, p_subject text, p_occurred_at timestamp with time zone, p_metadata jsonb, p_source_provider text, p_source_id text); Type: ACL; Schema: business_v2; Owner: nanoclaw_admin
--

GRANT ALL ON FUNCTION business_v2.fn_log_interaction_dedup(p_party_id bigint, p_channel text, p_direction text, p_subject text, p_occurred_at timestamp with time zone, p_metadata jsonb, p_source_provider text, p_source_id text) TO nanoclaw_booking;
GRANT ALL ON FUNCTION business_v2.fn_log_interaction_dedup(p_party_id bigint, p_channel text, p_direction text, p_subject text, p_occurred_at timestamp with time zone, p_metadata jsonb, p_source_provider text, p_source_id text) TO nanoclaw_chief;
GRANT ALL ON FUNCTION business_v2.fn_log_interaction_dedup(p_party_id bigint, p_channel text, p_direction text, p_subject text, p_occurred_at timestamp with time zone, p_metadata jsonb, p_source_provider text, p_source_id text) TO nanoclaw_contador;
GRANT ALL ON FUNCTION business_v2.fn_log_interaction_dedup(p_party_id bigint, p_channel text, p_direction text, p_subject text, p_occurred_at timestamp with time zone, p_metadata jsonb, p_source_provider text, p_source_id text) TO nanoclaw_inbox;
GRANT ALL ON FUNCTION business_v2.fn_log_interaction_dedup(p_party_id bigint, p_channel text, p_direction text, p_subject text, p_occurred_at timestamp with time zone, p_metadata jsonb, p_source_provider text, p_source_id text) TO nanoclaw_mailman;
GRANT ALL ON FUNCTION business_v2.fn_log_interaction_dedup(p_party_id bigint, p_channel text, p_direction text, p_subject text, p_occurred_at timestamp with time zone, p_metadata jsonb, p_source_provider text, p_source_id text) TO nanoclaw_procurement;
GRANT ALL ON FUNCTION business_v2.fn_log_interaction_dedup(p_party_id bigint, p_channel text, p_direction text, p_subject text, p_occurred_at timestamp with time zone, p_metadata jsonb, p_source_provider text, p_source_id text) TO nanoclaw_sales;


--
-- Name: FUNCTION fn_merge_parties(p_loser bigint, p_winner bigint, p_reason text); Type: ACL; Schema: business_v2; Owner: nanoclaw_admin
--

REVOKE ALL ON FUNCTION business_v2.fn_merge_parties(p_loser bigint, p_winner bigint, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION business_v2.fn_merge_parties(p_loser bigint, p_winner bigint, p_reason text) TO nanoclaw_booking;
GRANT ALL ON FUNCTION business_v2.fn_merge_parties(p_loser bigint, p_winner bigint, p_reason text) TO nanoclaw_chief;
GRANT ALL ON FUNCTION business_v2.fn_merge_parties(p_loser bigint, p_winner bigint, p_reason text) TO nanoclaw_contador;
GRANT ALL ON FUNCTION business_v2.fn_merge_parties(p_loser bigint, p_winner bigint, p_reason text) TO nanoclaw_inbox;
GRANT ALL ON FUNCTION business_v2.fn_merge_parties(p_loser bigint, p_winner bigint, p_reason text) TO nanoclaw_mailman;
GRANT ALL ON FUNCTION business_v2.fn_merge_parties(p_loser bigint, p_winner bigint, p_reason text) TO nanoclaw_procurement;
GRANT ALL ON FUNCTION business_v2.fn_merge_parties(p_loser bigint, p_winner bigint, p_reason text) TO nanoclaw_sales;


--
-- Name: FUNCTION fn_pipeline_stage_history(); Type: ACL; Schema: business_v2; Owner: nanoclaw_admin
--

REVOKE ALL ON FUNCTION business_v2.fn_pipeline_stage_history() FROM PUBLIC;


--
-- Name: FUNCTION fn_reject_writes_to_merged_from_party(); Type: ACL; Schema: business_v2; Owner: nanoclaw_admin
--

REVOKE ALL ON FUNCTION business_v2.fn_reject_writes_to_merged_from_party() FROM PUBLIC;


--
-- Name: FUNCTION fn_reject_writes_to_merged_party(); Type: ACL; Schema: business_v2; Owner: nanoclaw_admin
--

REVOKE ALL ON FUNCTION business_v2.fn_reject_writes_to_merged_party() FROM PUBLIC;


--
-- Name: FUNCTION fn_reject_writes_to_merged_to_party(); Type: ACL; Schema: business_v2; Owner: nanoclaw_admin
--

REVOKE ALL ON FUNCTION business_v2.fn_reject_writes_to_merged_to_party() FROM PUBLIC;


--
-- Name: FUNCTION fn_validate_outbox_payload(); Type: ACL; Schema: business_v2; Owner: nanoclaw_admin
--

REVOKE ALL ON FUNCTION business_v2.fn_validate_outbox_payload() FROM PUBLIC;


--
-- Name: FUNCTION resolve_parties_by_email(p_email public.citext); Type: ACL; Schema: business_v2; Owner: nanoclaw_admin
--

REVOKE ALL ON FUNCTION business_v2.resolve_parties_by_email(p_email public.citext) FROM PUBLIC;
GRANT ALL ON FUNCTION business_v2.resolve_parties_by_email(p_email public.citext) TO nanoclaw_booking;
GRANT ALL ON FUNCTION business_v2.resolve_parties_by_email(p_email public.citext) TO nanoclaw_chief;
GRANT ALL ON FUNCTION business_v2.resolve_parties_by_email(p_email public.citext) TO nanoclaw_contador;
GRANT ALL ON FUNCTION business_v2.resolve_parties_by_email(p_email public.citext) TO nanoclaw_inbox;
GRANT ALL ON FUNCTION business_v2.resolve_parties_by_email(p_email public.citext) TO nanoclaw_mailman;
GRANT ALL ON FUNCTION business_v2.resolve_parties_by_email(p_email public.citext) TO nanoclaw_procurement;
GRANT ALL ON FUNCTION business_v2.resolve_parties_by_email(p_email public.citext) TO nanoclaw_sales;


--
-- Name: FUNCTION update_timestamp(); Type: ACL; Schema: business_v2; Owner: nanoclaw_admin
--

REVOKE ALL ON FUNCTION business_v2.update_timestamp() FROM PUBLIC;


--
-- Name: TABLE attachments; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.attachments TO nanoclaw_admin;


--
-- Name: SEQUENCE attachments_id_seq; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON SEQUENCE business_v2.attachments_id_seq TO nanoclaw_admin;


--
-- Name: TABLE contact_roles; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.contact_roles TO nanoclaw_admin;
GRANT SELECT ON TABLE business_v2.contact_roles TO nanoclaw_readonly;
GRANT SELECT ON TABLE business_v2.contact_roles TO nanoclaw_booking;
GRANT SELECT ON TABLE business_v2.contact_roles TO nanoclaw_chief;
GRANT SELECT ON TABLE business_v2.contact_roles TO nanoclaw_contador;
GRANT SELECT ON TABLE business_v2.contact_roles TO nanoclaw_inbox;
GRANT SELECT ON TABLE business_v2.contact_roles TO nanoclaw_mailman;
GRANT SELECT ON TABLE business_v2.contact_roles TO nanoclaw_procurement;
GRANT SELECT ON TABLE business_v2.contact_roles TO nanoclaw_sales;


--
-- Name: TABLE document_kinds; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.document_kinds TO nanoclaw_admin;
GRANT SELECT ON TABLE business_v2.document_kinds TO nanoclaw_readonly;
GRANT SELECT ON TABLE business_v2.document_kinds TO nanoclaw_booking;
GRANT SELECT ON TABLE business_v2.document_kinds TO nanoclaw_chief;
GRANT SELECT ON TABLE business_v2.document_kinds TO nanoclaw_contador;
GRANT SELECT ON TABLE business_v2.document_kinds TO nanoclaw_inbox;
GRANT SELECT ON TABLE business_v2.document_kinds TO nanoclaw_mailman;
GRANT SELECT ON TABLE business_v2.document_kinds TO nanoclaw_procurement;
GRANT SELECT ON TABLE business_v2.document_kinds TO nanoclaw_sales;


--
-- Name: TABLE document_line_items; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.document_line_items TO nanoclaw_admin;


--
-- Name: SEQUENCE document_line_items_id_seq; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON SEQUENCE business_v2.document_line_items_id_seq TO nanoclaw_admin;


--
-- Name: TABLE document_statuses; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.document_statuses TO nanoclaw_admin;
GRANT SELECT ON TABLE business_v2.document_statuses TO nanoclaw_readonly;
GRANT SELECT ON TABLE business_v2.document_statuses TO nanoclaw_booking;
GRANT SELECT ON TABLE business_v2.document_statuses TO nanoclaw_chief;
GRANT SELECT ON TABLE business_v2.document_statuses TO nanoclaw_contador;
GRANT SELECT ON TABLE business_v2.document_statuses TO nanoclaw_inbox;
GRANT SELECT ON TABLE business_v2.document_statuses TO nanoclaw_mailman;
GRANT SELECT ON TABLE business_v2.document_statuses TO nanoclaw_procurement;
GRANT SELECT ON TABLE business_v2.document_statuses TO nanoclaw_sales;


--
-- Name: TABLE documents; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.documents TO nanoclaw_admin;


--
-- Name: SEQUENCE documents_id_seq; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON SEQUENCE business_v2.documents_id_seq TO nanoclaw_admin;


--
-- Name: TABLE engagement_kinds; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.engagement_kinds TO nanoclaw_admin;
GRANT SELECT ON TABLE business_v2.engagement_kinds TO nanoclaw_readonly;
GRANT SELECT ON TABLE business_v2.engagement_kinds TO nanoclaw_booking;
GRANT SELECT ON TABLE business_v2.engagement_kinds TO nanoclaw_chief;
GRANT SELECT ON TABLE business_v2.engagement_kinds TO nanoclaw_contador;
GRANT SELECT ON TABLE business_v2.engagement_kinds TO nanoclaw_inbox;
GRANT SELECT ON TABLE business_v2.engagement_kinds TO nanoclaw_mailman;
GRANT SELECT ON TABLE business_v2.engagement_kinds TO nanoclaw_procurement;
GRANT SELECT ON TABLE business_v2.engagement_kinds TO nanoclaw_sales;


--
-- Name: TABLE engagement_participants; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.engagement_participants TO nanoclaw_admin;


--
-- Name: SEQUENCE engagement_participants_id_seq; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON SEQUENCE business_v2.engagement_participants_id_seq TO nanoclaw_admin;


--
-- Name: TABLE engagements; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.engagements TO nanoclaw_admin;


--
-- Name: SEQUENCE engagements_id_seq; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON SEQUENCE business_v2.engagements_id_seq TO nanoclaw_admin;


--
-- Name: TABLE interaction_channels; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.interaction_channels TO nanoclaw_admin;
GRANT SELECT ON TABLE business_v2.interaction_channels TO nanoclaw_readonly;
GRANT SELECT ON TABLE business_v2.interaction_channels TO nanoclaw_booking;
GRANT SELECT ON TABLE business_v2.interaction_channels TO nanoclaw_chief;
GRANT SELECT ON TABLE business_v2.interaction_channels TO nanoclaw_contador;
GRANT SELECT ON TABLE business_v2.interaction_channels TO nanoclaw_inbox;
GRANT SELECT ON TABLE business_v2.interaction_channels TO nanoclaw_mailman;
GRANT SELECT ON TABLE business_v2.interaction_channels TO nanoclaw_procurement;
GRANT SELECT ON TABLE business_v2.interaction_channels TO nanoclaw_sales;


--
-- Name: TABLE interactions; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.interactions TO nanoclaw_admin;


--
-- Name: SEQUENCE interactions_id_seq; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON SEQUENCE business_v2.interactions_id_seq TO nanoclaw_admin;


--
-- Name: TABLE lost_reasons; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.lost_reasons TO nanoclaw_admin;
GRANT SELECT ON TABLE business_v2.lost_reasons TO nanoclaw_readonly;
GRANT SELECT ON TABLE business_v2.lost_reasons TO nanoclaw_booking;
GRANT SELECT ON TABLE business_v2.lost_reasons TO nanoclaw_chief;
GRANT SELECT ON TABLE business_v2.lost_reasons TO nanoclaw_contador;
GRANT SELECT ON TABLE business_v2.lost_reasons TO nanoclaw_inbox;
GRANT SELECT ON TABLE business_v2.lost_reasons TO nanoclaw_mailman;
GRANT SELECT ON TABLE business_v2.lost_reasons TO nanoclaw_procurement;
GRANT SELECT ON TABLE business_v2.lost_reasons TO nanoclaw_sales;


--
-- Name: TABLE participant_roles; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.participant_roles TO nanoclaw_admin;
GRANT SELECT ON TABLE business_v2.participant_roles TO nanoclaw_readonly;
GRANT SELECT ON TABLE business_v2.participant_roles TO nanoclaw_booking;
GRANT SELECT ON TABLE business_v2.participant_roles TO nanoclaw_chief;
GRANT SELECT ON TABLE business_v2.participant_roles TO nanoclaw_contador;
GRANT SELECT ON TABLE business_v2.participant_roles TO nanoclaw_inbox;
GRANT SELECT ON TABLE business_v2.participant_roles TO nanoclaw_mailman;
GRANT SELECT ON TABLE business_v2.participant_roles TO nanoclaw_procurement;
GRANT SELECT ON TABLE business_v2.participant_roles TO nanoclaw_sales;


--
-- Name: TABLE parties; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.parties TO nanoclaw_admin;


--
-- Name: SEQUENCE parties_id_seq; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON SEQUENCE business_v2.parties_id_seq TO nanoclaw_admin;


--
-- Name: TABLE party_contact_roles; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.party_contact_roles TO nanoclaw_admin;


--
-- Name: TABLE party_emails; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.party_emails TO nanoclaw_admin;


--
-- Name: TABLE party_relationships; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.party_relationships TO nanoclaw_admin;


--
-- Name: SEQUENCE party_relationships_id_seq; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON SEQUENCE business_v2.party_relationships_id_seq TO nanoclaw_admin;


--
-- Name: TABLE party_roles; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.party_roles TO nanoclaw_admin;


--
-- Name: SEQUENCE party_roles_id_seq; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON SEQUENCE business_v2.party_roles_id_seq TO nanoclaw_admin;


--
-- Name: TABLE pipeline_entries; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.pipeline_entries TO nanoclaw_admin;


--
-- Name: SEQUENCE pipeline_entries_id_seq; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON SEQUENCE business_v2.pipeline_entries_id_seq TO nanoclaw_admin;


--
-- Name: TABLE pipeline_stage_history; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.pipeline_stage_history TO nanoclaw_admin;


--
-- Name: SEQUENCE pipeline_stage_history_id_seq; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON SEQUENCE business_v2.pipeline_stage_history_id_seq TO nanoclaw_admin;


--
-- Name: TABLE pipeline_stages; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.pipeline_stages TO nanoclaw_admin;
GRANT SELECT ON TABLE business_v2.pipeline_stages TO nanoclaw_readonly;
GRANT SELECT ON TABLE business_v2.pipeline_stages TO nanoclaw_booking;
GRANT SELECT ON TABLE business_v2.pipeline_stages TO nanoclaw_chief;
GRANT SELECT ON TABLE business_v2.pipeline_stages TO nanoclaw_contador;
GRANT SELECT ON TABLE business_v2.pipeline_stages TO nanoclaw_inbox;
GRANT SELECT ON TABLE business_v2.pipeline_stages TO nanoclaw_mailman;
GRANT SELECT ON TABLE business_v2.pipeline_stages TO nanoclaw_procurement;
GRANT SELECT ON TABLE business_v2.pipeline_stages TO nanoclaw_sales;


--
-- Name: TABLE plutio_outbox; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.plutio_outbox TO nanoclaw_admin;


--
-- Name: SEQUENCE plutio_outbox_id_seq; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON SEQUENCE business_v2.plutio_outbox_id_seq TO nanoclaw_admin;


--
-- Name: TABLE plutio_outbox_operations; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.plutio_outbox_operations TO nanoclaw_admin;
GRANT SELECT ON TABLE business_v2.plutio_outbox_operations TO nanoclaw_readonly;
GRANT SELECT ON TABLE business_v2.plutio_outbox_operations TO nanoclaw_booking;
GRANT SELECT ON TABLE business_v2.plutio_outbox_operations TO nanoclaw_chief;
GRANT SELECT ON TABLE business_v2.plutio_outbox_operations TO nanoclaw_contador;
GRANT SELECT ON TABLE business_v2.plutio_outbox_operations TO nanoclaw_inbox;
GRANT SELECT ON TABLE business_v2.plutio_outbox_operations TO nanoclaw_mailman;
GRANT SELECT ON TABLE business_v2.plutio_outbox_operations TO nanoclaw_procurement;
GRANT SELECT ON TABLE business_v2.plutio_outbox_operations TO nanoclaw_sales;


--
-- Name: TABLE plutio_outbox_statuses; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.plutio_outbox_statuses TO nanoclaw_admin;
GRANT SELECT ON TABLE business_v2.plutio_outbox_statuses TO nanoclaw_readonly;
GRANT SELECT ON TABLE business_v2.plutio_outbox_statuses TO nanoclaw_booking;
GRANT SELECT ON TABLE business_v2.plutio_outbox_statuses TO nanoclaw_chief;
GRANT SELECT ON TABLE business_v2.plutio_outbox_statuses TO nanoclaw_contador;
GRANT SELECT ON TABLE business_v2.plutio_outbox_statuses TO nanoclaw_inbox;
GRANT SELECT ON TABLE business_v2.plutio_outbox_statuses TO nanoclaw_mailman;
GRANT SELECT ON TABLE business_v2.plutio_outbox_statuses TO nanoclaw_procurement;
GRANT SELECT ON TABLE business_v2.plutio_outbox_statuses TO nanoclaw_sales;


--
-- Name: TABLE plutio_refs; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.plutio_refs TO nanoclaw_admin;


--
-- Name: TABLE program_kinds; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.program_kinds TO nanoclaw_admin;
GRANT SELECT ON TABLE business_v2.program_kinds TO nanoclaw_readonly;
GRANT SELECT ON TABLE business_v2.program_kinds TO nanoclaw_booking;
GRANT SELECT ON TABLE business_v2.program_kinds TO nanoclaw_chief;
GRANT SELECT ON TABLE business_v2.program_kinds TO nanoclaw_contador;
GRANT SELECT ON TABLE business_v2.program_kinds TO nanoclaw_inbox;
GRANT SELECT ON TABLE business_v2.program_kinds TO nanoclaw_mailman;
GRANT SELECT ON TABLE business_v2.program_kinds TO nanoclaw_procurement;
GRANT SELECT ON TABLE business_v2.program_kinds TO nanoclaw_sales;


--
-- Name: TABLE program_variants; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.program_variants TO nanoclaw_admin;


--
-- Name: SEQUENCE program_variants_id_seq; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON SEQUENCE business_v2.program_variants_id_seq TO nanoclaw_admin;


--
-- Name: TABLE programs; Type: ACL; Schema: business_v2; Owner: nanoclaw_admin
--

GRANT SELECT ON TABLE business_v2.programs TO nanoclaw_booking;
GRANT SELECT ON TABLE business_v2.programs TO nanoclaw_chief;
GRANT SELECT ON TABLE business_v2.programs TO nanoclaw_contador;
GRANT SELECT ON TABLE business_v2.programs TO nanoclaw_inbox;
GRANT SELECT ON TABLE business_v2.programs TO nanoclaw_mailman;
GRANT SELECT ON TABLE business_v2.programs TO nanoclaw_procurement;
GRANT SELECT ON TABLE business_v2.programs TO nanoclaw_sales;
GRANT SELECT ON TABLE business_v2.programs TO nanoclaw_readonly;


--
-- Name: TABLE relationship_types; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.relationship_types TO nanoclaw_admin;
GRANT SELECT ON TABLE business_v2.relationship_types TO nanoclaw_readonly;
GRANT SELECT ON TABLE business_v2.relationship_types TO nanoclaw_booking;
GRANT SELECT ON TABLE business_v2.relationship_types TO nanoclaw_chief;
GRANT SELECT ON TABLE business_v2.relationship_types TO nanoclaw_contador;
GRANT SELECT ON TABLE business_v2.relationship_types TO nanoclaw_inbox;
GRANT SELECT ON TABLE business_v2.relationship_types TO nanoclaw_mailman;
GRANT SELECT ON TABLE business_v2.relationship_types TO nanoclaw_procurement;
GRANT SELECT ON TABLE business_v2.relationship_types TO nanoclaw_sales;


--
-- Name: TABLE role_types; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.role_types TO nanoclaw_admin;
GRANT SELECT ON TABLE business_v2.role_types TO nanoclaw_readonly;
GRANT SELECT ON TABLE business_v2.role_types TO nanoclaw_booking;
GRANT SELECT ON TABLE business_v2.role_types TO nanoclaw_chief;
GRANT SELECT ON TABLE business_v2.role_types TO nanoclaw_contador;
GRANT SELECT ON TABLE business_v2.role_types TO nanoclaw_inbox;
GRANT SELECT ON TABLE business_v2.role_types TO nanoclaw_mailman;
GRANT SELECT ON TABLE business_v2.role_types TO nanoclaw_procurement;
GRANT SELECT ON TABLE business_v2.role_types TO nanoclaw_sales;


--
-- Name: TABLE source_providers; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.source_providers TO nanoclaw_admin;
GRANT SELECT ON TABLE business_v2.source_providers TO nanoclaw_readonly;
GRANT SELECT ON TABLE business_v2.source_providers TO nanoclaw_booking;
GRANT SELECT ON TABLE business_v2.source_providers TO nanoclaw_chief;
GRANT SELECT ON TABLE business_v2.source_providers TO nanoclaw_contador;
GRANT SELECT ON TABLE business_v2.source_providers TO nanoclaw_inbox;
GRANT SELECT ON TABLE business_v2.source_providers TO nanoclaw_mailman;
GRANT SELECT ON TABLE business_v2.source_providers TO nanoclaw_procurement;
GRANT SELECT ON TABLE business_v2.source_providers TO nanoclaw_sales;


--
-- Name: TABLE v_active_engagements; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.v_active_engagements TO nanoclaw_admin;
GRANT SELECT ON TABLE business_v2.v_active_engagements TO nanoclaw_readonly;
GRANT SELECT ON TABLE business_v2.v_active_engagements TO nanoclaw_booking;
GRANT SELECT ON TABLE business_v2.v_active_engagements TO nanoclaw_chief;
GRANT SELECT ON TABLE business_v2.v_active_engagements TO nanoclaw_contador;
GRANT SELECT ON TABLE business_v2.v_active_engagements TO nanoclaw_inbox;
GRANT SELECT ON TABLE business_v2.v_active_engagements TO nanoclaw_mailman;
GRANT SELECT ON TABLE business_v2.v_active_engagements TO nanoclaw_procurement;
GRANT SELECT ON TABLE business_v2.v_active_engagements TO nanoclaw_sales;


--
-- Name: TABLE v_active_pipeline; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.v_active_pipeline TO nanoclaw_admin;
GRANT SELECT ON TABLE business_v2.v_active_pipeline TO nanoclaw_readonly;
GRANT SELECT ON TABLE business_v2.v_active_pipeline TO nanoclaw_booking;
GRANT SELECT ON TABLE business_v2.v_active_pipeline TO nanoclaw_chief;
GRANT SELECT ON TABLE business_v2.v_active_pipeline TO nanoclaw_contador;
GRANT SELECT ON TABLE business_v2.v_active_pipeline TO nanoclaw_inbox;
GRANT SELECT ON TABLE business_v2.v_active_pipeline TO nanoclaw_mailman;
GRANT SELECT ON TABLE business_v2.v_active_pipeline TO nanoclaw_procurement;
GRANT SELECT ON TABLE business_v2.v_active_pipeline TO nanoclaw_sales;


--
-- Name: TABLE v_client_status; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.v_client_status TO nanoclaw_admin;
GRANT SELECT ON TABLE business_v2.v_client_status TO nanoclaw_readonly;
GRANT SELECT ON TABLE business_v2.v_client_status TO nanoclaw_booking;
GRANT SELECT ON TABLE business_v2.v_client_status TO nanoclaw_chief;
GRANT SELECT ON TABLE business_v2.v_client_status TO nanoclaw_contador;
GRANT SELECT ON TABLE business_v2.v_client_status TO nanoclaw_inbox;
GRANT SELECT ON TABLE business_v2.v_client_status TO nanoclaw_mailman;
GRANT SELECT ON TABLE business_v2.v_client_status TO nanoclaw_procurement;
GRANT SELECT ON TABLE business_v2.v_client_status TO nanoclaw_sales;


--
-- Name: TABLE v_party_contact_card; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.v_party_contact_card TO nanoclaw_admin;
GRANT SELECT ON TABLE business_v2.v_party_contact_card TO nanoclaw_readonly;
GRANT SELECT ON TABLE business_v2.v_party_contact_card TO nanoclaw_booking;
GRANT SELECT ON TABLE business_v2.v_party_contact_card TO nanoclaw_chief;
GRANT SELECT ON TABLE business_v2.v_party_contact_card TO nanoclaw_contador;
GRANT SELECT ON TABLE business_v2.v_party_contact_card TO nanoclaw_inbox;
GRANT SELECT ON TABLE business_v2.v_party_contact_card TO nanoclaw_mailman;
GRANT SELECT ON TABLE business_v2.v_party_contact_card TO nanoclaw_procurement;
GRANT SELECT ON TABLE business_v2.v_party_contact_card TO nanoclaw_sales;


--
-- Name: TABLE v_party_timeline; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.v_party_timeline TO nanoclaw_admin;
GRANT SELECT ON TABLE business_v2.v_party_timeline TO nanoclaw_readonly;
GRANT SELECT ON TABLE business_v2.v_party_timeline TO nanoclaw_booking;
GRANT SELECT ON TABLE business_v2.v_party_timeline TO nanoclaw_chief;
GRANT SELECT ON TABLE business_v2.v_party_timeline TO nanoclaw_contador;
GRANT SELECT ON TABLE business_v2.v_party_timeline TO nanoclaw_inbox;
GRANT SELECT ON TABLE business_v2.v_party_timeline TO nanoclaw_mailman;
GRANT SELECT ON TABLE business_v2.v_party_timeline TO nanoclaw_procurement;
GRANT SELECT ON TABLE business_v2.v_party_timeline TO nanoclaw_sales;


--
-- Name: TABLE v_program_variant_seats; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.v_program_variant_seats TO nanoclaw_admin;
GRANT SELECT ON TABLE business_v2.v_program_variant_seats TO nanoclaw_readonly;
GRANT SELECT ON TABLE business_v2.v_program_variant_seats TO nanoclaw_booking;
GRANT SELECT ON TABLE business_v2.v_program_variant_seats TO nanoclaw_chief;
GRANT SELECT ON TABLE business_v2.v_program_variant_seats TO nanoclaw_contador;
GRANT SELECT ON TABLE business_v2.v_program_variant_seats TO nanoclaw_inbox;
GRANT SELECT ON TABLE business_v2.v_program_variant_seats TO nanoclaw_mailman;
GRANT SELECT ON TABLE business_v2.v_program_variant_seats TO nanoclaw_procurement;
GRANT SELECT ON TABLE business_v2.v_program_variant_seats TO nanoclaw_sales;


--
-- Name: TABLE variant_enrollments; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON TABLE business_v2.variant_enrollments TO nanoclaw_admin;


--
-- Name: SEQUENCE variant_enrollments_id_seq; Type: ACL; Schema: business_v2; Owner: xbohdpukc
--

GRANT ALL ON SEQUENCE business_v2.variant_enrollments_id_seq TO nanoclaw_admin;


--
-- PostgreSQL database dump complete
--

\unrestrict tSLILQYJyC1cvNNQYPK7zKR1xrj3OaDJXBT0SUWrkAjmxboo1yckojRtaM8NSwV

