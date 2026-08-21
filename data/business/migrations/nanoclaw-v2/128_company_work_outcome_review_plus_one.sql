-- 128_company_work_outcome_review_plus_one.sql
--
-- Slack reports the standard thumbs-up reaction as "+1". Treating that exact
-- configured-operator reaction as an explicit clean assessment closes a UI
-- mismatch; it does not infer clean from silence, text, or another message.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

ALTER TABLE business_v2.company_work_outcome_review_packets
  DROP CONSTRAINT company_work_outcome_review_packets_decision_reaction_check;

ALTER TABLE business_v2.company_work_outcome_review_packets
  ADD CONSTRAINT company_work_outcome_review_packets_decision_reaction_check
  CHECK (
    decision_reaction IS NULL OR
    decision_reaction IN (
      '+1', 'white_check_mark', 'heavy_check_mark',
      'ballot_box_with_check', 'bug', 'leftwards_arrow_with_hook',
      'rotating_light'
    )
  ) NOT VALID;

ALTER TABLE business_v2.company_work_outcome_review_packets
  VALIDATE CONSTRAINT
    company_work_outcome_review_packets_decision_reaction_check;

COMMENT ON CONSTRAINT
  company_work_outcome_review_packets_decision_reaction_check
  ON business_v2.company_work_outcome_review_packets IS
  'Closed exact Slack reaction vocabulary; +1 is an explicit clean operator decision.';

COMMIT;
