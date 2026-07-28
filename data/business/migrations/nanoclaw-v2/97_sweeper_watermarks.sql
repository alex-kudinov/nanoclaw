-- 97_sweeper_watermarks.sql
-- Phase 5 of webhook reliability initiative (docs/WEBHOOK-RELIABILITY.md §3.5).
--
-- Per-source reconciliation watermark. A sweeper run only advances its
-- watermark when ALL synthesized envelopes for the window reach a terminal
-- state in webhook_inbox; otherwise the watermark stays put and chief is
-- alerted. This prevents silent backlog growth (the failure mode that
-- introduced the Jamie Maak case in the first place).
--
-- Online-safe: new table only.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE business_v2.sweeper_watermarks (
  source              text PRIMARY KEY,
  last_seen_id        text,
  last_seen_at        timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  last_run_at         timestamptz,
  last_run_status     text,                -- 'success' | 'frozen' | 'error'
  last_run_error      text,
  last_run_recovered  int NOT NULL DEFAULT 0,
  last_run_failed     int NOT NULL DEFAULT 0,
  CONSTRAINT sweeper_watermarks_status_chk
    CHECK (last_run_status IS NULL OR last_run_status IN ('success', 'frozen', 'error'))
);

COMMENT ON TABLE business_v2.sweeper_watermarks IS
  'Per-source reconciliation watermark. last_seen_at is only advanced when a sweeper run reaches full terminal-state convergence for the window. last_run_status=frozen means at least one synthesized event did not reach terminal state — operator action required.';

ALTER TABLE business_v2.sweeper_watermarks OWNER TO nanoclaw_admin;

COMMIT;

-- Smoke (BEGIN/ROLLBACK)
BEGIN;
DO $$
DECLARE v text;
BEGIN
  INSERT INTO business_v2.sweeper_watermarks (source, last_seen_id, last_seen_at, last_run_status)
  VALUES ('trafft', 'appt:44', '2026-04-23T05:21:03Z'::timestamptz, 'success')
  RETURNING last_run_status INTO v;
  IF v <> 'success' THEN RAISE EXCEPTION 'Smoke FAIL: insert returned %', v; END IF;

  -- Status check enforces enum
  BEGIN
    INSERT INTO business_v2.sweeper_watermarks (source, last_run_status)
    VALUES ('test-bogus', 'invalid');
    RAISE EXCEPTION 'Smoke FAIL: invalid status accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  RAISE NOTICE 'Phase 5 smoke PASS: sweeper_watermarks table';
END $$;
ROLLBACK;
