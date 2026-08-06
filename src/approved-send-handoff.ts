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
const CARD_MARKER =
  /^\s*\[(?:SALES REVIEW|CLIENT SUPPORT REVIEW|SUPPORT-DRAFT|FOLLOW-UP\s+#\d+)\]/m;
const EMAIL_LINE = /^\s*(?:Email|To)\s*:\s*([^\s<>,;]+@[^\s<>,;]+)\s*$/im;
const LEAD_LINE = /\[(?:SALES REVIEW|FOLLOW-UP\s+#\d+)\]\s*Lead\s*#\s*(\d+)/i;
const ACTION_LINE = /^\s*Action-ID\s*:\s*(\S+)\s*$/im;
const THREAD_LINE = /^\s*Thread-ID\s*:\s*(\S+)\s*$/im;
const FOLLOW_UP_LINE = /^\s*Follow-Up\s*:\s*true\s*$/im;
/**
 * Sales writes `DRAFT RESPONSE TO LEAD:`, client support writes
 * `DRAFT RESPONSE:`. Both fence the sendable draft identically.
 */
const DRAFT_HEADING = /^\s*DRAFT (?:RESPONSE(?: TO LEAD)?|FOLLOW-UP):\s*$/im;
const FENCE = /^\s*---\s*$/;
const SUBJECT_LINE = /^\s*Subject\s*:\s*(.+?)\s*$/im;

/** Keep the pre-approval gate and approval watchdog on one marker surface. */
export function isApprovalCard(text: string): boolean {
  return CARD_MARKER.test(text);
}

/** One operator-visible vocabulary for every fail-closed approval-card path. */
export function approvalCardRejectedText(
  authorName: string,
  reason: string,
): string {
  return `🚫 [APPROVAL CARD REJECTED] ${reason} ${authorName} must repost the full corrected card.`;
}

/** Parse only the exact, labelled recipient field from an approval-card header. */
export function parseApprovalCardRecipient(text: string): string | undefined {
  const lines = text.split(/\r?\n/);
  const boundary = lines.findIndex(
    (line) => DRAFT_HEADING.test(line) || FENCE.test(line),
  );
  const header = lines
    .slice(0, boundary === -1 ? lines.length : boundary)
    .join('\n');
  return header.match(EMAIL_LINE)?.[1]?.toLowerCase();
}

export interface ApprovedHandoff {
  /** Canonical `[HANDOFF: sales→mailman]` text, ready to write as an IPC message. */
  text: string;
  /** Normalized recipient, for deduplicating against the pending-send row. */
  recipient: string;
  subject: string;
  body: string;
  emailType: 'initial' | 'follow-up';
  gmailThreadId?: string;
}

export interface ParsedMailmanHandoff extends ApprovedHandoff {
  actionId?: string;
}

function parseSubjectAndBody(
  text: string,
): { subject: string; body: string } | undefined {
  const lines = text.split('\n');
  const originalBoundary = lines.findIndex((line) =>
    /^\s*---END-ORIGINAL---\s*$/.test(line),
  );
  const bodyHeading = lines.findIndex(
    (line, index) => index > originalBoundary && /^\s*Body\s*:\s*$/i.test(line),
  );
  if (bodyHeading === -1) return undefined;
  const subject = text.match(SUBJECT_LINE)?.[1]?.trim();
  if (!subject) return undefined;
  const body = lines
    .slice(bodyHeading + 1)
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\s+$/, '');
  return body ? { subject, body } : undefined;
}

/** Parse the exact sendable fields from a routed Mailman handoff. */
export function parseMailmanHandoff(text: string): ParsedMailmanHandoff | null {
  if (!/^\s*\[HANDOFF:\s*[a-z0-9_-]+\s*(?:→|->)\s*mailman\]/im.test(text)) {
    return null;
  }
  const recipient = text.match(EMAIL_LINE)?.[1]?.toLowerCase();
  const parsed = parseSubjectAndBody(text);
  if (!recipient || !parsed) return null;
  return {
    text,
    recipient,
    subject: parsed.subject,
    body: parsed.body,
    emailType: FOLLOW_UP_LINE.test(text) ? 'follow-up' : 'initial',
    gmailThreadId: text.match(THREAD_LINE)?.[1],
    actionId: text.match(ACTION_LINE)?.[1],
  };
}

/**
 * Parse an approved card into a sendable handoff, or null when anything is
 * missing or ambiguous. Null always means "leave it to the operator" — this
 * function must never guess at customer-facing content.
 */
export function buildApprovedHandoff(
  cardText: string,
  opts: {
    originalMessage?: string;
    entryId?: number;
    actionId?: string;
    sourceGroup?: string;
  } = {},
): ApprovedHandoff | null {
  const cardMarker = cardText.match(CARD_MARKER)?.[0];
  if (!cardMarker) return null;

  const recipient = parseApprovalCardRecipient(cardText);
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
  const sourceGroup = /^[a-z0-9_-]+$/i.test(opts.sourceGroup ?? '')
    ? opts.sourceGroup!.toLowerCase()
    : 'sales';
  const header = lines.slice(0, headingIdx).join('\n');
  const emailType = /^\s*\[FOLLOW-UP\s+#\d+\]/.test(cardMarker)
    ? 'follow-up'
    : 'initial';
  const gmailThreadId = header.match(THREAD_LINE)?.[1];
  if (emailType === 'follow-up' && !gmailThreadId) return null;

  const text = [
    `[HANDOFF: ${sourceGroup}→mailman]`,
    `To: ${recipient}`,
    `Subject: ${subject}`,
    ...(opts.actionId ? [`Action-ID: ${opts.actionId}`] : []),
    ...(leadRef ? [`Entry ID: ${leadRef}`] : []),
    ...(gmailThreadId ? [`Thread-ID: ${gmailThreadId}`] : []),
    ...(emailType === 'follow-up' ? ['Follow-Up: true'] : []),
    'Original-Message:',
    original,
    '---END-ORIGINAL---',
    'Body:',
    body,
  ].join('\n');

  return { text, recipient, subject, body, emailType, gmailThreadId };
}
