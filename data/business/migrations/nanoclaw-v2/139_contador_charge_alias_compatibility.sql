-- 139_contador_charge_alias_compatibility.sql
-- Accept Stripe charge objects returned with either ch_ or py_ identifiers.
-- No case, receipt, provider, payment, Sheet, or roster data is changed.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

ALTER TABLE business_v2.contador_payment_fulfillment_aliases
  DROP CONSTRAINT contador_payment_fulfillment_aliases_alias_id_check;

ALTER TABLE business_v2.contador_payment_fulfillment_aliases
  ADD CONSTRAINT contador_payment_fulfillment_aliases_alias_id_check CHECK (
    alias_id ~ '^(pi|cs|ch|py|in|re|evt)_[A-Za-z0-9_]+$'
  );

COMMENT ON CONSTRAINT contador_payment_fulfillment_aliases_alias_id_check
  ON business_v2.contador_payment_fulfillment_aliases IS
  'Typed Stripe aliases; charge objects may use provider-supported ch_ or py_ ids.';

COMMIT;
