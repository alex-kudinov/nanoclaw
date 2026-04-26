/**
 * Email unsubscribe handler.
 * Called by webhook server when a lead clicks the unsubscribe link.
 * Looks up tracking token in SQLite, sets DND on the party in Postgres.
 */

import { getBusinessPool } from './business-db.js';
import { lookupTrackingToken } from './db.js';
import { logger } from './logger.js';

export async function handleUnsubscribe(
  token: string,
): Promise<{ ok: boolean; name?: string }> {
  // Step 1: look up tracking token → lead_id (party_id)
  const row = lookupTrackingToken(token);
  if (!row) {
    logger.info({ token }, 'Unsubscribe: unknown tracking token');
    return { ok: false };
  }

  const partyId = row.lead_id;

  // Step 2: set DND on party in Postgres
  const pool = getBusinessPool();
  const result = await pool.query(
    `UPDATE business_v2.parties
     SET dnd_at = now(), updated_at = now(), last_updated_by = 'unsubscribe-webhook'
     WHERE id = $1 AND dnd_at IS NULL
     RETURNING display_name`,
    [partyId],
  );

  if (result.rowCount === 0) {
    // Already DND or party not found — still return ok (idempotent)
    const existing = await pool.query(
      'SELECT display_name, dnd_at FROM business_v2.parties WHERE id = $1',
      [partyId],
    );
    if (existing.rows[0]?.dnd_at) {
      logger.info({ partyId }, 'Unsubscribe: party already DND');
      return { ok: true, name: existing.rows[0].display_name };
    }
    logger.warn({ partyId, token }, 'Unsubscribe: party not found');
    return { ok: false };
  }

  const name = result.rows[0].display_name;

  // Step 3: log interaction for audit trail
  try {
    await pool.query(
      `SELECT business_v2.fn_log_interaction($1, 'email', 'inbound', 'Unsubscribed via email link', now(), $2::jsonb)`,
      [
        partyId,
        JSON.stringify({ tracking_id: token, source: 'unsubscribe-link' }),
      ],
    );
  } catch (err) {
    // Non-fatal — DND is already set
    logger.warn({ err, partyId }, 'Unsubscribe: failed to log interaction');
  }

  logger.info({ partyId, name, token }, 'Unsubscribe: party marked DND');
  return { ok: true, name };
}
