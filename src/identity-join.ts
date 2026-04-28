/**
 * Phase 4 — identity-join helpers (Trafft ↔ Plutio via email).
 *
 * Plutio is the system of record for person identity. Email is the join key.
 * `business_v2.fn_create_party` is idempotent on email (advisory lock + best-
 * party-by-email lookup), and as of migration 95 it auto-enqueues
 * `plutio_outbox(sync, party)` on new-insert. The reaper resolves the Plutio
 * person and writes `plutio_refs` on its next cycle.
 *
 * These helpers wrap fn_create_party for the Trafft inlet path so the
 * sweeper (Phase 5) and any future webhook-side identity work can converge
 * on the same `party_id` regardless of which system saw the email first.
 *
 * No persistent (trafft_customer_id → party_id) cache is maintained — the
 * email is the durable join key, and Trafft customer IDs are preserved in
 * interaction metadata for forensics.
 */

import type { QueryResultRow } from 'pg';

import { query, withAgentContext } from './business-db.js';
import { logger } from './logger.js';

export interface TrafftCustomerLike {
  customerId?: string | number;
  customerEmail: string;
  customerFirstName?: string;
  customerLastName?: string;
  customerFullName?: string;
}

export interface ResolveOrCreatePartyInput {
  email: string;
  display_name: string;
  source_hint?: string;
  metadata?: Record<string, unknown>;
  /** If set, runs the call inside withAgentContext for audit attribution. */
  agent?: string;
}

function trim(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  return t.length > 0 ? t : null;
}

/**
 * Build a sensible display name from Trafft's customer fields. Prefers
 * "first last", falls back to fullName, then to email-as-name.
 */
export function buildDisplayName(c: TrafftCustomerLike): string {
  const first = trim(c.customerFirstName);
  const last = trim(c.customerLastName);
  if (first || last) return [first, last].filter(Boolean).join(' ');
  const full = trim(c.customerFullName);
  if (full) return full;
  return c.customerEmail;
}

async function callFn<R extends QueryResultRow>(
  sql: string,
  params: unknown[],
  agent: string | undefined,
): Promise<R[]> {
  if (agent) {
    return withAgentContext(agent, async (client) => {
      const r = await client.query<R>(sql, params);
      return r.rows;
    });
  }
  const r = await query<R>(sql, params);
  return r.rows;
}

/**
 * Idempotent party resolution. Returns the canonical party_id for the email,
 * creating a new party (with auto-enqueued Plutio sync) if none exists.
 */
export async function resolveOrCreateParty(
  opts: ResolveOrCreatePartyInput,
): Promise<number> {
  const email = trim(opts.email);
  const display_name = trim(opts.display_name);
  if (!email) throw new Error('resolveOrCreateParty: email required');
  if (!display_name)
    throw new Error('resolveOrCreateParty: display_name required');

  const rows = await callFn<{ id: string }>(
    `SELECT business_v2.fn_create_party($1, $2, $3::citext, $4, $5::jsonb)::text AS id`,
    [
      'person',
      display_name,
      email,
      opts.source_hint ?? 'manual',
      JSON.stringify(opts.metadata ?? {}),
    ],
    opts.agent,
  );
  const id = Number(rows[0].id);
  logger.debug(
    { email, source_hint: opts.source_hint, party_id: id },
    'identity-join: resolveOrCreateParty',
  );
  return id;
}

/**
 * Resolve a Trafft customer to a NC party_id. Email is the join key.
 *
 *   Flow A — Trafft-first contact (no NC party with this email):
 *     creates new party with source='trafft' + plutio_outbox enqueue.
 *
 *   Flow B — Plutio-first contact (party already exists by email):
 *     returns the existing party_id; no Plutio create needed.
 *
 * Trafft customer_id is logged into the metadata of the call but not
 * persisted to a join table — every Trafft event will resolve via email
 * again on each invocation.
 */
export async function resolveTrafftCustomer(
  c: TrafftCustomerLike,
  opts: { agent?: string } = {},
): Promise<number> {
  if (!c?.customerEmail) {
    throw new Error('resolveTrafftCustomer: customerEmail required');
  }
  return resolveOrCreateParty({
    email: c.customerEmail,
    display_name: buildDisplayName(c),
    source_hint: 'trafft',
    metadata: c.customerId ? { trafft_customer_id: String(c.customerId) } : {},
    agent: opts.agent,
  });
}
