-- 101_daemon_heartbeat.sql
-- Self-healing system, Phase 0 (docs/SELF-HEALING-DESIGN.md §4.2, §3.2).
--
-- daemon_heartbeat: the NanoClaw daemon upserts last_beat every 30s. The healer
-- (a separate process) reads it; a stale beat is how a crashed daemon is
-- detected and auto-recovered, since a dead daemon cannot push its own death.
--
-- collector_state: per-source pull watermarks (jsonl byte offset, last
-- job_run_logs timestamp seen, last digest time). Keeps the collector
-- incremental and the digest non-repeating.
--
-- Online-safe: new tables only.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE business_v2.daemon_heartbeat (
  name        text PRIMARY KEY,           -- 'nanoclaw'
  last_beat   timestamptz NOT NULL DEFAULT now(),
  pid         int,
  version     text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE business_v2.daemon_heartbeat IS
  'Liveness beacon. The daemon upserts last_beat every 30s; the healer treats a beat older than its stale threshold (120s) as a daemon-down incident.';

ALTER TABLE business_v2.daemon_heartbeat OWNER TO nanoclaw_admin;

CREATE TABLE business_v2.collector_state (
  key         text PRIMARY KEY,           -- e.g. jsonl_offset | job_logs_watermark | last_digest_at
  value       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE business_v2.collector_state IS
  'Per-source pull watermarks for the self-healing collector and digest.';

ALTER TABLE business_v2.collector_state OWNER TO nanoclaw_admin;

COMMIT;

-- Smoke (BEGIN/ROLLBACK)
BEGIN;
SET search_path TO business_v2, public, pg_catalog;
DO $$
DECLARE v text;
BEGIN
  INSERT INTO business_v2.daemon_heartbeat (name, pid, version)
  VALUES ('nanoclaw', 1234, 'test')
  ON CONFLICT (name) DO UPDATE SET last_beat = now(), pid = EXCLUDED.pid;
  SELECT version INTO v FROM business_v2.daemon_heartbeat WHERE name = 'nanoclaw';
  IF v <> 'test' THEN RAISE EXCEPTION 'Smoke FAIL: heartbeat'; END IF;

  INSERT INTO business_v2.collector_state (key, value)
  VALUES ('jsonl_offset', '{"offset": 42}'::jsonb)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  SELECT (value->>'offset') INTO v FROM business_v2.collector_state WHERE key = 'jsonl_offset';
  IF v <> '42' THEN RAISE EXCEPTION 'Smoke FAIL: collector_state'; END IF;

  RAISE NOTICE 'Phase 0 smoke PASS: daemon_heartbeat + collector_state';
END $$;
ROLLBACK;
