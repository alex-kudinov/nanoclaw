-- 113_followup_suppression.sql — durable, party-scoped "stop following up"
-- Part of NanoClaw Schema v2 (post-base extension)
--
-- Why: the operator has repeatedly told sales to stop nudging a specific person
-- ("drop renee carr", "drop #213", "drop means drop") and the nudges came back
-- the next weekday. Two distinct failures, both observed in production:
--
--   1. WRONG WRITE, CONFIDENT REPORT. 2026-07-24 the sales agent announced
--      "Entry #213 (Namrata Kohli) marked lost — no more follow-ups will be
--      generated for her" and actually executed
--      fn_advance_pipeline_stage(213, 'qualifying', 'lost') — the stage string
--      and the reason string were transposed. `qualifying` is a valid stage, so
--      the FK passed, the function returns void, nothing was read back, and the
--      lead stayed in the queue. She was re-drafted 2026-07-25 and 2026-07-27.
--
--   2. ENTRY-SCOPED DROP, PERSON-SCOPED INTENT. Even a correct drop only moved
--      ONE pipeline_entries row. Namrata (party 10247) has entries 213 and 374;
--      Renee Carr exists as parties 10083 and 10281. Dropping one entry leaves
--      the others queued, and any new entry for the same person re-arms the
--      nudge. "Never contact them again" had no representation in the schema.
--
-- Fix: a party-level suppression flag that the queue view honours, plus ONE
-- function that expresses the whole intent so there is no stage string to
-- mistype, and which RETURNS what it changed so the caller can verify instead
-- of narrating. `parties.dnd_at` is deliberately NOT reused — that column means
-- "unsubscribed via the email link" and is honoured by v_active_pipeline, which
-- would also hide the lead from pipeline reporting. Operator suppression must
-- stop the nudges without erasing the lead from the pipeline.

BEGIN;

SET search_path TO business_v2, public, pg_catalog;

ALTER TABLE business_v2.parties
  ADD COLUMN IF NOT EXISTS no_followup_at     timestamptz,
  ADD COLUMN IF NOT EXISTS no_followup_reason text;

COMMENT ON COLUMN business_v2.parties.no_followup_at IS
  'When set, the operator has said stop following up this person. Excludes every one of their pipeline entries from v_sales_followup_queue, permanently and across new entries. Distinct from dnd_at (email unsubscribe): the lead stays visible in v_active_pipeline and reporting. Cleared by fn_resume_followups.';

COMMENT ON COLUMN business_v2.parties.no_followup_reason IS
  'Free text recorded when no_followup_at was set (who dropped them and why).';

-- ---------------------------------------------------------------------------
-- fn_drop_followups — the whole operator intent in one call.
--
-- Sets the party-level flag AND parks every open pipeline entry in the
-- `nurture` hold stage. Takes no stage argument, so the 2026-07-24 transposition
-- is not expressible. RETURNS one row per entry it actually moved (empty set is
-- a legitimate result: the party may have had no open entries), so the caller
-- reports DB state rather than its own intent.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION business_v2.fn_drop_followups(
  p_party_id bigint,
  p_reason   text
)
RETURNS TABLE (entry_id bigint, prev_stage text, new_stage text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, public, pg_catalog
AS $$
DECLARE
  v_canonical bigint;
BEGIN
  -- Follow any merge chain so dropping a merged duplicate still suppresses the
  -- surviving record.
  v_canonical := business_v2.canonical_party_id(p_party_id);
  IF v_canonical IS NULL THEN
    RAISE EXCEPTION 'fn_drop_followups: unknown party_id %', p_party_id;
  END IF;

  UPDATE business_v2.parties
  SET no_followup_at     = COALESCE(no_followup_at, now()),
      no_followup_reason = COALESCE(NULLIF(p_reason, ''), no_followup_reason),
      updated_at         = now(),
      last_updated_by    = COALESCE(
                             NULLIF(current_setting('app.current_agent', true), ''),
                             'unknown')
  WHERE id = v_canonical;

  PERFORM set_config('app.current_reason',
                     COALESCE(NULLIF(p_reason, ''), 'operator dropped from follow-ups'),
                     true);

  RETURN QUERY
  WITH moved AS (
    UPDATE business_v2.pipeline_entries pe
    SET stage           = 'nurture',
        last_updated_by = COALESCE(
                            NULLIF(current_setting('app.current_agent', true), ''),
                            'unknown')
    WHERE pe.party_id = v_canonical
      AND pe.stage NOT IN ('won', 'lost', 'nurture', 'paused')
    RETURNING pe.id, pe.stage
  )
  SELECT m.id, NULL::text, m.stage FROM moved m ORDER BY m.id;

  PERFORM set_config('app.current_reason', '', true);
END;
$$;

COMMENT ON FUNCTION business_v2.fn_drop_followups(bigint, text) IS
  'Durable, party-scoped "stop following up". Sets parties.no_followup_at and parks every open pipeline entry in nurture. Returns the entries it moved so the caller can verify instead of assuming. Reverse with fn_resume_followups.';

-- ---------------------------------------------------------------------------
-- fn_resume_followups — the reverse. Clears the flag; does NOT un-park entries
-- (moving a lead out of `nurture` is a deliberate pipeline decision, not an
-- automatic side effect of lifting the suppression).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION business_v2.fn_resume_followups(
  p_party_id bigint,
  p_reason   text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = business_v2, public, pg_catalog
AS $$
DECLARE
  v_canonical bigint;
  v_was_set   boolean;
BEGIN
  v_canonical := business_v2.canonical_party_id(p_party_id);
  IF v_canonical IS NULL THEN
    RAISE EXCEPTION 'fn_resume_followups: unknown party_id %', p_party_id;
  END IF;

  SELECT no_followup_at IS NOT NULL INTO v_was_set
  FROM business_v2.parties WHERE id = v_canonical;

  UPDATE business_v2.parties
  SET no_followup_at     = NULL,
      no_followup_reason = COALESCE(NULLIF(p_reason, ''), no_followup_reason),
      updated_at         = now(),
      last_updated_by    = COALESCE(
                             NULLIF(current_setting('app.current_agent', true), ''),
                             'unknown')
  WHERE id = v_canonical;

  RETURN COALESCE(v_was_set, false);
END;
$$;

COMMENT ON FUNCTION business_v2.fn_resume_followups(bigint, text) IS
  'Clears parties.no_followup_at. Returns true if suppression had been in effect. Does not move entries out of nurture — that is a separate pipeline decision.';

-- ---------------------------------------------------------------------------
-- Queue view: honour the party-level flag.
--
-- Definition is otherwise byte-identical to 105 — only the final NOT EXISTS is
-- new. Kept as a full CREATE OR REPLACE because Postgres cannot ALTER a view's
-- WHERE clause.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW business_v2.v_sales_followup_queue AS
WITH outbound AS (
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
  SELECT DISTINCT ON (i.party_id)
    i.party_id, i.metadata->>'thread_id' AS thread_id
  FROM business_v2.interactions i
  WHERE i.channel = 'email' AND i.direction = 'outbound' AND i.metadata ? 'thread_id'
  ORDER BY i.party_id, i.occurred_at DESC
),
inbound_email AS (
  SELECT DISTINCT ON (i.party_id)
    i.party_id, i.metadata->>'message' AS msg
  FROM business_v2.interactions i
  WHERE i.channel = 'email' AND i.direction = 'inbound'
    AND COALESCE(i.metadata->>'message', '') <> ''
  ORDER BY i.party_id, i.occurred_at ASC
),
contact_msg AS (
  SELECT DISTINCT ON (lower(w.raw_body->>'email'))
    lower(w.raw_body->>'email') AS email_l,
    w.raw_body->>'message'      AS msg
  FROM business_v2.webhook_inbox w
  WHERE w.source = 'contact-form'
    AND COALESCE(w.raw_body->>'message', '') <> ''
  ORDER BY lower(w.raw_body->>'email'), w.received_at DESC
),
form_page AS (
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
  ob.follow_up_count,
  th.thread_id,
  COALESCE(ob.first_subject, 'Re: ' || ap.program_name) AS original_subject,
  CASE
    WHEN cm.msg IS NOT NULL THEN 'contact-form'
    WHEN ie.msg IS NOT NULL THEN 'email'
    WHEN fp.form_page IS NOT NULL THEN 'webform'
    ELSE 'none'
  END AS inquiry_source,
  COALESCE(cm.msg, ie.msg) AS inquiry_text,
  fp.form_page AS interest_page
FROM business_v2.v_active_pipeline ap
JOIN outbound ob ON ob.party_id = ap.party_id
JOIN business_v2.v_party_contact_card pcc ON pcc.party_id = ap.party_id
LEFT JOIN thread th        ON th.party_id = ap.party_id
LEFT JOIN inbound_email ie ON ie.party_id = ap.party_id
LEFT JOIN form_page fp     ON fp.party_id = ap.party_id
LEFT JOIN contact_msg cm   ON cm.email_l = lower(pcc.primary_email::text)
WHERE ap.last_interaction_at < now() - INTERVAL '3 days'
  AND ap.stage NOT IN ('paused', 'nurture')
  AND ob.follow_up_count < 3
  AND NOT ob.has_precutover_outbound
  AND NOT EXISTS (
    SELECT 1 FROM business_v2.email_followup_suppressions s
    WHERE s.last_seen_open_at > now() - INTERVAL '3 days'
      AND (s.party_id = ap.party_id
           OR (s.email IS NOT NULL AND s.email = lower(pcc.primary_email::text)))
  )
  AND NOT EXISTS (                                          -- operator drop (113)
    SELECT 1 FROM business_v2.parties dp
    WHERE dp.id = ap.party_id AND dp.no_followup_at IS NOT NULL
  )
ORDER BY ap.last_interaction_at ASC;

COMMENT ON VIEW business_v2.v_sales_followup_queue IS
  'Deterministic sales email follow-up queue. One row per lead due a nudge: requires a prior outbound email, gone quiet 3+ days, under the 2-follow-up cap, not pre-cutover, not a current open-proposal recipient (email_followup_suppressions), and not operator-suppressed (parties.no_followup_at, migration 113). Carries origin context (inquiry_source/inquiry_text/interest_page) and thread_id. Full email thread is fetched from Gmail by the agent; outbound bodies are not stored in the DB.';

GRANT SELECT ON business_v2.v_sales_followup_queue
  TO nanoclaw_sales, nanoclaw_readonly, nanoclaw_admin;

-- Agents may drop and resume; the host daemon connects as nanoclaw_admin.
GRANT EXECUTE ON FUNCTION business_v2.fn_drop_followups(bigint, text)
  TO nanoclaw_sales, nanoclaw_chief, nanoclaw_admin;
GRANT EXECUTE ON FUNCTION business_v2.fn_resume_followups(bigint, text)
  TO nanoclaw_sales, nanoclaw_chief, nanoclaw_admin;

COMMIT;
