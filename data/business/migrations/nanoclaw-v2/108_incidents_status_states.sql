-- 108_incidents_status_states.sql
-- Self-healing Phase 4d — explicit diagnosis lifecycle states (design §6).
--
-- The orchestrator drives each incident through visible stages:
--   new → investigating → adversarial_review → (diagnosed | needs_human)
--          → awaiting_approval → remediating → verifying → (resolved|recurring|wont_fix)
-- adds to incidents_status_chk:
--   investigating      — agentic investigator running
--   adversarial_review — refuter running
--   needs_human        — UNtrustworthy verdict: posted with evidence + dissent,
--                        excluded from auto-apply and the 👍, shown in the digest
--   verifying          — remediation applied, awaiting recurrence check
--
-- Online-safe: widens a CHECK constraint (no rows violate the superset).
-- Idempotent: DROP IF EXISTS + ADD, so it is safe to re-apply.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

ALTER TABLE business_v2.incidents
  DROP CONSTRAINT IF EXISTS incidents_status_chk;

ALTER TABLE business_v2.incidents
  ADD CONSTRAINT incidents_status_chk
  CHECK (status IN ('new', 'triaging', 'investigating', 'adversarial_review',
                    'diagnosed', 'needs_human', 'awaiting_approval',
                    'remediating', 'verifying', 'resolved', 'wont_fix',
                    'recurring'));

COMMIT;

-- Smoke (BEGIN/ROLLBACK): the new states are accepted, a bogus one still rejected.
BEGIN;
SET search_path TO business_v2, public, pg_catalog;
DO $$
BEGIN
  INSERT INTO business_v2.incidents (source, fingerprint, severity, status)
  VALUES ('minion:state-smoke', 'fp-state-smoke', 'error', 'needs_human');
  UPDATE business_v2.incidents SET status = 'investigating'
   WHERE fingerprint = 'fp-state-smoke';
  UPDATE business_v2.incidents SET status = 'adversarial_review'
   WHERE fingerprint = 'fp-state-smoke';

  BEGIN
    UPDATE business_v2.incidents SET status = 'bogus_state'
     WHERE fingerprint = 'fp-state-smoke';
    RAISE EXCEPTION 'Smoke FAIL: invalid status accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  RAISE NOTICE 'Phase 4d smoke PASS: incidents lifecycle states';
END $$;
ROLLBACK;
