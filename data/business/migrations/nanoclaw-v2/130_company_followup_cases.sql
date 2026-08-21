-- 130_company_followup_cases.sql
--
-- Dark Company OS projection for policy-led Sales, proposal-signature, and
-- receivables follow-up cases. This is persistence only: no source adapter,
-- scheduler, agent, draft, approval, Plutio write, or customer action is wired.
-- Customer names, addresses, subjects, bodies, proposal/invoice descriptions,
-- and arbitrary source JSON are deliberately absent.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE business_v2.company_followup_cases (
  id                          bigserial PRIMARY KEY,
  lane                        text NOT NULL CHECK (
                                lane IN (
                                  'sales_conversation',
                                  'proposal_signature',
                                  'receivable'
                                )
                              ),
  source_system               text NOT NULL CHECK (
                                char_length(source_system) BETWEEN 1 AND 500 AND
                                source_system ~
                                  '^[A-Za-z0-9][A-Za-z0-9._:/-]*$' AND
                                position('://' IN source_system) = 0
                              ),
  source_key                  text NOT NULL CHECK (
                                char_length(source_key) BETWEEN 1 AND 500 AND
                                source_key ~
                                  '^[A-Za-z0-9][A-Za-z0-9._:/-]*$' AND
                                position('://' IN source_key) = 0
                              ),
  party_id                    bigint REFERENCES business_v2.parties(id),
  pipeline_entry_id           bigint
                              REFERENCES business_v2.pipeline_entries(id),
  owner_group                 text NOT NULL CHECK (
                                owner_group IN ('sales', 'contador')
                              ),
  policy_version              text NOT NULL CHECK (btrim(policy_version) <> ''),
  source_fingerprint          text NOT NULL CHECK (
                                source_fingerprint ~ '^[0-9a-f]{64}$'
                              ),
  decision_fingerprint        text NOT NULL CHECK (
                                decision_fingerprint ~ '^[0-9a-f]{64}$'
                              ),
  disposition                 text NOT NULL CHECK (
                                disposition IN (
                                  'waiting', 'ready', 'blocked',
                                  'completed', 'cancelled'
                                )
                              ),
  reason_code                 text NOT NULL CHECK (
                                reason_code ~ '^[a-z][a-z0-9_]{0,99}$'
                              ),
  next_action                 text NOT NULL CHECK (
                                next_action IN (
                                  'customer_draft', 'internal_review',
                                  'close_review', 'escalate', 'none'
                                )
                              ),
  sequence_no                 smallint CHECK (sequence_no BETWEEN 1 AND 3),
  next_eligible_business_date date,
  confirmed_attempt_count     smallint NOT NULL DEFAULT 0 CHECK (
                                confirmed_attempt_count BETWEEN 0 AND 100
                              ),
  block_code                  text,
  terminal_code               text,
  version                     integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  last_observed_at            timestamptz NOT NULL,
  last_changed_at             timestamptz NOT NULL,
  last_presented_fingerprint  text CHECK (
                                last_presented_fingerprint IS NULL OR
                                last_presented_fingerprint ~ '^[0-9a-f]{64}$'
                              ),
  last_presented_at           timestamptz,
  presentation_count          integer NOT NULL DEFAULT 0 CHECK (
                                presentation_count >= 0
                              ),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_followup_cases_source_uniq
    UNIQUE (lane, source_system, source_key),
  CONSTRAINT company_followup_cases_owner_chk CHECK (
    (lane IN ('sales_conversation', 'proposal_signature') AND
      owner_group = 'sales') OR
    (lane = 'receivable' AND owner_group = 'contador')
  ),
  CONSTRAINT company_followup_cases_sales_identity_chk CHECK (
    lane <> 'sales_conversation' OR
    (party_id IS NOT NULL AND pipeline_entry_id IS NOT NULL)
  ),
  CONSTRAINT company_followup_cases_ready_action_chk CHECK (
    (disposition = 'ready') = (next_action <> 'none')
  ),
  CONSTRAINT company_followup_cases_sequence_chk CHECK (
    (next_action = 'customer_draft' AND sequence_no IS NOT NULL) OR
    (next_action <> 'customer_draft' AND sequence_no IS NULL) OR
    (disposition = 'waiting' AND reason_code = 'cadence_not_due' AND
      next_action = 'none' AND sequence_no IS NOT NULL)
  ),
  CONSTRAINT company_followup_cases_block_chk CHECK (
    (disposition = 'blocked') = (block_code IS NOT NULL)
  ),
  CONSTRAINT company_followup_cases_terminal_chk CHECK (
    (disposition IN ('completed', 'cancelled')) =
      (terminal_code IS NOT NULL)
  ),
  CONSTRAINT company_followup_cases_code_text_chk CHECK (
    (block_code IS NULL OR block_code ~ '^[a-z][a-z0-9_]{0,99}$') AND
    (terminal_code IS NULL OR terminal_code ~ '^[a-z][a-z0-9_]{0,99}$')
  ),
  CONSTRAINT company_followup_cases_presentation_pair_chk CHECK (
    (last_presented_fingerprint IS NULL) = (last_presented_at IS NULL)
  ),
  CONSTRAINT company_followup_cases_presentation_count_chk CHECK (
    (presentation_count = 0) = (last_presented_at IS NULL)
  )
);

CREATE INDEX company_followup_cases_ready_idx
  ON business_v2.company_followup_cases
    (next_eligible_business_date, last_changed_at, id)
  WHERE disposition = 'ready';

CREATE INDEX company_followup_cases_exception_idx
  ON business_v2.company_followup_cases
    (disposition, owner_group, last_changed_at, id)
  WHERE disposition = 'blocked';

CREATE INDEX company_followup_cases_party_idx
  ON business_v2.company_followup_cases (party_id, lane, updated_at DESC)
  WHERE party_id IS NOT NULL;

CREATE TABLE business_v2.company_followup_events (
  id                    bigserial PRIMARY KEY,
  case_id               bigint NOT NULL
                        REFERENCES business_v2.company_followup_cases(id),
  case_version          integer NOT NULL CHECK (case_version >= 0),
  event_type            text NOT NULL CHECK (
                          event_type IN (
                            'observed', 'projection_changed',
                            'presented', 'presentation_failed'
                          )
                        ),
  from_disposition      text,
  to_disposition        text NOT NULL CHECK (
                          to_disposition IN (
                            'waiting', 'ready', 'blocked',
                            'completed', 'cancelled'
                          )
                        ),
  reason_code           text NOT NULL CHECK (
                          reason_code ~ '^[a-z][a-z0-9_]{0,99}$'
                        ),
  actor                 text NOT NULL CHECK (btrim(actor) <> ''),
  source_system         text NOT NULL CHECK (
                          char_length(source_system) BETWEEN 1 AND 500 AND
                          source_system ~
                            '^[A-Za-z0-9][A-Za-z0-9._:/-]*$' AND
                          position('://' IN source_system) = 0
                        ),
  source_event_key      text NOT NULL CHECK (
                          char_length(source_event_key) BETWEEN 1 AND 500 AND
                          source_event_key ~
                            '^[A-Za-z0-9][A-Za-z0-9._:/-]*$' AND
                          position('://' IN source_event_key) = 0
                        ),
  idempotency_key       text NOT NULL CHECK (
                          char_length(idempotency_key) BETWEEN 1 AND 500 AND
                          idempotency_key ~
                            '^[A-Za-z0-9][A-Za-z0-9._:/-]*$' AND
                          position('://' IN idempotency_key) = 0
                        ),
  source_fingerprint    text NOT NULL CHECK (
                          source_fingerprint ~ '^[0-9a-f]{64}$'
                        ),
  decision_fingerprint  text NOT NULL CHECK (
                          decision_fingerprint ~ '^[0-9a-f]{64}$'
                        ),
  event_fingerprint     text NOT NULL CHECK (
                          event_fingerprint ~ '^[0-9a-f]{64}$'
                        ),
  occurred_at           timestamptz NOT NULL,
  recorded_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_followup_events_source_uniq
    UNIQUE (source_system, source_event_key),
  CONSTRAINT company_followup_events_idempotency_uniq
    UNIQUE (idempotency_key),
  CONSTRAINT company_followup_events_initial_chk CHECK (
    (event_type = 'observed' AND case_version = 0 AND
      from_disposition IS NULL) OR
    (event_type <> 'observed' AND from_disposition IS NOT NULL)
  ),
  CONSTRAINT company_followup_events_presentation_chk CHECK (
    event_type NOT IN ('presented', 'presentation_failed') OR
    (from_disposition = 'ready' AND to_disposition = 'ready')
  )
);

CREATE INDEX company_followup_events_case_idx
  ON business_v2.company_followup_events
    (case_id, case_version, recorded_at, id);

CREATE TRIGGER company_followup_events_append_only
  BEFORE UPDATE OR DELETE ON business_v2.company_followup_events
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();

COMMENT ON TABLE business_v2.company_followup_cases IS
  'Host-owned, privacy-minimized current projection of exact follow-up cases. Source systems and existing action ledgers remain authoritative.';
COMMENT ON TABLE business_v2.company_followup_events IS
  'Append-only source/decision/presentation facts for follow-up cases. Contains opaque identities and SHA-256 evidence only.';

ALTER TABLE business_v2.company_followup_cases OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.company_followup_events OWNER TO nanoclaw_admin;

REVOKE ALL ON business_v2.company_followup_cases FROM PUBLIC;
REVOKE ALL ON business_v2.company_followup_events FROM PUBLIC;
REVOKE ALL ON SEQUENCE business_v2.company_followup_cases_id_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE business_v2.company_followup_events_id_seq FROM PUBLIC;

GRANT ALL ON business_v2.company_followup_cases TO nanoclaw_admin;
GRANT ALL ON business_v2.company_followup_events TO nanoclaw_admin;
GRANT ALL ON SEQUENCE business_v2.company_followup_cases_id_seq
  TO nanoclaw_admin;
GRANT ALL ON SEQUENCE business_v2.company_followup_events_id_seq
  TO nanoclaw_admin;

COMMIT;
