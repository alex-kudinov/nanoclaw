/**
 * Daemon liveness beacon (self-healing Phase 0, docs/SELF-HEALING-DESIGN.md §4.2).
 *
 * The daemon upserts a single Postgres row every 30s. The healer — a separate
 * process — reads last_beat; a beat older than its stale threshold is how a
 * crashed daemon is detected and auto-recovered (a dead daemon can't push its
 * own death). Write failures are swallowed: a transient PG blip must never
 * crash the daemon over a diagnostic beacon.
 */

import fs from 'fs';
import path from 'path';

import { query } from './business-db.js';
import { logger } from './logger.js';

export const HEARTBEAT_NAME = 'nanoclaw';
export const HEARTBEAT_DB_INTERVAL_MS = 30_000;

let cachedVersion: string | null = null;

/** Best-effort daemon version from package.json (cached). */
export function getVersion(): string {
  if (cachedVersion !== null) return cachedVersion;
  let v = 'unknown';
  try {
    const pkg = path.join(process.cwd(), 'package.json');
    v = JSON.parse(fs.readFileSync(pkg, 'utf-8')).version || 'unknown';
  } catch {
    /* keep 'unknown' */
  }
  cachedVersion = v;
  return v;
}

/** Upsert the heartbeat row. Never throws. */
export async function writeHeartbeat(version = getVersion()): Promise<void> {
  try {
    await query(
      `INSERT INTO business_v2.daemon_heartbeat (name, last_beat, pid, version, updated_at)
       VALUES ($1, now(), $2, $3, now())
       ON CONFLICT (name) DO UPDATE SET
         last_beat = now(), pid = EXCLUDED.pid,
         version = EXCLUDED.version, updated_at = now()`,
      [HEARTBEAT_NAME, process.pid, version],
    );
  } catch (err) {
    logger.warn({ err }, 'heartbeat: write failed');
  }
}

/** Beat once immediately, then every 30s. Returns the interval handle. */
export function startHeartbeat(): NodeJS.Timeout {
  void writeHeartbeat();
  const handle = setInterval(
    () => void writeHeartbeat(),
    HEARTBEAT_DB_INTERVAL_MS,
  );
  handle.unref?.();
  logger.info({ interval_ms: HEARTBEAT_DB_INTERVAL_MS }, 'heartbeat: started');
  return handle;
}
