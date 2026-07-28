-- 91_permission_smoke.sql — Permission boundary verification for all 7 agent roles
-- Run as nanoclaw_admin. Uses has_table_privilege() and has_function_privilege().

DO $$
DECLARE
  v_roles text[] := ARRAY['nanoclaw_inbox','nanoclaw_sales','nanoclaw_mailman','nanoclaw_chief','nanoclaw_booking','nanoclaw_contador','nanoclaw_procurement'];
  v_views text[] := ARRAY['v_party_contact_card','v_active_pipeline','v_active_engagements','v_party_timeline','v_client_status','v_program_variant_seats'];
  v_helpers text[] := ARRAY[
    'business_v2.fn_create_party(text,text,citext,text,jsonb)',
    'business_v2.fn_add_party_role(bigint,text)',
    'business_v2.fn_log_interaction_dedup(bigint,text,text,text,timestamptz,jsonb,text,text)',
    'business_v2.fn_log_interaction(bigint,text,text,text,timestamptz,jsonb)',
    'business_v2.fn_create_pipeline_entry(bigint,bigint,text,int,text,jsonb)',
    'business_v2.fn_advance_pipeline_stage(bigint,text,text)',
    'business_v2.fn_issue_document(bigint,text,int,text,jsonb)',
    'business_v2.fn_merge_parties(bigint,bigint,text)',
    'business_v2.canonical_party_id(bigint)',
    'business_v2.resolve_parties_by_email(citext)',
    'business_v2.best_party_by_email(citext)'
  ];
  v_base_tables text[] := ARRAY['parties','party_emails','party_roles','interactions','documents','pipeline_entries'];
  v_lookups text[] := ARRAY['role_types','contact_roles','relationship_types','program_kinds','engagement_kinds','participant_roles','pipeline_stages','lost_reasons','interaction_channels','source_providers','document_kinds','document_statuses','plutio_outbox_operations','plutio_outbox_statuses','programs'];
  v_role text;
  v_item text;
  v_pass int := 0;
  v_fail int := 0;
BEGIN
  FOREACH v_role IN ARRAY v_roles LOOP
    RAISE NOTICE '=== % ===', v_role;

    -- Views: should have SELECT
    FOREACH v_item IN ARRAY v_views LOOP
      IF has_table_privilege(v_role, 'business_v2.' || v_item, 'SELECT') THEN
        v_pass := v_pass + 1;
      ELSE
        RAISE NOTICE '  FAIL: % cannot SELECT view %', v_role, v_item;
        v_fail := v_fail + 1;
      END IF;
    END LOOP;

    -- Lookups: should have SELECT
    FOREACH v_item IN ARRAY v_lookups LOOP
      IF has_table_privilege(v_role, 'business_v2.' || v_item, 'SELECT') THEN
        v_pass := v_pass + 1;
      ELSE
        RAISE NOTICE '  FAIL: % cannot SELECT lookup %', v_role, v_item;
        v_fail := v_fail + 1;
      END IF;
    END LOOP;

    -- Helpers: should have EXECUTE
    FOREACH v_item IN ARRAY v_helpers LOOP
      IF has_function_privilege(v_role, v_item, 'EXECUTE') THEN
        v_pass := v_pass + 1;
      ELSE
        RAISE NOTICE '  FAIL: % cannot EXECUTE %', v_role, v_item;
        v_fail := v_fail + 1;
      END IF;
    END LOOP;

    -- Base tables: should NOT have SELECT
    FOREACH v_item IN ARRAY v_base_tables LOOP
      IF has_table_privilege(v_role, 'business_v2.' || v_item, 'SELECT') THEN
        RAISE NOTICE '  FAIL: % CAN SELECT base table % (should be denied)', v_role, v_item;
        v_fail := v_fail + 1;
      ELSE
        v_pass := v_pass + 1;
      END IF;
    END LOOP;

    -- Base tables: should NOT have INSERT
    FOREACH v_item IN ARRAY v_base_tables LOOP
      IF has_table_privilege(v_role, 'business_v2.' || v_item, 'INSERT') THEN
        RAISE NOTICE '  FAIL: % CAN INSERT base table % (should be denied)', v_role, v_item;
        v_fail := v_fail + 1;
      ELSE
        v_pass := v_pass + 1;
      END IF;
    END LOOP;

  END LOOP;

  -- Procurement exception: public.procurement_opportunities
  IF has_table_privilege('nanoclaw_procurement', 'public.procurement_opportunities', 'SELECT') THEN
    v_pass := v_pass + 1;
  ELSE
    RAISE NOTICE '  FAIL: nanoclaw_procurement cannot SELECT public.procurement_opportunities';
    v_fail := v_fail + 1;
  END IF;
  IF has_table_privilege('nanoclaw_procurement', 'public.procurement_opportunities', 'INSERT') THEN
    v_pass := v_pass + 1;
  ELSE
    RAISE NOTICE '  FAIL: nanoclaw_procurement cannot INSERT public.procurement_opportunities';
    v_fail := v_fail + 1;
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE 'Permission smoke: % passed, % failed', v_pass, v_fail;
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'Permission smoke FAILED: % checks failed', v_fail;
  END IF;
  RAISE NOTICE 'OVERALL: PASS';
END $$;
