/**
 * Gmail Pub/Sub push helpers.
 *
 * Replaces fast polling with `users.watch()` — Gmail publishes notifications
 * to a Cloud Pub/Sub topic, which are delivered (via n8n) to the NanoClaw
 * webhook server. On each notification we fetch a history delta from the last
 * processed historyId to enumerate new messages.
 *
 * Docs: https://developers.google.com/gmail/api/guides/push
 */

import { gmail_v1 } from 'googleapis';

import { getRouterState, setRouterState } from './db.js';
import { logger } from './logger.js';

export const HISTORY_ID_KEY = 'gmail_history_id';
export const WATCH_EXPIRES_KEY = 'gmail_watch_expires_at';

export interface WatchResult {
  historyId: string;
  expiration: number; // ms epoch
}

/**
 * Thrown when history.list returns 404 — the startHistoryId is outside
 * Gmail's retained history window. The caller must retain the prior cursor
 * and enter the durable full-sync gap workflow; skipping to a fresh cursor is
 * not an accepted recovery path.
 */
export class HistoryExpiredError extends Error {
  constructor() {
    super('Gmail historyId expired (>7 days)');
    this.name = 'HistoryExpiredError';
  }
}

/**
 * Thrown when history pagination is still non-terminal after the hard page
 * bound. The caller must retain the prior cursor; advancing would silently
 * skip every unlisted page.
 */
export class HistoryPageLimitError extends Error {
  constructor() {
    super('Gmail history delta exceeded the 20-page safety bound');
    this.name = 'HistoryPageLimitError';
  }
}

/**
 * Register (or refresh) a push subscription on the user's mailbox.
 * Idempotent — calling again simply resets the expiration clock.
 * Returns the current historyId and expiration (ms epoch).
 */
export async function startWatch(
  gmail: gmail_v1.Gmail,
  topicName: string,
  labelIds?: string[],
): Promise<WatchResult> {
  const requestBody: gmail_v1.Schema$WatchRequest = { topicName };
  if (labelIds && labelIds.length > 0) {
    requestBody.labelIds = labelIds;
  }

  const res = await gmail.users.watch({ userId: 'me', requestBody });
  const historyId = res.data.historyId || '';
  const expiration = parseInt(res.data.expiration || '0', 10);

  if (!historyId || !expiration) {
    throw new Error('users.watch returned no historyId or expiration');
  }

  // Only seed the stored historyId if we don't already have one — we never
  // want to move it forward here, or we'd skip any notifications that arrived
  // between the old stored value and the new watch bootstrap.
  if (!getStoredHistoryId()) {
    setStoredHistoryId(historyId);
  }
  setRouterState(WATCH_EXPIRES_KEY, String(expiration));

  logger.info(
    {
      topicName,
      historyId,
      expiresInHours: ((expiration - Date.now()) / 3_600_000).toFixed(1),
    },
    'Gmail watch established',
  );

  return { historyId, expiration };
}

/**
 * Stop push delivery. Safe to call on shutdown — a subsequent watch() will
 * re-register. Errors are swallowed.
 */
export async function stopWatch(gmail: gmail_v1.Gmail): Promise<void> {
  try {
    await gmail.users.stop({ userId: 'me' });
    logger.info('Gmail watch stopped');
  } catch (err) {
    logger.warn({ err }, 'Gmail stopWatch failed (ignored)');
  }
}

export function getStoredHistoryId(): string | undefined {
  return getRouterState(HISTORY_ID_KEY);
}

export function setStoredHistoryId(historyId: string): void {
  setRouterState(HISTORY_ID_KEY, historyId);
}

export function getWatchExpiresAt(): number {
  const raw = getRouterState(WATCH_EXPIRES_KEY);
  return raw ? parseInt(raw, 10) : 0;
}

/**
 * Seed the stored historyId from users.getProfile() if no baseline exists.
 * Used in passive-subscriber mode where another service owns users.watch()
 * and NanoClaw has no fresh historyId from a watch response to anchor on.
 * Returns the resulting stored historyId.
 */
export async function ensureHistoryIdBaseline(
  gmail: gmail_v1.Gmail,
): Promise<string> {
  const existing = getStoredHistoryId();
  if (existing) return existing;

  const res = await gmail.users.getProfile({ userId: 'me' });
  const profileHistoryId = res.data.historyId;
  if (!profileHistoryId) {
    throw new Error('users.getProfile returned no historyId');
  }
  setStoredHistoryId(profileHistoryId);
  logger.info(
    { historyId: profileHistoryId },
    'Gmail history baseline seeded from users.getProfile',
  );
  return profileHistoryId;
}

/**
 * Walk users.history.list from startHistoryId forward, returning all new
 * message IDs added to the mailbox. Only messageAdded events are collected —
 * label changes are ignored. Paginates up to MAX_PAGES * 500 = 10k records;
 * beyond that the caller should re-bootstrap.
 *
 * Returns { messageIds, lastHistoryId } where lastHistoryId is the newest
 * historyId observed (use it to advance stored state).
 *
 * Throws HistoryExpiredError on 404 (startHistoryId too old).
 */
export async function processHistoryDelta(
  gmail: gmail_v1.Gmail,
  startHistoryId: string,
  labelId?: string,
): Promise<{ messageIds: string[]; lastHistoryId: string }> {
  const messageIds = new Set<string>();
  let pageToken: string | undefined;
  let lastHistoryId = startHistoryId;
  const MAX_PAGES = 20;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params: gmail_v1.Params$Resource$Users$History$List = {
      userId: 'me',
      startHistoryId,
      historyTypes: ['messageAdded'],
      maxResults: 500,
    };
    if (pageToken) params.pageToken = pageToken;
    if (labelId) params.labelId = labelId;

    let res;
    try {
      res = await gmail.users.history.list(params);
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === 404) throw new HistoryExpiredError();
      throw err;
    }

    const records = res.data.history || [];
    for (const record of records) {
      if (record.id) {
        // history.id is monotonic; keep the max
        if (compareHistoryIds(record.id, lastHistoryId) > 0) {
          lastHistoryId = record.id;
        }
      }
      for (const added of record.messagesAdded || []) {
        if (added.message?.id) messageIds.add(added.message.id);
      }
    }

    // historyId at the top of the response is the most recent globally — use
    // it to advance even if there were no in-range records on this page.
    if (
      res.data.historyId &&
      compareHistoryIds(res.data.historyId, lastHistoryId) > 0
    ) {
      lastHistoryId = res.data.historyId;
    }

    pageToken = res.data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }

  if (pageToken) {
    throw new HistoryPageLimitError();
  }

  return { messageIds: [...messageIds], lastHistoryId };
}

/**
 * Compare two Gmail historyIds as unsigned integers. Returns:
 *   -1 if a < b, 0 if equal, 1 if a > b.
 * Uses BigInt because historyIds can exceed Number.MAX_SAFE_INTEGER.
 */
export function compareHistoryIds(a: string, b: string): number {
  const ba = BigInt(a);
  const bb = BigInt(b);
  if (ba < bb) return -1;
  if (ba > bb) return 1;
  return 0;
}
