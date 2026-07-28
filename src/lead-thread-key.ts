/**
 * Canonical Slack thread key for a single sales lead.
 *
 * Every minion that touches a lead used to invent its own key namespace:
 * inbox posted the handoff under `inbox:email:{gmail thread id}` (falling back
 * to `inbox:lead:{email}`) and sales posted the approval card under
 * `sales:entry:{pipeline entry id}`. Two namespaces for one lead means two
 * channel roots, so the operator saw the inbound message and the draft reply as
 * unrelated top-level posts, with the full inbound quoted in both (Oana Tue,
 * Entry 938, 2026-07-28).
 *
 * The host derives the key instead of trusting the agent-supplied one. The lead
 * email is the only identity present at every stage — inbox has it before an
 * Entry ID exists, sales has it on the card, mailman has it on the send — so it
 * is the canonical anchor.
 *
 * Derivation is deliberately narrow. A false merge (two leads in one thread) is
 * worse than no merge, so only explicitly labelled address fields on
 * lead-bearing messages are considered; addresses quoted inside a message body
 * are ignored.
 */

/** Our own addresses anchor nothing — a lead thread is keyed by the lead. */
const OWN_DOMAIN_SUFFIXES = [
  'tandemcoach.co',
  'tandemcoaching.academy',
  'tandem.co',
];

/**
 * Messages that represent work on one lead. Anything else keeps whatever key
 * its author passed, so this never reshapes threading for unrelated groups.
 */
const LEAD_BEARING = [
  /\[HANDOFF:\s*\w+\s*(?:→|->)\s*sales\]/,
  /\[HANDOFF:\s*sales\s*(?:→|->)\s*mailman\]/,
  /\[SALES REVIEW\]/,
];

/** Labelled address fields, in the order minions emit them. */
const ADDRESS_FIELD_RE =
  /^\s*(?:Lead Email|Email|To|From)\s*:\s*([^\s<>,;]+@[^\s<>,;]+)\s*$/gim;

function isOwnAddress(email: string): boolean {
  const domain = email.slice(email.lastIndexOf('@') + 1);
  return OWN_DOMAIN_SUFFIXES.some(
    (own) => domain === own || domain.endsWith(`.${own}`),
  );
}

/** First labelled address that belongs to someone outside Tandem. */
function findLeadEmail(text: string): string | undefined {
  ADDRESS_FIELD_RE.lastIndex = 0;
  for (const match of text.matchAll(ADDRESS_FIELD_RE)) {
    const email = match[1].toLowerCase().replace(/[.,;]+$/, '');
    if (!isOwnAddress(email)) return email;
  }
  return undefined;
}

/**
 * The canonical `lead:{email}` key for a lead-bearing message, or undefined
 * when the message is not about a lead or carries no usable address. Callers
 * fall back to the author-supplied key on undefined.
 */
export function deriveLeadThreadKey(text: string): string | undefined {
  if (!LEAD_BEARING.some((re) => re.test(text))) return undefined;
  const email = findLeadEmail(text);
  return email ? `lead:${email}` : undefined;
}
