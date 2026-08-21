-- rollback_127_company_work_outcome_review_packets.sql
-- Empty-only rollback. Review delivery and decision history must never be
-- deleted merely to restore older code.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

DO $$
DECLARE
  v_packets bigint;
  v_events bigint;
BEGIN
  SELECT count(*) INTO v_packets
    FROM business_v2.company_work_outcome_review_packets;
  SELECT count(*) INTO v_events
    FROM business_v2.company_work_outcome_review_events;
  IF v_packets <> 0 OR v_events <> 0 THEN
    RAISE EXCEPTION
      'rollback 127 refused: outcome-review history exists (% packets, % events)',
      v_packets, v_events;
  END IF;
END;
$$;

DROP TRIGGER company_work_outcome_review_events_append_only
  ON business_v2.company_work_outcome_review_events;
DROP TRIGGER company_work_outcome_review_packet_validate
  ON business_v2.company_work_outcome_review_packets;
DROP FUNCTION business_v2.fn_company_work_outcome_review_packet_validate();
DROP TABLE business_v2.company_work_outcome_review_events;
DROP TABLE business_v2.company_work_outcome_review_packets;

COMMIT;
