-- 101_v_sales_followup_queue.sql — deterministic sales email follow-up queue
-- Part of NanoClaw Schema v2 (post-base extension)
--
-- Why: the sales follow-up cron told the container to hand-write a query against
-- business_v2.interactions, but nanoclaw_sales has no SELECT on that base table,
-- so the query errored and the agent improvised off v_active_pipeline alone —
-- fabricating the "original inquiry" and dropping thread_id / the cutover guard.
-- This view IS the queue: one SELECT, owner-privileged (reads base tables on the
-- agent's behalf), so the follow-up workflow never improvises SQL again.
--
-- It encodes the selection rules, the proposal de-dup (table 104), and the real
-- ORIGIN context (contact-form message / first inbound email message / form page).
-- It deliberately does NOT carry the full email thread — outbound bodies are not
-- persisted anywhere; the agent fetches thread history from Gmail by thread_id.
--
-- Owned by the same role as the other views so it runs with owner privileges.
-- Do NOT set security_invoker=true (that would re-break base-table access).

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

CREATE OR REPLACE VIEW business_v2.v_sales_followup_queue AS
WITH outbound AS (
  -- Per party: how many emails we've sent, how many were follow-up nudges,
  -- the originating subject, and when we last reached out.
  SELECT
    i.party_id,
    count(*)                                                       AS outbound_email_count,
    count(*) FILTER (WHERE i.metadata->>'follow_up' = 'true')      AS follow_up_count,
    (array_agg(i.subject ORDER BY i.occurred_at ASC))[1]          AS first_subject,
    max(i.occurred_at)                                            AS last_outbound_at,
    bool_or(i.occurred_at < TIMESTAMPTZ '2026-04-16')             AS has_precutover_outbound
  FROM business_v2.interactions i
  WHERE i.channel = 'email' AND i.direction = 'outbound'
  GROUP BY i.party_id
),
thread AS (
  -- Most recent outbound thread_id — used to thread the follow-up and to pull
  -- the full Gmail conversation at draft time.
  SELECT DISTINCT ON (i.party_id)
    i.party_id, i.metadata->>'thread_id' AS thread_id
  FROM business_v2.interactions i
  WHERE i.channel = 'email' AND i.direction = 'outbound' AND i.metadata ? 'thread_id'
  ORDER BY i.party_id, i.occurred_at DESC
),
inbound_email AS (
  -- The lead's FIRST inbound email message (origin anchor). The full thread
  -- comes from Gmail; this is just the starting point.
  SELECT DISTINCT ON (i.party_id)
    i.party_id, i.metadata->>'message' AS msg
  FROM business_v2.interactions i
  WHERE i.channel = 'email' AND i.direction = 'inbound'
    AND COALESCE(i.metadata->>'message', '') <> ''
  ORDER BY i.party_id, i.occurred_at ASC
),
contact_msg AS (
  -- contact-us free text lives in webhook_inbox (no party_id) — join by email.
  SELECT DISTINCT ON (lower(w.raw_body->>'email'))
    lower(w.raw_body->>'email') AS email_l,
    w.raw_body->>'message'      AS msg
  FROM business_v2.webhook_inbox w
  WHERE w.source = 'contact-form'
    AND COALESCE(w.raw_body->>'message', '') <> ''
  ORDER BY lower(w.raw_body->>'email'), w.received_at DESC
),
form_page AS (
  -- Latest page/program a lead engaged a form on — the only signal for
  -- webform/waitlist leads who never wrote a message.
  SELECT DISTINCT ON (i.party_id)
    i.party_id, i.metadata->>'form_page' AS form_page
  FROM business_v2.interactions i
  WHERE i.direction = 'inbound' AND COALESCE(i.metadata->>'form_page', '') <> ''
  ORDER BY i.party_id, i.occurred_at DESC
)
SELECT
  ap.pipeline_entry_id,
  ap.party_id,
  ap.display_name,
  pcc.primary_email,
  ap.stage,
  ap.program_name,
  ap.last_interaction_at,
  ob.follow_up_count,                       -- 0 → next is FU#1, 1 → next is FU#2
  th.thread_id,
  COALESCE(ob.first_subject, 'Re: ' || ap.program_name) AS original_subject,
  CASE
    WHEN cm.msg IS NOT NULL THEN 'contact-form'
    WHEN ie.msg IS NOT NULL THEN 'email'
    WHEN fp.form_page IS NOT NULL THEN 'webform'
    ELSE 'none'
  END AS inquiry_source,
  COALESCE(cm.msg, ie.msg) AS inquiry_text, -- origin anchor; full thread via Gmail
  fp.form_page AS interest_page
FROM business_v2.v_active_pipeline ap
JOIN outbound ob ON ob.party_id = ap.party_id                  -- require a prior outbound email
JOIN business_v2.v_party_contact_card pcc ON pcc.party_id = ap.party_id
LEFT JOIN thread th        ON th.party_id = ap.party_id
LEFT JOIN inbound_email ie ON ie.party_id = ap.party_id
LEFT JOIN form_page fp     ON fp.party_id = ap.party_id
LEFT JOIN contact_msg cm   ON cm.email_l = lower(pcc.primary_email::text)
WHERE ap.last_interaction_at < now() - INTERVAL '3 days'   -- gone quiet
  AND ap.stage NOT IN ('paused', 'nurture')                -- won/lost already excluded by v_active_pipeline; skip hold states
  AND ob.follow_up_count < 3                                -- 0/1 → draft FU#1/FU#2; 2 → workflow marks cold (no FU#3)
  AND NOT ob.has_precutover_outbound                        -- never re-engage pre-2026-04-16 leads via cron
  AND NOT EXISTS (                                          -- proposal de-dup (table 104)
    SELECT 1 FROM business_v2.email_followup_suppressions s
    WHERE s.last_seen_open_at > now() - INTERVAL '3 days'
      AND (s.party_id = ap.party_id
           OR (s.email IS NOT NULL AND s.email = lower(pcc.primary_email::text)))
  )
ORDER BY ap.last_interaction_at ASC;

COMMENT ON VIEW business_v2.v_sales_followup_queue IS
  'Deterministic sales email follow-up queue. One row per lead due a nudge: requires a prior outbound email, gone quiet 3+ days, under the 2-follow-up cap, not pre-cutover, and NOT a current open-proposal recipient (email_followup_suppressions). Carries origin context (inquiry_source/inquiry_text/interest_page) and thread_id. Full email thread is fetched from Gmail by the agent; outbound bodies are not stored in the DB.';

-- The follow-up cron runs as nanoclaw_sales; this view is the ONLY thing it queries.
-- readonly + admin mirror the other 6 views (reporting, digests, schema-doc gen);
-- admin needs it explicitly because GRANT ALL ... ON ALL TABLES only covered
-- objects existing at grant time, not views created later.
GRANT SELECT ON business_v2.v_sales_followup_queue
  TO nanoclaw_sales, nanoclaw_readonly, nanoclaw_admin;

COMMIT;
