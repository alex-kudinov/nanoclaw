/**
 * Phase 1 — webhook_inbox archive helpers.
 *
 * Receiver path: archiveWebhook → markDispatched → (Phase 3 reaper closes loop)
 *
 * Status state machine (target shape; Phase 1 only writes received + dispatched):
 *   received → dispatched → handled
 *                        → failed → dispatched (retry by reaper, Phase 3)
 *                                 → dead_lettered (after MAX_ATTEMPTS, Phase 3)
 *   received → duplicate (Phase 2: when (source, event_id) already exists)
 */

import { query } from './business-db.js';
import type { IncomingHttpHeaders } from 'http';

export interface ArchiveInput {
  source: string;
  event_id?: string | null;
  event_type?: string | null;
  delivery_path?: 'n8n' | 'direct' | 'sweep';
  raw_headers:
    | IncomingHttpHeaders
    | Record<string, string | string[] | undefined>;
  raw_body: unknown;
}

export interface ArchiveResult {
  id: number;
  isDuplicate: boolean;
}

const SECRET_HEADER_NAMES = new Set([
  'x-webhook-secret',
  'authorization',
  'cookie',
  'stripe-signature',
  'x-zm-signature',
]);

function sanitizeHeaders(
  headers: ArchiveInput['raw_headers'],
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(headers || {})) {
    const lower = k.toLowerCase();
    if (SECRET_HEADER_NAMES.has(lower)) continue;
    safe[lower] = v;
  }
  return safe;
}

/**
 * Insert a webhook envelope. If a non-null event_id is provided and a row
 * already exists for (source, event_id), returns the existing id with
 * isDuplicate=true and does NOT overwrite the original.
 *
 * Phase 1 callers do not yet provide event_id (extractors come in Phase 2),
 * so isDuplicate is always false in Phase 1.
 */
export async function archiveWebhook(
  input: ArchiveInput,
): Promise<ArchiveResult> {
  const safeHeaders = sanitizeHeaders(input.raw_headers);

  if (input.event_id) {
    const existing = await query<{ id: string }>(
      `SELECT id::text FROM business_v2.webhook_inbox
        WHERE source = $1 AND event_id = $2`,
      [input.source, input.event_id],
    );
    if (existing.rows.length > 0) {
      return { id: Number(existing.rows[0].id), isDuplicate: true };
    }
  }

  const r = await query<{ id: string }>(
    `INSERT INTO business_v2.webhook_inbox
       (source, event_id, event_type, delivery_path, raw_headers, raw_body)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
     RETURNING id::text`,
    [
      input.source,
      input.event_id || null,
      input.event_type || null,
      input.delivery_path || 'n8n',
      JSON.stringify(safeHeaders),
      JSON.stringify(input.raw_body),
    ],
  );
  return { id: Number(r.rows[0].id), isDuplicate: false };
}

/** Mark the row as dispatched after the agent has been spawned. */
export async function markDispatched(id: number): Promise<void> {
  await query(
    `UPDATE business_v2.webhook_inbox
        SET status = 'dispatched',
            attempts = attempts + 1,
            last_attempted_at = NOW()
      WHERE id = $1 AND status IN ('received', 'failed')`,
    [id],
  );
}

/** Mark the row as handled. Phase 3 reaper or agent ack will call this. */
export async function markHandled(
  id: number,
  opts: {
    handled_by: string;
    party_id?: number | null;
    related_entity?: unknown;
  },
): Promise<void> {
  await query(
    `UPDATE business_v2.webhook_inbox
        SET status = 'handled',
            handled_at = NOW(),
            handled_by = $2,
            party_id = $3,
            related_entity = $4::jsonb,
            last_error = NULL
      WHERE id = $1`,
    [
      id,
      opts.handled_by,
      opts.party_id ?? null,
      opts.related_entity ? JSON.stringify(opts.related_entity) : null,
    ],
  );
}

/** Mark the row as failed; reaper will retry up to MAX_ATTEMPTS. */
export async function markFailed(id: number, error: string): Promise<void> {
  await query(
    `UPDATE business_v2.webhook_inbox
        SET status = 'failed',
            last_error = $2,
            last_attempted_at = NOW()
      WHERE id = $1`,
    [id, error.slice(0, 4000)],
  );
}
