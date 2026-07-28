-- 102_proposal_followups.sql
-- Open-proposal follow-up cadence (docs/PROPOSAL-FOLLOWUP-DESIGN.md).
--
-- One row per (proposal, touch). The host proposal-followup loop drafts a touch,
-- posts it to Slack for approval (status='pending_approval'), and on a check-mark
-- reaction sends it via the Gmail path (status='sent', sent_at set). The seq=1
-- row's sent_at is the cadence ANCHOR: touches 2-4 are scheduled relative to it,
-- so a months-old backlog proposal restarts its clock at the first nudge today
-- rather than telescoping straight to the breakup email.
--
-- Online-safe: new table only.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE business_v2.proposal_followups (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proposal_plutio_id text NOT NULL,            -- Plutio proposal _id
  proposal_number    text,                     -- human label, e.g. tca-089-prop
  sequence_no        smallint NOT NULL,        -- 1..4 (touch number)
  recipient_email    text,
  recipient_name     text,
  party_id           bigint,                   -- best-effort link to business_v2.parties
  thread_id          text,                     -- Gmail thread to reply into, if any
  subject            text NOT NULL,
  body               text NOT NULL,
  proposal_url       text,                     -- client-facing link embedded in the body
  slack_channel      text,                     -- jid the draft was posted to
  slack_ts           text,                     -- ts of the approval draft message
  gmail_message_id   text,                     -- set after send
  status             text NOT NULL DEFAULT 'pending_approval'
                       CHECK (status IN ('pending_approval', 'sent', 'cancelled', 'expired')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  sent_at            timestamptz,
  CONSTRAINT proposal_followups_seq_uniq UNIQUE (proposal_plutio_id, sequence_no)
);

COMMENT ON TABLE business_v2.proposal_followups IS
  'Per-touch ledger for open-proposal follow-up nudges. The seq=1 row sent_at is the cadence anchor for touches 2-4.';

-- Fast lookup of the pending draft a Slack reaction approves.
CREATE INDEX proposal_followups_pending_ts_idx
  ON business_v2.proposal_followups (slack_ts)
  WHERE status = 'pending_approval';

-- Per-proposal history scan (compute last sent touch + anchor).
CREATE INDEX proposal_followups_proposal_idx
  ON business_v2.proposal_followups (proposal_plutio_id);

ALTER TABLE business_v2.proposal_followups OWNER TO nanoclaw_admin;

COMMIT;

-- Smoke (BEGIN/ROLLBACK — leaves no data behind)
BEGIN;
SET search_path TO business_v2, public, pg_catalog;
DO $$
DECLARE v text;
BEGIN
  INSERT INTO business_v2.proposal_followups
    (proposal_plutio_id, proposal_number, sequence_no, recipient_email,
     recipient_name, subject, body, status)
  VALUES ('smoke_pid', 'tca-000-prop', 1, 'x@example.com',
          'Smoke', 'Re: Your proposal', 'body', 'pending_approval');

  SELECT status INTO v FROM business_v2.proposal_followups
   WHERE proposal_plutio_id = 'smoke_pid' AND sequence_no = 1;
  IF v <> 'pending_approval' THEN RAISE EXCEPTION 'Smoke FAIL: insert'; END IF;

  UPDATE business_v2.proposal_followups
     SET status = 'sent', sent_at = now()
   WHERE proposal_plutio_id = 'smoke_pid' AND sequence_no = 1;
  SELECT status INTO v FROM business_v2.proposal_followups
   WHERE proposal_plutio_id = 'smoke_pid' AND sequence_no = 1;
  IF v <> 'sent' THEN RAISE EXCEPTION 'Smoke FAIL: update'; END IF;

  -- (proposal, sequence) must be unique so a touch never double-drafts.
  BEGIN
    INSERT INTO business_v2.proposal_followups
      (proposal_plutio_id, sequence_no, subject, body)
    VALUES ('smoke_pid', 1, 's', 'b');
    RAISE EXCEPTION 'Smoke FAIL: duplicate (proposal, sequence) accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL; -- expected
  END;

  RAISE NOTICE 'proposal_followups smoke PASS';
END $$;
ROLLBACK;
