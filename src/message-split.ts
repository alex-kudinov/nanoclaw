/**
 * Boundary-aware text splitting for channels with a hard per-message length cap.
 *
 * Slicing on a raw character index cuts mid-word: an approval draft that ran
 * past 4000 characters arrived as "…no att" followed by a second message
 * starting "estation letter for the Standard Path" (Oana Tue, 2026-07-28).
 * Operators read these drafts before approving an outbound email, so a cut that
 * lands inside a word is a correctness problem, not a cosmetic one.
 *
 * Break on the largest structural boundary that still fills the chunk: blank
 * line, then newline, then space. Fall back to a hard cut only when no boundary
 * exists late enough to keep chunks reasonably full.
 */

/**
 * Reject a boundary that would leave a chunk under this fraction of the cap.
 * Without a floor, a single early newline in a long paragraph would emit a
 * two-line chunk followed by a full one — more messages, not fewer.
 */
const MIN_FILL = 0.6;

/** Boundaries in descending preference; the whole separator is consumed. */
const SEPARATORS = ['\n\n', '\n', ' '] as const;

/**
 * Index to cut `text` at, given a maximum chunk length. Always > 0, so callers
 * are guaranteed to make progress.
 */
function findBreak(text: string, max: number): number {
  const floor = Math.floor(max * MIN_FILL);
  const window = text.slice(0, max);
  for (const sep of SEPARATORS) {
    const idx = window.lastIndexOf(sep);
    if (idx >= floor) return idx + sep.length;
  }
  return max;
}

/**
 * Split `text` into chunks of at most `max` characters, preferring structural
 * boundaries. Returns `[text]` unchanged when it already fits. Whitespace at a
 * chunk seam is dropped rather than duplicated across both sides.
 */
export function splitForSlack(text: string, max: number): string[] {
  if (!Number.isInteger(max) || max <= 0) {
    throw new RangeError(`max must be a positive integer, got ${max}`);
  }
  if (text.length <= max) return [text];

  const chunks: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const cut = findBreak(rest, max);
    const chunk = rest.slice(0, cut).replace(/\s+$/, '');
    if (chunk) chunks.push(chunk);
    rest = rest.slice(cut).replace(/^\n+/, '');
  }
  if (rest.trim()) chunks.push(rest);
  return chunks.length ? chunks : [text.slice(0, max)];
}
