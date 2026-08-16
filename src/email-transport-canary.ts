/**
 * Host-only Gmail transport canary.
 *
 * This intentionally does not enter the customer action path: its destination
 * is the configured monitored mailbox itself, its content is fixed by the
 * host, and it writes no message/business/action record. It proves only that
 * the activated release can authenticate to Gmail, submit one internal
 * message, and retrieve Gmail's durable receipt.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GMAIL_MONITORED_EMAIL,
  GMAIL_REPLY_TO,
  GMAIL_SEND_AS,
} from './config.js';
import { assertExternalWriteAllowed } from './action-safety.js';
import { getGmailClient } from './gmail-auth.js';

const CANARY_CONFIRMATION = 'NC-009-INTERNAL-TRANSPORT-CANARY';

function cleanHeader(value: string): string {
  return value.replace(/[\r\n]/g, '');
}

export function buildTransportCanaryRaw(opts: {
  to: string;
  from: string;
  replyTo: string;
  commit: string;
  nonce: string;
  sentAt: string;
}): string {
  const subject = `[NanoClaw internal transport canary] ${opts.commit.slice(0, 12)}`;
  const body = [
    'Internal NanoClaw transport canary.',
    `Release: ${opts.commit}`,
    `Nonce: ${opts.nonce}`,
    `Sent-At: ${opts.sentAt}`,
    'No customer action or business record is associated with this message.',
  ].join('\r\n');
  const raw = [
    `From: ${cleanHeader(opts.from)}`,
    `To: ${cleanHeader(opts.to)}`,
    `Reply-To: ${cleanHeader(opts.replyTo)}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

interface CanaryGmail {
  users: {
    messages: {
      send(opts: {
        userId: string;
        requestBody: { raw: string };
      }): Promise<{ data: { id?: string | null; threadId?: string | null } }>;
      get(opts: {
        userId: string;
        id: string;
        format: 'minimal';
      }): Promise<{ data: { id?: string | null; threadId?: string | null } }>;
    };
  };
}

export async function runEmailTransportCanary(opts: {
  gmail: CanaryGmail;
  recipient: string;
  from: string;
  replyTo: string;
  commit: string;
  nonce: string;
  sentAt: string;
}): Promise<{
  messageId: string;
  threadId: string;
  recipientSha256: string;
}> {
  if (!/^[^\s@]+@[^\s@]+$/.test(opts.recipient)) {
    throw new Error(
      'email transport canary requires a valid monitored mailbox',
    );
  }
  if (!/^[0-9a-f]{40}$/i.test(opts.commit)) {
    throw new Error('email transport canary requires an exact release commit');
  }
  assertExternalWriteAllowed({
    system: 'gmail',
    actionClass: 'c3_external_communication',
    source: 'host:gmail-transport-canary',
  });
  const sent = await opts.gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: buildTransportCanaryRaw({ ...opts, to: opts.recipient }),
    },
  });
  const messageId = sent.data.id || '';
  const threadId = sent.data.threadId || '';
  if (!messageId || !threadId) {
    throw new Error('Gmail accepted the canary without a complete receipt');
  }
  let durable: { data: { id?: string | null; threadId?: string | null } };
  try {
    durable = await opts.gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'minimal',
    });
  } catch (err) {
    throw new Error(
      `Gmail accepted internal canary ${messageId}/${threadId}, but receipt retrieval failed; do not rerun blindly: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (durable.data.id !== messageId || durable.data.threadId !== threadId) {
    throw new Error(
      `Gmail accepted internal canary ${messageId}/${threadId}, but the retrieved receipt did not match; do not rerun blindly`,
    );
  }
  return {
    messageId,
    threadId,
    recipientSha256: crypto
      .createHash('sha256')
      .update(opts.recipient.toLowerCase())
      .digest('hex'),
  };
}

async function main(): Promise<void> {
  if (process.env.NANOCLAW_EMAIL_CANARY_CONFIRM !== CANARY_CONFIRMATION) {
    throw new Error(
      `set NANOCLAW_EMAIL_CANARY_CONFIRM=${CANARY_CONFIRMATION} to authorize one internal canary`,
    );
  }
  if (!GMAIL_MONITORED_EMAIL) {
    throw new Error('GMAIL_MONITORED_EMAIL is not configured');
  }
  const manifestPath = path.join(
    process.cwd(),
    'dist',
    'release-manifest.json',
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    commit?: string;
  };
  const receipt = await runEmailTransportCanary({
    gmail: getGmailClient(),
    recipient: GMAIL_MONITORED_EMAIL,
    from: GMAIL_SEND_AS,
    replyTo: GMAIL_REPLY_TO,
    commit: manifest.commit || '',
    nonce: crypto.randomUUID(),
    sentAt: new Date().toISOString(),
  });
  process.stdout.write(`${JSON.stringify({ ok: true, ...receipt })}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  main().catch((err) => {
    process.stderr.write(
      `email transport canary failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
  });
}
