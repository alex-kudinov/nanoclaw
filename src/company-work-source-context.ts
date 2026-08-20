/**
 * Exact source hydration for Company OS work dispatches.
 *
 * The Company Work ledger intentionally stores no customer prose. For a
 * Sales-email item it does, however, retain the immutable approved-action ID.
 * This resolver follows that host-owned ID back to the exact SQLite action and
 * its exact Slack work root, then returns a bounded copy for Chief. It never
 * searches Gmail and never accepts a model-authored resource identifier.
 */

import {
  bindEmailActionSourceMessage,
  getMessageById,
  getPendingSendByActionId,
  getThreadContext,
} from './db.js';
import { isInboundSalesHandoff } from './lead-thread-key.js';
import type { CompanyWorkExceptionItem } from './company-work-report.js';

const MAX_SOURCE_CHARS = 2_600;
const MAX_SOURCE_THREAD_MESSAGES = 100;

export interface CompanyWorkSourceContext {
  status: 'attached' | 'unavailable' | 'not_applicable';
  code: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
  sourceText?: string;
  bodyComplete: boolean;
}

function headerValue(text: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const header = text.split(
    /^\s*(?:Body|Message|Original-Message|DRAFT RESPONSE|THEIR REQUEST)\s*:/im,
  )[0];
  return new RegExp(`^\\s*${escaped}\\s*:\\s*(\\S+)\\s*$`, 'im').exec(
    header,
  )?.[1];
}

function exactMailmanSourceText(
  chatJid: string,
  threadTs: string,
): string | null {
  const messages = getThreadContext(
    chatJid,
    threadTs,
    MAX_SOURCE_THREAD_MESSAGES,
  );
  const rootIndex = messages.findIndex(
    (message) => message.id === threadTs && !message.thread_ts,
  );
  if (rootIndex === -1) return null;
  const root = messages[rootIndex];
  if (root.from_group !== 'mailman' || !isInboundSalesHandoff(root.content)) {
    return null;
  }

  // Slack may split one logical host handoff. Its fragments are consecutive,
  // Mailman-authored rows at the beginning of this work thread. Stop at the
  // first Sales/human/other-group message so later conversation is never
  // mistaken for source email content.
  const fragments: string[] = [];
  for (const message of messages.slice(rootIndex)) {
    if (message.from_group !== 'mailman') break;
    fragments.push(message.content);
  }
  return fragments.join('\n');
}

export function resolveCompanyWorkSourceContext(
  item: CompanyWorkExceptionItem,
): CompanyWorkSourceContext {
  if (item.workflowType !== 'sales_email') {
    return {
      status: 'not_applicable',
      code: 'workflow_has_no_email_source',
      bodyComplete: true,
    };
  }
  if (item.sourceSystem !== 'sqlite_email_action') {
    return {
      status: 'unavailable',
      code: 'unsupported_email_source_system',
      bodyComplete: false,
    };
  }

  const action = getPendingSendByActionId(item.sourceKey);
  if (
    !action ||
    action.actionId !== item.sourceKey ||
    action.groupFolder !== 'sales' ||
    !action.threadTs
  ) {
    return {
      status: 'unavailable',
      code: 'source_action_binding_missing',
      bodyComplete: false,
    };
  }
  const root = getMessageById(action.threadTs, action.chatJid);
  if (
    !root ||
    root.id !== action.threadTs ||
    root.thread_ts ||
    root.from_group !== 'mailman' ||
    !isInboundSalesHandoff(root.content)
  ) {
    return {
      status: 'unavailable',
      code: 'source_slack_root_missing',
      bodyComplete: false,
    };
  }

  const fullSource = exactMailmanSourceText(action.chatJid, action.threadTs);
  if (!fullSource) {
    return {
      status: 'unavailable',
      code: 'source_slack_context_missing',
      bodyComplete: false,
    };
  }
  const headerMessageId = headerValue(fullSource, 'Message-ID');
  const headerThreadId =
    headerValue(fullSource, 'Thread-ID') ??
    headerValue(fullSource, 'Source-Thread-ID');
  const gmailMessageId = action.sourceGmailMessageId ?? headerMessageId;
  if (
    action.sourceGmailMessageId &&
    headerMessageId &&
    action.sourceGmailMessageId !== headerMessageId
  ) {
    return {
      status: 'unavailable',
      code: 'source_message_identity_conflict',
      bodyComplete: false,
    };
  }
  if (
    action.gmailThreadId &&
    headerThreadId &&
    action.gmailThreadId !== headerThreadId
  ) {
    return {
      status: 'unavailable',
      code: 'source_thread_identity_conflict',
      bodyComplete: false,
    };
  }
  if (
    headerMessageId &&
    !action.sourceGmailMessageId &&
    !bindEmailActionSourceMessage(item.sourceKey, headerMessageId)
  ) {
    return {
      status: 'unavailable',
      code: 'source_message_binding_failed',
      bodyComplete: false,
    };
  }

  const gmailThreadId = action.gmailThreadId ?? headerThreadId;
  const bodyComplete = fullSource.length <= MAX_SOURCE_CHARS;
  return {
    status: 'attached',
    code: gmailMessageId
      ? 'exact_source_attached'
      : 'legacy_source_attached_without_message_id',
    ...(gmailMessageId ? { gmailMessageId } : {}),
    ...(gmailThreadId ? { gmailThreadId } : {}),
    sourceText: bodyComplete
      ? fullSource
      : `${fullSource.slice(0, MAX_SOURCE_CHARS)}\n[truncated]`,
    bodyComplete,
  };
}
