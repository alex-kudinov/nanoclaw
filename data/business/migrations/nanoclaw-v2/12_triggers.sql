-- 12_triggers.sql — 19 trigger installations
-- Part of NanoClaw Schema v2 Migration (Plan #1 of 4)
-- Must run AFTER 11_helpers.sql. CREATE TRIGGER binds to function OID at creation time —
-- re-run both if functions change.
-- Pattern: DROP TRIGGER IF EXISTS <name> ON <table>; CREATE TRIGGER <name> ...

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

----------------------------------------------------------------------
-- 1. Pipeline stage history (BEFORE UPDATE OF stage)
----------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_pipeline_stage_history ON business_v2.pipeline_entries;
CREATE TRIGGER trg_pipeline_stage_history
  BEFORE UPDATE OF stage ON business_v2.pipeline_entries
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_pipeline_stage_history();

----------------------------------------------------------------------
-- 2. Outbox payload validation (BEFORE INSERT)
----------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_validate_outbox_payload ON business_v2.plutio_outbox;
CREATE TRIGGER trg_validate_outbox_payload
  BEFORE INSERT ON business_v2.plutio_outbox
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_validate_outbox_payload();

----------------------------------------------------------------------
-- 3-10. Reject writes to merged parties (single party_id column) — 8 tables
----------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_reject_merged_party_contact_roles ON business_v2.party_contact_roles;
CREATE TRIGGER trg_reject_merged_party_contact_roles
  BEFORE INSERT OR UPDATE ON business_v2.party_contact_roles
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_reject_writes_to_merged_party();

DROP TRIGGER IF EXISTS trg_reject_merged_party_emails ON business_v2.party_emails;
CREATE TRIGGER trg_reject_merged_party_emails
  BEFORE INSERT OR UPDATE ON business_v2.party_emails
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_reject_writes_to_merged_party();

DROP TRIGGER IF EXISTS trg_reject_merged_party_roles ON business_v2.party_roles;
CREATE TRIGGER trg_reject_merged_party_roles
  BEFORE INSERT OR UPDATE ON business_v2.party_roles
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_reject_writes_to_merged_party();

DROP TRIGGER IF EXISTS trg_reject_merged_engagement_participants ON business_v2.engagement_participants;
CREATE TRIGGER trg_reject_merged_engagement_participants
  BEFORE INSERT OR UPDATE ON business_v2.engagement_participants
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_reject_writes_to_merged_party();

DROP TRIGGER IF EXISTS trg_reject_merged_pipeline_entries ON business_v2.pipeline_entries;
CREATE TRIGGER trg_reject_merged_pipeline_entries
  BEFORE INSERT OR UPDATE ON business_v2.pipeline_entries
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_reject_writes_to_merged_party();

DROP TRIGGER IF EXISTS trg_reject_merged_interactions ON business_v2.interactions;
CREATE TRIGGER trg_reject_merged_interactions
  BEFORE INSERT OR UPDATE ON business_v2.interactions
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_reject_writes_to_merged_party();

DROP TRIGGER IF EXISTS trg_reject_merged_documents ON business_v2.documents;
CREATE TRIGGER trg_reject_merged_documents
  BEFORE INSERT OR UPDATE ON business_v2.documents
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_reject_writes_to_merged_party();

DROP TRIGGER IF EXISTS trg_reject_merged_plutio_outbox ON business_v2.plutio_outbox;
CREATE TRIGGER trg_reject_merged_plutio_outbox
  BEFORE INSERT OR UPDATE ON business_v2.plutio_outbox
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_reject_writes_to_merged_party();

----------------------------------------------------------------------
-- 11-12. Reject writes to merged parties (directional — party_relationships)
----------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_reject_merged_party_relationships_from ON business_v2.party_relationships;
CREATE TRIGGER trg_reject_merged_party_relationships_from
  BEFORE INSERT OR UPDATE ON business_v2.party_relationships
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_reject_writes_to_merged_from_party();

DROP TRIGGER IF EXISTS trg_reject_merged_party_relationships_to ON business_v2.party_relationships;
CREATE TRIGGER trg_reject_merged_party_relationships_to
  BEFORE INSERT OR UPDATE ON business_v2.party_relationships
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_reject_writes_to_merged_to_party();

----------------------------------------------------------------------
-- 13-19. updated_at triggers — 7 tables
----------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_updated_at_parties ON business_v2.parties;
CREATE TRIGGER trg_updated_at_parties
  BEFORE UPDATE ON business_v2.parties
  FOR EACH ROW EXECUTE FUNCTION business_v2.update_timestamp();

DROP TRIGGER IF EXISTS trg_updated_at_pipeline_entries ON business_v2.pipeline_entries;
CREATE TRIGGER trg_updated_at_pipeline_entries
  BEFORE UPDATE ON business_v2.pipeline_entries
  FOR EACH ROW EXECUTE FUNCTION business_v2.update_timestamp();

DROP TRIGGER IF EXISTS trg_updated_at_engagements ON business_v2.engagements;
CREATE TRIGGER trg_updated_at_engagements
  BEFORE UPDATE ON business_v2.engagements
  FOR EACH ROW EXECUTE FUNCTION business_v2.update_timestamp();

DROP TRIGGER IF EXISTS trg_updated_at_programs ON business_v2.programs;
CREATE TRIGGER trg_updated_at_programs
  BEFORE UPDATE ON business_v2.programs
  FOR EACH ROW EXECUTE FUNCTION business_v2.update_timestamp();

DROP TRIGGER IF EXISTS trg_updated_at_program_variants ON business_v2.program_variants;
CREATE TRIGGER trg_updated_at_program_variants
  BEFORE UPDATE ON business_v2.program_variants
  FOR EACH ROW EXECUTE FUNCTION business_v2.update_timestamp();

DROP TRIGGER IF EXISTS trg_updated_at_variant_enrollments ON business_v2.variant_enrollments;
CREATE TRIGGER trg_updated_at_variant_enrollments
  BEFORE UPDATE ON business_v2.variant_enrollments
  FOR EACH ROW EXECUTE FUNCTION business_v2.update_timestamp();

DROP TRIGGER IF EXISTS trg_updated_at_documents ON business_v2.documents;
CREATE TRIGGER trg_updated_at_documents
  BEFORE UPDATE ON business_v2.documents
  FOR EACH ROW EXECUTE FUNCTION business_v2.update_timestamp();

-- Total: 1 + 1 + 8 + 2 + 7 = 19 triggers

COMMIT;
