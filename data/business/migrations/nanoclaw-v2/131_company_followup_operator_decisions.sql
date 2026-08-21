-- 131_company_followup_operator_decisions.sql
-- NC-20260821-002: an explicit operator rejection is durable terminal evidence,
-- not permission to regenerate the same Sales follow-up draft tomorrow.
--
-- This migration adds content-free decision receipt capacity only. It does not
-- read a source, accept a Slack reaction, change a pipeline entry, create a
-- draft, schedule work, or send a message.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

ALTER TABLE business_v2.company_followup_events
  DROP CONSTRAINT company_followup_events_event_type_check,
  ADD COLUMN operator_decision text,
  ADD COLUMN operator_fingerprint text,
  ADD CONSTRAINT company_followup_events_event_type_chk CHECK (
    event_type IN (
      'observed', 'projection_changed',
      'presented', 'presentation_failed',
      'operator_decision'
    )
  ),
  ADD CONSTRAINT company_followup_events_operator_decision_chk CHECK (
    (event_type = 'operator_decision' AND
      operator_decision = 'declined' AND
      operator_fingerprint ~ '^[0-9a-f]{64}$') OR
    (event_type <> 'operator_decision' AND
      operator_decision IS NULL AND
      operator_fingerprint IS NULL)
  );

COMMENT ON COLUMN business_v2.company_followup_events.operator_decision IS
  'Content-free named-human decision on the exact bound follow-up presentation. Migration 131 permits only declined.';
COMMENT ON COLUMN business_v2.company_followup_events.operator_fingerprint IS
  'SHA-256 fingerprint of the authorized operator identity; raw Slack UID or name is not stored.';

COMMIT;
