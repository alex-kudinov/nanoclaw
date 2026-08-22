/**
 * Host-side logging of outbound email interactions.
 *
 * Every successful gmail_send / gmail_reply writes a business_v2.interactions
 * row atomically with the API call. This replaces the previous fragile pattern
 * where the host emitted a gmail_send_result IPC and relied on mailman's LLM
 * to re-run psql — which silently dropped interactions and caused stale
 * last_interaction_at values that made the sales cron regenerate follow-ups
 * for leads already contacted.
 */

import { withAgentContext } from './business-db.js';
import { logger } from './logger.js';

export interface OutboundEmailLog {
  partyId: number;
  emailType: string; // "initial" | "reply" | "follow-up"
  subject: string;
  threadId: string;
  messageId: string;
  /** Exact host-approved Sales pipeline entry, when this action has one. */
  pipelineEntryId?: number;
}

/**
 * Write an outbound email interaction row. Never throws — DB failures are
 * logged as warnings so a transient Postgres blip can't block email delivery
 * that already succeeded upstream. Missing rows surface as follow-up drift
 * and will be caught by the cron's sanity checks.
 */
export async function logOutboundEmailInteraction(
  row: OutboundEmailLog,
): Promise<void> {
  const subject = row.subject || `(${row.emailType} email)`;
  const metadata = {
    thread_id: row.threadId,
    message_id: row.messageId,
    email_type: row.emailType,
    follow_up: row.emailType === 'follow-up',
    ...(Number.isSafeInteger(row.pipelineEntryId) &&
    (row.pipelineEntryId ?? 0) > 0
      ? { pipeline_entry_id: row.pipelineEntryId }
      : {}),
  };

  try {
    await withAgentContext('mailman', async (client) => {
      await client.query(
        `SELECT business_v2.fn_log_interaction($1, 'email', 'outbound', $2, NOW(), $3::jsonb)`,
        [row.partyId, subject, JSON.stringify(metadata)],
      );
    });
    logger.info(
      {
        partyId: row.partyId,
        emailType: row.emailType,
        threadId: row.threadId,
        messageId: row.messageId,
        pipelineEntryId: row.pipelineEntryId,
      },
      'outbound email interaction logged',
    );
  } catch (err) {
    logger.error(
      {
        err,
        partyId: row.partyId,
        emailType: row.emailType,
        threadId: row.threadId,
      },
      'fn_log_interaction failed — follow-up cadence may drift',
    );
  }
}
