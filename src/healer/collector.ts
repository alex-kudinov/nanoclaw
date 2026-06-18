/**
 * Pull collector + daemon recovery (self-healing Phase 0, design §3.2).
 *
 * Pull-first by necessity: a crashed daemon can't push its own death, so the
 * healer reads four surfaces — the daemon's JSON log, job_run_logs, frozen
 * sweeper watermarks, and the heartbeat — and funnels them into deduped
 * incidents. A stale heartbeat triggers a capped launchctl restart.
 *
 * Loop-prevention: the collector reads the DAEMON's jsonl (HEALER_DAEMON_JSONL);
 * the healer's own logger writes elsewhere (NANOCLAW_JSONL_PATH set by launchd)
 * so the healer never ingests its own log lines.
 */

import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';

import Database from 'better-sqlite3';

import { STORE_DIR } from '../config.js';
import { query } from '../business-db.js';
import { logger } from '../logger.js';
import { alert, type AlertLevel } from './alert.js';
import {
  fingerprint,
  getState,
  setState,
  upsertIncident,
  type IncidentSeed,
} from './incident-store.js';
import { postIncidents } from './slack.js';
import { formatIncidentLine, type DigestRow } from './digest.js';
import {
  isStale,
  jobRowToSeed,
  parseJsonlErrors,
  watermarkRowToSeed,
  type JobLogRow,
  type WatermarkRow,
} from './sources.js';

const HEARTBEAT_STALE_MS = 120_000; // 4 missed 30s beats
const MAX_RESTARTS = 2;
const FAST_REPORT_MAX_LINES = 12;

function daemonJsonlPath(): string {
  return (
    process.env.HEALER_DAEMON_JSONL ||
    path.join(process.cwd(), 'logs', 'nanoclaw.jsonl')
  );
}

async function upsertAll(seeds: IncidentSeed[]): Promise<number> {
  for (const seed of seeds) await upsertIncident(seed);
  return seeds.length;
}

/** Source 1: scrape the daemon's JSON log from the stored byte offset. */
export async function collectJsonl(): Promise<number> {
  const jsonlPath = daemonJsonlPath();
  let size = 0;
  try {
    size = fs.statSync(jsonlPath).size;
  } catch {
    return 0; // no log yet
  }
  let offset = await getState<number>('jsonl_offset', 0);
  if (size < offset) offset = 0; // file was truncated/rotated
  if (size === offset) return 0;
  const fd = fs.openSync(jsonlPath, 'r');
  try {
    const buf = Buffer.alloc(size - offset);
    fs.readSync(fd, buf, 0, buf.length, offset);
    const count = await upsertAll(parseJsonlErrors(buf.toString('utf-8')));
    await setState('jsonl_offset', size);
    return count;
  } finally {
    fs.closeSync(fd);
  }
}

/** Source 2: failed rows in SQLite job_run_logs (read-only) since watermark. */
export async function collectJobLogs(): Promise<number> {
  const dbPath = path.join(STORE_DIR, 'messages.db');
  const watermark = await getState<string>('job_logs_watermark', '');
  let rows: JobLogRow[] = [];
  try {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    db.pragma('busy_timeout = 3000');
    rows = db
      .prepare(
        `SELECT job_name, status, exit_code, error, started_at
           FROM job_run_logs
          WHERE status NOT IN ('ok', 'running', 'already_running')
            AND started_at > ?
          ORDER BY started_at`,
      )
      .all(watermark) as JobLogRow[];
    db.close();
  } catch (err) {
    logger.warn({ err }, 'healer: job_run_logs read failed');
    return 0;
  }
  for (const row of rows) await upsertIncident(jobRowToSeed(row));
  if (rows.length) await setState('job_logs_watermark', rows[rows.length - 1].started_at);
  return rows.length;
}

/** Source 3: frozen/errored sweeper watermarks. */
export async function collectWatermarks(): Promise<number> {
  const r = await query<WatermarkRow>(
    `SELECT source, last_run_status, last_run_error
       FROM business_v2.sweeper_watermarks
      WHERE last_run_status IN ('frozen', 'error')`,
  );
  for (const row of r.rows) await upsertIncident(watermarkRowToSeed(row));
  return r.rows.length;
}

async function notify(
  level: AlertLevel,
  subject: string,
  message: string,
): Promise<void> {
  const ok = await postIncidents(
    `*[${level.toUpperCase()}]* ${subject}\n${message}`,
  );
  if (!ok) await alert(level, subject, message);
}

function restartDaemon(): Promise<void> {
  return new Promise((resolve) => {
    const uid = process.getuid?.() ?? 0;
    execFile(
      'launchctl',
      ['kickstart', '-k', `gui/${uid}/com.nanoclaw`],
      { timeout: 30_000 },
      (err) => {
        if (err) logger.warn({ err }, 'healer: daemon restart failed');
        resolve();
      },
    );
  });
}

async function daemonRestartAttempts(): Promise<number> {
  const r = await query<{ restart_attempts: number }>(
    `SELECT restart_attempts FROM business_v2.incidents
      WHERE source = 'daemon' AND status NOT IN ('resolved', 'wont_fix')
      ORDER BY last_seen DESC LIMIT 1`,
  );
  return r.rows[0]?.restart_attempts ?? 0;
}

async function resolveDaemonIncident(): Promise<void> {
  await query(
    `UPDATE business_v2.incidents
        SET status = 'resolved', outcome = 'verified_fixed', updated_at = now()
      WHERE source = 'daemon' AND status NOT IN ('resolved', 'wont_fix')`,
  );
}

/** Source 4: heartbeat staleness -> critical incident + capped restart. */
export async function checkDaemon(): Promise<boolean> {
  const r = await query<{ last_beat: string | null }>(
    `SELECT last_beat::text FROM business_v2.daemon_heartbeat WHERE name = 'nanoclaw'`,
  );
  const lastBeat = r.rows[0]?.last_beat ? new Date(r.rows[0].last_beat) : null;
  if (!isStale(lastBeat, Date.now(), HEARTBEAT_STALE_MS)) {
    await resolveDaemonIncident(); // heartbeat fresh => recovery confirmed
    return false;
  }

  const last = lastBeat?.toISOString() ?? 'never';
  await upsertIncident({
    source: 'daemon',
    severity: 'critical',
    fingerprint: fingerprint('daemon', 'heartbeat stale'),
    raw_context: { last_beat: last, stale_threshold_ms: HEARTBEAT_STALE_MS },
  });
  const attempts = await daemonRestartAttempts();
  if (attempts < MAX_RESTARTS) {
    await restartDaemon();
    await query(
      `UPDATE business_v2.incidents SET restart_attempts = restart_attempts + 1, updated_at = now()
        WHERE source = 'daemon' AND status NOT IN ('resolved', 'wont_fix')`,
    );
    await notify(
      'critical',
      'NanoClaw daemon down',
      `Heartbeat stale (last: ${last}). Auto-restart ${attempts + 1}/${MAX_RESTARTS} issued.`,
    );
  } else {
    await notify(
      'critical',
      'NanoClaw daemon DOWN — restart cap hit',
      `Heartbeat still stale after ${MAX_RESTARTS} auto-restarts. Manual intervention needed.`,
    );
  }
  return true;
}

function formatFresh(rows: DigestRow[]): string {
  const head = `:rotating_light: *${rows.length} new incident${rows.length > 1 ? 's' : ''}*`;
  const lines = rows.slice(0, FAST_REPORT_MAX_LINES).map(formatIncidentLine);
  const more =
    rows.length > FAST_REPORT_MAX_LINES
      ? `\n…and ${rows.length - FAST_REPORT_MAX_LINES} more (full list in the 18:00 digest)`
      : '';
  return `${head}\n${lines.join('\n')}${more}`;
}

/**
 * Near-real-time reporting: post incidents created since the last fast report
 * to #gru-incidents so errors surface within ~5 min, not only at the 18:00
 * digest. Watermarked by incident id (monotonic) — each distinct incident posts
 * exactly once on first occurrence; flapping repeats bump last_seen, not id, so
 * they never re-alert. error/critical only; warn/info wait for the digest. On a
 * post failure the watermark is left so the next run retries (at-least-once).
 */
export async function reportFreshIncidents(): Promise<number> {
  const sinceId = await getState<number>('last_fast_report_id', 0);
  const r = await query<DigestRow & { id: number }>(
    `SELECT id, source, severity, occurrences, last_seen::text, raw_context
       FROM business_v2.incidents
      WHERE id > $1 AND status NOT IN ('resolved', 'wont_fix')
      ORDER BY id`,
    [sinceId],
  );
  if (r.rows.length === 0) return 0;
  const maxId = r.rows[r.rows.length - 1].id;
  const toPost = r.rows.filter(
    (x) => x.severity === 'error' || x.severity === 'critical',
  );
  if (toPost.length && !(await postIncidents(formatFresh(toPost)))) {
    return 0; // post failed — leave the watermark so the next run retries
  }
  await setState('last_fast_report_id', maxId);
  return toPost.length;
}

/** Fast-loop entrypoint: collect every source, report new, check liveness. */
export async function runFast(): Promise<void> {
  const jsonl = await collectJsonl();
  const jobs = await collectJobLogs();
  const sweepers = await collectWatermarks();
  const reported = await reportFreshIncidents();
  const daemonDown = await checkDaemon();
  logger.info(
    { jsonl, jobs, sweepers, reported, daemonDown },
    'healer: fast run complete',
  );
}
