/**
 * Gmail API operations — send, reply, search, read.
 * Host process only; containers use IPC tools that delegate here.
 */

import { gmail_v1 } from 'googleapis';

import { GMAIL_MONITORED_EMAIL, GMAIL_SEND_AS } from './config.js';
import { getGmailClient } from './gmail-auth.js';
import {
  formatEmailForAgent,
  parseEmailBody,
  parseEmailHeaders,
} from './gmail-parser.js';
import { logger } from './logger.js';

/** Build an RFC 2822 message and base64url-encode it. */
function buildRawMessage(opts: {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const lines: string[] = [
    `From: ${GMAIL_SEND_AS}`,
    `To: ${opts.to}`,
  ];
  if (opts.cc) lines.push(`Cc: ${opts.cc}`);
  lines.push(`Subject: ${opts.subject}`);
  if (opts.inReplyTo) {
    lines.push(`In-Reply-To: ${opts.inReplyTo}`);
    lines.push(`References: ${opts.references || opts.inReplyTo}`);
  }
  lines.push('Content-Type: text/plain; charset=utf-8');
  lines.push('');
  lines.push(opts.body);

  const raw = lines.join('\r\n');
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Send a new email. Returns the sent message ID. */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  body: string;
  cc?: string;
}): Promise<string> {
  const gmail = getGmailClient();
  const raw = buildRawMessage(opts);

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });

  logger.info(
    { to: opts.to, subject: opts.subject, messageId: res.data.id },
    'Gmail: email sent',
  );
  return res.data.id || '';
}

/** Reply to an existing thread. Returns the sent message ID. */
export async function replyToThread(opts: {
  threadId: string;
  body: string;
}): Promise<string> {
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
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
      ?.value || '';

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
    inReplyTo: originalMessageId,
    references: originalMessageId,
  });

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, threadId: opts.threadId },
  });

  logger.info(
    { threadId: opts.threadId, to, messageId: res.data.id },
    'Gmail: reply sent',
  );
  return res.data.id || '';
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
