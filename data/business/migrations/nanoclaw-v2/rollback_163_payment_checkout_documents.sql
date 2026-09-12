BEGIN;
SET LOCAL search_path TO pg_catalog;
LOCK TABLE business_v2.payment_checkout_document_sequences,
  business_v2.payment_checkout_documents,
  business_v2.payment_checkout_document_capabilities,
  business_v2.payment_checkout_document_email_jobs,
  business_v2.payment_checkout_document_email_receipts IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM business_v2.payment_checkout_documents) OR
     EXISTS(SELECT 1 FROM business_v2.payment_checkout_document_capabilities) OR
     EXISTS(SELECT 1 FROM business_v2.payment_checkout_document_email_jobs) OR
     EXISTS(SELECT 1 FROM business_v2.payment_checkout_document_email_receipts) OR
     EXISTS(SELECT 1 FROM business_v2.payment_checkout_document_sequences) THEN
    RAISE EXCEPTION 'rollback refused: checkout document evidence exists';
  END IF;
END; $$;
DROP TABLE business_v2.payment_checkout_document_email_receipts;
DROP TABLE business_v2.payment_checkout_document_email_jobs;
DROP TABLE business_v2.payment_checkout_document_capabilities;
DROP TABLE business_v2.payment_checkout_documents;
DROP TABLE business_v2.payment_checkout_document_sequences;
DROP FUNCTION business_v2.fn_payment_checkout_document_email_guard();
DROP FUNCTION business_v2.fn_payment_checkout_document_immutable();
COMMIT;
