\set ON_ERROR_STOP on

BEGIN;
SET search_path TO public, business_v2, pg_catalog;

DO $smoke$
BEGIN
  IF to_regclass('public.procurement_pursuits') IS NOT NULL
     OR to_regclass('public.procurement_pursuit_events') IS NOT NULL
     OR to_regclass('public.procurement_reconciler_alerts') IS NOT NULL
     OR to_regclass('public.procurement_source_run_opportunities') IS NOT NULL THEN
    RAISE EXCEPTION 'migration-115 tables remain after rollback';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'procurement_source_runs'
       AND column_name IN (
         'adapter_version', 'planned_units', 'observed_units', 'missing_units',
         'coverage_evidence', 'terminal_reason'
       )
  ) THEN
    RAISE EXCEPTION 'migration-115 source-run columns remain after rollback';
  END IF;
  IF to_regprocedure('public.fn_reconcile_procurement(timestamptz)') IS NOT NULL
     OR to_regprocedure('public.fn_apply_procurement_pursuit_advance(text,text,bigint,integer,text,text,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'migration-115 functions remain after rollback';
  END IF;
  IF position(
       'procurement_pursuits' IN pg_get_functiondef(
         'public.fn_transition_procurement_review(integer,integer,text,text,text)'::regprocedure
       )
     ) > 0 OR position(
       'procurement_pursuits' IN pg_get_functiondef(
         'public.fn_apply_procurement_review_card_decision(text,text,integer,integer,text,text,text,text)'::regprocedure
       )
     ) > 0 THEN
    RAISE EXCEPTION 'migration-114 function bodies were not restored';
  END IF;
END
$smoke$;

SELECT opportunity_id
  FROM public.fn_record_procurement_observation(
    'caleprocure', 'test/rollback-115-programmatic', 'Rollback programmatic RFP',
    'Synthetic Agency', current_date + 30, 'RFP',
    'https://caleprocure.ca.gov/event/test/rollback-115-programmatic',
    ARRAY['coaching'], now(), repeat('f', 64),
    '{"fixture":true}'::jsonb, NULL, NULL, NULL
  ) \gset programmatic_
SELECT * FROM public.fn_transition_procurement_review(
  :programmatic_opportunity_id, 0, 'process',
  'Migration-114 programmatic behavior restored', 'U_TEST'
);

SELECT opportunity_id
  FROM public.fn_record_procurement_observation(
    'caleprocure', 'test/rollback-115-card', 'Rollback card RFP',
    'Synthetic Agency', current_date + 30, 'RFP',
    'https://caleprocure.ca.gov/event/test/rollback-115-card',
    ARRAY['coaching'], now(), repeat('1', 64),
    '{"fixture":true}'::jsonb, NULL, NULL, NULL
  ) \gset card_
SELECT public.fn_record_procurement_review_card(
  :card_opportunity_id, 0, 'slack:C_TEST', 'rollback.115', 'epoch-test',
  'process', 'Rollback fixture'
);
SELECT * FROM public.fn_apply_procurement_review_card_decision(
  'slack:C_TEST', 'rollback.115', :card_opportunity_id, 0, 'process',
  'Migration-114 card behavior restored', 'U_TEST', 'epoch-test'
);

ROLLBACK;
