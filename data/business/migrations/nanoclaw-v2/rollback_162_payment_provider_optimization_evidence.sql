BEGIN;
SET LOCAL search_path TO pg_catalog;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM business_v2.payment_provider_optimization_evidence) THEN
    RAISE EXCEPTION 'populated provider optimization evidence rollback refused';
  END IF;
END; $$;
DROP TABLE business_v2.payment_provider_optimization_evidence;
COMMIT;
