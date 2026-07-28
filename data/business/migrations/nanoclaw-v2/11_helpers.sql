-- 11_helpers.sql — 14 functions (8 callable + 6 trigger)
-- Part of NanoClaw Schema v2 Migration (Plan #1 of 4)
-- Depends: T3-T10 (all base tables)
--
-- Conventions:
--   Callable helpers: DROP FUNCTION IF EXISTS <full sig>; CREATE FUNCTION ... SECURITY DEFINER
--   Trigger functions: CREATE OR REPLACE FUNCTION ... RETURNS trigger
--   Session vars: app.current_agent, app.run_id, app.correlation_id, app.current_reason, app.backfill_mode
--   All functions: ALTER FUNCTION ... OWNER TO nanoclaw_admin (PMT-1)

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

----------------------------------------------------------------------
-- 1. canonical_party_id(bigint) RETURNS bigint
-- Recursive CTE walk of merged_into chain, depth-limit 10, cycle-detecting.
----------------------------------------------------------------------
DROP FUNCTION IF EXISTS business_v2.canonical_party_id(bigint);

CREATE FUNCTION business_v2.canonical_party_id(p_id bigint)
RETURNS bigint
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

ALTER FUNCTION business_v2.canonical_party_id(bigint) OWNER TO nanoclaw_admin;

----------------------------------------------------------------------
-- 2. resolve_parties_by_email(citext) RETURNS SETOF bigint
----------------------------------------------------------------------
DROP FUNCTION IF EXISTS business_v2.resolve_parties_by_email(citext);

CREATE FUNCTION business_v2.resolve_parties_by_email(p_email citext)
RETURNS SETOF bigint
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT DISTINCT business_v2.canonical_party_id(pe.party_id)
  FROM business_v2.party_emails pe
  WHERE pe.email = p_email;
$$;

ALTER FUNCTION business_v2.resolve_parties_by_email(citext) OWNER TO nanoclaw_admin;

----------------------------------------------------------------------
-- 3. best_party_by_email(citext) RETURNS bigint
----------------------------------------------------------------------
DROP FUNCTION IF EXISTS business_v2.best_party_by_email(citext);

CREATE FUNCTION business_v2.best_party_by_email(p_email citext)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT business_v2.canonical_party_id(pe.party_id)
  FROM business_v2.party_emails pe
  WHERE pe.email = p_email
  ORDER BY pe.is_primary DESC, pe.verified_at DESC NULLS LAST, pe.party_id ASC
  LIMIT 1;
$$;

ALTER FUNCTION business_v2.best_party_by_email(citext) OWNER TO nanoclaw_admin;

----------------------------------------------------------------------
-- 4. fn_merge_parties(bigint, bigint, text) RETURNS void
-- Merges loser→winner: redirects all child FKs, tombstones loser, emits outbox.
----------------------------------------------------------------------
DROP FUNCTION IF EXISTS business_v2.fn_merge_parties(bigint, bigint, text);

CREATE FUNCTION business_v2.fn_merge_parties(
  p_loser bigint,
  p_winner bigint,
  p_reason text
)
RETURNS void
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

ALTER FUNCTION business_v2.fn_merge_parties(bigint, bigint, text) OWNER TO nanoclaw_admin;

----------------------------------------------------------------------
-- 5. fn_issue_document(bigint, text, int, text, jsonb) RETURNS bigint
-- Atomic: canonicalizes party, INSERTS document + interaction + outbox.
----------------------------------------------------------------------
DROP FUNCTION IF EXISTS business_v2.fn_issue_document(bigint, text, int, text, jsonb);

CREATE FUNCTION business_v2.fn_issue_document(
  p_party_id bigint,
  p_kind text,
  p_amount_cents int,
  p_currency text,
  p_metadata jsonb
)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_canonical bigint;
  v_doc_id bigint;
  v_agent text;
BEGIN
  v_agent := COALESCE(NULLIF(current_setting('app.current_agent', true), ''), 'unknown');
  v_canonical := business_v2.canonical_party_id(p_party_id);

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
    (v_canonical, 'other', 'outbound',
     format('Document issued: %s #%s', p_kind, v_doc_id),
     now(),
     jsonb_build_object('document_id', v_doc_id, 'document_kind', p_kind),
     v_agent);

  -- Emit outbox for Plutio sync (proposals, contracts, invoices, receipts)
  IF p_kind IN ('proposal', 'contract', 'invoice', 'receipt') THEN
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

ALTER FUNCTION business_v2.fn_issue_document(bigint, text, int, text, jsonb) OWNER TO nanoclaw_admin;

----------------------------------------------------------------------
-- 6. fn_log_interaction(bigint, text, text, text, timestamptz, jsonb) RETURNS bigint
----------------------------------------------------------------------
DROP FUNCTION IF EXISTS business_v2.fn_log_interaction(bigint, text, text, text, timestamptz, jsonb);

CREATE FUNCTION business_v2.fn_log_interaction(
  p_party_id bigint,
  p_channel text,
  p_direction text,
  p_subject text,
  p_occurred_at timestamptz,
  p_metadata jsonb
)
RETURNS bigint
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

ALTER FUNCTION business_v2.fn_log_interaction(bigint, text, text, text, timestamptz, jsonb) OWNER TO nanoclaw_admin;

----------------------------------------------------------------------
-- 7. fn_create_pipeline_entry(bigint, bigint, text, int, text, jsonb) RETURNS bigint
----------------------------------------------------------------------
DROP FUNCTION IF EXISTS business_v2.fn_create_pipeline_entry(bigint, bigint, text, int, text, jsonb);

CREATE FUNCTION business_v2.fn_create_pipeline_entry(
  p_party_id bigint,
  p_program_id bigint,
  p_stage text,
  p_amount_cents int,
  p_currency text,
  p_metadata jsonb
)
RETURNS bigint
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

ALTER FUNCTION business_v2.fn_create_pipeline_entry(bigint, bigint, text, int, text, jsonb) OWNER TO nanoclaw_admin;

----------------------------------------------------------------------
-- 8. fn_advance_pipeline_stage(bigint, text, text) RETURNS void
-- SETs LOCAL app.current_reason, UPDATES stage (trigger records history), resets reason.
----------------------------------------------------------------------
DROP FUNCTION IF EXISTS business_v2.fn_advance_pipeline_stage(bigint, text, text);

CREATE FUNCTION business_v2.fn_advance_pipeline_stage(
  p_entry_id bigint,
  p_new_stage text,
  p_reason text
)
RETURNS void
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

ALTER FUNCTION business_v2.fn_advance_pipeline_stage(bigint, text, text) OWNER TO nanoclaw_admin;

----------------------------------------------------------------------
-- TRIGGER FUNCTIONS (9-14)
-- All short-circuit on app.backfill_mode='true' (Plan #4 reserved).
----------------------------------------------------------------------

----------------------------------------------------------------------
-- 9. fn_pipeline_stage_history() — BEFORE UPDATE OF stage on pipeline_entries
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION business_v2.fn_pipeline_stage_history()
RETURNS trigger
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

----------------------------------------------------------------------
-- 10. fn_validate_outbox_payload() — BEFORE INSERT on plutio_outbox
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION business_v2.fn_validate_outbox_payload()
RETURNS trigger
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

----------------------------------------------------------------------
-- 11. fn_reject_writes_to_merged_party() — single party_id column
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION business_v2.fn_reject_writes_to_merged_party()
RETURNS trigger
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

----------------------------------------------------------------------
-- 12. fn_reject_writes_to_merged_from_party() — for party_relationships.from_party_id
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION business_v2.fn_reject_writes_to_merged_from_party()
RETURNS trigger
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

----------------------------------------------------------------------
-- 13. fn_reject_writes_to_merged_to_party() — for party_relationships.to_party_id
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION business_v2.fn_reject_writes_to_merged_to_party()
RETURNS trigger
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

----------------------------------------------------------------------
-- 14. update_timestamp() — verbatim copy of public.update_timestamp() as of 2026-04-11
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION business_v2.update_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

ALTER FUNCTION business_v2.update_timestamp() OWNER TO nanoclaw_admin;

COMMIT;
