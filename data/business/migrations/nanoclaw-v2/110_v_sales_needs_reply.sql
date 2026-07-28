-- 110_v_sales_needs_reply.sql — deterministic "which leads still need our reply"
-- Part of NanoClaw Schema v2 (post-base extension)
--
-- Why: the sales agent had no queryable notion of "draft pending approval". It
-- reconstructed pending state from conversational memory — narrative
-- "Pending approvals outstanding: ..." tails, hand-maintained pending-*.md
-- scratch files, and session-resume history. All three are append-heavy and
-- pruned by hand, so a draft that was approved in a THREAD (handled by a
-- thread-scoped spawn) never got retracted from the ROOT session's pending
-- belief. Result (2026-07-20): the agent reported 5 leads "awaiting approval"
-- when 3 of them (Sam Chia #850, Charlotte Dover #859, Deborah Brown-Volkman
-- #417) had already been emailed and 2 had advanced to `proposal`. Same
-- thread-vs-root context fragmentation as the 2026-07-06 and 2026-07-16
-- incidents.
--
-- This view IS the source of truth for "needs our reply": a lead whose most
-- recent communication is INBOUND with no outbound email since. When we have
-- replied (last interaction is outbound), the lead drops off automatically —
-- no memory, no manual prune. Leads we genuinely never answered stay listed
-- honestly (the system will not claim a reply it has no record of sending).
--
-- Owner-privileged (reads base business_v2.interactions on the agent's behalf,
-- since nanoclaw_sales has no SELECT on that base table). Do NOT set
-- security_invoker=true (that would re-break base-table access), mirroring
-- v_sales_followup_queue (migration 105).

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE OR REPLACE VIEW business_v2.v_sales_needs_reply AS
WITH dirs AS (
  -- Per party: when they last sent us a REPLY-EXPECTED message (email or
  -- form-submission — an actual inbound communication), and when we last
  -- replied by email. Deliberately excludes 'chaos' (passive website browsing)
  -- and 'booking' (handled by the booking flow, not a sales email) — those are
  -- logged as inbound but do not put the ball in sales' court. v_active_pipeline
  -- already excludes won/lost, so 'payment' cannot flip a live prospect either.
  SELECT
    i.party_id,
    max(i.occurred_at) FILTER (
      WHERE i.direction = 'inbound' AND i.channel IN ('email', 'form-submission')
    ) AS last_inbound_at,
    max(i.occurred_at) FILTER (
      WHERE i.direction = 'outbound' AND i.channel = 'email'
    ) AS last_outbound_at
  FROM business_v2.interactions i
  GROUP BY i.party_id
),
last_inbound_msg AS (
  -- The most recent reply-expected inbound message — what we still owe a reply to.
  SELECT DISTINCT ON (i.party_id)
    i.party_id,
    i.subject                     AS last_inbound_subject,
    i.metadata->>'message'        AS last_inbound_message,
    i.metadata->>'thread_id'      AS thread_id
  FROM business_v2.interactions i
  WHERE i.direction = 'inbound' AND i.channel IN ('email', 'form-submission')
  ORDER BY i.party_id, i.occurred_at DESC
)
-- One row per PARTY (not per pipeline_entry): a lead with two open entries
-- (e.g. a 'new' + a 'qualifying' from a re-inquiry) is one person awaiting one
-- reply. Keep the most-advanced, then most-recent, entry so the row carries the
-- Entry ID the agent actually works. Wrapped so the view still presents
-- oldest-waiting first regardless of the DISTINCT ON tie-break order.
, dedup AS (
  SELECT DISTINCT ON (ap.party_id)
    ap.pipeline_entry_id,
    ap.party_id,
    ap.display_name,
    pcc.primary_email,
    ap.stage,
    ap.program_name,
    d.last_inbound_at,
    d.last_outbound_at,                                 -- NULL = we have no reply on record
    lim.last_inbound_subject,
    lim.last_inbound_message,
    lim.thread_id,
    round(EXTRACT(EPOCH FROM (now() - d.last_inbound_at)) / 86400.0, 1) AS days_waiting
  FROM business_v2.v_active_pipeline ap
  JOIN dirs d                              ON d.party_id = ap.party_id
  JOIN business_v2.v_party_contact_card pcc ON pcc.party_id = ap.party_id
  LEFT JOIN last_inbound_msg lim           ON lim.party_id = ap.party_id
  WHERE d.last_inbound_at IS NOT NULL                   -- they reached out
    AND (d.last_outbound_at IS NULL                     -- and we never replied
         OR d.last_outbound_at < d.last_inbound_at)     -- or they wrote again after our last reply
    AND ap.stage NOT IN ('paused', 'nurture')           -- won/lost already excluded by v_active_pipeline; skip hold states
  ORDER BY
    ap.party_id,
    CASE ap.stage WHEN 'negotiating' THEN 0 WHEN 'proposal' THEN 1
                  WHEN 'qualifying' THEN 2 WHEN 'new' THEN 3 ELSE 4 END,
    d.last_inbound_at DESC
)
SELECT * FROM dedup
ORDER BY days_waiting DESC;                              -- oldest unanswered first

COMMENT ON VIEW business_v2.v_sales_needs_reply IS
  'Source of truth for "which leads still need our reply / are not yet answered". One row per active-pipeline lead whose most recent interaction is INBOUND with no outbound email since. Replaces the sales agent''s memory/scratch-file pending tracking: an answered lead (last interaction outbound) drops off automatically. Leads never answered stay listed honestly. Owner-privileged; reads base interactions on the agent''s behalf.';

-- Runs as nanoclaw_sales (the sales container role); readonly + admin mirror the
-- other views (reporting, digests, schema-doc gen). admin needs it explicitly
-- because GRANT ALL ... ON ALL TABLES only covered objects existing at grant time.
GRANT SELECT ON business_v2.v_sales_needs_reply
  TO nanoclaw_sales, nanoclaw_readonly, nanoclaw_admin;

COMMIT;
