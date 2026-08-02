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

export interface ProcurementReviewDeps {
  query: QueryExecutor['query'];
  postCard(
    text: string,
    threadKey: string,
  ): Promise<{ channelJid: string; messageTs: string } | null>;
  postThread(channelJid: string, threadTs: string, text: string): Promise<void>;
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
  return {
    opportunityId: positiveInteger(Number(match[1]), 'opportunityId'),
    expectedVersion: nonnegativeInteger(Number(match[2]), 'expectedVersion'),
    decision: match[3].toLowerCase() as ProcurementReviewDecision,
    reason: cleanReason(match[4]),
  };
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
  const command = parseProcurementDecisionCommand(message.text);
  if (!command) return false;

  const threadTs = message.threadTs?.trim();
  if (!threadTs) return true;

  const postFailure = async (reason: string): Promise<void> => {
    await deps.postThread(
      message.channelJid,
      threadTs,
      `[PROCUREMENT DECISION NOT RECORDED] ${reason}`,
    );
  };

  const policy = currentProcurementReviewPolicy(env);
  if (!policy.enabled || !policy.epoch) {
    await postFailure(`Host review actions are ${policy.reason}.`);
    return true;
  }
  if (!isNamedProcurementOperator(message.actorUid, env)) {
    await postFailure('This Slack user is not a named Procurement operator.');
    return true;
  }

  try {
    const result = await deps.query<AppliedDecisionRow>(
      `SELECT *
         FROM public.fn_apply_procurement_review_card_decision(
           $1, $2, $3, $4, $5, $6, $7, $8
         )`,
      [
        message.channelJid,
        threadTs,
        command.opportunityId,
        command.expectedVersion,
        command.decision,
        command.reason,
        message.actorUid,
        policy.epoch,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('review transition returned no result');
    await deps.postThread(
      message.channelJid,
      threadTs,
      `[PROCUREMENT DECISION RECORDED] #${row.opportunity_id} is ${row.review_state} at v${row.review_version}. Actor: ${message.actorName || message.actorUid}.`,
    );
    logger.info(
      {
        opportunityId: Number(row.opportunity_id),
        reviewState: row.review_state,
        actorUid: message.actorUid,
      },
      'procurement decision recorded',
    );
  } catch (error) {
    logger.warn(
      {
        err: error,
        opportunityId: command.opportunityId,
        expectedVersion: command.expectedVersion,
        actorUid: message.actorUid,
      },
      'procurement decision rejected by host ledger',
    );
    await postFailure(
      'The card is stale, unbound, already used, or the database rejected the transition. Refresh the queue and request a new card.',
    );
  }
  return true;
}

export const defaultProcurementReviewQuery = defaultQuery;
