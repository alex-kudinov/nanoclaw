import { getBotMessagesSince } from './db.js';
import type { NewMessage, ScheduledTask } from './types.js';

export interface SalesFollowupCompletionReader {
  getBotMessagesSince(chatJid: string, sinceTimestamp: string): NewMessage[];
}

const defaultReader: SalesFollowupCompletionReader = { getBotMessagesSince };

export function isDailySalesFollowupTask(task: ScheduledTask): boolean {
  return task.id === 'task-followup-daily' && task.group_folder === 'sales';
}

function isCompletionArtifact(message: NewMessage): boolean {
  if (message.from_group !== 'sales') return false;
  const content = message.content.trim();
  return (
    /^\[FOLLOW-UP #\d+\]\s+Lead #\d+\b/.test(content) ||
    /^\[COLD\]\s+Lead #\d+\b/.test(content) ||
    content === 'No leads pending follow-up today.'
  );
}

const COMPLETE_RECEIPT =
  /^\[FOLLOW-UP RUN COMPLETE\] selected=(\d+) follow-up-cards=(\d+) cold=(\d+) remaining=(\d+) ids=([0-9,]+)$/;

type ArtifactKind = 'follow-up' | 'cold';

function completionArtifact(
  message: NewMessage,
): { id: number; kind: ArtifactKind } | null {
  if (message.from_group !== 'sales') return null;
  const content = message.content.trim();
  const followup = /^\[FOLLOW-UP #\d+\]\s+Lead #(\d+)\b/.exec(content);
  if (followup) return { id: Number(followup[1]), kind: 'follow-up' };
  const cold = /^\[COLD\]\s+Lead #(\d+)\b/.exec(content);
  return cold ? { id: Number(cold[1]), kind: 'cold' } : null;
}

/**
 * A zero-exit model turn is not completion of the daily follow-up job. Require
 * a visible Sales-owned card (still human approval-gated), a cold transition
 * notice, or the explicit empty-queue receipt after this exact run began.
 */
export function validateSalesFollowupTaskCompletion(
  task: ScheduledTask,
  startedAtMs: number,
  result: string | null,
  reader: SalesFollowupCompletionReader = defaultReader,
): void {
  if (!isDailySalesFollowupTask(task)) return;
  const startedAt = new Date(startedAtMs).toISOString();
  const messages = reader.getBotMessagesSince(task.chat_jid, startedAt);
  if (
    messages.some(
      (message) =>
        message.content.trim() === 'No leads pending follow-up today.',
    )
  ) {
    return;
  }

  const latestVisibleReceipt = messages
    .map((message) => message.content.trim())
    .reverse()
    .find((content) => COMPLETE_RECEIPT.test(content));
  const receipt = COMPLETE_RECEIPT.exec(
    latestVisibleReceipt ?? result?.trim() ?? '',
  );
  if (!receipt) {
    throw new Error(
      'Daily Sales follow-up produced neither an empty-queue receipt nor a valid completion receipt',
    );
  }

  const selected = Number(receipt[1]);
  const followupCards = Number(receipt[2]);
  const cold = Number(receipt[3]);
  const receiptIds = receipt[5].split(',').map(Number);
  const uniqueReceiptIds = new Set(receiptIds);
  if (
    selected < 1 ||
    selected > 5 ||
    followupCards + cold !== selected ||
    receiptIds.length !== selected ||
    uniqueReceiptIds.size !== selected
  ) {
    throw new Error(
      'Daily Sales follow-up completion receipt has inconsistent counts',
    );
  }

  const observed = new Map<number, Set<ArtifactKind>>();
  for (const message of messages.filter(isCompletionArtifact)) {
    const artifact = completionArtifact(message);
    if (!artifact) continue;
    const kinds = observed.get(artifact.id) ?? new Set<ArtifactKind>();
    kinds.add(artifact.kind);
    observed.set(artifact.id, kinds);
  }
  const missingIds = receiptIds.filter((id) => !observed.has(id));
  if (missingIds.length > 0) {
    throw new Error(
      `Daily Sales follow-up completion receipt is missing visible artifacts for Lead #${missingIds.join(', #')}`,
    );
  }
  const ambiguousIds = receiptIds.filter((id) => observed.get(id)!.size !== 1);
  const observedFollowups = receiptIds.filter((id) =>
    observed.get(id)!.has('follow-up'),
  ).length;
  const observedCold = receiptIds.filter((id) =>
    observed.get(id)!.has('cold'),
  ).length;
  if (
    ambiguousIds.length > 0 ||
    observedFollowups !== followupCards ||
    observedCold !== cold
  ) {
    throw new Error(
      'Daily Sales follow-up completion receipt does not match visible artifact types',
    );
  }
}
