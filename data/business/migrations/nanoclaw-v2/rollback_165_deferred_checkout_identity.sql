BEGIN;
SET LOCAL search_path TO pg_catalog;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM business_v2.payment_identity_materializations)
    OR EXISTS (SELECT 1 FROM business_v2.payment_checkout_submission_payloads) THEN
    RAISE EXCEPTION 'rollback 165 refused: deferred checkout identity data exists';
  END IF;
END; $$;

DROP TABLE business_v2.payment_identity_materializations;
DROP TABLE business_v2.payment_checkout_submission_payloads;
ALTER TABLE business_v2.payment_identity_preparations
  DROP CONSTRAINT payment_identity_preparations_materialization_shape,
  ALTER COLUMN payer_party_id SET NOT NULL,
  ALTER COLUMN participant_party_id SET NOT NULL,
  ALTER COLUMN payer_interaction_id SET NOT NULL,
  ALTER COLUMN participant_interaction_id SET NOT NULL,
  ADD CHECK ((purchase_relationship='self')=(payer_party_id=participant_party_id));
COMMIT;
