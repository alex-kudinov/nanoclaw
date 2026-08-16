/**
 * Hive sync reaper — retries `email_classifications` rows where the inline
 * Hive Firestore write failed (hive_synced=FALSE), and dead-letters rows
 * that fail 5 times in a row.
 *
 * Invoked by the `hive-sync-reaper` host job every 15 minutes. Runs in a
 * separate process from the daemon, so the IPC alerts go through the
 * chief/messages/ file-drop channel (the daemon's watcher picks them up).
 *
 * See plans/nanoclaw/active/2026-04-09-bidirectional-gmail-classification.md T17
 */

import fs from 'fs';
import path from 'path';

import { isExternalWriteDeniedError } from './action-safety.js';
import { DATA_DIR } from './config.js';
import { query } from './business-db.js';
import { getAllRegisteredGroups } from './db.js';
import { recordClassification } from './hive-bridge.js';
import { logger } from './logger.js';

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;
const DEAD_LETTER_BURST_ALERT = 10;

interface StaleRow {
  gmail_message_id: string;
  gmail_thread_id: string;
  label: string;
  reaper_attempts: number;
  hive_share_target: string[];
}

export interface ReaperResult {
  processed: number;
  recovered: number;
  held: number;
  retried: number;
  deadLettered: number;
  deadLetterDetails: Array<{ gmail_message_id: string; error: string }>;
}

async function fetchStaleRows(): Promise<StaleRow[]> {
  const res = await query<StaleRow>(
    `SELECT ec.gmail_message_id, ec.gmail_thread_id, ec.label, ec.reaper_attempts,
            ct.hive_share_target
       FROM email_classifications ec
       JOIN classification_taxonomy ct ON ec.label = ct.label
      WHERE ec.hive_synced = FALSE
        AND ec.hive_sync_dead_lettered = FALSE
        AND ec.classified_at > NOW() - INTERVAL '7 days'
        AND ct.hive_share_target IS NOT NULL
      ORDER BY ec.reaper_attempts ASC, ec.classified_at ASC
      LIMIT $1`,
    [BATCH_SIZE],
  );
  return res.rows;
}

/** Drop a chief-bound message file; the daemon's IPC watcher routes it to Slack.
 * IPC handler at src/ipc.ts:152 requires chatJid + text — look up chief's jid
 * from the registered_groups SQLite table; drop the alert with a warn if chief
 * isn't registered. */
function alertChief(text: string): void {
  let chiefJid: string | null = null;
  try {
    const groups = getAllRegisteredGroups();
    const found = Object.entries(groups).find(([, g]) => g.folder === 'chief');
    chiefJid = found?.[0] ?? null;
  } catch (err) {
    logger.warn(
      { err, text },
      'hive-sync-reaper: failed to resolve chief jid; alert dropped',
    );
    return;
  }
  if (!chiefJid) {
    logger.warn(
      { text },
      'hive-sync-reaper: chief group not registered; alert dropped',
    );
    return;
  }
  const dir = path.join(DATA_DIR, 'ipc', 'chief', 'messages');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(
    dir,
    `reaper-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`,
  );
  fs.writeFileSync(
    file,
    JSON.stringify({ type: 'message', chatJid: chiefJid, text }, null, 2),
    'utf-8',
  );
}

async function markSuccess(gmailMessageId: string): Promise<void> {
  await query(
    'UPDATE email_classifications SET hive_synced = TRUE, hive_synced_at = NOW() WHERE gmail_message_id = $1',
    [gmailMessageId],
  );
}

/** Returns true if the row was dead-lettered. */
async function markFailure(row: StaleRow): Promise<boolean> {
  const nextAttempts = row.reaper_attempts + 1;
  const dead = nextAttempts >= MAX_ATTEMPTS;
  await query(
    `UPDATE email_classifications
        SET reaper_attempts = $1, hive_sync_dead_lettered = $2
      WHERE gmail_message_id = $3`,
    [nextAttempts, dead, row.gmail_message_id],
  );
  return dead;
}

function emitAlerts(result: ReaperResult): void {
  if (result.deadLettered === 0) return;
  if (result.deadLettered >= DEAD_LETTER_BURST_ALERT) {
    alertChief(
      `[REAPER-DEAD-LETTER-BURST] ${result.deadLettered} classifications dead-lettered this run after ${MAX_ATTEMPTS} failed sync attempts. Investigate Hive auth/quota/network before more backlog accumulates.`,
    );
    return;
  }
  for (const dl of result.deadLetterDetails) {
    alertChief(
      `[REAPER-DEAD-LETTER] Message ${dl.gmail_message_id} dead-lettered after ${MAX_ATTEMPTS} attempts: ${dl.error}`,
    );
  }
}

export async function runReaper(): Promise<ReaperResult> {
  const rows = await fetchStaleRows();
  const result: ReaperResult = {
    processed: rows.length,
    recovered: 0,
    held: 0,
    retried: 0,
    deadLettered: 0,
    deadLetterDetails: [],
  };

  for (const row of rows) {
    try {
      await recordClassification(
        row.gmail_thread_id,
        row.label,
        row.hive_share_target,
      );
      await markSuccess(row.gmail_message_id);
      result.recovered++;
    } catch (err) {
      if (isExternalWriteDeniedError(err) && err.system === 'hive_firestore') {
        result.held++;
        continue;
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      const dead = await markFailure(row);
      if (dead) {
        result.deadLettered++;
        result.deadLetterDetails.push({
          gmail_message_id: row.gmail_message_id,
          error: errMsg,
        });
      } else {
        result.retried++;
      }
    }
  }

  emitAlerts(result);

  logger.info(
    {
      processed: result.processed,
      recovered: result.recovered,
      held: result.held,
      retried: result.retried,
      deadLettered: result.deadLettered,
    },
    'hive-sync-reaper: run complete',
  );

  return result;
}
