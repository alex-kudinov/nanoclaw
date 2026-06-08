/**
 * Host-side IPC handlers for Gmail operations.
 * Agent containers write IPC files with gmail_* types;
 * the host IPC watcher dispatches here.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import {
  ASSISTANT_NAME,
  DATA_DIR,
  GMAIL_MONITORED_EMAIL,
  GMAIL_TEST_RECIPIENT,
  TRACKING_DOMAIN,
  UNSUBSCRIBE_BASE_URL,
} from './config.js';
import { insertTrackingPixel, storeMessageDirect } from './db.js';
import { query } from './business-db.js';
import { logOutboundEmailInteraction } from './email-interaction-log.js';
import {
  replyToThread,
  sendEmail,
  searchEmails,
  readEmail,
} from './gmail-api.js';
import { logger } from './logger.js';
import { convertMarkdownToEmailHtml } from './markdown-to-email-html.js';

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
  html?: boolean;
  // gmail_search
  query?: string;
  maxResults?: number;
  // gmail_read
  messageId?: string;
  // open tracking (gmail_send + gmail_reply)
  leadId?: number;
  emailType?: string;
  // markdown conversion (gmail_send + gmail_reply)
  markdown?: boolean;
}

const jid = `gmail:${GMAIL_MONITORED_EMAIL}`;

/**
 * Posts a mechanical [EMAIL SENT] summary to the chief channel. Supplied by
 * ipc.ts (which has sendMessage + registeredGroups in scope). Optional so
 * non-IPC callers and tests can omit it.
 */
export type PostToChief = (text: string, threadTs?: string) => Promise<void>;

/**
 * Resolve a party ID when leadId is not provided in the IPC payload.
 * Tries recipient email first, then falls back to thread history.
 * Returns null if both lookups fail or find nothing.
 */
async function resolvePartyId(
  to?: string,
  threadId?: string,
): Promise<number | null> {
  if (to) {
    try {
      const result = await query<{ id: number | null }>(
        'SELECT business_v2.best_party_by_email($1::citext) AS id',
        [to],
      );
      if (result.rows[0]?.id) return result.rows[0].id;
    } catch (err) {
      logger.error({ to, err }, 'gmail-ipc: party lookup by email failed');
    }
  }
  if (threadId) {
    try {
      const result = await query<{ party_id: number }>(
        `SELECT party_id FROM business_v2.interactions
         WHERE metadata->>'thread_id' = $1
           AND channel = 'email' AND direction = 'outbound'
         ORDER BY occurred_at DESC LIMIT 1`,
        [threadId],
      );
      if (result.rows[0]?.party_id) return result.rows[0].party_id;
    } catch (err) {
      logger.error(
        { threadId, err },
        'gmail-ipc: party lookup by thread failed',
      );
    }
  }
  return null;
}

/** Build email footer with tracking pixel and optional unsubscribe link. */
function buildEmailFooter(trackingId: string, emailType: string): string {
  const pixel = `<img src="https://${TRACKING_DOMAIN}/t/${trackingId}" width="1" height="1" alt="" style="display:none">`;

  // Only add unsubscribe link on follow-ups (not initial outreach)
  if (emailType !== 'follow-up') {
    return `\n${pixel}`;
  }

  const unsubUrl = `${UNSUBSCRIBE_BASE_URL}?t=${trackingId}`;
  return (
    `\n<div style="margin-top:32px;padding-top:12px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;">` +
    `<a href="${unsubUrl}" style="color:#999;">Unsubscribe</a> from follow-up emails</div>` +
    `\n${pixel}`
  );
}

export async function handleGmailReply(
  data: GmailIpcPayload,
  postToChief?: PostToChief,
): Promise<void> {
  if (!data.threadId || !data.body) {
    logger.warn({ data }, 'gmail_reply: missing threadId or body');
    return;
  }

  // Convert body through the markdown→HTML pipeline by default. The pipeline
  // handles both real markdown and plain prose; for plain prose its main job
  // is folding soft-wrap newlines into spaces so Gmail doesn't render them as
  // hard breaks. Skip only when the caller explicitly opts out
  // (markdown:false) or already passes raw HTML (html:true).
  const shouldConvert = data.html !== true && data.markdown !== false;
  if (shouldConvert) {
    const converted = convertMarkdownToEmailHtml(data.body ?? '');
    if (converted) {
      data.body = converted;
      data.html = true;
      logger.debug(
        { groupFolder: data.groupFolder },
        'gmail-ipc: converted markdown to HTML',
      );
    } else {
      logger.warn(
        { groupFolder: data.groupFolder },
        'gmail-ipc: markdown conversion returned empty, using raw body',
      );
    }
  }

  // Inject tracking pixel + unsubscribe footer for HTML replies with lead context
  let bodyForReply = data.body;
  if (data.html && data.leadId) {
    const trackingId = crypto.randomUUID();
    try {
      insertTrackingPixel(trackingId, data.leadId, data.emailType || 'reply');
      bodyForReply += buildEmailFooter(trackingId, data.emailType || 'reply');
    } catch (err) {
      logger.warn(
        { err, leadId: data.leadId },
        'Failed to insert tracking pixel, sending without',
      );
    }
  }

  const result = await replyToThread({
    threadId: data.threadId,
    body: bodyForReply,
    html: data.html,
    cc: data.cc,
  });

  // Store outbound in DB for conversation context
  storeMessageDirect({
    id: result.messageId,
    chat_jid: jid,
    sender: GMAIL_MONITORED_EMAIL,
    sender_name: ASSISTANT_NAME,
    content: data.body, // original body without pixel
    timestamp: new Date().toISOString(),
    is_from_me: true,
    is_bot_message: true,
    from_group: data.groupFolder,
    thread_ts: data.threadId,
  });

  // Log the outbound interaction atomically so the sales follow-up cron
  // sees an up-to-date last_interaction_at. Must not depend on mailman's
  // LLM re-running psql — that round-trip silently drops rows.
  const replyPartyId =
    data.leadId || (await resolvePartyId(undefined, data.threadId));
  if (replyPartyId) {
    if (!data.leadId) {
      logger.warn(
        { threadId: data.threadId, resolvedPartyId: replyPartyId },
        'gmail-ipc: leadId missing, resolved via thread lookup',
      );
    }
    await logOutboundEmailInteraction({
      partyId: replyPartyId,
      emailType: data.emailType || 'reply',
      subject: data.subject || '',
      threadId: result.threadId,
      messageId: result.messageId,
    });
  } else if (!data.leadId) {
    logger.warn(
      { threadId: data.threadId },
      'gmail-ipc: reply leadId missing, no thread history for lookup',
    );
  }

  logger.info(
    {
      threadId: data.threadId,
      sentId: result.messageId,
      groupFolder: data.groupFolder,
    },
    'gmail_reply processed',
  );

  if (postToChief) {
    try {
      await postToChief(
        `[EMAIL SENT] to=${data.to ?? '(thread reply)'} subject=${data.subject ?? '(re: thread)'}`,
      );
    } catch (err) {
      logger.error({ err }, '[ERROR] gmail [EMAIL SENT] post failed');
    }
  }
}

/** Apply test routing: override to/cc when GMAIL_TEST_RECIPIENT is set. */
function applyTestRouting(data: GmailIpcPayload): {
  effectiveTo: string;
  effectiveCc: string | undefined;
  originalTo: string;
  originalCc: string | undefined;
} {
  const originalTo = data.to!;
  const originalCc = data.cc;
  if (!GMAIL_TEST_RECIPIENT) {
    return {
      effectiveTo: originalTo,
      effectiveCc: originalCc,
      originalTo,
      originalCc,
    };
  }
  logger.info(
    { originalTo, originalCc, testRecipient: GMAIL_TEST_RECIPIENT },
    'gmail_send: test routing override — redirecting email',
  );
  return {
    effectiveTo: GMAIL_TEST_RECIPIENT,
    effectiveCc: undefined,
    originalTo,
    originalCc,
  };
}

/** Store outbound email in DB for conversation context. */
function storeOutboundEmail(
  sentId: string,
  originalTo: string,
  subject: string,
  body: string,
  groupFolder: string,
  threadId?: string,
): void {
  storeMessageDirect({
    id: sentId,
    chat_jid: jid,
    sender: GMAIL_MONITORED_EMAIL,
    sender_name: ASSISTANT_NAME,
    content: `To: ${originalTo}\nSubject: ${subject}\n\n${body}`,
    timestamp: new Date().toISOString(),
    is_from_me: true,
    is_bot_message: true,
    from_group: groupFolder,
    thread_ts: threadId,
  });
}

export async function handleGmailSend(
  data: GmailIpcPayload,
  postToChief?: PostToChief,
): Promise<void> {
  if (!data.to || !data.subject || !data.body) {
    logger.warn({ data }, 'gmail_send: missing to, subject, or body');
    return;
  }

  const { effectiveTo, effectiveCc, originalTo } = applyTestRouting(data);

  // Convert body through the markdown→HTML pipeline by default. The pipeline
  // handles both real markdown and plain prose; for plain prose its main job
  // is folding soft-wrap newlines into spaces so Gmail doesn't render them as
  // hard breaks. Skip only when the caller explicitly opts out
  // (markdown:false) or already passes raw HTML (html:true).
  const shouldConvert = data.html !== true && data.markdown !== false;
  if (shouldConvert) {
    const converted = convertMarkdownToEmailHtml(data.body ?? '');
    if (converted) {
      data.body = converted;
      data.html = true;
      logger.debug(
        { groupFolder: data.groupFolder },
        'gmail-ipc: converted markdown to HTML',
      );
    } else {
      logger.warn(
        { groupFolder: data.groupFolder },
        'gmail-ipc: markdown conversion returned empty, using raw body',
      );
    }
  }

  // Inject tracking pixel + unsubscribe footer for HTML emails with lead context
  let bodyForSend = data.body;
  if (data.html && data.leadId) {
    const trackingId = crypto.randomUUID();
    try {
      insertTrackingPixel(trackingId, data.leadId, data.emailType || 'initial');
      bodyForSend += buildEmailFooter(trackingId, data.emailType || 'initial');
    } catch (err) {
      logger.warn(
        { err, leadId: data.leadId },
        'Failed to insert tracking pixel, sending without',
      );
    }
  }

  const result = await sendEmail({
    to: effectiveTo,
    subject: data.subject,
    body: bodyForSend,
    cc: effectiveCc,
    html: data.html,
    threadId: data.threadId,
  });

  storeOutboundEmail(
    result.messageId,
    originalTo,
    data.subject,
    data.body, // original body without pixel
    data.groupFolder,
    result.threadId,
  );

  // Log the outbound interaction atomically so the sales follow-up cron
  // sees an up-to-date last_interaction_at. Must not depend on mailman's
  // LLM re-running psql — that round-trip silently drops rows.
  const sendPartyId =
    data.leadId || (await resolvePartyId(data.to, data.threadId));
  if (sendPartyId) {
    if (!data.leadId) {
      logger.warn(
        { to: data.to, resolvedPartyId: sendPartyId },
        'gmail-ipc: leadId missing, resolved via party lookup',
      );
    }
    await logOutboundEmailInteraction({
      partyId: sendPartyId,
      emailType: data.emailType || 'initial',
      subject: data.subject,
      threadId: result.threadId,
      messageId: result.messageId,
    });
  } else if (!data.leadId) {
    logger.warn(
      { to: data.to, threadId: data.threadId },
      'gmail-ipc: party lookup returned null, skipping interaction log',
    );
  }

  logger.info(
    {
      to: effectiveTo,
      originalTo,
      subject: data.subject,
      sentId: result.messageId,
      threadId: result.threadId,
      groupFolder: data.groupFolder,
    },
    'gmail_send processed',
  );

  if (postToChief) {
    try {
      await postToChief(
        `[EMAIL SENT] to=${originalTo} subject=${data.subject}`,
      );
    } catch (err) {
      logger.error({ err }, '[ERROR] gmail [EMAIL SENT] post failed');
    }
  }
}

export async function handleGmailSearch(data: GmailIpcPayload): Promise<void> {
  if (!data.query) {
    logger.warn({ data }, 'gmail_search: missing query');
    return;
  }

  const results = await searchEmails({
    query: data.query,
    maxResults: data.maxResults,
  });

  // Deliver results back as a follow-up message. The agent-runner's
  // drainIpcInput() only surfaces files with type:'message' — any other type
  // is read, discarded, and deleted, so the result must be a plain message.
  writeInputMessage(data.groupFolder, {
    type: 'message',
    text: `[gmail_search results — query: ${data.query}]\n\n${results}`,
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

  // Deliver the email back as a follow-up message. type:'message' is the only
  // shape the agent-runner's drainIpcInput() surfaces (see handleGmailSearch).
  writeInputMessage(data.groupFolder, {
    type: 'message',
    text: `[gmail_read result — message ${data.messageId}]\n\n${content}`,
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
  postToChief?: PostToChief,
): Promise<void> {
  switch (data.type) {
    case 'gmail_reply':
      await handleGmailReply(data, postToChief);
      break;
    case 'gmail_send':
      await handleGmailSend(data, postToChief);
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
