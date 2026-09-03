import type { NewMessage } from './types.js';

export type MailmanTurnKind =
  | 'inbound_classification'
  | 'approved_delivery'
  | 'other';

export interface MailmanRunContext {
  runId: string;
  kind: MailmanTurnKind;
  chatJid: string;
  threadTs?: string;
  messageIds: readonly string[];
  expiresAt: number;
}

const RUN_TTL_MS = 60 * 60 * 1000;
const contexts = new Map<string, MailmanRunContext>();

function prune(now = Date.now()): void {
  for (const [id, context] of contexts) {
    if (context.expiresAt <= now) contexts.delete(id);
  }
}

export function inferMailmanTurnKind(
  chatJid: string,
  messages: readonly NewMessage[],
): MailmanTurnKind {
  if (
    chatJid.startsWith('gmail:') &&
    messages.some(
      (message) =>
        !message.is_from_me && !message.is_bot_message && !message.from_group,
    )
  ) {
    return 'inbound_classification';
  }
  if (
    messages.some((message) =>
      /^\[HANDOFF:\s*(?:sales|chief)\s*(?:→|->)\s*mailman\]/m.test(
        message.content,
      ),
    )
  ) {
    return 'approved_delivery';
  }
  return 'other';
}

export function registerMailmanRunContext(input: {
  runId: string;
  chatJid: string;
  threadTs?: string;
  messages: readonly NewMessage[];
  now?: number;
}): MailmanRunContext {
  const now = input.now ?? Date.now();
  prune(now);
  const context: MailmanRunContext = {
    runId: input.runId,
    kind: inferMailmanTurnKind(input.chatJid, input.messages),
    chatJid: input.chatJid,
    threadTs: input.threadTs,
    messageIds: input.messages.map((message) => message.id),
    expiresAt: now + RUN_TTL_MS,
  };
  contexts.set(input.runId, context);
  return context;
}

export function getMailmanRunContext(
  runId: string | undefined,
  now = Date.now(),
): MailmanRunContext | undefined {
  if (!runId) return undefined;
  prune(now);
  return contexts.get(runId);
}

export function mailmanUnboundSendDisposition(runId: string | undefined): {
  expectedInboundDenial: boolean;
  alertChief: boolean;
  nextInstruction: string;
} {
  const expectedInboundDenial =
    getMailmanRunContext(runId)?.kind === 'inbound_classification';
  return expectedInboundDenial
    ? {
        expectedInboundDenial: true,
        alertChief: false,
        nextInstruction:
          'This inbound turn is classification-only. Do not escalate this expected denial; call classify_email exactly once and stop.',
      }
    : {
        expectedInboundDenial: false,
        alertChief: true,
        nextInstruction:
          'Do not retry with a different ID or address; escalate.',
      };
}

export function mailmanClassificationBindingIssue(input: {
  runId: string | undefined;
  gmailMessageId: string;
  sourceContext?: { chatJid: string; threadTs?: string };
}): string | null {
  const turn = getMailmanRunContext(input.runId);
  if (!turn) return 'missing or expired Mailman run proof';
  if (turn.kind !== 'inbound_classification') {
    return 'Mailman run is not an inbound classification turn';
  }
  if (!turn.messageIds.includes(input.gmailMessageId)) {
    return 'Gmail Message-ID is outside the bound Mailman turn';
  }
  if (!input.sourceContext) return 'source container context is unavailable';
  if (
    input.sourceContext.chatJid !== turn.chatJid ||
    input.sourceContext.threadTs !== turn.threadTs
  ) {
    return 'source container Gmail thread does not match the bound Mailman turn';
  }
  return null;
}

/** Test isolation only. */
export function resetMailmanRunContextsForTest(): void {
  contexts.clear();
}
