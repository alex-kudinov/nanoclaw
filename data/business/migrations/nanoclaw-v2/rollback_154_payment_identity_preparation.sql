BEGIN;
SET LOCAL search_path TO pg_catalog;
LOCK TABLE business_v2.payment_identity_preparations IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM business_v2.payment_identity_preparations) THEN
    RAISE EXCEPTION 'rollback154 refused: identity preparation evidence exists';
  END IF;
END; $$;
DROP TABLE business_v2.payment_identity_preparations;
COMMIT;
