BEGIN;
LOCK TABLE business_v2.website_checkout_customer_notice_jobs,
  business_v2.website_checkout_customer_notice_receipts IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM business_v2.website_checkout_customer_notice_jobs) OR
     EXISTS(SELECT 1 FROM business_v2.website_checkout_customer_notice_receipts) THEN
    RAISE EXCEPTION 'populated website checkout customer notice rollback refused';
  END IF;
END $$;
DROP TABLE business_v2.website_checkout_customer_notice_receipts;
DROP TABLE business_v2.website_checkout_customer_notice_jobs;
DROP FUNCTION business_v2.fn_website_checkout_notice_receipt_immutable();
DROP FUNCTION business_v2.fn_website_checkout_notice_job_guard();
COMMIT;
