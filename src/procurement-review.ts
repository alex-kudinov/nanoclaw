/**
 * Host-generated Procurement review cards and named-human decisions.
 *
 * The model may recommend a decision, but only current database truth is
 * rendered into the card. A decision is accepted only as an exact command in
 * that card's Slack thread from an allowlisted Slack user ID. Migration 114
 * atomically binds the card, review version, action epoch, actor, and result.
 */

import type { QueryResultRow } from 'pg';

import { query as businessQuery } from './business-db.js';
import { logger } from './logger.js';
import {
  currentProcurementReviewPolicy,
  isNamedProcurementOperator,
} from './procurement-policy.js';
import type {
  ProcurementReviewDecision,
  QueryExecutor,
} from './procurement-intake.js';

const DECISION_RE =
  /^DECIDE\s+#(\d+)\s+v(\d+)\s+(process|drop|needs_info)\s+(?:—|--|:)\s+(.+)$/is;
const PURSUIT_ADVANCE_RE =
  /^ADVANCE\s+#(\d+)\s+v(\d+)\s+(assessing|blocked|passed)\s+(?:—|--|:)\s+(.+)$/is;
const MAX_REASON_LENGTH = 1_000;
const REVIEW_DECISIONS = new Set<ProcurementReviewDecision>([
  'needs_info',
  'process',
  'drop',
]);

export interface ProcurementDecisionCommand {
  opportunityId: number;
  expectedVersion: number;
  decision: ProcurementReviewDecision;
  reason: string;
}

export interface ProcurementPursuitAdvanceCommand {
  pursuitId: number;
  expectedVersion: number;
  targetState: 'assessing' | 'blocked' | 'passed';
  reason: string;
}

export interface ProcurementReviewCardInput {
  opportunityId: number;
  expectedVersion: number;
  recommendation: ProcurementReviewDecision;
  reason: string;
}

export interface ProcurementReviewCardResult {
  opportunityId: number;
  reviewVersion: number;
  channelJid: string;
  messageTs: string;
  reused: boolean;
}

interface ReviewQueueRow extends QueryResultRow {
  opportunity_id: number | string;
  source: string;
  source_key: string;
  title: string;
  agency: string | null;
  close_date: string | null;
  category: string | null;
  review_state: string;
  review_version: number | string;
  days_until_close: number | string | null;
}

interface ExistingCardRow extends QueryResultRow {
  channel_jid: string;
  message_ts: string;
}

interface RecordedCardRow extends QueryResultRow {
  card_id: number | string;
}

interface AppliedDecisionRow extends QueryResultRow {
  opportunity_id: number | string;
  review_state: ProcurementReviewDecision;
  review_version: number | string;
  status: string;
}

interface AppliedPursuitRow extends QueryResultRow {
  pursuit_id: number | string;
  opportunity_id: number | string;
  pursuit_state: string;
  pursuit_version: number | string;
}

interface PendingActionReceiptRow extends QueryResultRow {
  alert_id: number | string;
  alert_text: string;
}

export interface ProcurementReviewDeps {
  query: QueryExecutor['query'];
  postCard(
    text: string,
    threadKey: string,
  ): Promise<{ channelJid: string; messageTs: string } | null>;
  postThread(
    channelJid: string,
    threadTs: string,
    text: string,
  ): Promise<string | undefined>;
}

const defaultQuery: QueryExecutor['query'] = (sql, params = []) =>
  businessQuery(sql, params);

function cleanReason(value: string): string {
  const reason = value.replace(/\s+/g, ' ').trim();
  if (!reason) throw new Error('procurement review reason is required');
  if (reason.length > MAX_REASON_LENGTH) {
    throw new Error(
      `procurement review reason exceeds ${MAX_REASON_LENGTH} characters`,
    );
  }
  return reason;
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function nonnegativeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a nonnegative integer`);
  }
  return value;
}

export function parseProcurementDecisionCommand(
  text: string,
): ProcurementDecisionCommand | null {
  const match = DECISION_RE.exec(text.trim());
  if (!match) return null;
  try {
    return {
      opportunityId: positiveInteger(Number(match[1]), 'opportunityId'),
      expectedVersion: nonnegativeInteger(Number(match[2]), 'expectedVersion'),
      decision: match[3].toLowerCase() as ProcurementReviewDecision,
      reason: cleanReason(match[4]),
    };
  } catch {
    return null;
  }
}

export function parseProcurementPursuitAdvanceCommand(
  text: string,
): ProcurementPursuitAdvanceCommand | null {
  const match = PURSUIT_ADVANCE_RE.exec(text.trim());
  if (!match) return null;
  try {
    return {
      pursuitId: positiveInteger(Number(match[1]), 'pursuitId'),
      expectedVersion: nonnegativeInteger(Number(match[2]), 'expectedVersion'),
      targetState:
        match[3].toLowerCase() as ProcurementPursuitAdvanceCommand['targetState'],
      reason: cleanReason(match[4]),
    };
  } catch {
    return null;
  }
}

function formatReviewCard(
  row: ReviewQueueRow,
  recommendation: ProcurementReviewDecision,
  reason: string,
): string {
  const opportunityId = Number(row.opportunity_id);
  const version = Number(row.review_version);
  const timing =
    row.days_until_close == null
      ? 'deadline unknown'
      : `${row.days_until_close} day(s)`;
  return [
    `[PROCUREMENT DECISION] #${opportunityId} v${version}`,
    row.title,
    `Source: ${row.source} (${row.source_key})`,
    `Agency: ${row.agency ?? 'unknown'}`,
    `Closes: ${row.close_date ?? 'unknown'} (${timing})`,
    `Category: ${row.category ?? 'unknown'} · Current state: ${row.review_state}`,
    '',
    `Scout recommendation: ${recommendation}`,
    `Scout evidence: ${reason}`,
    '',
    'Named human decision required. Reply in this thread with exactly one:',
    `DECIDE #${opportunityId} v${version} process — <reason>`,
    `DECIDE #${opportunityId} v${version} drop — <reason>`,
    `DECIDE #${opportunityId} v${version} needs_info — <question or missing evidence>`,
    '',
    'A reaction alone never changes Procurement state. Submission remains manual.',
  ].join('\n');
}

export async function createProcurementReviewCard(
  input: ProcurementReviewCardInput,
  deps: ProcurementReviewDeps,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProcurementReviewCardResult> {
  const policy = currentProcurementReviewPolicy(env);
  if (!policy.enabled || !policy.epoch) {
    throw new Error(`procurement review actions are ${policy.reason}`);
  }
  const opportunityId = positiveInteger(input.opportunityId, 'opportunityId');
  const expectedVersion = nonnegativeInteger(
    input.expectedVersion,
    'expectedVersion',
  );
  if (!REVIEW_DECISIONS.has(input.recommendation)) {
    throw new Error('procurement recommendation is invalid');
  }
  const reason = cleanReason(input.reason);

  const existing = await deps.query<ExistingCardRow>(
    `SELECT channel_jid, message_ts
       FROM public.procurement_review_cards
      WHERE opportunity_id = $1
        AND review_version = $2
        AND action_epoch = $3
        AND state = 'open'
      LIMIT 1`,
    [opportunityId, expectedVersion, policy.epoch],
  );
  if (existing.rows[0]) {
    return {
      opportunityId,
      reviewVersion: expectedVersion,
      channelJid: existing.rows[0].channel_jid,
      messageTs: existing.rows[0].message_ts,
      reused: true,
    };
  }

  const current = await deps.query<ReviewQueueRow>(
    `SELECT opportunity_id, source, source_key, title, agency, close_date,
            category, review_state, review_version, days_until_close
       FROM public.v_procurement_review_queue
      WHERE opportunity_id = $1
        AND review_version = $2`,
    [opportunityId, expectedVersion],
  );
  const row = current.rows[0];
  if (!row) {
    throw new Error(
      `procurement opportunity ${opportunityId} v${expectedVersion} is not awaiting review`,
    );
  }

  const posted = await deps.postCard(
    formatReviewCard(row, input.recommendation, reason),
    `procurement:opp:${opportunityId}`,
  );
  if (!posted) throw new Error('procurement review card could not be posted');

  try {
    const recorded = await deps.query<RecordedCardRow>(
      `SELECT public.fn_record_procurement_review_card(
         $1, $2, $3, $4, $5, $6, $7
       ) AS card_id`,
      [
        opportunityId,
        expectedVersion,
        posted.channelJid,
        posted.messageTs,
        policy.epoch,
        input.recommendation,
        reason,
      ],
    );
    if (!recorded.rows[0]?.card_id) {
      throw new Error('procurement review card returned no id');
    }
  } catch (error) {
    await deps.postThread(
      posted.channelJid,
      posted.messageTs,
      '[PROCUREMENT CARD DISARMED] The host could not bind this card to the review ledger. Do not act on it; request a fresh card after the database issue is resolved.',
    );
    throw error;
  }

  return {
    opportunityId,
    reviewVersion: expectedVersion,
    channelJid: posted.channelJid,
    messageTs: posted.messageTs,
    reused: false,
  };
}

export interface ProcurementDecisionMessage {
  channelJid: string;
  threadTs?: string;
  text: string;
  actorUid: string;
  actorName?: string;
}

export async function handleProcurementDecisionMessage(
  message: ProcurementDecisionMessage,
  deps: Pick<ProcurementReviewDeps, 'query' | 'postThread'>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const commandPrefix = /^\s*(DECIDE|ADVANCE)\b/i.test(message.text);
  const decision = parseProcurementDecisionCommand(message.text);
  const advance = parseProcurementPursuitAdvanceCommand(message.text);
  if (!decision && !advance && !commandPrefix) return false;

  const threadTs = message.threadTs?.trim();
  if (!threadTs) return true;

  const postFailure = async (reason: string): Promise<void> => {
    await deps.postThread(
      message.channelJid,
      threadTs,
      `[PROCUREMENT ACTION NOT RECORDED] ${reason}`,
    );
  };

  if (!decision && !advance) {
    await postFailure(
      'Malformed command. Use the exact versioned DECIDE or ADVANCE syntax shown by the host.',
    );
    return true;
  }

  const policy = currentProcurementReviewPolicy(env);
  if (!policy.enabled || !policy.epoch) {
    await postFailure(`Host review actions are ${policy.reason}.`);
    return true;
  }
  if (!isNamedProcurementOperator(message.actorUid, env)) {
    await postFailure('This Slack user is not a named Procurement operator.');
    return true;
  }

  let recorded:
    | { kind: 'decision'; row: AppliedDecisionRow }
    | { kind: 'pursuit'; row: AppliedPursuitRow };
  try {
    if (decision) {
      const result = await deps.query<AppliedDecisionRow>(
        `SELECT *
           FROM public.fn_apply_procurement_review_card_decision(
             $1, $2, $3, $4, $5, $6, $7, $8
           )`,
        [
          message.channelJid,
          threadTs,
          decision.opportunityId,
          decision.expectedVersion,
          decision.decision,
          decision.reason,
          message.actorUid,
          policy.epoch,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error('review transition returned no result');
      recorded = { kind: 'decision', row };
    } else if (advance) {
      const result = await deps.query<AppliedPursuitRow>(
        `SELECT *
           FROM public.fn_apply_procurement_pursuit_advance(
             $1, $2, $3, $4, $5, $6, $7, $8
           )`,
        [
          message.channelJid,
          threadTs,
          advance.pursuitId,
          advance.expectedVersion,
          advance.targetState,
          advance.reason,
          message.actorUid,
          policy.epoch,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error('pursuit transition returned no result');
      recorded = { kind: 'pursuit', row };
    } else {
      return true;
    }
  } catch (error) {
    logger.warn(
      {
        err: error,
        opportunityId: decision?.opportunityId,
        pursuitId: advance?.pursuitId,
        expectedVersion: (decision ?? advance)?.expectedVersion,
        actorUid: message.actorUid,
      },
      'procurement action rejected by host ledger',
    );
    await postFailure(
      'The action is stale, unbound, already used, or the database rejected the transition. Refresh the applicable queue before retrying.',
    );
    return true;
  }

  const receiptSubjectId =
    recorded.kind === 'decision'
      ? String(recorded.row.opportunity_id)
      : String(recorded.row.pursuit_id);
  const receiptVersion =
    recorded.kind === 'decision'
      ? String(recorded.row.review_version)
      : String(recorded.row.pursuit_version);
  const receiptCondition =
    recorded.kind === 'decision' ? 'decision_receipt' : 'pursuit_receipt';
  try {
    const pending = await deps.query<PendingActionReceiptRow>(
      `SELECT id AS alert_id, alert_text
         FROM public.procurement_reconciler_alerts
        WHERE condition_key = $1
          AND subject_id = $2
          AND subject_version = $3
          AND channel_jid = $4
          AND thread_ts = $5
          AND delivered_at IS NULL`,
      [
        receiptCondition,
        receiptSubjectId,
        receiptVersion,
        message.channelJid,
        threadTs,
      ],
    );
    const receipt = pending.rows[0];
    if (!receipt) {
      throw new Error('committed action receipt was not found');
    }
    const messageTs = await deps.postThread(
      message.channelJid,
      threadTs,
      receipt.alert_text,
    );
    if (!messageTs) throw new Error('Slack returned no receipt timestamp');
    const acknowledged = await deps.query<{ acknowledged: boolean }>(
      `SELECT public.fn_ack_procurement_reconciler_alert($1) AS acknowledged`,
      [Number(receipt.alert_id)],
    );
    if (acknowledged.rows[0]?.acknowledged !== true) {
      throw new Error('action receipt acknowledgment returned no update');
    }
  } catch (error) {
    logger.error(
      {
        err: error,
        receiptCondition,
        subjectId: receiptSubjectId,
        subjectVersion: receiptVersion,
      },
      'procurement action recorded; durable Slack receipt remains pending',
    );
  }

  logger.info(
    recorded.kind === 'decision'
      ? {
          opportunityId: Number(recorded.row.opportunity_id),
          reviewState: recorded.row.review_state,
          actorUid: message.actorUid,
        }
      : {
          pursuitId: Number(recorded.row.pursuit_id),
          pursuitState: recorded.row.pursuit_state,
          actorUid: message.actorUid,
        },
    recorded.kind === 'decision'
      ? 'procurement decision recorded'
      : 'procurement pursuit advanced',
  );
  return true;
}

export const defaultProcurementReviewQuery = defaultQuery;
