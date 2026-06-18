/**
 * Pure transforms: raw source records -> IncidentSeed (self-healing Phase 0).
 *
 * Kept free of IO so the fingerprinting/classification logic is unit-testable
 * without touching files, SQLite, or Postgres.
 */

import { fingerprint, type IncidentSeed, type Severity } from './incident-store.js';

interface PinoLine {
  level?: number;
  msg?: string;
  group?: string;
  err?: { type?: string; message?: string };
  [k: string]: unknown;
}

export interface JobLogRow {
  job_name: string;
  status: string;
  exit_code: number | null;
  error: string | null;
  started_at: string;
}

export interface WatermarkRow {
  source: string;
  last_run_status: string;
  last_run_error: string | null;
}

function levelToSeverity(level: number): Severity {
  return level >= 60 ? 'critical' : 'error';
}

/** Parse a JSONL log buffer into seeds (pino level >= 50 only). */
export function parseJsonlErrors(buffer: string): IncidentSeed[] {
  const seeds: IncidentSeed[] = [];
  for (const line of buffer.split('\n')) {
    if (!line.trim()) continue;
    let rec: PinoLine;
    try {
      rec = JSON.parse(line);
    } catch {
      continue; // partial/garbled line — skip
    }
    if (typeof rec.level !== 'number' || rec.level < 50) continue;
    const source = rec.group ? `minion:${rec.group}` : 'daemon';
    const msg = rec.err?.message || rec.msg || 'unknown error';
    seeds.push({
      source,
      severity: levelToSeverity(rec.level),
      fingerprint: fingerprint(source, msg, rec.err?.type),
      raw_context: {
        msg: rec.msg,
        err_type: rec.err?.type,
        err_message: rec.err?.message,
        group: rec.group,
      },
    });
  }
  return seeds;
}

export function jobRowToSeed(row: JobLogRow): IncidentSeed {
  const source = `job:${row.job_name}`;
  const detail = row.error || `status=${row.status}`;
  return {
    source,
    severity: 'error',
    fingerprint: fingerprint(source, detail),
    raw_context: {
      status: row.status,
      exit_code: row.exit_code,
      error: row.error,
      started_at: row.started_at,
    },
  };
}

export function watermarkRowToSeed(row: WatermarkRow): IncidentSeed {
  const source = `sweeper:${row.source}`;
  const detail = row.last_run_error || `status=${row.last_run_status}`;
  return {
    source,
    severity: row.last_run_status === 'error' ? 'error' : 'warn',
    fingerprint: fingerprint(source, detail),
    raw_context: {
      last_run_status: row.last_run_status,
      last_run_error: row.last_run_error,
    },
  };
}

/** A heartbeat is stale if its last beat is older than the threshold (or absent). */
export function isStale(
  lastBeat: Date | null,
  now: number,
  thresholdMs: number,
): boolean {
  if (!lastBeat) return true;
  return now - lastBeat.getTime() > thresholdMs;
}
