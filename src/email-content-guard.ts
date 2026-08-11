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
 *   4. No AI-tells — the standard anti-AI-ism check (see ai-tells.ts). The
 *      banned phrases/words that read as "a machine wrote this" and must never
 *      reach a client, enforced here instead of trusting the agent to self-edit.
 *   5. No invented program abbreviations. Tandem writes program names in full
 *      ("Mentor Coach Training") or uses the ICF-established specialization
 *      acronym ("MCS"); agents sometimes coin their own short forms (e.g.
 *      "MCT") that confuse readers (Cherie, 2026-07-23). Block the known
 *      coinages so they never reach a client again.
 *
 * Violations BLOCK the send; the [EMAIL BLOCKED] echo goes to chief with the
 * reasons so an operator can fix and resend. Zero-LLM, false-positive-averse.
 */

import { scanAiTells } from './ai-tells.js';

export interface ContentCheckResult {
  ok: boolean;
  violations: string[];
}

/** Canonical value used to bind one human-authorized numeric term exactly. */
export type NumericDiscountTerm = string;

export interface ContentCheckContext {
  /** Host-resolved terms only. Never populate this from agent-supplied text. */
  authorizedDiscountTerms?: readonly NumericDiscountTerm[];
}

/** Domains an outbound email may link to. Extend via EMAIL_LINK_WHITELIST. */
const DEFAULT_LINK_WHITELIST = [
  'tandemcoach.co',
  // Current and legacy Tandem-owned customer destinations. `tco.ac` is the
  // company-controlled short-link domain used by canonical Sales content.
  'tandemcoaching.com',
  'tco.ac',
  'tandemcoaching.academy',
  // ICF is the authoritative source we routinely cite for credentials, exams,
  // and the course catalog; the bare domain also covers learning.* and other
  // subdomains via the endsWith(`.${d}`) rule in hostAllowed(). Whitelisted so
  // legit ICF links never trip the guard and force a re-draft (Catherine Plano,
  // 2026-07-23: blocked ICF links → override → agent regenerated an unapproved
  // email that reverted the operator's edits and sent).
  'coachingfederation.org',
  'learning.coachingfederation.org',
  'buy.stripe.com',
  // Current canonical supervision checkout links use Stripe's `book` host.
  'book.stripe.com',
  'plutio.com',
  'calendly.com',
  // Trafft-backed appointments and direct session responses carry regional
  // Zoom hosts such as us06web.zoom.us.
  'zoom.us',
];

export function linkWhitelist(): string[] {
  const extra = (process.env.EMAIL_LINK_WHITELIST || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_LINK_WHITELIST, ...extra];
}

const URL_RE = /https?:\/\/[^\s<>")\]]+/gi;

/** hostname allowed iff it equals or is a subdomain of a whitelisted domain. */
function hostAllowed(host: string, whitelist: string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return whitelist.some((d) => h === d || h.endsWith(`.${d}`));
}

function checkLinks(text: string, violations: string[]): void {
  const wl = linkWhitelist();
  const seen = new Set<string>();
  for (const m of text.matchAll(URL_RE)) {
    let host: string;
    try {
      host = new URL(m[0]).hostname;
    } catch {
      violations.push(`invalid link "${m[0]}"`);
      continue;
    }
    if (!host) {
      violations.push(`invalid link "${m[0]}"`);
      continue;
    }
    if (seen.has(host)) continue;
    seen.add(host);
    if (!hostAllowed(host, wl))
      violations.push(`link to non-whitelisted domain "${host}"`);
  }
}

interface NumericDiscountMatch {
  key: NumericDiscountTerm;
  label: string;
  index: number;
}

function normalizedNumber(value: string): string {
  const n = Number(value.replaceAll(',', ''));
  return Number.isFinite(n) ? String(n) : value.replaceAll(',', '');
}

function collectMatches(
  text: string,
  re: RegExp,
  key: (m: RegExpExecArray) => NumericDiscountTerm,
  matches: NumericDiscountMatch[],
): void {
  for (const m of text.matchAll(re)) {
    matches.push({ key: key(m), label: m[0].trim(), index: m.index ?? 0 });
  }
}

/**
 * Extract the exact numeric commercial terms that the global guard controls.
 * The key is semantic rather than textual, so "5% off" matches a human's
 * "5% company discount" while 15% remains a different, blocked term.
 */
function extractNumericDiscountOffers(text: string): NumericDiscountMatch[] {
  const matches: NumericDiscountMatch[] = [];
  const percentSeen = new Set<string>();
  for (const m of text.matchAll(/\b(\d+(?:\.\d+)?)\s*%/gi)) {
    const start = m.index ?? 0;
    const window = text.slice(
      Math.max(0, start - 120),
      start + m[0].length + 120,
    );
    if (!/\b(?:discount|savings?|off)\b/i.test(window)) continue;
    const key = `percent:${normalizedNumber(m[1])}`;
    if (percentSeen.has(key)) continue;
    percentSeen.add(key);
    matches.push({ key, label: m[0].trim(), index: start });
  }
  collectMatches(
    text,
    /\$\s*(\d[\d,]*(?:\.\d+)?)\s*off\b/gi,
    (m) => `amount-off:${normalizedNumber(m[1])}`,
    matches,
  );
  collectMatches(
    text,
    /discount(?:ed)?\s+(?:of|to|price\s+of)\s+\$?\s*(\d[\d,]*(?:\.\d+)?)/gi,
    (m) => `price:${normalizedNumber(m[1])}`,
    matches,
  );
  collectMatches(
    text,
    /(?:special|reduced)\s+price\s+of\s+\$?\s*(\d[\d,]*(?:\.\d+)?)/gi,
    (m) => `price:${normalizedNumber(m[1])}`,
    matches,
  );
  collectMatches(
    text,
    /\bwaive\s+(?:the\s+)?\$?\s*(\d[\d,]*(?:\.\d+)?)/gi,
    (m) => `waive:${normalizedNumber(m[1])}`,
    matches,
  );
  return matches.sort((a, b) => a.index - b.index);
}

export interface HumanCommercialTermDecision {
  term: NumericDiscountTerm;
  decision: 'authorize' | 'revoke';
}

/**
 * Interpret a human Slack reply narrowly. Questions are not authority; explicit
 * negation revokes an earlier term; an affirmative commercial statement (such
 * as "pick ... 5% company discount") authorizes only that canonical value.
 */
export function extractHumanCommercialTermDecisions(
  text: string,
): HumanCommercialTermDecision[] {
  const decisions: HumanCommercialTermDecision[] = [];
  for (const m of text.matchAll(/\b(\d+(?:\.\d+)?)\s*%/gi)) {
    const start = m.index ?? 0;
    const clauseStart = Math.max(
      text.lastIndexOf('\n', start),
      text.lastIndexOf('.', start),
      text.lastIndexOf(';', start),
    );
    const nextStops = [
      text.indexOf('\n', start),
      text.indexOf('.', start),
      text.indexOf(';', start),
    ].filter((i) => i >= 0);
    const clauseEnd = nextStops.length ? Math.min(...nextStops) : text.length;
    const clause = text.slice(clauseStart + 1, clauseEnd + 1);
    if (
      !/\b(?:discount|savings?|off|pick|choose|use|apply|offer|give|approve|authorize|option)\b/i.test(
        clause,
      )
    )
      continue;
    const term = `percent:${normalizedNumber(m[1])}`;
    if (clause.includes('?')) continue;
    const negated = /\b(?:do\s+not|don't|cannot|can't|never|not|no)\b/i.test(
      clause,
    );
    decisions.push({ term, decision: negated ? 'revoke' : 'authorize' });
  }

  for (const offer of extractNumericDiscountOffers(text)) {
    if (offer.key.startsWith('percent:')) continue;
    const window = text.slice(
      Math.max(0, offer.index - 80),
      Math.min(text.length, offer.index + offer.label.length + 80),
    );
    if (window.includes('?')) continue;
    const negated = /\b(?:do\s+not|don't|cannot|can't|never|not|no)\b/i.test(
      window,
    );
    decisions.push({
      term: offer.key,
      decision: negated ? 'revoke' : 'authorize',
    });
  }
  return decisions;
}

function checkDiscounts(
  text: string,
  violations: string[],
  authorized: ReadonlySet<NumericDiscountTerm>,
): void {
  const firstUnauthorized = extractNumericDiscountOffers(text).find(
    (offer) => !authorized.has(offer.key),
  );
  if (firstUnauthorized) {
    violations.push(
      `numeric discount offer "${firstUnauthorized.label}" (discounts are human-only)`,
    );
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

function checkAiTells(text: string, violations: string[]): void {
  for (const label of scanAiTells(text)) {
    violations.push(`AI-ism "${label}" (banned client-facing phrasing)`);
  }
}

// Invented / ambiguous program abbreviations agents coin on their own. Extend
// only with forms that never appear legitimately in a Tandem client email —
// the established acronyms (ICF, ACC, PCC, MCC, MCS, CPL, AAMC, CCE, BARS) are
// deliberately absent. Case-sensitive uppercase: a coined acronym is always
// emitted in caps, so this catches the real case with zero false positives.
const PROGRAM_ABBREVIATIONS: Array<[RegExp, string]> = [
  [
    /\bMCT\b/,
    'invented acronym "MCT" — write "Mentor Coach Training" in full, or use "MCS"',
  ],
];

function checkProgramAbbreviations(text: string, violations: string[]): void {
  for (const [re, label] of PROGRAM_ABBREVIATIONS) {
    if (re.test(text)) violations.push(label);
  }
}

/** Run all content predicates over subject + body. */
export function checkContent(
  subject: string,
  body: string,
  context: ContentCheckContext = {},
): ContentCheckResult {
  const violations: string[] = [];
  const text = `${subject || ''}\n${body || ''}`;
  checkLinks(text, violations);
  checkDiscounts(
    text,
    violations,
    new Set(context.authorizedDiscountTerms ?? []),
  );
  checkPlaceholders(text, violations);
  checkAiTells(text, violations);
  checkProgramAbbreviations(text, violations);
  return { ok: violations.length === 0, violations };
}
