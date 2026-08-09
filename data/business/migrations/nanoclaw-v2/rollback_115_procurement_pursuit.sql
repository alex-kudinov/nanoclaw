-- rollback_115_procurement_pursuit.sql
--
-- Explicit emergency rollback for migration 115. The non-numeric prefix is
-- intentional: run_migration.sh must never discover a rollback automatically.
-- Production preflight recorded both Procurement taxonomy rows as
-- auto_archive=true before 115. The migration-114 review constraint remains
-- validated because validation only confirms existing data integrity.

BEGIN;

SET search_path TO public, business_v2, pg_catalog;

DROP FUNCTION IF EXISTS public.fn_ack_procurement_reconciler_alert(
  bigint, timestamptz
);
DROP FUNCTION IF EXISTS public.fn_ack_procurement_reconciler_alert(bigint);
DROP FUNCTION IF EXISTS public.fn_reconcile_procurement(timestamptz);
DROP FUNCTION IF EXISTS public.fn_apply_procurement_pursuit_advance(
  text, text, bigint, integer, text, text, text, text
);
DROP FUNCTION IF EXISTS public.fn_link_procurement_run_opportunity(
  bigint, integer
);
DROP FUNCTION IF EXISTS public.fn_complete_procurement_source_run_v2(
  bigint, timestamptz, jsonb, jsonb, integer, integer, text
);
DROP FUNCTION IF EXISTS public.fn_begin_procurement_source_run_v2(
  text, text, timestamptz, text, text, jsonb
);

DROP VIEW IF EXISTS public.v_procurement_pursuit_queue;
DROP TABLE IF EXISTS public.procurement_source_run_opportunities;
DROP TABLE IF EXISTS public.procurement_pursuit_events;
DROP TABLE IF EXISTS public.procurement_pursuits;
DROP TABLE IF EXISTS public.procurement_reconciler_alerts;

ALTER TABLE public.procurement_source_runs
  DROP CONSTRAINT IF EXISTS procurement_source_run_counts_check,
  DROP CONSTRAINT IF EXISTS procurement_source_run_coverage_json_check,
  DROP COLUMN IF EXISTS adapter_version,
  DROP COLUMN IF EXISTS planned_units,
  DROP COLUMN IF EXISTS observed_units,
  DROP COLUMN IF EXISTS missing_units,
  DROP COLUMN IF EXISTS coverage_evidence,
  DROP COLUMN IF EXISTS terminal_reason;

DO $rollback$
BEGIN
  IF to_regclass('public.classification_taxonomy') IS NOT NULL THEN
    EXECUTE $sql$
      UPDATE public.classification_taxonomy
         SET auto_archive = true,
             updated_at = now()
       WHERE label IN ('MrGru/procurement/rfp', 'MrGru/procurement/rfq')
    $sql$;
  END IF;
END
$rollback$;

-- Verbatim migration-114 body.
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

-- Verbatim migration-114 body.
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

COMMIT;
