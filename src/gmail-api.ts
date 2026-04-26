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
  lines.push(`Subject: ${sanitizeHeader(opts.subject)}`);
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
}): Promise<{ messageId: string; threadId: string }> {
  const gmail = getGmailClient();

  // Fetch the thread to get the last message's headers for In-Reply-To
  const thread = await gmail.users.threads.get({
    userId: 'me',
    id: opts.threadId,
    format: 'metadata',
    metadataHeaders: ['From', 'To', 'Subject', 'Message-ID'],
  });

  const messages = thread.data.messages || [];
  if (messages.length === 0) {
    throw new Error(`Thread ${opts.threadId} has no messages`);
  }

  const lastMsg = messages[messages.length - 1];
  const headers = lastMsg.payload?.headers || [];
  const get = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ||
    '';

  const originalFrom = get('From');
  const originalSubject = get('Subject');
  const originalMessageId = get('Message-ID');

  // Reply goes to the original sender
  const to = originalFrom;
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
  return { messageId: sentId, threadId: opts.threadId };
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
