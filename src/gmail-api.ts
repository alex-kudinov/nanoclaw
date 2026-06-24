/**
 * Gmail API operations — send, reply, search, read.
 * Host process only; containers use IPC tools that delegate here.
 */

import { gmail_v1 } from 'googleapis';

import {
  GMAIL_BCC,
  GMAIL_LABEL,
  GMAIL_MONITORED_EMAIL,
  GMAIL_REPLY_TO,
  GMAIL_SEND_AS,
  TRACKING_DOMAIN,
} from './config.js';
import { getGmailClient } from './gmail-auth.js';
import {
  formatEmailForAgent,
  parseEmailBody,
  parseEmailHeaders,
} from './gmail-parser.js';
import { logger } from './logger.js';

/** Strip CR/LF to prevent header injection in RFC 2822 fields. */
const sanitizeHeader = (s: string): string => s.replace(/[\r\n]/g, '');

/**
 * RFC 2047-encode a header value when it contains non-ASCII characters.
 * Address headers stay routable as 7-bit; free-text headers like Subject
 * survive MUAs that mis-decode raw UTF-8 bytes as Latin-1 (the source of
 * the classic em-dash → "Ã¢Â€Â" mojibake). Splits at codepoint boundaries
 * so multi-byte sequences are never cut. CR/LF is stripped first to keep
 * the header-injection guard.
 */
export function encodeHeaderValue(s: string): string {
  const stripped = s.replace(/[\r\n]/g, '');
  if (/^[\x20-\x7E]*$/.test(stripped) && !stripped.includes('=?')) {
    return stripped;
  }
  const chunks: string[] = [];
  let buf = '';
  let bufLen = 0;
  for (const ch of stripped) {
    const chBytes = Buffer.byteLength(ch, 'utf-8');
    if (bufLen + chBytes > 45) {
      chunks.push(buf);
      buf = ch;
      bufLen = chBytes;
    } else {
      buf += ch;
      bufLen += chBytes;
    }
  }
  if (buf) chunks.push(buf);
  return chunks
    .map((c) => `=?UTF-8?B?${Buffer.from(c, 'utf-8').toString('base64')}?=`)
    .join('\r\n ');
}

/**
 * Detect whether an email body contains an open-tracking pixel.
 * Used to suppress self-BCC/CC, since opening the self-copy fires the
 * tracker and pollutes lead engagement signals with our own opens.
 */
function hasTrackingPixel(body: string): boolean {
  if (!body || !TRACKING_DOMAIN) return false;
  return body.includes(`https://${TRACKING_DOMAIN}/t/`);
}

/**
 * Filter tandemcoach.co addresses out of a comma-separated address list.
 * Returns the cleaned string, or undefined if nothing remains.
 */
function stripTandemAddresses(
  addrList: string | undefined,
): string | undefined {
  if (!addrList) return undefined;
  const kept = addrList
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/tandemcoach\.co/i.test(s));
  return kept.length > 0 ? kept.join(', ') : undefined;
}

/** Cached label ID for GMAIL_LABEL (resolved once per process). */
let cachedLabelId: string | null = null;

/** Apply the MrGru label to a sent message so replies route back to us. */
async function applyLabel(
  gmail: gmail_v1.Gmail,
  messageId: string,
): Promise<void> {
  if (!GMAIL_LABEL) return;
  try {
    if (!cachedLabelId) {
      const res = await gmail.users.labels.list({ userId: 'me' });
      const match = (res.data.labels || []).find(
        (l) => l.name?.toLowerCase() === GMAIL_LABEL.toLowerCase(),
      );
      cachedLabelId = match?.id || null;
    }
    if (!cachedLabelId) {
      logger.warn({ label: GMAIL_LABEL }, 'Gmail label not found, skipping');
      return;
    }
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { addLabelIds: [cachedLabelId] },
    });
  } catch (err) {
    logger.warn({ messageId, err }, 'Failed to apply label to sent message');
  }
}

/** Build an RFC 2822 message and base64url-encode it. */
export function buildRawMessage(opts: {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  html?: boolean;
  inReplyTo?: string;
  references?: string;
}): string {
  // When the body carries an open-tracking pixel, never CC or BCC any
  // tandemcoach.co address — the user inevitably opens the self-copy in
  // their info@ inbox, which fires the tracker and pollutes lead signals.
  const trackingPresent = hasTrackingPixel(opts.body);
  const ccHeader = trackingPresent ? stripTandemAddresses(opts.cc) : opts.cc;
  const bccHeader =
    trackingPresent && GMAIL_BCC && /tandemcoach\.co/i.test(GMAIL_BCC)
      ? undefined
      : GMAIL_BCC;
  if (trackingPresent && (opts.cc !== ccHeader || bccHeader !== GMAIL_BCC)) {
    logger.debug(
      { originalCc: opts.cc, strippedCc: ccHeader, bccDropped: !bccHeader },
      'Tracking pixel detected — suppressed tandemcoach.co BCC/CC',
    );
  }

  const lines: string[] = [
    `From: ${sanitizeHeader(GMAIL_SEND_AS)}`,
    `To: ${sanitizeHeader(opts.to)}`,
  ];
  if (ccHeader) lines.push(`Cc: ${sanitizeHeader(ccHeader)}`);
  if (bccHeader) lines.push(`Bcc: ${sanitizeHeader(bccHeader)}`);
  if (GMAIL_REPLY_TO) lines.push(`Reply-To: ${sanitizeHeader(GMAIL_REPLY_TO)}`);
  lines.push(`Subject: ${encodeHeaderValue(opts.subject)}`);
  if (opts.inReplyTo) {
    lines.push(`In-Reply-To: ${opts.inReplyTo}`);
    lines.push(`References: ${opts.references || opts.inReplyTo}`);
  }

  const contentType = opts.html ? 'text/html' : 'text/plain';
  lines.push(`Content-Type: ${contentType}; charset=utf-8`);
  lines.push('');

  lines.push(opts.body);

  const raw = lines.join('\r\n');
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Send a new email. Optionally thread into an existing conversation. */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  html?: boolean;
  threadId?: string;
}): Promise<{ messageId: string; threadId: string }> {
  const gmail = getGmailClient();

  // When threading into an existing conversation, fetch In-Reply-To for proper threading
  let inReplyTo: string | undefined;
  let references: string | undefined;
  if (opts.threadId) {
    try {
      const thread = await gmail.users.threads.get({
        userId: 'me',
        id: opts.threadId,
        format: 'metadata',
        metadataHeaders: ['Message-ID'],
      });
      const messages = thread.data.messages || [];
      if (messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        const headers = lastMsg.payload?.headers || [];
        const msgId = headers.find(
          (h) => h.name?.toLowerCase() === 'message-id',
        )?.value;
        if (msgId) {
          inReplyTo = msgId;
          references = msgId;
        }
      }
    } catch (err) {
      logger.warn(
        { threadId: opts.threadId, err },
        'Failed to fetch thread for In-Reply-To, sending without threading headers',
      );
    }
  }

  const raw = buildRawMessage({
    ...opts,
    inReplyTo,
    references,
  });

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, ...(opts.threadId ? { threadId: opts.threadId } : {}) },
  });

  const sentId = res.data.id || '';
  const sentThreadId = res.data.threadId || opts.threadId || '';
  await applyLabel(gmail, sentId);

  logger.info(
    {
      to: opts.to,
      subject: opts.subject,
      messageId: sentId,
      threadId: sentThreadId,
    },
    'Gmail: email sent',
  );
  return { messageId: sentId, threadId: sentThreadId };
}

/** Reply to an existing thread. */
export async function replyToThread(opts: {
  threadId: string;
  body: string;
  html?: boolean;
  cc?: string;
}): Promise<{
  messageId: string;
  threadId: string;
  to: string;
  subject: string;
}> {
  const gmail = getGmailClient();

  // Fetch the thread to get the last message's headers for In-Reply-To
  const thread = await gmail.users.threads.get({
    userId: 'me',
    id: opts.threadId,
    format: 'metadata',
    metadataHeaders: ['From', 'To', 'Reply-To', 'Subject', 'Message-ID'],
  });

  const messages = thread.data.messages || [];
  if (messages.length === 0) {
    throw new Error(`Thread ${opts.threadId} has no messages`);
  }

  // Anchor threading (In-Reply-To / References / Subject) to the genuine last
  // message, but address the reply to the most recent EXTERNAL party — not
  // simply the last sender. When our own outbound is the newest message in the
  // thread (a prior reply, or a forward to a colleague), replying to its From
  // self-addresses the email to info@tandemcoach.co and the customer never
  // receives it. See the Liz Dobbins login thread, 2026-06-13.
  const header = (
    hs: gmail_v1.Schema$MessagePartHeader[],
    name: string,
  ): string =>
    hs.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
  const headersOf = (m: gmail_v1.Schema$Message) => m.payload?.headers || [];

  const lastMsg = messages[messages.length - 1];
  const originalSubject = header(headersOf(lastMsg), 'Subject');
  const originalMessageId = header(headersOf(lastMsg), 'Message-ID');

  const owned = ownedAddresses();
  const isExternal = (addr: string): boolean =>
    addr.length > 0 && !owned.has(bareAddress(addr).toLowerCase());

  // Bounce/system senders (mailer-daemon, postmaster) are "external" but must
  // never be a reply target — a failed delivery notification lands as the
  // newest message in the thread, and replying to it just dead-letters again.
  // See the Marvita Franklin thread, 2026-06-16: our reply bounced off the
  // Encharge relay, and the resulting mailer-daemon message would otherwise
  // capture the next reply.
  const isBounceAddress = (addr: string): boolean =>
    /^(mailer-daemon|postmaster)@/i.test(bareAddress(addr));
  const isAddressable = (addr: string): boolean =>
    isExternal(addr) && !isBounceAddress(addr);

  // Where a message wants replies sent: honor its Reply-To if present, else
  // fall back to From. Relays (Encharge, list servers) put their own bounce
  // address in From (no-reply@encharge.com) and the real human in Reply-To —
  // replying to From sends into a black hole.
  const replyTargetOf = (m: gmail_v1.Schema$Message): string =>
    header(headersOf(m), 'Reply-To') || header(headersOf(m), 'From');

  // Newest message whose reply target is an addressable external party.
  let to = '';
  for (let i = messages.length - 1; i >= 0 && !to; i--) {
    const target = replyTargetOf(messages[i]);
    if (isAddressable(target)) to = target;
  }
  if (!to) {
    // Whole thread is ours — reply to the last external recipient we wrote to.
    for (let i = messages.length - 1; i >= 0 && !to; i--) {
      const ext = header(headersOf(messages[i]), 'To')
        .split(',')
        .map((s) => s.trim())
        .find(isAddressable);
      if (ext) to = ext;
    }
  }
  if (!to) {
    to = header(headersOf(lastMsg), 'From');
    logger.warn(
      { threadId: opts.threadId },
      'reply: no external party in thread; self-addressing as last resort',
    );
  }

  const subject = originalSubject.startsWith('Re:')
    ? originalSubject
    : `Re: ${originalSubject}`;

  const raw = buildRawMessage({
    to,
    subject,
    body: opts.body,
    cc: opts.cc,
    html: opts.html,
    inReplyTo: originalMessageId,
    references: originalMessageId,
  });

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, threadId: opts.threadId },
  });

  const sentId = res.data.id || '';
  await applyLabel(gmail, sentId);

  logger.info(
    { threadId: opts.threadId, to, messageId: sentId },
    'Gmail: reply sent',
  );
  return { messageId: sentId, threadId: opts.threadId, to, subject };
}

/** Search emails. Returns formatted results for agent consumption. */
export async function searchEmails(opts: {
  query: string;
  maxResults?: number;
}): Promise<string> {
  const gmail = getGmailClient();
  const maxResults = opts.maxResults || 10;

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: opts.query,
    maxResults,
  });

  const refs = listRes.data.messages || [];
  if (refs.length === 0) return 'No results found.';

  const results: string[] = [];
  for (const ref of refs) {
    if (!ref.id) continue;
    const summary = await getEmailSummary(gmail, ref.id);
    results.push(summary);
  }

  return results.join('\n---\n');
}

/** Strip a leading display name, leaving the bare address. */
function bareAddress(to: string): string {
  const angle = /<([^>]+)>/.exec(to);
  return (angle ? angle[1] : to).trim();
}

/**
 * Lowercased bare addresses this mailbox sends as, replies as, BCCs, or
 * monitors. A reply must never be addressed to one of these — doing so
 * boomerangs the email into our own inbox and the real recipient never
 * receives it. Drives external-party selection in replyToThread.
 */
function ownedAddresses(): Set<string> {
  return new Set(
    [GMAIL_SEND_AS, GMAIL_REPLY_TO, GMAIL_BCC, GMAIL_MONITORED_EMAIL]
      .filter(Boolean)
      .flatMap((v) => v.split(','))
      .map((v) => bareAddress(v).toLowerCase())
      .filter((v) => v.length > 0),
  );
}

/** Strip leading Re:/Fwd: prefixes, returning the base subject. */
function baseSubject(subject: string): string {
  return subject.replace(/^\s*((re|fwd?):\s*)+/i, '').trim();
}

/**
 * Recover the Gmail thread a reply belongs to when its Thread-ID was lost
 * upstream. Scoped to the recipient AND the base subject (Re:/Fwd: stripped),
 * newest first, so it re-attaches to the right conversation rather than any
 * recent thread. Returns null when nothing confidently matches — callers then
 * fall back to a standalone send. See the Carol Del Priore refund (2026-06-09):
 * a dropped Thread-ID made a refund reply start a detached thread.
 */
export async function findThreadForReply(opts: {
  to: string;
  subject: string;
}): Promise<string | null> {
  const base = baseSubject(opts.subject);
  const addr = bareAddress(opts.to);
  if (!base || !addr) return null;
  const gmail = getGmailClient();
  const q = `subject:"${base.replace(/"/g, '')}" {to:${addr} from:${addr}}`;
  try {
    const res = await gmail.users.threads.list({
      userId: 'me',
      q,
      maxResults: 1,
    });
    return res.data.threads?.[0]?.id || null;
  } catch (err) {
    logger.warn({ to: addr, err }, 'findThreadForReply lookup failed');
    return null;
  }
}

/** Read a single email by message ID. Returns formatted content. */
export async function readEmail(messageId: string): Promise<string> {
  const gmail = getGmailClient();
  return getEmailSummary(gmail, messageId);
}

async function getEmailSummary(
  gmail: gmail_v1.Gmail,
  messageId: string,
): Promise<string> {
  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const msg = res.data;
  if (!msg.payload) return `[Message ${messageId}: no payload]`;

  const headers = parseEmailHeaders(msg.payload.headers || []);
  const body = parseEmailBody(msg.payload);

  return (
    `ID: ${messageId}\nThread: ${msg.threadId || 'unknown'}\n` +
    formatEmailForAgent(headers, body)
  );
}
