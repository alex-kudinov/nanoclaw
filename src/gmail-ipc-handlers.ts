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
  GMAIL_REPLY_TO,
  GMAIL_SEND_AS,
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
import { checkRecipient, normalizeRecipient } from './email-recipient-guard.js';
import { normalizeGmailSearchQuery } from './gmail-ipc-policy.js';
import {
  checkContent,
  type ContentCheckContext,
} from './email-content-guard.js';

/** Payload shape written by container MCP tools. */
export interface GmailIpcPayload {
  type:
    | 'gmail_reply'
    | 'gmail_send'
    | 'gmail_search'
    | 'gmail_read'
    | 'gmail_get_thread';
  groupFolder: string;
  /** Host-verifiable origin used to target asynchronous results to one session. */
  source_container?: string;
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
  // Canonical Party-ID hint for open tracking (gmail_send + gmail_reply).
  // Legacy field name; never interpret a pipeline Entry ID as a Party ID.
  leadId?: number;
  // Host-stamped from durable approval state; container input is overwritten.
  actionId?: string;
  approvedRecipient?: string;
  /** Host-stamped visible CC list from the exact approved card. */
  approvedCc?: string;
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
export type DeliverAsyncResult = (
  groupFolder: string,
  containerName: string,
  text: string,
) => boolean;

/**
 * Party IDs are `bigint` in PostgreSQL, and node-postgres returns bigint as a
 * STRING to avoid precision loss. The agent-supplied `lead_id` is a JSON number
 * (`lead_id: z.number()` in the container MCP tool). Comparing the two with
 * `!==` therefore always differed — `11119 !== '11119'` — which blocked every
 * `gmail_send` that carried a lead_id and resolved to a party, with the
 * self-contradicting reason "claimed party 11119 does not match host-resolved
 * party 11119" (Lead #962, 2026-07-30T22:38Z). Normalize at the boundary so no
 * caller has to remember the driver's representation.
 */
function toPartyId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Resolve a party ID when leadId is not provided in the IPC payload.
 * Tries recipient email first, then falls back to thread history.
 * Returns null if both lookups fail or find nothing.
 */
interface ResolvedParty {
  partyId: number;
  source: 'email' | 'thread';
}

async function resolvePartyId(
  to?: string,
  threadId?: string,
): Promise<ResolvedParty | null> {
  if (to) {
    const normalizedTo = normalizeRecipient(to);
    try {
      const result = await query<{ id: number | null }>(
        'SELECT business_v2.best_party_by_email($1::citext) AS id',
        [normalizedTo],
      );
      const resolved = toPartyId(result.rows[0]?.id);
      if (resolved) return { partyId: resolved, source: 'email' };
    } catch (err) {
      logger.error(
        { to: normalizedTo, err },
        'gmail-ipc: party lookup by email failed',
      );
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
      const resolved = toPartyId(result.rows[0]?.party_id);
      if (resolved) return { partyId: resolved, source: 'thread' };
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
 * lowercased. Used to reject an agent-fabricated recipient before sending.
 * Returning an empty set on lookup failure is deliberately fail-closed because
 * checkRecipient rejects missing host context.
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

interface VerifiedPartyContext {
  partyId: number;
  emails: Set<string>;
}

interface RecipientVerification {
  ok: boolean;
  context?: VerifiedPartyContext;
  reason?: string;
}

/**
 * Establish the party on the host and prove that the intended recipient belongs
 * to it. A caller-supplied leadId is a legacy Party-ID hint only. The host's
 * recipient/thread resolution is authoritative whenever available; this keeps a
 * pipeline Entry ID accidentally placed in `lead_id` from blocking an otherwise
 * exact approved send. The final recipient must still be among the selected
 * party's known addresses.
 */
async function verifyPartyRecipient(
  to: string,
  claimedPartyId?: number,
  threadId?: string,
  opts: { allowApprovedThreadParticipantAlias?: boolean } = {},
): Promise<RecipientVerification> {
  const resolvedParty = await resolvePartyId(to, threadId);
  const resolvedPartyId = resolvedParty?.partyId ?? null;
  // The claim arrives as JSON and may be a number or a numeric string; the
  // resolver is already normalized. Both sides must be compared as numbers.
  const claimed = toPartyId(claimedPartyId);
  if (claimed && resolvedPartyId && claimed !== resolvedPartyId) {
    logger.warn(
      {
        claimedPartyId: claimed,
        resolvedPartyId,
        to: normalizeRecipient(to),
        threadId,
      },
      'gmail-ipc: model party hint disagrees with host resolution; using host-resolved party',
    );
  }
  const partyId = resolvedPartyId ?? claimed;
  if (!partyId) {
    return {
      ok: false,
      reason: `recipient ${normalizeRecipient(to)} has no host-resolved party`,
    };
  }
  const emails = await getPartyEmails(partyId);
  const check = checkRecipient(to, emails);
  if (!check.ok) {
    // A reply action has two independent host-owned facts that a newly observed
    // alias may not yet have in CRM: Gmail resolved this exact address as the
    // participant of the approved thread, and the human approved the same
    // address on the card. Permit that address for this reply only when the
    // thread itself resolves to the party. Standalone sends, model-supplied
    // recipients, reserved domains, and unrelated threads remain blocked.
    const normalizedTo = normalizeRecipient(to);
    const addressShapeCheck = checkRecipient(to, new Set([normalizedTo]));
    if (
      opts.allowApprovedThreadParticipantAlias &&
      resolvedParty?.source === 'thread' &&
      addressShapeCheck.ok
    ) {
      const replyEmails = new Set(emails);
      replyEmails.add(normalizedTo);
      return { ok: true, context: { partyId, emails: replyEmails } };
    }
    return { ok: false, reason: check.reason };
  }
  return { ok: true, context: { partyId, emails } };
}

function splitRecipients(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function configuredMailboxRecipients(): Set<string> {
  return new Set(
    [GMAIL_MONITORED_EMAIL, GMAIL_REPLY_TO, GMAIL_SEND_AS]
      .map(normalizeRecipient)
      .filter(Boolean),
  );
}

function hasApprovedConfiguredMailboxCc(data: GmailIpcPayload): boolean {
  if (!data.actionId || !data.approvedCc) return false;
  const configured = configuredMailboxRecipients();
  return splitRecipients(data.approvedCc)
    .map(normalizeRecipient)
    .some((recipient) => configured.has(recipient));
}

function verifyAdditionalRecipients(
  value: string | undefined,
  context: VerifiedPartyContext,
  opts: { approvedCc?: string } = {},
): RecipientVerification {
  const recipients = splitRecipients(value).map(normalizeRecipient);
  const approved = splitRecipients(opts.approvedCc).map(normalizeRecipient);
  if (
    opts.approvedCc !== undefined &&
    (recipients.length !== approved.length ||
      recipients.some((recipient, index) => recipient !== approved[index]))
  ) {
    return {
      ok: false,
      reason: 'CC rejected: execution recipients differ from the approved card',
    };
  }
  const configuredInternal = configuredMailboxRecipients();
  const approvedInternal = new Set(approved);
  for (const recipient of recipients) {
    const check = checkRecipient(recipient, context.emails);
    if (
      !check.ok &&
      !(
        opts.approvedCc !== undefined &&
        approvedInternal.has(recipient) &&
        configuredInternal.has(recipient)
      )
    ) {
      return {
        ok: false,
        reason: `CC rejected: ${check.reason}`,
      };
    }
  }
  return { ok: true, context };
}

class RecipientPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipientPolicyError';
  }
}

/** Build email footer with tracking pixel and optional unsubscribe link. */
function buildEmailFooter(
  trackingId: string,
  emailType: string,
  opts: { includeOpenPixel?: boolean } = {},
): string {
  const pixel =
    opts.includeOpenPixel === false
      ? ''
      : `<img src="https://${TRACKING_DOMAIN}/t/${trackingId}" width="1" height="1" alt="" style="display:none">`;

  // Only add unsubscribe link on follow-ups (not initial outreach)
  if (emailType !== 'follow-up') {
    return pixel ? `\n${pixel}` : '';
  }

  const unsubUrl = `${UNSUBSCRIBE_BASE_URL}?t=${trackingId}`;
  return (
    `\n<div style="margin-top:32px;padding-top:12px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;">` +
    `<a href="${unsubUrl}" style="color:#999;">Unsubscribe</a> from follow-up emails</div>` +
    (pixel ? `\n${pixel}` : '')
  );
}

/**
 * Notified with the real recipient once Gmail has accepted a message. The only
 * signal that discharges an approved-send expectation — see send-watchdog.ts.
 */
export interface EmailSendReceipt {
  actionId?: string;
  recipient: string | undefined;
  messageId: string;
  threadId: string;
}

export interface EmailSendFailure {
  actionId?: string;
  code: 'invalid_payload' | 'content_guard' | 'recipient_guard';
}

export type OnSendConfirmed = (
  receipt: EmailSendReceipt,
) => void | Promise<void>;
export type OnSendFailed = (failure: EmailSendFailure) => void | Promise<void>;

export async function handleGmailReply(
  data: GmailIpcPayload,
  postToChief?: PostToChief,
  onSendConfirmed?: OnSendConfirmed,
  onSendFailed?: OnSendFailed,
  contentGuardContext: ContentCheckContext = {},
): Promise<void> {
  if (!data.threadId || !data.body) {
    logger.warn({ data }, 'gmail_reply: missing threadId or body');
    await onSendFailed?.({ actionId: data.actionId, code: 'invalid_payload' });
    return;
  }

  // Content guard (P2): discount offers, non-whitelisted links, unfilled
  // placeholders. Runs on the agent's raw composition, before conversion.
  const replyContentCheck = checkContent(
    data.subject || '',
    data.body,
    contentGuardContext,
  );
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
    await onSendFailed?.({ actionId: data.actionId, code: 'content_guard' });
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

  let verifiedReplyParty: VerifiedPartyContext | undefined;
  let result: Awaited<ReturnType<typeof replyToThread>>;
  try {
    result = await replyToThread({
      threadId: data.threadId,
      body: data.body,
      html: data.html,
      cc: data.cc,
      recipientOverride: GMAIL_TEST_RECIPIENT || undefined,
      prepareSend: async ({ to, cc }) => {
        if (
          data.approvedRecipient &&
          normalizeRecipient(to) !== normalizeRecipient(data.approvedRecipient)
        ) {
          throw new RecipientPolicyError(
            `Gmail thread recipient ${normalizeRecipient(to)} does not match ` +
              `approved recipient ${normalizeRecipient(data.approvedRecipient)}`,
          );
        }
        const verification = await verifyPartyRecipient(
          to,
          data.leadId,
          data.threadId,
          {
            allowApprovedThreadParticipantAlias: Boolean(
              data.actionId &&
              data.approvedRecipient &&
              normalizeRecipient(to) ===
                normalizeRecipient(data.approvedRecipient),
            ),
          },
        );
        if (!verification.ok || !verification.context) {
          throw new RecipientPolicyError(
            verification.reason || 'recipient could not be verified',
          );
        }
        const ccCheck = verifyAdditionalRecipients(cc, verification.context, {
          approvedCc: data.actionId ? data.approvedCc : undefined,
        });
        if (!ccCheck.ok) {
          throw new RecipientPolicyError(
            ccCheck.reason || 'CC recipient could not be verified',
          );
        }
        verifiedReplyParty = verification.context;

        let body = data.body!;
        if (data.html) {
          const trackingId = crypto.randomUUID();
          try {
            insertTrackingPixel(
              trackingId,
              verification.context.partyId,
              data.emailType || 'reply',
            );
            body += buildEmailFooter(trackingId, data.emailType || 'reply', {
              includeOpenPixel: !hasApprovedConfiguredMailboxCc(data),
            });
          } catch (err) {
            logger.warn(
              { err, partyId: verification.context.partyId },
              'Failed to insert tracking pixel, sending without',
            );
          }
        }
        return { body };
      },
    });
  } catch (err) {
    if (!(err instanceof RecipientPolicyError)) throw err;
    logger.error(
      { threadId: data.threadId, cc: data.cc, reason: err.message },
      'gmail_reply BLOCKED: recipient failed validation',
    );
    if (postToChief) {
      await postToChief(
        `🚫 [EMAIL BLOCKED] reply thread=${data.threadId} — ${err.message}. NOT sent; verify the recipient and resend.`,
      );
    }
    await onSendFailed?.({ actionId: data.actionId, code: 'recipient_guard' });
    return;
  }

  // Gmail accepted it. A test-routed message does NOT discharge the intended
  // recipient's expectation because that customer never received the email.
  if (!GMAIL_TEST_RECIPIENT) {
    await onSendConfirmed?.({
      actionId: data.actionId,
      recipient: result.originalTo,
      messageId: result.messageId,
      threadId: result.threadId,
    });
  }

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
  await logOutboundEmailInteraction({
    partyId: verifiedReplyParty!.partyId,
    emailType: data.emailType || 'reply',
    subject: result.subject || data.subject || '',
    threadId: result.threadId,
    messageId: result.messageId,
  });

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
      const routed = GMAIL_TEST_RECIPIENT
        ? ` (test-routed; intended=${result.originalTo})`
        : '';
      await postToChief(
        `[EMAIL SENT] to=${result.to || '(unknown)'}${routed} subject=${result.subject || data.subject || '(no subject)'}`,
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
  onSendConfirmed?: OnSendConfirmed,
  onSendFailed?: OnSendFailed,
  contentGuardContext: ContentCheckContext = {},
): Promise<{ messageId: string; threadId: string } | undefined> {
  if (!data.to || !data.subject || !data.body) {
    logger.warn({ data }, 'gmail_send: missing to, subject, or body');
    await onSendFailed?.({ actionId: data.actionId, code: 'invalid_payload' });
    return undefined;
  }

  // The host resolves and verifies the party whether or not the agent supplies
  // leadId. Omitting that model-controlled field can no longer bypass the
  // allowlist. CC recipients are held to the same final-boundary policy.
  const verification = await verifyPartyRecipient(
    data.to,
    data.leadId,
    data.threadId,
  );
  const ccCheck = verification.context
    ? verifyAdditionalRecipients(data.cc, verification.context, {
        approvedCc: data.actionId ? data.approvedCc : undefined,
      })
    : verification;
  if (!verification.ok || !verification.context || !ccCheck.ok) {
    const reason = verification.reason || ccCheck.reason;
    logger.error(
      {
        to: data.to,
        leadId: data.leadId,
        subject: data.subject,
        reason,
      },
      'gmail_send BLOCKED: recipient failed validation',
    );
    if (postToChief) {
      await postToChief(
        `🚫 [EMAIL BLOCKED] to=${data.to} subject=${data.subject} — ${reason}. NOT sent; verify the recipient and resend.`,
      );
    }
    await onSendFailed?.({ actionId: data.actionId, code: 'recipient_guard' });
    return undefined;
  }

  // Content guard (P2): discount offers, non-whitelisted links, unfilled
  // placeholders. Runs on the agent's raw composition, before conversion.
  const contentCheck = checkContent(
    data.subject,
    data.body,
    contentGuardContext,
  );
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
    await onSendFailed?.({ actionId: data.actionId, code: 'content_guard' });
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
  if (data.html) {
    const trackingId = crypto.randomUUID();
    try {
      insertTrackingPixel(
        trackingId,
        verification.context.partyId,
        data.emailType || 'initial',
      );
      bodyForSend += buildEmailFooter(trackingId, data.emailType || 'initial', {
        includeOpenPixel: !hasApprovedConfiguredMailboxCc(data),
      });
    } catch (err) {
      logger.warn(
        { err, partyId: verification.context.partyId },
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

  // A test-routed message does NOT discharge the intended recipient's
  // expectation because that customer never received the email.
  if (!GMAIL_TEST_RECIPIENT) {
    await onSendConfirmed?.({
      actionId: data.actionId,
      recipient: originalTo,
      messageId: result.messageId,
      threadId: result.threadId,
    });
  }

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
  await logOutboundEmailInteraction({
    partyId: verification.context.partyId,
    emailType: data.emailType || 'initial',
    subject: data.subject,
    threadId: result.threadId,
    messageId: result.messageId,
  });

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

export async function handleGmailSearch(
  data: GmailIpcPayload,
  deliverResult?: DeliverAsyncResult,
): Promise<boolean> {
  if (!data.query) {
    logger.warn({ data }, 'gmail_search: missing query');
    return false;
  }

  // Execute exactly the query the policy authorized. Authorization normalizes a
  // bare address to `from:X OR to:X`; running the raw string here would issue an
  // unscoped full-text search under a scoped grant.
  const query = normalizeGmailSearchQuery(data.query);
  const results = await searchEmails({
    query,
    maxResults: data.maxResults,
  });

  // Deliver results back as a follow-up message. The agent-runner's
  // drainIpcInput() only surfaces files with type:'message' — any other type
  // is read, discarded, and deleted, so the result must be a plain message.
  const delivered = writeInputMessage(
    data.groupFolder,
    {
      type: 'message',
      text: `[gmail_search results — query: ${query}]\n\n${results}`,
    },
    data.source_container,
    deliverResult,
  );

  logger.info(
    { query: data.query, groupFolder: data.groupFolder },
    'gmail_search processed',
  );
  return delivered;
}

export async function handleGmailRead(
  data: GmailIpcPayload,
  deliverResult?: DeliverAsyncResult,
): Promise<boolean> {
  if (!data.messageId) {
    logger.warn({ data }, 'gmail_read: missing messageId');
    return false;
  }

  const content = await readEmail(data.messageId);

  // Deliver the email back as a follow-up message. type:'message' is the only
  // shape the agent-runner's drainIpcInput() surfaces (see handleGmailSearch).
  const delivered = writeInputMessage(
    data.groupFolder,
    {
      type: 'message',
      text: `[gmail_read result — message ${data.messageId}]\n\n${content}`,
    },
    data.source_container,
    deliverResult,
  );

  logger.info(
    { messageId: data.messageId, groupFolder: data.groupFolder },
    'gmail_read processed',
  );
  return delivered;
}

export async function handleGmailGetThread(
  data: GmailIpcPayload,
  deliverResult?: DeliverAsyncResult,
): Promise<boolean> {
  if (!data.threadId) {
    logger.warn({ data }, 'gmail_get_thread: missing threadId');
    return false;
  }

  const content = await getThread(data.threadId);

  // type:'message' is the only shape the agent-runner surfaces (see
  // handleGmailSearch).
  const delivered = writeInputMessage(
    data.groupFolder,
    {
      type: 'message',
      text: `[gmail_get_thread result — thread ${data.threadId}]\n\n${content}`,
    },
    data.source_container,
    deliverResult,
  );

  logger.info(
    { threadId: data.threadId, groupFolder: data.groupFolder },
    'gmail_get_thread processed',
  );
  return delivered;
}

/** Write a follow-up message to the agent's IPC input directory. */
function writeInputMessage(
  groupFolder: string,
  payload: Record<string, unknown>,
  targetContainer?: string,
  deliverResult?: DeliverAsyncResult,
): boolean {
  const text = typeof payload.text === 'string' ? payload.text : undefined;
  if (targetContainer && deliverResult && text) {
    const delivered = deliverResult(groupFolder, targetContainer, text);
    if (!delivered) {
      logger.error(
        { groupFolder, targetContainer },
        'Gmail asynchronous result target container is no longer active; result was not delivered to a sibling session',
      );
    }
    return delivered;
  }
  const inputDir = path.join(DATA_DIR, 'ipc', groupFolder, 'input');
  fs.mkdirSync(inputDir, { recursive: true });

  const filename = `gmail-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`;
  fs.writeFileSync(
    path.join(inputDir, filename),
    JSON.stringify(
      {
        ...payload,
        target_container: targetContainer || undefined,
      },
      null,
      2,
    ),
    'utf-8',
  );

  if (!targetContainer) {
    logger.warn(
      { groupFolder },
      'Gmail asynchronous result has no source container; using legacy untargeted delivery',
    );
  }
  return true;
}

/** Check if a type string is a Gmail IPC type. */
export function isGmailIpcType(type: string): boolean {
  return type.startsWith('gmail_');
}

/** Dispatch a Gmail IPC payload to the appropriate handler. */
export async function dispatchGmailIpc(
  data: GmailIpcPayload,
  postToChief?: PostToChief,
  onSendConfirmed?: OnSendConfirmed,
  onSendFailed?: OnSendFailed,
  deliverResult?: DeliverAsyncResult,
  contentGuardContext: ContentCheckContext = {},
): Promise<void> {
  switch (data.type) {
    case 'gmail_reply':
      await handleGmailReply(
        data,
        postToChief,
        onSendConfirmed,
        onSendFailed,
        contentGuardContext,
      );
      break;
    case 'gmail_send':
      await handleGmailSend(
        data,
        postToChief,
        onSendConfirmed,
        onSendFailed,
        contentGuardContext,
      );
      break;
    case 'gmail_search':
      if (!data.query) {
        await postToChief?.(
          '🚫 [GMAIL REQUEST INVALID] gmail_search was missing its required query; no Gmail operation ran.',
        );
        break;
      }
      if (!(await handleGmailSearch(data, deliverResult))) {
        await postToChief?.(
          '🚫 [GMAIL RESULT HELD] A gmail_search completed after its originating container exited. The result was not delivered to another session; retry from the correct work item.',
        );
      }
      break;
    case 'gmail_read':
      if (!data.messageId) {
        await postToChief?.(
          '🚫 [GMAIL REQUEST INVALID] gmail_read was missing its required messageId; no Gmail operation ran.',
        );
        break;
      }
      if (!(await handleGmailRead(data, deliverResult))) {
        await postToChief?.(
          '🚫 [GMAIL RESULT HELD] A gmail_read completed after its originating container exited. The result was not delivered to another session; retry from the correct work item.',
        );
      }
      break;
    case 'gmail_get_thread':
      if (!data.threadId) {
        await postToChief?.(
          '🚫 [GMAIL REQUEST INVALID] gmail_get_thread was missing its required threadId; no Gmail operation ran.',
        );
        break;
      }
      if (!(await handleGmailGetThread(data, deliverResult))) {
        await postToChief?.(
          '🚫 [GMAIL RESULT HELD] A gmail_get_thread completed after its originating container exited. The result was not delivered to another session; retry from the correct work item.',
        );
      }
      break;
    default:
      logger.warn({ type: data.type }, 'Unknown Gmail IPC type');
  }
}
