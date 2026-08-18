-- 124_company_gmail_mailbox_audit.sql
--
-- Host-admin-only, gap-independent mailbox audit state. The audit may list
-- Gmail IDs and compare them with immutable terminal receipts. It cannot read
-- content, change a cursor, recover a message, create work, or grant action
-- authority. Missing terminal evidence is stored honestly as unknown.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE TABLE business_v2.company_gmail_mailbox_audits (
  audit_id                           text PRIMARY KEY CHECK (
                                      audit_id ~ '^[0-9a-f]{64}$'
                                    ),
  audit_fingerprint                  text NOT NULL UNIQUE CHECK (
                                      audit_fingerprint ~ '^[0-9a-f]{64}$'
                                    ),
  definition_id                     text NOT NULL REFERENCES
                                      business_v2.company_trigger_sources(definition_id),
  source_fingerprint                text NOT NULL CHECK (
                                      source_fingerprint ~ '^[0-9a-f]{64}$'
                                    ),
  expected_watermark_version        bigint NOT NULL CHECK (
                                      expected_watermark_version > 0
                                    ),
  cursor_evidence_sha256            text NOT NULL CHECK (
                                      cursor_evidence_sha256 ~ '^[0-9a-f]{64}$'
                                    ),
  started_at                        timestamptz NOT NULL,
  initial_history_id                text NOT NULL CHECK (
                                      initial_history_id ~ '^(0|[1-9][0-9]*)$'
                                    ),
  status                            text NOT NULL DEFAULT 'pending' CHECK (
                                      status IN (
                                        'pending', 'listed', 'complete',
                                        'invalidated'
                                      )
                                    ),
  version                           bigint NOT NULL DEFAULT 0 CHECK (
                                      version >= 0
                                    ),
  next_page_token                   text CHECK (
                                      next_page_token IS NULL OR (
                                        octet_length(next_page_token) <= 2048
                                        AND next_page_token !~
                                          '[[:space:][:cntrl:]]'
                                      )
                                    ),
  next_page_token_sha256            text CHECK (
                                      next_page_token_sha256 IS NULL OR
                                      next_page_token_sha256 ~
                                        '^[0-9a-f]{64}$'
                                    ),
  pages_read                        integer NOT NULL DEFAULT 0 CHECK (
                                      pages_read BETWEEN 0 AND 10000
                                    ),
  candidate_count                   integer NOT NULL DEFAULT 0 CHECK (
                                      candidate_count >= 0
                                    ),
  accepted_count                    integer NOT NULL DEFAULT 0 CHECK (
                                      accepted_count >= 0
                                    ),
  rejected_count                    integer NOT NULL DEFAULT 0 CHECK (
                                      rejected_count >= 0
                                    ),
  unknown_count                     integer NOT NULL DEFAULT 0 CHECK (
                                      unknown_count >= 0
                                    ),
  completed_at                      timestamptz,
  final_history_id                  text CHECK (
                                      final_history_id IS NULL OR
                                      final_history_id ~
                                        '^(0|[1-9][0-9]*)$'
                                    ),
  audit_evidence_sha256             text CHECK (
                                      audit_evidence_sha256 IS NULL OR
                                      audit_evidence_sha256 ~
                                        '^[0-9a-f]{64}$'
                                    ),
  invalid_reason                    text CHECK (
                                      invalid_reason IS NULL OR
                                      invalid_reason IN (
                                        'head_changed', 'freshness_exceeded',
                                        'pagination_cycle',
                                        'duplicate_candidate', 'page_limit',
                                        'source_drift'
                                      )
                                    ),
  invalidated_at                    timestamptz,
  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_gmail_mailbox_audit_token_pair_chk CHECK (
    (next_page_token IS NULL) = (next_page_token_sha256 IS NULL)
  ),
  CONSTRAINT company_gmail_mailbox_audit_accounting_chk CHECK (
    candidate_count = accepted_count + rejected_count + unknown_count
  ),
  CONSTRAINT company_gmail_mailbox_audit_state_shape_chk CHECK (
    (
      status = 'pending'
      AND version = pages_read
      AND (
        (pages_read = 0 AND next_page_token IS NULL)
        OR (pages_read > 0 AND next_page_token IS NOT NULL)
      )
      AND completed_at IS NULL
      AND final_history_id IS NULL
      AND audit_evidence_sha256 IS NULL
      AND invalid_reason IS NULL
      AND invalidated_at IS NULL
    )
    OR
    (
      status = 'listed'
      AND version = pages_read
      AND pages_read > 0
      AND next_page_token IS NULL
      AND completed_at IS NULL
      AND final_history_id IS NULL
      AND audit_evidence_sha256 IS NULL
      AND invalid_reason IS NULL
      AND invalidated_at IS NULL
    )
    OR
    (
      status = 'complete'
      AND version = pages_read + 1
      AND pages_read > 0
      AND next_page_token IS NULL
      AND completed_at IS NOT NULL
      AND completed_at >= started_at
      AND final_history_id = initial_history_id
      AND audit_evidence_sha256 IS NOT NULL
      AND invalid_reason IS NULL
      AND invalidated_at IS NULL
    )
    OR
    (
      status = 'invalidated'
      AND version = pages_read + 1
      AND next_page_token IS NULL
      AND completed_at IS NULL
      AND final_history_id IS NULL
      AND audit_evidence_sha256 IS NULL
      AND invalid_reason IS NOT NULL
      AND invalidated_at IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX company_gmail_mailbox_audit_one_active_source_idx
  ON business_v2.company_gmail_mailbox_audits (definition_id)
  WHERE status IN ('pending', 'listed');

COMMENT ON TABLE business_v2.company_gmail_mailbox_audits IS
  'Host-only read-only Gmail mailbox audit state. Completion is coverage evidence only and grants no recovery, cursor, task, approval, message, or action authority.';

CREATE TABLE business_v2.company_gmail_mailbox_audit_pages (
  audit_id                           text NOT NULL REFERENCES
                                      business_v2.company_gmail_mailbox_audits(audit_id),
  page_index                        integer NOT NULL CHECK (
                                      page_index BETWEEN 0 AND 9999
                                    ),
  page_fingerprint                  text NOT NULL CHECK (
                                      page_fingerprint ~ '^[0-9a-f]{64}$'
                                    ),
  request_page_token_sha256         text CHECK (
                                      request_page_token_sha256 IS NULL OR
                                      request_page_token_sha256 ~
                                        '^[0-9a-f]{64}$'
                                    ),
  next_page_token_sha256            text CHECK (
                                      next_page_token_sha256 IS NULL OR
                                      next_page_token_sha256 ~
                                        '^[0-9a-f]{64}$'
                                    ),
  candidate_count                   integer NOT NULL CHECK (
                                      candidate_count BETWEEN 0 AND 500
                                    ),
  accepted_count                    integer NOT NULL CHECK (
                                      accepted_count >= 0
                                    ),
  rejected_count                    integer NOT NULL CHECK (
                                      rejected_count >= 0
                                    ),
  unknown_count                     integer NOT NULL CHECK (
                                      unknown_count >= 0
                                    ),
  recorded_at                       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (audit_id, page_index),
  CONSTRAINT company_gmail_mailbox_audit_pages_accounting_chk CHECK (
    candidate_count = accepted_count + rejected_count + unknown_count
  )
);

CREATE TRIGGER company_gmail_mailbox_audit_pages_append_only
  BEFORE UPDATE OR DELETE ON business_v2.company_gmail_mailbox_audit_pages
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();

COMMENT ON TABLE business_v2.company_gmail_mailbox_audit_pages IS
  'Append-only, content-free page receipts. Raw continuation state exists only while its host-admin audit is pending.';

CREATE TABLE business_v2.company_gmail_mailbox_audit_candidates (
  audit_id                           text NOT NULL,
  gmail_message_id                  text NOT NULL CHECK (
                                      gmail_message_id ~
                                        '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
                                    ),
  page_index                        integer NOT NULL,
  disposition                       text NOT NULL CHECK (
                                      disposition IN (
                                        'accepted', 'rejected', 'unknown'
                                      )
                                    ),
  reason_key                        text NOT NULL CHECK (
                                      reason_key ~
                                        '^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$'
                                    ),
  evidence_sha256                   text NOT NULL CHECK (
                                      evidence_sha256 ~ '^[0-9a-f]{64}$'
                                    ),
  candidate_fingerprint             text NOT NULL CHECK (
                                      candidate_fingerprint ~
                                        '^[0-9a-f]{64}$'
                                    ),
  recorded_at                       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (audit_id, gmail_message_id),
  CONSTRAINT company_gmail_mailbox_audit_candidate_page_fk FOREIGN KEY
    (audit_id, page_index) REFERENCES
      business_v2.company_gmail_mailbox_audit_pages(audit_id, page_index)
);

CREATE INDEX company_gmail_mailbox_audit_candidates_page_idx
  ON business_v2.company_gmail_mailbox_audit_candidates
    (audit_id, page_index);

CREATE TRIGGER company_gmail_mailbox_audit_candidates_append_only
  BEFORE UPDATE OR DELETE ON business_v2.company_gmail_mailbox_audit_candidates
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();

COMMENT ON TABLE business_v2.company_gmail_mailbox_audit_candidates IS
  'Append-only per-Gmail-ID accepted/rejected/unknown audit evidence. No headers, body, address, subject, prompt, or action authority are stored.';

ALTER TABLE business_v2.company_gmail_mailbox_audits
  OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.company_gmail_mailbox_audit_pages
  OWNER TO nanoclaw_admin;
ALTER TABLE business_v2.company_gmail_mailbox_audit_candidates
  OWNER TO nanoclaw_admin;

REVOKE ALL ON business_v2.company_gmail_mailbox_audits FROM PUBLIC;
REVOKE ALL ON business_v2.company_gmail_mailbox_audit_pages FROM PUBLIC;
REVOKE ALL ON business_v2.company_gmail_mailbox_audit_candidates FROM PUBLIC;

GRANT ALL ON business_v2.company_gmail_mailbox_audits TO nanoclaw_admin;
GRANT ALL ON business_v2.company_gmail_mailbox_audit_pages TO nanoclaw_admin;
GRANT ALL ON business_v2.company_gmail_mailbox_audit_candidates
  TO nanoclaw_admin;

COMMIT;
