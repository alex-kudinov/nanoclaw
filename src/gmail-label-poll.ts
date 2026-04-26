/**
 * Gmail label-change poller — detects when operators manually move a
 * classified email between `MrGru/...` labels in the Gmail UI and emits a
 * classify_correction_detected IPC to chief so the learned-rule pipeline
 * can backfill matching historical emails.
 *
 * Runs as a separate host job (data/jobs.json → gmail-label-poll) every
 * 5 minutes. Persists the historyId cursor in router_state so runs are
 * cheap even on busy mailboxes. Skips events that match the classifier's
 * own writes (by comparing the added label against the DB) and events for
 * messages inside the 5-minute post-backfill window.
 *
 * See plans/nanoclaw/active/2026-04-09-bidirectional-gmail-classification.md T14
 */

import fs from 'fs';
import path from 'path';

import type { gmail_v1 } from 'googleapis';

import { query } from './business-db.js';
import { DATA_DIR } from './config.js';
import { getRouterState, setRouterState } from './db.js';
import { getGmailClient } from './gmail-auth.js';
import { logger } from './logger.js';

const HISTORY_STATE_KEY = 'gmail_label_poll_history_id';
const DEBOUNCE_TTL_MS = 30_000;
const MAX_PAGES = 20;
const CLASS_LABEL_PREFIX = 'MrGru/';

interface LabelAddedEvent {
  messageId: string;
  labelNames: string[];
}

/** Build { labelId → labelName } for every label whose name starts with `MrGru/`. */
async function resolveClassLabelNames(
  gmail: gmail_v1.Gmail,
): Promise<Map<string, string>> {
  const res = await gmail.users.labels.list({ userId: 'me' });
  const map = new Map<string, string>();
  for (const l of res.data.labels || []) {
    if (l.id && l.name && l.name.startsWith(CLASS_LABEL_PREFIX)) {
      map.set(l.id, l.name);
    }
  }
  return map;
}

function maxHistoryId(a: string, b: string): string {
  return BigInt(a) > BigInt(b) ? a : b;
}

async function walkLabelHistory(
  gmail: gmail_v1.Gmail,
  startHistoryId: string,
  classLabels: Map<string, string>,
): Promise<{ events: LabelAddedEvent[]; lastHistoryId: string }> {
  const events: LabelAddedEvent[] = [];
  let pageToken: string | undefined;
  let lastHistoryId = startHistoryId;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params: gmail_v1.Params$Resource$Users$History$List = {
      userId: 'me',
      startHistoryId,
      historyTypes: ['labelAdded'],
      maxResults: 500,
    };
    if (pageToken) params.pageToken = pageToken;

    const res = await gmail.users.history.list(params);
    const records = res.data.history || [];
    for (const record of records) {
      if (record.id) lastHistoryId = maxHistoryId(lastHistoryId, record.id);
      for (const added of record.labelsAdded || []) {
        const msgId = added.message?.id;
        if (!msgId) continue;
        const classNames: string[] = [];
        for (const lid of added.labelIds || []) {
          const name = classLabels.get(lid);
          if (name) classNames.push(name);
        }
        if (classNames.length > 0) {
          events.push({ messageId: msgId, labelNames: classNames });
        }
      }
    }
    if (res.data.historyId) {
      lastHistoryId = maxHistoryId(lastHistoryId, res.data.historyId);
    }
    pageToken = res.data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }
  return { events, lastHistoryId };
}

async function getCurrentDbLabel(messageId: string): Promise<string | null> {
  const res = await query<{ label: string }>(
    'SELECT label FROM email_classifications WHERE gmail_message_id = $1',
    [messageId],
  );
  return res.rows[0]?.label ?? null;
}

function isWithinBackfillWindow(messageId: string): boolean {
  const raw = getRouterState(`nanoclaw_backfill_marker_${messageId}`);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { expires_at: string };
    return Date.parse(parsed.expires_at) > Date.now();
  } catch {
    return false;
  }
}

function isDebounced(messageId: string): boolean {
  const raw = getRouterState(`label_poll_debounce_${messageId}`);
  if (!raw) return false;
  return Date.now() - Number.parseInt(raw, 10) < DEBOUNCE_TTL_MS;
}

function markDebounced(messageId: string): void {
  setRouterState(`label_poll_debounce_${messageId}`, String(Date.now()));
}

function emitCorrectionIpc(payload: {
  gmail_message_id: string;
  old_label: string;
  new_label: string;
  detected_at: string;
}): void {
  const dir = path.join(DATA_DIR, 'ipc', 'chief', 'messages');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(
    dir,
    `label-poll-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`,
  );
  fs.writeFileSync(
    file,
    JSON.stringify(
      { type: 'classify_correction_detected', ...payload },
      null,
      2,
    ),
    'utf-8',
  );
}

export interface LabelPollResult {
  processed: number;
  corrections: number;
  skipped: number;
}

/** Bootstrap: record the current historyId so the NEXT run polls real deltas. */
async function bootstrap(gmail: gmail_v1.Gmail): Promise<LabelPollResult> {
  const profile = await gmail.users.getProfile({ userId: 'me' });
  if (profile.data.historyId) {
    setRouterState(HISTORY_STATE_KEY, profile.data.historyId);
  }
  logger.info(
    { historyId: profile.data.historyId },
    'gmail-label-poll: bootstrap — recorded current historyId, next run will poll deltas',
  );
  return { processed: 0, corrections: 0, skipped: 0 };
}

export async function runLabelChangePoll(): Promise<LabelPollResult> {
  const gmail = getGmailClient();
  const startHistoryId = getRouterState(HISTORY_STATE_KEY);
  if (!startHistoryId) return bootstrap(gmail);

  const classLabels = await resolveClassLabelNames(gmail);
  let events: LabelAddedEvent[];
  let lastHistoryId: string;
  try {
    const walk = await walkLabelHistory(gmail, startHistoryId, classLabels);
    events = walk.events;
    lastHistoryId = walk.lastHistoryId;
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code === 404) {
      logger.warn('gmail-label-poll: historyId expired, re-bootstrapping');
      return bootstrap(gmail);
    }
    throw err;
  }

  const result: LabelPollResult = {
    processed: events.length,
    corrections: 0,
    skipped: 0,
  };

  for (const ev of events) {
    if (isDebounced(ev.messageId) || isWithinBackfillWindow(ev.messageId)) {
      result.skipped++;
      continue;
    }
    const dbLabel = await getCurrentDbLabel(ev.messageId);
    if (!dbLabel) {
      result.skipped++;
      continue;
    }
    const newLabel = ev.labelNames.find((n) => n !== dbLabel);
    if (!newLabel) {
      result.skipped++;
      continue;
    }
    emitCorrectionIpc({
      gmail_message_id: ev.messageId,
      old_label: dbLabel,
      new_label: newLabel,
      detected_at: new Date().toISOString(),
    });
    markDebounced(ev.messageId);
    result.corrections++;
  }

  setRouterState(HISTORY_STATE_KEY, lastHistoryId);
  logger.info(
    {
      processed: result.processed,
      corrections: result.corrections,
      skipped: result.skipped,
      lastHistoryId,
    },
    'gmail-label-poll: run complete',
  );
  return result;
}
