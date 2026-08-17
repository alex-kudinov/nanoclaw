-- 122_company_trigger_source_watermarks.sql
--
-- Dark, host-owned Company OS trigger-source inventory and watermark state.
-- Source definitions contain content-free identities and operating metadata.
-- Watermark history records closed source ranges, gap freezes, and exact gap
-- reconciliation. It does not wire an adapter, create/resume a task, select a
-- skill, grant authority, or perform an action.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE business_v2.company_trigger_sources (
  registry_version                   smallint NOT NULL CHECK (
                                        registry_version = 1
                                      ),
  definition_id                      text PRIMARY KEY CHECK (
                                        definition_id ~ '^[0-9a-f]{64}$'
                                      ),
  source_fingerprint                 text NOT NULL UNIQUE CHECK (
                                        source_fingerprint ~ '^[0-9a-f]{64}$'
                                      ),
  trigger_kind                       text NOT NULL CHECK (
                                        trigger_kind IN (
                                          'time', 'gmail', 'webhook', 'topic',
                                          'business_condition'
                                        )
                                      ),
  source_system                      text NOT NULL CHECK (
                                        source_system ~
                                          '^[a-z0-9][a-z0-9._-]{0,63}$'
                                      ),
  source_key                         text NOT NULL CHECK (
                                        source_key ~
                                          '^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$'
                                      ),
  adapter_key                        text NOT NULL CHECK (
                                        adapter_key ~
                                          '^[a-z0-9][a-z0-9._-]{0,63}$'
                                      ),
  adapter_version                    text NOT NULL CHECK (
                                        adapter_version ~
                                          '^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$'
                                      ),
  cursor_kind                        text NOT NULL CHECK (
                                        cursor_kind IN (
                                          'none', 'uint', 'utc_timestamp'
                                        )
                                      ),
  reconciliation_mode                text NOT NULL CHECK (
                                        reconciliation_mode IN (
                                          'not_applicable', 'bounded_scan',
                                          'full_snapshot', 'unsupported'
                                        )
                                      ),
  max_reconciliation_window_seconds integer CHECK (
                                        max_reconciliation_window_seconds IS NULL
                                        OR max_reconciliation_window_seconds > 0
                                      ),
  freshness_budget_seconds           integer CHECK (
                                        freshness_budget_seconds IS NULL
                                        OR freshness_budget_seconds > 0
                                      ),
  owner_key                          text NOT NULL CHECK (
                                        owner_key ~
                                          '^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$'
                                      ),
  alert_route_key                    text NOT NULL CHECK (
                                        alert_route_key ~
                                          '^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$'
                                      ),
  registered_at                      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_trigger_sources_identity_uniq
    UNIQUE (trigger_kind, source_system, source_key),
  CONSTRAINT company_trigger_sources_reconciliation_chk CHECK (
    (
      cursor_kind = 'none'
      AND reconciliation_mode IN ('not_applicable', 'unsupported')
      AND max_reconciliation_window_seconds IS NULL
      AND freshness_budget_seconds IS NULL
    )
    OR
    (
      cursor_kind IN ('uint', 'utc_timestamp')
      AND reconciliation_mode IN ('bounded_scan', 'full_snapshot')
      AND max_reconciliation_window_seconds IS NOT NULL
      AND freshness_budget_seconds IS NOT NULL
    )
  )
);

CREATE TRIGGER company_trigger_sources_append_only
  BEFORE UPDATE OR DELETE ON business_v2.company_trigger_sources
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();

COMMENT ON TABLE business_v2.company_trigger_sources IS
  'Immutable host-owned trigger-source definitions. Registration is inventory only and grants no task, skill, capability, approval, message, or action authority.';

CREATE TABLE business_v2.company_trigger_watermark_events (
  id                    bigserial PRIMARY KEY,
  definition_id         text NOT NULL REFERENCES
                          business_v2.company_trigger_sources(definition_id),
  event_key             text NOT NULL CHECK (
                          event_key ~
                            '^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$'
                        ),
  event_fingerprint     text NOT NULL CHECK (
                          event_fingerprint ~ '^[0-9a-f]{64}$'
                        ),
  event_type            text NOT NULL CHECK (
                          event_type IN (
                            'bootstrap', 'advance', 'gap_detected',
                            'gap_reconciled'
                          )
                        ),
  expected_version      bigint NOT NULL CHECK (expected_version >= 0),
  previous_cursor       text,
  next_cursor           text NOT NULL CHECK (btrim(next_cursor) <> ''),
  observed_from         timestamptz NOT NULL,
  observed_through      timestamptz NOT NULL,
  evidence_sha256       text NOT NULL CHECK (
                          evidence_sha256 ~ '^[0-9a-f]{64}$'
                        ),
  observed_count        integer NOT NULL CHECK (observed_count >= 0),
  accepted_count        integer NOT NULL CHECK (accepted_count >= 0),
  rejected_count        integer NOT NULL CHECK (rejected_count >= 0),
  gap_reason            text CHECK (
                          gap_reason IS NULL OR gap_reason IN (
                            'history_expired', 'page_limit',
                            'source_unavailable', 'incomplete_range',
                            'incomplete_terminal_state', 'unknown'
                          )
                        ),
  resolves_event_id     bigint REFERENCES
                          business_v2.company_trigger_watermark_events(id),
  recorded_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_trigger_watermark_events_key_uniq
    UNIQUE (definition_id, event_key),
  CONSTRAINT company_trigger_watermark_events_source_id_uniq
    UNIQUE (definition_id, id),
  CONSTRAINT company_trigger_watermark_events_window_chk
    CHECK (observed_from <= observed_through),
  CONSTRAINT company_trigger_watermark_events_accounting_chk
    CHECK (observed_count = accepted_count + rejected_count),
  CONSTRAINT company_trigger_watermark_events_shape_chk CHECK (
    (
      event_type = 'bootstrap'
      AND expected_version = 0
      AND previous_cursor IS NULL
      AND gap_reason IS NULL
      AND resolves_event_id IS NULL
    )
    OR
    (
      event_type = 'advance'
      AND expected_version > 0
      AND previous_cursor IS NOT NULL
      AND gap_reason IS NULL
      AND resolves_event_id IS NULL
    )
    OR
    (
      event_type = 'gap_detected'
      AND expected_version > 0
      AND previous_cursor IS NOT NULL
      AND gap_reason IS NOT NULL
      AND resolves_event_id IS NULL
    )
    OR
    (
      event_type = 'gap_reconciled'
      AND expected_version > 0
      AND previous_cursor IS NOT NULL
      AND gap_reason IS NULL
      AND resolves_event_id IS NOT NULL
    )
  )
);

CREATE INDEX company_trigger_watermark_events_source_idx
  ON business_v2.company_trigger_watermark_events
    (definition_id, id);

CREATE TRIGGER company_trigger_watermark_events_append_only
  BEFORE UPDATE OR DELETE ON business_v2.company_trigger_watermark_events
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();

COMMENT ON TABLE business_v2.company_trigger_watermark_events IS
  'Append-only content-free source checkpoint history. A gap event freezes the durable cursor; only an exact gap_reconciled event may resume advancement.';

CREATE TABLE business_v2.company_trigger_watermark_state (
  definition_id       text PRIMARY KEY REFERENCES
                        business_v2.company_trigger_sources(definition_id),
  version             bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  status              text NOT NULL DEFAULT 'uninitialized' CHECK (
                        status IN ('uninitialized', 'current', 'gap')
                      ),
  cursor_value        text,
  cursor_observed_at  timestamptz,
  open_gap_event_id   bigint,
  last_event_id       bigint,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_trigger_watermark_state_gap_fk FOREIGN KEY
    (definition_id, open_gap_event_id) REFERENCES
      business_v2.company_trigger_watermark_events(definition_id, id),
  CONSTRAINT company_trigger_watermark_state_last_fk FOREIGN KEY
    (definition_id, last_event_id) REFERENCES
      business_v2.company_trigger_watermark_events(definition_id, id),
  CONSTRAINT company_trigger_watermark_state_shape_chk CHECK (
    (
      status = 'uninitialized'
      AND version = 0
      AND cursor_value IS NULL
      AND cursor_observed_at IS NULL
      AND open_gap_event_id IS NULL
      AND last_event_id IS NULL
    )
    OR
    (
      status = 'current'
      AND version > 0
      AND cursor_value IS NOT NULL
      AND cursor_observed_at IS NOT NULL
      AND open_gap_event_id IS NULL
      AND last_event_id IS NOT NULL
    )
    OR
    (
      status = 'gap'
      AND version > 0
      AND cursor_value IS NOT NULL
      AND cursor_observed_at IS NOT NULL
      AND open_gap_event_id IS NOT NULL
      AND last_event_id = open_gap_event_id
    )
  )
);

COMMENT ON TABLE business_v2.company_trigger_watermark_state IS
  'Host-owned compare-and-swap cursor head derived from append-only watermark events. Status gap blocks ordinary advancement until the exact open gap is reconciled.';

ALTER TABLE business_v2.company_trigger_sources OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.company_trigger_watermark_events OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.company_trigger_watermark_state OWNER TO nanoclaw_admin;

REVOKE ALL ON business_v2.company_trigger_sources FROM PUBLIC;
REVOKE ALL ON business_v2.company_trigger_watermark_events FROM PUBLIC;
REVOKE ALL ON business_v2.company_trigger_watermark_state FROM PUBLIC;
REVOKE ALL ON SEQUENCE
  business_v2.company_trigger_watermark_events_id_seq FROM PUBLIC;

GRANT ALL ON business_v2.company_trigger_sources TO nanoclaw_admin;
GRANT ALL ON business_v2.company_trigger_watermark_events TO nanoclaw_admin;
GRANT ALL ON business_v2.company_trigger_watermark_state TO nanoclaw_admin;
GRANT ALL ON SEQUENCE
  business_v2.company_trigger_watermark_events_id_seq TO nanoclaw_admin;

COMMIT;
