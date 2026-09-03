import { query } from './business-db.js';
import {
  handleClassifyLabelWrite,
  retryUnroutedClassification,
  type ClassifyLabelWritePayload,
} from './classify-ipc-handlers.js';
import { listRawInboundGmailMessagesBefore } from './db.js';
import { extractSenderEmail } from './classify-rules-runner.js';
import { logger } from './logger.js';

export const GMAIL_CLASSIFICATION_REAPER_GRACE_MS = 60_000;
export const GMAIL_CLASSIFICATION_REAPER_INTERVAL_MS = 60_000;
const MAX_CANDIDATES = 500;
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

type StoredClassification = ClassifyLabelWritePayload & {
  routed_at: string | null;
};

function fallbackPayload(
  message: ReturnType<typeof listRawInboundGmailMessagesBefore>[number],
): ClassifyLabelWritePayload {
  const blank = message.content.search(/\r?\n\r?\n/);
  const headers =
    blank >= 0 ? message.content.slice(0, blank) : message.content;
  const from = headers.match(/^From:\s*([^\r\n]+)$/im)?.[1] ?? '';
  return {
    type: 'classify_label_write',
    gmail_message_id: message.id,
    gmail_thread_id:
      headers.match(/^Thread-ID:\s*(\S+)\s*$/im)?.[1] ||
      message.thread_ts ||
      message.id,
    sender_email: extractSenderEmail(from),
    subject: headers.match(/^Subject:\s*([^\r\n]*)$/im)?.[1] ?? '',
    label: 'MrGru/other',
    confidence: 0.5,
    reasoning:
      'Host fallback: accepted inbound Gmail message exceeded the classification grace period without a durable Mailman classification.',
    classifier_version: 'mailman-host-fallback-v1',
  };
}

export async function runGmailClassificationReaper(now = new Date()): Promise<{
  scanned: number;
  recoveredMissing: number;
  retriedUnrouted: number;
}> {
  const before = new Date(
    now.getTime() - GMAIL_CLASSIFICATION_REAPER_GRACE_MS,
  ).toISOString();
  const after = new Date(now.getTime() - LOOKBACK_MS).toISOString();
  const messages = listRawInboundGmailMessagesBefore(
    before,
    MAX_CANDIDATES,
    after,
  );
  if (messages.length === 0) {
    return { scanned: 0, recoveredMissing: 0, retriedUnrouted: 0 };
  }
  const ids = messages.map((message) => message.id);
  const result = await query<StoredClassification>(
    `SELECT ec.gmail_message_id,
            ec.gmail_thread_id,
            ec.sender_email,
            ec.subject,
            ec.label,
            ec.confidence,
            ec.reasoning,
            ec.classifier_version,
            ec.routed_at,
            'classify_label_write'::text AS type
       FROM email_classifications ec
      WHERE ec.gmail_message_id = ANY($1::text[])`,
    [ids],
  );
  const byId = new Map(result.rows.map((row) => [row.gmail_message_id, row]));
  let recoveredMissing = 0;
  let retriedUnrouted = 0;
  for (const message of messages) {
    const classification = byId.get(message.id);
    if (!classification) {
      await handleClassifyLabelWrite(fallbackPayload(message));
      recoveredMissing++;
      continue;
    }
    if (!classification.routed_at) {
      if (await retryUnroutedClassification(classification)) {
        retriedUnrouted++;
      }
    }
  }
  logger.info(
    { scanned: messages.length, recoveredMissing, retriedUnrouted },
    'gmail-classification-reaper: completed',
  );
  return { scanned: messages.length, recoveredMissing, retriedUnrouted };
}
