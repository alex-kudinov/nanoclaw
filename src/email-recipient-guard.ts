/**
 * Recipient validation for outbound email — the last line before Gmail sends.
 *
 * Agents compose the To: for contact-form replies (there is no email thread to
 * reply into), so a hallucinated or placeholder address can reach the send
 * boundary. The tina@example.com incident (2026-06-29): the sales agent invented
 * `{firstname}@example.com` despite being handed the real address, and the host
 * trusted the agent's To:. These guards make a fabricated recipient unsendable.
 *
 * Pure + DB-free so the rules are fully unit-testable; the party-record check
 * lives in the caller, which already has DB access.
 */

// RFC 2606 / RFC 6761 reserved second-level domains. Mail to these is never
// deliverable, so a recipient here is always a bug — never a real customer.
const RESERVED_DOMAINS = new Set([
  'example.com',
  'example.net',
  'example.org',
  'localhost',
]);

// RFC 2606 / 6761 reserved TLDs: any domain ending in one is non-deliverable.
const RESERVED_TLDS = ['.example', '.test', '.invalid', '.localhost'];

/** Strip a display name and normalize to a bare lowercase address. */
export function normalizeRecipient(to: string): string {
  const angle = to.match(/<([^>]+)>/);
  return (angle ? angle[1] : to).trim().toLowerCase();
}

/**
 * True when the recipient's domain can never receive mail (placeholder/test).
 * Precise by design — only RFC-reserved names — so it has zero false positives
 * against real domains.
 */
export function isReservedRecipientDomain(to: string): boolean {
  const addr = normalizeRecipient(to);
  const at = addr.lastIndexOf('@');
  if (at === -1) return false; // not address-shaped; caller handles emptiness
  const domain = addr.slice(at + 1);
  if (!domain) return false;
  if (RESERVED_DOMAINS.has(domain)) return true;
  return RESERVED_TLDS.some((tld) => domain.endsWith(tld));
}

/** True when `to` resolves to one of a party's known addresses. */
export function recipientIsKnown(to: string, known: Set<string>): boolean {
  return known.has(normalizeRecipient(to));
}

export interface RecipientCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Decide whether `to` is a safe recipient.
 *  1. Reserved/placeholder domains are always rejected (no party context needed).
 *  2. The host must supply at least one verified party address.
 *  3. The recipient must be one of those addresses — this catches a fabricated
 *     real-looking address and prevents a caller from bypassing the check by
 *     omitting its model-supplied party identifier.
 */
export function checkRecipient(
  to: string,
  knownPartyEmails?: Set<string>,
): RecipientCheck {
  const addr = normalizeRecipient(to);
  if (!addr || addr.lastIndexOf('@') < 1) {
    return { ok: false, reason: `malformed recipient (${to})` };
  }
  if (isReservedRecipientDomain(addr)) {
    return { ok: false, reason: `reserved/placeholder domain (${addr})` };
  }
  if (!knownPartyEmails || knownPartyEmails.size === 0) {
    return {
      ok: false,
      reason: `recipient ${addr} has no host-verified party email context`,
    };
  }
  if (!recipientIsKnown(addr, knownPartyEmails)) {
    return {
      ok: false,
      reason: `recipient ${addr} is not among the party's known emails`,
    };
  }
  return { ok: true };
}
