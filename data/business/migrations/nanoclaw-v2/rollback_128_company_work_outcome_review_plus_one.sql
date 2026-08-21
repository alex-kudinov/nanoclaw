-- rollback_128_company_work_outcome_review_plus_one.sql
--
-- Narrow the reaction vocabulary only while no durable +1 decision depends on
-- it. Never delete or rewrite assessment/review history to make rollback fit.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM business_v2.company_work_outcome_review_packets
     WHERE decision_reaction = '+1'
  ) THEN
    RAISE EXCEPTION
      'outcome-review +1 decision history exists; refusing vocabulary rollback';
  END IF;
END;
$$;

ALTER TABLE business_v2.company_work_outcome_review_packets
  DROP CONSTRAINT company_work_outcome_review_packets_decision_reaction_check;

ALTER TABLE business_v2.company_work_outcome_review_packets
  ADD CONSTRAINT company_work_outcome_review_packets_decision_reaction_check
  CHECK (
    decision_reaction IS NULL OR
    decision_reaction IN (
      'white_check_mark', 'heavy_check_mark', 'ballot_box_with_check',
      'bug', 'leftwards_arrow_with_hook', 'rotating_light'
    )
  ) NOT VALID;

ALTER TABLE business_v2.company_work_outcome_review_packets
  VALIDATE CONSTRAINT
    company_work_outcome_review_packets_decision_reaction_check;

COMMIT;
