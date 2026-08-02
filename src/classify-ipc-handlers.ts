/**
 * Host-side IPC handlers for the classify_* namespace.
 *
 * Mailman emits classify_label_write after classifying an email; the host
 * inserts a row into email_classifications, applies a Gmail label via
 * replaceClassLabelsOnThread, and (when taxonomy dictates) syncs to Hive.
 *
 * See plans/nanoclaw/active/2026-04-09-bidirectional-gmail-classification.md
 */

import { query } from './business-db.js';
import { getMessageById, getLatestInboundByThread } from './db.js';
import { writeHostMessage } from './ipc-writer.js';
import {
  removeLabelsFromThread,
  replaceClassLabelsOnThread,
} from './gmail-labels.js';
import { grantHostGmailResources } from './gmail-ipc-policy.js';
import { recordClassification } from './hive-bridge.js';
import { routeClassifiedEmail } from './host-router.js';
import { resetRulesCache } from './classify-rules-runner.js';
import { logger } from './logger.js';

const CLASSIFIER_CONFIDENCE_FLOOR = 0.5;
const AUTO_RULE_CONFIDENCE_FLOOR = 0.9;
const DURATION_WARN_MS = 30_000;

// ---------- Payload types ----------

export interface ClassifyLabelWritePayload {
  type: 'classify_label_write';
  gmail_message_id: string;
  gmail_thread_id: string;
  sender_email: string | null;
  subject: string | null;
  label: string;
  confidence: number;
  reasoning: string;
  classifier_version: string;
}

export interface ClassifyCorrectionDetectedPayload {
  type: 'classify_correction_detected';
  gmail_message_id: string;
  old_label: string;
  new_label: string;
  detected_at: string;
}

export interface ClassifyBackfillPendingPayload {
  type: 'classify_backfill_pending';
  pending_id: number;
  lesson_title: string;
  match_count: number;
  target_label: string;
  dry_run_summary: string;
}

export interface ClassifyBackfillConfirmPayload {
  type: 'classify_backfill_confirm';
  pending_id: number;
  decision: 'approve' | 'reject';
  resolved_by: string;
}

export type ClassifyIpcPayload =
  | ClassifyLabelWritePayload
  | ClassifyCorrectionDetectedPayload
  | ClassifyBackfillPendingPayload
  | ClassifyBackfillConfirmPayload;

// ---------- Dispatch helpers ----------

export function isClassifyIpcType(type: string): boolean {
  return type.startsWith('classify_');
}

export { writeHostMessage } from './ipc-writer.js';

interface TaxonomyRow {
  hive_share_target: string[] | null;
  auto_archive: boolean;
}

/** Check if a label's taxonomy entry has auto_archive=true (safe to skip mailman). */
export async function isAutoArchiveLabel(label: string): Promise<boolean> {
  const row = await loadTaxonomyRow(label);
  return row?.auto_archive === true;
}

async function loadTaxonomyRow(label: string): Promise<TaxonomyRow | null> {
  const res = await query<TaxonomyRow>(
    'SELECT hive_share_target, auto_archive FROM classification_taxonomy WHERE label = $1 LIMIT 1',
    [label],
  );
  if (res.rows.length === 0) return null;
  return res.rows[0];
}

// ---------- Auto-rule creation ----------

/**
 * After a successful LLM classification with high confidence, auto-insert a
 * sender_exact rule so the same sender bypasses the LLM next time.
 * Only fires for LLM classifiers (not rules-runner-v1 to avoid loops).
 */
async function maybeCreateAutoRule(
  data: ClassifyLabelWritePayload,
  autoArchive?: boolean,
): Promise<void> {
  if (data.classifier_version === 'rules-runner-v1') return;
  if (data.confidence < AUTO_RULE_CONFIDENCE_FLOOR) return;
  if (!data.sender_email) return;

  const probationUntil = autoArchive
    ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  try {
    const res = await query(
      `INSERT INTO classification_rules
         (pattern_type, pattern_value, target_label, source, probation_until)
       VALUES ('sender_exact', $1, $2, 'auto', $3)
       ON CONFLICT (pattern_type, pattern_value) DO NOTHING`,
      [data.sender_email.toLowerCase(), data.label, probationUntil],
    );
    if ((res.rowCount ?? 0) > 0) {
      resetRulesCache();
      logger.info(
        { sender: data.sender_email, label: data.label },
        'classify: auto-created sender_exact rule',
      );
    }
  } catch (err) {
    logger.warn(
      { err, sender: data.sender_email },
      'classify: auto-rule insert failed',
    );
  }
}

// ---------- Routed-audit helper ----------

/**
 * Mark an email_classifications row as routed.
 *
 * Called by:
 *   - handleClassifyLabelWrite after the LLM path runs routeAfterClassify
 *   - gmail.ts after the rules-runner path's direct routeClassifiedEmail succeeds
 *
 * Without this, daily follow-up checks treat the reply as "never routed" even
 * though the host-router successfully delivered the [HANDOFF: mailman→sales]
 * IPC — producing false-positive "unprocessed reply" alerts.
 */
export async function markClassificationRouted(
  gmailMessageId: string,
  classifierVersion: string,
): Promise<void> {
  try {
    await query(
      'UPDATE email_classifications SET routed_at = NOW() WHERE gmail_message_id = $1 AND classifier_version = $2',
      [gmailMessageId, classifierVersion],
    );
  } catch (err) {
    logger.warn(
      {
        gmail_message_id: gmailMessageId,
        classifier_version: classifierVersion,
        err,
      },
      'classify-ipc: failed to set routed_at',
    );
  }
}

// ---------- Post-classify routing ----------

/**
 * After an LLM-originated classification, invoke the host-router so lead
 * matching, chief escalation, and minion dispatch happen. Without this,
 * first-time senders (no classification rule) get classified but never
 * routed — their replies sit in mailman without reaching sales or chief.
 */
async function routeAfterClassify(
  data: ClassifyLabelWritePayload,
): Promise<boolean> {
  // Look up the stored message for body/sender context.
  // Gracefully degrade if DB isn't available (tests, race conditions).
  let body = '';
  let senderName = '';
  try {
    let msg = getMessageById(data.gmail_message_id);
    // Guard: if the agent used the thread ID instead of the message ID,
    // we'd find our own outbound email (is_from_me=1). Fall back to the
    // latest inbound message on this thread.
    if (msg && msg.is_from_me && data.gmail_thread_id) {
      const inbound = getLatestInboundByThread(data.gmail_thread_id);
      if (inbound) {
        logger.warn(
          { gmail_message_id: data.gmail_message_id, fallback_id: inbound.id },
          'classify: gmail_message_id pointed to outbound, using inbound fallback',
        );
        msg = inbound;
      }
    }
    if (msg) {
      senderName = msg.sender_name || '';
      const blankLineIdx = msg.content.indexOf('\n\n');
      body =
        blankLineIdx >= 0 ? msg.content.slice(blankLineIdx + 2) : msg.content;
    }
  } catch {
    // DB not available — route with whatever we have from the IPC payload
  }

  try {
    const result = await routeClassifiedEmail({
      label: data.label,
      senderEmail: data.sender_email || '',
      senderName,
      subject: data.subject || '',
      body,
      threadId: data.gmail_thread_id,
      messageId: data.gmail_message_id,
    });
    if (result.routed) {
      logger.info(
        {
          gmail_message_id: data.gmail_message_id,
          label: data.label,
          action: result.action,
          target: result.target,
        },
        'classify: post-classify routing dispatched',
      );
      return true;
    }
    logger.warn(
      {
        gmail_message_id: data.gmail_message_id,
        label: data.label,
        action: result.action,
        reason: result.reason,
      },
      'classify: post-classify routing did not complete',
    );
    return false;
  } catch (err) {
    logger.error(
      { err, gmail_message_id: data.gmail_message_id, label: data.label },
      'classify: post-classify routing failed',
    );
    return false;
  }
}

// ---------- Handlers ----------

export async function handleClassifyLabelWrite(
  data: ClassifyLabelWritePayload,
): Promise<void> {
  const start = Date.now();
  if (data.confidence < CLASSIFIER_CONFIDENCE_FLOOR) {
    logger.warn(
      { gmail_message_id: data.gmail_message_id, confidence: data.confidence },
      'classify_label_write: confidence below floor, escalating to chief',
    );
    writeHostMessage('chief', {
      type: 'message',
      text:
        `[CLASSIFY-REVIEW] Low confidence ${data.confidence.toFixed(2)} for ` +
        `${data.gmail_message_id} (${data.subject ?? 'no subject'}): proposed "${data.label}" — please confirm or relabel.`,
    });
    return;
  }

  const insert = await query(
    `INSERT INTO email_classifications
       (gmail_message_id, gmail_thread_id, sender_email, subject,
        label, confidence, classifier_version, reasoning)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (gmail_message_id) DO UPDATE SET
       label = EXCLUDED.label,
       classifier_version = EXCLUDED.classifier_version,
       reasoning = EXCLUDED.reasoning,
       confidence = EXCLUDED.confidence,
       classified_at = NOW()
     WHERE email_classifications.classifier_version <> EXCLUDED.classifier_version
     RETURNING id`,
    [
      data.gmail_message_id,
      data.gmail_thread_id,
      data.sender_email,
      data.subject,
      data.label,
      data.confidence,
      data.classifier_version,
      data.reasoning,
    ],
  );

  if (insert.rowCount === 0) {
    logger.debug(
      {
        gmail_message_id: data.gmail_message_id,
        classifier_version: data.classifier_version,
      },
      'classify_label_write: idempotent no-op (same classifier_version)',
    );
    return;
  }

  const taxonomy = await loadTaxonomyRow(data.label);

  await replaceClassLabelsOnThread(data.gmail_thread_id, data.label);

  // Auto-create a sender_exact rule so this sender skips the LLM next time
  await maybeCreateAutoRule(data, taxonomy?.auto_archive);

  // Route through host-router for LLM-originated classifications.
  // The rules-runner path already calls routeClassifiedEmail() in gmail.ts,
  // so skip it here to avoid double-routing.
  if (
    data.classifier_version !== 'rules-runner-v1' &&
    !taxonomy?.auto_archive
  ) {
    // Dedup check: skip if this (message_id, classifier_version) pair was already routed.
    let alreadyRouted = false;
    try {
      const dedup = await query<{ routed_at: string | null }>(
        'SELECT routed_at FROM email_classifications WHERE gmail_message_id = $1 AND classifier_version = $2',
        [data.gmail_message_id, data.classifier_version],
      );
      if (dedup.rows[0]?.routed_at) {
        logger.info(
          {
            gmail_message_id: data.gmail_message_id,
            classifier_version: data.classifier_version,
          },
          'classify-ipc: skipping duplicate route (already routed)',
        );
        alreadyRouted = true;
      }
    } catch (err) {
      logger.error(
        { gmail_message_id: data.gmail_message_id, err },
        'classify-ipc: dedup check failed, routing anyway',
      );
    }

    if (!alreadyRouted) {
      const routed = await routeAfterClassify(data);
      if (routed) {
        await markClassificationRouted(
          data.gmail_message_id,
          data.classifier_version,
        );
      }
    }
  }

  let archived = false;
  if (taxonomy?.auto_archive) {
    try {
      await removeLabelsFromThread(data.gmail_thread_id, ['INBOX']);
      archived = true;
    } catch (err) {
      logger.error(
        { err, gmail_message_id: data.gmail_message_id, label: data.label },
        'classify_label_write: auto-archive failed — message remains in inbox',
      );
    }
  }

  const hiveShareTarget = taxonomy?.hive_share_target ?? null;
  let hiveSynced = false;
  if (hiveShareTarget && hiveShareTarget.length > 0) {
    try {
      await recordClassification(
        data.gmail_thread_id,
        data.label,
        hiveShareTarget,
      );
      hiveSynced = true;
      await query(
        'UPDATE email_classifications SET hive_synced = TRUE, hive_synced_at = NOW() WHERE gmail_message_id = $1',
        [data.gmail_message_id],
      );
    } catch (err) {
      logger.error(
        { err, gmail_message_id: data.gmail_message_id },
        'classify_label_write: Hive sync failed — reaper will retry',
      );
    }
  }

  const durationMs = Date.now() - start;
  if (durationMs > DURATION_WARN_MS) {
    logger.warn({ durationMs }, 'classify_label_write: slow path (>30s)');
  }
  logger.info(
    {
      gmail_message_id: data.gmail_message_id,
      label: data.label,
      archived,
      hiveSynced,
      durationMs,
    },
    'classify_label_write: complete',
  );
}

export async function handleClassifyCorrectionDetected(
  data: ClassifyCorrectionDetectedPayload,
): Promise<void> {
  // Gmail history is authoritative for this message ID. Grant chief access to
  // this exact correction target before asking it to synthesize a lesson.
  grantHostGmailResources('chief', { messageId: data.gmail_message_id });
  writeHostMessage('chief', {
    type: 'message',
    text:
      `[CLASSIFY-CORRECTION] Operator changed ${data.gmail_message_id} ` +
      `from ${data.old_label} to ${data.new_label} at ${data.detected_at}. ` +
      `Please call route_lesson to teach mailman.`,
  });
  logger.info({ ...data }, 'classify_correction_detected: chief notified');
}

export async function handleClassifyBackfillPending(
  data: ClassifyBackfillPendingPayload,
): Promise<void> {
  writeHostMessage('chief', {
    type: 'message',
    text:
      `[BACKFILL-PENDING id=${data.pending_id}] Lesson "${data.lesson_title}" ` +
      `would relabel ${data.match_count} past emails to ${data.target_label}. ` +
      `Reply ✅ to approve or ❌ to reject. ${data.dry_run_summary}`,
  });
  logger.info({ ...data }, 'classify_backfill_pending: chief notified');
}

export async function handleClassifyBackfillConfirm(
  data: ClassifyBackfillConfirmPayload,
): Promise<void> {
  const status = data.decision === 'approve' ? 'approved' : 'rejected';
  await query(
    `UPDATE classification_backfill_pending
        SET status = $1, resolved_at = NOW(), resolved_by = $2
      WHERE id = $3`,
    [status, data.resolved_by, data.pending_id],
  );
  logger.info(
    { pending_id: data.pending_id, decision: data.decision },
    'classify_backfill_confirm: state updated',
  );
}

export async function dispatchClassifyIpc(
  data: ClassifyIpcPayload,
): Promise<void> {
  switch (data.type) {
    case 'classify_label_write':
      await handleClassifyLabelWrite(data);
      break;
    case 'classify_correction_detected':
      await handleClassifyCorrectionDetected(data);
      break;
    case 'classify_backfill_pending':
      await handleClassifyBackfillPending(data);
      break;
    case 'classify_backfill_confirm':
      await handleClassifyBackfillConfirm(data);
      break;
    default:
      logger.warn({ data }, 'classify: unknown IPC type');
  }
}
