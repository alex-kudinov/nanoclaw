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

/**
 * Labelled pipeline-entry field, e.g. `Entry ID: 911` — the form a
 * mailman→sales handoff uses. Its own line, exactly like the address fields.
 */
const ENTRY_FIELD_RE =
  /^\s*(?:Lead|Entry|Pipeline Entry)\s*ID\s*:\s*(\d+)\s*$/gim;

/** Subject-position id, e.g. `Lead #611 …` or `[NO ACTION] Entry #85 …`. */
const ENTRY_SUBJECT_RE = /^\s*(?:\[[^\]]*\]\s*)*(?:Lead|Entry)\s*#(\d+)\b/i;

/** Every entry id named anywhere, in either notation — used to refuse roundups. */
const ENTRY_ANY_RE = /(?:Lead|Entry|Pipeline Entry)\s*(?:ID\s*:|#)\s*(\d+)/gi;

/**
 * The pipeline entry id a message is about, when it identifies its lead by id
 * rather than by address. Callers turn this into an email (a host-side DB
 * lookup) and key on that, so the message joins the same `lead:{email}` thread
 * as everything else for that lead.
 *
 * `Lead #N`, `Entry #N` and `Entry ID: N` are one id space: all name
 * `business_v2.pipeline_entries.id` (see followup-drop.ts, which parses
 * `Lead #N` and feeds it straight to an entry lookup).
 *
 * Two accepted shapes, because two different producers exist:
 *   - a **labelled field** on a lead-bearing message — `[HANDOFF: mailman→sales]`
 *     … `Entry ID: 911`. This is exactly as trustworthy as the `Email:` field
 *     above and is gated the same way, on LEAD_BEARING. Without it a handoff
 *     carrying no address anchored nothing, so it opened a fresh channel root
 *     and recorded no anchor — leaving every later message for that lead to
 *     thread only if the agent retyped a 16-digit timestamp correctly
 *     (Lead #911, Monica Dwight, 2026-07-31T18:11Z).
 *   - a **bare status line** whose subject is the id — "Lead #611 …",
 *     "[NO ACTION] Entry #85 …". These carry no marker, so the id must open the
 *     message; a passing mention like "Certificate issued ✓ for Lead #5"
 *     anchors nothing.
 *
 * Either way the message must name exactly one distinct entry, so a roundup
 * like "Entry #101 updated. Still pending: Entry #97" stays at the root rather
 * than dragging two leads into one thread — a false merge is worse than no
 * merge.
 */
export function deriveLeadEntryRef(text: string): number | undefined {
  ENTRY_FIELD_RE.lastIndex = 0;
  const labelled = [...text.matchAll(ENTRY_FIELD_RE)];
  const isLeadBearing = LEAD_BEARING.some((re) => re.test(text));

  let claimed: string | undefined;
  if (isLeadBearing && labelled.length > 0) {
    claimed = labelled[0][1];
  } else {
    claimed = ENTRY_SUBJECT_RE.exec(text)?.[1];
  }
  if (claimed === undefined) return undefined;

  ENTRY_ANY_RE.lastIndex = 0;
  const distinct = new Set([...text.matchAll(ENTRY_ANY_RE)].map((m) => m[1]));
  if (distinct.size !== 1) return undefined;

  const id = Number(claimed);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}
