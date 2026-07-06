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
  getThread,
  findThreadForReply,
} from './gmail-api.js';
import { logger } from './logger.js';
import { convertMarkdownToEmailHtml } from './markdown-to-email-html.js';
import { checkRecipient } from './email-recipient-guard.js';
import { checkContent } from './email-content-guard.js';

/** Payload shape written by container MCP tools. */
export interface GmailIpcPayload {
  type:
    | 'gmail_reply'
    | 'gmail_send'
    | 'gmail_search'
    | 'gmail_read'
    | 'gmail_get_thread';
  groupFolder: string;
  timestamp: string;
  // gmail_reply + gmail_get_thread
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

/**
 * The set of addresses we know belong to a party (primary_email + party_emails),
 * lowercased. Used to reject an agent-fabricated recipient before sending. Fails
 * open (empty set) on error so a DB hiccup can't block legitimate mail — the
 * reserved-domain check in checkRecipient still applies.
 */
async function getPartyEmails(partyId: number): Promise<Set<string>> {
  try {
    const res = await query<{ email: string }>(
      `SELECT lower(primary_email::text) AS email FROM business_v2.parties
         WHERE id = $1 AND primary_email IS NOT NULL
       UNION
       SELECT lower(email::text) AS email FROM business_v2.party_emails
         WHERE party_id = $1`,
      [partyId],
    );
    return new Set(res.rows.map((r) => r.email).filter(Boolean));
  } catch (err) {
    logger.error({ err, partyId }, 'gmail-ipc: party email lookup failed');
    return new Set();
  }
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

  // Content guard (P2): discount offers, non-whitelisted links, unfilled
  // placeholders. Runs on the agent's raw composition, before conversion.
  const replyContentCheck = checkContent(data.subject || '', data.body);
  if (!replyContentCheck.ok) {
    logger.error(
      { threadId: data.threadId, violations: replyContentCheck.violations },
      'gmail_reply BLOCKED: content failed validation',
    );
    if (postToChief) {
      await postToChief(
        `🚫 [EMAIL BLOCKED] reply thread=${data.threadId} — content guard: ${replyContentCheck.violations.join('; ')}. NOT sent; fix the draft and resend.`,
      );
    }
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
        `[EMAIL SENT] to=${result.to || data.to || '(unknown)'} subject=${result.subject || data.subject || '(no subject)'}`,
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

/**
 * Recover a dropped Thread-ID before a standalone send. A `Re:` subject means
 * the agent intends a reply; if no threadId came through (e.g. lost across a
 * multi-turn Slack approval — Carol Del Priore refund, 2026-06-09), gmail_send
 * would start a detached thread. Re-resolve the recipient's matching thread so
 * the reply lands in the conversation it belongs to. Returns the original
 * threadId untouched when present, undefined for a genuine first-contact (a
 * new-lead subject never starts with `Re:`).
 */
async function resolveSendThreadId(
  threadId: string | undefined,
  to: string,
  subject: string,
  groupFolder: string,
): Promise<string | undefined> {
  if (threadId) return threadId;
  if (!/^\s*re:/i.test(subject)) return undefined;
  const recovered = await findThreadForReply({ to, subject });
  if (recovered) {
    logger.warn(
      { to, subject, recoveredThreadId: recovered, groupFolder },
      'gmail_send: Thread-ID missing on Re: subject — re-attached to existing thread (safety net)',
    );
    return recovered;
  }
  logger.warn(
    { to, subject, groupFolder },
    'gmail_send: Re: subject with no Thread-ID and no matching thread — sending standalone',
  );
  return undefined;
}

export async function handleGmailSend(
  data: GmailIpcPayload,
  postToChief?: PostToChief,
): Promise<{ messageId: string; threadId: string } | undefined> {
  if (!data.to || !data.subject || !data.body) {
    logger.warn({ data }, 'gmail_send: missing to, subject, or body');
    return undefined;
  }

  // Recipient guard: an agent composes the To: for contact-form replies (no
  // thread to reply into), so it can fabricate a placeholder or wrong address —
  // the tina@example.com incident (2026-06-29). Validate against reserved
  // domains always, and against the party's known emails when we have a Party ID.
  // A failure is NOT sent; it is surfaced to chief for a human to correct.
  const knownEmails = data.leadId
    ? await getPartyEmails(data.leadId)
    : undefined;
  const recipientCheck = checkRecipient(data.to, knownEmails);
  if (!recipientCheck.ok) {
    logger.error(
      {
        to: data.to,
        leadId: data.leadId,
        subject: data.subject,
        reason: recipientCheck.reason,
      },
      'gmail_send BLOCKED: recipient failed validation',
    );
    if (postToChief) {
      await postToChief(
        `🚫 [EMAIL BLOCKED] to=${data.to} subject=${data.subject} — ${recipientCheck.reason}. NOT sent; verify the recipient and resend.`,
      );
    }
    return undefined;
  }

  // Content guard (P2): discount offers, non-whitelisted links, unfilled
  // placeholders. Runs on the agent's raw composition, before conversion.
  const contentCheck = checkContent(data.subject, data.body);
  if (!contentCheck.ok) {
    logger.error(
      {
        to: data.to,
        subject: data.subject,
        violations: contentCheck.violations,
      },
      'gmail_send BLOCKED: content failed validation',
    );
    if (postToChief) {
      await postToChief(
        `🚫 [EMAIL BLOCKED] to=${data.to} subject=${data.subject} — content guard: ${contentCheck.violations.join('; ')}. NOT sent; fix the draft and resend.`,
      );
    }
    return undefined;
  }

  const { effectiveTo, effectiveCc, originalTo } = applyTestRouting(data);
  const effectiveThreadId = await resolveSendThreadId(
    data.threadId,
    originalTo,
    data.subject,
    data.groupFolder,
  );

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
    threadId: effectiveThreadId,
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
    data.leadId || (await resolvePartyId(data.to, effectiveThreadId));
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

  return { messageId: result.messageId, threadId: result.threadId };
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

export async function handleGmailGetThread(
  data: GmailIpcPayload,
): Promise<void> {
  if (!data.threadId) {
    logger.warn({ data }, 'gmail_get_thread: missing threadId');
    return;
  }

  const content = await getThread(data.threadId);

  // type:'message' is the only shape the agent-runner surfaces (see
  // handleGmailSearch).
  writeInputMessage(data.groupFolder, {
    type: 'message',
    text: `[gmail_get_thread result — thread ${data.threadId}]\n\n${content}`,
  });

  logger.info(
    { threadId: data.threadId, groupFolder: data.groupFolder },
    'gmail_get_thread processed',
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
    case 'gmail_get_thread':
      await handleGmailGetThread(data);
      break;
    default:
      logger.warn({ type: data.type }, 'Unknown Gmail IPC type');
  }
}
