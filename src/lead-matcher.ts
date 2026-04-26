/**
 * Matches an inbound sender email against active pipeline entries in business_v2.
 * Used by the host router to detect replies from prospects and route to sales.
 */

import { query } from './business-db.js';
import { logger } from './logger.js';

export interface PipelineMatch {
  pipeline_entry_id: number;
  party_id: number;
  display_name: string;
  stage: string;
  program_slug: string;
  last_interaction_at: string | null;
  thread_id: string | null;
}

/**
 * Two-step lookup:
 * 1. Resolve sender email → party_id via best_party_by_email()
 * 2. Find active pipeline entry for that party with recent interaction
 *
 * Thread ID is pulled from the most recent outbound email interaction's
 * metadata (where mailman logs it via fn_log_interaction).
 */
const MATCH_SQL = `
  WITH party AS (
    SELECT business_v2.best_party_by_email($1::citext) AS id
  ),
  pipeline AS (
    SELECT
      ap.pipeline_entry_id,
      ap.party_id,
      ap.display_name,
      ap.stage,
      ap.program_slug,
      ap.last_interaction_at
    FROM business_v2.v_active_pipeline ap
    JOIN party ON ap.party_id = party.id
    WHERE ap.stage IN ('new','qualifying','proposal','negotiating')
      AND ap.last_interaction_at > NOW() - INTERVAL '60 days'
    ORDER BY ap.last_interaction_at DESC NULLS LAST
    LIMIT 1
  ),
  thread AS (
    SELECT (i.metadata->>'thread_id') AS thread_id
    FROM business_v2.interactions i
    JOIN pipeline p ON i.party_id = p.party_id
    WHERE i.channel = 'email'
      AND i.direction = 'outbound'
      AND i.metadata ? 'thread_id'
    ORDER BY i.occurred_at DESC
    LIMIT 1
  )
  SELECT
    p.pipeline_entry_id,
    p.party_id,
    p.display_name,
    p.stage,
    p.program_slug,
    p.last_interaction_at::text,
    t.thread_id
  FROM pipeline p
  LEFT JOIN thread t ON true`;

async function runQuery(email: string): Promise<PipelineMatch | null> {
  const result = await query<PipelineMatch>(MATCH_SQL, [email]);
  return result.rows[0] ?? null;
}

export async function matchLead(
  senderEmail: string,
): Promise<PipelineMatch | null> {
  if (!senderEmail || typeof senderEmail !== 'string') return null;
  const email = senderEmail.toLowerCase();
  try {
    return await runQuery(email);
  } catch (err) {
    logger.warn({ err, email }, 'lead-matcher: first attempt failed, retrying');
    try {
      await new Promise((r) => setTimeout(r, 500));
      return await runQuery(email);
    } catch (retryErr) {
      logger.error({ err: retryErr, email }, 'lead-matcher: retry failed');
      return null;
    }
  }
}
