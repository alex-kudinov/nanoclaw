/**
 * Default-off, host-owned operator review for completed Sales-email outcomes.
 *
 * The Company Work ledger supplies opaque work/receipt bindings. The host then
 * proves those bindings against the exact SQLite action, routed Slack request,
 * approved draft, Gmail delivery event, and Slack outcome receipt. One private
 * Chief packet presents the already-held evidence to a named operator. Only a
 * configured reaction can create a quality receipt; no model or agent decides.
 */

import { createHash } from 'node:crypto';

import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

import { buildApprovedHandoff } from './approved-send-handoff.js';
import { query, withAgentContext } from './business-db.js';
import {
  getMessageById,
  getPendingSendByActionId,
  listEmailSendEvents,
  findEmailActionOutcomeReceipt,
  type EmailActionOutcomeReceipt,
  type EmailSendActionRow,
} from './db.js';
import { hashApprovedEmailContent } from './email-action.js';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';
import {
  COMPANY_WORK_OUTCOME_ASSESSMENT_CONFIRMATION,
  runCompanyWorkOutcomeAssessment,
  type CompanyWorkOutcomeAssessment,
} from './company-work-outcome-quality-assessment.js';
import {
  resolveCompanyWorkSourceContext,
  type CompanyWorkSourceContext,
} from './company-work-source-context.js';
import type { NewMessage } from './types.js';

const ACTOR = 'company-work-outcome-review:host';
const CHIEF_FOLDER = 'chief' as const;
const STARTUP_DELAY_MS = 5_000;
const DEFAULT_INTERVAL_MS = 24 * 60 * 60_000;
const MIN_INTERVAL_MS = 5 * 60_000;
const MAX_INTERVAL_MS = 7 * 24 * 60 * 60_000;
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 365;
const DEFAULT_CANDIDATE_LIMIT = 25;
const MAX_CANDIDATE_LIMIT = 100;
const MAX_EVIDENCE_CHARS = 12_000;
const MAX_PACKET_CHARS = 3_900;
const SLACK_UID_PATTERN = /^[UW][A-Z0-9]{6,31}$/;
const OPEN_PACKET_LOCK_KEY = 'company-work-outcome-review:open-packet';

export const COMPANY_WORK_OUTCOME_REVIEW_ENV_KEYS = [
  'COMPANY_WORK_OUTCOME_REVIEW_ENABLED',
  'COMPANY_WORK_OUTCOME_REVIEW_OPERATOR_UIDS',
  'COMPANY_WORK_OUTCOME_REVIEW_INTERVAL_MS',
  'COMPANY_WORK_OUTCOME_REVIEW_WINDOW_DAYS',
  'COMPANY_WORK_OUTCOME_REVIEW_CANDIDATE_LIMIT',
] as const;

export const COMPANY_WORK_OUTCOME_REVIEW_REACTIONS = {
  white_check_mark: 'clean',
  heavy_check_mark: 'clean',
  ballot_box_with_check: 'clean',
  bug: 'customer_visible_defect',
  leftwards_arrow_with_hook: 'customer_visible_reversal',
  rotating_light: 'customer_visible_defect_and_reversal',
} as const satisfies Record<string, CompanyWorkOutcomeAssessment>;

export type CompanyWorkOutcomeReviewReaction =
  keyof typeof COMPANY_WORK_OUTCOME_REVIEW_REACTIONS;

export interface CompanyWorkOutcomeReviewConfig {
  enabled: boolean;
  active: boolean;
  operatorUids: string[];
  intervalMs: number;
  windowDays: number;
  candidateLimit: number;
  targetFolder: typeof CHIEF_FOLDER;
  configurationError: string | null;
}

export interface CompanyWorkOutcomeReviewTarget {
  workItemId: string;
  sourceSystem: 'sqlite_email_action';
  sourceKey: string;
  deliveryEventVersion: number;
  deliveryOccurredAt: string;
  deliveryReceiptSystem: 'gmail';
  deliveryReceiptKey: string;
  outcomeEventVersion: number;
  outcomeOccurredAt: string;
  outcomeReceiptSystem: 'sqlite_messages';
  outcomeReceiptKey: string;
}

export interface CompanyWorkOutcomeReviewEvidence {
  target: CompanyWorkOutcomeReviewTarget;
  sourceText: string;
  approvedSubject: string;
  approvedBody: string;
  evidenceSha256: string;
  sourceKeySha256: string;
  packetFingerprint: string;
  evidenceOccurredAt: string;
}

export interface CompanyWorkOutcomeReviewPacketClaim {
  id: string;
  workItemId: string;
  deliveryEventVersion: number;
  packetFingerprint: string;
  sourceKeySha256: string;
  evidenceSha256: string;
  evidenceOccurredAt: string;
}

export interface CompanyWorkOutcomeReviewPacketBinding extends CompanyWorkOutcomeReviewPacketClaim {
  status: 'posted' | 'decided';
  channelJid: string;
  messageTs: string;
  decisionAssessment: CompanyWorkOutcomeAssessment | null;
  decisionActorSha256: string | null;
  decisionReaction: CompanyWorkOutcomeReviewReaction | null;
  decidedAt: string | null;
  assessmentReceiptId: string | null;
  decisionReceiptStatus: 'none' | 'pending' | 'posted' | 'uncertain';
}

export interface CompanyWorkOutcomeReviewStore {
  listCandidates(
    sinceIso: string,
    limit: number,
  ): Promise<CompanyWorkOutcomeReviewTarget[]>;
  claimPacket(
    evidence: CompanyWorkOutcomeReviewEvidence,
    claimedAt: string,
  ): Promise<CompanyWorkOutcomeReviewPacketClaim | null>;
  markPacketPosted(
    packetId: string,
    channelJid: string,
    messageTs: string,
    postedAt: string,
  ): Promise<void>;
  markPacketDeliveryUncertain(
    packetId: string,
    channelJid: string,
    failureCode: string,
    occurredAt: string,
  ): Promise<void>;
  findPacket(
    channelJid: string,
    messageTs: string,
  ): Promise<CompanyWorkOutcomeReviewPacketBinding | null>;
  recordDecision(input: {
    packetId: string;
    assessment: CompanyWorkOutcomeAssessment;
    actorSha256: string;
    reaction: CompanyWorkOutcomeReviewReaction;
    decidedAt: string;
    assessmentReceiptId: string;
  }): Promise<void>;
  markDecisionReceipt(
    packetId: string,
    status: 'posted' | 'uncertain',
    occurredAt: string,
    receiptTs?: string,
  ): Promise<void>;
}

export interface CompanyWorkOutcomeReviewStoreDb {
  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
  withAgentContext<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
}

export interface CompanyWorkOutcomeReviewEvidenceDeps {
  resolveSourceContext(
    target: CompanyWorkOutcomeReviewTarget,
  ): CompanyWorkSourceContext;
  getAction(actionId: string): EmailSendActionRow | undefined;
  getMessage(messageId: string, chatJid?: string): NewMessage | undefined;
  listEvents: typeof listEmailSendEvents;
  findOutcomeReceipt(actionId: string): {
    receipt?: EmailActionOutcomeReceipt;
    ambiguous: boolean;
  };
}

export interface CompanyWorkOutcomeReviewDeps {
  store: CompanyWorkOutcomeReviewStore;
  resolveTargetJid(folder: string): string | null;
  assembleEvidence(
    target: CompanyWorkOutcomeReviewTarget,
  ): CompanyWorkOutcomeReviewEvidence | null;
  postPacket(jid: string, text: string): Promise<string | undefined>;
  postThread(
    jid: string,
    threadTs: string,
    text: string,
  ): Promise<string | undefined>;
  assess(input: {
    workItemId: string;
    deliveryEventVersion: number;
    assessment: CompanyWorkOutcomeAssessment;
    sourceKeySha256: string;
    evidenceSha256: string;
    assessorKeySha256: string;
    evidenceOccurredAt: string;
    assessedAt: string;
  }): Promise<{ receiptId: string; duplicate: boolean }>;
  now(): string;
}

export interface CompanyWorkOutcomeReviewRunResult {
  outcome:
    | 'disabled'
    | 'unavailable'
    | 'no_candidates'
    | 'no_reviewable_evidence'
    | 'duplicate_packet'
    | 'posted'
    | 'delivery_uncertain';
  scanned: number;
  sourceUnavailable: number;
  packetId: string | null;
  messageTs: string | null;
  errorCode: string | null;
}

export interface CompanyWorkOutcomeReviewStatus {
  mode: 'disabled' | 'misconfigured' | 'active';
  operatorCount: number;
  intervalMs: number;
  windowDays: number;
  candidateLimit: number;
  targetFolder: typeof CHIEF_FOLDER;
  running: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  totalRuns: number;
  consecutiveFailures: number;
  lastErrorCode: string | null;
  lastResult: CompanyWorkOutcomeReviewRunResult | null;
}

export interface SlackReactionProvenance {
  jid: string;
  reactorUid: string;
  reaction: string;
  occurredAt: string;
}

interface CandidateRow extends QueryResultRow {
  work_item_id: string;
  source_system: string;
  source_key: string;
  delivery_event_version: number;
  delivery_occurred_at: Date | string;
  delivery_receipt_system: string;
  delivery_receipt_key: string;
  outcome_event_version: number;
  outcome_occurred_at: Date | string;
  outcome_receipt_system: string;
  outcome_receipt_key: string;
}

interface PacketRow extends QueryResultRow {
  id: string;
  work_item_id: string;
  delivery_event_version: number;
  packet_fingerprint: string;
  source_key_sha256: string;
  evidence_sha256: string;
  evidence_occurred_at: Date | string;
  status: string;
  slack_channel_jid: string | null;
  slack_message_ts: string | null;
  decision_assessment: string | null;
  decision_actor_sha256: string | null;
  decision_reaction: string | null;
  decided_at: Date | string | null;
  assessment_receipt_id: string | null;
  decision_receipt_status: string;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(',')}}`;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function canonicalTimestamp(value: Date | string): string {
  const normalized =
    value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  if (!Number.isFinite(Date.parse(normalized)))
    throw new Error('invalid_timestamp');
  return normalized;
}

function parseBoundedInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  errorCode: string,
): { value: number; error: string | null } {
  if (raw === undefined || raw === '') return { value: fallback, error: null };
  const value = Number(raw);
  return Number.isInteger(value) && value >= minimum && value <= maximum
    ? { value, error: null }
    : { value: fallback, error: errorCode };
}

function parseOperatorUids(raw: string | undefined): {
  values: string[];
  error: string | null;
} {
  const values = (raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (new Set(values).size !== values.length)
    return { values: [], error: 'duplicate_operator_uid' };
  if (values.some((value) => !SLACK_UID_PATTERN.test(value)))
    return { values: [], error: 'invalid_operator_uid' };
  return { values: [...values].sort(), error: null };
}

export function resolveCompanyWorkOutcomeReviewConfig(
  supplied?: Record<string, string | undefined>,
): CompanyWorkOutcomeReviewConfig {
  const fileValues: Record<string, string | undefined> = supplied
    ? {}
    : readEnvFile([...COMPANY_WORK_OUTCOME_REVIEW_ENV_KEYS]);
  const values =
    supplied ??
    Object.fromEntries(
      COMPANY_WORK_OUTCOME_REVIEW_ENV_KEYS.map((key) => [
        key,
        process.env[key] || fileValues[key],
      ]),
    );
  const enabled = values.COMPANY_WORK_OUTCOME_REVIEW_ENABLED === '1';
  const operators = parseOperatorUids(
    values.COMPANY_WORK_OUTCOME_REVIEW_OPERATOR_UIDS,
  );
  const interval = parseBoundedInteger(
    values.COMPANY_WORK_OUTCOME_REVIEW_INTERVAL_MS,
    DEFAULT_INTERVAL_MS,
    MIN_INTERVAL_MS,
    MAX_INTERVAL_MS,
    'invalid_interval_ms',
  );
  const window = parseBoundedInteger(
    values.COMPANY_WORK_OUTCOME_REVIEW_WINDOW_DAYS,
    DEFAULT_WINDOW_DAYS,
    1,
    MAX_WINDOW_DAYS,
    'invalid_window_days',
  );
  const limit = parseBoundedInteger(
    values.COMPANY_WORK_OUTCOME_REVIEW_CANDIDATE_LIMIT,
    DEFAULT_CANDIDATE_LIMIT,
    1,
    MAX_CANDIDATE_LIMIT,
    'invalid_candidate_limit',
  );
  const configurationError = enabled
    ? (operators.error ??
      (operators.values.length === 0
        ? 'operator_uid_required'
        : (interval.error ?? window.error ?? limit.error)))
    : null;
  return {
    enabled,
    active: enabled && configurationError === null,
    operatorUids: operators.values,
    intervalMs: interval.value,
    windowDays: window.value,
    candidateLimit: limit.value,
    targetFolder: CHIEF_FOLDER,
    configurationError,
  };
}

function privacyMinimizeSource(text: string): string {
  const identityHeader =
    /^\s*(?:party(?:\s+id)?|name|email|from|to|cc|phone|known-to-us|thread-id|source-thread-id|message-id|source)\s*:/i;
  const email =
    /\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+\b/gi;
  return text
    .split(/\r?\n/)
    .filter((line) => !identityHeader.test(line))
    .join('\n')
    .replace(email, '[email redacted]')
    .trim();
}

export function assembleCompanyWorkOutcomeReviewEvidence(
  target: CompanyWorkOutcomeReviewTarget,
  deps: CompanyWorkOutcomeReviewEvidenceDeps = {
    resolveSourceContext: (value) =>
      resolveCompanyWorkSourceContext(
        {
          workflowType: 'sales_email',
          sourceSystem: value.sourceSystem,
          sourceKey: value.sourceKey,
        },
        { bindMissingSourceMessage: false, maxSourceChars: MAX_EVIDENCE_CHARS },
      ),
    getAction: getPendingSendByActionId,
    getMessage: getMessageById,
    listEvents: listEmailSendEvents,
    findOutcomeReceipt: findEmailActionOutcomeReceipt,
  },
): CompanyWorkOutcomeReviewEvidence | null {
  const action = deps.getAction(target.sourceKey);
  if (
    target.sourceSystem !== 'sqlite_email_action' ||
    target.deliveryReceiptSystem !== 'gmail' ||
    target.outcomeReceiptSystem !== 'sqlite_messages' ||
    !action ||
    action.actionId !== target.sourceKey ||
    action.groupFolder !== 'sales' ||
    action.state !== 'confirmed' ||
    !action.threadTs ||
    !action.gmailMessageId ||
    action.gmailMessageId !== target.deliveryReceiptKey ||
    !action.completedAt ||
    canonicalTimestamp(action.completedAt) !==
      canonicalTimestamp(target.deliveryOccurredAt) ||
    !action.approvedSubject ||
    !action.approvedContentSha256
  )
    return null;

  const source = deps.resolveSourceContext(target);
  if (
    source.status !== 'attached' ||
    !source.bodyComplete ||
    !source.sourceText
  )
    return null;
  const minimizedSource = privacyMinimizeSource(source.sourceText);
  if (!minimizedSource || minimizedSource.length > MAX_EVIDENCE_CHARS)
    return null;

  const draft = deps.getMessage(action.draftTs, action.chatJid);
  if (
    !draft ||
    draft.id !== action.draftTs ||
    draft.chat_jid !== action.chatJid ||
    draft.thread_ts !== action.threadTs ||
    draft.from_group !== 'sales'
  )
    return null;
  const approved = buildApprovedHandoff(draft.content);
  if (
    !approved ||
    approved.subject !== action.approvedSubject ||
    hashApprovedEmailContent(approved.subject, approved.body) !==
      action.approvedContentSha256 ||
    approved.subject.length + approved.body.length > MAX_EVIDENCE_CHARS
  )
    return null;

  const confirmed = deps
    .listEvents(target.sourceKey)
    .filter((event) => event.stage === 'confirmed');
  if (
    confirmed.length !== 1 ||
    confirmed[0].gmailMessageId !== target.deliveryReceiptKey ||
    canonicalTimestamp(confirmed[0].occurredAt) !==
      canonicalTimestamp(target.deliveryOccurredAt)
  )
    return null;
  const outcome = deps.findOutcomeReceipt(target.sourceKey);
  if (
    outcome.ambiguous ||
    !outcome.receipt ||
    outcome.receipt.messageId !== target.outcomeReceiptKey ||
    canonicalTimestamp(outcome.receipt.occurredAt) !==
      canonicalTimestamp(target.outcomeOccurredAt)
  )
    return null;

  const evidenceOccurredAt = canonicalTimestamp(
    Date.parse(target.deliveryOccurredAt) > Date.parse(target.outcomeOccurredAt)
      ? target.deliveryOccurredAt
      : target.outcomeOccurredAt,
  );
  const evidenceSha256 = sha256([
    'company-work-outcome-review-evidence:v1',
    target,
    action.actionId,
    action.chatJid,
    action.threadTs,
    action.draftTs,
    sha256(['source:v1', source.sourceText]),
    sha256(['approved:v1', approved.subject, approved.body]),
  ]);
  const sourceKeySha256 = sha256([
    'company-work-outcome-review-source:v1',
    target.workItemId,
    target.deliveryEventVersion,
    evidenceSha256,
  ]);
  const packetFingerprint = sha256([
    'company-work-outcome-review-packet:v1',
    target.workItemId,
    target.deliveryEventVersion,
    sourceKeySha256,
    evidenceSha256,
  ]);
  return {
    target,
    sourceText: minimizedSource,
    approvedSubject: approved.subject,
    approvedBody: approved.body,
    evidenceSha256,
    sourceKeySha256,
    packetFingerprint,
    evidenceOccurredAt,
  };
}

export function renderCompanyWorkOutcomeReviewPacket(
  evidence: CompanyWorkOutcomeReviewEvidence,
  packetId: string,
): string {
  return [
    `:mag: *Company OS outcome review packet #${packetId} / work #${evidence.target.workItemId}*`,
    'Human classification only. This packet was assembled from exact host receipts; no agent inferred an outcome and Gmail was not searched.',
    `Delivery event v${evidence.target.deliveryEventVersion}: ${evidence.target.deliveryReceiptSystem} receipt \`${evidence.target.deliveryReceiptKey}\` at ${evidence.target.deliveryOccurredAt}.`,
    `Outcome event v${evidence.target.outcomeEventVersion}: ${evidence.target.outcomeReceiptSystem} receipt \`${evidence.target.outcomeReceiptKey}\` at ${evidence.target.outcomeOccurredAt}.`,
    '',
    '*Customer request (identity headers removed)*',
    evidence.sourceText,
    '',
    '*Exact approved response*',
    `Subject: ${evidence.approvedSubject}`,
    evidence.approvedBody,
    '',
    'React exactly once: ✅ clean · 🐛 customer-visible defect · ↩️ customer-visible reversal · 🚨 both defect and reversal.',
    'No reaction means no decision. A reaction records only the quality receipt; it does not send email, remediate, retry, or change the workflow.',
  ].join('\n');
}

function normalizeTarget(row: CandidateRow): CompanyWorkOutcomeReviewTarget {
  if (
    row.source_system !== 'sqlite_email_action' ||
    row.delivery_receipt_system !== 'gmail' ||
    row.outcome_receipt_system !== 'sqlite_messages'
  ) {
    throw new Error('candidate_contract_invalid');
  }
  return {
    workItemId: row.work_item_id,
    sourceSystem: 'sqlite_email_action',
    sourceKey: row.source_key,
    deliveryEventVersion: Number(row.delivery_event_version),
    deliveryOccurredAt: canonicalTimestamp(row.delivery_occurred_at),
    deliveryReceiptSystem: 'gmail',
    deliveryReceiptKey: row.delivery_receipt_key,
    outcomeEventVersion: Number(row.outcome_event_version),
    outcomeOccurredAt: canonicalTimestamp(row.outcome_occurred_at),
    outcomeReceiptSystem: 'sqlite_messages',
    outcomeReceiptKey: row.outcome_receipt_key,
  };
}

function packetClaim(row: PacketRow): CompanyWorkOutcomeReviewPacketClaim {
  return {
    id: row.id,
    workItemId: row.work_item_id,
    deliveryEventVersion: Number(row.delivery_event_version),
    packetFingerprint: row.packet_fingerprint,
    sourceKeySha256: row.source_key_sha256,
    evidenceSha256: row.evidence_sha256,
    evidenceOccurredAt: canonicalTimestamp(row.evidence_occurred_at),
  };
}

async function appendPacketEvent(
  client: PoolClient,
  packetId: string,
  eventType: string,
  eventKey: string,
  evidence: unknown,
  occurredAt: string,
): Promise<void> {
  await client.query(
    `INSERT INTO business_v2.company_work_outcome_review_events
       (packet_id, event_type, event_key, evidence_sha256, occurred_at)
     VALUES ($1::bigint, $2, $3, $4, $5::timestamptz)`,
    [packetId, eventType, eventKey, sha256(evidence), occurredAt],
  );
}

export class PostgresCompanyWorkOutcomeReviewStore implements CompanyWorkOutcomeReviewStore {
  constructor(
    private readonly db: CompanyWorkOutcomeReviewStoreDb = {
      query,
      withAgentContext: (fn) => withAgentContext(ACTOR, fn),
    },
  ) {}

  async listCandidates(
    sinceIso: string,
    limit: number,
  ): Promise<CompanyWorkOutcomeReviewTarget[]> {
    const result = await this.db.query<CandidateRow>(
      `SELECT i.id::text AS work_item_id, i.source_system, i.source_key,
              d.work_item_version AS delivery_event_version,
              d.occurred_at AS delivery_occurred_at,
              d.receipt_system AS delivery_receipt_system,
              d.receipt_key AS delivery_receipt_key,
              o.work_item_version AS outcome_event_version,
              o.occurred_at AS outcome_occurred_at,
              o.receipt_system AS outcome_receipt_system,
              o.receipt_key AS outcome_receipt_key
         FROM business_v2.company_work_items i
         JOIN LATERAL (
           SELECT min(e.work_item_version)::integer AS work_item_version,
                  min(e.occurred_at) AS occurred_at,
                  min(r.receipt_system) AS receipt_system,
                  min(r.receipt_key) AS receipt_key
             FROM business_v2.company_work_events e
             JOIN business_v2.company_work_receipts r
               ON r.work_item_id = e.work_item_id AND r.id = e.receipt_id
            WHERE e.work_item_id = i.id AND e.event_type = 'external_acknowledged'
            HAVING count(*) = 1
         ) d ON true
         JOIN LATERAL (
           SELECT min(e.work_item_version)::integer AS work_item_version,
                  min(e.occurred_at) AS occurred_at,
                  min(r.receipt_system) AS receipt_system,
                  min(r.receipt_key) AS receipt_key
             FROM business_v2.company_work_events e
             JOIN business_v2.company_work_receipts r
               ON r.work_item_id = e.work_item_id AND r.id = e.receipt_id
            WHERE e.work_item_id = i.id AND e.event_type = 'outcome_validated'
            HAVING count(*) = 1
         ) o ON true
        WHERE i.workflow_type = 'sales_email'
          AND i.source_system = 'sqlite_email_action'
          AND i.stage = 'outcome_validated' AND i.disposition = 'completed'
          AND o.occurred_at >= $1::timestamptz
          AND d.receipt_system = 'gmail'
          AND o.receipt_system = 'sqlite_messages'
          AND NOT EXISTS (
            SELECT 1 FROM business_v2.company_work_outcome_quality_receipts q
             WHERE q.work_item_id = i.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM business_v2.company_work_outcome_review_packets p
             WHERE p.work_item_id = i.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM business_v2.company_work_outcome_review_packets p
             WHERE p.status <> 'decided'
          )
        ORDER BY o.occurred_at, i.id
        LIMIT $2::integer`,
      [sinceIso, limit],
    );
    return result.rows.map(normalizeTarget);
  }

  async claimPacket(
    evidence: CompanyWorkOutcomeReviewEvidence,
    claimedAt: string,
  ): Promise<CompanyWorkOutcomeReviewPacketClaim | null> {
    return this.db.withAgentContext(async (client) => {
      // One human decision at a time. The candidate query avoids unnecessary
      // evidence assembly while a packet is open; this transaction lock and
      // repeat check are the concurrency boundary across daemon restarts or
      // overlapping host processes.
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [OPEN_PACKET_LOCK_KEY],
      );
      const open = await client.query(
        `SELECT 1
           FROM business_v2.company_work_outcome_review_packets
          WHERE status <> 'decided'
          LIMIT 1`,
      );
      if (open.rows.length > 0) return null;
      const inserted = await client.query<PacketRow>(
        `INSERT INTO business_v2.company_work_outcome_review_packets
           (work_item_id, delivery_event_version, packet_fingerprint,
            source_key_sha256, evidence_sha256, evidence_occurred_at)
         VALUES ($1::bigint, $2::integer, $3, $4, $5, $6::timestamptz)
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [
          evidence.target.workItemId,
          evidence.target.deliveryEventVersion,
          evidence.packetFingerprint,
          evidence.sourceKeySha256,
          evidence.evidenceSha256,
          evidence.evidenceOccurredAt,
        ],
      );
      const row = inserted.rows[0];
      if (!row) return null;
      await appendPacketEvent(
        client,
        row.id,
        'claimed',
        `packet:${row.packet_fingerprint}:claimed`,
        ['claimed', row.packet_fingerprint],
        claimedAt,
      );
      return packetClaim(row);
    });
  }

  async markPacketPosted(
    packetId: string,
    channelJid: string,
    messageTs: string,
    postedAt: string,
  ): Promise<void> {
    await this.db.withAgentContext(async (client) => {
      const updated = await client.query<PacketRow>(
        `UPDATE business_v2.company_work_outcome_review_packets
            SET status = 'posted', slack_channel_jid = $2,
                slack_message_ts = $3, posted_at = $4::timestamptz
          WHERE id = $1::bigint AND status = 'pending' RETURNING *`,
        [packetId, channelJid, messageTs, postedAt],
      );
      const row = updated.rows[0];
      if (!row) throw new Error('outcome_review_post_binding_failed');
      await appendPacketEvent(
        client,
        packetId,
        'posted',
        `packet:${row.packet_fingerprint}:posted`,
        ['posted', channelJid, messageTs],
        postedAt,
      );
    });
  }

  async markPacketDeliveryUncertain(
    packetId: string,
    channelJid: string,
    failureCode: string,
    occurredAt: string,
  ): Promise<void> {
    await this.db.withAgentContext(async (client) => {
      const updated = await client.query<PacketRow>(
        `UPDATE business_v2.company_work_outcome_review_packets
            SET status = 'delivery_uncertain', slack_channel_jid = $2,
                failure_code = $3
          WHERE id = $1::bigint AND status = 'pending' RETURNING *`,
        [packetId, channelJid, failureCode],
      );
      const row = updated.rows[0];
      if (!row) throw new Error('outcome_review_uncertain_binding_failed');
      await appendPacketEvent(
        client,
        packetId,
        'delivery_uncertain',
        `packet:${row.packet_fingerprint}:delivery-uncertain`,
        ['delivery_uncertain', channelJid, failureCode],
        occurredAt,
      );
    });
  }

  async findPacket(
    channelJid: string,
    messageTs: string,
  ): Promise<CompanyWorkOutcomeReviewPacketBinding | null> {
    const result = await this.db.query<PacketRow>(
      `SELECT * FROM business_v2.company_work_outcome_review_packets
        WHERE status IN ('posted', 'decided') AND slack_channel_jid = $1
          AND slack_message_ts = $2`,
      [channelJid, messageTs],
    );
    const row = result.rows[0];
    if (
      !row ||
      !row.slack_channel_jid ||
      !row.slack_message_ts ||
      (row.status !== 'posted' && row.status !== 'decided')
    )
      return null;
    return {
      ...packetClaim(row),
      status: row.status,
      channelJid: row.slack_channel_jid,
      messageTs: row.slack_message_ts,
      decisionAssessment:
        row.decision_assessment as CompanyWorkOutcomeAssessment | null,
      decisionActorSha256: row.decision_actor_sha256,
      decisionReaction:
        row.decision_reaction as CompanyWorkOutcomeReviewReaction | null,
      decidedAt: row.decided_at ? canonicalTimestamp(row.decided_at) : null,
      assessmentReceiptId: row.assessment_receipt_id,
      decisionReceiptStatus:
        row.decision_receipt_status as CompanyWorkOutcomeReviewPacketBinding['decisionReceiptStatus'],
    };
  }

  async recordDecision(input: {
    packetId: string;
    assessment: CompanyWorkOutcomeAssessment;
    actorSha256: string;
    reaction: CompanyWorkOutcomeReviewReaction;
    decidedAt: string;
    assessmentReceiptId: string;
  }): Promise<void> {
    await this.db.withAgentContext(async (client) => {
      const updated = await client.query<PacketRow>(
        `UPDATE business_v2.company_work_outcome_review_packets
            SET status = 'decided', decision_assessment = $2,
                decision_actor_sha256 = $3, decision_reaction = $4,
                decided_at = $5::timestamptz, assessment_receipt_id = $6::bigint,
                decision_receipt_status = 'pending'
          WHERE id = $1::bigint AND status = 'posted' RETURNING *`,
        [
          input.packetId,
          input.assessment,
          input.actorSha256,
          input.reaction,
          input.decidedAt,
          input.assessmentReceiptId,
        ],
      );
      const row = updated.rows[0];
      if (!row) throw new Error('outcome_review_decision_binding_failed');
      await appendPacketEvent(
        client,
        input.packetId,
        'decision_recorded',
        `packet:${row.packet_fingerprint}:decision`,
        [
          'decision',
          input.assessment,
          input.actorSha256,
          input.reaction,
          input.assessmentReceiptId,
        ],
        input.decidedAt,
      );
    });
  }

  async markDecisionReceipt(
    packetId: string,
    status: 'posted' | 'uncertain',
    occurredAt: string,
    receiptTs?: string,
  ): Promise<void> {
    if ((status === 'posted') !== Boolean(receiptTs))
      throw new Error('outcome_review_decision_receipt_identity_mismatch');
    await this.db.withAgentContext(async (client) => {
      const updated = await client.query<PacketRow>(
        `UPDATE business_v2.company_work_outcome_review_packets
            SET decision_receipt_status = $2, decision_receipt_ts = $3
          WHERE id = $1::bigint AND status = 'decided'
            AND decision_receipt_status = 'pending' RETURNING *`,
        [packetId, status, receiptTs ?? null],
      );
      const row = updated.rows[0];
      if (!row)
        throw new Error('outcome_review_decision_receipt_binding_failed');
      const eventType =
        status === 'posted'
          ? 'decision_receipt_posted'
          : 'decision_receipt_uncertain';
      await appendPacketEvent(
        client,
        packetId,
        eventType,
        `packet:${row.packet_fingerprint}:${eventType.replaceAll('_', '-')}`,
        [eventType, receiptTs ?? null],
        occurredAt,
      );
    });
  }
}

export async function assessCompanyWorkOutcome(input: {
  workItemId: string;
  deliveryEventVersion: number;
  assessment: CompanyWorkOutcomeAssessment;
  sourceKeySha256: string;
  evidenceSha256: string;
  assessorKeySha256: string;
  evidenceOccurredAt: string;
  assessedAt: string;
}): Promise<{ receiptId: string; duplicate: boolean }> {
  const dryRun = await withAgentContext(ACTOR, (client) =>
    runCompanyWorkOutcomeAssessment(
      {
        ...input,
        mode: 'dry_run',
        expectedPlanSha256: null,
        confirmation: null,
      },
      {
        query: client.query.bind(client),
        withTransaction: async () => {
          throw new Error('unexpected_nested_transaction');
        },
        now: () => new Date().toISOString(),
      },
    ),
  );
  const applied = await runCompanyWorkOutcomeAssessment(
    {
      ...input,
      mode: 'apply',
      expectedPlanSha256: dryRun.plan.planSha256,
      confirmation: COMPANY_WORK_OUTCOME_ASSESSMENT_CONFIRMATION,
    },
    {
      query,
      withTransaction: (fn) => withAgentContext(ACTOR, fn),
      now: () => new Date().toISOString(),
    },
  );
  if (!applied.receipt.receiptId)
    throw new Error('outcome_review_assessment_receipt_missing');
  return {
    receiptId: applied.receipt.receiptId,
    duplicate: !applied.receipt.inserted,
  };
}

function runResult(
  outcome: CompanyWorkOutcomeReviewRunResult['outcome'],
  values: Partial<CompanyWorkOutcomeReviewRunResult> = {},
): CompanyWorkOutcomeReviewRunResult {
  return {
    outcome,
    scanned: 0,
    sourceUnavailable: 0,
    packetId: null,
    messageTs: null,
    errorCode: null,
    ...values,
  };
}

export async function runCompanyWorkOutcomeReview(
  config: CompanyWorkOutcomeReviewConfig,
  deps: CompanyWorkOutcomeReviewDeps,
): Promise<CompanyWorkOutcomeReviewRunResult> {
  if (!config.active)
    return runResult(config.enabled ? 'unavailable' : 'disabled', {
      errorCode: config.configurationError,
    });
  const jid = deps.resolveTargetJid(config.targetFolder);
  if (!jid)
    return runResult('unavailable', {
      errorCode: 'target_channel_unavailable',
    });
  const sinceIso = new Date(
    Date.parse(deps.now()) - config.windowDays * 86_400_000,
  ).toISOString();
  const candidates = await deps.store.listCandidates(
    sinceIso,
    config.candidateLimit,
  );
  if (candidates.length === 0) return runResult('no_candidates');
  let sourceUnavailable = 0;
  for (const target of candidates) {
    const evidence = deps.assembleEvidence(target);
    if (!evidence) {
      sourceUnavailable++;
      continue;
    }
    // postTracked is deliberately single-receipt and Slack caps one message at
    // 4,000 characters. Refuse an incomplete packet instead of truncating the
    // evidence that the operator is being asked to classify.
    if (
      renderCompanyWorkOutcomeReviewPacket(evidence, '0000000000000000000')
        .length > MAX_PACKET_CHARS
    ) {
      sourceUnavailable++;
      continue;
    }
    const claimedAt = deps.now();
    const claim = await deps.store.claimPacket(evidence, claimedAt);
    if (!claim)
      return runResult('duplicate_packet', {
        scanned: sourceUnavailable + 1,
        sourceUnavailable,
      });
    const messageTs = await deps.postPacket(
      jid,
      renderCompanyWorkOutcomeReviewPacket(evidence, claim.id),
    );
    if (!messageTs) {
      await deps.store.markPacketDeliveryUncertain(
        claim.id,
        jid,
        'slack_delivery_unconfirmed',
        deps.now(),
      );
      return runResult('delivery_uncertain', {
        scanned: sourceUnavailable + 1,
        sourceUnavailable,
        packetId: claim.id,
        errorCode: 'slack_delivery_unconfirmed',
      });
    }
    await deps.store.markPacketPosted(claim.id, jid, messageTs, deps.now());
    return runResult('posted', {
      scanned: sourceUnavailable + 1,
      sourceUnavailable,
      packetId: claim.id,
      messageTs,
    });
  }
  return runResult('no_reviewable_evidence', {
    scanned: candidates.length,
    sourceUnavailable,
  });
}

export class CompanyWorkOutcomeReviewService {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private status: CompanyWorkOutcomeReviewStatus;

  constructor(
    private readonly config: CompanyWorkOutcomeReviewConfig,
    private readonly deps: CompanyWorkOutcomeReviewDeps,
  ) {
    this.status = {
      mode: !config.enabled
        ? 'disabled'
        : config.active
          ? 'active'
          : 'misconfigured',
      operatorCount: config.operatorUids.length,
      intervalMs: config.intervalMs,
      windowDays: config.windowDays,
      candidateLimit: config.candidateLimit,
      targetFolder: config.targetFolder,
      running: false,
      lastAttemptAt: null,
      lastSuccessAt: null,
      totalRuns: 0,
      consecutiveFailures: 0,
      lastErrorCode: config.configurationError,
      lastResult: null,
    };
  }

  getStatus(): CompanyWorkOutcomeReviewStatus {
    return structuredClone(this.status);
  }

  start(): void {
    if (!this.config.active || this.timer || this.interval) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runOnce().catch(() => undefined);
      this.interval = setInterval(
        () => void this.runOnce().catch(() => undefined),
        this.config.intervalMs,
      );
      this.interval.unref?.();
    }, STARTUP_DELAY_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.interval) clearInterval(this.interval);
    this.timer = null;
    this.interval = null;
  }

  async runOnce(): Promise<CompanyWorkOutcomeReviewRunResult> {
    if (this.running)
      return runResult('unavailable', { errorCode: 'run_in_progress' });
    this.running = true;
    this.status.running = true;
    this.status.lastAttemptAt = this.deps.now();
    this.status.totalRuns++;
    try {
      const result = await runCompanyWorkOutcomeReview(this.config, this.deps);
      this.status.lastResult = result;
      this.status.lastErrorCode = result.errorCode;
      if (
        result.outcome === 'delivery_uncertain' ||
        result.outcome === 'unavailable'
      )
        this.status.consecutiveFailures++;
      else {
        this.status.consecutiveFailures = 0;
        this.status.lastSuccessAt = this.deps.now();
      }
      return result;
    } catch (error) {
      this.status.consecutiveFailures++;
      this.status.lastErrorCode =
        error instanceof Error ? error.message : 'outcome_review_failed';
      logger.error({ err: error }, 'Company Work outcome review failed');
      throw error;
    } finally {
      this.running = false;
      this.status.running = false;
    }
  }

  async handleReaction(
    messageTs: string,
    provenance: SlackReactionProvenance,
  ): Promise<boolean> {
    if (!this.config.active) return false;
    const assessment =
      COMPANY_WORK_OUTCOME_REVIEW_REACTIONS[
        provenance.reaction as CompanyWorkOutcomeReviewReaction
      ];
    if (!assessment) return false;
    const targetJid = this.deps.resolveTargetJid(this.config.targetFolder);
    if (targetJid !== provenance.jid) return false;
    let packet: CompanyWorkOutcomeReviewPacketBinding | null;
    try {
      packet = await this.deps.store.findPacket(provenance.jid, messageTs);
    } catch (error) {
      // While this explicitly enabled listener cannot prove whether a Chief
      // reaction belongs to a review packet, fail closed: never reinterpret a
      // quality label as generic agent approval.
      logger.error({ err: error }, 'Outcome-review packet lookup failed');
      return true;
    }
    if (!packet) return false;
    try {
      if (!this.config.operatorUids.includes(provenance.reactorUid)) {
        await this.deps.postThread(
          provenance.jid,
          messageTs,
          ':no_entry: This outcome-review packet can be classified only by a configured operator. No quality receipt was recorded.',
        );
        return true;
      }
      const actorSha256 = sha256([
        'slack-outcome-review-operator:v1',
        provenance.reactorUid,
      ]);
      if (packet.status === 'decided') {
        if (
          packet.decisionReceiptStatus === 'pending' &&
          packet.decisionAssessment &&
          packet.assessmentReceiptId
        ) {
          await this.postDecisionReceipt(
            packet,
            packet.decisionAssessment,
            packet.assessmentReceiptId,
            true,
          );
        }
        return true;
      }
      const assessed = await this.deps.assess({
        workItemId: packet.workItemId,
        deliveryEventVersion: packet.deliveryEventVersion,
        assessment,
        sourceKeySha256: packet.sourceKeySha256,
        evidenceSha256: packet.evidenceSha256,
        assessorKeySha256: actorSha256,
        evidenceOccurredAt: packet.evidenceOccurredAt,
        assessedAt: provenance.occurredAt,
      });
      await this.deps.store.recordDecision({
        packetId: packet.id,
        assessment,
        actorSha256,
        reaction: provenance.reaction as CompanyWorkOutcomeReviewReaction,
        decidedAt: provenance.occurredAt,
        assessmentReceiptId: assessed.receiptId,
      });
      await this.postDecisionReceipt(
        packet,
        assessment,
        assessed.receiptId,
        assessed.duplicate,
      );
      return true;
    } catch (error) {
      logger.error(
        { err: error, packetId: packet.id },
        'Outcome-review decision failed closed',
      );
      await this.deps
        .postThread(
          provenance.jid,
          messageTs,
          ':warning: The outcome classification could not be durably recorded. No customer action was taken; please retry the same reaction after the host issue is fixed.',
        )
        .catch(() => undefined);
      return true;
    }
  }

  private async postDecisionReceipt(
    packet: Pick<
      CompanyWorkOutcomeReviewPacketBinding,
      'id' | 'channelJid' | 'messageTs'
    >,
    assessment: CompanyWorkOutcomeAssessment,
    receiptId: string,
    duplicate: boolean,
  ): Promise<void> {
    const occurredAt = this.deps.now();
    const messageTs = await this.deps.postThread(
      packet.channelJid,
      packet.messageTs,
      `:receipt: Outcome quality recorded: *${assessment}* (receipt #${receiptId}${duplicate ? ', idempotent replay' : ''}). This classification did not send, retry, remediate, or mutate the customer workflow.`,
    );
    if (messageTs)
      await this.deps.store.markDecisionReceipt(
        packet.id,
        'posted',
        occurredAt,
        messageTs,
      );
    else
      await this.deps.store.markDecisionReceipt(
        packet.id,
        'uncertain',
        occurredAt,
      );
  }
}

export function createCompanyWorkOutcomeReviewDeps(
  resolveTargetJid: CompanyWorkOutcomeReviewDeps['resolveTargetJid'],
  postPacket: CompanyWorkOutcomeReviewDeps['postPacket'],
  postThread: CompanyWorkOutcomeReviewDeps['postThread'],
): CompanyWorkOutcomeReviewDeps {
  return {
    store: new PostgresCompanyWorkOutcomeReviewStore(),
    resolveTargetJid,
    assembleEvidence: (target) =>
      assembleCompanyWorkOutcomeReviewEvidence(target),
    postPacket,
    postThread,
    assess: assessCompanyWorkOutcome,
    now: () => new Date().toISOString(),
  };
}
