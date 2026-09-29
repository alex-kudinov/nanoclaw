/**
 * Phase 4 — identity-join helpers (Trafft ↔ Plutio via email).
 *
 * Exact scoped provider references are the first identity authority. The
 * legacy email path remains only for customers that do not yet have one.
 * `business_v2.fn_create_party` is idempotent on email (advisory lock + best-
 * party-by-email lookup), and as of migration 95 it auto-enqueues
 * `plutio_outbox(sync, party)` on new-insert. The reaper resolves the Plutio
 * person and writes `plutio_refs` on its next cycle.
 *
 * These helpers wrap fn_create_party for the Trafft inlet path so the
 * sweeper (Phase 5) and any future webhook-side identity work can converge
 * on the same `party_id` regardless of which system saw the email first.
 *
 * Relationship Context persists exact Trafft customer references. Once one is
 * present, a changed/shared email cannot redirect future appointments.
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
  /**
   * Opt in only when display_name is this person's own name typed next to
   * this email: offers it to the migration-173 upgrade rule ("steve" ->
   * "Steve Rivera") when the email belongs to exactly one party.
   */
  upgradeName?: boolean;
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

const CREATE_PARTY_SQL = `SELECT business_v2.fn_create_party($1, $2, $3::citext, $4, $5::jsonb)::text AS id`;

/**
 * The migration-173 name upgrade for the party fn_create_party returned. It
 * runs only when the email belongs to exactly one party; a new party already
 * carries display_name, so the rule leaves it alone. The audit source is the
 * source hint.
 */
const UPGRADE_RESOLVED_NAME_SQL = `SELECT CASE
   WHEN (SELECT count(*) FROM business_v2.resolve_parties_by_email($2::citext)) = 1
   THEN business_v2.fn_upgrade_party_display_name($1::bigint, $3, $4)
   ELSE false END AS upgraded`;

/** Best-effort: a failed upgrade never fails the intake that resolved the party. */
async function upgradeResolvedName(
  partyId: number,
  email: string,
  displayName: string,
  source: string,
  agent: string | undefined,
): Promise<boolean> {
  try {
    const rows = await callFn<{ upgraded: boolean }>(
      UPGRADE_RESOLVED_NAME_SQL,
      [partyId, email, displayName, source],
      agent,
    );
    return rows[0]?.upgraded === true;
  } catch (err) {
    logger.warn(
      {
        party_id: partyId,
        source,
        err: err instanceof Error ? err.name : 'unknown',
      },
      'identity-join: name upgrade skipped after error',
    );
    return false;
  }
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

  const source = opts.source_hint ?? 'manual';
  const rows = await callFn<{ id: string }>(
    CREATE_PARTY_SQL,
    [
      'person',
      display_name,
      email,
      source,
      JSON.stringify(opts.metadata ?? {}),
    ],
    opts.agent,
  );
  const id = Number(rows[0].id);
  const nameUpgraded =
    opts.upgradeName === true &&
    (await upgradeResolvedName(id, email, display_name, source, opts.agent));
  logger.debug(
    {
      source_hint: opts.source_hint,
      party_id: id,
      name_upgraded: nameUpgraded,
    },
    'identity-join: resolveOrCreateParty',
  );
  return id;
}

/**
 * The customer's own name, offered to the migration-173 rule for the party
 * an exact Trafft customer ref points at. Best-effort: never fails a booking.
 */
async function upgradeExactTrafftName(
  partyId: number,
  c: TrafftCustomerLike,
  agent: string | undefined,
): Promise<boolean> {
  try {
    const rows = await callFn<{ upgraded: boolean }>(
      `SELECT business_v2.fn_upgrade_party_display_name($1::bigint, $2, 'trafft') AS upgraded`,
      [partyId, buildDisplayName(c)],
      agent,
    );
    return rows[0]?.upgraded === true;
  } catch (err) {
    logger.warn(
      { party_id: partyId, err: err instanceof Error ? err.name : 'unknown' },
      'identity-join: Trafft name upgrade skipped after error',
    );
    return false;
  }
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
  if (c.customerId != null) {
    const exact = await callFn<{ id: string }>(
      `SELECT business_v2.canonical_party_id(party_id)::text AS id
         FROM business_v2.party_external_refs
        WHERE provider='trafft' AND source_scope='primary'
          AND entity_type='customer' AND external_id=$1 AND status='active'`,
      [String(c.customerId)],
      opts.agent,
    );
    if (exact.length === 1) {
      const id = Number(exact[0].id);
      logger.debug(
        {
          source_hint: 'trafft',
          party_id: id,
          identity: 'exact_customer_ref',
          name_upgraded: await upgradeExactTrafftName(id, c, opts.agent),
        },
        'identity-join: resolveTrafftCustomer',
      );
      return id;
    }
    if (exact.length > 1) {
      throw new Error('resolveTrafftCustomer: exact customer ref ambiguous');
    }
  }
  return resolveOrCreateParty({
    email: c.customerEmail,
    display_name: buildDisplayName(c),
    source_hint: 'trafft',
    metadata: c.customerId ? { trafft_customer_id: String(c.customerId) } : {},
    agent: opts.agent,
    upgradeName: true,
  });
}
