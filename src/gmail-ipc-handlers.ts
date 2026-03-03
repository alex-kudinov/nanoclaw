/**
 * Host-side IPC handlers for Gmail operations.
 * Agent containers write IPC files with gmail_* types;
 * the host IPC watcher dispatches here.
 */

import fs from 'fs';
import path from 'path';

import { ASSISTANT_NAME, DATA_DIR, GMAIL_MONITORED_EMAIL } from './config.js';
import { storeMessageDirect } from './db.js';
import { replyToThread, sendEmail, searchEmails, readEmail } from './gmail-api.js';
import { logger } from './logger.js';

/** Payload shape written by container MCP tools. */
export interface GmailIpcPayload {
  type: 'gmail_reply' | 'gmail_send' | 'gmail_search' | 'gmail_read';
  groupFolder: string;
  timestamp: string;
  // gmail_reply
  threadId?: string;
  body?: string;
  // gmail_send
  to?: string;
  subject?: string;
  cc?: string;
  // gmail_search
  query?: string;
  maxResults?: number;
  // gmail_read
  messageId?: string;
}

const jid = `gmail:${GMAIL_MONITORED_EMAIL}`;

export async function handleGmailReply(data: GmailIpcPayload): Promise<void> {
  if (!data.threadId || !data.body) {
    logger.warn({ data }, 'gmail_reply: missing threadId or body');
    return;
  }

  const sentId = await replyToThread({
    threadId: data.threadId,
    body: data.body,
  });

  // Store outbound in DB for conversation context
  storeMessageDirect({
    id: sentId,
    chat_jid: jid,
    sender: GMAIL_MONITORED_EMAIL,
    sender_name: ASSISTANT_NAME,
    content: data.body,
    timestamp: new Date().toISOString(),
    is_from_me: true,
    is_bot_message: true,
    from_group: data.groupFolder,
    thread_ts: data.threadId,
  });

  logger.info(
    { threadId: data.threadId, sentId, groupFolder: data.groupFolder },
    'gmail_reply processed',
  );
}

export async function handleGmailSend(data: GmailIpcPayload): Promise<void> {
  if (!data.to || !data.subject || !data.body) {
    logger.warn({ data }, 'gmail_send: missing to, subject, or body');
    return;
  }

  const sentId = await sendEmail({
    to: data.to,
    subject: data.subject,
    body: data.body,
    cc: data.cc,
  });

  // Store outbound
  storeMessageDirect({
    id: sentId,
    chat_jid: jid,
    sender: GMAIL_MONITORED_EMAIL,
    sender_name: ASSISTANT_NAME,
    content: `To: ${data.to}\nSubject: ${data.subject}\n\n${data.body}`,
    timestamp: new Date().toISOString(),
    is_from_me: true,
    is_bot_message: true,
    from_group: data.groupFolder,
  });

  logger.info(
    { to: data.to, subject: data.subject, sentId, groupFolder: data.groupFolder },
    'gmail_send processed',
  );
}

export async function handleGmailSearch(
  data: GmailIpcPayload,
): Promise<void> {
  if (!data.query) {
    logger.warn({ data }, 'gmail_search: missing query');
    return;
  }

  const results = await searchEmails({
    query: data.query,
    maxResults: data.maxResults,
  });

  // Write results back to agent's input dir as a follow-up message
  writeInputMessage(data.groupFolder, {
    type: 'gmail_search_results',
    content: results,
    query: data.query,
  });

  logger.info(
    { query: data.query, groupFolder: data.groupFolder },
    'gmail_search processed',
  );
}

export async function handleGmailRead(data: GmailIpcPayload): Promise<void> {
  if (!data.messageId) {
    logger.warn({ data }, 'gmail_read: missing messageId');
    return;
  }

  const content = await readEmail(data.messageId);

  // Write results back to agent's input dir
  writeInputMessage(data.groupFolder, {
    type: 'gmail_read_result',
    content,
    messageId: data.messageId,
  });

  logger.info(
    { messageId: data.messageId, groupFolder: data.groupFolder },
    'gmail_read processed',
  );
}

/** Write a follow-up message to the agent's IPC input directory. */
function writeInputMessage(
  groupFolder: string,
  payload: Record<string, unknown>,
): void {
  const inputDir = path.join(DATA_DIR, 'ipc', groupFolder, 'input');
  fs.mkdirSync(inputDir, { recursive: true });

  const filename = `gmail-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`;
  fs.writeFileSync(
    path.join(inputDir, filename),
    JSON.stringify(payload, null, 2),
    'utf-8',
  );
}

/** Check if a type string is a Gmail IPC type. */
export function isGmailIpcType(type: string): boolean {
  return type.startsWith('gmail_');
}

/** Dispatch a Gmail IPC payload to the appropriate handler. */
export async function dispatchGmailIpc(
  data: GmailIpcPayload,
): Promise<void> {
  switch (data.type) {
    case 'gmail_reply':
      await handleGmailReply(data);
      break;
    case 'gmail_send':
      await handleGmailSend(data);
      break;
    case 'gmail_search':
      await handleGmailSearch(data);
      break;
    case 'gmail_read':
      await handleGmailRead(data);
      break;
    default:
      logger.warn({ type: data.type }, 'Unknown Gmail IPC type');
  }
}
