/**
 * email-content-guard — deterministic P2 predicates at the send boundary.
 *
 * Sibling to email-recipient-guard: runs on EVERY outbound send and reply,
 * regardless of which agent composed it or which autonomy level applied.
 * These are the rules that make auto-send safe — the fence around what an
 * agent may do without a human:
 *
 *   1. No numeric discount offers (discounts are human-only — Alex).
 *      Pattern requires a number attached, so "we don't offer discounts"
 *      passes while "15% off" / "discounted to $999" blocks.
 *   2. No links outside the domain whitelist (an agent must never send a
 *      customer to an unknown destination).
 *   3. No unfilled template placeholders ([insert …], {{name}}, TBD, …).
 *
 * Violations BLOCK the send; the [EMAIL BLOCKED] echo goes to chief with the
 * reasons so an operator can fix and resend. Zero-LLM, false-positive-averse.
 */

export interface ContentCheckResult {
  ok: boolean;
  violations: string[];
}

/** Domains an outbound email may link to. Extend via EMAIL_LINK_WHITELIST. */
const DEFAULT_LINK_WHITELIST = [
  'tandemcoach.co',
  'tandemcoaching.academy',
  'coachingfederation.org',
  'buy.stripe.com',
  'plutio.com',
  'calendly.com',
];

export function linkWhitelist(): string[] {
  const extra = (process.env.EMAIL_LINK_WHITELIST || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_LINK_WHITELIST, ...extra];
}

const URL_RE = /https?:\/\/([^\s/<>")\]]+)/gi;

/** hostname allowed iff it equals or is a subdomain of a whitelisted domain. */
function hostAllowed(host: string, whitelist: string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return whitelist.some((d) => h === d || h.endsWith(`.${d}`));
}

function checkLinks(text: string, violations: string[]): void {
  const wl = linkWhitelist();
  const seen = new Set<string>();
  for (const m of text.matchAll(URL_RE)) {
    const host = m[1].split(':')[0];
    if (seen.has(host)) continue;
    seen.add(host);
    if (!hostAllowed(host, wl))
      violations.push(`link to non-whitelisted domain "${host}"`);
  }
}

// Numeric discount offers only — the word "discount" alone must pass (the
// correct reply to "do you offer discounts?" contains it).
const DISCOUNT_RES = [
  /\d+\s*%\s*off/i,
  /\$\s*\d[\d,]*\s*off\b/i,
  /discount(?:ed)?\s+(?:of|to|price\s+of)\s+\$?\s*\d/i,
  /(?:special|reduced)\s+price\s+of\s+\$?\s*\d/i,
  /\bwaive\s+(?:the\s+)?\$?\s*\d/i,
];

function checkDiscounts(text: string, violations: string[]): void {
  for (const re of DISCOUNT_RES) {
    const m = text.match(re);
    if (m) {
      violations.push(`numeric discount offer "${m[0].trim()}" (discounts are human-only)`);
      return;
    }
  }
}

const PLACEHOLDER_RES: Array<[RegExp, string]> = [
  [/\[insert[^\]]*\]/i, 'unfilled [insert …] placeholder'],
  [/\{\{\s*\w+\s*\}\}/, 'unfilled {{template}} placeholder'],
  [/\[(?:name|link|date|price|amount)\]/i, 'unfilled [field] placeholder'],
  [/\bTBD\b/, 'TBD left in body'],
  [/\blorem ipsum\b/i, 'lorem ipsum left in body'],
];

function checkPlaceholders(text: string, violations: string[]): void {
  for (const [re, label] of PLACEHOLDER_RES) {
    if (re.test(text)) violations.push(label);
  }
}

/** Run all content predicates over subject + body. */
export function checkContent(subject: string, body: string): ContentCheckResult {
  const violations: string[] = [];
  const text = `${subject || ''}\n${body || ''}`;
  checkLinks(text, violations);
  checkDiscounts(text, violations);
  checkPlaceholders(text, violations);
  return { ok: violations.length === 0, violations };
}
