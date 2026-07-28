-- 103_proposal_actions.sql
-- Operator-confirmable actions inferred from inbound proposal replies.
--
-- When a client replies to a proposal follow-up and the reply reads as a
-- decision (e.g. "we won't proceed"), the host creates a 'pending' decline
-- action and posts a card to #gru-sales. An operator 👍 executes it (sets the
-- Plutio proposal to declined + stops follow-ups); 👎 dismisses it. Approval-
-- gated so an intent misread can't silently kill a live deal.
--
-- Online-safe: new table only.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE business_v2.proposal_actions (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proposal_plutio_id text NOT NULL,
  proposal_number    text,
  action             text NOT NULL CHECK (action IN ('decline')),
  recipient_email    text,
  party_id           bigint,
  reply_summary      text,             -- short gist of what the client wrote
  slack_ts           text,             -- ts of the approval card
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'done', 'dismissed')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at        timestamptz
);

COMMENT ON TABLE business_v2.proposal_actions IS
  'Operator-confirmable actions inferred from inbound proposal replies (e.g. decline). 👍 executes, 👎 dismisses.';

CREATE INDEX proposal_actions_pending_ts_idx
  ON business_v2.proposal_actions (slack_ts)
  WHERE status = 'pending';

CREATE INDEX proposal_actions_proposal_idx
  ON business_v2.proposal_actions (proposal_plutio_id);

ALTER TABLE business_v2.proposal_actions OWNER TO nanoclaw_admin;

COMMIT;

-- Smoke (BEGIN/ROLLBACK)
BEGIN;
SET search_path TO business_v2, public, pg_catalog;
DO $$
DECLARE v text;
BEGIN
  INSERT INTO business_v2.proposal_actions
    (proposal_plutio_id, action, status)
  VALUES ('smoke_pid', 'decline', 'pending');
  SELECT status INTO v FROM business_v2.proposal_actions
   WHERE proposal_plutio_id = 'smoke_pid';
  IF v <> 'pending' THEN RAISE EXCEPTION 'Smoke FAIL: proposal_actions'; END IF;
  RAISE NOTICE 'proposal_actions smoke PASS';
END $$;
ROLLBACK;
