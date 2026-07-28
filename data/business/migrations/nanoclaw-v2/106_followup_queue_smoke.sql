-- 102_followup_queue_smoke.sql — permission boundary for the follow-up queue view
-- Run as nanoclaw_admin / superuser. Asserts the sales role reads the view but
-- still cannot touch the base tables it is built from. Raises on any failure.

DO $$
BEGIN
  -- sales MUST be able to read the queue view
  IF NOT has_table_privilege('nanoclaw_sales', 'business_v2.v_sales_followup_queue', 'SELECT') THEN
    RAISE EXCEPTION 'nanoclaw_sales cannot SELECT v_sales_followup_queue';
  END IF;

  -- sales MUST NOT be able to read the base tables the view encapsulates
  IF has_table_privilege('nanoclaw_sales', 'business_v2.interactions', 'SELECT') THEN
    RAISE EXCEPTION 'nanoclaw_sales unexpectedly has SELECT on base interactions';
  END IF;
  IF has_table_privilege('nanoclaw_sales', 'business_v2.webhook_inbox', 'SELECT') THEN
    RAISE EXCEPTION 'nanoclaw_sales unexpectedly has SELECT on base webhook_inbox';
  END IF;
  IF has_table_privilege('nanoclaw_sales', 'business_v2.email_followup_suppressions', 'SELECT') THEN
    RAISE EXCEPTION 'nanoclaw_sales unexpectedly has SELECT on email_followup_suppressions';
  END IF;

  -- the view must be runnable (catches column/CTE typos at migration time)
  PERFORM 1 FROM business_v2.v_sales_followup_queue LIMIT 1;

  RAISE NOTICE 'v_sales_followup_queue smoke: PASS';
END $$;
