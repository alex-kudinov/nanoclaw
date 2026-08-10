/**
 * autonomy-policy — pure policy for the per-category autonomy ladder.
 *
 * The ladder converts operator trust into delegated authority, per inquiry
 * category, never globally:
 *   L1 — agent drafts, a human approves every send (baseline).
 *   L2 — hold-and-send: the draft auto-approves after a veto window unless an
 *        operator objects (👎 or any feedback in-thread). Earned by a streak
 *        of consecutive approved-unchanged drafts in that category.
 *   L3 — immediate send, post-hoc sampled review. Defined but NOT reachable
 *        by promotion — enabling it is an explicit human decision.
 *
 * Promotion is mechanical (streak), demotion is instant (any correction or
 * veto). Guarded categories never leave L1 regardless of streak.
 */

export const AUTONOMY_LEVELS = { L1: 1, L2: 2, L3: 3 } as const;

/** Fixed inquiry taxonomy. The sales agent self-tags each draft with one. */
export const CATEGORIES = [
  'pricing',
  'enrollment',
  'program-content',
  'scheduling',
  'account-access',
  'payment-issue',
  'followup',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Categories that stay at L1 no matter the streak (money + judgment). */
export const GUARDED_CATEGORIES: ReadonlySet<string> = new Set([
  'pricing',
  'payment-issue',
]);

/** Consecutive approved-unchanged drafts required to promote L1 → L2. */
export const PROMOTE_STREAK = parseInt(
  process.env.AUTONOMY_PROMOTE_STREAK || '15',
  10,
);

/** Veto window for L2 hold-and-send, in minutes. */
export const VETO_WINDOW_MINUTES = parseInt(
  process.env.AUTONOMY_VETO_MINUTES || '120',
  10,
);

/** Groups the ladder applies to (comma-separated folder names). */
export function autonomyGroups(): string[] {
  return (process.env.AUTONOMY_GROUPS || 'sales')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A draft older than this with no operator response is counted 'expired'. */
export const DRAFT_EXPIRY_HOURS = 72;

const DRAFT_MARKER_RE =
  /^[ \t]*\**[ \t]*(?:REVISED[ \t]+)?(?:DRAFT RESPONSE TO LEAD|DRAFT FOLLOW-UP)[ \t]*:\**[ \t]*$/im;
const FOLLOW_UP_DRAFT_MARKER_RE =
  /^[ \t]*\**[ \t]*(?:REVISED[ \t]+)?DRAFT FOLLOW-UP[ \t]*:\**[ \t]*$/im;

/**
 * True when a bot message contains one canonical Sales draft heading on its
 * own line. The exact historical `REVISED DRAFT FOLLOW-UP:` form remains a
 * recognition-only alias so existing real drafts do not disappear from
 * reports; producers must emit the canonical heading. Bare `DRAFT RESPONSE:`
 * belongs to non-Sales producers and must not enter the Sales autonomy ledger.
 */
export function isDraftMessage(text: string): boolean {
  return DRAFT_MARKER_RE.test(text);
}

/** Extract the agent's self-tagged `Category: {slug}` line, if valid. */
export function parseDraftCategory(text: string): Category | undefined {
  const m = text.match(/^Category:\s*([a-z-]+)\s*$/im);
  if (!m) return undefined;
  const slug = m[1].toLowerCase();
  return (CATEGORIES as readonly string[]).includes(slug)
    ? (slug as Category)
    : undefined;
}

/** An injected approval row (reaction, bare-✅, or auto-approve). */
export function isApprovalMessage(text: string): boolean {
  return /^✅ (Approved|Auto-approved)/.test(text.trim());
}

/**
 * A typed operator approval — the WHOLE message is a short affirmative
 * ("approved" is the dominant historical form: 23× vs 1× reaction-injected in
 * the sales corpus). Mixed messages ("remove X, otherwise approved") are
 * corrections and must NOT match, hence the full-anchor.
 */
const OPERATOR_APPROVAL_RE =
  /^\s*(?:approved?|approve|yes[,.! ]*(?:send(?: it)?)?|send(?: it)?|go ahead|ship it|lgtm|ok(?:ay)? to send|👍|✅)\s*[.!]*\s*$/i;

export function isOperatorApprovalText(text: string): boolean {
  return OPERATOR_APPROVAL_RE.test(text);
}

export function isAutoApprovalMessage(text: string): boolean {
  return text.trim().startsWith('✅ Auto-approved');
}

/**
 * Keyword classifier for historical (untagged) drafts — backfill only. Live
 * drafts carry an explicit Category line; this is deliberately coarse.
 */
export function heuristicCategory(text: string): Category {
  const t = text.toLowerCase();
  if (FOLLOW_UP_DRAFT_MARKER_RE.test(text)) return 'followup';
  if (
    /refund|failed payment|declined|split payment|installment|invoice/.test(t)
  )
    return 'payment-issue';
  if (/\$\d|price|pricing|cost|payment plan|how much/.test(t)) return 'pricing';
  if (/login|log in|access|password|community\.tandem|course material/.test(t))
    return 'account-access';
  if (/cohort|enroll|waitlist|seat|register|sign.?up|start date/.test(t))
    return 'enrollment';
  if (
    /class time|reschedul|make.?up|missed class|calendar|session time/.test(t)
  )
    return 'scheduling';
  if (
    /icf|accredit|curriculum|hours|bars|markers|mcs|acc\b|pcc\b|mentor coach|practicum|credential/.test(
      t,
    )
  )
    return 'program-content';
  return 'other';
}

const BUSINESS_TZ = 'America/Chicago';
const BUSINESS_START_HOUR = 7;
const BUSINESS_END_HOUR = 22;

function hourIn(tz: string, d: Date): number {
  return parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    }).format(d),
    10,
  );
}

/**
 * Veto-window expiry: now + window, clamped so it never lands outside
 * 07:00–22:00 Central — an expiry nobody is awake to veto defeats the window.
 * Out-of-hours expiries roll forward to 09:00 local.
 */
export function computeVetoExpiry(
  now: Date,
  windowMinutes: number = VETO_WINDOW_MINUTES,
): Date {
  const expiry = new Date(now.getTime() + windowMinutes * 60_000);
  const h = hourIn(BUSINESS_TZ, expiry);
  if (h >= BUSINESS_START_HOUR && h < BUSINESS_END_HOUR) return expiry;
  // Roll forward hour-by-hour until 09:00 local (max 24 steps, DST-safe).
  const rolled = new Date(expiry);
  for (let i = 0; i < 26; i++) {
    rolled.setTime(rolled.getTime() + 60 * 60_000);
    if (hourIn(BUSINESS_TZ, rolled) === 9) return rolled;
  }
  return expiry; // unreachable; fail open to the raw expiry
}

/** Promotion check — pure. */
export function shouldPromote(
  level: number,
  streak: number,
  category: string,
): boolean {
  return (
    level === AUTONOMY_LEVELS.L1 &&
    streak >= PROMOTE_STREAK &&
    !GUARDED_CATEGORIES.has(category)
  );
}
