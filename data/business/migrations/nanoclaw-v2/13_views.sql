-- 13_views.sql — 6 agent-facing views
-- Part of NanoClaw Schema v2 Migration (Plan #1 of 4)
-- Depends: T11 (helpers for canonical_party_id)
-- No now() baked into definitions.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

----------------------------------------------------------------------
-- 1. v_party_contact_card
----------------------------------------------------------------------
CREATE OR REPLACE VIEW business_v2.v_party_contact_card AS
SELECT
  p.id AS party_id,
  p.display_name,
  p.party_type,
  p.primary_email,
  p.legal_name,
  p.source_provider,
  (
    SELECT array_agg(DISTINCT pr.role_type ORDER BY pr.role_type)
    FROM business_v2.party_roles pr
    WHERE pr.party_id = p.id AND pr.ended_at IS NULL
  ) AS active_roles,
  (
    SELECT max(i.occurred_at)
    FROM business_v2.interactions i
    WHERE i.party_id = p.id
  ) AS last_interaction_at
FROM business_v2.parties p
WHERE p.merged_into IS NULL;

COMMENT ON VIEW business_v2.v_party_contact_card IS 'Party contact card: identity + primary email + active roles + last interaction. Excludes tombstones.';

----------------------------------------------------------------------
-- 2. v_active_pipeline
----------------------------------------------------------------------
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
  AND p.merged_into IS NULL;

COMMENT ON VIEW business_v2.v_active_pipeline IS 'Non-terminal pipeline entries with party and program details. Excludes tombstoned parties.';

----------------------------------------------------------------------
-- 3. v_active_engagements
----------------------------------------------------------------------
CREATE OR REPLACE VIEW business_v2.v_active_engagements AS
SELECT
  ep.id AS participant_id,
  ep.engagement_id,
  e.kind AS engagement_kind,
  e.status AS engagement_status,
  ep.party_id,
  p.display_name,
  ep.participant_role,
  ep.started_at,
  e.program_variant_id,
  pv.display_name AS variant_name,
  pv.program_id,
  pr.slug AS program_slug,
  pr.display_name AS program_name
FROM business_v2.engagement_participants ep
JOIN business_v2.engagements e ON e.id = ep.engagement_id
JOIN business_v2.parties p ON p.id = ep.party_id
LEFT JOIN business_v2.program_variants pv ON pv.id = e.program_variant_id
LEFT JOIN business_v2.programs pr ON pr.id = pv.program_id
WHERE ep.ended_at IS NULL
  AND e.status IN ('active', 'paused');

COMMENT ON VIEW business_v2.v_active_engagements IS 'Active engagement participants with program and variant details.';

----------------------------------------------------------------------
-- 4. v_party_timeline
----------------------------------------------------------------------
CREATE OR REPLACE VIEW business_v2.v_party_timeline AS
SELECT
  i.party_id,
  i.id AS interaction_id,
  i.occurred_at,
  i.channel,
  i.direction,
  i.subject,
  i.source_provider,
  i.source_id,
  i.engagement_id,
  NULL::bigint AS pipeline_entry_id,
  NULL::bigint AS document_id,
  NULL::text AS document_kind,
  NULL::text AS document_status
FROM business_v2.interactions i
WHERE i.party_id IS NOT NULL

UNION ALL

SELECT
  d.party_id,
  NULL::bigint AS interaction_id,
  COALESCE(d.issued_at, d.created_at) AS occurred_at,
  'other'::text AS channel,
  'outbound'::text AS direction,
  format('%s — %s', d.kind, d.status) AS subject,
  d.source_provider,
  d.source_id,
  NULL::bigint AS engagement_id,
  NULL::bigint AS pipeline_entry_id,
  d.id AS document_id,
  d.kind AS document_kind,
  d.status AS document_status
FROM business_v2.documents d

UNION ALL

SELECT
  pe.party_id,
  NULL::bigint AS interaction_id,
  psh.transitioned_at AS occurred_at,
  'other'::text AS channel,
  'internal'::text AS direction,
  format('Pipeline: %s → %s (%s)', COALESCE(psh.from_stage, 'new'), psh.to_stage, psh.reason) AS subject,
  NULL::text AS source_provider,
  NULL::text AS source_id,
  NULL::bigint AS engagement_id,
  pe.id AS pipeline_entry_id,
  NULL::bigint AS document_id,
  NULL::text AS document_kind,
  NULL::text AS document_status
FROM business_v2.pipeline_stage_history psh
JOIN business_v2.pipeline_entries pe ON pe.id = psh.pipeline_entry_id;

COMMENT ON VIEW business_v2.v_party_timeline IS 'UNION of interactions + documents + pipeline transitions. ORDER BY occurred_at DESC at query time.';

----------------------------------------------------------------------
-- 5. v_client_status
----------------------------------------------------------------------
CREATE OR REPLACE VIEW business_v2.v_client_status AS
SELECT
  p.id AS party_id,
  p.display_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM business_v2.engagement_participants ep2
      JOIN business_v2.engagements e2 ON e2.id = ep2.engagement_id
      WHERE ep2.party_id = p.id
        AND ep2.ended_at IS NULL
        AND e2.status IN ('active', 'paused')
    ) THEN 'current'
    ELSE 'past'
  END AS client_status,
  (
    SELECT max(ep3.ended_at)
    FROM business_v2.engagement_participants ep3
    WHERE ep3.party_id = p.id AND ep3.ended_at IS NOT NULL
  ) AS last_engagement_ended_at
FROM business_v2.parties p
JOIN business_v2.party_roles pr ON pr.party_id = p.id
WHERE pr.role_type = 'client'
  AND pr.ended_at IS NULL
  AND p.merged_into IS NULL;

COMMENT ON VIEW business_v2.v_client_status IS 'Parties with active client role: current (has active engagement) or past.';

----------------------------------------------------------------------
-- 6. v_program_variant_seats
----------------------------------------------------------------------
CREATE OR REPLACE VIEW business_v2.v_program_variant_seats AS
SELECT
  pv.id AS program_variant_id,
  pv.display_name AS variant_name,
  pr.slug AS program_slug,
  pv.capacity AS seats_total,
  COALESCE(filled.cnt, 0) AS seats_filled,
  CASE
    WHEN pv.capacity IS NULL THEN NULL
    ELSE pv.capacity - COALESCE(filled.cnt, 0)
  END AS seats_remaining
FROM business_v2.program_variants pv
JOIN business_v2.programs pr ON pr.id = pv.program_id
LEFT JOIN LATERAL (
  SELECT count(*) AS cnt
  FROM business_v2.engagement_participants ep
  JOIN business_v2.engagements e ON e.id = ep.engagement_id
  WHERE e.program_variant_id = pv.id
    AND ep.participant_role = 'student'
    AND ep.ended_at IS NULL
    AND e.status IN ('active', 'paused')
) filled ON true
WHERE pv.is_active;

COMMENT ON VIEW business_v2.v_program_variant_seats IS 'Variant seat utilization: total/filled/remaining. NULL capacity = no cap.';

COMMIT;
