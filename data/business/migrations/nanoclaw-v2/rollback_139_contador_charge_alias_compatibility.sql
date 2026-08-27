-- rollback_139_contador_charge_alias_compatibility.sql
-- Refuse rather than discard a py_ alias recorded after migration 139.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM business_v2.contador_payment_fulfillment_aliases
     WHERE alias_kind = 'charge' AND alias_id LIKE 'py\_%' ESCAPE '\'
  ) THEN
    RAISE EXCEPTION
      'rollback 139 refused: provider-supported py_ charge aliases exist';
  END IF;
END
$$;

ALTER TABLE business_v2.contador_payment_fulfillment_aliases
  DROP CONSTRAINT contador_payment_fulfillment_aliases_alias_id_check;

ALTER TABLE business_v2.contador_payment_fulfillment_aliases
  ADD CONSTRAINT contador_payment_fulfillment_aliases_alias_id_check CHECK (
    alias_id ~ '^(pi|cs|ch|in|re|evt)_[A-Za-z0-9_]+$'
  );

COMMIT;
