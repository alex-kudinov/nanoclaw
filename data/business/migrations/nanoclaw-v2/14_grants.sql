-- 14_grants.sql — Role grants + permission boundary
-- Part of NanoClaw Schema v2 Migration (Plan #1 of 4)
-- Defensive 9-role check, revoke PUBLIC, grant per spec.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

-- Defensive 9-role check (halt on mismatch)
DO $$
DECLARE
  expected text[] := ARRAY['nanoclaw_admin','nanoclaw_booking','nanoclaw_chief','nanoclaw_contador',
                            'nanoclaw_inbox','nanoclaw_mailman','nanoclaw_procurement',
                            'nanoclaw_readonly','nanoclaw_sales'];
  actual text[];
BEGIN
  SELECT array_agg(rolname ORDER BY rolname) INTO actual
  FROM pg_roles WHERE rolname LIKE 'nanoclaw\_%' ESCAPE '\';
  IF actual <> (SELECT array_agg(r ORDER BY r) FROM unnest(expected) r) THEN
    RAISE EXCEPTION 'Role mismatch. Expected: %. Actual: %', expected, actual;
  END IF;
END $$;

-- Revoke everything from PUBLIC
REVOKE ALL ON SCHEMA business_v2 FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA business_v2 FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA business_v2 FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA business_v2 FROM PUBLIC;

-- USAGE on schema for all 9 roles
GRANT USAGE ON SCHEMA business_v2 TO
  nanoclaw_admin, nanoclaw_booking, nanoclaw_chief, nanoclaw_contador,
  nanoclaw_inbox, nanoclaw_mailman, nanoclaw_procurement,
  nanoclaw_readonly, nanoclaw_sales;

-- Full access for admin
GRANT ALL ON ALL TABLES IN SCHEMA business_v2 TO nanoclaw_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA business_v2 TO nanoclaw_admin;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA business_v2 TO nanoclaw_admin;

-- SELECT on 6 views for readonly + 7 agent roles
GRANT SELECT ON
  business_v2.v_party_contact_card,
  business_v2.v_active_pipeline,
  business_v2.v_active_engagements,
  business_v2.v_party_timeline,
  business_v2.v_client_status,
  business_v2.v_program_variant_seats
TO nanoclaw_readonly, nanoclaw_booking, nanoclaw_chief, nanoclaw_contador,
   nanoclaw_inbox, nanoclaw_mailman, nanoclaw_procurement, nanoclaw_sales;

-- SELECT on 14 lookups for readonly + 7 agent roles
GRANT SELECT ON
  business_v2.role_types,
  business_v2.contact_roles,
  business_v2.relationship_types,
  business_v2.program_kinds,
  business_v2.engagement_kinds,
  business_v2.participant_roles,
  business_v2.pipeline_stages,
  business_v2.lost_reasons,
  business_v2.interaction_channels,
  business_v2.source_providers,
  business_v2.document_kinds,
  business_v2.document_statuses,
  business_v2.plutio_outbox_operations,
  business_v2.plutio_outbox_statuses
TO nanoclaw_readonly, nanoclaw_booking, nanoclaw_chief, nanoclaw_contador,
   nanoclaw_inbox, nanoclaw_mailman, nanoclaw_procurement, nanoclaw_sales;

-- EXECUTE on 11 callable helpers only (NOT trigger functions) for 7 agent roles
GRANT EXECUTE ON FUNCTION business_v2.canonical_party_id(bigint) TO
  nanoclaw_booking, nanoclaw_chief, nanoclaw_contador,
  nanoclaw_inbox, nanoclaw_mailman, nanoclaw_procurement, nanoclaw_sales;

GRANT EXECUTE ON FUNCTION business_v2.resolve_parties_by_email(citext) TO
  nanoclaw_booking, nanoclaw_chief, nanoclaw_contador,
  nanoclaw_inbox, nanoclaw_mailman, nanoclaw_procurement, nanoclaw_sales;

GRANT EXECUTE ON FUNCTION business_v2.best_party_by_email(citext) TO
  nanoclaw_booking, nanoclaw_chief, nanoclaw_contador,
  nanoclaw_inbox, nanoclaw_mailman, nanoclaw_procurement, nanoclaw_sales;

GRANT EXECUTE ON FUNCTION business_v2.fn_merge_parties(bigint, bigint, text) TO
  nanoclaw_booking, nanoclaw_chief, nanoclaw_contador,
  nanoclaw_inbox, nanoclaw_mailman, nanoclaw_procurement, nanoclaw_sales;

GRANT EXECUTE ON FUNCTION business_v2.fn_issue_document(bigint, text, int, text, jsonb) TO
  nanoclaw_booking, nanoclaw_chief, nanoclaw_contador,
  nanoclaw_inbox, nanoclaw_mailman, nanoclaw_procurement, nanoclaw_sales;

GRANT EXECUTE ON FUNCTION business_v2.fn_log_interaction(bigint, text, text, text, timestamptz, jsonb) TO
  nanoclaw_booking, nanoclaw_chief, nanoclaw_contador,
  nanoclaw_inbox, nanoclaw_mailman, nanoclaw_procurement, nanoclaw_sales;

GRANT EXECUTE ON FUNCTION business_v2.fn_create_pipeline_entry(bigint, bigint, text, int, text, jsonb) TO
  nanoclaw_booking, nanoclaw_chief, nanoclaw_contador,
  nanoclaw_inbox, nanoclaw_mailman, nanoclaw_procurement, nanoclaw_sales;

GRANT EXECUTE ON FUNCTION business_v2.fn_advance_pipeline_stage(bigint, text, text) TO
  nanoclaw_booking, nanoclaw_chief, nanoclaw_contador,
  nanoclaw_inbox, nanoclaw_mailman, nanoclaw_procurement, nanoclaw_sales;

-- Lock down DEFAULT PRIVILEGES for future tables in business_v2
ALTER DEFAULT PRIVILEGES IN SCHEMA business_v2 REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA business_v2 REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA business_v2 REVOKE ALL ON SEQUENCES FROM PUBLIC;

-- Assert all 17 functions owned by nanoclaw_admin
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v_bad
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'business_v2'
    AND p.proowner <> (SELECT oid FROM pg_roles WHERE rolname = 'nanoclaw_admin');

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Functions NOT owned by nanoclaw_admin: %', v_bad;
  END IF;
END $$;

COMMIT;
