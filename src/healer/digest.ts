/**
 * Daily incident digest (self-healing Phase 0, design §3.3 / Unit 6).
 *
 * Summarizes open incidents seen since the last digest and posts them to
 * #gru-incidents at 18:00 CT. An empty day still posts a terse "alive" line so
 * silence never reads as "the healer is dead".
 */

import { query } from '../business-db.js';
import { logger } from '../logger.js';
import { alert } from './alert.js';
import { getState, setState } from './incident-store.js';
import { postIncidents } from './slack.js';

export interface DigestRow {
  source: string;
  severity: string;
  occurrences: number;
  last_seen: string;
  raw_context: Record<string, unknown>;
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  error: 1,
  warn: 2,
  info: 3,
};
const MAX_LINES = 20;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + '…';
}

function detailOf(ctx: Record<string, unknown>): string {
  const v = ctx.err_message ?? ctx.error ?? ctx.last_run_error ?? ctx.msg ?? '';
  return typeof v === 'string' ? v : '';
}

function severityCounts(rows: DigestRow[]): string {
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.severity] = (counts[r.severity] ?? 0) + 1;
  return Object.keys(counts)
    .sort((a, b) => (SEVERITY_ORDER[a] ?? 9) - (SEVERITY_ORDER[b] ?? 9))
    .map((s) => `${s}: ${counts[s]}`)
    .join('  ·  ');
}

/** One incident → one bullet line. Shared by the digest and the fast-loop alert. */
export function formatIncidentLine(r: DigestRow): string {
  const detail = detailOf(r.raw_context);
  return `• [${r.severity}] *${r.source}* ×${r.occurrences}${detail ? ` — ${truncate(detail, 120)}` : ''}`;
}

/** Render the digest message. Pure — unit-tested directly. */
export function formatDigest(rows: DigestRow[], since: string): string {
  if (rows.length === 0) {
    return `:white_check_mark: *Incident digest* — no new incidents since ${since}. Healer alive.`;
  }
  const header =
    `:rotating_light: *Incident digest* — ${rows.length} open since ${since}\n` +
    severityCounts(rows);
  const lines = rows.slice(0, MAX_LINES).map(formatIncidentLine);
  const more =
    rows.length > MAX_LINES ? `\n…and ${rows.length - MAX_LINES} more` : '';
  return `${header}\n${lines.join('\n')}${more}`;
}

/** Digest entrypoint: query open incidents since last digest, post, checkpoint. */
export async function runDigest(): Promise<void> {
  const sinceIso = await getState<string | null>('last_digest_at', null);
  const r = await query<DigestRow>(
    `SELECT source, severity, occurrences, last_seen::text, raw_context
       FROM business_v2.incidents
      WHERE status NOT IN ('resolved', 'wont_fix')
        AND last_seen > COALESCE($1::timestamptz, 'epoch'::timestamptz)
      ORDER BY CASE severity
                 WHEN 'critical' THEN 0 WHEN 'error' THEN 1
                 WHEN 'warn' THEN 2 ELSE 3 END,
               occurrences DESC`,
    [sinceIso],
  );
  const text = formatDigest(r.rows, sinceIso ?? 'the last run');
  const posted = await postIncidents(text);
  if (!posted) {
    await alert(
      'warn',
      'Incident digest delivery failed',
      `Could not post digest to Slack (${r.rows.length} incidents).`,
    );
  }
  await setState('last_digest_at', new Date().toISOString());
  logger.info({ incidents: r.rows.length, posted }, 'healer: digest complete');
}
