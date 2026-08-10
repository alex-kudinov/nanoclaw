/**
 * Narrow wrong-name prevention for student-facing grader feedback.
 *
 * Addressing a student by someone else's name is the loudest possible signal
 * that feedback was produced without a person reading it, and it is the one
 * identity error a host can catch deterministically: the expected name is the
 * first line of the submission root, parsed by the host, and the offered name is
 * at the front of the offered text.
 *
 * The rule is deliberately small. It fires only where a salutation is
 * unambiguous — after an explicit greeting word, or on a line that contains
 * nothing but the address — and it accepts only an exact match on the full
 * header name or its exact first token. R5 proposed accepting `Ada` for a
 * student registered as `Adaline`; that was rejected and stays rejected, because
 * inventing equivalence between distinct names manufactures exactly the false
 * negative this rule exists to catch. Feedback with no salutation is normal and
 * always passes.
 */

// Spelled with explicit case classes rather than the `i` flag: under `u`,
// case-insensitive matching case-folds `\p{Lu}` too, so `/\p{Lu}/iu` matches
// lowercase letters and the capitalization requirement below would vanish.
const GREETING =
  '(?:[Hh]i|[Hh]ello|[Hh]ey|[Dd]ear|[Gg]reetings|[Gg]ood\\s+(?:[Mm]orning|[Aa]fternoon|[Ee]vening))';
/** One to three capitalized, letter-only tokens. Digits and dots end a token. */
const NAME_TOKENS =
  "(\\p{Lu}[\\p{L}\\p{M}'’-]*(?:\\s+\\p{Lu}[\\p{L}\\p{M}'’-]*){0,2})";

// "Hi Ada," / "Dear Ada Lovelace:" / a line that is only "Hello Ada".
const GREETING_RE = new RegExp(
  `^${GREETING}\\s+${NAME_TOKENS}\\s*(?:[,:!.]|$)`,
  'u',
);
// A line holding nothing but the address: "Ada," on its own line.
const BARE_VOCATIVE_RE = new RegExp(`^${NAME_TOKENS}\\s*[,:]$`, 'u');

/**
 * Addresses that are not names. Without these, "Hi there," would be compared
 * against the student's name and blocked.
 */
const GENERIC_ADDRESSES = new Set([
  'there',
  'all',
  'everyone',
  'team',
  'folks',
]);

/**
 * Single words that can legitimately open a line as "Word," without being an
 * address: sentence-initial connectives, and greetings used with no name at all
 * ("Hello,"). A closed list, checked only for a SINGLE-token bare vocative —
 * this is not a scan of arbitrary capitalized words, and a multi-token address
 * is never exempted by it.
 */
const NON_NAME_OPENERS = new Set([
  'hi',
  'hello',
  'hey',
  'dear',
  'greetings',
  'however',
  'overall',
  'still',
  'also',
  'finally',
  'first',
  'second',
  'third',
  'next',
  'then',
  'instead',
  'again',
  'meanwhile',
  'similarly',
  'yes',
  'no',
  'note',
  'importantly',
  'unfortunately',
  'additionally',
  'specifically',
  'here',
  'there',
]);

/** Conservative fold for comparison: NFKC, zero-width stripped, lowercased. */
function foldName(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The name a body opens by addressing, or undefined when it opens with none.
 *
 * Only the first line is examined. A salutation that is not at the front is not
 * a salutation, and scanning further would turn every capitalized word in the
 * feedback into a candidate.
 */
export function extractSalutationName(body: string): string | undefined {
  const firstLine = body.replace(/\r\n?/g, '\n').split('\n', 1)[0]?.trim();
  if (!firstLine) return undefined;
  const greeted = GREETING_RE.exec(firstLine)?.[1];
  if (greeted) return greeted.trim();
  const bare = BARE_VOCATIVE_RE.exec(firstLine)?.[1]?.trim();
  if (!bare) return undefined;
  const folded = foldName(bare);
  if (!folded.includes(' ') && NON_NAME_OPENERS.has(folded)) return undefined;
  return bare;
}

/**
 * True when an offered salutation may address this student.
 *
 * Accepts the full header name or its exact first token. Everything else is a
 * mismatch, including a prefix ("Ada" for "Adaline"), a superstring ("Adaline"
 * for "Ada"), a confusable ("Аda" with a Cyrillic А folds to a different
 * string), and a punctuation-broken token ("A.d.a" parses as the single token
 * "A").
 */
export function salutationMatchesStudent(
  candidate: string,
  expectedFullName: string,
): boolean {
  const offered = foldName(candidate);
  if (!offered) return true;
  if (GENERIC_ADDRESSES.has(offered)) return true;
  const expected = foldName(expectedFullName);
  if (!expected) return false;
  if (offered === expected) return true;
  return offered === expected.split(' ')[0];
}

/**
 * True when the body opens by addressing someone other than this student.
 *
 * A body with no salutation, or with a generic address, is never a mismatch:
 * the rule only ever fires on a positive identification of a different name.
 */
export function hasWrongStudentSalutation(
  body: string,
  expectedFullName: string | undefined,
): boolean {
  if (!expectedFullName) return false;
  const candidate = extractSalutationName(body);
  if (!candidate) return false;
  return !salutationMatchesStudent(candidate, expectedFullName);
}
