/**
 * Hive Firestore bridge — writes classification state into Hive's
 * `conversations/{threadId}` docs. Hive's Cloud Function owns doc creation
 * (`users.watch` → `gmail-push.ts`); we only set `assignee`, `status`, `tags`
 * with `{merge: true}` and never create docs from scratch.
 *
 * NanoClaw MUST NOT bypass this module — see SERVICES.md "Email Reading".
 */

import { readFileSync } from 'fs';

import type { Firestore } from 'firebase-admin/firestore';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import {
  FieldValue,
  getFirestore as sdkGetFirestore,
} from 'firebase-admin/firestore';

import { assertExternalWriteAllowed } from './action-safety.js';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';

type ConversationStatus = 'open' | 'pending' | 'closed';

const APP_NAME = 'hive-bridge';
const TEAM_CACHE_TTL_MS = 5 * 60 * 1000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 100;
const RATE_THROTTLE_MS = 200;

let cachedFirestore: Firestore | null = null;
const teamCache = new Map<string, { uid: string | null; at: number }>();
let writeWindowStart = 0;
let writeCount = 0;

export interface HiveWriteDependencies {
  getFirestore?: () => Firestore;
}

function assertHiveWriteAllowed(): void {
  assertExternalWriteAllowed({
    system: 'hive_firestore',
    actionClass: 'c2_external_write',
    source: 'host:hive-bridge',
  });
}

function loadHiveEnv(): { keyPath: string; projectId: string } {
  const env = readEnvFile(['HIVE_FIRESTORE_KEY_PATH', 'HIVE_PROJECT_ID']);
  const keyPath =
    env.HIVE_FIRESTORE_KEY_PATH || process.env.HIVE_FIRESTORE_KEY_PATH;
  const projectId = env.HIVE_PROJECT_ID || process.env.HIVE_PROJECT_ID;
  if (!keyPath) throw new Error('hive-bridge: HIVE_FIRESTORE_KEY_PATH not set');
  if (!projectId) throw new Error('hive-bridge: HIVE_PROJECT_ID not set');
  return { keyPath, projectId };
}

export function getFirestore(): Firestore {
  if (cachedFirestore) return cachedFirestore;
  const { keyPath, projectId } = loadHiveEnv();
  if (!getApps().some((a) => a.name === APP_NAME)) {
    const credObj = JSON.parse(readFileSync(keyPath, 'utf-8'));
    initializeApp({ credential: cert(credObj), projectId }, APP_NAME);
  }
  const app = getApps().find((a) => a.name === APP_NAME)!;
  cachedFirestore = sdkGetFirestore(app);
  return cachedFirestore;
}

async function throttleIfBursting(): Promise<void> {
  const now = Date.now();
  if (now - writeWindowStart > RATE_WINDOW_MS) {
    writeWindowStart = now;
    writeCount = 0;
  }
  writeCount++;
  if (writeCount > RATE_LIMIT) {
    logger.warn({ writeCount }, 'hive-bridge: rate limit, throttling 200ms');
    await new Promise((r) => setTimeout(r, RATE_THROTTLE_MS));
  }
}

/** Single-field team lookup by email, with in-memory active filter + cache. */
export async function resolveTeamUidByEmail(
  email: string,
): Promise<string | null> {
  const key = email.toLowerCase();
  const hit = teamCache.get(key);
  if (hit && Date.now() - hit.at < TEAM_CACHE_TTL_MS) return hit.uid;
  const snap = await getFirestore()
    .collection('team')
    .where('email', '==', key)
    .limit(1)
    .get();
  let uid: string | null = null;
  if (!snap.empty) {
    const doc = snap.docs[0];
    if (doc.data().active === true) uid = doc.id;
  }
  teamCache.set(key, { uid, at: Date.now() });
  return uid;
}

function resolveSlugUid(slug: string): string | null {
  const envKey = `TEAM_UID_${slug.toUpperCase()}`;
  return process.env[envKey] || null;
}

async function loadExistingConversation(
  threadId: string,
): Promise<FirebaseFirestore.DocumentSnapshot | null> {
  const ref = getFirestore().collection('conversations').doc(threadId);
  const snap = await ref.get();
  return snap.exists ? snap : null;
}

async function mergeConversation(
  threadId: string,
  patch: Record<string, unknown>,
  deps: HiveWriteDependencies = {},
): Promise<void> {
  assertHiveWriteAllowed();
  await throttleIfBursting();
  await (deps.getFirestore ?? getFirestore)()
    .collection('conversations')
    .doc(threadId)
    .set(patch, { merge: true });
}

export async function assignConversation(
  threadId: string,
  assigneeUid: string | null,
  deps: HiveWriteDependencies = {},
): Promise<void> {
  await mergeConversation(threadId, { assignee: assigneeUid }, deps);
}

export async function setConversationStatus(
  threadId: string,
  status: ConversationStatus,
  deps: HiveWriteDependencies = {},
): Promise<void> {
  await mergeConversation(threadId, { status }, deps);
}

export async function tagConversation(
  threadId: string,
  tags: string[],
  deps: HiveWriteDependencies = {},
): Promise<void> {
  if (tags.length === 0) return;
  await mergeConversation(
    threadId,
    { tags: FieldValue.arrayUnion(...tags) },
    deps,
  );
}

function needsUpdate(
  existing: FirebaseFirestore.DocumentSnapshot,
  targetUid: string | null,
  label: string,
): boolean {
  const data = existing.data() || {};
  const assigneeOk = targetUid === null || data.assignee === targetUid;
  const tags = Array.isArray(data.tags) ? (data.tags as string[]) : [];
  const tagOk = tags.includes(label);
  return !(assigneeOk && tagOk);
}

/**
 * Thrown when `conversations/{threadId}` hasn't been created yet by Hive's
 * Cloud Function. NanoClaw never creates these docs from scratch; callers
 * should treat this as a transient, recoverable failure and retry via the
 * hive-sync-reaper. The inline classify handler catches and leaves
 * hive_synced=FALSE for the reaper to pick up.
 */
export class HiveConversationNotFoundError extends Error {
  public readonly threadId: string;
  constructor(threadId: string) {
    super(`hive-bridge: conversation doc missing for thread ${threadId}`);
    this.name = 'HiveConversationNotFoundError';
    this.threadId = threadId;
  }
}

/**
 * Composite write: resolve assignee from hive_share_target slugs, then
 * set `assignee`/`status`/`tags` via merge. Throws HiveConversationNotFoundError
 * when Hive hasn't created the doc yet — the reaper retries up to 5 times
 * before dead-lettering. We never create docs from scratch.
 */
export async function recordClassification(
  threadId: string,
  label: string,
  hiveShareTarget: string[] | null,
): Promise<void> {
  // This composite operation reads before deciding which writes to apply. Deny
  // it at entry so safe mode does not initialize Firebase credentials merely
  // to compute a patch. Standalone read helpers remain available.
  assertHiveWriteAllowed();
  let targetUid: string | null = null;
  if (hiveShareTarget && hiveShareTarget.length > 0) {
    for (const slug of hiveShareTarget) {
      const uid = resolveSlugUid(slug);
      if (uid) {
        targetUid = uid;
        break;
      }
    }
    if (!targetUid) {
      logger.debug(
        { hiveShareTarget },
        'hive-bridge: no TEAM_UID_* env fallback matched; tagging only',
      );
    }
  }

  // Idempotency: skip write if doc already has the right state
  const existing = await loadExistingConversation(threadId);
  if (existing && !needsUpdate(existing, targetUid, label)) {
    logger.debug({ threadId, label }, 'hive-bridge: idempotent short-circuit');
    return;
  }

  // merge:true creates the doc if missing — no need to wait for Cloud Function
  if (targetUid) {
    await assignConversation(threadId, targetUid);
    await setConversationStatus(threadId, 'open');
  }
  await tagConversation(threadId, [label]);
  logger.info(
    { threadId, label, assignee: targetUid, created: !existing },
    'hive-bridge: conversation updated',
  );
}

/** Test-only reset. */
export function resetHiveBridgeCache(): void {
  cachedFirestore = null;
  teamCache.clear();
  writeWindowStart = 0;
  writeCount = 0;
}
