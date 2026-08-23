/**
 * Host-only Company OS work-ledger foundation.
 *
 * NC-20260815-010 introduced this module without runtime wiring. The separately
 * authorized NC-20260816-001 milestone applied migration 118 and wired a
 * bounded, non-authoritative email shadow observer. NC-20260816-016 adds an
 * unwired host-job contract for the second pilot; SQLite jobs/job_run_logs and
 * the existing SQLite approved-email action ledger remain execution authority.
 * This module stores opaque IDs and SHA-256 evidence only; raw customer,
 * approval, job-output, and error content is not accepted.
 */

import { createHash } from 'crypto';
import type { QueryResult, QueryResultRow } from 'pg';

import { withAgentContext } from './business-db.js';

export const COMPANY_WORK_STAGES = [
  'accepted',
  'sales_dispatched',
  'awaiting_approval',
  'approved',
  'mailman_dispatched',
  'action_claimed',
  'external_acknowledged',
  'execution_started',
  'outcome_validated',
] as const;

export type CompanyWorkStage = (typeof COMPANY_WORK_STAGES)[number];

export const COMPANY_WORK_DISPOSITIONS = [
  'open',
  'waiting',
  'blocked',
  'failed',
  'completed',
  'cancelled',
] as const;

export type CompanyWorkDisposition = (typeof COMPANY_WORK_DISPOSITIONS)[number];

export const COMPANY_WORK_EVENT_TYPES = [
  'sales_dispatched',
  'approval_requested',
  'approved',
  'mailman_dispatched',
  'action_claimed',
  'external_acknowledged',
  'execution_started',
  'execution_failed',
  'outcome_validated',
  'blocked',
  'failed',
  'resumed',
  'reopened',
  'cancelled',
] as const;

export type CompanyWorkEventType = (typeof COMPANY_WORK_EVENT_TYPES)[number];

export type SalesEmailCompanyWorkEventType = Exclude<
  CompanyWorkEventType,
  'execution_started' | 'execution_failed'
>;

export type CompanyJobWorkEventType =
  | 'execution_started'
  | 'execution_failed'
  | 'outcome_validated'
  | 'failed';

export type CompanyConditionWorkEventType =
  | 'blocked'
  | 'outcome_validated'
  | 'reopened';

export const COMPANY_WORK_RECEIPT_TYPES = [
  'operator_approval',
  'action_claim',
  'external_delivery',
  'outcome_validation',
  'cancellation',
] as const;

export type CompanyWorkReceiptType =
  (typeof COMPANY_WORK_RECEIPT_TYPES)[number];

export interface CompanyWorkItem {
  id: string;
  workflowType:
    | 'sales_email'
    | 'host_job_run'
    | 'program_facts_drift'
    | 'healer_resolution';
  sourceSystem: string;
  sourceKey: string;
  partyId: string | null;
  pipelineEntryId: string | null;
  completionDefinition:
    | 'gmail_ack_and_thread_close'
    | 'host_job_terminal_receipt'
    | 'detector_clean_receipt'
    | 'healer_resolution_receipt';
  stage: CompanyWorkStage;
  disposition: CompanyWorkDisposition;
  version: number;
  blockCode: string | null;
  failureCode: string | null;
  deadlineAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastTransitionAt: string;
  lastTransitionBy: string;
}

export interface CompanyWorkReceiptInput {
  type: CompanyWorkReceiptType;
  system: string;
  key: string;
  evidenceSha256: string;
  externalActionId?: string | null;
  occurredAt: string;
}

export interface CreateCompanyWorkItemInput {
  sourceSystem: string;
  sourceKey: string;
  sourceEventKey: string;
  idempotencyKey: string;
  partyId: string;
  pipelineEntryId: string;
  actor: string;
  evidenceSha256: string;
  occurredAt: string;
  deadlineAt?: string | null;
}

export interface TransitionCompanyWorkItemInput {
  workItemId: string;
  expectedVersion: number;
  eventType: SalesEmailCompanyWorkEventType;
  actor: string;
  sourceSystem: string;
  sourceEventKey: string;
  idempotencyKey: string;
  occurredAt: string;
  evidenceSha256?: string | null;
  exceptionCode?: string | null;
  receipt?: CompanyWorkReceiptInput | null;
}

export interface CreateCompanyJobWorkItemInput {
  sourceSystem: string;
  sourceKey: string;
  sourceEventKey: string;
  idempotencyKey: string;
  actor: string;
  evidenceSha256: string;
  occurredAt: string;
  deadlineAt: string;
}

export interface TransitionCompanyJobWorkItemInput {
  workItemId: string;
  expectedVersion: number;
  eventType: CompanyJobWorkEventType;
  actor: string;
  sourceSystem: string;
  sourceEventKey: string;
  idempotencyKey: string;
  occurredAt: string;
  evidenceSha256: string;
  exceptionCode?: string | null;
  receipt?: CompanyWorkReceiptInput | null;
}

export interface EnsureCompanyConditionWorkItemInput {
  sourceSystem: string;
  sourceKey: string;
  sourceEventKey: string;
  idempotencyKey: string;
  actor: string;
  evidenceSha256: string;
  occurredAt: string;
  deadlineAt: string;
}

export interface TransitionCompanyConditionWorkItemInput {
  workItemId: string;
  expectedVersion: number;
  eventType: CompanyConditionWorkEventType;
  actor: string;
  sourceSystem: string;
  sourceEventKey: string;
  idempotencyKey: string;
  occurredAt: string;
  evidenceSha256: string;
  deadlineAt?: string | null;
  exceptionCode?: string | null;
  receipt?: CompanyWorkReceiptInput | null;
}

export interface CompanyWorkMutationResult {
  item: CompanyWorkItem;
  applied: boolean;
  duplicate: boolean;
}

export type CompanyWorkLedgerErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'conflict'
  | 'stale_version'
  | 'invalid_transition';

export class CompanyWorkLedgerError extends Error {
  constructor(
    public readonly code: CompanyWorkLedgerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CompanyWorkLedgerError';
  }
}

export interface CompanyWorkLedgerClient {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}

interface WorkItemRow extends QueryResultRow {
  id: string;
  workflow_type:
    | 'sales_email'
    | 'host_job_run'
    | 'program_facts_drift'
    | 'healer_resolution';
  source_system: string;
  source_key: string;
  party_id: string | null;
  pipeline_entry_id: string | null;
  completion_definition:
    | 'gmail_ack_and_thread_close'
    | 'host_job_terminal_receipt'
    | 'detector_clean_receipt'
    | 'healer_resolution_receipt';
  stage: CompanyWorkStage;
  disposition: CompanyWorkDisposition;
  version: number;
  block_code: string | null;
  failure_code: string | null;
  deadline_at: string | null;
  created_at: string;
  updated_at: string;
  last_transition_at: string;
  last_transition_by: string;
}

interface ExistingEventRow extends QueryResultRow {
  work_item_id: string;
  event_fingerprint: string;
}

interface EventIdentityRow extends ExistingEventRow {
  work_item_version: number;
}

export interface CompanyWorkEventIdentity {
  workItemId: string;
  workItemVersion: number;
  eventFingerprint: string;
}

interface ReceiptRow extends QueryResultRow {
  id: string;
  work_item_id: string;
  receipt_type: CompanyWorkReceiptType;
  receipt_system: string;
  receipt_key: string;
  evidence_sha256: string;
  external_action_id: string | null;
  occurred_at: string;
}

interface PlannedTransition {
  stage: CompanyWorkStage;
  disposition: CompanyWorkDisposition;
  blockCode: string | null;
  failureCode: string | null;
  requiredReceipt: CompanyWorkReceiptType | null;
}

const ITEM_COLUMNS = `
  id::text, workflow_type, source_system, source_key, party_id::text,
  pipeline_entry_id::text, completion_definition, stage, disposition, version,
  block_code, failure_code, deadline_at::text, created_at::text,
  updated_at::text, last_transition_at::text, last_transition_by
`;

const SHA256_RE = /^[0-9a-f]{64}$/;
const OPAQUE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,499}$/;

function invalid(message: string): never {
  throw new CompanyWorkLedgerError('invalid_input', message);
}

function assertOpaqueId(value: string, label: string): void {
  if (!OPAQUE_ID_RE.test(value) || value.includes('://')) {
    invalid(
      `${label} must be an opaque identifier without whitespace or content`,
    );
  }
}

function assertPositiveIntegerId(value: string, label: string): void {
  if (!/^[1-9][0-9]*$/.test(value)) {
    invalid(`${label} must be a positive integer identifier`);
  }
}

function assertSha256(value: string | null | undefined, label: string): void {
  if (!value || !SHA256_RE.test(value)) {
    invalid(`${label} must be a lowercase SHA-256 digest`);
  }
}

function assertTimestamp(value: string, label: string): void {
  if (!value || !Number.isFinite(Date.parse(value))) {
    invalid(`${label} must be an ISO-8601 timestamp`);
  }
}

function timestampsMatch(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return left === right;
  return Date.parse(left) === Date.parse(right);
}

function toItem(row: WorkItemRow): CompanyWorkItem {
  return {
    id: row.id,
    workflowType: row.workflow_type,
    sourceSystem: row.source_system,
    sourceKey: row.source_key,
    partyId: row.party_id,
    pipelineEntryId: row.pipeline_entry_id,
    completionDefinition: row.completion_definition,
    stage: row.stage,
    disposition: row.disposition,
    version: row.version,
    blockCode: row.block_code,
    failureCode: row.failure_code,
    deadlineAt: row.deadline_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastTransitionAt: row.last_transition_at,
    lastTransitionBy: row.last_transition_by,
  };
}

function fingerprint(parts: Array<string | number | null | undefined>): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function validateReceipt(receipt: CompanyWorkReceiptInput): void {
  assertOpaqueId(receipt.system, 'receipt.system');
  assertOpaqueId(receipt.key, 'receipt.key');
  assertSha256(receipt.evidenceSha256, 'receipt.evidenceSha256');
  assertTimestamp(receipt.occurredAt, 'receipt.occurredAt');
  if (receipt.externalActionId) {
    assertOpaqueId(receipt.externalActionId, 'receipt.externalActionId');
  }
}

function receiptFingerprintParts(
  receipt: CompanyWorkReceiptInput | null | undefined,
): Array<string | null> {
  if (!receipt) return [null, null, null, null, null, null];
  return [
    receipt.type,
    receipt.system,
    receipt.key,
    receipt.evidenceSha256,
    receipt.externalActionId ?? null,
    receipt.occurredAt,
  ];
}

/** @internal Exported for deterministic retry/duplicate contract tests. */
export function fingerprintCompanyWorkTransition(
  input: TransitionCompanyWorkItemInput,
): string {
  return fingerprint([
    'transition-v1',
    input.workItemId,
    input.expectedVersion,
    input.eventType,
    input.actor,
    input.sourceSystem,
    input.sourceEventKey,
    input.occurredAt,
    input.evidenceSha256 ?? null,
    input.exceptionCode ?? null,
    ...receiptFingerprintParts(input.receipt),
  ]);
}

/** @internal Exported for deterministic host-job retry/duplicate tests. */
export function fingerprintCompanyJobWorkTransition(
  input: TransitionCompanyJobWorkItemInput,
): string {
  return fingerprint([
    'host-job-transition-v1',
    input.workItemId,
    input.expectedVersion,
    input.eventType,
    input.actor,
    input.sourceSystem,
    input.sourceEventKey,
    input.occurredAt,
    input.evidenceSha256,
    input.exceptionCode ?? null,
    ...receiptFingerprintParts(input.receipt),
  ]);
}

/** @internal Exported for deterministic business-condition replay tests. */
export function fingerprintCompanyConditionWorkTransition(
  input: TransitionCompanyConditionWorkItemInput,
): string {
  return fingerprint([
    'condition-transition-v1',
    input.workItemId,
    input.expectedVersion,
    input.eventType,
    input.actor,
    input.sourceSystem,
    input.sourceEventKey,
    input.occurredAt,
    input.evidenceSha256,
    input.deadlineAt ?? null,
    input.exceptionCode ?? null,
    ...receiptFingerprintParts(input.receipt),
  ]);
}

function activeDispositionForStage(
  stage: CompanyWorkStage,
): CompanyWorkDisposition {
  return stage === 'awaiting_approval' ? 'waiting' : 'open';
}

/** Pure transition policy. It consumes typed host facts, never agent text. */
export function planCompanyWorkTransition(
  current: Pick<CompanyWorkItem, 'stage' | 'disposition'>,
  eventType: SalesEmailCompanyWorkEventType,
  options: {
    evidenceSha256?: string | null;
    exceptionCode?: string | null;
    receipt?: CompanyWorkReceiptInput | null;
  } = {},
): PlannedTransition {
  if (
    current.disposition === 'completed' ||
    current.disposition === 'cancelled'
  ) {
    throw new CompanyWorkLedgerError(
      'invalid_transition',
      `terminal work item cannot accept ${eventType}`,
    );
  }

  const requiredReceiptByEvent: Partial<
    Record<SalesEmailCompanyWorkEventType, CompanyWorkReceiptType>
  > = {
    approved: 'operator_approval',
    action_claimed: 'action_claim',
    external_acknowledged: 'external_delivery',
    outcome_validated: 'outcome_validation',
    cancelled: 'cancellation',
  };
  const requiredReceipt = requiredReceiptByEvent[eventType] ?? null;
  if (requiredReceipt) {
    if (!options.receipt || options.receipt.type !== requiredReceipt) {
      throw new CompanyWorkLedgerError(
        'invalid_transition',
        `${eventType} requires an exact ${requiredReceipt} receipt`,
      );
    }
    if (eventType !== 'cancelled' && !options.receipt.externalActionId) {
      throw new CompanyWorkLedgerError(
        'invalid_transition',
        `${eventType} receipt must bind the exact approved action`,
      );
    }
  } else if (options.receipt) {
    throw new CompanyWorkLedgerError(
      'invalid_transition',
      `${eventType} does not accept a receipt`,
    );
  }

  if (
    (eventType === 'approval_requested' ||
      eventType === 'external_acknowledged' ||
      eventType === 'outcome_validated') &&
    !options.evidenceSha256
  ) {
    throw new CompanyWorkLedgerError(
      'invalid_transition',
      `${eventType} requires exact SHA-256 evidence`,
    );
  }
  if (
    (eventType === 'external_acknowledged' ||
      eventType === 'outcome_validated') &&
    options.receipt?.evidenceSha256 !== options.evidenceSha256
  ) {
    throw new CompanyWorkLedgerError(
      'invalid_transition',
      `${eventType} evidence must match its exact receipt`,
    );
  }

  if (eventType === 'blocked' || eventType === 'failed') {
    if (!options.exceptionCode) {
      throw new CompanyWorkLedgerError(
        'invalid_transition',
        `${eventType} requires a named exception code`,
      );
    }
    if (current.disposition === 'blocked' || current.disposition === 'failed') {
      throw new CompanyWorkLedgerError(
        'invalid_transition',
        'exception work must be resumed or cancelled before a new exception',
      );
    }
    return {
      stage: current.stage,
      disposition: eventType,
      blockCode: eventType === 'blocked' ? options.exceptionCode : null,
      failureCode: eventType === 'failed' ? options.exceptionCode : null,
      requiredReceipt: null,
    };
  }

  if (eventType === 'resumed') {
    if (current.disposition !== 'blocked' && current.disposition !== 'failed') {
      throw new CompanyWorkLedgerError(
        'invalid_transition',
        'only blocked or failed work can be resumed',
      );
    }
    return {
      stage: current.stage,
      disposition: activeDispositionForStage(current.stage),
      blockCode: null,
      failureCode: null,
      requiredReceipt: null,
    };
  }

  if (eventType === 'cancelled') {
    return {
      stage: current.stage,
      disposition: 'cancelled',
      blockCode: null,
      failureCode: null,
      requiredReceipt,
    };
  }

  if (current.disposition === 'blocked' || current.disposition === 'failed') {
    throw new CompanyWorkLedgerError(
      'invalid_transition',
      'blocked or failed work must be resumed before advancing',
    );
  }

  const edges: Partial<
    Record<
      SalesEmailCompanyWorkEventType,
      {
        fromStage: CompanyWorkStage;
        fromDisposition: CompanyWorkDisposition;
        toStage: CompanyWorkStage;
        toDisposition: CompanyWorkDisposition;
      }
    >
  > = {
    sales_dispatched: {
      fromStage: 'accepted',
      fromDisposition: 'open',
      toStage: 'sales_dispatched',
      toDisposition: 'open',
    },
    approval_requested: {
      fromStage: 'sales_dispatched',
      fromDisposition: 'open',
      toStage: 'awaiting_approval',
      toDisposition: 'waiting',
    },
    approved: {
      fromStage: 'awaiting_approval',
      fromDisposition: 'waiting',
      toStage: 'approved',
      toDisposition: 'open',
    },
    mailman_dispatched: {
      fromStage: 'approved',
      fromDisposition: 'open',
      toStage: 'mailman_dispatched',
      toDisposition: 'open',
    },
    action_claimed: {
      fromStage: 'mailman_dispatched',
      fromDisposition: 'open',
      toStage: 'action_claimed',
      toDisposition: 'open',
    },
    external_acknowledged: {
      fromStage: 'action_claimed',
      fromDisposition: 'open',
      toStage: 'external_acknowledged',
      toDisposition: 'open',
    },
    outcome_validated: {
      fromStage: 'external_acknowledged',
      fromDisposition: 'open',
      toStage: 'outcome_validated',
      toDisposition: 'completed',
    },
  };
  const edge = edges[eventType];
  if (
    !edge ||
    current.stage !== edge.fromStage ||
    current.disposition !== edge.fromDisposition
  ) {
    throw new CompanyWorkLedgerError(
      'invalid_transition',
      `invalid ${current.stage}/${current.disposition} -> ${eventType} transition`,
    );
  }
  return {
    stage: edge.toStage,
    disposition: edge.toDisposition,
    blockCode: null,
    failureCode: null,
    requiredReceipt,
  };
}

/** Pure host-job policy. The failed run is terminal source evidence, while a
 * generic `failed` event represents a projection/source gap and has no
 * receipt. Neither path retries or mutates the authoritative job. */
export function planCompanyJobWorkTransition(
  current: Pick<CompanyWorkItem, 'stage' | 'disposition'>,
  eventType: CompanyJobWorkEventType,
  options: {
    evidenceSha256?: string | null;
    exceptionCode?: string | null;
    receipt?: CompanyWorkReceiptInput | null;
  } = {},
): PlannedTransition {
  if (
    current.disposition === 'completed' ||
    current.disposition === 'cancelled'
  ) {
    throw new CompanyWorkLedgerError(
      'invalid_transition',
      `terminal host-job work item cannot accept ${eventType}`,
    );
  }
  if (!options.evidenceSha256) {
    throw new CompanyWorkLedgerError(
      'invalid_transition',
      `${eventType} requires exact SHA-256 evidence`,
    );
  }

  if (eventType === 'failed') {
    if (!options.exceptionCode) {
      throw new CompanyWorkLedgerError(
        'invalid_transition',
        'failed requires a named source-gap code',
      );
    }
    if (options.receipt) {
      throw new CompanyWorkLedgerError(
        'invalid_transition',
        'source-gap failure does not accept a terminal job receipt',
      );
    }
    if (current.disposition !== 'open') {
      throw new CompanyWorkLedgerError(
        'invalid_transition',
        'only open host-job work can record a source gap',
      );
    }
    return {
      stage: current.stage,
      disposition: 'failed',
      blockCode: null,
      failureCode: options.exceptionCode,
      requiredReceipt: null,
    };
  }

  const requiresTerminalReceipt =
    eventType === 'execution_failed' || eventType === 'outcome_validated';
  if (requiresTerminalReceipt) {
    if (
      !options.receipt ||
      options.receipt.type !== 'outcome_validation' ||
      !options.receipt.externalActionId
    ) {
      throw new CompanyWorkLedgerError(
        'invalid_transition',
        `${eventType} requires an exact outcome_validation receipt bound to the run`,
      );
    }
    if (options.receipt.evidenceSha256 !== options.evidenceSha256) {
      throw new CompanyWorkLedgerError(
        'invalid_transition',
        `${eventType} evidence must match its exact receipt`,
      );
    }
  } else if (options.receipt) {
    throw new CompanyWorkLedgerError(
      'invalid_transition',
      `${eventType} does not accept a receipt`,
    );
  }

  if (eventType === 'execution_started') {
    if (current.stage !== 'accepted' || current.disposition !== 'open') {
      throw new CompanyWorkLedgerError(
        'invalid_transition',
        `invalid ${current.stage}/${current.disposition} -> execution_started transition`,
      );
    }
    return {
      stage: 'execution_started',
      disposition: 'open',
      blockCode: null,
      failureCode: null,
      requiredReceipt: null,
    };
  }

  if (eventType === 'execution_failed') {
    if (
      (current.stage !== 'accepted' && current.stage !== 'execution_started') ||
      current.disposition !== 'open' ||
      !options.exceptionCode
    ) {
      throw new CompanyWorkLedgerError(
        'invalid_transition',
        `invalid ${current.stage}/${current.disposition} -> execution_failed transition`,
      );
    }
    return {
      stage: current.stage,
      disposition: 'failed',
      blockCode: null,
      failureCode: options.exceptionCode,
      requiredReceipt: 'outcome_validation',
    };
  }

  if (current.stage !== 'execution_started' || current.disposition !== 'open') {
    throw new CompanyWorkLedgerError(
      'invalid_transition',
      `invalid ${current.stage}/${current.disposition} -> outcome_validated transition`,
    );
  }
  return {
    stage: 'outcome_validated',
    disposition: 'completed',
    blockCode: null,
    failureCode: null,
    requiredReceipt: 'outcome_validation',
  };
}

/**
 * Pure program-facts condition policy. Drift is immediately routed as a
 * blocked owner decision because the detector cannot decide which compared
 * source is authoritative. Only an exact clean-detector receipt can close the
 * item. A later recurrence explicitly reopens the completed item before it is
 * blocked again.
 */
export function planCompanyConditionWorkTransition(
  current: Pick<CompanyWorkItem, 'stage' | 'disposition'>,
  eventType: CompanyConditionWorkEventType,
  options: {
    evidenceSha256?: string | null;
    exceptionCode?: string | null;
    receipt?: CompanyWorkReceiptInput | null;
  } = {},
): PlannedTransition {
  if (!options.evidenceSha256) {
    throw new CompanyWorkLedgerError(
      'invalid_transition',
      `${eventType} requires exact SHA-256 detector evidence`,
    );
  }

  if (eventType === 'reopened') {
    if (
      current.stage !== 'outcome_validated' ||
      current.disposition !== 'completed' ||
      options.receipt ||
      options.exceptionCode
    ) {
      throw new CompanyWorkLedgerError(
        'invalid_transition',
        `invalid ${current.stage}/${current.disposition} -> reopened transition`,
      );
    }
    return {
      stage: 'accepted',
      disposition: 'open',
      blockCode: null,
      failureCode: null,
      requiredReceipt: null,
    };
  }

  if (eventType === 'blocked') {
    if (
      current.stage !== 'accepted' ||
      current.disposition !== 'open' ||
      !options.exceptionCode ||
      options.receipt
    ) {
      throw new CompanyWorkLedgerError(
        'invalid_transition',
        `invalid ${current.stage}/${current.disposition} -> blocked transition`,
      );
    }
    return {
      stage: 'accepted',
      disposition: 'blocked',
      blockCode: options.exceptionCode,
      failureCode: null,
      requiredReceipt: null,
    };
  }

  if (
    current.stage !== 'accepted' ||
    current.disposition !== 'blocked' ||
    options.exceptionCode ||
    !options.receipt ||
    options.receipt.type !== 'outcome_validation' ||
    !options.receipt.externalActionId ||
    options.receipt.evidenceSha256 !== options.evidenceSha256
  ) {
    throw new CompanyWorkLedgerError(
      'invalid_transition',
      `invalid ${current.stage}/${current.disposition} -> outcome_validated transition`,
    );
  }
  return {
    stage: 'outcome_validated',
    disposition: 'completed',
    blockCode: null,
    failureCode: null,
    requiredReceipt: 'outcome_validation',
  };
}

function validateCreate(input: CreateCompanyWorkItemInput): void {
  assertOpaqueId(input.sourceSystem, 'sourceSystem');
  assertOpaqueId(input.sourceKey, 'sourceKey');
  assertOpaqueId(input.sourceEventKey, 'sourceEventKey');
  assertOpaqueId(input.idempotencyKey, 'idempotencyKey');
  assertPositiveIntegerId(input.partyId, 'partyId');
  assertPositiveIntegerId(input.pipelineEntryId, 'pipelineEntryId');
  assertOpaqueId(input.actor, 'actor');
  assertSha256(input.evidenceSha256, 'evidenceSha256');
  assertTimestamp(input.occurredAt, 'occurredAt');
  if (input.deadlineAt) assertTimestamp(input.deadlineAt, 'deadlineAt');
}

function validateJobCreate(input: CreateCompanyJobWorkItemInput): void {
  assertOpaqueId(input.sourceSystem, 'sourceSystem');
  assertOpaqueId(input.sourceKey, 'sourceKey');
  assertOpaqueId(input.sourceEventKey, 'sourceEventKey');
  assertOpaqueId(input.idempotencyKey, 'idempotencyKey');
  assertOpaqueId(input.actor, 'actor');
  assertSha256(input.evidenceSha256, 'evidenceSha256');
  assertTimestamp(input.occurredAt, 'occurredAt');
  assertTimestamp(input.deadlineAt, 'deadlineAt');
  if (Date.parse(input.deadlineAt) <= Date.parse(input.occurredAt)) {
    invalid('deadlineAt must be after occurredAt for a host job run');
  }
}

function validateConditionCreate(
  input: EnsureCompanyConditionWorkItemInput,
): void {
  assertOpaqueId(input.sourceSystem, 'sourceSystem');
  assertOpaqueId(input.sourceKey, 'sourceKey');
  assertOpaqueId(input.sourceEventKey, 'sourceEventKey');
  assertOpaqueId(input.idempotencyKey, 'idempotencyKey');
  assertOpaqueId(input.actor, 'actor');
  assertSha256(input.evidenceSha256, 'evidenceSha256');
  assertTimestamp(input.occurredAt, 'occurredAt');
  assertTimestamp(input.deadlineAt, 'deadlineAt');
  if (Date.parse(input.deadlineAt) <= Date.parse(input.occurredAt)) {
    invalid('deadlineAt must be after occurredAt for a business condition');
  }
}

function validateTransition(
  input: Pick<
    TransitionCompanyWorkItemInput,
    | 'workItemId'
    | 'expectedVersion'
    | 'actor'
    | 'sourceSystem'
    | 'sourceEventKey'
    | 'idempotencyKey'
    | 'occurredAt'
    | 'evidenceSha256'
    | 'exceptionCode'
    | 'receipt'
  >,
): void {
  assertPositiveIntegerId(input.workItemId, 'workItemId');
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    invalid('expectedVersion must be a non-negative integer');
  }
  assertOpaqueId(input.actor, 'actor');
  assertOpaqueId(input.sourceSystem, 'sourceSystem');
  assertOpaqueId(input.sourceEventKey, 'sourceEventKey');
  assertOpaqueId(input.idempotencyKey, 'idempotencyKey');
  assertTimestamp(input.occurredAt, 'occurredAt');
  if (input.evidenceSha256) {
    assertSha256(input.evidenceSha256, 'evidenceSha256');
  }
  if (input.exceptionCode) {
    assertOpaqueId(input.exceptionCode, 'exceptionCode');
  }
  if (input.receipt) validateReceipt(input.receipt);
}

function validateConditionTransition(
  input: TransitionCompanyConditionWorkItemInput,
): void {
  validateTransition(input);
  if (input.deadlineAt) assertTimestamp(input.deadlineAt, 'deadlineAt');
  if (input.eventType === 'reopened') {
    if (
      !input.deadlineAt ||
      Date.parse(input.deadlineAt) <= Date.parse(input.occurredAt)
    ) {
      invalid('reopened business condition requires a future deadlineAt');
    }
  } else if (input.deadlineAt !== undefined) {
    invalid('deadlineAt is accepted only when reopening a business condition');
  }
}

async function findDuplicateEvent(
  client: CompanyWorkLedgerClient,
  input: Pick<
    TransitionCompanyWorkItemInput,
    'workItemId' | 'idempotencyKey' | 'sourceSystem' | 'sourceEventKey'
  >,
  expectedFingerprint: string,
): Promise<CompanyWorkMutationResult | null> {
  const existing = await client.query<ExistingEventRow>(
    `SELECT work_item_id::text, event_fingerprint
       FROM business_v2.company_work_events
      WHERE idempotency_key = $1
         OR (source_system = $2 AND source_event_key = $3)
      ORDER BY id ASC`,
    [input.idempotencyKey, input.sourceSystem, input.sourceEventKey],
  );
  if (existing.rows.length === 0) return null;
  if (existing.rows.length !== 1) {
    throw new CompanyWorkLedgerError(
      'conflict',
      'idempotency and source event identities resolve to different events',
    );
  }
  const row = existing.rows[0];
  if (
    row.work_item_id !== input.workItemId ||
    row.event_fingerprint !== expectedFingerprint
  ) {
    throw new CompanyWorkLedgerError(
      'conflict',
      'idempotency/source event identity was reused with different facts',
    );
  }
  const item = await loadWorkItem(client, input.workItemId, false);
  return { item, applied: false, duplicate: true };
}

async function loadWorkItem(
  client: CompanyWorkLedgerClient,
  id: string,
  forUpdate: boolean,
): Promise<CompanyWorkItem> {
  const result = await client.query<WorkItemRow>(
    `SELECT ${ITEM_COLUMNS}
       FROM business_v2.company_work_items
      WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!result.rows[0]) {
    throw new CompanyWorkLedgerError('not_found', `work item ${id} not found`);
  }
  return toItem(result.rows[0]);
}

function createFingerprint(input: CreateCompanyWorkItemInput): string {
  return fingerprint([
    'create-v1',
    'sales_email',
    input.sourceSystem,
    input.sourceKey,
    input.sourceEventKey,
    input.partyId,
    input.pipelineEntryId,
    input.actor,
    input.evidenceSha256,
    input.occurredAt,
    input.deadlineAt ?? null,
  ]);
}

function createJobFingerprint(input: CreateCompanyJobWorkItemInput): string {
  return fingerprint([
    'host-job-create-v1',
    'host_job_run',
    input.sourceSystem,
    input.sourceKey,
    input.sourceEventKey,
    input.actor,
    input.evidenceSha256,
    input.occurredAt,
    input.deadlineAt,
  ]);
}

function createConditionFingerprint(
  input: EnsureCompanyConditionWorkItemInput,
): string {
  return fingerprint([
    'condition-create-v1',
    'program_facts_drift',
    input.sourceSystem,
    input.sourceKey,
    input.sourceEventKey,
    input.actor,
    input.evidenceSha256,
    input.occurredAt,
    input.deadlineAt,
  ]);
}

/** @internal The caller must supply a client inside an open transaction. */
export async function createCompanyWorkItemWithClient(
  client: CompanyWorkLedgerClient,
  input: CreateCompanyWorkItemInput,
): Promise<CompanyWorkMutationResult> {
  validateCreate(input);
  const eventFingerprint = createFingerprint(input);

  const duplicateByEvent = await client.query<ExistingEventRow>(
    `SELECT work_item_id::text, event_fingerprint
       FROM business_v2.company_work_events
      WHERE idempotency_key = $1
         OR (source_system = $2 AND source_event_key = $3)
      ORDER BY id ASC`,
    [input.idempotencyKey, input.sourceSystem, input.sourceEventKey],
  );
  if (duplicateByEvent.rows.length > 1) {
    throw new CompanyWorkLedgerError(
      'conflict',
      'create idempotency and source event identities resolve differently',
    );
  }
  if (duplicateByEvent.rows[0]) {
    if (duplicateByEvent.rows[0].event_fingerprint !== eventFingerprint) {
      throw new CompanyWorkLedgerError(
        'conflict',
        'create event identity was reused with different facts',
      );
    }
    const item = await loadWorkItem(
      client,
      duplicateByEvent.rows[0].work_item_id,
      false,
    );
    return { item, applied: false, duplicate: true };
  }

  const inserted = await client.query<WorkItemRow>(
    `INSERT INTO business_v2.company_work_items
       (workflow_type, source_system, source_key, party_id,
        pipeline_entry_id, deadline_at, last_transition_at,
        last_transition_by)
     VALUES ('sales_email', $1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (workflow_type, source_system, source_key) DO NOTHING
     RETURNING ${ITEM_COLUMNS}`,
    [
      input.sourceSystem,
      input.sourceKey,
      input.partyId,
      input.pipelineEntryId,
      input.deadlineAt ?? null,
      input.occurredAt,
      input.actor,
    ],
  );

  let item: CompanyWorkItem;
  let created = false;
  if (inserted.rows[0]) {
    item = toItem(inserted.rows[0]);
    created = true;
  } else {
    const existing = await client.query<WorkItemRow>(
      `SELECT ${ITEM_COLUMNS}
         FROM business_v2.company_work_items
        WHERE workflow_type = 'sales_email'
          AND source_system = $1 AND source_key = $2
        FOR UPDATE`,
      [input.sourceSystem, input.sourceKey],
    );
    if (!existing.rows[0]) {
      throw new CompanyWorkLedgerError(
        'conflict',
        'work-item create lost its uniqueness race without a durable row',
      );
    }
    item = toItem(existing.rows[0]);
    if (
      item.partyId !== input.partyId ||
      item.pipelineEntryId !== input.pipelineEntryId ||
      !timestampsMatch(item.deadlineAt, input.deadlineAt ?? null)
    ) {
      throw new CompanyWorkLedgerError(
        'conflict',
        'source work identity was reused with different immutable facts',
      );
    }
  }

  if (!created) {
    const sourceEvent = await client.query<ExistingEventRow>(
      `SELECT work_item_id::text, event_fingerprint
         FROM business_v2.company_work_events
        WHERE source_system = $1 AND source_event_key = $2`,
      [input.sourceSystem, input.sourceEventKey],
    );
    if (
      sourceEvent.rows[0]?.work_item_id === item.id &&
      sourceEvent.rows[0]?.event_fingerprint === eventFingerprint
    ) {
      return { item, applied: false, duplicate: true };
    }
    throw new CompanyWorkLedgerError(
      'conflict',
      'existing work item is missing the exact accepted source event',
    );
  }

  await client.query(
    `INSERT INTO business_v2.company_work_events
       (work_item_id, work_item_version, event_type, from_stage, to_stage,
        from_disposition, to_disposition, actor, source_system,
        source_event_key, idempotency_key, event_fingerprint,
        evidence_sha256, occurred_at)
     VALUES ($1, 0, 'accepted', NULL, 'accepted', NULL, 'open', $2, $3, $4,
             $5, $6, $7, $8)`,
    [
      item.id,
      input.actor,
      input.sourceSystem,
      input.sourceEventKey,
      input.idempotencyKey,
      eventFingerprint,
      input.evidenceSha256,
      input.occurredAt,
    ],
  );
  return { item, applied: true, duplicate: false };
}

/** @internal The caller must supply a client inside an open transaction. */
export async function createCompanyJobWorkItemWithClient(
  client: CompanyWorkLedgerClient,
  input: CreateCompanyJobWorkItemInput,
): Promise<CompanyWorkMutationResult> {
  validateJobCreate(input);
  const eventFingerprint = createJobFingerprint(input);

  const duplicateByEvent = await client.query<ExistingEventRow>(
    `SELECT work_item_id::text, event_fingerprint
       FROM business_v2.company_work_events
      WHERE idempotency_key = $1
         OR (source_system = $2 AND source_event_key = $3)
      ORDER BY id ASC`,
    [input.idempotencyKey, input.sourceSystem, input.sourceEventKey],
  );
  if (duplicateByEvent.rows.length > 1) {
    throw new CompanyWorkLedgerError(
      'conflict',
      'host-job create identities resolve differently',
    );
  }
  if (duplicateByEvent.rows[0]) {
    if (duplicateByEvent.rows[0].event_fingerprint !== eventFingerprint) {
      throw new CompanyWorkLedgerError(
        'conflict',
        'host-job create identity was reused with different facts',
      );
    }
    const item = await loadWorkItem(
      client,
      duplicateByEvent.rows[0].work_item_id,
      false,
    );
    if (item.workflowType !== 'host_job_run') {
      throw new CompanyWorkLedgerError(
        'conflict',
        'host-job create identity resolved to another workflow',
      );
    }
    return { item, applied: false, duplicate: true };
  }

  const inserted = await client.query<WorkItemRow>(
    `INSERT INTO business_v2.company_work_items
       (workflow_type, source_system, source_key, party_id,
        pipeline_entry_id, completion_definition, deadline_at,
        last_transition_at, last_transition_by)
     VALUES ('host_job_run', $1, $2, NULL, NULL,
             'host_job_terminal_receipt', $3, $4, $5)
     ON CONFLICT (workflow_type, source_system, source_key) DO NOTHING
     RETURNING ${ITEM_COLUMNS}`,
    [
      input.sourceSystem,
      input.sourceKey,
      input.deadlineAt,
      input.occurredAt,
      input.actor,
    ],
  );

  let item: CompanyWorkItem;
  let created = false;
  if (inserted.rows[0]) {
    item = toItem(inserted.rows[0]);
    created = true;
  } else {
    const existing = await client.query<WorkItemRow>(
      `SELECT ${ITEM_COLUMNS}
         FROM business_v2.company_work_items
        WHERE workflow_type = 'host_job_run'
          AND source_system = $1 AND source_key = $2
        FOR UPDATE`,
      [input.sourceSystem, input.sourceKey],
    );
    if (!existing.rows[0]) {
      throw new CompanyWorkLedgerError(
        'conflict',
        'host-job create lost its uniqueness race without a durable row',
      );
    }
    item = toItem(existing.rows[0]);
    if (
      item.workflowType !== 'host_job_run' ||
      item.partyId !== null ||
      item.pipelineEntryId !== null ||
      item.completionDefinition !== 'host_job_terminal_receipt' ||
      !timestampsMatch(item.deadlineAt, input.deadlineAt)
    ) {
      throw new CompanyWorkLedgerError(
        'conflict',
        'host-job source identity was reused with different immutable facts',
      );
    }
  }

  if (!created) {
    const sourceEvent = await client.query<ExistingEventRow>(
      `SELECT work_item_id::text, event_fingerprint
         FROM business_v2.company_work_events
        WHERE source_system = $1 AND source_event_key = $2`,
      [input.sourceSystem, input.sourceEventKey],
    );
    if (
      sourceEvent.rows[0]?.work_item_id === item.id &&
      sourceEvent.rows[0]?.event_fingerprint === eventFingerprint
    ) {
      return { item, applied: false, duplicate: true };
    }
    throw new CompanyWorkLedgerError(
      'conflict',
      'existing host-job work item is missing its exact accepted event',
    );
  }

  await client.query(
    `INSERT INTO business_v2.company_work_events
       (work_item_id, work_item_version, event_type, from_stage, to_stage,
        from_disposition, to_disposition, actor, source_system,
        source_event_key, idempotency_key, event_fingerprint,
        evidence_sha256, occurred_at)
     VALUES ($1, 0, 'accepted', NULL, 'accepted', NULL, 'open', $2, $3, $4,
             $5, $6, $7, $8)`,
    [
      item.id,
      input.actor,
      input.sourceSystem,
      input.sourceEventKey,
      input.idempotencyKey,
      eventFingerprint,
      input.evidenceSha256,
      input.occurredAt,
    ],
  );
  return { item, applied: true, duplicate: false };
}

/**
 * Ensure the one stable program-facts condition item exists. Later detector
 * runs deliberately reuse the source identity; their exact evidence lives in
 * trigger occurrences and append-only observations rather than duplicate
 * accepted events.
 */
export async function ensureCompanyConditionWorkItemWithClient(
  client: CompanyWorkLedgerClient,
  input: EnsureCompanyConditionWorkItemInput,
): Promise<CompanyWorkMutationResult> {
  validateConditionCreate(input);
  const eventFingerprint = createConditionFingerprint(input);

  const duplicateByEvent = await client.query<ExistingEventRow>(
    `SELECT work_item_id::text, event_fingerprint
       FROM business_v2.company_work_events
      WHERE idempotency_key = $1
         OR (source_system = $2 AND source_event_key = $3)
      ORDER BY id ASC`,
    [input.idempotencyKey, input.sourceSystem, input.sourceEventKey],
  );
  if (duplicateByEvent.rows.length > 1) {
    throw new CompanyWorkLedgerError(
      'conflict',
      'condition create identities resolve differently',
    );
  }
  if (duplicateByEvent.rows[0]) {
    if (duplicateByEvent.rows[0].event_fingerprint !== eventFingerprint) {
      throw new CompanyWorkLedgerError(
        'conflict',
        'condition create identity was reused with different facts',
      );
    }
    const item = await loadWorkItem(
      client,
      duplicateByEvent.rows[0].work_item_id,
      false,
    );
    if (item.workflowType !== 'program_facts_drift') {
      throw new CompanyWorkLedgerError(
        'conflict',
        'condition create identity resolved to another workflow',
      );
    }
    return { item, applied: false, duplicate: true };
  }

  const inserted = await client.query<WorkItemRow>(
    `INSERT INTO business_v2.company_work_items
       (workflow_type, source_system, source_key, party_id,
        pipeline_entry_id, completion_definition, deadline_at,
        last_transition_at, last_transition_by)
     VALUES ('program_facts_drift', $1, $2, NULL, NULL,
             'detector_clean_receipt', $3, $4, $5)
     ON CONFLICT (workflow_type, source_system, source_key) DO NOTHING
     RETURNING ${ITEM_COLUMNS}`,
    [
      input.sourceSystem,
      input.sourceKey,
      input.deadlineAt,
      input.occurredAt,
      input.actor,
    ],
  );

  if (!inserted.rows[0]) {
    const existing = await client.query<WorkItemRow>(
      `SELECT ${ITEM_COLUMNS}
         FROM business_v2.company_work_items
        WHERE workflow_type = 'program_facts_drift'
          AND source_system = $1 AND source_key = $2
        FOR UPDATE`,
      [input.sourceSystem, input.sourceKey],
    );
    const item = existing.rows[0] ? toItem(existing.rows[0]) : null;
    if (
      !item ||
      item.workflowType !== 'program_facts_drift' ||
      item.partyId !== null ||
      item.pipelineEntryId !== null ||
      item.completionDefinition !== 'detector_clean_receipt'
    ) {
      throw new CompanyWorkLedgerError(
        'conflict',
        'condition source identity was reused with different immutable facts',
      );
    }
    return { item, applied: false, duplicate: true };
  }

  const item = toItem(inserted.rows[0]);
  await client.query(
    `INSERT INTO business_v2.company_work_events
       (work_item_id, work_item_version, event_type, from_stage, to_stage,
        from_disposition, to_disposition, actor, source_system,
        source_event_key, idempotency_key, event_fingerprint,
        evidence_sha256, occurred_at)
     VALUES ($1, 0, 'accepted', NULL, 'accepted', NULL, 'open', $2, $3, $4,
             $5, $6, $7, $8)`,
    [
      item.id,
      input.actor,
      input.sourceSystem,
      input.sourceEventKey,
      input.idempotencyKey,
      eventFingerprint,
      input.evidenceSha256,
      input.occurredAt,
    ],
  );
  return { item, applied: true, duplicate: false };
}

async function insertOrValidateReceipt(
  client: CompanyWorkLedgerClient,
  workItemId: string,
  receipt: CompanyWorkReceiptInput,
): Promise<string> {
  const inserted = await client.query<ReceiptRow>(
    `INSERT INTO business_v2.company_work_receipts
       (work_item_id, receipt_type, receipt_system, receipt_key,
        evidence_sha256, external_action_id, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (receipt_system, receipt_key) DO NOTHING
     RETURNING id::text, work_item_id::text, receipt_type, receipt_system,
               receipt_key, evidence_sha256, external_action_id,
               occurred_at::text`,
    [
      workItemId,
      receipt.type,
      receipt.system,
      receipt.key,
      receipt.evidenceSha256,
      receipt.externalActionId ?? null,
      receipt.occurredAt,
    ],
  );
  let row = inserted.rows[0];
  if (!row) {
    const existing = await client.query<ReceiptRow>(
      `SELECT id::text, work_item_id::text, receipt_type, receipt_system,
              receipt_key, evidence_sha256, external_action_id,
              occurred_at::text
         FROM business_v2.company_work_receipts
        WHERE receipt_system = $1 AND receipt_key = $2
        FOR UPDATE`,
      [receipt.system, receipt.key],
    );
    row = existing.rows[0];
  }
  if (
    !row ||
    row.work_item_id !== workItemId ||
    row.receipt_type !== receipt.type ||
    row.receipt_system !== receipt.system ||
    row.receipt_key !== receipt.key ||
    row.evidence_sha256 !== receipt.evidenceSha256 ||
    row.external_action_id !== (receipt.externalActionId ?? null) ||
    Date.parse(row.occurred_at) !== Date.parse(receipt.occurredAt)
  ) {
    throw new CompanyWorkLedgerError(
      'conflict',
      'receipt identity was reused with different work or evidence',
    );
  }
  return row.id;
}

/** @internal The caller must supply a client inside an open transaction. */
export async function transitionCompanyWorkItemWithClient(
  client: CompanyWorkLedgerClient,
  input: TransitionCompanyWorkItemInput,
): Promise<CompanyWorkMutationResult> {
  validateTransition(input);
  const eventFingerprint = fingerprintCompanyWorkTransition(input);
  const duplicate = await findDuplicateEvent(client, input, eventFingerprint);
  if (duplicate) return duplicate;

  const current = await loadWorkItem(client, input.workItemId, true);
  if (current.workflowType !== 'sales_email') {
    throw new CompanyWorkLedgerError(
      'invalid_transition',
      'approved-email transition cannot mutate another workflow type',
    );
  }
  if (current.version !== input.expectedVersion) {
    throw new CompanyWorkLedgerError(
      'stale_version',
      `work item ${input.workItemId} is version ${current.version}, not ${input.expectedVersion}`,
    );
  }
  const planned = planCompanyWorkTransition(current, input.eventType, {
    evidenceSha256: input.evidenceSha256,
    exceptionCode: input.exceptionCode,
    receipt: input.receipt,
  });
  if (input.receipt) validateReceipt(input.receipt);
  const receiptId = input.receipt
    ? await insertOrValidateReceipt(client, current.id, input.receipt)
    : null;

  const updated = await client.query<WorkItemRow>(
    `UPDATE business_v2.company_work_items
        SET stage = $2, disposition = $3, version = version + 1,
            block_code = $4, failure_code = $5,
            updated_at = now(), last_transition_at = $6,
            last_transition_by = $7
      WHERE id = $1 AND version = $8
      RETURNING ${ITEM_COLUMNS}`,
    [
      current.id,
      planned.stage,
      planned.disposition,
      planned.blockCode,
      planned.failureCode,
      input.occurredAt,
      input.actor,
      input.expectedVersion,
    ],
  );
  if (!updated.rows[0]) {
    throw new CompanyWorkLedgerError(
      'stale_version',
      `work item ${current.id} changed during transition`,
    );
  }
  const item = toItem(updated.rows[0]);

  await client.query(
    `INSERT INTO business_v2.company_work_events
       (work_item_id, work_item_version, event_type, from_stage, to_stage,
        from_disposition, to_disposition, actor, source_system,
        source_event_key, idempotency_key, event_fingerprint,
        evidence_sha256, exception_code, receipt_id, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
             $14, $15, $16)`,
    [
      current.id,
      item.version,
      input.eventType,
      current.stage,
      item.stage,
      current.disposition,
      item.disposition,
      input.actor,
      input.sourceSystem,
      input.sourceEventKey,
      input.idempotencyKey,
      eventFingerprint,
      input.evidenceSha256 ?? null,
      input.exceptionCode ?? null,
      receiptId,
      input.occurredAt,
    ],
  );

  return { item, applied: true, duplicate: false };
}

/** @internal The caller must supply a client inside an open transaction. */
export async function transitionCompanyJobWorkItemWithClient(
  client: CompanyWorkLedgerClient,
  input: TransitionCompanyJobWorkItemInput,
): Promise<CompanyWorkMutationResult> {
  validateTransition(input);
  const eventFingerprint = fingerprintCompanyJobWorkTransition(input);
  const duplicate = await findDuplicateEvent(client, input, eventFingerprint);
  if (duplicate) return duplicate;

  const current = await loadWorkItem(client, input.workItemId, true);
  if (current.workflowType !== 'host_job_run') {
    throw new CompanyWorkLedgerError(
      'invalid_transition',
      'host-job transition cannot mutate another workflow type',
    );
  }
  if (current.version !== input.expectedVersion) {
    throw new CompanyWorkLedgerError(
      'stale_version',
      `work item ${input.workItemId} is version ${current.version}, not ${input.expectedVersion}`,
    );
  }
  const planned = planCompanyJobWorkTransition(current, input.eventType, {
    evidenceSha256: input.evidenceSha256,
    exceptionCode: input.exceptionCode,
    receipt: input.receipt,
  });
  if (input.receipt) validateReceipt(input.receipt);
  const receiptId = input.receipt
    ? await insertOrValidateReceipt(client, current.id, input.receipt)
    : null;

  const updated = await client.query<WorkItemRow>(
    `UPDATE business_v2.company_work_items
        SET stage = $2, disposition = $3, version = version + 1,
            block_code = $4, failure_code = $5,
            updated_at = now(), last_transition_at = $6,
            last_transition_by = $7
      WHERE id = $1 AND version = $8
      RETURNING ${ITEM_COLUMNS}`,
    [
      current.id,
      planned.stage,
      planned.disposition,
      planned.blockCode,
      planned.failureCode,
      input.occurredAt,
      input.actor,
      input.expectedVersion,
    ],
  );
  if (!updated.rows[0]) {
    throw new CompanyWorkLedgerError(
      'stale_version',
      `work item ${current.id} changed during host-job transition`,
    );
  }
  const item = toItem(updated.rows[0]);

  await client.query(
    `INSERT INTO business_v2.company_work_events
       (work_item_id, work_item_version, event_type, from_stage, to_stage,
        from_disposition, to_disposition, actor, source_system,
        source_event_key, idempotency_key, event_fingerprint,
        evidence_sha256, exception_code, receipt_id, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
             $14, $15, $16)`,
    [
      current.id,
      item.version,
      input.eventType,
      current.stage,
      item.stage,
      current.disposition,
      item.disposition,
      input.actor,
      input.sourceSystem,
      input.sourceEventKey,
      input.idempotencyKey,
      eventFingerprint,
      input.evidenceSha256,
      input.exceptionCode ?? null,
      receiptId,
      input.occurredAt,
    ],
  );

  return { item, applied: true, duplicate: false };
}

/** @internal The caller must supply a client inside an open transaction. */
export async function transitionCompanyConditionWorkItemWithClient(
  client: CompanyWorkLedgerClient,
  input: TransitionCompanyConditionWorkItemInput,
): Promise<CompanyWorkMutationResult> {
  validateConditionTransition(input);
  const eventFingerprint = fingerprintCompanyConditionWorkTransition(input);
  const duplicate = await findDuplicateEvent(client, input, eventFingerprint);
  if (duplicate) return duplicate;

  const current = await loadWorkItem(client, input.workItemId, true);
  if (current.workflowType !== 'program_facts_drift') {
    throw new CompanyWorkLedgerError(
      'invalid_transition',
      'condition transition cannot mutate another workflow type',
    );
  }
  if (current.version !== input.expectedVersion) {
    throw new CompanyWorkLedgerError(
      'stale_version',
      `work item ${input.workItemId} is version ${current.version}, not ${input.expectedVersion}`,
    );
  }
  const planned = planCompanyConditionWorkTransition(current, input.eventType, {
    evidenceSha256: input.evidenceSha256,
    exceptionCode: input.exceptionCode,
    receipt: input.receipt,
  });
  if (input.receipt) validateReceipt(input.receipt);
  const receiptId = input.receipt
    ? await insertOrValidateReceipt(client, current.id, input.receipt)
    : null;
  const nextDeadline =
    input.eventType === 'reopened'
      ? (input.deadlineAt as string)
      : current.deadlineAt;

  const updated = await client.query<WorkItemRow>(
    `UPDATE business_v2.company_work_items
        SET stage = $2, disposition = $3, version = version + 1,
            block_code = $4, failure_code = $5, deadline_at = $6,
            updated_at = now(), last_transition_at = $7,
            last_transition_by = $8
      WHERE id = $1 AND version = $9
      RETURNING ${ITEM_COLUMNS}`,
    [
      current.id,
      planned.stage,
      planned.disposition,
      planned.blockCode,
      planned.failureCode,
      nextDeadline,
      input.occurredAt,
      input.actor,
      input.expectedVersion,
    ],
  );
  if (!updated.rows[0]) {
    throw new CompanyWorkLedgerError(
      'stale_version',
      `work item ${current.id} changed during condition transition`,
    );
  }
  const item = toItem(updated.rows[0]);

  await client.query(
    `INSERT INTO business_v2.company_work_events
       (work_item_id, work_item_version, event_type, from_stage, to_stage,
        from_disposition, to_disposition, actor, source_system,
        source_event_key, idempotency_key, event_fingerprint,
        evidence_sha256, exception_code, receipt_id, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
             $14, $15, $16)`,
    [
      current.id,
      item.version,
      input.eventType,
      current.stage,
      item.stage,
      current.disposition,
      item.disposition,
      input.actor,
      input.sourceSystem,
      input.sourceEventKey,
      input.idempotencyKey,
      eventFingerprint,
      input.evidenceSha256,
      input.exceptionCode ?? null,
      receiptId,
      input.occurredAt,
    ],
  );

  return { item, applied: true, duplicate: false };
}

export async function createCompanyWorkItem(
  input: CreateCompanyWorkItemInput,
): Promise<CompanyWorkMutationResult> {
  return withAgentContext('company-work-ledger:host', (client) =>
    createCompanyWorkItemWithClient(client, input),
  );
}

export async function createCompanyJobWorkItem(
  input: CreateCompanyJobWorkItemInput,
): Promise<CompanyWorkMutationResult> {
  return withAgentContext('company-job-work-ledger:host', (client) =>
    createCompanyJobWorkItemWithClient(client, input),
  );
}

export async function ensureCompanyConditionWorkItem(
  input: EnsureCompanyConditionWorkItemInput,
): Promise<CompanyWorkMutationResult> {
  return withAgentContext('company-condition-work-ledger:host', (client) =>
    ensureCompanyConditionWorkItemWithClient(client, input),
  );
}

export async function transitionCompanyWorkItem(
  input: TransitionCompanyWorkItemInput,
): Promise<CompanyWorkMutationResult> {
  return withAgentContext('company-work-ledger:host', (client) =>
    transitionCompanyWorkItemWithClient(client, input),
  );
}

export async function transitionCompanyJobWorkItem(
  input: TransitionCompanyJobWorkItemInput,
): Promise<CompanyWorkMutationResult> {
  return withAgentContext('company-job-work-ledger:host', (client) =>
    transitionCompanyJobWorkItemWithClient(client, input),
  );
}

export async function transitionCompanyConditionWorkItem(
  input: TransitionCompanyConditionWorkItemInput,
): Promise<CompanyWorkMutationResult> {
  return withAgentContext('company-condition-work-ledger:host', (client) =>
    transitionCompanyConditionWorkItemWithClient(client, input),
  );
}

/** Load one host-owned work projection without exposing it to an agent role. */
export async function getCompanyWorkItemBySource(
  sourceSystem: string,
  sourceKey: string,
): Promise<CompanyWorkItem | null> {
  assertOpaqueId(sourceSystem, 'sourceSystem');
  assertOpaqueId(sourceKey, 'sourceKey');
  return withAgentContext('company-work-ledger:host', async (client) => {
    const result = await client.query<WorkItemRow>(
      `SELECT ${ITEM_COLUMNS}
         FROM business_v2.company_work_items
        WHERE workflow_type = 'sales_email'
          AND source_system = $1 AND source_key = $2`,
      [sourceSystem, sourceKey],
    );
    return result.rows[0] ? toItem(result.rows[0]) : null;
  });
}

/** Load one host-job projection. SQLite jobs/job_run_logs remain authority. */
export async function getCompanyJobWorkItemBySource(
  sourceSystem: string,
  sourceKey: string,
): Promise<CompanyWorkItem | null> {
  assertOpaqueId(sourceSystem, 'sourceSystem');
  assertOpaqueId(sourceKey, 'sourceKey');
  return withAgentContext('company-job-work-ledger:host', async (client) => {
    const result = await client.query<WorkItemRow>(
      `SELECT ${ITEM_COLUMNS}
         FROM business_v2.company_work_items
        WHERE workflow_type = 'host_job_run'
          AND source_system = $1 AND source_key = $2`,
      [sourceSystem, sourceKey],
    );
    return result.rows[0] ? toItem(result.rows[0]) : null;
  });
}

/** @internal Load and optionally lock the stable business-condition item. */
export async function getCompanyConditionWorkItemBySourceWithClient(
  client: CompanyWorkLedgerClient,
  sourceSystem: string,
  sourceKey: string,
  forUpdate = false,
): Promise<CompanyWorkItem | null> {
  assertOpaqueId(sourceSystem, 'sourceSystem');
  assertOpaqueId(sourceKey, 'sourceKey');
  const result = await client.query<WorkItemRow>(
    `SELECT ${ITEM_COLUMNS}
       FROM business_v2.company_work_items
      WHERE workflow_type = 'program_facts_drift'
        AND source_system = $1 AND source_key = $2${
          forUpdate ? ' FOR UPDATE' : ''
        }`,
    [sourceSystem, sourceKey],
  );
  return result.rows[0] ? toItem(result.rows[0]) : null;
}

export async function getCompanyConditionWorkItemBySource(
  sourceSystem: string,
  sourceKey: string,
): Promise<CompanyWorkItem | null> {
  return withAgentContext('company-condition-work-ledger:host', (client) =>
    getCompanyConditionWorkItemBySourceWithClient(
      client,
      sourceSystem,
      sourceKey,
    ),
  );
}

/**
 * Return the immutable identity of an already-projected source event.
 * Shadow callers use this to validate retries without guessing the historical
 * optimistic version from the work item's current state.
 */
export async function getCompanyWorkEventIdentity(
  sourceSystem: string,
  sourceEventKey: string,
): Promise<CompanyWorkEventIdentity | null> {
  assertOpaqueId(sourceSystem, 'sourceSystem');
  assertOpaqueId(sourceEventKey, 'sourceEventKey');
  return withAgentContext('company-work-ledger:host', async (client) => {
    const result = await client.query<EventIdentityRow>(
      `SELECT work_item_id::text, work_item_version, event_fingerprint
         FROM business_v2.company_work_events
        WHERE source_system = $1 AND source_event_key = $2`,
      [sourceSystem, sourceEventKey],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      workItemId: row.work_item_id,
      workItemVersion: row.work_item_version,
      eventFingerprint: row.event_fingerprint,
    };
  });
}
