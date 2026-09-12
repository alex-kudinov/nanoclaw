-- Rollback for migration164. Refuse once a v2 document, legal-hold event or
-- purge tombstone exists; issued customer documents must never be reinterpreted.
BEGIN;
SET LOCAL search_path TO pg_catalog;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM business_v2.payment_checkout_documents) OR
     EXISTS (SELECT 1 FROM business_v2.payment_checkout_document_retention_events) OR
     EXISTS (SELECT 1 FROM business_v2.payment_checkout_document_tombstones) THEN
    RAISE EXCEPTION 'rollback refused: payment checkout document retention state exists';
  END IF;
END; $$;

DROP FUNCTION business_v2.purge_payment_checkout_document(uuid,text,timestamptz);
DROP TRIGGER payment_checkout_document_tombstones_immutable
  ON business_v2.payment_checkout_document_tombstones;
DROP FUNCTION business_v2.fn_payment_checkout_document_tombstone_guard();
DROP TRIGGER payment_checkout_document_retention_events_immutable
  ON business_v2.payment_checkout_document_retention_events;
DROP FUNCTION business_v2.fn_payment_checkout_document_retention_event_guard();
DROP TABLE business_v2.payment_checkout_document_tombstones;
DROP TABLE business_v2.payment_checkout_document_retention_events;

DROP TRIGGER payment_checkout_documents_immutable
  ON business_v2.payment_checkout_documents;
DROP TRIGGER payment_checkout_document_capabilities_immutable
  ON business_v2.payment_checkout_document_capabilities;
DROP TRIGGER payment_checkout_document_email_receipts_immutable
  ON business_v2.payment_checkout_document_email_receipts;
DROP FUNCTION business_v2.fn_payment_checkout_document_body_guard();
DROP FUNCTION business_v2.fn_payment_checkout_document_capability_guard();
DROP FUNCTION business_v2.fn_payment_checkout_document_email_receipt_guard();

CREATE TRIGGER payment_checkout_documents_immutable
  BEFORE UPDATE OR DELETE ON business_v2.payment_checkout_documents
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_checkout_document_immutable();
CREATE TRIGGER payment_checkout_document_capabilities_immutable
  BEFORE UPDATE OR DELETE ON business_v2.payment_checkout_document_capabilities
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_checkout_document_immutable();
CREATE TRIGGER payment_checkout_document_email_receipts_immutable
  BEFORE UPDATE OR DELETE ON business_v2.payment_checkout_document_email_receipts
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_payment_checkout_document_immutable();

CREATE OR REPLACE FUNCTION business_v2.fn_payment_checkout_document_email_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'payment checkout document email deletion refused'; END IF;
  IF (to_jsonb(NEW)-ARRAY['state','uncertain_acceptance','attempt_count','lease_token','lease_expires_at','gmail_message_id','gmail_thread_id','last_error_code','version','updated_at'])
     IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['state','uncertain_acceptance','attempt_count','lease_token','lease_expires_at','gmail_message_id','gmail_thread_id','last_error_code','version','updated_at']) THEN
    RAISE EXCEPTION 'payment checkout document email immutable contract';
  END IF;
  IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'payment checkout document email version fence'; END IF;
  IF OLD.state='confirmed' THEN RAISE EXCEPTION 'payment checkout document email terminal state'; END IF;
  RETURN NEW;
END;
$$;

DROP INDEX business_v2.payment_checkout_documents_retention_due;
ALTER TABLE business_v2.payment_checkout_documents
  DROP CONSTRAINT payment_checkout_documents_retention_window_check,
  DROP COLUMN retention_until,
  DROP COLUMN retention_policy_version,
  DROP COLUMN amount_minor,
  DROP COLUMN currency,
  DROP COLUMN attempt_id_sha256,
  DROP CONSTRAINT payment_checkout_documents_document_version_check,
  ADD CONSTRAINT payment_checkout_documents_document_version_check
    CHECK (document_version='mcs-checkout-document-v1');
COMMIT;
