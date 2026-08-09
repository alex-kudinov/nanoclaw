\set ON_ERROR_STOP on

BEGIN;
SET search_path TO public, business_v2, pg_catalog;

SELECT opportunity_id
  FROM public.fn_record_procurement_observation(
    'caleprocure', 'test/NC-20260809-003', 'Synthetic leadership coaching RFP',
    'Synthetic Agency', current_date + 30, 'RFP',
    'https://caleprocure.ca.gov/event/test/NC-20260809-003',
    ARRAY['coaching'], now(), repeat('a', 64),
    '{"fixture":true}'::jsonb, NULL, NULL, NULL
  ) \gset

SELECT public.fn_record_procurement_review_card(
  :opportunity_id, 0, 'slack:C_TEST', '115.1', 'epoch-test',
  'process', 'Synthetic fit evidence'
) AS card_id \gset

SELECT *
  FROM public.fn_apply_procurement_review_card_decision(
    'slack:C_TEST', '115.1', :opportunity_id, 0, 'process',
    'Synthetic named-human decision', 'U_TEST', 'epoch-test'
  );

DO $smoke$
DECLARE
  v_count integer;
  v_opportunity_id integer;
BEGIN
  SELECT id INTO v_opportunity_id FROM public.procurement_opportunities
   WHERE source = 'caleprocure' AND source_key = 'test/NC-20260809-003';
  SELECT count(*) INTO v_count FROM public.procurement_pursuits
   WHERE opportunity_id = v_opportunity_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'process decision created % pursuits, expected 1', v_count;
  END IF;
  BEGIN
    PERFORM * FROM public.fn_apply_procurement_review_card_decision(
      'slack:C_TEST', '115.1', v_opportunity_id, 0, 'process',
      'Replay must fail', 'U_TEST', 'epoch-test'
    );
    RAISE EXCEPTION 'replayed decision unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'replayed decision unexpectedly succeeded' THEN RAISE; END IF;
  END;
END
$smoke$;

SELECT id AS pursuit_id, pursuit_version
  FROM public.procurement_pursuits
 WHERE opportunity_id = :opportunity_id \gset

SELECT * FROM public.fn_apply_procurement_pursuit_advance(
  'slack:C_TEST', '115.1', :pursuit_id, :pursuit_version, 'passed',
  'Synthetic kill-screen evidence', 'U_TEST', 'epoch-test'
);

DO $smoke$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.procurement_pursuits p
    JOIN public.procurement_opportunities po ON po.id = p.opportunity_id
     WHERE po.source = 'caleprocure'
       AND po.source_key = 'test/NC-20260809-003'
       AND p.pursuit_state = 'passed'
       AND pursuit_version = 1 AND closed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'pursuit did not reach evidenced terminal state';
  END IF;
  IF (SELECT count(*) FROM public.procurement_pursuit_events e
      JOIN public.procurement_pursuits p ON p.id = e.pursuit_id
      JOIN public.procurement_opportunities po ON po.id = p.opportunity_id
       WHERE po.source = 'caleprocure'
         AND po.source_key = 'test/NC-20260809-003') <> 2 THEN
    RAISE EXCEPTION 'pursuit event ledger is incomplete';
  END IF;
  IF (SELECT count(*) FROM public.procurement_reconciler_alerts a
       WHERE a.channel_jid = 'slack:C_TEST' AND a.thread_ts = '115.1'
         AND a.condition_key IN ('decision_receipt', 'pursuit_receipt')) <> 2 THEN
    RAISE EXCEPTION 'durable action receipt outbox is incomplete';
  END IF;
END
$smoke$;

SELECT run_id FROM public.fn_begin_procurement_source_run_v2(
  'caleprocure', 'smoke-complete', now(), repeat('b', 64), 'smoke-v1',
  '["coaching","leadership development"]'::jsonb
) \gset complete_
SELECT status AS complete_status
  FROM public.fn_complete_procurement_source_run_v2(
    :complete_run_id, now(),
    '["coaching","leadership development"]'::jsonb,
    '{"coaching":{"resultCount":0,"pagesVisited":1},"leadership development":{"resultCount":0,"pagesVisited":1}}'::jsonb,
    0, 0, NULL
  ) \gset

SELECT run_id FROM public.fn_begin_procurement_source_run_v2(
  'caleprocure', 'smoke-partial', now(), repeat('c', 64), 'smoke-v1',
  '["coaching","leadership development"]'::jsonb
) \gset partial_
SELECT status AS partial_status
  FROM public.fn_complete_procurement_source_run_v2(
    :partial_run_id, now(), '["coaching"]'::jsonb,
    '{"coaching":{"resultCount":0,"pagesVisited":1}}'::jsonb, 0, 0, NULL
  ) \gset
DO $smoke$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.procurement_source_runs
     WHERE source = 'caleprocure' AND run_key = 'smoke-partial'
       AND status = 'partial'
       AND missing_units = '["leadership development"]'::jsonb
  ) THEN
    RAISE EXCEPTION 'missing coverage was not recorded as partial';
  END IF;
END
$smoke$;
SELECT status AS resumed_status
  FROM public.fn_begin_procurement_source_run_v2(
    'caleprocure', 'smoke-partial', now(), repeat('c', 64), 'smoke-v1',
    '["coaching","leadership development"]'::jsonb
  ) \gset

-- The card-less repair function must fail closed for process; otherwise it
-- creates a pursuit that no exact Slack thread can ever advance.
DO $smoke$
DECLARE
  v_opportunity_id integer;
BEGIN
  SELECT id INTO v_opportunity_id FROM public.procurement_opportunities
   WHERE source = 'caleprocure' AND source_key = 'test/NC-20260809-003';
  BEGIN
    PERFORM * FROM public.fn_transition_procurement_review(
      v_opportunity_id, 1, 'process', 'Must require a card', 'U_TEST'
    );
    RAISE EXCEPTION 'card-less process decision unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'card-less process decision unexpectedly succeeded' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%require a bound Procurement review card%' THEN RAISE; END IF;
  END;
END
$smoke$;

-- A later run must retain its own link to an opportunity whose immutable
-- observation was created earlier.
SELECT public.fn_link_procurement_run_opportunity(
  :complete_run_id, :opportunity_id
);

SELECT opportunity_id
  FROM public.fn_record_procurement_observation(
    'caleprocure', 'test/NC-20260809-003-near', 'Near-deadline synthetic RFP',
    'Synthetic Agency', current_date + 10, 'RFP',
    'https://caleprocure.ca.gov/event/test/NC-20260809-003-near',
    ARRAY['coaching'], now(), repeat('e', 64),
    '{"fixture":true}'::jsonb, NULL, NULL, NULL
  ) \gset near_
SELECT public.fn_record_procurement_review_card(
  :near_opportunity_id, 0, 'slack:C_TEST', '115.3', 'epoch-test',
  'process', 'Synthetic near-deadline fixture'
);
SELECT * FROM public.fn_apply_procurement_review_card_decision(
  'slack:C_TEST', '115.3', :near_opportunity_id, 0, 'process',
  'Synthetic named-human decision', 'U_TEST', 'epoch-test'
);
SELECT id AS near_pursuit_id FROM public.procurement_pursuits
 WHERE opportunity_id = :near_opportunity_id \gset
UPDATE public.procurement_pursuits
   SET next_action_due = now() - interval '1 day'
 WHERE id = :near_pursuit_id;
INSERT INTO public.procurement_reconciler_alerts (
  condition_key, subject_kind, subject_id, subject_version, alert_text
) VALUES
  ('deadline_near', 'pursuit', :'near_pursuit_id',
   '0:' || ((now() AT TIME ZONE 'America/Chicago')::date - 1)::text,
   'prior-day fixture'),
  ('next_action_overdue', 'pursuit', :'near_pursuit_id',
   '0:' || ((now() AT TIME ZONE 'America/Chicago')::date - 1)::text,
   'prior-day fixture');
SELECT * FROM public.fn_reconcile_procurement(now());

DO $smoke$
DECLARE
  v_pursuit_id bigint;
BEGIN
  SELECT p.id INTO v_pursuit_id FROM public.procurement_pursuits p
  JOIN public.procurement_opportunities po ON po.id = p.opportunity_id
   WHERE po.source = 'caleprocure'
     AND po.source_key = 'test/NC-20260809-003-near';
  IF (SELECT count(*) FROM public.procurement_reconciler_alerts
       WHERE condition_key = 'deadline_near'
         AND subject_id = v_pursuit_id::text) <> 2 THEN
    RAISE EXCEPTION 'near-deadline pursuit did not re-alert in a new date bucket';
  END IF;
  IF (SELECT count(*) FROM public.procurement_reconciler_alerts
       WHERE condition_key = 'next_action_overdue'
         AND subject_id = v_pursuit_id::text) <> 2 THEN
    RAISE EXCEPTION 'overdue pursuit did not re-alert in a new date bucket';
  END IF;
END
$smoke$;

-- Reconciler: expiry, event ledger, exact-once claim, pending delivery, and
-- explicit delivery acknowledgment all execute in PostgreSQL.
SELECT opportunity_id
  FROM public.fn_record_procurement_observation(
    'caleprocure', 'test/NC-20260809-003-expired', 'Expired synthetic RFP',
    'Synthetic Agency', current_date - 1, 'RFP',
    'https://caleprocure.ca.gov/event/test/NC-20260809-003-expired',
    ARRAY['coaching'], now(), repeat('d', 64),
    '{"fixture":true}'::jsonb, NULL, NULL, NULL
  ) \gset expired_
SELECT public.fn_record_procurement_review_card(
  :expired_opportunity_id, 0, 'slack:C_TEST', '115.2', 'epoch-test',
  'process', 'Synthetic expiry fixture'
);
SELECT * FROM public.fn_apply_procurement_review_card_decision(
  'slack:C_TEST', '115.2', :expired_opportunity_id, 0, 'process',
  'Synthetic named-human decision', 'U_TEST', 'epoch-test'
);

SELECT alert_id AS expired_alert_id
  FROM public.fn_reconcile_procurement(now())
 WHERE alert_text LIKE '%expired without a decision%'
 ORDER BY alert_id DESC LIMIT 1 \gset

DO $smoke$
DECLARE
  v_pursuit_id bigint;
BEGIN
  SELECT p.id INTO v_pursuit_id FROM public.procurement_pursuits p
  JOIN public.procurement_opportunities po ON po.id = p.opportunity_id
   WHERE po.source = 'caleprocure'
     AND po.source_key = 'test/NC-20260809-003-expired';
  IF (SELECT pursuit_state FROM public.procurement_pursuits
       WHERE id = v_pursuit_id) <> 'expired_undecided' THEN
    RAISE EXCEPTION 'reconciler did not expire the pursuit';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.procurement_pursuit_events
     WHERE pursuit_id = v_pursuit_id AND event_type = 'reconciler_expired'
  ) THEN
    RAISE EXCEPTION 'reconciler expiry event is missing';
  END IF;
  IF (SELECT count(*) FROM public.procurement_reconciler_alerts
       WHERE condition_key = 'pursuit_expired'
         AND subject_id = v_pursuit_id::text) <> 1 THEN
    RAISE EXCEPTION 'reconciler expiry alert was not deduplicated';
  END IF;
END
$smoke$;

SELECT public.fn_ack_procurement_reconciler_alert(:expired_alert_id);
DO $smoke$
DECLARE
  v_expired_alert_id bigint;
  v_complete_run_id bigint;
  v_opportunity_id integer;
BEGIN
  SELECT a.id INTO v_expired_alert_id
    FROM public.procurement_reconciler_alerts a
   WHERE a.condition_key = 'pursuit_expired'
   ORDER BY a.id DESC LIMIT 1;
  SELECT id INTO v_complete_run_id FROM public.procurement_source_runs
   WHERE source = 'caleprocure' AND run_key = 'smoke-complete';
  SELECT id INTO v_opportunity_id FROM public.procurement_opportunities
   WHERE source = 'caleprocure' AND source_key = 'test/NC-20260809-003';
  IF (SELECT delivered_at FROM public.procurement_reconciler_alerts
       WHERE id = v_expired_alert_id) IS NULL THEN
    RAISE EXCEPTION 'reconciler delivery acknowledgment was not recorded';
  END IF;
  IF (SELECT count(*) FROM public.procurement_source_run_opportunities
       WHERE source_run_id = v_complete_run_id
         AND opportunity_id = v_opportunity_id) <> 1 THEN
    RAISE EXCEPTION 'source-run opportunity association is missing';
  END IF;
END
$smoke$;

DO $smoke$
BEGIN
  IF (SELECT status FROM public.procurement_source_runs
       WHERE source = 'caleprocure' AND run_key = 'smoke-complete') <> 'complete' THEN
    RAISE EXCEPTION 'full zero-result coverage was not complete';
  END IF;
  IF (SELECT status FROM public.procurement_source_runs
       WHERE source = 'caleprocure' AND run_key = 'smoke-partial') <> 'running' THEN
    RAISE EXCEPTION 'same-evidence partial retry did not resume';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.procurement_opportunities'::regclass
       AND conname = 'procurement_review_state_check' AND convalidated
  ) THEN
    RAISE EXCEPTION 'migration 114 review-state constraint remains unvalidated';
  END IF;
  IF has_table_privilege('nanoclaw_procurement',
       'public.procurement_pursuits', 'SELECT') THEN
    RAISE EXCEPTION 'container role can select pursuit base table';
  END IF;
  IF NOT has_table_privilege('nanoclaw_procurement',
       'public.v_procurement_pursuit_queue', 'SELECT') THEN
    RAISE EXCEPTION 'container role cannot select bounded pursuit view';
  END IF;
END
$smoke$;

ROLLBACK;
