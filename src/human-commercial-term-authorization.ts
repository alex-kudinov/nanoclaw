import { getHumanMessagesInThread } from './db.js';
import {
  extractHumanCommercialTermDecisions,
  type NumericDiscountTerm,
} from './email-content-guard.js';

/**
 * Resolve commercial authority from durable host-owned Slack history.
 *
 * Only human messages in the exact chat + work thread are queried. Decisions
 * are applied chronologically so a later explicit negation revokes an earlier
 * authorization. Agent cards and app-generated handoffs are bot rows and can
 * never authorize themselves.
 */
export function resolveHumanAuthorizedDiscountTerms(
  chatJid: string,
  threadTs: string | undefined,
): NumericDiscountTerm[] {
  if (!threadTs) return [];
  const authorized = new Set<NumericDiscountTerm>();
  for (const message of getHumanMessagesInThread(chatJid, threadTs)) {
    for (const decision of extractHumanCommercialTermDecisions(
      message.content,
    )) {
      if (decision.decision === 'authorize') authorized.add(decision.term);
      else authorized.delete(decision.term);
    }
  }
  return [...authorized].sort();
}
