/**
 * Incident persistence + dedup (self-healing Phase 0).
 *
 * fingerprint() normalizes volatile bits (ids, timestamps, numbers) so the same
 * logical error always hashes identically; the incidents partial-unique index
 * then collapses repeats into one open row via upsertIncident(). redact() scrubs
 * secrets BEFORE anything is stored or later sent to Claude.
 */

import crypto from 'crypto';

import { query } from '../business-db.js';

export type Severity = 'info' | 'warn' | 'error' | 'critical';

export interface IncidentSeed {
  source: string; // minion:sales | sweeper:trafft | job:digest | daemon
  severity: Severity;
  fingerprint: string;
  raw_context: Record<string, unknown>;
}

/** Strip volatile tokens so repeats of one logical error fingerprint the same. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g,
      '<uuid>',
    )
    .replace(/\d{4}-\d{2}-\d{2}t[\d:.]+z?/g, '<ts>')
    .replace(/\b[0-9a-f]{12,}\b/g, '<hex>')
    .replace(/\d+/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function fingerprint(source: string, msg: string, errType = ''): string {
  return crypto
    .createHash('sha1')
    .update(`${source}|${errType}|${normalize(msg)}`)
    .digest('hex')
    .slice(0, 16);
}

/** Redact secrets from free text. */
export function redact(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '<redacted>')
    .replace(/xox[baprs]-[A-Za-z0-9-]{8,}/g, '<redacted>')
    .replace(
      /eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g,
      '<jwt>',
    )
    .replace(/(bearer\s+)[A-Za-z0-9._-]{8,}/gi, '$1<redacted>')
    .replace(
      /((?:password|passwd|secret|token|api[_-]?key)["']?\s*[=:]\s*["']?)[^\s"',}]+/gi,
      '$1<redacted>',
    );
}

export function redactContext(
  ctx: Record<string, unknown>,
): Record<string, unknown> {
  return JSON.parse(redact(JSON.stringify(ctx)));
}

/**
 * Upsert by fingerprint: bump occurrences on the open row, else insert a new
 * one. Uses the (xmax = 0) idiom to report whether the row was freshly inserted.
 */
export async function upsertIncident(
  seed: IncidentSeed,
): Promise<'inserted' | 'updated'> {
  const r = await query<{ inserted: boolean }>(
    `INSERT INTO business_v2.incidents (source, fingerprint, severity, raw_context)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (fingerprint) WHERE status NOT IN ('resolved', 'wont_fix')
     DO UPDATE SET occurrences = business_v2.incidents.occurrences + 1,
                   last_seen = now(),
                   raw_context = EXCLUDED.raw_context,
                   updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [
      seed.source,
      seed.fingerprint,
      seed.severity,
      JSON.stringify(redactContext(seed.raw_context)),
    ],
  );
  return r.rows[0]?.inserted ? 'inserted' : 'updated';
}

/** Read a JSON value from collector_state, or a default if absent. */
export async function getState<T>(key: string, dflt: T): Promise<T> {
  const r = await query<{ value: T }>(
    `SELECT value FROM business_v2.collector_state WHERE key = $1`,
    [key],
  );
  return r.rows.length ? r.rows[0].value : dflt;
}

export async function setState(key: string, value: unknown): Promise<void> {
  await query(
    `INSERT INTO business_v2.collector_state (key, value, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}
