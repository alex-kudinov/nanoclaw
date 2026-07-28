-- 01_extensions.sql — Verify citext, create business_v2 schema
-- Part of NanoClaw Schema v2 Migration (Plan #1 of 4)

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='citext') THEN
    RAISE EXCEPTION 'citext not installed — see T0 preflight';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS business_v2 AUTHORIZATION nanoclaw_admin;

COMMENT ON SCHEMA business_v2 IS 'NanoClaw v2 normalized business schema — Party/Role/Engagement. See docs/DATA-MODEL.md v1.1.';

COMMIT;
