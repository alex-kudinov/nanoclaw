-- 107_incidents_diagnosis_trust.sql
-- Self-healing Phase 4a — trust layer (docs/SELF-HEALING-ORCHESTRATED-DIAGNOSIS.md §5).
--
-- The diagnosis brain becomes evidence-grounded and adversarially tested. Every
-- diagnosis now carries a TRUST verdict that GATES the 👍:
--   confidence         high | medium | low   — how much to believe it
--   cause_or_symptom   root_cause | symptom | unknown — is the fix at the root?
--   evidence           the concrete findings the conclusion rests on
--   review             the adversarial refuter's verdict (Phase 4c)
--   investigation_log  path to the agentic transcript (audit)
-- isTrustworthy(inc) = confidence != low AND cause_or_symptom = root_cause; only
-- trustworthy diagnoses offer an apply/implement path. Untrustworthy ones post as
-- "needs a human look" with evidence + dissent and no CTA.
--
-- Online-safe: 5 nullable columns added to an existing table. Idempotent
-- (ADD COLUMN IF NOT EXISTS) so it is safe to re-apply.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

ALTER TABLE business_v2.incidents
  ADD COLUMN IF NOT EXISTS confidence        text,
  ADD COLUMN IF NOT EXISTS cause_or_symptom  text,
  ADD COLUMN IF NOT EXISTS evidence          jsonb,
  ADD COLUMN IF NOT EXISTS review            jsonb,
  ADD COLUMN IF NOT EXISTS investigation_log text;

COMMENT ON COLUMN business_v2.incidents.confidence IS
  'Phase 4 trust: high | medium | low — gates the 👍 (low never auto/👍-actionable).';
COMMENT ON COLUMN business_v2.incidents.cause_or_symptom IS
  'Phase 4 trust: root_cause | symptom | unknown — only root_cause is actionable.';
COMMENT ON COLUMN business_v2.incidents.evidence IS
  'Phase 4 trust: jsonb array of concrete findings (file:line, command output).';
COMMENT ON COLUMN business_v2.incidents.review IS
  'Phase 4c: the adversarial refuter verdict {refuted, reason, better_cause}.';
COMMENT ON COLUMN business_v2.incidents.investigation_log IS
  'Phase 4: path to the agentic investigation transcript (audit trail).';

COMMIT;

-- Smoke (BEGIN/ROLLBACK): the 5 columns exist and accept the trust shape.
BEGIN;
SET search_path TO business_v2, public, pg_catalog;
DO $$
DECLARE v text;
BEGIN
  INSERT INTO business_v2.incidents (source, fingerprint, severity,
    confidence, cause_or_symptom, evidence, review, investigation_log)
  VALUES ('minion:trust-smoke', 'fp-trust-smoke', 'error',
    'high', 'root_cause', '["backfill-names.cjs:1 hardcoded /workspace path"]'::jsonb,
    '{"refuted": false, "reason": "confirmed"}'::jsonb, '/tmp/log');

  SELECT confidence INTO v FROM business_v2.incidents WHERE fingerprint = 'fp-trust-smoke';
  IF v <> 'high' THEN RAISE EXCEPTION 'Smoke FAIL: confidence not persisted, got %', v; END IF;

  RAISE NOTICE 'Phase 4a smoke PASS: incidents trust columns';
END $$;
ROLLBACK;
