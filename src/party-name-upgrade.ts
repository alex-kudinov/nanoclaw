/**
 * NC-20260929-001 — improve a person's one-word display_name when a later
 * source knows the full name ("steve" -> "Steve Rivera").
 *
 * The rule itself lives in PostgreSQL (migration 173,
 * `business_v2.fn_display_name_upgrade_verdict`); this module only routes a
 * source's name to it. Call it only with a name that belongs to the party:
 * the person's own first and last name next to their own email, never a
 * payer's name for a learner or the reverse. Nothing here creates a party,
 * and an email held by more than one party upgrades nobody.
 *
 * A Chaos visitor's stored display_name is never offered: Chaos keeps the
 * first name it captured for a visitor, field by field and possibly from a
 * checkout, independently of the form that later classified the visitor.
 * Only a verified form submission's own name fields count.
 *
 * Every helper is best-effort: a failed upgrade is logged (party id and
 * source only, never a name) and never fails the intake that called it.
 */

import { withAgentContext } from './business-db.js';
import { logger } from './logger.js';

const MAX_NAME_PART = 100;

/** Upgrade the one canonical party holding this email; nobody when several do. */
export const UPGRADE_NAME_BY_EMAIL_SQL = `WITH m AS (
   SELECT array_agg(r.id ORDER BY r.id) AS ids
     FROM business_v2.resolve_parties_by_email($1::citext) AS r(id)
 )
 SELECT coalesce(cardinality(m.ids), 0)::int AS matches,
        CASE WHEN cardinality(m.ids) = 1 THEN m.ids[1]::text END AS party_id,
        CASE WHEN cardinality(m.ids) = 1
             THEN business_v2.fn_upgrade_party_display_name(m.ids[1], $2, $3)
             ELSE false END AS upgraded
   FROM m`;

function part(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 && t.length <= MAX_NAME_PART ? t : null;
}

/** "First Last" only when both parts are present; otherwise null. */
export function fullName(first: unknown, last: unknown): string | null {
  const f = part(first);
  const l = part(last);
  return f && l ? `${f} ${l}` : null;
}

function errorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    return String((err as { code: unknown }).code);
  }
  return err instanceof Error ? err.name : 'unknown';
}

export interface EmailNameUpgrade {
  email: string;
  candidate: string;
  source: string;
  agent: string;
}

/**
 * Upgrade the existing party that alone holds this email. Never creates a
 * party and never throws.
 */
export async function upgradePartyNameByEmail(
  input: EmailNameUpgrade,
): Promise<boolean> {
  try {
    const row = await withAgentContext(input.agent, async (client) => {
      const r = await client.query<{
        matches: number;
        party_id: string | null;
        upgraded: boolean;
      }>(UPGRADE_NAME_BY_EMAIL_SQL, [
        input.email,
        input.candidate,
        input.source,
      ]);
      return r.rows[0];
    });
    if (row?.upgraded === true) {
      logger.info(
        { partyId: Number(row.party_id), source: input.source },
        'party-name-upgrade: upgraded',
      );
      return true;
    }
    return false;
  } catch (err) {
    logger.warn(
      { source: input.source, code: errorCode(err) },
      'party-name-upgrade: skipped after error',
    );
    return false;
  }
}

interface CommercePerson {
  firstName: string;
  lastName: string;
  email: string;
}

/**
 * Commerce knows both the payer and the learner, each with their own email.
 * Each name goes only to the party holding that person's email; one email
 * carrying two different names upgrades nobody.
 */
export async function upgradeCommerceOrderNames(order: {
  payer: CommercePerson;
  learner: CommercePerson;
}): Promise<number> {
  const byEmail = new Map<string, string | null>();
  for (const person of [order.payer, order.learner]) {
    const email = person.email.trim().toLowerCase();
    const name = fullName(person.firstName, person.lastName);
    if (!email || !name) continue;
    const seen = byEmail.get(email);
    if (seen === undefined) byEmail.set(email, name);
    else if (seen !== null && seen.toLowerCase() !== name.toLowerCase())
      byEmail.set(email, null);
  }
  let upgraded = 0;
  for (const [email, candidate] of byEmail) {
    if (candidate === null) continue;
    if (
      await upgradePartyNameByEmail({
        email,
        candidate,
        source: 'commerce',
        agent: 'commerce-bookkeeper',
      })
    )
      upgraded += 1;
  }
  return upgraded;
}

/**
 * A verified Chaos form submission names the person who typed the verified
 * email into that same form. Only the form's own primary fields count
 * (`email` with `first_name`/`last_name` or `firstName`/`lastName`); a
 * checkout's participant fields are never read.
 */
export function chaosFormNameCandidate(payload: {
  identityStatus: string;
  email: string | null;
  fields: Record<string, unknown>;
}): { email: string; candidate: string } | null {
  if (payload.identityStatus !== 'verified' || !payload.email) return null;
  const formEmail =
    typeof payload.fields.email === 'string'
      ? payload.fields.email.trim().toLowerCase()
      : '';
  const verifiedEmail = payload.email.trim().toLowerCase();
  if (!formEmail || formEmail !== verifiedEmail) return null;
  const candidate =
    fullName(payload.fields.first_name, payload.fields.last_name) ??
    fullName(payload.fields.firstName, payload.fields.lastName);
  return candidate ? { email: verifiedEmail, candidate } : null;
}
