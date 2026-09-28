/**
 * The Gmail call for a host-executed approved email, and what the thread is
 * told about its outcome (NC-20260927-001). `host-email-executor.ts` decides
 * whether an action may be sent; this module sends it once and records the
 * receipt, the refusal, or the uncertainty.
 */

import type { EmailActionExecutionClaim, EmailSendActionRow } from './db.js';
import type {
  EmailSendFailure,
  EmailSendReceipt,
  GmailIpcPayload,
} from './gmail-ipc-handlers.js';
import { logger } from './logger.js';

export type HostExecutionOutcome =
  | 'sent'
  | 'already_sent'
  | 'blocked'
  | 'held'
  | 'uncertain'
  | 'in_progress'
  | 'unknown';

export interface HostEmailExecutorDeps {
  getAction(actionId: string): EmailSendActionRow | undefined;
  getCardText(action: EmailSendActionRow): string | undefined;
  /** Throws an ExternalWriteDeniedError while the safety control is on. */
  assertGmailWritable(): void;
  testRoutingActive(): boolean;
  claim(
    actionId: string,
    approvedContentSha256: string,
    recipient: string | undefined,
    startedAt: string,
  ): EmailActionExecutionClaim;
  confirm(
    actionId: string,
    recipient: string,
    messageId: string,
    threadId: string,
    completedAt: string,
  ): number;
  fail(
    actionId: string,
    state: 'blocked' | 'uncertain',
    code: string,
    occurredAt: string,
  ): number;
  hold(actionId: string, code: string, occurredAt: string): number;
  send(
    payload: GmailIpcPayload,
    onConfirmed: (receipt: EmailSendReceipt) => Promise<void>,
    onFailed: (failure: EmailSendFailure) => Promise<void>,
  ): Promise<void>;
  postThread(action: EmailSendActionRow, text: string): Promise<void>;
  now(): Date;
}

export const FORCE_HINT =
  'An owner can say `force send: <reason>` in this thread to send it anyway.';

/** Gmail refused the request itself, so nothing was delivered. */
export function gmailRejectedStatus(err: unknown): number | undefined {
  const e = err as {
    code?: unknown;
    status?: unknown;
    response?: { status?: unknown };
  };
  const raw = e?.response?.status ?? e?.status ?? e?.code;
  const status = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(status)) return undefined;
  if (status < 400 || status >= 500 || status === 408 || status === 429) {
    return undefined;
  }
  return status;
}

function isInvalidThreadError(err: unknown): boolean {
  return /invalid thread_?id/i.test(String((err as Error)?.message ?? err));
}

export async function blockAction(
  action: EmailSendActionRow,
  code: string,
  reason: string,
  deps: HostEmailExecutorDeps,
): Promise<HostExecutionOutcome> {
  deps.fail(action.actionId!, 'blocked', code, deps.now().toISOString());
  await deps.postThread(
    action,
    `🚫 [EMAIL BLOCKED] Action ${action.actionId} was NOT sent: ${reason}. Gmail was not called. ${FORCE_HINT}`,
  );
  return 'blocked';
}

/** One Gmail call. Throws when Gmail itself errors; see recoverFromSendError. */
export async function sendOnce(
  action: EmailSendActionRow,
  payload: GmailIpcPayload,
  deps: HostEmailExecutorDeps,
): Promise<HostExecutionOutcome> {
  let outcome: HostExecutionOutcome = 'uncertain';
  await deps.send(
    payload,
    async (receipt) => {
      const recipient = action.recipient ?? receipt.recipient ?? '';
      const at = deps.now().toISOString();
      const { messageId, threadId } = receipt;
      if (
        deps.confirm(action.actionId!, recipient, messageId, threadId, at) !== 1
      ) {
        throw new Error(
          'Gmail accepted the message but the exact action receipt could not be committed',
        );
      }
      outcome = 'sent';
      await deps.postThread(
        action,
        `✅ [EMAIL SENT] Action ${action.actionId} was accepted by Gmail. Receipt ${messageId}.`,
      );
    },
    async (failure) => {
      outcome = 'blocked';
      const at = deps.now().toISOString();
      deps.fail(action.actionId!, 'blocked', failure.code, at);
      await deps.postThread(
        action,
        `🚫 [EMAIL BLOCKED] Action ${action.actionId} failed the host ${failure.code.replaceAll('_', ' ')} check. It was NOT sent. ${FORCE_HINT}`,
      );
    },
  );
  return outcome;
}

async function retryWithoutThread(
  action: EmailSendActionRow,
  payload: GmailIpcPayload,
  deps: HostEmailExecutorDeps,
): Promise<HostExecutionOutcome> {
  // Gmail answered 4xx, so nothing was delivered; one standalone retry is
  // safe and keeps the approved subject (a Re: subject re-threads itself).
  logger.warn(
    { actionId: action.actionId, threadId: payload.threadId },
    'Gmail rejected the stored thread id; resending the approved card without it',
  );
  const standalone = { ...payload };
  delete standalone.threadId;
  try {
    return await sendOnce(action, standalone, deps);
  } catch (retryErr) {
    return recoverFromSendError(action, standalone, retryErr, deps);
  }
}

async function markUncertain(
  action: EmailSendActionRow,
  deps: HostEmailExecutorDeps,
): Promise<HostExecutionOutcome> {
  const at = deps.now().toISOString();
  deps.fail(action.actionId!, 'uncertain', 'gmail_dispatch_error', at);
  await deps.postThread(
    action,
    `⚠️ [EMAIL DELIVERY UNCERTAIN] Action ${action.actionId} hit an error at the Gmail boundary and may or may not have gone out. ` +
      'An owner can say `force send: <reason>`: the host checks Gmail Sent first and never sends a copy Gmail already accepted.',
  );
  return 'uncertain';
}

/** Classify a Gmail-boundary error: already sent, refused, or uncertain. */
export async function recoverFromSendError(
  action: EmailSendActionRow,
  payload: GmailIpcPayload,
  err: unknown,
  deps: HostEmailExecutorDeps,
): Promise<HostExecutionOutcome> {
  if (deps.getAction(action.actionId!)?.state === 'confirmed') {
    await deps.postThread(
      action,
      `⚠️ [EMAIL SENT — FOLLOW-UP FAILED] Action ${action.actionId} has a durable Gmail receipt, but a post-send host update failed. Do NOT resend; reconcile the business interaction record.`,
    );
    return 'sent';
  }
  const status = gmailRejectedStatus(err);
  if (status && payload.threadId && isInvalidThreadError(err)) {
    return retryWithoutThread(action, payload, deps);
  }
  if (!status) return markUncertain(action, deps);
  const detail = String((err as Error)?.message ?? err).slice(0, 160);
  return blockAction(
    action,
    `gmail_rejected_${status}`,
    `Gmail refused the request (${status}: ${detail})`,
    deps,
  );
}
