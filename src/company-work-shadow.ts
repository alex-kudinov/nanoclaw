/**
 * Default-off Company OS projection for the existing approved-email ledger.
 *
 * SQLite remains execution authority. This observer reads exact host facts and
 * writes only opaque identifiers and SHA-256 evidence to PostgreSQL. Failure is
 * isolated from the customer-email path: no projector call can send, retry,
 * block, approve, or close an email action.
 */

import { createHash } from 'crypto';

import { buildApprovedHandoff } from './approved-send-handoff.js';
import { query } from './business-db.js';
import {
  createCompanyWorkItem,
  fingerprintCompanyWorkTransition,
  getCompanyWorkEventIdentity,
  getCompanyWorkItemBySource,
  transitionCompanyWorkItem,
  type CompanyWorkEventIdentity,
  type CompanyWorkItem,
  type CompanyWorkMutationResult,
  type TransitionCompanyWorkItemInput,
} from './company-work-ledger.js';
import {
  findEmailActionOutcomeReceipt,
  getMessageById,
  listEmailSendActionsForProjection,
  listEmailSendEvents,
  type EmailActionOutcomeReceipt,
  type EmailSendProjectionRow,
} from './db.js';
import { hashApprovedEmailContent } from './email-action.js';
import { readEnvFile } from './env.js';
import { isInboundSalesHandoff } from './lead-thread-key.js';
import { logger } from './logger.js';

const SOURCE_SYSTEM = 'sqlite_email_action';
const ACTOR = 'company-work-shadow:host';
const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_BATCH_LIMIT = 100;
const MIN_INTERVAL_MS = 10_000;
const MAX_INTERVAL_MS = 15 * 60_000;
const MAX_BATCH_LIMIT = 250;

interface SourceMessage {
  id: string;
  chat_jid: string;
  content: string;
  timestamp: string;
  from_group?: string;
  thread_ts?: string;
}

interface PipelineIdentity {
  pipelineEntryId: string;
  partyId: string;
}

export interface CompanyWorkShadowConfig {
  enabled: boolean;
  active: boolean;
  since: string | null;
  intervalMs: number;
  batchLimit: number;
  configurationError: string | null;
}

export interface CompanyWorkShadowSummary {
  scanned: number;
  eligible: number;
  projected: number;
  transitionsApplied: number;
  duplicateFacts: number;
  completed: number;
  truncated: boolean;
  skipped: Record<string, number>;
  errors: Record<string, number>;
}

export interface CompanyWorkShadowStatus {
  mode: 'disabled' | 'misconfigured' | 'shadow';
  since: string | null;
  intervalMs: number;
  batchLimit: number;
  running: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  totalRuns: number;
  consecutiveFailures: number;
  lastErrorCode: string | null;
  lastSummary: CompanyWorkShadowSummary | null;
}

export interface CompanyWorkShadowDeps {
  listActions(sinceIso: string, limit: number): EmailSendProjectionRow[];
  listEvents: typeof listEmailSendEvents;
  getMessage(id: string, chatJid: string): SourceMessage | undefined;
  findOutcomeReceipt(actionId: string): {
    receipt?: EmailActionOutcomeReceipt;
    ambiguous: boolean;
  };
  resolvePipelineIdentity(entryId: string): Promise<PipelineIdentity | null>;
  createWorkItem: typeof createCompanyWorkItem;
  transitionWorkItem: typeof transitionCompanyWorkItem;
  getWorkItemBySource: typeof getCompanyWorkItemBySource;
  getEventIdentity: typeof getCompanyWorkEventIdentity;
}

interface DesiredTransition extends Omit<
  TransitionCompanyWorkItemInput,
  'workItemId' | 'expectedVersion'
> {}

class ProjectionSkip extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = raw ? Number(raw) : fallback;
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function resolveCompanyWorkShadowConfig(
  supplied?: Record<string, string | undefined>,
): CompanyWorkShadowConfig {
  const fileValues: Record<string, string | undefined> = supplied
    ? {}
    : readEnvFile([
        'COMPANY_WORK_SHADOW_ENABLED',
        'COMPANY_WORK_SHADOW_SINCE',
        'COMPANY_WORK_SHADOW_INTERVAL_MS',
        'COMPANY_WORK_SHADOW_BATCH_LIMIT',
      ]);
  const values = supplied ?? {
    COMPANY_WORK_SHADOW_ENABLED:
      process.env.COMPANY_WORK_SHADOW_ENABLED ||
      fileValues.COMPANY_WORK_SHADOW_ENABLED,
    COMPANY_WORK_SHADOW_SINCE:
      process.env.COMPANY_WORK_SHADOW_SINCE ||
      fileValues.COMPANY_WORK_SHADOW_SINCE,
    COMPANY_WORK_SHADOW_INTERVAL_MS:
      process.env.COMPANY_WORK_SHADOW_INTERVAL_MS ||
      fileValues.COMPANY_WORK_SHADOW_INTERVAL_MS,
    COMPANY_WORK_SHADOW_BATCH_LIMIT:
      process.env.COMPANY_WORK_SHADOW_BATCH_LIMIT ||
      fileValues.COMPANY_WORK_SHADOW_BATCH_LIMIT,
  };
  const enabled = values.COMPANY_WORK_SHADOW_ENABLED === '1';
  const sinceRaw = values.COMPANY_WORK_SHADOW_SINCE;
  const sinceMs = sinceRaw ? Date.parse(sinceRaw) : Number.NaN;
  const validSince = Number.isFinite(sinceMs)
    ? new Date(sinceMs).toISOString()
    : null;
  const configurationError =
    enabled && !validSince ? 'enabled_without_valid_since' : null;
  return {
    enabled,
    active: enabled && !configurationError,
    since: validSince,
    intervalMs: boundedInteger(
      values.COMPANY_WORK_SHADOW_INTERVAL_MS,
      DEFAULT_INTERVAL_MS,
      MIN_INTERVAL_MS,
      MAX_INTERVAL_MS,
    ),
    batchLimit: boundedInteger(
      values.COMPANY_WORK_SHADOW_BATCH_LIMIT,
      DEFAULT_BATCH_LIMIT,
      1,
      MAX_BATCH_LIMIT,
    ),
    configurationError,
  };
}

export function hashCompanyWorkShadowEvidence(parts: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function contentDigest(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function entryIdFromLeadRef(leadRef: string | undefined): string | null {
  const match = /^Lead\s*#\s*([1-9][0-9]*)$/i.exec(leadRef ?? '');
  return match?.[1] ?? null;
}

function exceptionCode(
  stage: 'blocked' | 'uncertain' | 'attention_required',
  code: string | undefined,
): string {
  const normalized = (code ?? 'unspecified')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '_')
    .slice(0, 160);
  return `${stage}:${normalized || 'unspecified'}`;
}

function transitionKey(actionId: string, suffix: string): string {
  return `email-action:${actionId}:${suffix}`;
}

function transition(
  actionId: string,
  suffix: string,
  input: Omit<
    DesiredTransition,
    'actor' | 'sourceSystem' | 'sourceEventKey' | 'idempotencyKey'
  >,
): DesiredTransition {
  return {
    ...input,
    actor: ACTOR,
    sourceSystem: SOURCE_SYSTEM,
    sourceEventKey: transitionKey(actionId, suffix),
    idempotencyKey: `company-shadow:v1:${actionId}:${suffix}`,
  };
}

async function applyDesiredTransition(
  deps: CompanyWorkShadowDeps,
  actionId: string,
  desired: DesiredTransition,
): Promise<CompanyWorkMutationResult> {
  const existing = await deps.getEventIdentity(
    desired.sourceSystem,
    desired.sourceEventKey,
  );
  if (existing) {
    const replay: TransitionCompanyWorkItemInput = {
      ...desired,
      workItemId: existing.workItemId,
      expectedVersion: existing.workItemVersion - 1,
    };
    if (
      existing.workItemVersion < 1 ||
      existing.eventFingerprint !== fingerprintCompanyWorkTransition(replay)
    ) {
      throw new Error('shadow_event_identity_conflict');
    }
    const item = await deps.getWorkItemBySource(SOURCE_SYSTEM, actionId);
    if (!item || item.id !== existing.workItemId) {
      throw new Error('shadow_event_work_item_conflict');
    }
    return { item, applied: false, duplicate: true };
  }

  const item = await deps.getWorkItemBySource(SOURCE_SYSTEM, actionId);
  if (!item) throw new Error('shadow_work_item_missing');
  return deps.transitionWorkItem({
    ...desired,
    workItemId: item.id,
    expectedVersion: item.version,
  });
}

async function applyResume(
  deps: CompanyWorkShadowDeps,
  actionId: string,
  suffix: string,
  occurredAt: string,
): Promise<CompanyWorkMutationResult> {
  return applyDesiredTransition(
    deps,
    actionId,
    transition(actionId, `${suffix}:resumed`, {
      eventType: 'resumed',
      occurredAt,
    }),
  );
}

function countMutation(
  result: CompanyWorkMutationResult | null,
  counters: { applied: number; duplicates: number },
): void {
  if (!result) return;
  if (result.applied) counters.applied++;
  if (result.duplicate) counters.duplicates++;
}

async function projectAction(
  deps: CompanyWorkShadowDeps,
  action: EmailSendProjectionRow,
): Promise<{
  applied: number;
  duplicates: number;
  completed: boolean;
}> {
  const actionId = action.actionId;
  if (!actionId) throw new ProjectionSkip('missing_action_id');
  if (action.groupFolder !== 'sales') throw new ProjectionSkip('not_sales');
  if (!action.threadTs) throw new ProjectionSkip('missing_work_thread');
  if (!action.approvedContentSha256) {
    throw new ProjectionSkip('missing_approved_hash');
  }
  const entryId = entryIdFromLeadRef(action.leadRef);
  if (!entryId) throw new ProjectionSkip('missing_pipeline_entry');

  const root = deps.getMessage(action.threadTs, action.chatJid);
  if (
    !root ||
    root.thread_ts ||
    root.from_group !== 'mailman' ||
    !isInboundSalesHandoff(root.content)
  ) {
    throw new ProjectionSkip('not_mailman_sales_origin');
  }
  const draft = deps.getMessage(action.draftTs, action.chatJid);
  if (
    !draft ||
    draft.from_group !== 'sales' ||
    draft.thread_ts !== action.threadTs
  ) {
    throw new ProjectionSkip('invalid_approval_card_binding');
  }
  const approved = buildApprovedHandoff(draft.content);
  if (
    !approved ||
    hashApprovedEmailContent(approved.subject, approved.body) !==
      action.approvedContentSha256
  ) {
    throw new ProjectionSkip('approval_hash_mismatch');
  }
  const pipeline = await deps.resolvePipelineIdentity(entryId);
  if (!pipeline || pipeline.pipelineEntryId !== entryId) {
    throw new ProjectionSkip('pipeline_identity_missing');
  }

  const events = deps.listEvents(actionId);
  const approvedEvent = events.find((event) => event.stage === 'approved');
  if (!approvedEvent) throw new ProjectionSkip('approval_event_missing');

  const counters = { applied: 0, duplicates: 0 };
  const created = await deps.createWorkItem({
    sourceSystem: SOURCE_SYSTEM,
    sourceKey: actionId,
    sourceEventKey: transitionKey(actionId, 'accepted'),
    idempotencyKey: `company-shadow:v1:${actionId}:accepted`,
    partyId: pipeline.partyId,
    pipelineEntryId: pipeline.pipelineEntryId,
    actor: ACTOR,
    evidenceSha256: hashCompanyWorkShadowEvidence([
      'accepted-v1',
      root.id,
      root.chat_jid,
      root.timestamp,
      contentDigest(root.content),
    ]),
    occurredAt: root.timestamp,
  });
  countMutation(created, counters);

  countMutation(
    await applyDesiredTransition(
      deps,
      actionId,
      transition(actionId, 'sales-dispatched', {
        eventType: 'sales_dispatched',
        occurredAt: root.timestamp,
        evidenceSha256: hashCompanyWorkShadowEvidence([
          'sales-dispatched-v1',
          root.id,
          root.timestamp,
        ]),
      }),
    ),
    counters,
  );
  countMutation(
    await applyDesiredTransition(
      deps,
      actionId,
      transition(actionId, 'approval-requested', {
        eventType: 'approval_requested',
        occurredAt: draft.timestamp,
        evidenceSha256: hashCompanyWorkShadowEvidence([
          'approval-requested-v1',
          draft.id,
          action.approvedContentSha256,
        ]),
      }),
    ),
    counters,
  );

  const approvalEvidence = hashCompanyWorkShadowEvidence([
    'operator-approval-v1',
    actionId,
    approvedEvent.sequence,
    approvedEvent.occurredAt,
    action.approvedContentSha256,
  ]);
  countMutation(
    await applyDesiredTransition(
      deps,
      actionId,
      transition(actionId, `event-${approvedEvent.sequence}:approved`, {
        eventType: 'approved',
        occurredAt: approvedEvent.occurredAt,
        evidenceSha256: approvalEvidence,
        receipt: {
          type: 'operator_approval',
          system: 'sqlite_email_send_events',
          key: `${actionId}:${approvedEvent.sequence}:approval`,
          evidenceSha256: approvalEvidence,
          externalActionId: actionId,
          occurredAt: approvedEvent.occurredAt,
        },
      }),
    ),
    counters,
  );

  let mailmanProjected = false;
  let actionClaimedProjected = false;
  let exceptionOpen = false;
  for (const event of events) {
    if (event.sequence <= approvedEvent.sequence) continue;
    const eventSuffix = `event-${event.sequence}`;
    if (event.stage === 'handoff_routed' || event.stage === 'mailman_started') {
      if (exceptionOpen) {
        countMutation(
          await applyResume(deps, actionId, eventSuffix, event.occurredAt),
          counters,
        );
        exceptionOpen = false;
      }
      if (!mailmanProjected) {
        countMutation(
          await applyDesiredTransition(
            deps,
            actionId,
            transition(actionId, `${eventSuffix}:mailman-dispatched`, {
              eventType: 'mailman_dispatched',
              occurredAt: event.occurredAt,
              evidenceSha256: hashCompanyWorkShadowEvidence([
                'mailman-dispatched-v1',
                actionId,
                event.sequence,
                event.stage,
                event.occurredAt,
              ]),
            }),
          ),
          counters,
        );
        mailmanProjected = true;
      }
      continue;
    }
    if (event.stage === 'executing') {
      if (!mailmanProjected) {
        if (!exceptionOpen) {
          countMutation(
            await applyDesiredTransition(
              deps,
              actionId,
              transition(actionId, `${eventSuffix}:mailman-source-gap`, {
                eventType: 'failed',
                occurredAt: event.occurredAt,
                exceptionCode: 'source_gap:mailman_dispatch_missing',
                evidenceSha256: hashCompanyWorkShadowEvidence([
                  'source-gap-v1',
                  actionId,
                  event.sequence,
                  'mailman_dispatch_missing',
                  event.occurredAt,
                ]),
              }),
            ),
            counters,
          );
          exceptionOpen = true;
        }
        continue;
      }
      if (exceptionOpen) {
        countMutation(
          await applyResume(deps, actionId, eventSuffix, event.occurredAt),
          counters,
        );
        exceptionOpen = false;
      }
      const evidence = hashCompanyWorkShadowEvidence([
        'action-claim-v1',
        actionId,
        event.sequence,
        event.occurredAt,
      ]);
      countMutation(
        await applyDesiredTransition(
          deps,
          actionId,
          transition(actionId, `${eventSuffix}:action-claimed`, {
            eventType: 'action_claimed',
            occurredAt: event.occurredAt,
            evidenceSha256: evidence,
            receipt: {
              type: 'action_claim',
              system: 'sqlite_email_send_events',
              key: `${actionId}:${event.sequence}:claim`,
              evidenceSha256: evidence,
              externalActionId: actionId,
              occurredAt: event.occurredAt,
            },
          }),
        ),
        counters,
      );
      actionClaimedProjected = true;
      continue;
    }
    if (event.stage === 'confirmed') {
      if (!event.gmailMessageId || !event.gmailThreadId) {
        throw new Error('confirmed_event_missing_gmail_receipt');
      }
      if (!actionClaimedProjected) {
        if (!exceptionOpen) {
          countMutation(
            await applyDesiredTransition(
              deps,
              actionId,
              transition(actionId, `${eventSuffix}:claim-source-gap`, {
                eventType: 'failed',
                occurredAt: event.occurredAt,
                exceptionCode: 'source_gap:action_claim_missing',
                evidenceSha256: hashCompanyWorkShadowEvidence([
                  'source-gap-v1',
                  actionId,
                  event.sequence,
                  'action_claim_missing',
                  event.occurredAt,
                ]),
              }),
            ),
            counters,
          );
          exceptionOpen = true;
        }
        continue;
      }
      if (exceptionOpen) {
        countMutation(
          await applyResume(deps, actionId, eventSuffix, event.occurredAt),
          counters,
        );
        exceptionOpen = false;
      }
      const evidence = hashCompanyWorkShadowEvidence([
        'gmail-ack-v1',
        actionId,
        event.gmailMessageId,
        event.gmailThreadId,
        event.occurredAt,
      ]);
      countMutation(
        await applyDesiredTransition(
          deps,
          actionId,
          transition(actionId, `${eventSuffix}:external-acknowledged`, {
            eventType: 'external_acknowledged',
            occurredAt: event.occurredAt,
            evidenceSha256: evidence,
            receipt: {
              type: 'external_delivery',
              system: 'gmail',
              key: event.gmailMessageId,
              evidenceSha256: evidence,
              externalActionId: actionId,
              occurredAt: event.occurredAt,
            },
          }),
        ),
        counters,
      );
      continue;
    }
    if (
      event.stage === 'blocked' ||
      event.stage === 'uncertain' ||
      event.stage === 'attention_required'
    ) {
      if (exceptionOpen) {
        countMutation(
          await applyResume(
            deps,
            actionId,
            `${eventSuffix}:exception-reclassified`,
            event.occurredAt,
          ),
          counters,
        );
      }
      const dispositionEvent =
        event.stage === 'blocked' ? ('blocked' as const) : ('failed' as const);
      countMutation(
        await applyDesiredTransition(
          deps,
          actionId,
          transition(actionId, `${eventSuffix}:${dispositionEvent}`, {
            eventType: dispositionEvent,
            occurredAt: event.occurredAt,
            exceptionCode: exceptionCode(event.stage, event.code),
            evidenceSha256: hashCompanyWorkShadowEvidence([
              'email-exception-v1',
              actionId,
              event.sequence,
              event.stage,
              event.code ?? null,
              event.occurredAt,
            ]),
          }),
        ),
        counters,
      );
      exceptionOpen = true;
    }
  }

  const outcome = deps.findOutcomeReceipt(actionId);
  if (outcome.ambiguous) throw new Error('outcome_receipt_ambiguous');
  if (outcome.receipt) {
    const current = await deps.getWorkItemBySource(SOURCE_SYSTEM, actionId);
    if (
      current?.stage === 'external_acknowledged' ||
      current?.stage === 'outcome_validated'
    ) {
      const evidence = hashCompanyWorkShadowEvidence([
        'outcome-validation-v1',
        actionId,
        outcome.receipt.messageId,
        action.gmailMessageId ?? null,
        action.threadTs,
        outcome.receipt.occurredAt,
      ]);
      countMutation(
        await applyDesiredTransition(
          deps,
          actionId,
          transition(actionId, `slack-${outcome.receipt.messageId}:outcome`, {
            eventType: 'outcome_validated',
            occurredAt: outcome.receipt.occurredAt,
            evidenceSha256: evidence,
            receipt: {
              type: 'outcome_validation',
              system: 'sqlite_messages',
              key: outcome.receipt.messageId,
              evidenceSha256: evidence,
              externalActionId: actionId,
              occurredAt: outcome.receipt.occurredAt,
            },
          }),
        ),
        counters,
      );
    }
  }

  const finalItem = await deps.getWorkItemBySource(SOURCE_SYSTEM, actionId);
  return {
    ...counters,
    completed:
      finalItem?.stage === 'outcome_validated' &&
      finalItem.disposition === 'completed',
  };
}

export async function runCompanyWorkShadowProjection(
  deps: CompanyWorkShadowDeps,
  config: Pick<CompanyWorkShadowConfig, 'since' | 'batchLimit'>,
): Promise<CompanyWorkShadowSummary> {
  if (!config.since) throw new Error('shadow_since_required');
  const actions = deps.listActions(config.since, config.batchLimit);
  const summary: CompanyWorkShadowSummary = {
    scanned: actions.length,
    eligible: 0,
    projected: 0,
    transitionsApplied: 0,
    duplicateFacts: 0,
    completed: 0,
    truncated: actions.length === config.batchLimit,
    skipped: {},
    errors: {},
  };
  for (const action of actions) {
    try {
      const result = await projectAction(deps, action);
      summary.eligible++;
      summary.projected++;
      summary.transitionsApplied += result.applied;
      summary.duplicateFacts += result.duplicates;
      if (result.completed) summary.completed++;
    } catch (error) {
      if (error instanceof ProjectionSkip) {
        increment(summary.skipped, error.reason);
      } else {
        const code =
          error instanceof Error && /^[a-z0-9_:-]+$/.test(error.message)
            ? error.message
            : 'projection_failed';
        increment(summary.errors, code);
      }
    }
  }
  return summary;
}

export function makeCompanyWorkShadowDeps(): CompanyWorkShadowDeps {
  return {
    listActions: listEmailSendActionsForProjection,
    listEvents: listEmailSendEvents,
    getMessage: (id, chatJid) =>
      getMessageById(id, chatJid) as SourceMessage | undefined,
    findOutcomeReceipt: findEmailActionOutcomeReceipt,
    resolvePipelineIdentity: async (entryId) => {
      const result = await query<{
        pipeline_entry_id: string;
        party_id: string;
      }>(
        `SELECT id::text AS pipeline_entry_id, party_id::text
           FROM business_v2.pipeline_entries WHERE id = $1`,
        [entryId],
      );
      const row = result.rows[0];
      return row
        ? { pipelineEntryId: row.pipeline_entry_id, partyId: row.party_id }
        : null;
    },
    createWorkItem: createCompanyWorkItem,
    transitionWorkItem: transitionCompanyWorkItem,
    getWorkItemBySource: getCompanyWorkItemBySource,
    getEventIdentity: getCompanyWorkEventIdentity,
  };
}

export class CompanyWorkShadowService {
  private readonly config: CompanyWorkShadowConfig;
  private readonly deps: CompanyWorkShadowDeps;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private status: CompanyWorkShadowStatus;

  constructor(
    deps: CompanyWorkShadowDeps = makeCompanyWorkShadowDeps(),
    config: CompanyWorkShadowConfig = resolveCompanyWorkShadowConfig(),
  ) {
    this.deps = deps;
    this.config = config;
    this.status = {
      mode: config.active
        ? 'shadow'
        : config.enabled
          ? 'misconfigured'
          : 'disabled',
      since: config.since,
      intervalMs: config.intervalMs,
      batchLimit: config.batchLimit,
      running: false,
      lastAttemptAt: null,
      lastSuccessAt: null,
      totalRuns: 0,
      consecutiveFailures: 0,
      lastErrorCode: config.configurationError,
      lastSummary: null,
    };
  }

  getStatus(): CompanyWorkShadowStatus {
    return structuredClone(this.status);
  }

  async tick(): Promise<void> {
    if (!this.config.active || this.status.running) return;
    this.status.running = true;
    this.status.lastAttemptAt = new Date().toISOString();
    this.status.totalRuns++;
    try {
      const summary = await runCompanyWorkShadowProjection(
        this.deps,
        this.config,
      );
      this.status.lastSummary = summary;
      this.status.lastSuccessAt = new Date().toISOString();
      this.status.consecutiveFailures = 0;
      this.status.lastErrorCode =
        Object.keys(summary.errors).length > 0
          ? 'action_projection_errors'
          : null;
      logger.info({ summary }, 'company-work-shadow: reconciliation complete');
    } catch (error) {
      this.status.consecutiveFailures++;
      this.status.lastErrorCode = 'tick_failed';
      logger.error(
        {
          errorName: error instanceof Error ? error.name : 'unknown',
          consecutiveFailures: this.status.consecutiveFailures,
        },
        'company-work-shadow: reconciliation failed open',
      );
    } finally {
      this.status.running = false;
    }
  }

  start(): void {
    if (!this.config.active || this.timer) {
      logger.info(
        {
          mode: this.status.mode,
          configurationError: this.config.configurationError,
        },
        'company-work-shadow: not armed',
      );
      return;
    }
    this.startupTimer = setTimeout(() => void this.tick(), 5_000);
    this.startupTimer.unref?.();
    this.timer = setInterval(() => void this.tick(), this.config.intervalMs);
    this.timer.unref?.();
    logger.info(
      {
        since: this.config.since,
        intervalMs: this.config.intervalMs,
        batchLimit: this.config.batchLimit,
      },
      'company-work-shadow: armed in non-authoritative shadow mode',
    );
  }

  stop(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.timer) clearInterval(this.timer);
    this.startupTimer = null;
    this.timer = null;
  }
}
