/**
 * Classification backfill — when chief routes a lesson that teaches mailman
 * how to classify a pattern of emails, this module re-labels any past
 * `email_classifications` rows that match the pattern so the historic record
 * stays in sync.
 *
 * Safety: a hard cap (default 25) gates the mutation path; over-cap lessons
 * write to `classification_backfill_pending` and post to chief for approval.
 * A secondary 20% guard skips any backfill that would touch more than 20%
 * of all classifications, unless the caller explicitly overrides.
 *
 * The `src/ipc.ts` hook that invokes this module lives in T09/T12's deploy
 * step; this file is standalone and can be tested in isolation.
 */

import type { RouteLessonPayload } from './learn-ipc-handler.js';
import { query, withTransaction } from './business-db.js';
import { replaceClassLabelsOnThread } from './gmail-labels.js';
import { setRouterState } from './db.js';
import { logger } from './logger.js';

export const DEFAULT_BACKFILL_CAP = 25;
const TWENTY_PERCENT = 0.2;
const MARKER_TTL_MS = 5 * 60 * 1000;

export interface ParsedLesson {
  pattern_type: 'sender_exact' | 'sender_regex' | 'subject_regex';
  pattern_value: string;
  target_label: string;
}

/** Parse a lesson's title+rule into a structured rule. null if unparseable. */
export function parseClassificationLesson(
  _title: string,
  ruleText: string,
): ParsedLesson | null {
  if (!ruleText) return null;
  const senderExact = ruleText.match(
    /sender\s+is\s+([^\s,]+),?\s*classify\s+as\s+(MrGru\/[^\s.]+)/i,
  );
  if (senderExact) {
    return {
      pattern_type: 'sender_exact',
      pattern_value: senderExact[1].toLowerCase(),
      target_label: senderExact[2],
    };
  }
  const senderRegex = ruleText.match(
    /sender\s+matches?\s+\/(.+?)\/,?\s*classify\s+as\s+(MrGru\/[^\s.]+)/i,
  );
  if (senderRegex) {
    return {
      pattern_type: 'sender_regex',
      pattern_value: senderRegex[1],
      target_label: senderRegex[2],
    };
  }
  const subjectRegex = ruleText.match(
    /subject\s+matches?\s+\/(.+?)\/,?\s*classify\s+as\s+(MrGru\/[^\s.]+)/i,
  );
  if (subjectRegex) {
    return {
      pattern_type: 'subject_regex',
      pattern_value: subjectRegex[1],
      target_label: subjectRegex[2],
    };
  }
  return null;
}

export function isClassificationLesson(
  title: string,
  ruleText: string,
): boolean {
  return parseClassificationLesson(title, ruleText) !== null;
}

function parseOverrideFlags(context?: string): {
  override: boolean;
  overrideCap: boolean;
} {
  if (!context) return { override: false, overrideCap: false };
  try {
    const parsed = JSON.parse(context) as Record<string, unknown>;
    return {
      override: parsed.override === true,
      overrideCap: parsed.override_backfill_cap === true,
    };
  } catch {
    return { override: false, overrideCap: false };
  }
}

function matchSqlForPattern(parsed: ParsedLesson): {
  where: string;
  params: unknown[];
} {
  switch (parsed.pattern_type) {
    case 'sender_exact':
      return {
        where: 'LOWER(sender_email) = $1 AND label <> $2',
        params: [parsed.pattern_value, parsed.target_label],
      };
    case 'sender_regex':
      return {
        where: 'sender_email ~ $1 AND label <> $2',
        params: [parsed.pattern_value, parsed.target_label],
      };
    case 'subject_regex':
      return {
        where: 'subject ~ $1 AND label <> $2',
        params: [parsed.pattern_value, parsed.target_label],
      };
  }
}

export async function dryRunClassificationLesson(
  parsed: ParsedLesson,
): Promise<{ projected_matches: number; sample_ids: string[] }> {
  const { where, params } = matchSqlForPattern(parsed);
  const res = await query<{ gmail_message_id: string }>(
    `SELECT gmail_message_id FROM email_classifications WHERE ${where} LIMIT 100`,
    params,
  );
  return {
    projected_matches: res.rowCount || 0,
    sample_ids: res.rows.slice(0, 5).map((r) => r.gmail_message_id),
  };
}

async function ensureTaxonomyHas(label: string): Promise<boolean> {
  const res = await query<{ label: string }>(
    'SELECT label FROM classification_taxonomy WHERE label = $1 AND enabled = TRUE LIMIT 1',
    [label],
  );
  return (res.rowCount || 0) > 0;
}

async function insertRule(
  parsed: ParsedLesson,
  lessonTitle: string,
): Promise<void> {
  await query(
    `INSERT INTO classification_rules
       (pattern_type, pattern_value, target_label, source)
     VALUES ($1, $2, $3, 'lesson')
     ON CONFLICT (pattern_type, pattern_value) DO NOTHING`,
    [parsed.pattern_type, parsed.pattern_value, parsed.target_label],
  );
  logger.info({ parsed, lessonTitle }, 'classify-backfill: rule inserted');
}

async function fetchTotalClassifications(): Promise<number> {
  const res = await query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM email_classifications',
    [],
  );
  return parseInt(res.rows[0]?.count || '0', 10);
}

interface MatchRow {
  gmail_message_id: string;
  gmail_thread_id: string;
  label: string;
}

async function fetchMatches(parsed: ParsedLesson): Promise<MatchRow[]> {
  const { where, params } = matchSqlForPattern(parsed);
  const res = await query<MatchRow>(
    `SELECT gmail_message_id, gmail_thread_id, label FROM email_classifications WHERE ${where}`,
    params,
  );
  return res.rows;
}

function setWriteMarker(messageId: string, lessonTitle: string): void {
  const expiresAt = new Date(Date.now() + MARKER_TTL_MS).toISOString();
  setRouterState(
    `nanoclaw_backfill_marker_${messageId}`,
    JSON.stringify({ expires_at: expiresAt, lesson_title: lessonTitle }),
  );
}

async function applyBatch(
  matches: MatchRow[],
  parsed: ParsedLesson,
  lessonTitle: string,
): Promise<{ relabeled: number }> {
  for (const m of matches) setWriteMarker(m.gmail_message_id, lessonTitle);
  await withTransaction(async (client) => {
    for (const m of matches) {
      await client.query(
        `UPDATE email_classifications
            SET label = $1, corrected_at = NOW(), corrected_from_label = $2
          WHERE gmail_message_id = $3`,
        [parsed.target_label, m.label, m.gmail_message_id],
      );
    }
  });
  const threads = new Set(matches.map((m) => m.gmail_thread_id));
  for (const threadId of threads) {
    await replaceClassLabelsOnThread(threadId, parsed.target_label);
  }
  return { relabeled: matches.length };
}

async function insertPendingBackfill(
  parsed: ParsedLesson,
  lessonTitle: string,
  matchCount: number,
  sampleIds: string[],
): Promise<number> {
  const res = await query<{ id: number }>(
    `INSERT INTO classification_backfill_pending
       (lesson_title, pattern_type, pattern_value, target_label, match_count, dry_run_summary)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      lessonTitle,
      parsed.pattern_type,
      parsed.pattern_value,
      parsed.target_label,
      matchCount,
      `sample: ${sampleIds.join(', ')}`,
    ],
  );
  return res.rows[0]?.id || 0;
}

export async function handleClassificationLesson(
  payload: RouteLessonPayload,
  cap: number = DEFAULT_BACKFILL_CAP,
): Promise<void> {
  const parsed = parseClassificationLesson(payload.title, payload.rule);
  if (!parsed) {
    logger.warn(
      { title: payload.title },
      'classify-backfill: unparseable lesson',
    );
    return;
  }

  if (!(await ensureTaxonomyHas(parsed.target_label))) {
    logger.warn(
      { label: parsed.target_label },
      'classify-backfill: target_label not in taxonomy',
    );
    return;
  }

  await insertRule(parsed, payload.title);

  const dryRun = await dryRunClassificationLesson(parsed);
  if (dryRun.projected_matches === 0) {
    logger.info(
      { parsed },
      'classify-backfill: 0 matches, nothing to backfill',
    );
    return;
  }

  const { override } = parseOverrideFlags(payload.context);
  const total = await fetchTotalClassifications();
  if (
    !override &&
    total > 0 &&
    dryRun.projected_matches / total > TWENTY_PERCENT
  ) {
    logger.warn(
      { matches: dryRun.projected_matches, total },
      'classify-backfill: >20% guard tripped; skipping (pass override: true to force)',
    );
    return;
  }

  if (dryRun.projected_matches > cap) {
    const pendingId = await insertPendingBackfill(
      parsed,
      payload.title,
      dryRun.projected_matches,
      dryRun.sample_ids,
    );
    logger.info(
      { pendingId, matches: dryRun.projected_matches, cap },
      'classify-backfill: over cap, pending operator approval',
    );
    return;
  }

  const matches = await fetchMatches(parsed);
  const result = await applyBatch(matches, parsed, payload.title);
  logger.info(
    { lesson: payload.title, relabeled: result.relabeled },
    'classify-backfill: applied',
  );
}

/** Mark pending backfills older than 24h as expired. Called on 5-min interval. */
export async function sweepExpiredBackfills(): Promise<number> {
  const res = await query(
    `UPDATE classification_backfill_pending
        SET status = 'expired', resolved_at = NOW(), resolved_by = 'auto-expired'
      WHERE status = 'awaiting_confirmation' AND expires_at < NOW()`,
  );
  const n = res.rowCount || 0;
  if (n > 0)
    logger.info({ expired: n }, 'classify-backfill: swept expired pending');
  return n;
}
