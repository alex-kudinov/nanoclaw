/**
 * Gmail label primitives — CRUD + per-message/thread label operations.
 * Host process only. Supplements src/gmail-api.ts.
 * Used by classify-ipc-handlers (T07), classify-backfill (T12), gmail-history (T14).
 */

import { gmail_v1 } from 'googleapis';

import { getGmailClient } from './gmail-auth.js';
import { logger } from './logger.js';

const LABEL_NAME_RE = /^[a-zA-Z0-9 /_:\-[\]()]{1,225}$/;
const BATCH_SIZE = 50;
const CACHE_TTL_MS = 30 * 60 * 1000;
const QUOTA_WARN_THRESHOLD = 1000;

let cache: Map<string, string> = new Map();
let cacheResetAt = 0;
let quotaWindowStart = 0;
let quotaCalls = 0;

function assertValidLabelName(name: string): void {
  if (!LABEL_NAME_RE.test(name)) {
    throw new Error(`gmail-labels: invalid label name "${name}"`);
  }
}

function trackQuota(n: number): void {
  const now = Date.now();
  if (now - quotaWindowStart > 60_000) {
    quotaWindowStart = now;
    quotaCalls = 0;
  }
  quotaCalls += n;
  if (quotaCalls > QUOTA_WARN_THRESHOLD) {
    logger.warn({ quotaCalls }, 'gmail-labels: quota warning');
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Return a name→id map, refreshing the cache if expired. */
export async function listLabels(): Promise<Map<string, string>> {
  const now = Date.now();
  if (cache.size > 0 && now - cacheResetAt < CACHE_TTL_MS) return cache;
  const gmail = getGmailClient();
  const res = await gmail.users.labels.list({ userId: 'me' });
  const next = new Map<string, string>();
  for (const l of res.data.labels || []) {
    if (l.name && l.id) next.set(l.name, l.id);
  }
  cache = next;
  cacheResetAt = now;
  return cache;
}

/** Return label id; create the label if it does not exist. */
export async function ensureLabel(
  name: string,
  opts: { labelListVisibility?: string; messageListVisibility?: string } = {},
): Promise<string> {
  assertValidLabelName(name);
  const hit = (await listLabels()).get(name);
  if (hit) return hit;
  const gmail = getGmailClient();
  const res = await gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      name,
      labelListVisibility: opts.labelListVisibility || 'labelShowIfUnread',
      messageListVisibility: opts.messageListVisibility || 'show',
    },
  });
  const id = res.data.id || '';
  if (!id) throw new Error(`gmail-labels: create returned no id for "${name}"`);
  cache.set(name, id);
  return id;
}

export async function updateLabel(
  name: string,
  patch: gmail_v1.Schema$Label,
): Promise<void> {
  assertValidLabelName(name);
  const id = await ensureLabel(name);
  await getGmailClient().users.labels.patch({
    userId: 'me',
    id,
    requestBody: patch,
  });
  resetLabelCache();
}

export async function deleteLabel(name: string): Promise<void> {
  assertValidLabelName(name);
  const id = (await listLabels()).get(name);
  if (!id) return;
  await getGmailClient().users.labels.delete({ userId: 'me', id });
  cache.delete(name);
}

async function resolveIds(names: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const n of names) out.push(await ensureLabel(n));
  return out;
}

async function modifyMessageLabels(
  messageId: string,
  labelNames: string[],
  mode: 'add' | 'remove',
): Promise<void> {
  if (labelNames.length === 0) return;
  const gmail = getGmailClient();
  for (const group of chunk(labelNames, BATCH_SIZE)) {
    const ids = await resolveIds(group);
    const requestBody =
      mode === 'add' ? { addLabelIds: ids } : { removeLabelIds: ids };
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody,
    });
    trackQuota(1);
  }
}

export function addLabels(
  messageId: string,
  labelNames: string[],
): Promise<void> {
  return modifyMessageLabels(messageId, labelNames, 'add');
}

export function removeLabels(
  messageId: string,
  labelNames: string[],
): Promise<void> {
  return modifyMessageLabels(messageId, labelNames, 'remove');
}

async function getThreadMessages(
  threadId: string,
): Promise<gmail_v1.Schema$Message[]> {
  const res = await getGmailClient().users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'minimal',
  });
  const msgs = res.data.messages || [];
  if (msgs.length > 500) {
    logger.warn({ threadId, count: msgs.length }, 'gmail-labels: huge thread');
  }
  return msgs;
}

/** Apply labels to every message in a thread (Gmail labels are per-message). */
export async function addLabelsToThread(
  threadId: string,
  labelNames: string[],
): Promise<{ messageIds: string[]; labelIds: string[] }> {
  const msgs = await getThreadMessages(threadId);
  const messageIds: string[] = [];
  for (const m of msgs) {
    if (!m.id) continue;
    await addLabels(m.id, labelNames);
    messageIds.push(m.id);
  }
  const labelIds = await resolveIds(labelNames);
  return { messageIds, labelIds };
}

export async function removeLabelsFromThread(
  threadId: string,
  labelNames: string[],
): Promise<void> {
  const msgs = await getThreadMessages(threadId);
  for (const m of msgs) {
    if (!m.id) continue;
    await removeLabels(m.id, labelNames);
  }
}

/** Enforce single-class-label invariant: remove stale MrGru/* then apply target. */
export async function replaceClassLabelsOnThread(
  threadId: string,
  targetLabel: string,
): Promise<{ removed: string[]; applied: string }> {
  assertValidLabelName(targetLabel);
  const msgs = await getThreadMessages(threadId);
  const labels = await listLabels();
  const idToName = new Map<string, string>();
  for (const [n, i] of labels) idToName.set(i, n);
  const staleSet = new Set<string>();
  for (const m of msgs) {
    for (const id of m.labelIds || []) {
      const name = idToName.get(id);
      if (name && name.startsWith('MrGru/') && name !== targetLabel) {
        staleSet.add(name);
      }
    }
  }
  const removed = Array.from(staleSet);
  if (removed.length > 0) await removeLabelsFromThread(threadId, removed);
  await addLabelsToThread(threadId, [targetLabel]);
  return { removed, applied: targetLabel };
}

export function getLabelCacheStats(): { size: number; lastReset: number } {
  return { size: cache.size, lastReset: cacheResetAt };
}

export function resetLabelCache(): void {
  cache = new Map();
  cacheResetAt = 0;
}
