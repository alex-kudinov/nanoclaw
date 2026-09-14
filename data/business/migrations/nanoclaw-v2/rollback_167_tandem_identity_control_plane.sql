-- Guarded rollback for migration 167.
-- Any Tandem Identity D1 evidence makes rollback refuse. Archive through a
-- separately reviewed migration instead of deleting identity history.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM business_v2.identity_event_receipts LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.identity_event_related_refs LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.identity_candidates LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.auth_accounts LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.identity_resolution_decisions LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.provider_desired_projections LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.provider_projection_commands LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.provider_projection_attempts LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.provider_projection_readbacks LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.provider_reconciliation_runs LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.provider_snapshot_items LIMIT 1)
     OR EXISTS (SELECT 1 FROM business_v2.provider_drift_items LIMIT 1)
     OR EXISTS (
       SELECT 1 FROM business_v2.party_external_refs
        WHERE environment <> 'production' LIMIT 1
     )
     OR EXISTS (
       SELECT 1 FROM business_v2.party_context_adapter_registrations
        WHERE environment <> 'production' OR accepted_at IS NOT NULL OR retired_at IS NOT NULL
           OR cardinality(identity_entity_types) > 0
           OR cardinality(identity_event_types) > 0
        LIMIT 1
     )
  THEN
    RAISE EXCEPTION
      'rollback 167 refused: tandem identity evidence exists; disable admission and use a separately reviewed archival migration';
  END IF;
END $$;

DROP VIEW business_v2.v_tandem_identity_shadow_health;

DROP TABLE business_v2.provider_drift_items;
DROP TABLE business_v2.provider_snapshot_items;
DROP TABLE business_v2.provider_reconciliation_runs;
DROP TABLE business_v2.provider_projection_readbacks;
DROP TABLE business_v2.provider_projection_attempts;
DROP TABLE business_v2.provider_projection_commands;
DROP TABLE business_v2.provider_desired_projections;
DROP TABLE business_v2.identity_resolution_decisions;
DROP TABLE business_v2.auth_accounts;
DROP TABLE business_v2.identity_candidates;
DROP TABLE business_v2.identity_event_related_refs;
DROP TABLE business_v2.identity_event_receipts;

DROP FUNCTION business_v2.fn_tandem_identity_drift_guard();
DROP FUNCTION business_v2.fn_tandem_identity_finalize_reconciliation_run(bigint, text, timestamptz, timestamptz);
DROP FUNCTION business_v2.fn_tandem_identity_reconciliation_transition();
DROP FUNCTION business_v2.fn_tandem_identity_snapshot_item_guard();
DROP FUNCTION business_v2.fn_tandem_identity_attempt_prohibited();
DROP FUNCTION business_v2.fn_tandem_identity_command_guard();
DROP FUNCTION business_v2.fn_tandem_identity_projection_guard();
DROP FUNCTION business_v2.fn_tandem_identity_auth_version_guard();
DROP FUNCTION business_v2.fn_tandem_identity_candidate_version_guard();
DROP FUNCTION business_v2.fn_tandem_identity_resolution_guard();
DROP FUNCTION business_v2.fn_tandem_identity_related_ref_guard();
DROP FUNCTION business_v2.fn_tandem_identity_reconciliation_manifest_guard();
DROP FUNCTION business_v2.fn_tandem_identity_store_event_receipt(bigint, text, text, text, text, text, text, text, text, text, text, text, text, text, integer, text, timestamptz, timestamptz, text, integer);
DROP FUNCTION business_v2.fn_tandem_identity_event_receipt_guard();
DROP FUNCTION business_v2.fn_tandem_identity_append_only();
DROP FUNCTION business_v2.fn_tandem_identity_sha256(text);

DROP INDEX business_v2.party_context_adapter_environment_uniq;
DROP INDEX business_v2.party_external_refs_environment_identity_uniq;

ALTER TABLE business_v2.party_context_adapter_registrations
  DROP CONSTRAINT party_context_adapter_identity_declarations_chk,
  DROP CONSTRAINT party_context_adapter_effective_time_chk,
  DROP CONSTRAINT party_context_adapter_environment_chk,
  DROP COLUMN identity_event_types,
  DROP COLUMN identity_entity_types,
  DROP COLUMN retired_at,
  DROP COLUMN accepted_at,
  DROP COLUMN environment;

ALTER TABLE business_v2.party_external_refs
  DROP CONSTRAINT party_external_refs_environment_chk,
  DROP COLUMN environment;

COMMIT;
