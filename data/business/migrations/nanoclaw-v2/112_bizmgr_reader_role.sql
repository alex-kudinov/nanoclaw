-- 112_bizmgr_reader_role.sql
--
-- Dedicated least-privilege login role for the bizmgr bookkeeping pipeline,
-- which reads inbound vendor bills out of business_v2 and books them into
-- QuickBooks Desktop.
--
-- Why not reuse an existing role:
--   * nanoclaw_readonly is NOLOGIN — it is a grant-only group role, so no
--     client can authenticate as it.
--   * nanoclaw_contador CAN log in, but holds EXECUTE on the write helpers
--     (fn_issue_document, fn_merge_parties, fn_advance_pipeline_stage, ...).
--     Handing that to a downstream reader is more authority than the job needs.
--   * nanoclaw_admin owns every function and table in the schema.
--
-- Why the name is NOT prefixed 'nanoclaw_': 14_grants.sql:12 and
-- validate.sql:231 both assert that the set of roles matching 'nanoclaw\_%'
-- is EXACTLY the expected nine, raising an exception otherwise. A tenth
-- nanoclaw_* role would break every future re-run of both scripts. Naming
-- this role 'bizmgr_reader' keeps that invariant intact.
--
-- SECURITY: this file intentionally contains NO password. The role is created
-- LOGIN but unusable until a password is set out of band:
--
--     ALTER ROLE bizmgr_reader PASSWORD '<generated>';
--
-- The secret lives in bizmgr/.env and toolbox/.env as
-- BUSINESS_DB_PASS_BIZMGR_READER, never in this repo.
--
-- Access path: the Studio is rejected by pg_hba.conf for every role, and this
-- server does not support SSL, so bizmgr connects over an SSH tunnel
-- (localhost:15432 -> Mini 127.0.0.1:5432), which presents as 127.0.0.1.
-- No pg_hba change is required.
--
-- Idempotent and reversible:
--     REVOKE ALL ON business_v2.v_inbound_documents FROM bizmgr_reader;
--     REVOKE USAGE ON SCHEMA business_v2 FROM bizmgr_reader;
--     DROP ROLE bizmgr_reader;
--
-- Depends: 111_v_inbound_documents.sql

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bizmgr_reader') THEN
    CREATE ROLE bizmgr_reader LOGIN;
  END IF;
END $$;

COMMENT ON ROLE bizmgr_reader IS
  'Least-privilege reader for the bizmgr bookkeeping pipeline. SELECT on business_v2.v_inbound_documents only. Connects via SSH tunnel from the Studio.';

-- Exactly two grants: schema visibility, and the one view.
GRANT USAGE ON SCHEMA business_v2 TO bizmgr_reader;
GRANT SELECT ON business_v2.v_inbound_documents TO bizmgr_reader;

-- Assert the blast radius is really just that one relation.
DO $$
DECLARE
  v_extra text;
BEGIN
  SELECT string_agg(table_schema || '.' || table_name, ', ')
    INTO v_extra
    FROM information_schema.table_privileges
   WHERE grantee = 'bizmgr_reader'
     AND NOT (table_schema = 'business_v2' AND table_name = 'v_inbound_documents');

  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION 'bizmgr_reader has unexpected grants on: %', v_extra;
  END IF;
END $$;

COMMIT;
