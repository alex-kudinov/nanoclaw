-- 114_procurement_control_plane.sql
--
-- Portable, host-owned control plane for the Procurement Scout resurrection.
-- This migration is additive. It does not reclassify legacy opportunities,
-- change schedules, enable Bonfire, or grant a container direct write access.

BEGIN;

SET search_path TO public, business_v2, pg_catalog;

-- The historical Procurement table was created from an ignored local SQL file.
-- Reproduce its live-compatible structure here so a fresh NanoClaw database can
-- create the subsystem from tracked source. Existing installations keep their
-- rows and constraints.
CREATE TABLE IF NOT EXISTS public.procurement_opportunities (
  id                serial PRIMARY KEY,
  bonfire_id        text UNIQUE NOT NULL,
  bonfire_url       text,
  title             text NOT NULL,
  agency            text,
  close_date        date,
  category          text,
  search_keyword    text,
  relevance         text,
  relevance_reason  text,
  status            text DEFAULT 'new',
  rejection_reason  text,
  vault_path        text,
  raw_snapshot      jsonb,
  detail_data       jsonb,
  scrape_attempts   integer DEFAULT 0,
  last_error        text,
  first_seen_at     timestamptz DEFAULT now(),
  last_seen_at      timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  reviewed_at       timestamptz,
  scraped_at        timestamptz,
  source            text DEFAULT 'bonfire'
);

-- New control-plane columns are nullable for legacy rows. Only observations
-- recorded through fn_record_procurement_observation receive a source_key.
ALTER TABLE public.procurement_opportunities
  ADD COLUMN IF NOT EXISTS source_key text,
  ADD COLUMN IF NOT EXISTS review_state text DEFAULT 'unreviewed',
  ADD COLUMN IF NOT EXISTS review_reason text,
  ADD COLUMN IF NOT EXISTS review_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS decision_owner text,
  ADD COLUMN IF NOT EXISTS decision_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_procurement_status
  ON public.procurement_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_procurement_close_date
  ON public.procurement_opportunities(close_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_procurement_source_key
  ON public.procurement_opportunities(source, source_key)
  WHERE source_key IS NOT NULL;

-- The legacy Procurement role historically received broad SELECT/INSERT/UPDATE
-- privileges on this table. Preserve only its old Bonfire lane while making
-- source-keyed CaleProcure/email rows a host-owned security boundary. The view
-- below is owner-evaluated and remains the bounded read path for new work.
ALTER TABLE public.procurement_opportunities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS procurement_admin_full_access
  ON public.procurement_opportunities;
CREATE POLICY procurement_admin_full_access
  ON public.procurement_opportunities
  TO nanoclaw_admin
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS procurement_readonly_full_read
  ON public.procurement_opportunities;
CREATE POLICY procurement_readonly_full_read
  ON public.procurement_opportunities
  FOR SELECT
  TO nanoclaw_readonly
  USING (true);

DROP POLICY IF EXISTS procurement_legacy_bonfire_read
  ON public.procurement_opportunities;
CREATE POLICY procurement_legacy_bonfire_read
  ON public.procurement_opportunities
  FOR SELECT
  TO nanoclaw_procurement
  USING (source = 'bonfire' AND source_key IS NULL);

DROP POLICY IF EXISTS procurement_legacy_bonfire_insert
  ON public.procurement_opportunities;
CREATE POLICY procurement_legacy_bonfire_insert
  ON public.procurement_opportunities
  FOR INSERT
  TO nanoclaw_procurement
  WITH CHECK (source = 'bonfire' AND source_key IS NULL);

DROP POLICY IF EXISTS procurement_legacy_bonfire_update
  ON public.procurement_opportunities;
CREATE POLICY procurement_legacy_bonfire_update
  ON public.procurement_opportunities
  FOR UPDATE
  TO nanoclaw_procurement
  USING (source = 'bonfire' AND source_key IS NULL)
  WITH CHECK (source = 'bonfire' AND source_key IS NULL);

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.procurement_opportunities'::regclass
       AND conname = 'procurement_review_state_check'
  ) THEN
    ALTER TABLE public.procurement_opportunities
      ADD CONSTRAINT procurement_review_state_check
      CHECK (
        review_state IS NULL OR
        review_state IN ('unreviewed', 'needs_info', 'process', 'drop')
      ) NOT VALID;
  END IF;
END
$migration$;

CREATE TABLE IF NOT EXISTS public.procurement_source_runs (
  id                bigserial PRIMARY KEY,
  source            text NOT NULL
                    CHECK (source IN ('caleprocure', 'email', 'bonfire')),
  run_key           text NOT NULL,
  status            text NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'complete', 'partial', 'failed')),
  started_at        timestamptz NOT NULL,
  completed_at      timestamptz,
  observations_seen integer NOT NULL DEFAULT 0 CHECK (observations_seen >= 0),
  observations_new  integer NOT NULL DEFAULT 0 CHECK (observations_new >= 0),
  error_code        text,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, run_key)
);

CREATE TABLE IF NOT EXISTS public.procurement_observations (
  id               bigserial PRIMARY KEY,
  source_run_id    bigint REFERENCES public.procurement_source_runs(id),
  opportunity_id   integer NOT NULL
                   REFERENCES public.procurement_opportunities(id),
  source           text NOT NULL
                   CHECK (source IN ('caleprocure', 'email', 'bonfire')),
  source_key       text NOT NULL,
  observed_at      timestamptz NOT NULL,
  payload_hash     text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  title            text NOT NULL,
  agency           text,
  close_date       date,
  category         text,
  source_url       text,
  search_keywords  text[] NOT NULL DEFAULT '{}',
  gmail_message_id text,
  gmail_thread_id  text,
  raw_payload      jsonb NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_key, payload_hash)
);

CREATE TABLE IF NOT EXISTS public.procurement_review_cards (
  id                    bigserial PRIMARY KEY,
  opportunity_id        integer NOT NULL
                        REFERENCES public.procurement_opportunities(id),
  review_version        integer NOT NULL CHECK (review_version >= 0),
  channel_jid           text NOT NULL,
  message_ts            text NOT NULL,
  action_epoch          text NOT NULL,
  recommendation        text NOT NULL
                        CHECK (
                          recommendation IN ('needs_info', 'process', 'drop')
                        ),
  recommendation_reason text NOT NULL,
  state                 text NOT NULL DEFAULT 'open'
                        CHECK (state IN ('open', 'decided', 'superseded')),
  decision              text
                        CHECK (
                          decision IS NULL OR
                          decision IN ('needs_info', 'process', 'drop')
                        ),
  decision_reason       text,
  decision_owner_uid    text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  decided_at            timestamptz,
  UNIQUE (opportunity_id, review_version, action_epoch),
  UNIQUE (channel_jid, message_ts)
);

CREATE INDEX IF NOT EXISTS idx_procurement_observations_opportunity
  ON public.procurement_observations(opportunity_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_procurement_source_runs_started
  ON public.procurement_source_runs(source, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_procurement_review_cards_open
  ON public.procurement_review_cards(opportunity_id, review_version)
  WHERE state = 'open';

-- Start/reuse a source run. A retry with the same source/run_key resumes the
-- same ledger row rather than fabricating another successful run.
CREATE OR REPLACE FUNCTION public.fn_begin_procurement_source_run(
  p_source     text,
  p_run_key    text,
  p_started_at timestamptz,
  p_metadata   jsonb
)
RETURNS TABLE (
  run_id            bigint,
  status            text,
  observations_seen integer,
  observations_new  integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, business_v2, pg_catalog
AS $function$
DECLARE
  v_existing public.procurement_source_runs%ROWTYPE;
  v_created  public.procurement_source_runs%ROWTYPE;
BEGIN
  IF p_source NOT IN ('caleprocure', 'email', 'bonfire') THEN
    RAISE EXCEPTION 'unsupported procurement source: %', p_source;
  END IF;
  IF NULLIF(btrim(p_run_key), '') IS NULL THEN
    RAISE EXCEPTION 'procurement run_key is required';
  END IF;
  IF jsonb_typeof(COALESCE(p_metadata, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'procurement run metadata must be an object';
  END IF;

  SELECT *
    INTO v_existing
    FROM public.procurement_source_runs r
   WHERE r.source = p_source
     AND r.run_key = btrim(p_run_key)
   FOR UPDATE;

  IF FOUND THEN
    IF (v_existing.metadata ->> 'batch_hash')
       IS DISTINCT FROM (COALESCE(p_metadata, '{}'::jsonb) ->> 'batch_hash') THEN
      RAISE EXCEPTION
        'procurement run key % was reused with a different batch',
        btrim(p_run_key);
    END IF;
    UPDATE public.procurement_source_runs r
       SET metadata = r.metadata || COALESCE(p_metadata, '{}'::jsonb)
     WHERE r.id = v_existing.id;
    RETURN QUERY
    SELECT
      v_existing.id,
      v_existing.status,
      v_existing.observations_seen,
      v_existing.observations_new;
    RETURN;
  END IF;

  INSERT INTO public.procurement_source_runs
    (source, run_key, status, started_at, metadata)
  VALUES
    (p_source, btrim(p_run_key), 'running', p_started_at,
     COALESCE(p_metadata, '{}'::jsonb))
  RETURNING * INTO v_created;

  RETURN QUERY
  SELECT
    v_created.id,
    v_created.status,
    v_created.observations_seen,
    v_created.observations_new;
END
$function$;

-- Record one immutable source observation and update only the discovery fields
-- of an unreviewed canonical opportunity. Human-reviewed decisions are never
-- overwritten by a later scan.
CREATE OR REPLACE FUNCTION public.fn_record_procurement_observation(
  p_source           text,
  p_source_key       text,
  p_title            text,
  p_agency           text,
  p_close_date       date,
  p_category         text,
  p_source_url       text,
  p_search_keywords  text[],
  p_observed_at      timestamptz,
  p_payload_hash     text,
  p_raw_payload      jsonb,
  p_source_run_id    bigint,
  p_gmail_message_id text,
  p_gmail_thread_id  text
)
RETURNS TABLE (
  opportunity_id      integer,
  observation_created boolean,
  opportunity_created boolean,
  review_state        text,
  review_version      integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, business_v2, pg_catalog
AS $function$
DECLARE
  v_opportunity_id integer;
  v_observation_id bigint;
  v_existing_id    integer;
BEGIN
  IF p_source NOT IN ('caleprocure', 'email') THEN
    RAISE EXCEPTION 'host intake accepts only caleprocure or email';
  END IF;
  IF NULLIF(btrim(p_source_key), '') IS NULL THEN
    RAISE EXCEPTION 'procurement source_key is required';
  END IF;
  IF NULLIF(btrim(p_title), '') IS NULL THEN
    RAISE EXCEPTION 'procurement title is required';
  END IF;
  IF p_payload_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'procurement payload_hash must be lowercase sha256';
  END IF;
  IF jsonb_typeof(p_raw_payload) <> 'object' THEN
    RAISE EXCEPTION 'procurement raw_payload must be an object';
  END IF;
  IF p_source = 'email' AND NULLIF(btrim(p_gmail_message_id), '') IS NULL THEN
    RAISE EXCEPTION 'email procurement observations require gmail_message_id';
  END IF;
  IF p_source = 'caleprocure'
     AND (p_gmail_message_id IS NOT NULL OR p_gmail_thread_id IS NOT NULL) THEN
    RAISE EXCEPTION 'CaleProcure observations cannot carry Gmail resources';
  END IF;
  IF p_source_run_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.procurement_source_runs
     WHERE id = p_source_run_id AND source = p_source
  ) THEN
    RAISE EXCEPTION 'source run % does not belong to %',
      p_source_run_id, p_source;
  END IF;

  SELECT id
    INTO v_existing_id
    FROM public.procurement_opportunities
   WHERE source = p_source
     AND source_key = btrim(p_source_key)
   FOR UPDATE;

  INSERT INTO public.procurement_opportunities (
    bonfire_id, bonfire_url, title, agency, close_date, category,
    search_keyword, status, raw_snapshot, first_seen_at, last_seen_at,
    updated_at, source, source_key, review_state, review_version
  )
  VALUES (
    p_source || ':' || btrim(p_source_key),
    p_source_url,
    btrim(p_title),
    NULLIF(btrim(p_agency), ''),
    p_close_date,
    NULLIF(btrim(p_category), ''),
    NULLIF(array_to_string(p_search_keywords, ', '), ''),
    'new',
    p_raw_payload,
    p_observed_at,
    p_observed_at,
    now(),
    p_source,
    btrim(p_source_key),
    'unreviewed',
    0
  )
  ON CONFLICT (source, source_key) WHERE source_key IS NOT NULL DO UPDATE
    SET last_seen_at = GREATEST(
          public.procurement_opportunities.last_seen_at,
          EXCLUDED.last_seen_at
        ),
        updated_at = now(),
        title = CASE
          WHEN public.procurement_opportunities.review_state = 'unreviewed'
            THEN EXCLUDED.title
          ELSE public.procurement_opportunities.title
        END,
        agency = CASE
          WHEN public.procurement_opportunities.review_state = 'unreviewed'
            THEN COALESCE(EXCLUDED.agency, public.procurement_opportunities.agency)
          ELSE public.procurement_opportunities.agency
        END,
        close_date = CASE
          WHEN public.procurement_opportunities.review_state = 'unreviewed'
            THEN COALESCE(
              EXCLUDED.close_date,
              public.procurement_opportunities.close_date
            )
          ELSE public.procurement_opportunities.close_date
        END,
        category = CASE
          WHEN public.procurement_opportunities.review_state = 'unreviewed'
            THEN COALESCE(
              EXCLUDED.category,
              public.procurement_opportunities.category
            )
          ELSE public.procurement_opportunities.category
        END,
        search_keyword = CASE
          WHEN public.procurement_opportunities.review_state = 'unreviewed'
            THEN COALESCE(
              EXCLUDED.search_keyword,
              public.procurement_opportunities.search_keyword
            )
          ELSE public.procurement_opportunities.search_keyword
        END,
        bonfire_url = CASE
          WHEN public.procurement_opportunities.review_state = 'unreviewed'
            THEN COALESCE(
              EXCLUDED.bonfire_url,
              public.procurement_opportunities.bonfire_url
            )
          ELSE public.procurement_opportunities.bonfire_url
        END,
        raw_snapshot = CASE
          WHEN public.procurement_opportunities.review_state = 'unreviewed'
            THEN EXCLUDED.raw_snapshot
          ELSE public.procurement_opportunities.raw_snapshot
        END
  RETURNING id INTO v_opportunity_id;

  INSERT INTO public.procurement_observations (
    source_run_id, opportunity_id, source, source_key, observed_at,
    payload_hash, title, agency, close_date, category, source_url,
    search_keywords, gmail_message_id, gmail_thread_id, raw_payload
  )
  VALUES (
    p_source_run_id, v_opportunity_id, p_source, btrim(p_source_key),
    p_observed_at, p_payload_hash, btrim(p_title),
    NULLIF(btrim(p_agency), ''), p_close_date, NULLIF(btrim(p_category), ''),
    p_source_url, COALESCE(p_search_keywords, '{}'), p_gmail_message_id,
    p_gmail_thread_id, p_raw_payload
  )
  ON CONFLICT (source, source_key, payload_hash) DO NOTHING
  RETURNING id INTO v_observation_id;

  RETURN QUERY
  SELECT
    po.id,
    v_observation_id IS NOT NULL,
    v_existing_id IS NULL,
    po.review_state,
    po.review_version
  FROM public.procurement_opportunities po
  WHERE po.id = v_opportunity_id;
END
$function$;

-- Complete a run with counts supplied by the deterministic host adapter.
CREATE OR REPLACE FUNCTION public.fn_complete_procurement_source_run(
  p_run_id            bigint,
  p_status            text,
  p_completed_at      timestamptz,
  p_observations_seen integer,
  p_observations_new  integer,
  p_error_code        text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, business_v2, pg_catalog
AS $function$
BEGIN
  IF p_status NOT IN ('complete', 'partial', 'failed') THEN
    RAISE EXCEPTION 'invalid procurement run completion status: %', p_status;
  END IF;
  IF p_observations_seen < 0 OR p_observations_new < 0
     OR p_observations_new > p_observations_seen THEN
    RAISE EXCEPTION 'invalid procurement run counts';
  END IF;

  UPDATE public.procurement_source_runs
     SET status = p_status,
         completed_at = p_completed_at,
         observations_seen = p_observations_seen,
         observations_new = p_observations_new,
         error_code = NULLIF(btrim(p_error_code), '')
   WHERE id = p_run_id
     AND status = 'running';

  RETURN FOUND;
END
$function$;

-- Human review is optimistic and typed. A stale card cannot overwrite a newer
-- decision because the caller must present the current review_version.
CREATE OR REPLACE FUNCTION public.fn_transition_procurement_review(
  p_opportunity_id integer,
  p_expected_version integer,
  p_decision text,
  p_reason text,
  p_owner text
)
RETURNS TABLE (
  opportunity_id integer,
  review_state text,
  review_version integer,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, business_v2, pg_catalog
AS $function$
BEGIN
  IF p_decision NOT IN ('needs_info', 'process', 'drop') THEN
    RAISE EXCEPTION 'invalid procurement review decision: %', p_decision;
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'procurement review reason is required';
  END IF;
  IF NULLIF(btrim(p_owner), '') IS NULL THEN
    RAISE EXCEPTION 'procurement decision owner is required';
  END IF;

  RETURN QUERY
  UPDATE public.procurement_opportunities po
     SET review_state = p_decision,
         review_reason = btrim(p_reason),
         review_version = po.review_version + 1,
         decision_owner = btrim(p_owner),
         decision_at = now(),
         reviewed_at = now(),
         status = CASE
           WHEN p_decision = 'process' THEN 'accepted'
           WHEN p_decision = 'drop' THEN 'rejected'
           ELSE po.status
         END,
         rejection_reason = CASE
           WHEN p_decision = 'drop' THEN btrim(p_reason)
           ELSE po.rejection_reason
         END,
         updated_at = now()
   WHERE po.id = p_opportunity_id
     AND po.source_key IS NOT NULL
     AND po.review_version = p_expected_version
  RETURNING po.id, po.review_state, po.review_version, po.status;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'procurement review conflict for opportunity % at version %',
      p_opportunity_id, p_expected_version;
  END IF;
END
$function$;

-- Bind a host-generated Slack card to one exact opportunity/version/epoch.
-- Posting precedes recording because Slack supplies the message timestamp; if
-- this function fails, the host visibly disarms the orphan card and decisions
-- cannot use it.
CREATE OR REPLACE FUNCTION public.fn_record_procurement_review_card(
  p_opportunity_id        integer,
  p_review_version        integer,
  p_channel_jid           text,
  p_message_ts            text,
  p_action_epoch          text,
  p_recommendation        text,
  p_recommendation_reason text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, business_v2, pg_catalog
AS $function$
DECLARE
  v_id bigint;
BEGIN
  IF p_recommendation NOT IN ('needs_info', 'process', 'drop') THEN
    RAISE EXCEPTION 'invalid procurement recommendation: %', p_recommendation;
  END IF;
  IF NULLIF(btrim(p_channel_jid), '') IS NULL
     OR NULLIF(btrim(p_message_ts), '') IS NULL
     OR NULLIF(btrim(p_action_epoch), '') IS NULL THEN
    RAISE EXCEPTION 'procurement card channel, message, and epoch are required';
  END IF;
  IF NULLIF(btrim(p_recommendation_reason), '') IS NULL
     OR length(btrim(p_recommendation_reason)) > 1000 THEN
    RAISE EXCEPTION 'procurement recommendation reason is invalid';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.procurement_opportunities po
     WHERE po.id = p_opportunity_id
       AND po.source_key IS NOT NULL
       AND po.review_version = p_review_version
       AND po.review_state IN ('unreviewed', 'needs_info')
  ) THEN
    RAISE EXCEPTION
      'procurement opportunity % v% is not awaiting review',
      p_opportunity_id, p_review_version;
  END IF;

  INSERT INTO public.procurement_review_cards (
    opportunity_id, review_version, channel_jid, message_ts, action_epoch,
    recommendation, recommendation_reason
  )
  VALUES (
    p_opportunity_id, p_review_version, btrim(p_channel_jid),
    btrim(p_message_ts), btrim(p_action_epoch), p_recommendation,
    btrim(p_recommendation_reason)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END
$function$;

-- Apply an explicit named-human command only through the exact open card that
-- generated it. The card claim and optimistic opportunity transition happen in
-- one transaction, so stale cards and repeated commands cannot overwrite state.
CREATE OR REPLACE FUNCTION public.fn_apply_procurement_review_card_decision(
  p_channel_jid      text,
  p_message_ts       text,
  p_opportunity_id   integer,
  p_expected_version integer,
  p_decision         text,
  p_reason           text,
  p_owner_uid        text,
  p_action_epoch     text
)
RETURNS TABLE (
  opportunity_id integer,
  review_state text,
  review_version integer,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, business_v2, pg_catalog
AS $function$
DECLARE
  v_card   public.procurement_review_cards%ROWTYPE;
  v_result public.procurement_opportunities%ROWTYPE;
BEGIN
  IF p_decision NOT IN ('needs_info', 'process', 'drop') THEN
    RAISE EXCEPTION 'invalid procurement review decision: %', p_decision;
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL OR length(btrim(p_reason)) > 1000 THEN
    RAISE EXCEPTION 'procurement review reason is invalid';
  END IF;
  IF NULLIF(btrim(p_owner_uid), '') IS NULL
     OR NULLIF(btrim(p_action_epoch), '') IS NULL THEN
    RAISE EXCEPTION 'procurement owner UID and action epoch are required';
  END IF;

  SELECT *
    INTO v_card
    FROM public.procurement_review_cards c
   WHERE c.channel_jid = btrim(p_channel_jid)
     AND c.message_ts = btrim(p_message_ts)
   FOR UPDATE;

  IF NOT FOUND
     OR v_card.state <> 'open'
     OR v_card.opportunity_id <> p_opportunity_id
     OR v_card.review_version <> p_expected_version
     OR v_card.action_epoch <> btrim(p_action_epoch) THEN
    RAISE EXCEPTION
      'procurement review card conflict for opportunity % at version %',
      p_opportunity_id, p_expected_version;
  END IF;

  UPDATE public.procurement_opportunities po
     SET review_state = p_decision,
         review_reason = btrim(p_reason),
         review_version = po.review_version + 1,
         decision_owner = btrim(p_owner_uid),
         decision_at = now(),
         reviewed_at = now(),
         status = CASE
           WHEN p_decision = 'process' THEN 'accepted'
           WHEN p_decision = 'drop' THEN 'rejected'
           ELSE po.status
         END,
         rejection_reason = CASE
           WHEN p_decision = 'drop' THEN btrim(p_reason)
           ELSE po.rejection_reason
         END,
         updated_at = now()
   WHERE po.id = p_opportunity_id
     AND po.source_key IS NOT NULL
     AND po.review_version = p_expected_version
  RETURNING po.* INTO v_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'procurement review conflict for opportunity % at version %',
      p_opportunity_id, p_expected_version;
  END IF;

  UPDATE public.procurement_review_cards c
     SET state = 'decided',
         decision = p_decision,
         decision_reason = btrim(p_reason),
         decision_owner_uid = btrim(p_owner_uid),
         decided_at = now()
   WHERE c.id = v_card.id;

  UPDATE public.procurement_review_cards c
     SET state = 'superseded'
   WHERE c.opportunity_id = p_opportunity_id
     AND c.state = 'open';

  RETURN QUERY
  SELECT
    v_result.id,
    v_result.review_state,
    v_result.review_version,
    v_result.status;
END
$function$;

CREATE OR REPLACE VIEW public.v_procurement_review_queue AS
SELECT
  po.id AS opportunity_id,
  po.source,
  po.source_key,
  po.title,
  po.agency,
  po.close_date,
  po.category,
  po.bonfire_url AS source_url,
  po.review_state,
  po.review_reason,
  po.review_version,
  po.first_seen_at,
  po.last_seen_at,
  CASE
    WHEN po.close_date IS NULL THEN NULL
    ELSE po.close_date - current_date
  END AS days_until_close
FROM public.procurement_opportunities po
WHERE po.source_key IS NOT NULL
  AND po.review_state IN ('unreviewed', 'needs_info')
  AND (po.close_date IS NULL OR po.close_date >= current_date);

COMMENT ON VIEW public.v_procurement_review_queue IS
  'Actionable Procurement intake only: host-normalized CaleProcure/email rows awaiting a human decision. Legacy rows without source_key are excluded.';

REVOKE ALL ON public.procurement_source_runs FROM PUBLIC;
REVOKE ALL ON public.procurement_observations FROM PUBLIC;
REVOKE ALL ON public.procurement_review_cards FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_begin_procurement_source_run(
  text, text, timestamptz, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_record_procurement_observation(
  text, text, text, text, date, text, text, text[], timestamptz, text,
  jsonb, bigint, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_complete_procurement_source_run(
  bigint, text, timestamptz, integer, integer, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_transition_procurement_review(
  integer, integer, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_record_procurement_review_card(
  integer, integer, text, text, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_apply_procurement_review_card_decision(
  text, text, integer, integer, text, text, text, text
) FROM PUBLIC;

GRANT SELECT ON public.v_procurement_review_queue
  TO nanoclaw_procurement, nanoclaw_readonly, nanoclaw_admin;
GRANT SELECT ON public.procurement_source_runs,
                public.procurement_observations,
                public.procurement_review_cards
  TO nanoclaw_readonly, nanoclaw_admin;
GRANT EXECUTE ON FUNCTION public.fn_begin_procurement_source_run(
  text, text, timestamptz, jsonb
) TO nanoclaw_admin;
GRANT EXECUTE ON FUNCTION public.fn_record_procurement_observation(
  text, text, text, text, date, text, text, text[], timestamptz, text,
  jsonb, bigint, text, text
) TO nanoclaw_admin;
GRANT EXECUTE ON FUNCTION public.fn_complete_procurement_source_run(
  bigint, text, timestamptz, integer, integer, text
) TO nanoclaw_admin;
GRANT EXECUTE ON FUNCTION public.fn_transition_procurement_review(
  integer, integer, text, text, text
) TO nanoclaw_admin;
GRANT EXECUTE ON FUNCTION public.fn_record_procurement_review_card(
  integer, integer, text, text, text, text, text
) TO nanoclaw_admin;
GRANT EXECUTE ON FUNCTION public.fn_apply_procurement_review_card_decision(
  text, text, integer, integer, text, text, text, text
) TO nanoclaw_admin;

COMMIT;
