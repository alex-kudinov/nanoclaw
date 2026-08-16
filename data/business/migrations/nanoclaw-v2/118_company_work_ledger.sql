-- 118_company_work_ledger.sql
--
-- Dark, host-owned Company OS work projection for the Mailman/Sales approved-
-- email pilot. This migration adds persistence only. No runtime producer or
-- consumer is wired by NC-20260815-010, and no agent role receives access.
-- Raw message content, customer addresses, subjects, and approval text are
-- deliberately absent.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE business_v2.company_work_items (
  id                    bigserial PRIMARY KEY,
  workflow_type         text NOT NULL CHECK (workflow_type = 'sales_email'),
  source_system         text NOT NULL CHECK (btrim(source_system) <> ''),
  source_key            text NOT NULL CHECK (btrim(source_key) <> ''),
  party_id              bigint NOT NULL REFERENCES business_v2.parties(id),
  pipeline_entry_id     bigint NOT NULL
                        REFERENCES business_v2.pipeline_entries(id),
  completion_definition text NOT NULL DEFAULT 'gmail_ack_and_thread_close'
                        CHECK (
                          completion_definition =
                            'gmail_ack_and_thread_close'
                        ),
  stage                 text NOT NULL DEFAULT 'accepted' CHECK (
                          stage IN (
                            'accepted', 'sales_dispatched',
                            'awaiting_approval', 'approved',
                            'mailman_dispatched', 'action_claimed',
                            'external_acknowledged', 'outcome_validated'
                          )
                        ),
  disposition           text NOT NULL DEFAULT 'open' CHECK (
                          disposition IN (
                            'open', 'waiting', 'blocked', 'failed',
                            'completed', 'cancelled'
                          )
                        ),
  version               integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  block_code            text,
  failure_code          text,
  deadline_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  last_transition_at    timestamptz NOT NULL DEFAULT now(),
  last_transition_by    text NOT NULL DEFAULT 'company-work-ledger:host',
  CONSTRAINT company_work_items_source_uniq
    UNIQUE (workflow_type, source_system, source_key),
  CONSTRAINT company_work_items_waiting_stage_chk
    CHECK (disposition <> 'waiting' OR stage = 'awaiting_approval'),
  CONSTRAINT company_work_items_completed_stage_chk
    CHECK ((stage = 'outcome_validated') = (disposition = 'completed')),
  CONSTRAINT company_work_items_block_code_chk
    CHECK ((disposition = 'blocked') = (block_code IS NOT NULL)),
  CONSTRAINT company_work_items_failure_code_chk
    CHECK ((disposition = 'failed') = (failure_code IS NOT NULL)),
  CONSTRAINT company_work_items_exception_code_text_chk
    CHECK (
      (block_code IS NULL OR btrim(block_code) <> '') AND
      (failure_code IS NULL OR btrim(failure_code) <> '')
    )
);

CREATE INDEX company_work_items_exception_queue_idx
  ON business_v2.company_work_items
    (disposition, stage, deadline_at, updated_at)
  WHERE disposition IN ('waiting', 'blocked', 'failed');

CREATE INDEX company_work_items_party_idx
  ON business_v2.company_work_items (party_id, created_at DESC);

CREATE TABLE business_v2.company_work_receipts (
  id                 bigserial PRIMARY KEY,
  work_item_id       bigint NOT NULL
                     REFERENCES business_v2.company_work_items(id),
  receipt_type       text NOT NULL CHECK (
                       receipt_type IN (
                         'operator_approval', 'action_claim',
                         'external_delivery', 'outcome_validation',
                         'cancellation'
                       )
                     ),
  receipt_system     text NOT NULL CHECK (btrim(receipt_system) <> ''),
  receipt_key        text NOT NULL CHECK (btrim(receipt_key) <> ''),
  evidence_sha256    text NOT NULL CHECK (
                       evidence_sha256 ~ '^[0-9a-f]{64}$'
                     ),
  external_action_id text,
  occurred_at        timestamptz NOT NULL,
  recorded_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_work_receipts_source_uniq
    UNIQUE (receipt_system, receipt_key),
  CONSTRAINT company_work_receipts_item_id_uniq
    UNIQUE (work_item_id, id),
  CONSTRAINT company_work_receipts_action_id_text_chk
    CHECK (
      external_action_id IS NULL OR btrim(external_action_id) <> ''
    ),
  CONSTRAINT company_work_receipts_action_binding_chk
    CHECK (
      receipt_type = 'cancellation' OR external_action_id IS NOT NULL
    )
);

CREATE INDEX company_work_receipts_item_idx
  ON business_v2.company_work_receipts
    (work_item_id, receipt_type, occurred_at);

CREATE TABLE business_v2.company_work_events (
  id                   bigserial PRIMARY KEY,
  work_item_id         bigint NOT NULL
                       REFERENCES business_v2.company_work_items(id),
  work_item_version    integer NOT NULL CHECK (work_item_version >= 0),
  event_type           text NOT NULL CHECK (
                         event_type IN (
                           'accepted', 'sales_dispatched',
                           'approval_requested', 'approved',
                           'mailman_dispatched', 'action_claimed',
                           'external_acknowledged', 'outcome_validated',
                           'blocked', 'failed', 'resumed', 'cancelled'
                         )
                       ),
  from_stage           text,
  to_stage             text NOT NULL,
  from_disposition     text,
  to_disposition       text NOT NULL,
  actor                text NOT NULL CHECK (btrim(actor) <> ''),
  source_system        text NOT NULL CHECK (btrim(source_system) <> ''),
  source_event_key     text NOT NULL CHECK (btrim(source_event_key) <> ''),
  idempotency_key      text NOT NULL CHECK (btrim(idempotency_key) <> ''),
  event_fingerprint    text NOT NULL CHECK (
                         event_fingerprint ~ '^[0-9a-f]{64}$'
                       ),
  evidence_sha256      text CHECK (
                         evidence_sha256 IS NULL OR
                         evidence_sha256 ~ '^[0-9a-f]{64}$'
                       ),
  exception_code       text,
  receipt_id           bigint,
  occurred_at          timestamptz NOT NULL,
  recorded_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_work_events_item_version_uniq
    UNIQUE (work_item_id, work_item_version),
  CONSTRAINT company_work_events_source_uniq
    UNIQUE (source_system, source_event_key),
  CONSTRAINT company_work_events_idempotency_uniq
    UNIQUE (idempotency_key),
  CONSTRAINT company_work_events_receipt_fk
    FOREIGN KEY (work_item_id, receipt_id)
    REFERENCES business_v2.company_work_receipts(work_item_id, id),
  CONSTRAINT company_work_events_initial_chk CHECK (
    (event_type = 'accepted' AND work_item_version = 0 AND
      from_stage IS NULL AND from_disposition IS NULL AND
      to_stage = 'accepted' AND to_disposition = 'open') OR
    (event_type <> 'accepted' AND work_item_version > 0 AND
      from_stage IS NOT NULL AND from_disposition IS NOT NULL)
  ),
  CONSTRAINT company_work_events_receipt_required_chk CHECK (
    (event_type IN (
      'approved', 'action_claimed', 'external_acknowledged',
      'outcome_validated', 'cancelled'
    )) = (receipt_id IS NOT NULL)
  ),
  CONSTRAINT company_work_events_evidence_required_chk CHECK (
    event_type NOT IN ('accepted', 'approval_requested') OR
    evidence_sha256 IS NOT NULL
  ),
  CONSTRAINT company_work_events_exception_code_chk CHECK (
    (event_type IN ('blocked', 'failed')) = (exception_code IS NOT NULL)
  ),
  CONSTRAINT company_work_events_exception_code_text_chk CHECK (
    exception_code IS NULL OR btrim(exception_code) <> ''
  )
);

CREATE INDEX company_work_events_item_idx
  ON business_v2.company_work_events
    (work_item_id, work_item_version, recorded_at);

CREATE OR REPLACE FUNCTION business_v2.fn_company_work_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER company_work_receipts_append_only
  BEFORE UPDATE OR DELETE ON business_v2.company_work_receipts
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();

CREATE TRIGGER company_work_events_append_only
  BEFORE UPDATE OR DELETE ON business_v2.company_work_events
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();

COMMENT ON TABLE business_v2.company_work_items IS
  'Host-owned cross-agent work projection. Stores stable internal identities and state only; no raw customer or approval content.';
COMMENT ON TABLE business_v2.company_work_receipts IS
  'Append-only external/decision receipt identities and SHA-256 evidence; no raw receipt payload.';
COMMENT ON TABLE business_v2.company_work_events IS
  'Append-only, optimistic-versioned host transition facts. Agent prose is never a transition source.';

ALTER TABLE business_v2.company_work_items OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.company_work_receipts OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.company_work_events OWNER TO nanoclaw_admin;
ALTER FUNCTION business_v2.fn_company_work_append_only() OWNER TO nanoclaw_admin;

REVOKE ALL ON business_v2.company_work_items FROM PUBLIC;
REVOKE ALL ON business_v2.company_work_receipts FROM PUBLIC;
REVOKE ALL ON business_v2.company_work_events FROM PUBLIC;
REVOKE ALL ON SEQUENCE business_v2.company_work_items_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE business_v2.company_work_receipts_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE business_v2.company_work_events_id_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION business_v2.fn_company_work_append_only() FROM PUBLIC;

GRANT ALL ON business_v2.company_work_items TO nanoclaw_admin;
GRANT ALL ON business_v2.company_work_receipts TO nanoclaw_admin;
GRANT ALL ON business_v2.company_work_events TO nanoclaw_admin;
GRANT ALL ON SEQUENCE business_v2.company_work_items_id_seq TO nanoclaw_admin;
GRANT ALL ON SEQUENCE business_v2.company_work_receipts_id_seq TO nanoclaw_admin;
GRANT ALL ON SEQUENCE business_v2.company_work_events_id_seq TO nanoclaw_admin;
GRANT EXECUTE ON FUNCTION business_v2.fn_company_work_append_only()
  TO nanoclaw_admin;

COMMIT;
