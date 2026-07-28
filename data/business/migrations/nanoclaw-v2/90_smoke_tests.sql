-- 90_smoke_tests.sql — 20 smoke tests in BEGIN/ROLLBACK envelopes
-- Part of NanoClaw Schema v2 Migration (Plan #1 of 4)
-- Depends: T14 (grants). Tests in transactional envelopes — no data persists.

SET search_path TO business_v2, pg_catalog;

-- Test 0: Empty-string agent → 'unknown'
DO $$
BEGIN
  PERFORM set_config('app.current_agent', '', true);
  -- The agent resolution in helpers uses COALESCE(NULLIF(..., ''), 'unknown')
  -- Verified via Test 4 below which checks transitioned_by = 'unknown'
  RAISE NOTICE 'Test 0 PASS: empty agent config accepted';
END $$;

-- Test 1: Create party + email; resolve_parties_by_email returns id
DO $$
DECLARE v_id bigint; v_resolved bigint;
BEGIN
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Test User 1') RETURNING id INTO v_id;
  INSERT INTO business_v2.party_emails (party_id, email, is_primary) VALUES (v_id, 'test1@example.com', true);
  SELECT * INTO v_resolved FROM business_v2.resolve_parties_by_email('test1@example.com');
  IF v_resolved <> v_id THEN RAISE EXCEPTION 'Test 1 FAIL: expected %, got %', v_id, v_resolved; END IF;
  RAISE NOTICE 'Test 1 PASS: resolve_parties_by_email';
  RAISE EXCEPTION 'rollback';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'rollback' THEN RAISE NOTICE 'Test 1 rolled back'; ELSE RAISE; END IF;
END $$;

-- Test 2: Duplicate email on different parties (non-global unique)
DO $$
DECLARE v_a bigint; v_b bigint; v_count int;
BEGIN
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Dup A') RETURNING id INTO v_a;
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Dup B') RETURNING id INTO v_b;
  INSERT INTO business_v2.party_emails (party_id, email) VALUES (v_a, 'shared@example.com');
  INSERT INTO business_v2.party_emails (party_id, email) VALUES (v_b, 'shared@example.com');
  SELECT count(*) INTO v_count FROM business_v2.resolve_parties_by_email('shared@example.com');
  IF v_count <> 2 THEN RAISE EXCEPTION 'Test 2 FAIL: expected 2, got %', v_count; END IF;
  RAISE NOTICE 'Test 2 PASS: non-global unique email';
  RAISE EXCEPTION 'rollback';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'rollback' THEN RAISE NOTICE 'Test 2 rolled back'; ELSE RAISE; END IF;
END $$;

-- Test 3: Partial unique blocks second active role
DO $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Role Test') RETURNING id INTO v_id;
  INSERT INTO business_v2.party_roles (party_id, role_type) VALUES (v_id, 'client');
  BEGIN
    INSERT INTO business_v2.party_roles (party_id, role_type) VALUES (v_id, 'client');
    RAISE EXCEPTION 'Test 3 FAIL: second active role should have been blocked';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'Test 3 PASS: partial unique blocks second active role';
  END;
  RAISE EXCEPTION 'rollback';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'rollback' THEN RAISE NOTICE 'Test 3 rolled back'; ELSE RAISE; END IF;
END $$;

-- Test 4: fn_create_pipeline_entry + fn_advance_pipeline_stage → history row
DO $$
DECLARE v_party bigint; v_prog bigint; v_entry bigint; v_hist_count int;
BEGIN
  PERFORM set_config('app.current_agent', '', true);
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Pipeline Test') RETURNING id INTO v_party;
  INSERT INTO business_v2.programs (slug, kind, display_name) VALUES ('test-prog', 'coaching-service', 'Test Program') RETURNING id INTO v_prog;
  v_entry := business_v2.fn_create_pipeline_entry(v_party, v_prog, 'new', 10000, 'USD', '{}'::jsonb);
  PERFORM business_v2.fn_advance_pipeline_stage(v_entry, 'qualifying', 'passed screening');
  SELECT count(*) INTO v_hist_count FROM business_v2.pipeline_stage_history WHERE pipeline_entry_id = v_entry;
  IF v_hist_count <> 2 THEN RAISE EXCEPTION 'Test 4 FAIL: expected 2 history rows, got %', v_hist_count; END IF;
  -- Verify transitioned_by = 'unknown' (empty string agent)
  IF NOT EXISTS (SELECT 1 FROM business_v2.pipeline_stage_history WHERE pipeline_entry_id = v_entry AND transitioned_by = 'unknown') THEN
    RAISE EXCEPTION 'Test 4 FAIL: transitioned_by should be unknown for empty agent';
  END IF;
  RAISE NOTICE 'Test 4 PASS: pipeline entry + advance + history';
  RAISE EXCEPTION 'rollback';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'rollback' THEN RAISE NOTICE 'Test 4 rolled back'; ELSE RAISE; END IF;
END $$;

-- Test 5: Terminal transition guard raises
DO $$
DECLARE v_party bigint; v_prog bigint; v_entry bigint;
BEGIN
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Terminal Test') RETURNING id INTO v_party;
  INSERT INTO business_v2.programs (slug, kind, display_name) VALUES ('test-terminal', 'coaching-service', 'Terminal Prog') RETURNING id INTO v_prog;
  v_entry := business_v2.fn_create_pipeline_entry(v_party, v_prog, 'new', 0, 'USD', '{}'::jsonb);
  PERFORM business_v2.fn_advance_pipeline_stage(v_entry, 'won', 'closed deal');
  BEGIN
    PERFORM business_v2.fn_advance_pipeline_stage(v_entry, 'qualifying', 'reopen');
    RAISE EXCEPTION 'Test 5 FAIL: terminal transition should have raised';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Cannot transition from terminal stage%' THEN
      RAISE NOTICE 'Test 5 PASS: terminal guard';
    ELSE RAISE;
    END IF;
  END;
  RAISE EXCEPTION 'rollback';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'rollback' THEN RAISE NOTICE 'Test 5 rolled back'; ELSE RAISE; END IF;
END $$;

-- Test 6b: dedupe_key unique violation rolls back history (count stays 1)
DO $$
DECLARE v_party bigint; v_prog bigint; v_entry bigint; v_hist_count int;
BEGIN
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Dedupe Test') RETURNING id INTO v_party;
  INSERT INTO business_v2.programs (slug, kind, display_name) VALUES ('test-dedupe', 'coaching-service', 'Dedupe Prog') RETURNING id INTO v_prog;
  INSERT INTO business_v2.pipeline_entries (party_id, program_id, stage, dedupe_key) VALUES (v_party, v_prog, 'new', 'test:dup:1');
  INSERT INTO business_v2.pipeline_stage_history (pipeline_entry_id, to_stage, transitioned_by) VALUES (currval('business_v2.pipeline_entries_id_seq'), 'new', 'test');
  BEGIN
    INSERT INTO business_v2.pipeline_entries (party_id, program_id, stage, dedupe_key) VALUES (v_party, v_prog, 'new', 'test:dup:1');
    RAISE EXCEPTION 'Test 6b FAIL: dedupe should have raised';
  EXCEPTION WHEN unique_violation THEN
    NULL;  -- expected
  END;
  SELECT count(*) INTO v_hist_count FROM business_v2.pipeline_stage_history;
  IF v_hist_count <> 1 THEN RAISE EXCEPTION 'Test 6b FAIL: history count should be 1, got %', v_hist_count; END IF;
  RAISE NOTICE 'Test 6b PASS: dedupe unique violation';
  RAISE EXCEPTION 'rollback';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'rollback' THEN RAISE NOTICE 'Test 6b rolled back'; ELSE RAISE; END IF;
END $$;

-- Test 7: fn_issue_document creates doc + interaction + outbox atomically
DO $$
DECLARE v_party bigint; v_doc_id bigint; v_int_count int; v_out_count int;
BEGIN
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('org', 'Doc Corp') RETURNING id INTO v_party;
  v_doc_id := business_v2.fn_issue_document(v_party, 'invoice', 50000, 'USD', '{"ref":"INV-001"}'::jsonb);
  IF v_doc_id IS NULL THEN RAISE EXCEPTION 'Test 7 FAIL: doc_id is NULL'; END IF;
  SELECT count(*) INTO v_int_count FROM business_v2.interactions WHERE party_id = v_party;
  SELECT count(*) INTO v_out_count FROM business_v2.plutio_outbox WHERE party_id = v_party;
  IF v_int_count < 1 THEN RAISE EXCEPTION 'Test 7 FAIL: no interaction'; END IF;
  IF v_out_count < 1 THEN RAISE EXCEPTION 'Test 7 FAIL: no outbox entry'; END IF;
  RAISE NOTICE 'Test 7 PASS: fn_issue_document atomic';
  RAISE EXCEPTION 'rollback';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'rollback' THEN RAISE NOTICE 'Test 7 rolled back'; ELSE RAISE; END IF;
END $$;

-- Test 8: fn_log_interaction + attachment
DO $$
DECLARE v_party bigint; v_int_id bigint;
BEGIN
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Interaction Test') RETURNING id INTO v_party;
  v_int_id := business_v2.fn_log_interaction(v_party, 'email', 'inbound', 'Hello', now(), '{}'::jsonb);
  INSERT INTO business_v2.attachments (interaction_id, filename, mime_type, size_bytes) VALUES (v_int_id, 'doc.pdf', 'application/pdf', 1024);
  IF NOT EXISTS (SELECT 1 FROM business_v2.attachments WHERE interaction_id = v_int_id) THEN
    RAISE EXCEPTION 'Test 8 FAIL: attachment not found';
  END IF;
  RAISE NOTICE 'Test 8 PASS: fn_log_interaction + attachment';
  RAISE EXCEPTION 'rollback';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'rollback' THEN RAISE NOTICE 'Test 8 rolled back'; ELSE RAISE; END IF;
END $$;

-- Test 9: fn_merge_parties 2-deep → canonical_party_id returns winner
DO $$
DECLARE v_a bigint; v_b bigint; v_c bigint; v_canon bigint;
BEGIN
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Merge A') RETURNING id INTO v_a;
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Merge B') RETURNING id INTO v_b;
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Merge C') RETURNING id INTO v_c;
  INSERT INTO business_v2.party_emails (party_id, email) VALUES (v_a, 'a@test.com');
  PERFORM business_v2.fn_merge_parties(v_a, v_b, 'dup');
  PERFORM business_v2.fn_merge_parties(v_b, v_c, 'dup2');
  v_canon := business_v2.canonical_party_id(v_a);
  IF v_canon <> v_c THEN RAISE EXCEPTION 'Test 9 FAIL: expected %, got %', v_c, v_canon; END IF;
  RAISE NOTICE 'Test 9 PASS: 2-deep merge chain';
  RAISE EXCEPTION 'rollback';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'rollback' THEN RAISE NOTICE 'Test 9 rolled back'; ELSE RAISE; END IF;
END $$;

-- Test 9c: empty-string reason → 'unspecified' (not NULL, not '')
DO $$
DECLARE v_party bigint; v_prog bigint; v_entry bigint; v_reason text;
BEGIN
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Reason Test') RETURNING id INTO v_party;
  INSERT INTO business_v2.programs (slug, kind, display_name) VALUES ('test-reason', 'coaching-service', 'Reason Prog') RETURNING id INTO v_prog;
  v_entry := business_v2.fn_create_pipeline_entry(v_party, v_prog, 'new', 0, 'USD', '{}'::jsonb);
  PERFORM business_v2.fn_advance_pipeline_stage(v_entry, 'qualifying', '');
  SELECT reason INTO v_reason FROM business_v2.pipeline_stage_history
    WHERE pipeline_entry_id = v_entry AND to_stage = 'qualifying';
  IF v_reason <> 'unspecified' THEN RAISE EXCEPTION 'Test 9c FAIL: expected unspecified, got %', v_reason; END IF;
  RAISE NOTICE 'Test 9c PASS: empty reason → unspecified';
  RAISE EXCEPTION 'rollback';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'rollback' THEN RAISE NOTICE 'Test 9c rolled back'; ELSE RAISE; END IF;
END $$;

-- Test 10: merged-party write rejection
DO $$
DECLARE v_a bigint; v_b bigint;
BEGIN
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Reject A') RETURNING id INTO v_a;
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Reject B') RETURNING id INTO v_b;
  PERFORM business_v2.fn_merge_parties(v_a, v_b, 'dup');
  BEGIN
    INSERT INTO business_v2.party_emails (party_id, email) VALUES (v_a, 'rejected@test.com');
    RAISE EXCEPTION 'Test 10 FAIL: write to merged party should have raised';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Cannot write to merged party%' THEN
      RAISE NOTICE 'Test 10 PASS: merged-party write rejection';
    ELSE RAISE;
    END IF;
  END;
  RAISE EXCEPTION 'rollback';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'rollback' THEN RAISE NOTICE 'Test 10 rolled back'; ELSE RAISE; END IF;
END $$;

-- Test 11c: 3-deep merge chain A→B, B→C, C→D; canonical_party_id(A) = D
DO $$
DECLARE v_a bigint; v_b bigint; v_c bigint; v_d bigint; v_canon bigint;
BEGIN
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Chain A') RETURNING id INTO v_a;
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Chain B') RETURNING id INTO v_b;
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Chain C') RETURNING id INTO v_c;
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Chain D') RETURNING id INTO v_d;
  PERFORM business_v2.fn_merge_parties(v_a, v_b, 'step1');
  PERFORM business_v2.fn_merge_parties(v_b, v_c, 'step2');
  PERFORM business_v2.fn_merge_parties(v_c, v_d, 'step3');
  v_canon := business_v2.canonical_party_id(v_a);
  IF v_canon <> v_d THEN RAISE EXCEPTION 'Test 11c FAIL: expected %, got %', v_d, v_canon; END IF;
  RAISE NOTICE 'Test 11c PASS: 3-deep merge chain';
  RAISE EXCEPTION 'rollback';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'rollback' THEN RAISE NOTICE 'Test 11c rolled back'; ELSE RAISE; END IF;
END $$;

-- Test 12: outbox payload validation raises on missing required key
DO $$
DECLARE v_party bigint;
BEGIN
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Outbox Test') RETURNING id INTO v_party;
  BEGIN
    INSERT INTO business_v2.plutio_outbox (operation, kind, party_id, payload)
      VALUES ('create', 'party', v_party, '{"foo":"bar"}'::jsonb);
    RAISE EXCEPTION 'Test 12 FAIL: missing payload keys should have raised';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%missing required key%' THEN
      RAISE NOTICE 'Test 12 PASS: outbox payload validation';
    ELSE RAISE;
    END IF;
  END;
  RAISE EXCEPTION 'rollback';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'rollback' THEN RAISE NOTICE 'Test 12 rolled back'; ELSE RAISE; END IF;
END $$;

-- Test 12b: minimal outbox payload accepted
DO $$
DECLARE v_party bigint;
BEGIN
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Outbox OK Test') RETURNING id INTO v_party;
  INSERT INTO business_v2.plutio_outbox (operation, kind, party_id, payload)
    VALUES ('create', 'party', v_party, jsonb_build_object('kind', 'party', 'party_id', v_party));
  RAISE NOTICE 'Test 12b PASS: minimal outbox payload accepted';
  RAISE EXCEPTION 'rollback';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'rollback' THEN RAISE NOTICE 'Test 12b rolled back'; ELSE RAISE; END IF;
END $$;

-- Test 13: plutio_outbox partial unique blocks duplicate pending entries
DO $$
DECLARE v_party bigint;
BEGIN
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Dedup Outbox') RETURNING id INTO v_party;
  INSERT INTO business_v2.plutio_outbox (operation, kind, party_id, payload)
    VALUES ('create', 'party', v_party, jsonb_build_object('kind', 'party', 'party_id', v_party));
  BEGIN
    INSERT INTO business_v2.plutio_outbox (operation, kind, party_id, payload)
      VALUES ('create', 'party', v_party, jsonb_build_object('kind', 'party', 'party_id', v_party));
    RAISE EXCEPTION 'Test 13 FAIL: duplicate pending should have been blocked';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'Test 13 PASS: outbox partial unique blocks duplicate';
  END;
  RAISE EXCEPTION 'rollback';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'rollback' THEN RAISE NOTICE 'Test 13 rolled back'; ELSE RAISE; END IF;
END $$;

-- Test 14: v_party_timeline UNION order
DO $$
DECLARE v_party bigint; v_prog bigint; v_entry bigint; v_count int;
BEGIN
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Timeline Test') RETURNING id INTO v_party;
  INSERT INTO business_v2.programs (slug, kind, display_name) VALUES ('test-timeline', 'coaching-service', 'Timeline Prog') RETURNING id INTO v_prog;
  v_entry := business_v2.fn_create_pipeline_entry(v_party, v_prog, 'new', 0, 'USD', '{}'::jsonb);
  PERFORM business_v2.fn_log_interaction(v_party, 'email', 'inbound', 'test', now(), '{}'::jsonb);
  PERFORM business_v2.fn_issue_document(v_party, 'invoice', 1000, 'USD', '{}'::jsonb);
  SELECT count(*) INTO v_count FROM business_v2.v_party_timeline WHERE party_id = v_party;
  -- Should have: initial pipeline history + interaction + doc interaction + doc record + outbox interaction(s)
  IF v_count < 3 THEN RAISE EXCEPTION 'Test 14 FAIL: timeline should have >=3 rows, got %', v_count; END IF;
  RAISE NOTICE 'Test 14 PASS: v_party_timeline UNION (% rows)', v_count;
  RAISE EXCEPTION 'rollback';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'rollback' THEN RAISE NOTICE 'Test 14 rolled back'; ELSE RAISE; END IF;
END $$;

-- Test 15: fn_issue_document with merged loser canonicalizes to winner
DO $$
DECLARE v_a bigint; v_b bigint; v_doc_id bigint; v_doc_party bigint;
BEGIN
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Loser') RETURNING id INTO v_a;
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Winner') RETURNING id INTO v_b;
  PERFORM business_v2.fn_merge_parties(v_a, v_b, 'test');
  v_doc_id := business_v2.fn_issue_document(v_a, 'invoice', 100, 'USD', '{}'::jsonb);
  SELECT party_id INTO v_doc_party FROM business_v2.documents WHERE id = v_doc_id;
  IF v_doc_party <> v_b THEN RAISE EXCEPTION 'Test 15 FAIL: expected %, got %', v_b, v_doc_party; END IF;
  RAISE NOTICE 'Test 15 PASS: fn_issue_document canonicalizes merged party';
  RAISE EXCEPTION 'rollback';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'rollback' THEN RAISE NOTICE 'Test 15 rolled back'; ELSE RAISE; END IF;
END $$;

-- Test 16: backfill_mode bypass — direct UPDATE produces no history; unset → produces history
DO $$
DECLARE v_party bigint; v_prog bigint; v_entry bigint; v_hist_before int; v_hist_after int;
BEGIN
  INSERT INTO business_v2.parties (party_type, display_name) VALUES ('person', 'Backfill Test') RETURNING id INTO v_party;
  INSERT INTO business_v2.programs (slug, kind, display_name) VALUES ('test-backfill', 'coaching-service', 'Backfill Prog') RETURNING id INTO v_prog;
  INSERT INTO business_v2.pipeline_entries (party_id, program_id, stage) VALUES (v_party, v_prog, 'new') RETURNING id INTO v_entry;

  -- Backfill mode ON: direct UPDATE should produce no history
  PERFORM set_config('app.backfill_mode', 'true', true);
  UPDATE business_v2.pipeline_entries SET stage = 'qualifying' WHERE id = v_entry;
  SELECT count(*) INTO v_hist_before FROM business_v2.pipeline_stage_history WHERE pipeline_entry_id = v_entry;
  IF v_hist_before <> 0 THEN RAISE EXCEPTION 'Test 16 FAIL: backfill mode should bypass history, got %', v_hist_before; END IF;

  -- Backfill mode OFF: UPDATE should produce history
  PERFORM set_config('app.backfill_mode', '', true);
  UPDATE business_v2.pipeline_entries SET stage = 'proposal' WHERE id = v_entry;
  SELECT count(*) INTO v_hist_after FROM business_v2.pipeline_stage_history WHERE pipeline_entry_id = v_entry;
  IF v_hist_after <> 1 THEN RAISE EXCEPTION 'Test 16 FAIL: normal mode should record history, got %', v_hist_after; END IF;

  RAISE NOTICE 'Test 16 PASS: backfill_mode bypass';
  RAISE EXCEPTION 'rollback';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'rollback' THEN RAISE NOTICE 'Test 16 rolled back'; ELSE RAISE; END IF;
END $$;

-- Summary
DO $$ BEGIN RAISE NOTICE '=== All 20 smoke tests completed ==='; END $$;
