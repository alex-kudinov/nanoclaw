-- 96_webhook_inbox.sql
-- Phase 1 of webhook reliability initiative (docs/WEBHOOK-RELIABILITY.md §3.1).
--
-- Inbound envelope archive. Every received webhook is recorded here BEFORE
-- agent dispatch. Phase 2 will wire (source,event_id) idempotency via
-- per-source extractors. Phase 3 adds the inbox-reaper.
--
-- Online-safe: new table only; no changes to existing structures.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE business_v2.webhook_inbox (
  id                  bigserial PRIMARY KEY,
  source              text NOT NULL,
  event_id            text,
  event_type          text,
  received_at         timestamptz NOT NULL DEFAULT now(),
  delivery_path       text NOT NULL DEFAULT 'n8n',
  raw_headers         jsonb,
  raw_body            jsonb NOT NULL,
  status              text NOT NULL DEFAULT 'received',
  attempts            int NOT NULL DEFAULT 0,
  last_error          text,
  last_attempted_at   timestamptz,
  handled_at          timestamptz,
  handled_by          text,
  party_id            bigint REFERENCES business_v2.parties(id),
  related_entity      jsonb,
  CONSTRAINT webhook_inbox_status_chk
    CHECK (status IN ('received','dispatched','handled','failed','duplicate','dead_lettered')),
  CONSTRAINT webhook_inbox_delivery_path_chk
    CHECK (delivery_path IN ('n8n','direct','sweep'))
);

-- Idempotency: enforced only when event_id is present (Phase 2 fills extractors).
CREATE UNIQUE INDEX webhook_inbox_idempotency
  ON business_v2.webhook_inbox (source, event_id)
  WHERE event_id IS NOT NULL;

-- Reaper polling (Phase 3 will read this).
CREATE INDEX webhook_inbox_reaper_idx
  ON business_v2.webhook_inbox (status, received_at)
  WHERE status IN ('received', 'failed');

CREATE INDEX webhook_inbox_dispatched_idx
  ON business_v2.webhook_inbox (last_attempted_at)
  WHERE status = 'dispatched';

CREATE INDEX webhook_inbox_source_received_idx
  ON business_v2.webhook_inbox (source, received_at DESC);

COMMENT ON TABLE business_v2.webhook_inbox IS
  'Phase 1: inbound webhook envelope archive (every /hook/* receiver writes here before dispatch). Phase 2 adds (source,event_id) idempotency wiring. Phase 3 adds inbox-reaper for failed/stuck rows.';
COMMENT ON COLUMN business_v2.webhook_inbox.status IS
  'received → dispatched → handled | failed → dispatched (retry) | dead_lettered (after MAX_ATTEMPTS) | duplicate (idempotency hit, Phase 2)';
COMMENT ON COLUMN business_v2.webhook_inbox.delivery_path IS
  'n8n: came through n8n perimeter. direct: direct provider→NC. sweep: synthesized by reconciliation sweeper.';

ALTER TABLE business_v2.webhook_inbox OWNER TO nanoclaw_admin;

COMMIT;

----------------------------------------------------------------------
-- Smoke tests (BEGIN/ROLLBACK — no data persists)
----------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_id1 bigint; v_id2 bigint;
BEGIN
  -- Two NULL-event_id rows must coexist
  INSERT INTO business_v2.webhook_inbox (source, raw_body)
  VALUES ('smoke', '{"test":1}'::jsonb)
  RETURNING id INTO v_id1;

  INSERT INTO business_v2.webhook_inbox (source, raw_body)
  VALUES ('smoke', '{"test":2}'::jsonb)
  RETURNING id INTO v_id2;

  IF v_id1 = v_id2 THEN
    RAISE EXCEPTION 'Smoke FAIL: NULL event_id rows collapsed';
  END IF;

  -- Non-null event_id enforces uniqueness
  INSERT INTO business_v2.webhook_inbox (source, event_id, raw_body)
  VALUES ('smoke', 'evt_unique', '{"a":1}'::jsonb);

  BEGIN
    INSERT INTO business_v2.webhook_inbox (source, event_id, raw_body)
    VALUES ('smoke', 'evt_unique', '{"a":2}'::jsonb);
    RAISE EXCEPTION 'Smoke FAIL: duplicate (source,event_id) accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL; -- expected
  END;

  -- Status check enforces enum
  BEGIN
    INSERT INTO business_v2.webhook_inbox (source, raw_body, status)
    VALUES ('smoke', '{}'::jsonb, 'bogus');
    RAISE EXCEPTION 'Smoke FAIL: invalid status accepted';
  EXCEPTION WHEN check_violation THEN
    NULL; -- expected
  END;

  RAISE NOTICE 'Phase 1 smoke PASS: webhook_inbox table + indexes + constraints';
END $$;
ROLLBACK;
