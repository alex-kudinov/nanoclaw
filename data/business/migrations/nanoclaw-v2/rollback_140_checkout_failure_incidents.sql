-- rollback_140_checkout_failure_incidents.sql
-- Refuse rollback after any incident evidence or new failure context exists.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM business_v2.checkout_recovery_operator_incidents LIMIT 1
  ) OR EXISTS (
    SELECT 1 FROM business_v2.checkout_recovery_cases
     WHERE party_id IS NOT NULL OR stripe_customer_id IS NOT NULL
        OR last_failure_code IS NOT NULL OR last_decline_code IS NOT NULL
        OR last_advice_code IS NOT NULL OR customer_guidance_key IS NOT NULL
        OR payment_method_brand IS NOT NULL OR payment_method_last4 IS NOT NULL
        OR operator_incident_id IS NOT NULL
     LIMIT 1
  ) THEN
    RAISE EXCEPTION 'rollback refused: checkout failure incident evidence exists';
  END IF;
END;
$$;

ALTER TABLE business_v2.checkout_recovery_cases
  DROP COLUMN operator_incident_id;

DROP TRIGGER checkout_recovery_operator_incident_cases_append_only
  ON business_v2.checkout_recovery_operator_incident_cases;
DROP FUNCTION business_v2.fn_checkout_recovery_incident_case_append_only();
DROP TABLE business_v2.checkout_recovery_operator_incident_cases;
DROP TABLE business_v2.checkout_recovery_operator_incidents;

ALTER TABLE business_v2.checkout_recovery_cases
  DROP COLUMN payment_method_last4,
  DROP COLUMN payment_method_brand,
  DROP COLUMN customer_guidance_key,
  DROP COLUMN last_advice_code,
  DROP COLUMN last_decline_code,
  DROP COLUMN last_failure_code,
  DROP COLUMN stripe_customer_id,
  DROP COLUMN party_evidence_tier,
  DROP COLUMN party_id;

COMMIT;
