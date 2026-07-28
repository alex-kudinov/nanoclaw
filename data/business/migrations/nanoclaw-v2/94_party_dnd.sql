-- 94_party_dnd.sql — Add Do-Not-Disturb flag to parties
-- When dnd_at is set, the party has opted out of follow-up emails.

ALTER TABLE business_v2.parties
  ADD COLUMN IF NOT EXISTS dnd_at timestamptz;

COMMENT ON COLUMN business_v2.parties.dnd_at
  IS 'When set, party has opted out of follow-up emails via unsubscribe link.';

-- Recreate v_active_pipeline to exclude DND parties
CREATE OR REPLACE VIEW business_v2.v_active_pipeline AS
SELECT
  pe.id AS pipeline_entry_id,
  pe.party_id,
  p.display_name,
  pe.program_id,
  pr.slug AS program_slug,
  pr.display_name AS program_name,
  pe.stage,
  pe.amount_cents,
  pe.currency,
  pe.entered_stage_at,
  pe.expected_close_date,
  pe.dedupe_key,
  pe.notes,
  (
    SELECT max(i.occurred_at)
    FROM business_v2.interactions i
    WHERE i.party_id = pe.party_id
  ) AS last_interaction_at
FROM business_v2.pipeline_entries pe
JOIN business_v2.parties p ON p.id = pe.party_id
JOIN business_v2.programs pr ON pr.id = pe.program_id
WHERE pe.stage NOT IN ('won', 'lost')
  AND p.merged_into IS NULL
  AND p.dnd_at IS NULL;

COMMENT ON VIEW business_v2.v_active_pipeline
  IS 'Non-terminal pipeline entries with party and program details. Excludes tombstoned and DND parties.';

-- Helper function to set DND (callable by the host webhook handler)
CREATE OR REPLACE FUNCTION business_v2.fn_set_party_dnd(
  p_party_id bigint
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE business_v2.parties
  SET dnd_at = now(), updated_at = now(), last_updated_by = 'unsubscribe-webhook'
  WHERE id = p_party_id AND dnd_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION business_v2.fn_set_party_dnd(bigint) TO nanoclaw_admin;
