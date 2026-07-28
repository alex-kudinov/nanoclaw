-- 99_source_providers_chaos.sql
-- Chaos → NanoClaw leads pipeline: register 'chaos' as a source_provider.
--
-- business_v2.parties.source_provider is an FK to source_providers(key), so
-- fn_create_party(... 'chaos' ...) fails the FK constraint unless 'chaos' is a
-- seeded key. Every chaos webhook ingestion creates a party with this value.
--
-- Online-safe: single idempotent lookup-row insert.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

INSERT INTO business_v2.source_providers (key, label, description, enabled)
VALUES (
  'chaos',
  'Chaos Tracker',
  'Email-verified website visitors from the Chaos analytics plugin',
  true
)
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- Smoke (BEGIN/ROLLBACK)
BEGIN;
DO $$
DECLARE v int;
BEGIN
  SELECT COUNT(*) INTO v FROM business_v2.source_providers WHERE key = 'chaos';
  IF v <> 1 THEN RAISE EXCEPTION 'Smoke FAIL: chaos source_provider not present (count=%)', v; END IF;
  RAISE NOTICE 'Smoke PASS: chaos source_provider seeded';
END $$;
ROLLBACK;
