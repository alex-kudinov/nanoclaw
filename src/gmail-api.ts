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
import { assertExternalWriteAllowed } from './action-safety.js';
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

function normalizeAddress(value: string): string {
  return (value.match(/<([^>]+)>/)?.[1] ?? value).trim().toLowerCase();
}

function addressListContains(
  list: string | undefined,
  candidate: string | undefined,
): boolean {
  if (!list || !candidate) return false;
  const normalizedCandidate = normalizeAddress(candidate);
  return list.split(',').map(normalizeAddress).includes(normalizedCandidate);
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
/**
 * Fold a structured header value (e.g. References — a space-separated list of
 * msg-ids) so no physical line exceeds RFC 5322 §2.2.3's limit. Breaks only at
 * token boundaries (never inside a msg-id); continuation lines begin with a
 * space (folding whitespace). An over-long unfolded References line makes some
 * MTAs reject or truncate it, which detaches the thread in the recipient's
 * client. Short values return unfolded.
 */
export function foldHeaderValue(name: string, value: string): string {
  const tokens = value.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = `${name}:`;
  for (const t of tokens) {
    if (line !== `${name}:` && line.length + 1 + t.length > 78) {
      out.push(line);
      line = ` ${t}`;
    } else {
      line += ` ${t}`;
    }
  }
  out.push(line);
  return out.join('\r\n');
}

/**
 * Build RFC 5322 threading headers from a Gmail thread's messages so a reply
 * threads in BOTH Gmail's UI and the recipient's external client. `inReplyTo`
 * is the NEWEST message that actually carries a Message-ID — we walk back past
 * any message missing the header, because an empty Message-ID on the last
 * message makes buildRawMessage's `if (opts.inReplyTo)` guard falsy and
 * silently drops both threading headers: the reply then threads via the Gmail
 * threadId alone (Gmail's own UI) but DETACHES in external clients — the
 * recurring "went out under a different header" symptom. `references` is the
 * full ordered chain of every Message-ID present (external clients thread on
 * References). Returns {} only when the thread exposes NO Message-ID at all
 * (logged at error — that reply may detach).
 */
export function threadHeaders(
  messages: gmail_v1.Schema$Message[],
  threadId: string,
): { inReplyTo?: string; references?: string } {
  const ids: string[] = [];
  for (const m of messages) {
    const v = (m.payload?.headers || []).find(
      (h) => h.name?.toLowerCase() === 'message-id',
    )?.value;
    if (v && v.trim()) ids.push(v.trim());
  }
  if (ids.length === 0) {
    logger.error(
      { threadId },
      'Gmail threading: thread exposes no Message-ID — reply threads in Gmail but may detach in external clients',
    );
    return {};
  }
  return { inReplyTo: ids[ids.length - 1], references: ids.join(' ') };
}

/**
 * Fetch a thread's threading headers for the outbound send path, with one retry
 * on a transient Gmail error so a flaky metadata fetch does not silently ship a
 * detached email.
 */
async function fetchThreadHeaders(
  gmail: gmail_v1.Gmail,
  threadId: string,
): Promise<{ inReplyTo?: string; references?: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const thread = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'metadata',
        metadataHeaders: ['Message-ID'],
      });
      return threadHeaders(thread.data.messages || [], threadId);
    } catch (err) {
      if (attempt === 1) {
        logger.error(
          { threadId, err },
          'Gmail threading: thread fetch failed after retry — reply may detach',
        );
        return {};
      }
    }
  }
  return {};
}

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
      : addressListContains(ccHeader, GMAIL_BCC)
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
    lines.push(
      foldHeaderValue('References', opts.references || opts.inReplyTo),
    );
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
export async function sendEmail(
  opts: {
    to: string;
    subject: string;
    body: string;
    cc?: string;
    html?: boolean;
    threadId?: string;
  },
  deps?: {
    /** Production defaults to getGmailClient; the installed safety drill injects a no-network tripwire. */
    getClient?: () => gmail_v1.Gmail;
  },
): Promise<{ messageId: string; threadId: string }> {
  assertExternalWriteAllowed({
    system: 'gmail',
    actionClass: 'c3_external_communication',
    source: 'host:gmail-api',
  });
  const gmail = deps?.getClient ? deps.getClient() : getGmailClient();

  // When threading into an existing conversation, derive the RFC In-Reply-To /
  // References from the thread so the reply threads in the recipient's external
  // client too — the Gmail threadId alone only threads Gmail's own UI. Robust
  // to an empty last-message Message-ID and a transient fetch failure (see
  // threadHeaders / fetchThreadHeaders).
  let inReplyTo: string | undefined;
  let references: string | undefined;
  if (opts.threadId) {
    ({ inReplyTo, references } = await fetchThreadHeaders(
      gmail,
      opts.threadId,
    ));
  }

  const raw = buildRawMessage({
    ...opts,
    inReplyTo,
    references,
  });

  // Re-check at the final mutation boundary. Reads above deliberately remain
  // available in safe mode; a brake applied during preparation still wins.
  assertExternalWriteAllowed({
    system: 'gmail',
    actionClass: 'c3_external_communication',
    source: 'host:gmail-api',
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
export async function replyToThread(
  opts: {
    threadId: string;
    body: string;
    html?: boolean;
    cc?: string;
    recipientOverride?: string;
    prepareSend?: (recipients: {
      to: string;
      cc?: string;
    }) => Promise<{ body: string }>;
  },
  deps?: {
    /** Production defaults to getGmailClient; the installed safety drill injects a synthetic read/send tripwire client. */
    getClient?: () => gmail_v1.Gmail;
  },
): Promise<{
  messageId: string;
  threadId: string;
  to: string;
  originalTo: string;
  subject: string;
}> {
  const gmail = deps?.getClient ? deps.getClient() : getGmailClient();

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

  // Give the host policy the Gmail-derived external recipient before any
  // message is constructed or sent. In test mode the policy still validates
  // the real intended recipient, then the actual delivery is redirected.
  const prepared = await opts.prepareSend?.({ to, cc: opts.cc });
  const effectiveTo = opts.recipientOverride || to;
  const effectiveCc = opts.recipientOverride ? undefined : opts.cc;

  const raw = buildRawMessage({
    to: effectiveTo,
    subject,
    body: prepared?.body ?? opts.body,
    cc: effectiveCc,
    html: opts.html,
    // Full RFC threading chain from the thread's Message-IDs, resilient to an
    // empty last-message Message-ID (walks back) — so the reply threads in the
    // recipient's external client, not only Gmail's UI.
    ...threadHeaders(messages, opts.threadId),
  });

  assertExternalWriteAllowed({
    system: 'gmail',
    actionClass: 'c3_external_communication',
    source: 'host:gmail-api',
  });
  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, threadId: opts.threadId },
  });

  const sentId = res.data.id || '';
  await applyLabel(gmail, sentId);

  logger.info(
    {
      threadId: opts.threadId,
      to: effectiveTo,
      originalTo: to,
      testRouted: Boolean(opts.recipientOverride),
      messageId: sentId,
    },
    'Gmail: reply sent',
  );
  return {
    messageId: sentId,
    threadId: opts.threadId,
    to: effectiveTo,
    originalTo: to,
    subject,
  };
}

/**
 * Fetch an entire Gmail thread by ID and format every message for the agent.
 *
 * `thread:<id>` is NOT a valid Gmail SEARCH operator — messages.list treats it
 * as free text and returns zero matches. The only way to pull a thread by id is
 * threads.get. searchEmails() routes any `thread:` query here, and the
 * gmail_get_thread tool calls this directly. Returns a not-found string (never
 * throws) so callers degrade gracefully.
 */
export async function getThread(threadId: string): Promise<string> {
  const gmail = getGmailClient();
  let messages: gmail_v1.Schema$Message[] = [];
  try {
    const res = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'full',
    });
    messages = res.data.messages || [];
  } catch (err) {
    logger.warn({ threadId, err }, 'getThread: thread fetch failed');
    return `No thread found for ID ${threadId}.`;
  }
  if (messages.length === 0) return `No thread found for ID ${threadId}.`;

  const parts = messages.map((m) => {
    const headers = parseEmailHeaders(m.payload?.headers || []);
    const body = m.payload ? parseEmailBody(m.payload) : '';
    return formatEmailForAgent(
      headers,
      body,
      m.threadId || threadId,
      m.id || undefined,
    );
  });
  return (
    `Thread ${threadId} — ${messages.length} message(s):\n\n` +
    parts.join('\n---\n')
  );
}

/** Extract a thread id from a `thread:<id>` token, ignoring case and quotes. */
export function extractThreadQuery(query: string): string | null {
  const m = /(?:^|\s)thread:("?)([^\s"]+)\1/i.exec(query);
  return m ? m[2] : null;
}

/** Search emails. Returns formatted results for agent consumption. */
export async function searchEmails(opts: {
  query: string;
  maxResults?: number;
}): Promise<string> {
  const gmail = getGmailClient();
  const maxResults = opts.maxResults || 10;

  // `thread:<id>` is not a Gmail search operator — left as-is it returns zero
  // results and the caller (e.g. the sales follow-up run) silently drafts blind
  // or invents an "account mismatch". Route it to threads.get instead. See the
  // 5-lead follow-up false alarm, 2026-06-26.
  const threadId = extractThreadQuery(opts.query);
  if (threadId) return getThread(threadId);

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
