-- rollback_136_checkout_recovery_two_reminders.sql
-- Refuses after any send history exists.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM business_v2.checkout_recovery_send_intents LIMIT 1
  ) OR EXISTS (
    SELECT 1 FROM business_v2.checkout_recovery_send_receipts LIMIT 1
  ) THEN
    RAISE EXCEPTION
      'rollback 136 refused: checkout recovery send history exists';
  END IF;
  IF EXISTS (
    SELECT 1 FROM business_v2.checkout_recovery_cases
     WHERE checkout_locale IS NOT NULL
        OR return_url IS NOT NULL
        OR product_name IS NOT NULL
     LIMIT 1
  ) THEN
    RAISE EXCEPTION
      'rollback 136 refused: prospective routing context exists';
  END IF;
END $$;

DROP TRIGGER IF EXISTS checkout_recovery_send_receipts_append_only
  ON business_v2.checkout_recovery_send_receipts;
DROP TABLE business_v2.checkout_recovery_send_receipts;
DROP TABLE business_v2.checkout_recovery_send_intents;
ALTER TABLE business_v2.checkout_recovery_cases
  DROP CONSTRAINT checkout_recovery_case_product_name_chk,
  DROP CONSTRAINT checkout_recovery_case_return_url_chk,
  DROP CONSTRAINT checkout_recovery_case_locale_chk,
  DROP COLUMN product_name,
  DROP COLUMN return_url,
  DROP COLUMN checkout_locale;

COMMIT;
