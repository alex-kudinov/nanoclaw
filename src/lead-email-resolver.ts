/**
 * Pipeline entry id → lead email, for threading per-lead status lines.
 *
 * A status line names its lead by id and carries no address ("Lead #611 …",
 * "[NO ACTION] Entry #85 …"), so `deriveLeadThreadKey` cannot anchor it and the
 * post lands at the channel root while the card and the send sit in a thread.
 * `deriveLeadEntryRef` extracts the id; this turns it into the same
 * `lead:{email}` key the rest of the lead's traffic already uses.
 *
 * The lookup is host-side on purpose. The agent already supplies the id in text
 * it wrote; asking it for the address too would just add another thing to retype
 * wrong (the Entry #871 thread_ts of 2026-07-31 is the cautionary tale). The
 * host owns the mapping, so the host resolves it.
 */

import { withAgentContext } from './business-db.js';
import { logger } from './logger.js';

const AGENT = 'lead-thread-anchor';

/** Entry ids resolve once per process; the mapping does not move. */
const MAX_CACHE_ENTRIES = 500;

export interface LeadEmailResolver {
  (entryId: number): Promise<string | undefined>;
}

/**
 * SQL is split out so the cache wrapper below stays readable and so tests can
 * drive the cache without a database.
 */
async function queryLeadEmail(entryId: number): Promise<string | undefined> {
  return withAgentContext(AGENT, async (client) => {
    const r = await client.query(
      `SELECT COALESCE(p.primary_email, pe_mail.email::text) AS email
         FROM business_v2.pipeline_entries pe
         JOIN business_v2.parties p ON p.id = pe.party_id
         LEFT JOIN LATERAL (
           SELECT email
             FROM business_v2.party_emails
            WHERE party_id = p.id
            ORDER BY is_primary DESC, verified_at NULLS LAST
            LIMIT 1
         ) pe_mail ON TRUE
        WHERE pe.id = $1`,
      [entryId],
    );
    if (r.rowCount === 0) return undefined;
    const email = r.rows[0].email;
    return email == null ? undefined : String(email).toLowerCase();
  });
}

/**
 * The reverse direction: newest pipeline entry for a recipient address.
 *
 * Used by the send-watchdog rescue to re-drive an approved send that mailman
 * refused for a missing Entry ID. Deliberately NOT cached — the whole point is
 * to observe a party/entry that did not exist when the send was first blocked
 * (Gaye Montgomery, 2026-07-31: refused at 22:41:39Z, onboarded 22:42:15Z).
 */
export async function resolveEntryIdByEmail(
  email: string,
): Promise<number | undefined> {
  return withAgentContext(AGENT, async (client) => {
    const r = await client.query(
      `SELECT pe.id
         FROM business_v2.pipeline_entries pe
         JOIN business_v2.parties p ON p.id = pe.party_id
        WHERE p.merged_into IS NULL
          AND (lower(p.primary_email::text) = lower($1)
               OR EXISTS (SELECT 1 FROM business_v2.party_emails em
                           WHERE em.party_id = p.id
                             AND lower(em.email::text) = lower($1)))
        ORDER BY pe.created_at DESC
        LIMIT 1`,
      [email],
    );
    return r.rowCount === 0 ? undefined : Number(r.rows[0].id);
  });
}

/**
 * Wrap a lookup in a bounded cache that also remembers misses, so a status line
 * for an entry that no longer exists cannot re-query on every repeat post.
 * A lookup failure resolves to undefined rather than throwing: threading is a
 * presentation concern and must never block delivery of the message itself.
 */
export function makeLeadEmailResolver(
  lookup: (entryId: number) => Promise<string | undefined> = queryLeadEmail,
): LeadEmailResolver {
  const cache = new Map<number, string | undefined>();

  return async (entryId: number) => {
    if (cache.has(entryId)) return cache.get(entryId);

    let email: string | undefined;
    try {
      email = await lookup(entryId);
    } catch (err) {
      logger.warn(
        { err, entryId },
        'lead-thread-anchor: entry lookup failed, posting unanchored',
      );
      return undefined; // not cached — a transient DB error should be retried
    }

    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
    cache.set(entryId, email);
    return email;
  };
}
