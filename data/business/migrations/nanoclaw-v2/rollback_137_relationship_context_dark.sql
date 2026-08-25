-- Guarded rollback for migration 137. Feature admission must be disabled first.
-- Only exact migration-created legacy compatibility refs may be removed;
-- every other relationship-context row makes rollback refuse.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM business_v2.party_external_refs
        WHERE adapter_key <> 'legacy_party_source'
           OR adapter_version <> '1.0.0'
           OR source_scope <> 'legacy-primary'
       LIMIT 1
     )
     OR EXISTS (SELECT 1 FROM business_v2.party_identifier_claims LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.party_identity_exceptions LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.party_context_adapter_registrations LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.party_context_observations LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.party_context_projections LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.party_context_query_receipts LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.party_context_plutio_projection_receipts LIMIT 1)
  THEN
    RAISE EXCEPTION
      'rollback 137 refused: relationship context history exists; disable admission and use a separately reviewed archival migration';
  END IF;
END $$;

DELETE FROM business_v2.party_external_refs
 WHERE adapter_key = 'legacy_party_source'
   AND adapter_version = '1.0.0'
   AND source_scope = 'legacy-primary';

DROP VIEW business_v2.v_party_context_identity_exception_queue;
DROP VIEW business_v2.v_party_context_health;
DROP TRIGGER parties_relationship_context_merge ON business_v2.parties;
DROP TABLE business_v2.party_context_plutio_projection_receipts;
DROP TABLE business_v2.party_context_query_receipts;
DROP TABLE business_v2.party_context_projections;
DROP TABLE business_v2.party_context_observations;
DROP TABLE business_v2.party_context_adapter_registrations;
DROP TABLE business_v2.party_identity_exceptions;
DROP TABLE business_v2.party_identifier_claims;
DROP TABLE business_v2.party_external_refs;
DROP FUNCTION business_v2.fn_relationship_context_backfill_legacy_refs();
DROP FUNCTION business_v2.fn_relationship_context_party_merged();
DROP FUNCTION business_v2.fn_relationship_context_reject_merged_party();
DROP FUNCTION business_v2.fn_relationship_context_query_delivery_transition();
DROP FUNCTION business_v2.fn_relationship_context_query_receipt_immutable();
DROP FUNCTION business_v2.fn_relationship_context_observation_immutable();
DROP FUNCTION business_v2.fn_relationship_context_append_only();

COMMIT;
