-- 115_procurement_pursuit.sql
--
-- Close the migration-114 review dead end. A named-human `process` decision
-- now creates one host-owned pursuit in the same transaction. Source-run
-- completeness is derived from host-planned coverage, and operational alerts
-- are deduplicated in PostgreSQL.

BEGIN;

SET search_path TO public, business_v2, pg_catalog;

-- Actionable procurement email must enter the existing Mailman -> Procurement
-- handoff path. The classifier code already routes every non-auto-archive
-- taxonomy row; this data correction deliberately avoids shared email code.
DO $migration$
BEGIN
  IF to_regclass('public.classification_taxonomy') IS NOT NULL THEN
    EXECUTE $sql$
      UPDATE public.classification_taxonomy
         SET auto_archive = false,
             updated_at = now()
       WHERE label IN ('MrGru/procurement/rfp', 'MrGru/procurement/rfq')
    $sql$;
  END IF;
END
$migration$;

-- Migration 114 added this constraint NOT VALID for legacy compatibility.
-- Production preflight confirmed zero violations; make the invariant real.
ALTER TABLE public.procurement_opportunities
  VALIDATE CONSTRAINT procurement_review_state_check;

ALTER TABLE public.procurement_source_runs
  ADD COLUMN IF NOT EXISTS adapter_version text,
  ADD COLUMN IF NOT EXISTS planned_units jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS observed_units jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS missing_units jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS coverage_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS terminal_reason text;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.procurement_source_runs'::regclass
       AND conname = 'procurement_source_run_counts_check'
  ) THEN
    ALTER TABLE public.procurement_source_runs
      ADD CONSTRAINT procurement_source_run_counts_check CHECK (
        observations_seen >= 0 AND observations_new >= 0
        AND observations_new <= observations_seen
      ) NOT VALID;
  END IF;
END
$migration$;

ALTER TABLE public.procurement_source_runs
  VALIDATE CONSTRAINT procurement_source_run_counts_check;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.procurement_source_runs'::regclass
       AND conname = 'procurement_source_run_coverage_json_check'
  ) THEN
    ALTER TABLE public.procurement_source_runs
      ADD CONSTRAINT procurement_source_run_coverage_json_check CHECK (
        jsonb_typeof(planned_units) = 'array' AND
        jsonb_typeof(observed_units) = 'array' AND
        jsonb_typeof(missing_units) = 'array' AND
        jsonb_typeof(coverage_evidence) = 'object'
      );
  END IF;
END
$migration$;

CREATE TABLE IF NOT EXISTS public.procurement_pursuits (
  id                    bigserial PRIMARY KEY,
  opportunity_id        integer NOT NULL
                        REFERENCES public.procurement_opportunities(id),
  decision_version      integer NOT NULL CHECK (decision_version > 0),
  source_review_card_id bigint
                        REFERENCES public.procurement_review_cards(id),
  pursuit_state         text NOT NULL DEFAULT 'qualifying'
                        CHECK (pursuit_state IN (
                          'qualifying', 'assessing', 'blocked',
                          'proposal_ready', 'submitted', 'passed',
                          'expired_undecided'
                        )),
  pursuit_version       integer NOT NULL DEFAULT 0
                        CHECK (pursuit_version >= 0),
  owner_uid             text NOT NULL,
  next_action           text NOT NULL,
  next_action_due       timestamptz NOT NULL,
  terminal_reason       text,
  closed_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id, decision_version)
);

CREATE TABLE IF NOT EXISTS public.procurement_pursuit_events (
  id                bigserial PRIMARY KEY,
  pursuit_id        bigint NOT NULL
                    REFERENCES public.procurement_pursuits(id),
  pursuit_version   integer NOT NULL CHECK (pursuit_version >= 0),
  event_type        text NOT NULL,
  from_state        text,
  to_state          text NOT NULL,
  actor_uid         text NOT NULL,
  action_epoch      text,
  reason            text NOT NULL,
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pursuit_id, pursuit_version, event_type)
);

CREATE TABLE IF NOT EXISTS public.procurement_reconciler_alerts (
  id              bigserial PRIMARY KEY,
  condition_key   text NOT NULL,
  subject_kind    text NOT NULL,
  subject_id      text NOT NULL,
  subject_version text NOT NULL,
  alert_text      text NOT NULL,
  channel_jid     text,
  thread_ts       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  delivered_at   timestamptz,
  UNIQUE (condition_key, subject_kind, subject_id, subject_version)
);

ALTER TABLE public.procurement_reconciler_alerts
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS channel_jid text,
  ADD COLUMN IF NOT EXISTS thread_ts text;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.procurement_reconciler_alerts'::regclass
       AND conname = 'procurement_reconciler_alert_route_check'
  ) THEN
    ALTER TABLE public.procurement_reconciler_alerts
      ADD CONSTRAINT procurement_reconciler_alert_route_check
      CHECK ((channel_jid IS NULL) = (thread_ts IS NULL)) NOT VALID;
  END IF;
END
$migration$;
ALTER TABLE public.procurement_reconciler_alerts
  VALIDATE CONSTRAINT procurement_reconciler_alert_route_check;

-- A source observation is immutable and may predate the current run. This
-- association records that the opportunity was nevertheless observed in this
-- exact run, so an idempotent retry returns the same opportunity IDs.
CREATE TABLE IF NOT EXISTS public.procurement_source_run_opportunities (
  source_run_id bigint NOT NULL
                REFERENCES public.procurement_source_runs(id) ON DELETE CASCADE,
  opportunity_id integer NOT NULL
                 REFERENCES public.procurement_opportunities(id),
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_run_id, opportunity_id)
);

CREATE INDEX IF NOT EXISTS idx_procurement_pursuits_active
  ON public.procurement_pursuits(next_action_due, updated_at)
  WHERE pursuit_state NOT IN ('passed', 'expired_undecided');
CREATE INDEX IF NOT EXISTS idx_procurement_pursuit_events_pursuit
  ON public.procurement_pursuit_events(pursuit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_procurement_reconciler_alerts_pending
  ON public.procurement_reconciler_alerts(id)
  WHERE delivered_at IS NULL;

ALTER TABLE public.procurement_pursuits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_pursuit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_reconciler_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_source_run_opportunities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS procurement_pursuits_admin_full_access
  ON public.procurement_pursuits;
CREATE POLICY procurement_pursuits_admin_full_access
  ON public.procurement_pursuits TO nanoclaw_admin
  USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS procurement_pursuits_readonly_full_read
  ON public.procurement_pursuits;
CREATE POLICY procurement_pursuits_readonly_full_read
  ON public.procurement_pursuits FOR SELECT TO nanoclaw_readonly
  USING (true);

DROP POLICY IF EXISTS procurement_pursuit_events_admin_full_access
  ON public.procurement_pursuit_events;
CREATE POLICY procurement_pursuit_events_admin_full_access
  ON public.procurement_pursuit_events TO nanoclaw_admin
  USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS procurement_pursuit_events_readonly_full_read
  ON public.procurement_pursuit_events;
CREATE POLICY procurement_pursuit_events_readonly_full_read
  ON public.procurement_pursuit_events FOR SELECT TO nanoclaw_readonly
  USING (true);

DROP POLICY IF EXISTS procurement_reconciler_alerts_admin_full_access
  ON public.procurement_reconciler_alerts;
CREATE POLICY procurement_reconciler_alerts_admin_full_access
  ON public.procurement_reconciler_alerts TO nanoclaw_admin
  USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS procurement_reconciler_alerts_readonly_full_read
  ON public.procurement_reconciler_alerts;
CREATE POLICY procurement_reconciler_alerts_readonly_full_read
  ON public.procurement_reconciler_alerts FOR SELECT TO nanoclaw_readonly
  USING (true);

DROP POLICY IF EXISTS procurement_source_run_opportunities_admin_full_access
  ON public.procurement_source_run_opportunities;
CREATE POLICY procurement_source_run_opportunities_admin_full_access
  ON public.procurement_source_run_opportunities TO nanoclaw_admin
  USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS procurement_source_run_opportunities_readonly_full_read
  ON public.procurement_source_run_opportunities;
CREATE POLICY procurement_source_run_opportunities_readonly_full_read
  ON public.procurement_source_run_opportunities FOR SELECT TO nanoclaw_readonly
  USING (true);

-- Host-v2 source run. Planned units come from tracked host configuration, not
-- from portal content. Failed or partial same-batch retries resume the exact
-- row; a completed run is immutable and a changed batch hash is rejected.
CREATE OR REPLACE FUNCTION public.fn_begin_procurement_source_run_v2(
  p_source          text,
  p_run_key         text,
  p_started_at      timestamptz,
  p_batch_hash      text,
  p_adapter_version text,
  p_planned_units   jsonb
)
RETURNS TABLE (
  run_id            bigint,
  status            text,
  observations_seen integer,
  observations_new  integer,
  missing_units     jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, business_v2, pg_catalog
AS $function$
DECLARE
  v_run public.procurement_source_runs%ROWTYPE;
BEGIN
  IF p_source <> 'caleprocure' THEN
    RAISE EXCEPTION 'host-v2 source runs accept only caleprocure';
  END IF;
  IF NULLIF(btrim(p_run_key), '') IS NULL
     OR NULLIF(btrim(p_adapter_version), '') IS NULL THEN
    RAISE EXCEPTION 'procurement run key and adapter version are required';
  END IF;
  IF p_batch_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'procurement batch hash must be lowercase sha256';
  END IF;
  IF jsonb_typeof(p_planned_units) <> 'array'
     OR jsonb_array_length(p_planned_units) = 0 THEN
    RAISE EXCEPTION 'procurement planned units must be a non-empty array';
  END IF;

  SELECT * INTO v_run
    FROM public.procurement_source_runs r
   WHERE r.source = p_source AND r.run_key = btrim(p_run_key)
   FOR UPDATE;

  IF FOUND THEN
    IF (v_run.metadata ->> 'batch_hash') IS DISTINCT FROM p_batch_hash
       OR v_run.adapter_version IS DISTINCT FROM btrim(p_adapter_version)
       OR v_run.planned_units IS DISTINCT FROM p_planned_units THEN
      RAISE EXCEPTION 'procurement run key % was reused with different evidence',
        btrim(p_run_key);
    END IF;
    IF v_run.status IN ('failed', 'partial') THEN
      UPDATE public.procurement_source_runs r
         SET status = 'running', started_at = p_started_at,
             completed_at = NULL, error_code = NULL,
             terminal_reason = NULL, observed_units = '[]'::jsonb,
             missing_units = p_planned_units, coverage_evidence = '{}'::jsonb
       WHERE r.id = v_run.id
       RETURNING * INTO v_run;
    END IF;
  ELSE
    INSERT INTO public.procurement_source_runs (
      source, run_key, status, started_at, metadata, adapter_version,
      planned_units, missing_units
    ) VALUES (
      p_source, btrim(p_run_key), 'running', p_started_at,
      jsonb_build_object('batch_hash', p_batch_hash),
      btrim(p_adapter_version), p_planned_units, p_planned_units
    ) RETURNING * INTO v_run;
  END IF;

  RETURN QUERY SELECT v_run.id, v_run.status,
    v_run.observations_seen, v_run.observations_new, v_run.missing_units;
END
$function$;

-- Link the current run to every opportunity it observed, even when the
-- immutable observation row was first created by an earlier run.
CREATE OR REPLACE FUNCTION public.fn_link_procurement_run_opportunity(
  p_run_id bigint,
  p_opportunity_id integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, business_v2, pg_catalog
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.procurement_source_runs r
     WHERE r.id = p_run_id AND r.source = 'caleprocure'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.procurement_opportunities po
     WHERE po.id = p_opportunity_id AND po.source = 'caleprocure'
  ) THEN
    RAISE EXCEPTION 'invalid CaleProcure run/opportunity association';
  END IF;

  INSERT INTO public.procurement_source_run_opportunities (
    source_run_id, opportunity_id
  ) VALUES (p_run_id, p_opportunity_id)
  ON CONFLICT DO NOTHING;
  RETURN FOUND;
END
$function$;

-- Completion status is derived. Full observed coverage may legitimately yield
-- zero rows; missing planned units can never be self-attested as complete.
CREATE OR REPLACE FUNCTION public.fn_complete_procurement_source_run_v2(
  p_run_id           bigint,
  p_completed_at     timestamptz,
  p_observed_units   jsonb,
  p_coverage_evidence jsonb,
  p_observations_seen integer,
  p_observations_new integer,
  p_error_code       text
)
RETURNS TABLE (
  run_id            bigint,
  status            text,
  observations_seen integer,
  observations_new  integer,
  missing_units     jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, business_v2, pg_catalog
AS $function$
DECLARE
  v_run public.procurement_source_runs%ROWTYPE;
  v_missing jsonb;
  v_status text;
BEGIN
  SELECT * INTO v_run FROM public.procurement_source_runs r
   WHERE r.id = p_run_id FOR UPDATE;
  IF NOT FOUND OR v_run.status <> 'running' THEN
    RAISE EXCEPTION 'procurement source run % is not running', p_run_id;
  END IF;
  IF jsonb_typeof(p_observed_units) <> 'array'
     OR jsonb_typeof(p_coverage_evidence) <> 'object' THEN
    RAISE EXCEPTION 'procurement coverage evidence has an invalid shape';
  END IF;
  IF p_observations_seen < 0 OR p_observations_new < 0
     OR p_observations_new > p_observations_seen THEN
    RAISE EXCEPTION 'invalid procurement run counts';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(p_observed_units) observed(unit)
     WHERE NOT v_run.planned_units ? observed.unit
  ) THEN
    RAISE EXCEPTION 'observed procurement unit is not host-planned';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(p_observed_units) observed(unit)
     WHERE NOT p_coverage_evidence ? observed.unit
        OR jsonb_typeof(p_coverage_evidence -> observed.unit) <> 'object'
        OR COALESCE(p_coverage_evidence -> observed.unit ->> 'resultCount', '')
             !~ '^[0-9]+$'
        OR COALESCE(p_coverage_evidence -> observed.unit ->> 'pagesVisited', '')
             !~ '^[1-9][0-9]*$'
  ) OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_coverage_evidence) evidence(unit)
     WHERE NOT p_observed_units ? evidence.unit
  ) THEN
    RAISE EXCEPTION 'procurement coverage evidence must exactly receipt every observed unit';
  END IF;
  IF v_run.observations_new + p_observations_new
       > GREATEST(v_run.observations_seen, p_observations_seen) THEN
    RAISE EXCEPTION 'cumulative procurement new count exceeds seen count';
  END IF;

  SELECT COALESCE(jsonb_agg(planned.unit ORDER BY planned.unit), '[]'::jsonb)
    INTO v_missing
    FROM jsonb_array_elements_text(v_run.planned_units) planned(unit)
   WHERE NOT p_observed_units ? planned.unit;

  v_status := CASE
    WHEN NULLIF(btrim(p_error_code), '') IS NOT NULL THEN 'failed'
    WHEN jsonb_array_length(v_missing) = 0 THEN 'complete'
    ELSE 'partial'
  END;

  UPDATE public.procurement_source_runs r
     SET status = v_status,
         completed_at = p_completed_at,
         observations_seen = GREATEST(r.observations_seen, p_observations_seen),
         observations_new = r.observations_new + p_observations_new,
         observed_units = p_observed_units,
         missing_units = v_missing,
         coverage_evidence = p_coverage_evidence,
         error_code = NULLIF(btrim(p_error_code), ''),
         terminal_reason = CASE
           WHEN v_status = 'complete' THEN 'all_planned_units_observed'
           WHEN v_status = 'partial' THEN 'planned_units_missing'
           ELSE 'adapter_error'
         END
   WHERE r.id = p_run_id
   RETURNING r.* INTO v_run;

  RETURN QUERY SELECT v_run.id, v_run.status, v_run.observations_seen,
    v_run.observations_new, v_run.missing_units;
END
$function$;

-- The programmatic repair path may record needs_info/drop only. A process
-- decision requires a Slack card so the resulting pursuit has a human thread.
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
DECLARE
  v_result public.procurement_opportunities%ROWTYPE;
BEGIN
  IF p_decision NOT IN ('needs_info', 'process', 'drop') THEN
    RAISE EXCEPTION 'invalid procurement review decision: %', p_decision;
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL OR NULLIF(btrim(p_owner), '') IS NULL THEN
    RAISE EXCEPTION 'procurement review reason and owner are required';
  END IF;
  IF p_decision = 'process' THEN
    RAISE EXCEPTION 'process decisions require a bound Procurement review card';
  END IF;

  UPDATE public.procurement_opportunities po
     SET review_state = p_decision, review_reason = btrim(p_reason),
         review_version = po.review_version + 1,
         decision_owner = btrim(p_owner), decision_at = now(),
         reviewed_at = now(),
         status = CASE WHEN p_decision = 'process' THEN 'accepted'
                       WHEN p_decision = 'drop' THEN 'rejected' ELSE po.status END,
         rejection_reason = CASE WHEN p_decision = 'drop' THEN btrim(p_reason)
                                 ELSE po.rejection_reason END,
         updated_at = now()
   WHERE po.id = p_opportunity_id AND po.source_key IS NOT NULL
     AND po.review_version = p_expected_version
  RETURNING po.* INTO v_result;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'procurement review conflict for opportunity % at version %',
      p_opportunity_id, p_expected_version;
  END IF;

  RETURN QUERY SELECT v_result.id, v_result.review_state,
    v_result.review_version, v_result.status;
END
$function$;

-- Replace the bound-card decision function so card consumption, review state,
-- and pursuit creation are one database transaction.
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
  v_card public.procurement_review_cards%ROWTYPE;
  v_result public.procurement_opportunities%ROWTYPE;
  v_pursuit_id bigint;
  v_receipt_text text;
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

  SELECT * INTO v_card FROM public.procurement_review_cards c
   WHERE c.channel_jid = btrim(p_channel_jid)
     AND c.message_ts = btrim(p_message_ts) FOR UPDATE;
  IF NOT FOUND OR v_card.state <> 'open'
     OR v_card.opportunity_id <> p_opportunity_id
     OR v_card.review_version <> p_expected_version
     OR v_card.action_epoch <> btrim(p_action_epoch) THEN
    RAISE EXCEPTION 'procurement review card conflict for opportunity % at version %',
      p_opportunity_id, p_expected_version;
  END IF;

  UPDATE public.procurement_opportunities po
     SET review_state = p_decision, review_reason = btrim(p_reason),
         review_version = po.review_version + 1,
         decision_owner = btrim(p_owner_uid), decision_at = now(),
         reviewed_at = now(),
         status = CASE WHEN p_decision = 'process' THEN 'accepted'
                       WHEN p_decision = 'drop' THEN 'rejected' ELSE po.status END,
         rejection_reason = CASE WHEN p_decision = 'drop' THEN btrim(p_reason)
                                 ELSE po.rejection_reason END,
         updated_at = now()
   WHERE po.id = p_opportunity_id AND po.source_key IS NOT NULL
     AND po.review_version = p_expected_version
  RETURNING po.* INTO v_result;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'procurement review conflict for opportunity % at version %',
      p_opportunity_id, p_expected_version;
  END IF;

  UPDATE public.procurement_review_cards c
     SET state = 'decided', decision = p_decision,
         decision_reason = btrim(p_reason),
         decision_owner_uid = btrim(p_owner_uid), decided_at = now()
   WHERE c.id = v_card.id;
  UPDATE public.procurement_review_cards c SET state = 'superseded'
   WHERE c.opportunity_id = p_opportunity_id AND c.state = 'open';

  IF p_decision = 'process' THEN
    INSERT INTO public.procurement_pursuits (
      opportunity_id, decision_version, source_review_card_id, owner_uid,
      next_action, next_action_due
    ) VALUES (
      v_result.id, v_result.review_version, v_card.id, btrim(p_owner_uid),
      'Complete qualification and assessment with evidence', now() + interval '14 days'
    ) RETURNING id INTO v_pursuit_id;
    INSERT INTO public.procurement_pursuit_events (
      pursuit_id, pursuit_version, event_type, to_state, actor_uid,
      action_epoch, reason
    ) VALUES (
      v_pursuit_id, 0, 'created', 'qualifying', btrim(p_owner_uid),
      btrim(p_action_epoch), btrim(p_reason)
    );
  END IF;

  v_receipt_text := format(
    '[PROCUREMENT DECISION RECORDED] #%s is %s at v%s. Actor: %s.%s',
    v_result.id,
    v_result.review_state,
    v_result.review_version,
    btrim(p_owner_uid),
    CASE WHEN p_decision = 'process' THEN format(E'\nHost pursuit: #%s v0. Reply in this same thread with exactly one:\nADVANCE #%s v0 assessing — <assessment evidence and next action>\nADVANCE #%s v0 blocked — <blocker and owner action>\nADVANCE #%s v0 passed — <terminal no-bid evidence>', v_pursuit_id, v_pursuit_id, v_pursuit_id, v_pursuit_id) ELSE '' END
  );
  INSERT INTO public.procurement_reconciler_alerts (
    condition_key, subject_kind, subject_id, subject_version, alert_text,
    channel_jid, thread_ts
  ) VALUES (
    'decision_receipt', 'opportunity', v_result.id::text,
    v_result.review_version::text, v_receipt_text,
    btrim(p_channel_jid), btrim(p_message_ts)
  );

  RETURN QUERY SELECT v_result.id, v_result.review_state,
    v_result.review_version, v_result.status;
END
$function$;

-- Human pursuit transitions stay in the original process-decision thread.
-- proposal_ready and submitted are reserved for migration 116 and are
-- intentionally unreachable through this function.
CREATE OR REPLACE FUNCTION public.fn_apply_procurement_pursuit_advance(
  p_channel_jid      text,
  p_message_ts       text,
  p_pursuit_id       bigint,
  p_expected_version integer,
  p_target_state     text,
  p_reason           text,
  p_actor_uid        text,
  p_action_epoch     text
)
RETURNS TABLE (
  pursuit_id bigint,
  opportunity_id integer,
  pursuit_state text,
  pursuit_version integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, business_v2, pg_catalog
AS $function$
DECLARE
  v_pursuit public.procurement_pursuits%ROWTYPE;
  v_card public.procurement_review_cards%ROWTYPE;
  v_prior_state text;
  v_receipt_text text;
BEGIN
  IF p_target_state NOT IN ('assessing', 'blocked', 'passed') THEN
    RAISE EXCEPTION 'invalid or unavailable procurement pursuit state: %', p_target_state;
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL OR length(btrim(p_reason)) > 1000 THEN
    RAISE EXCEPTION 'procurement pursuit reason is invalid';
  END IF;
  IF NULLIF(btrim(p_actor_uid), '') IS NULL
     OR NULLIF(btrim(p_action_epoch), '') IS NULL THEN
    RAISE EXCEPTION 'procurement actor UID and action epoch are required';
  END IF;

  SELECT * INTO v_pursuit FROM public.procurement_pursuits p
   WHERE p.id = p_pursuit_id FOR UPDATE;
  IF NOT FOUND OR v_pursuit.pursuit_version <> p_expected_version
     OR v_pursuit.pursuit_state IN ('passed', 'expired_undecided') THEN
    RAISE EXCEPTION 'procurement pursuit conflict for % at version %',
      p_pursuit_id, p_expected_version;
  END IF;

  SELECT * INTO v_card FROM public.procurement_review_cards c
   WHERE c.id = v_pursuit.source_review_card_id;
  IF NOT FOUND OR v_card.channel_jid <> btrim(p_channel_jid)
     OR v_card.message_ts <> btrim(p_message_ts)
     OR v_card.action_epoch <> btrim(p_action_epoch)
     OR v_card.state <> 'decided' OR v_card.decision <> 'process' THEN
    RAISE EXCEPTION 'procurement pursuit is not bound to this decision thread';
  END IF;

  IF NOT (
    (v_pursuit.pursuit_state = 'qualifying' AND p_target_state IN ('assessing', 'blocked', 'passed')) OR
    (v_pursuit.pursuit_state = 'assessing' AND p_target_state IN ('blocked', 'passed')) OR
    (v_pursuit.pursuit_state = 'blocked' AND p_target_state IN ('assessing', 'passed'))
  ) THEN
    RAISE EXCEPTION 'invalid procurement pursuit transition: % to %',
      v_pursuit.pursuit_state, p_target_state;
  END IF;

  v_prior_state := v_pursuit.pursuit_state;
  UPDATE public.procurement_pursuits p
     SET pursuit_state = p_target_state,
         pursuit_version = p.pursuit_version + 1,
         next_action = CASE WHEN p_target_state = 'passed'
                            THEN 'No bid; record retained for learning'
                            ELSE btrim(p_reason) END,
         next_action_due = CASE WHEN p_target_state = 'passed' THEN now()
                                ELSE now() + interval '14 days' END,
         terminal_reason = CASE WHEN p_target_state = 'passed'
                                THEN btrim(p_reason) ELSE NULL END,
         closed_at = CASE WHEN p_target_state = 'passed' THEN now() ELSE NULL END,
         updated_at = now()
   WHERE p.id = p_pursuit_id
   RETURNING * INTO v_pursuit;

  INSERT INTO public.procurement_pursuit_events (
    pursuit_id, pursuit_version, event_type, from_state, to_state,
    actor_uid, action_epoch, reason
  ) VALUES (
    v_pursuit.id, v_pursuit.pursuit_version, 'human_advance', v_prior_state,
    v_pursuit.pursuit_state, btrim(p_actor_uid), btrim(p_action_epoch),
    btrim(p_reason)
  );

  v_receipt_text := format(
    '[PROCUREMENT PURSUIT RECORDED] #%s is %s at v%s. Opportunity: #%s. Actor: %s.',
    v_pursuit.id, v_pursuit.pursuit_state, v_pursuit.pursuit_version,
    v_pursuit.opportunity_id, btrim(p_actor_uid)
  );
  INSERT INTO public.procurement_reconciler_alerts (
    condition_key, subject_kind, subject_id, subject_version, alert_text,
    channel_jid, thread_ts
  ) VALUES (
    'pursuit_receipt', 'pursuit', v_pursuit.id::text,
    v_pursuit.pursuit_version::text, v_receipt_text,
    btrim(p_channel_jid), btrim(p_message_ts)
  );

  RETURN QUERY SELECT v_pursuit.id, v_pursuit.opportunity_id,
    v_pursuit.pursuit_state, v_pursuit.pursuit_version;
END
$function$;

CREATE OR REPLACE VIEW public.v_procurement_pursuit_queue AS
SELECT
  p.id AS pursuit_id,
  p.pursuit_version,
  p.pursuit_state,
  p.owner_uid,
  p.next_action,
  p.next_action_due,
  po.id AS opportunity_id,
  po.source,
  po.source_key,
  po.title,
  po.agency,
  po.close_date,
  po.category,
  CASE WHEN po.close_date IS NULL THEN NULL
       ELSE po.close_date - (now() AT TIME ZONE 'America/Chicago')::date
       END AS days_until_close
FROM public.procurement_pursuits p
JOIN public.procurement_opportunities po ON po.id = p.opportunity_id
WHERE p.pursuit_state NOT IN ('passed', 'expired_undecided');

COMMENT ON VIEW public.v_procurement_pursuit_queue IS
  'All active host-owned pursuits. Deadlines sort the queue but never hide work.';

-- Atomically expire active pursuits past the public close date and insert
-- exact-once alerts for state changes, near deadlines, overdue actions, stale
-- source runs, and the aggregate unrouted Procurement-email condition.
CREATE OR REPLACE FUNCTION public.fn_reconcile_procurement(p_now timestamptz)
RETURNS TABLE (
  alert_id bigint,
  alert_text text,
  channel_jid text,
  thread_ts text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, business_v2, pg_catalog
AS $function$
BEGIN
  IF abs(extract(epoch FROM (p_now - now()))) > 300 THEN
    RAISE EXCEPTION 'procurement reconciler clock differs from database by more than five minutes';
  END IF;

  WITH expired AS (
    UPDATE public.procurement_pursuits p
       SET pursuit_state = 'expired_undecided',
           pursuit_version = p.pursuit_version + 1,
           terminal_reason = 'public close date passed without a terminal decision',
           closed_at = p_now, updated_at = p_now
      FROM public.procurement_opportunities po
     WHERE po.id = p.opportunity_id
       AND po.close_date IS NOT NULL
       AND po.close_date < (p_now AT TIME ZONE 'America/Chicago')::date
       AND p.pursuit_state NOT IN ('passed', 'expired_undecided')
    RETURNING p.id, p.opportunity_id, p.pursuit_version, p.owner_uid
  )
  INSERT INTO public.procurement_pursuit_events (
    pursuit_id, pursuit_version, event_type, from_state, to_state,
    actor_uid, reason
  ) SELECT id, pursuit_version, 'reconciler_expired', NULL,
      'expired_undecided', 'procurement-reconciler',
      'public close date passed without a terminal decision'
    FROM expired;

  INSERT INTO public.procurement_reconciler_alerts (
    condition_key, subject_kind, subject_id, subject_version, alert_text
  )
  SELECT conditions.condition_key, conditions.subject_kind,
         conditions.subject_id, conditions.subject_version,
         conditions.alert_text
  FROM (
    SELECT 'deadline_near'::text condition_key, 'pursuit'::text subject_kind,
           p.id::text subject_id,
           p.pursuit_version::text || ':' ||
             (p_now AT TIME ZONE 'America/Chicago')::date::text subject_version,
           format('[PROCUREMENT ALERT] Pursuit #%s for opportunity #%s closes in %s day(s). Next: %s',
                  p.id, po.id, po.close_date - (p_now AT TIME ZONE 'America/Chicago')::date,
                  p.next_action) alert_text
      FROM public.procurement_pursuits p
      JOIN public.procurement_opportunities po ON po.id = p.opportunity_id
     WHERE p.pursuit_state NOT IN ('passed', 'expired_undecided')
       AND po.close_date BETWEEN (p_now AT TIME ZONE 'America/Chicago')::date
                             AND (p_now AT TIME ZONE 'America/Chicago')::date + 14
    UNION ALL
    SELECT 'next_action_overdue', 'pursuit', p.id::text,
           p.pursuit_version::text || ':' ||
             (p_now AT TIME ZONE 'America/Chicago')::date::text,
           format('[PROCUREMENT ALERT] Pursuit #%s next action is overdue: %s',
                  p.id, p.next_action)
      FROM public.procurement_pursuits p
     WHERE p.pursuit_state NOT IN ('passed', 'expired_undecided')
       AND p.next_action_due < p_now
    UNION ALL
    SELECT 'source_run_stale', 'source_run', r.id::text,
           extract(epoch FROM r.started_at)::bigint::text || ':' ||
             (p_now AT TIME ZONE 'America/Chicago')::date::text,
           format('[PROCUREMENT ALERT] Source run #%s (%s/%s) has been running more than two hours.',
                  r.id, r.source, r.run_key)
      FROM public.procurement_source_runs r
     WHERE r.status = 'running' AND r.started_at < p_now - interval '2 hours'
    UNION ALL
    SELECT 'pursuit_expired', 'pursuit', p.id::text,
           p.pursuit_version::text,
           format('[PROCUREMENT ALERT] Pursuit #%s expired without a decision.', p.id)
      FROM public.procurement_pursuits p
     WHERE p.pursuit_state = 'expired_undecided'
  ) conditions
  ON CONFLICT DO NOTHING;

  RETURN QUERY
  SELECT a.id, a.alert_text, a.channel_jid, a.thread_ts
    FROM public.procurement_reconciler_alerts a
   WHERE a.delivered_at IS NULL
   ORDER BY a.id
   LIMIT 50;
END
$function$;

CREATE OR REPLACE FUNCTION public.fn_ack_procurement_reconciler_alert(
  p_alert_id bigint
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, business_v2, pg_catalog
AS $function$
  UPDATE public.procurement_reconciler_alerts
     SET delivered_at = now()
   WHERE id = p_alert_id AND delivered_at IS NULL
  RETURNING true
$function$;

REVOKE ALL ON public.procurement_pursuits,
              public.procurement_pursuit_events,
              public.procurement_reconciler_alerts,
              public.procurement_source_run_opportunities FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_begin_procurement_source_run_v2(
  text, text, timestamptz, text, text, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_complete_procurement_source_run_v2(
  bigint, timestamptz, jsonb, jsonb, integer, integer, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_link_procurement_run_opportunity(
  bigint, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_apply_procurement_pursuit_advance(
  text, text, bigint, integer, text, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_reconcile_procurement(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_ack_procurement_reconciler_alert(
  bigint
) FROM PUBLIC;

GRANT SELECT ON public.v_procurement_pursuit_queue
  TO nanoclaw_procurement, nanoclaw_readonly, nanoclaw_admin;
GRANT SELECT ON public.procurement_pursuits,
                public.procurement_pursuit_events,
                public.procurement_reconciler_alerts,
                public.procurement_source_run_opportunities
  TO nanoclaw_readonly, nanoclaw_admin;
GRANT EXECUTE ON FUNCTION public.fn_begin_procurement_source_run_v2(
  text, text, timestamptz, text, text, jsonb
) TO nanoclaw_admin;
GRANT EXECUTE ON FUNCTION public.fn_complete_procurement_source_run_v2(
  bigint, timestamptz, jsonb, jsonb, integer, integer, text
) TO nanoclaw_admin;
GRANT EXECUTE ON FUNCTION public.fn_link_procurement_run_opportunity(
  bigint, integer
) TO nanoclaw_admin;
GRANT EXECUTE ON FUNCTION public.fn_apply_procurement_pursuit_advance(
  text, text, bigint, integer, text, text, text, text
) TO nanoclaw_admin;
GRANT EXECUTE ON FUNCTION public.fn_reconcile_procurement(timestamptz)
  TO nanoclaw_admin;
GRANT EXECUTE ON FUNCTION public.fn_ack_procurement_reconciler_alert(
  bigint
) TO nanoclaw_admin;

COMMIT;
