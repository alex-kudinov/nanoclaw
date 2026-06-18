/**
 * Open-proposal follow-up cadence (pure logic, no I/O).
 *
 * A proposal that sits unsigned in Plutio gets a bounded sequence of nudges.
 * Timing is measured in BUSINESS days (weekends skipped; holidays are not
 * modelled — a holiday only delays a touch by a day, which is harmless).
 *
 * Anchoring (see docs/PROPOSAL-FOLLOWUP-DESIGN.md):
 *  - Touch 1 fires once the proposal has been pending >= TOUCH1_TRIGGER_BIZDAYS.
 *    For the March backlog this is already true, so touch 1 goes out today.
 *  - Touches 2-4 are scheduled relative to the FIRST follow-up's send date
 *    (the anchor), NOT the proposal's original sent date. So a brand-new
 *    proposal still lands on 5/10/18/25-business-days-from-sent, while an old
 *    backlog proposal restarts its clock at the first nudge instead of
 *    telescoping straight to the breakup email.
 */

/** Business days a proposal must be pending before the first nudge. */
export const TOUCH1_TRIGGER_BIZDAYS = 5;

/**
 * Upper bound on proposal age (business days) eligible for a first nudge.
 * ~6 months — keeps the backlog sweep from cold-emailing year-old proposals
 * that should simply be voided. Tune via PROPOSAL_FOLLOWUP_MAX_AGE_BIZDAYS.
 */
export const TOUCH1_MAX_AGE_BIZDAYS = 130;

/** Minimum business days between consecutive touches (catch-up throttle). */
export const MIN_GAP_BIZDAYS = 5;

/**
 * Business days after the final touch (breakup) before an unanswered proposal
 * is marked cancelled in our records ("a week after the last reminder").
 */
export const CLOSEOUT_AFTER_BREAKUP_BIZDAYS = 5;

/** Business-day offset of each touch from the FIRST follow-up (anchor). */
const OFFSET_FROM_ANCHOR: Record<number, number> = { 2: 5, 3: 13, 4: 20 };

export interface TouchMeta {
  sequence: number;
  /** Short label for logs / Slack header. */
  label: string;
  /** Angle handed to the email generator. */
  angle: string;
}

/** The four touches, in order. */
export const CADENCE: TouchMeta[] = [
  {
    sequence: 1,
    label: 'reminder',
    angle:
      'A short, friendly reminder that the proposal is waiting. Confirm it reached them and invite any questions about scope, scheduling, or investment.',
  },
  {
    sequence: 2,
    label: 'value + call',
    angle:
      'Reinforce the outcome the engagement delivers, then offer a quick 15-minute call to walk through the proposal if reading it cold is the blocker.',
  },
  {
    sequence: 3,
    label: 'soft check-in',
    angle:
      'A low-pressure check-in: is this still a fit, or has the timing shifted? Make clear either answer is fine — the goal is a yes or a no, not another silent week.',
  },
  {
    sequence: 4,
    label: 'breakup',
    angle:
      'A gracious breakup: assume the timing is not right and that you will close the proposal on your end, while leaving the door open if things change.',
  },
];

export const MAX_TOUCHES = CADENCE.length;

function touchMeta(sequence: number): TouchMeta {
  return CADENCE[sequence - 1];
}

/** Strip time-of-day, keeping the local calendar date. */
function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Count business days in the half-open interval (from, to] — i.e. weekdays
 * strictly after `from`'s date, up to and including `to`'s date. Returns 0 when
 * `to` is on or before `from`.
 */
export function businessDaysBetween(from: Date, to: Date): number {
  const cur = atMidnight(from);
  const end = atMidnight(to);
  if (end <= cur) return 0;
  let count = 0;
  while (cur < end) {
    cur.setDate(cur.getDate() + 1);
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

export interface NextTouchInput {
  /** When the proposal entered Plutio 'pending' status (its sent date). */
  pendingAt: Date;
  /** Send date of touch 1 (cadence anchor), or null if no touch sent yet. */
  firstFollowupAt: Date | null;
  /** Send date of the most recent touch, or null if none sent. */
  lastSentAt: Date | null;
  /** Highest touch number already sent (0 if none). */
  lastSentSequence: number;
  /** True if a drafted touch is awaiting human approval. */
  hasPendingApproval: boolean;
  /** Evaluation time. */
  now: Date;
  /** Override of TOUCH1_MAX_AGE_BIZDAYS (optional). */
  maxAgeBizDays?: number;
}

/**
 * Decide which touch (if any) is due for a proposal right now. Returns the touch
 * to draft, or null when nothing is due. Never returns more than one touch — the
 * sequence advances at most one step per evaluation, so a daemon that missed
 * days catches up one nudge per run (throttled by MIN_GAP_BIZDAYS).
 */
export function selectNextTouch(input: NextTouchInput): TouchMeta | null {
  const {
    pendingAt,
    firstFollowupAt,
    lastSentAt,
    lastSentSequence,
    hasPendingApproval,
    now,
  } = input;

  if (hasPendingApproval) return null; // wait on the human before queuing more
  const next = lastSentSequence + 1;
  if (next > MAX_TOUCHES) return null; // sequence exhausted

  if (next === 1) {
    const age = businessDaysBetween(pendingAt, now);
    const maxAge = input.maxAgeBizDays ?? TOUCH1_MAX_AGE_BIZDAYS;
    if (age >= TOUCH1_TRIGGER_BIZDAYS && age <= maxAge) return touchMeta(1);
    return null;
  }

  // Touches 2-4 are anchored to the first follow-up's send date.
  if (!firstFollowupAt || !lastSentAt) return null; // invariant: prior touch logged
  const sinceAnchor = businessDaysBetween(firstFollowupAt, now);
  const sinceLast = businessDaysBetween(lastSentAt, now);
  if (sinceAnchor >= OFFSET_FROM_ANCHOR[next] && sinceLast >= MIN_GAP_BIZDAYS) {
    return touchMeta(next);
  }
  return null;
}

export interface CloseoutInput {
  lastSentSequence: number;
  /** Send date of the final touch. */
  lastSentAt: Date | null;
  /** True if the proposal is already closed out. */
  alreadyClosed: boolean;
  now: Date;
}

/**
 * True when the full cadence has run (breakup sent) and a week has passed with
 * the proposal still open — time to mark it cancelled in our records.
 */
export function shouldCloseOut(input: CloseoutInput): boolean {
  if (input.alreadyClosed) return false;
  if (input.lastSentSequence < MAX_TOUCHES) return false;
  if (!input.lastSentAt) return false;
  return (
    businessDaysBetween(input.lastSentAt, input.now) >=
    CLOSEOUT_AFTER_BREAKUP_BIZDAYS
  );
}
