/**
 * Build the mailman handoff for an approved `[SALES REVIEW]` card, on the host.
 *
 * The sales agent is supposed to emit `[HANDOFF: sales→mailman]` after the
 * operator approves. Three times it did not: Entry 938 (2026-07-28) lost the
 * approval while waiting on a Gmail search; Lead #962 (2026-07-30) printed the
 * handoff as its final assistant text instead of calling `send_message`; Lead
 * #871 (2026-07-31) received its `gmail_get_thread` result, confirmed the draft
 * was consistent, then announced it was still waiting and stopped. Every one
 * ended as `[SEND NOT OBSERVED]` and a hand-driven rescue.
 *
 * The host already holds everything the send needs, so it does not have to ask
 * the agent again. NC-20260728-003 deliberately made the watchdog alert rather
 * than send, reasoning that "re-deriving an email body risks sending something
 * other than what was approved". That risk is real but specific: it came from
 * REGENERATING a draft (2026-07-23). This module never regenerates. It slices
 * the approved bytes out of the card the operator actually approved, and
 * returns null the moment the card does not parse exactly — in which case the
 * existing alert path is unchanged.
 *
 * Thread-ID is deliberately omitted. A threaded `gmail_reply` needs a host
 * resource grant that does not survive a daemon restart, whereas a `Re:`
 * subject makes `resolveSendThreadId` re-attach the send to the existing thread
 * from Gmail itself — host-derived and grant-free.
 */

/** Cards carry the operator-facing summary; only the fenced draft is sendable. */
const CARD_MARKER = /\[(?:SALES REVIEW|CLIENT SUPPORT REVIEW)\]/;
const EMAIL_LINE = /^\s*Email\s*:\s*([^\s<>,;]+@[^\s<>,;]+)\s*$/im;
const LEAD_LINE = /\[SALES REVIEW\]\s*Lead\s*#\s*(\d+)/i;
/**
 * Sales writes `DRAFT RESPONSE TO LEAD:`, client support writes
 * `DRAFT RESPONSE:`. Both fence the sendable draft identically.
 */
const DRAFT_HEADING = /^\s*DRAFT RESPONSE(?: TO LEAD)?:\s*$/im;
const FENCE = /^\s*---\s*$/;
const SUBJECT_LINE = /^\s*Subject\s*:\s*(.+?)\s*$/i;

export interface ApprovedHandoff {
  /** Canonical `[HANDOFF: sales→mailman]` text, ready to write as an IPC message. */
  text: string;
  /** Normalized recipient, for deduplicating against the pending-send row. */
  recipient: string;
  subject: string;
  body: string;
}

/**
 * Parse an approved card into a sendable handoff, or null when anything is
 * missing or ambiguous. Null always means "leave it to the operator" — this
 * function must never guess at customer-facing content.
 */
export function buildApprovedHandoff(
  cardText: string,
  opts: { originalMessage?: string; entryId?: number } = {},
): ApprovedHandoff | null {
  if (!CARD_MARKER.test(cardText)) return null;

  const recipient = cardText.match(EMAIL_LINE)?.[1]?.toLowerCase();
  if (!recipient) return null;

  const lines = cardText.split('\n');
  const headingIdx = lines.findIndex((line) => DRAFT_HEADING.test(line));
  if (headingIdx === -1) return null;

  // The draft is fenced by `---` on its own line, opening and closing.
  const openIdx = lines.findIndex(
    (line, i) => i > headingIdx && FENCE.test(line),
  );
  if (openIdx === -1) return null;
  const closeIdx = lines.findIndex(
    (line, i) => i > openIdx && FENCE.test(line),
  );
  if (closeIdx === -1) return null;

  const block = lines.slice(openIdx + 1, closeIdx);
  const subjectIdx = block.findIndex((line) => SUBJECT_LINE.test(line));
  if (subjectIdx === -1) return null;
  const subject = block[subjectIdx].match(SUBJECT_LINE)![1].trim();
  if (!subject) return null;

  // Everything after the Subject line (and its blank separator) is the body,
  // byte-for-byte as approved.
  const body = block
    .slice(subjectIdx + 1)
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\s+$/, '');
  if (!body) return null;

  // A support card names no `Lead #N`, but mailman still needs an Entry ID —
  // without one the send is refused ("per protocol I can't invent an Entry ID")
  // and the approval dies silently. The caller resolves it from the recipient
  // host-side; omitting it is still safe, it just leaves mailman to refuse.
  const leadRef = cardText.match(LEAD_LINE)?.[1] ?? opts.entryId?.toString();
  const original =
    opts.originalMessage?.trim() ||
    'See the approved card in this Slack thread for the operator-facing summary.';

  const text = [
    '[HANDOFF: sales→mailman]',
    `To: ${recipient}`,
    `Subject: ${subject}`,
    ...(leadRef ? [`Entry ID: ${leadRef}`] : []),
    'Original-Message:',
    original,
    '---END-ORIGINAL---',
    'Body:',
    body,
  ].join('\n');

  return { text, recipient, subject, body };
}
