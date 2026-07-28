/**
 * Parsing for typed operator "stop following up" instructions.
 *
 * The 👎-on-the-card path (followup-drop.ts) has existed since 2026-07-16, but
 * this operator does not react — they type, in freeform batches:
 *
 *   "drop renee carr - cherie is responding directly."
 *   "#89 drop - she's in. #54 - done drop #283, 339 349 341 drop"
 *   "drop 22 / ok 25 / 26 signed up / drop 29 / ok 31"
 *   "this keeps coming up every day even after i say drop - drop means drop"
 *
 * Typed instructions went to the sales container, which is a fresh session per
 * cron run, and which then either wrote the wrong stage (Namrata #213, see
 * migration 113) or posted "[SKIP — DB TRACKING ANOMALY]" and wrote nothing
 * (Renee Fisher #345, five consecutive weekdays). Either way the operator was
 * told it was handled and the nudge returned the next morning.
 *
 * These are pure functions: they extract CANDIDATES only. Nothing here decides
 * to mutate anything — the caller resolves candidates against the live
 * follow-up queue, so only a lead actually being nudged can ever be dropped.
 */

/** Candidate targets extracted from one operator message. */
export interface DropTargets {
  /** Pipeline entry ids referenced as `#N` or as a bare number beside a drop verb. */
  ids: number[];
  /**
   * The subset written as `#N`. Only these are worth reporting back when they
   * match nothing: "drop #9999" is a typo the operator must hear about, whereas
   * the stray `2` in "drop those 2 - responded separately" is not.
   */
  explicitIds: number[];
  /**
   * Lowercased phrases to resolve against queued leads. Deliberately generous —
   * "drop accredication pending" yields "pending" — because the resolver only
   * ever acts on a phrase that matches a lead currently being nudged, and an
   * unmatched phrase is silently discarded rather than reported.
   */
  names: string[];
}

/** Phrases that mean "stop following this person up, durably." */
const DROP_VERB =
  "drop|stop (?:following up|follow[- ]?ups?|nudging|chasing)|no (?:more|further) (?:follow[- ]?ups?|nudges?)|don'?t (?:bring|follow) (?:it |them )?up|do not (?:bring|follow) (?:it |them )?up|never (?:contact|email|follow)";

const DROP_RE = new RegExp(`\\b(?:${DROP_VERB})\\b`, 'i');

/**
 * Markers that end a drop run inside a batch line. "#54 - done drop #283" must
 * not drop 54, and "drop 22 ok 25" must not drop 25.
 */
const OPPOSING_RE =
  /\b(?:ok|okay|approved?|approve|keep|send|sent|signed up|she'?s in|he'?s in|done|responded|replied|paid|enrolled|good|fine|yes)\b/i;

/** Words that are never a person's name, so "drop pricing" targets nobody. */
const NOT_A_NAME = new Set([
  'the',
  'this',
  'that',
  'these',
  'those',
  'them',
  'it',
  'its',
  'his',
  'her',
  'their',
  'all',
  'rest',
  'both',
  'and',
  'or',
  'for',
  'from',
  'with',
  'to',
  'again',
  'now',
  'today',
  'everything',
  'anything',
  'lead',
  'leads',
  'entry',
  'pricing',
  'price',
  'prices',
  'cost',
  'link',
  'links',
  'line',
  'lines',
  'draft',
  'response',
  'reply',
  'email',
  'text',
  'part',
  'section',
  'para',
  'paragraph',
  'sentence',
  'bit',
  'mention',
  'note',
  'date',
  'dates',
  'cta',
  'booking',
  'accreditation',
  'accredication',
  'follow',
  'followup',
  'up',
  'first',
  'last',
  'second',
  'third',
  'one',
  'two',
  'three',
  'few',
  'some',
]);

/** Strip Slack link markup so `<mailto:a@b|a@b>` does not look like a name. */
function normalize(text: string): string {
  return text
    .replace(/<mailto:[^|>]*\|([^>]*)>/gi, '$1')
    .replace(/<https?:[^|>]*\|([^>]*)>/gi, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split a line into runs at opposing markers, so a drop verb only claims the
 * numbers in its own run.
 */
function dropRuns(text: string): string[] {
  return text
    .split(
      /(?=\b(?:ok|okay|approved?|approve|keep|send|sent|done|responded|replied|paid|enrolled)\b)/i,
    )
    .flatMap((part) => part.split(/[.;\n]+/))
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && DROP_RE.test(s));
}

/** Entry ids inside one run: `#N` always, bare N when no opposing marker claims it. */
function idsInRun(run: string): Array<{ id: number; explicit: boolean }> {
  const out: Array<{ id: number; explicit: boolean }> = [];
  for (const m of run.matchAll(/(#?)\b(\d{1,6})\b/g)) {
    // A number sitting after "ok"/"done" since the last drop verb belongs to
    // that marker, not to the drop: "drop 213 ok 239" drops only 213.
    const sinceVerb = run
      .slice(0, m.index)
      .split(new RegExp(DROP_VERB, 'i'))
      .pop();
    if (OPPOSING_RE.test(sinceVerb ?? '')) continue;
    const n = Number.parseInt(m[2], 10);
    if (Number.isSafeInteger(n) && n > 0)
      out.push({ id: n, explicit: m[1] === '#' });
  }
  return out;
}

/** Name phrases following a drop verb, split on "and"/commas, stopwords removed. */
function namesInRun(run: string): string[] {
  const verbRe = new RegExp(`\\b(?:${DROP_VERB})\\b\\s+(.{0,60})`, 'gi');
  const out: string[] = [];
  for (const m of run.matchAll(verbRe)) {
    const tail = m[1].split(/\s+-\s+|\s+because\b|\s+since\b/)[0];
    for (const chunk of tail.split(/\s*(?:,|\band\b|\&|\/)\s*/)) {
      const tokens = chunk
        .toLowerCase()
        .split(/\s+/)
        .map((t) => t.replace(/^[^a-z']+|[^a-z']+$/g, ''))
        .filter((t) => t.length > 1 && !NOT_A_NAME.has(t) && !/^\d+$/.test(t));
      if (tokens.length > 0) out.push(tokens.slice(0, 3).join(' '));
    }
  }
  return out;
}

/**
 * Extract drop candidates from an operator message. Returns null when the
 * message contains no drop instruction at all.
 *
 * A non-null result with empty `ids` and `names` is meaningful and must not be
 * swallowed: the operator said "drop" and named nothing resolvable, which the
 * caller reports back instead of silently doing nothing.
 */
export function parseDropInstruction(text: string): DropTargets | null {
  const norm = normalize(text);
  if (!norm || !DROP_RE.test(norm)) return null;

  const ids = new Set<number>();
  const explicitIds = new Set<number>();
  const names = new Set<string>();
  for (const run of dropRuns(norm)) {
    for (const { id, explicit } of idsInRun(run)) {
      ids.add(id);
      if (explicit) explicitIds.add(id);
    }
    for (const name of namesInRun(run)) names.add(name);
  }
  return { ids: [...ids], explicitIds: [...explicitIds], names: [...names] };
}

/** True when the operator is plainly asking to undo a drop. */
export function isResumeInstruction(text: string): boolean {
  return /\b(?:undrop|un-drop|resume follow(?:[- ]?ups?)?|start following up again|re[- ]?enable follow)/i.test(
    normalize(text),
  );
}

/**
 * Match one name phrase against queued leads. Token-subset in either direction,
 * so "renee carr" matches a lead stored only as "Renee", and "namrata" matches
 * "Namrata Kohli". Returns every match — the caller refuses to act on an
 * ambiguous one rather than guessing which person the operator meant.
 */
export function matchLeadsByName<
  T extends { display_name: string; primary_email?: string | null },
>(phrase: string, leads: T[]): T[] {
  const want = phrase.split(/\s+/).filter(Boolean);
  if (want.length === 0) return [];
  const covers = (a: string[], b: string[]) => b.every((t) => a.includes(t));
  return leads.filter((l) => {
    // The email local part catches leads stored under an initial or a handle
    // ("R. Carr" / reneegcarr@…), which name-only matching would miss.
    const local = (l.primary_email ?? '').split('@')[0].toLowerCase();
    const have = [
      ...l.display_name.toLowerCase().split(/\s+/),
      ...local.split(/[._-]+/),
    ].filter(Boolean);
    if (have.length === 0) return false;
    return covers(have, want) || covers(want, have);
  });
}
