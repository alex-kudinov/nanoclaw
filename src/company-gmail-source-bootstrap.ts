/**
 * One-shot, host-only bootstrap for the dark inbound Gmail trigger source.
 *
 * This module never imports Gmail auth/client code and never writes SQLite.
 * Registration plus the initial watermark event run in one PostgreSQL
 * transaction. The existing SQLite `gmail_history_id` remains runtime
 * authority until a separately promoted adapter changes that boundary.
 */

import { createHash } from 'node:crypto';

import type { CompanyTriggerClient } from './company-trigger.js';
import {
  createCompanyGmailInboundSource,
  type CompanyGmailInboundSourceOptions,
} from './company-gmail-reconciliation.js';
import {
  normalizeCompanyTriggerWatermarkEvent,
  type CompanyTriggerSourceRegistrationResult,
  type CompanyTriggerWatermarkRecordResult,
} from './company-trigger-source.js';

export const COMPANY_GMAIL_SOURCE_BOOTSTRAP_CONTRACT_VERSION = 1 as const;
export const COMPANY_GMAIL_SOURCE_BOOTSTRAP_TASK_ID =
  'NC-20260818-001' as const;
export const COMPANY_GMAIL_SOURCE_BOOTSTRAP_CONFIRMATION =
  'NC-20260818-001-GMAIL-SOURCE-BOOTSTRAP' as const;
export const COMPANY_GMAIL_SOURCE_BOOTSTRAP_MAX_AGE_MS = 10 * 60 * 1000;

export const COMPANY_GMAIL_SOURCE_OPTIONS = Object.freeze({
  accountAlias: 'primary',
  ownerKey: 'core:gmail',
  alertRouteKey: 'group:chief',
}) satisfies Readonly<CompanyGmailInboundSourceOptions>;

export const COMPANY_GMAIL_SOURCE_REGISTRATION_INPUT = Object.freeze({
  kind: 'gmail',
  sourceSystem: 'gmail',
  sourceKey: 'mailbox:primary:inbound-v1',
  adapterKey: 'gmail_inbound_full_snapshot',
  adapterVersion: '1.0.0',
  cursorKind: 'uint',
  reconciliationMode: 'full_snapshot',
  maxReconciliationWindowSeconds: 8 * 24 * 60 * 60,
  freshnessBudgetSeconds: 20 * 60,
  ownerKey: 'core:gmail',
  alertRouteKey: 'group:chief',
});

export type CompanyGmailSourceBootstrapMode = 'dry_run' | 'apply';

export type CompanyGmailSourceBootstrapErrorCode =
  | 'invalid_input'
  | 'stale_observation'
  | 'cursor_drift'
  | 'storage_unavailable';

export class CompanyGmailSourceBootstrapError extends Error {
  constructor(
    public readonly code: CompanyGmailSourceBootstrapErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CompanyGmailSourceBootstrapError';
  }
}

export interface CompanyGmailSourceBootstrapInput {
  mode: CompanyGmailSourceBootstrapMode;
  expectedHistoryId: string;
  observedAt: string;
}

export interface CompanyGmailSourceBootstrapPlan {
  source: ReturnType<typeof createCompanyGmailInboundSource>;
  event: ReturnType<typeof normalizeCompanyTriggerWatermarkEvent>;
  historyIdSha256: string;
}

export interface CompanyGmailSourceBootstrapReport {
  contractVersion: typeof COMPANY_GMAIL_SOURCE_BOOTSTRAP_CONTRACT_VERSION;
  taskId: typeof COMPANY_GMAIL_SOURCE_BOOTSTRAP_TASK_ID;
  mode: CompanyGmailSourceBootstrapMode;
  source: {
    definitionId: string;
    sourceFingerprint: string;
    sourceKey: 'mailbox:primary:inbound-v1';
    adapterKey: 'gmail_inbound_full_snapshot';
    adapterVersion: '1.0.0';
    actionAuthority: 'none';
  };
  bootstrap: {
    eventKey: string;
    eventFingerprint: string;
    observedAt: string;
    observedCount: 0;
    acceptedCount: 0;
    rejectedCount: 0;
    historyIdSha256: string;
    actionAuthority: 'none';
  };
  sqlite: {
    queryOnly: true;
    cursorStable: boolean;
    written: false;
  };
  postgres: {
    transactionAttempted: boolean;
    sourceApplied: boolean | null;
    sourceDuplicate: boolean | null;
    bootstrapApplied: boolean | null;
    bootstrapDuplicate: boolean | null;
    stateVersion: number | null;
    stateStatus: 'current' | null;
  };
  safety: {
    gmailQueried: false;
    daemonImported: false;
    shadowRowsWritten: false;
    cursorAuthorityChanged: false;
    actionAuthority: 'none';
  };
}

export interface CompanyGmailSourceBootstrapDependencies {
  readHistoryId(): string;
  now(): string;
  withTransaction<T>(
    fn: (client: CompanyTriggerClient) => Promise<T>,
  ): Promise<T>;
  registerSource(
    client: CompanyTriggerClient,
    input: unknown,
  ): Promise<CompanyTriggerSourceRegistrationResult>;
  recordWatermark(
    client: CompanyTriggerClient,
    input: unknown,
  ): Promise<CompanyTriggerWatermarkRecordResult>;
}

function fail(
  code: CompanyGmailSourceBootstrapErrorCode,
  message: string,
  cause?: unknown,
): never {
  throw new CompanyGmailSourceBootstrapError(
    code,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function hash(parts: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function normalizeHistoryId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    fail('invalid_input', `${field} is invalid`);
  }
  return BigInt(value).toString();
}

export function deriveCompanyGmailHistoryIdSha256(value: unknown): string {
  const historyId = normalizeHistoryId(value, 'gmail_history_id');
  const source = createCompanyGmailInboundSource(COMPANY_GMAIL_SOURCE_OPTIONS);
  return hash([
    'company-gmail-bootstrap-history-id:v1',
    source.definitionId,
    historyId,
  ]);
}

function normalizeTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string') fail('invalid_input', `${field} is invalid`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    fail('invalid_input', `${field} is invalid`);
  }
  const normalized = new Date(milliseconds).toISOString();
  if (value !== normalized) {
    fail('invalid_input', `${field} must be a canonical UTC timestamp`);
  }
  return normalized;
}

function requireCurrentObservation(observedAt: string, now: string): void {
  const observedMs = Date.parse(observedAt);
  const nowMs = Date.parse(normalizeTimestamp(now, 'now'));
  if (
    observedMs > nowMs ||
    nowMs - observedMs > COMPANY_GMAIL_SOURCE_BOOTSTRAP_MAX_AGE_MS
  ) {
    fail('stale_observation', 'bootstrap observation is outside the live gate');
  }
}

function exactCursor(
  expectedHistoryId: string,
  observedHistoryId: unknown,
): string {
  let observed: string;
  try {
    observed = normalizeHistoryId(observedHistoryId, 'gmail_history_id');
  } catch (error) {
    fail(
      'storage_unavailable',
      'durable Gmail history cursor is unavailable',
      error,
    );
  }
  if (observed !== expectedHistoryId) {
    fail('cursor_drift', 'durable Gmail history cursor changed');
  }
  return observed;
}

function readExactCursor(
  deps: Pick<CompanyGmailSourceBootstrapDependencies, 'readHistoryId'>,
  expectedHistoryId: string,
): string {
  let observedHistoryId: unknown;
  try {
    observedHistoryId = deps.readHistoryId();
  } catch (error) {
    fail(
      'storage_unavailable',
      'durable Gmail history cursor is unavailable',
      error,
    );
  }
  return exactCursor(expectedHistoryId, observedHistoryId);
}

function registrationInput(
  source: CompanyGmailSourceBootstrapPlan['source'],
): typeof COMPANY_GMAIL_SOURCE_REGISTRATION_INPUT {
  const derived = {
    kind: source.kind,
    sourceSystem: source.sourceSystem,
    sourceKey: source.sourceKey,
    adapterKey: source.adapterKey,
    adapterVersion: source.adapterVersion,
    cursorKind: source.cursorKind,
    reconciliationMode: source.reconciliationMode,
    maxReconciliationWindowSeconds: source.maxReconciliationWindowSeconds,
    freshnessBudgetSeconds: source.freshnessBudgetSeconds,
    ownerKey: source.ownerKey,
    alertRouteKey: source.alertRouteKey,
  };
  if (
    JSON.stringify(derived) !==
    JSON.stringify(COMPANY_GMAIL_SOURCE_REGISTRATION_INPUT)
  ) {
    fail('invalid_input', 'inbound Gmail source contract drifted');
  }
  return COMPANY_GMAIL_SOURCE_REGISTRATION_INPUT;
}

function watermarkRecordInput(
  event: CompanyGmailSourceBootstrapPlan['event'],
): Record<string, unknown> {
  return {
    definitionId: event.definitionId,
    eventKey: event.eventKey,
    eventType: event.eventType,
    expectedVersion: event.expectedVersion,
    previousCursor: event.previousCursor,
    nextCursor: event.nextCursor,
    observedFrom: event.observedFrom,
    observedThrough: event.observedThrough,
    evidenceSha256: event.evidenceSha256,
    observedCount: event.observedCount,
    acceptedCount: event.acceptedCount,
    rejectedCount: event.rejectedCount,
    gapReason: event.gapReason,
    resolvesEventId: event.resolvesEventId,
  };
}

function validateWriteResults(
  plan: CompanyGmailSourceBootstrapPlan,
  registration: CompanyTriggerSourceRegistrationResult,
  watermark: CompanyTriggerWatermarkRecordResult,
): void {
  if (
    registration.source.definitionId !== plan.source.definitionId ||
    registration.source.sourceFingerprint !== plan.source.sourceFingerprint
  ) {
    fail('storage_unavailable', 'registered Gmail source result drifted');
  }
  if (
    watermark.event.eventFingerprint !== plan.event.eventFingerprint ||
    watermark.state.definitionId !== plan.source.definitionId ||
    watermark.state.version !== 1 ||
    watermark.state.status !== 'current' ||
    watermark.state.cursorValue !== plan.event.nextCursor ||
    watermark.state.cursorObservedAt !== plan.event.observedThrough ||
    watermark.state.openGapEventId !== null ||
    watermark.state.lastEventId !== watermark.eventId
  ) {
    fail('storage_unavailable', 'bootstrapped Gmail watermark result drifted');
  }
}

export function buildCompanyGmailSourceBootstrapPlan(input: {
  historyId: string;
  observedAt: string;
}): CompanyGmailSourceBootstrapPlan {
  const historyId = normalizeHistoryId(input.historyId, 'historyId');
  const observedAt = normalizeTimestamp(input.observedAt, 'observedAt');
  const source = createCompanyGmailInboundSource(COMPANY_GMAIL_SOURCE_OPTIONS);
  registrationInput(source);
  const historyIdSha256 = deriveCompanyGmailHistoryIdSha256(historyId);
  const evidenceSha256 = hash([
    'company-gmail-source-bootstrap-evidence:v1',
    source.definitionId,
    source.sourceFingerprint,
    historyId,
    observedAt,
    'sqlite:router_state:gmail_history_id',
  ]);
  const eventKey = `gmail:bootstrap:${hash([
    'company-gmail-source-bootstrap-key:v1',
    source.definitionId,
    historyId,
    observedAt,
  ])}`;
  const event = normalizeCompanyTriggerWatermarkEvent(source.cursorKind, {
    definitionId: source.definitionId,
    eventKey,
    eventType: 'bootstrap',
    expectedVersion: 0,
    previousCursor: null,
    nextCursor: historyId,
    observedFrom: observedAt,
    observedThrough: observedAt,
    evidenceSha256,
    observedCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    gapReason: null,
    resolvesEventId: null,
  });
  return { source, event, historyIdSha256 };
}

function report(
  mode: CompanyGmailSourceBootstrapMode,
  plan: CompanyGmailSourceBootstrapPlan,
  cursorStable: boolean,
  registration: CompanyTriggerSourceRegistrationResult | null,
  watermark: CompanyTriggerWatermarkRecordResult | null,
): CompanyGmailSourceBootstrapReport {
  return {
    contractVersion: COMPANY_GMAIL_SOURCE_BOOTSTRAP_CONTRACT_VERSION,
    taskId: COMPANY_GMAIL_SOURCE_BOOTSTRAP_TASK_ID,
    mode,
    source: {
      definitionId: plan.source.definitionId,
      sourceFingerprint: plan.source.sourceFingerprint,
      sourceKey: 'mailbox:primary:inbound-v1',
      adapterKey: 'gmail_inbound_full_snapshot',
      adapterVersion: '1.0.0',
      actionAuthority: 'none',
    },
    bootstrap: {
      eventKey: plan.event.eventKey,
      eventFingerprint: plan.event.eventFingerprint,
      observedAt: plan.event.observedThrough,
      observedCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      historyIdSha256: plan.historyIdSha256,
      actionAuthority: 'none',
    },
    sqlite: { queryOnly: true, cursorStable, written: false },
    postgres: {
      transactionAttempted: registration !== null,
      sourceApplied: registration?.applied ?? null,
      sourceDuplicate: registration?.duplicate ?? null,
      bootstrapApplied: watermark?.applied ?? null,
      bootstrapDuplicate: watermark?.duplicate ?? null,
      stateVersion: watermark?.state.version ?? null,
      stateStatus: watermark ? 'current' : null,
    },
    safety: {
      gmailQueried: false,
      daemonImported: false,
      shadowRowsWritten: false,
      cursorAuthorityChanged: false,
      actionAuthority: 'none',
    },
  };
}

export async function runCompanyGmailSourceBootstrap(
  input: CompanyGmailSourceBootstrapInput,
  deps: CompanyGmailSourceBootstrapDependencies,
): Promise<CompanyGmailSourceBootstrapReport> {
  if (input.mode !== 'dry_run' && input.mode !== 'apply') {
    fail('invalid_input', 'bootstrap mode is invalid');
  }
  const expectedHistoryId = normalizeHistoryId(
    input.expectedHistoryId,
    'expectedHistoryId',
  );
  const observedAt = normalizeTimestamp(input.observedAt, 'observedAt');
  requireCurrentObservation(observedAt, deps.now());
  readExactCursor(deps, expectedHistoryId);
  const plan = buildCompanyGmailSourceBootstrapPlan({
    historyId: expectedHistoryId,
    observedAt,
  });

  if (input.mode === 'dry_run') {
    readExactCursor(deps, expectedHistoryId);
    return report(input.mode, plan, true, null, null);
  }

  const result = await deps.withTransaction(async (client) => {
    readExactCursor(deps, expectedHistoryId);
    const registration = await deps.registerSource(
      client,
      registrationInput(plan.source),
    );
    const watermark = await deps.recordWatermark(
      client,
      watermarkRecordInput(plan.event),
    );
    validateWriteResults(plan, registration, watermark);
    readExactCursor(deps, expectedHistoryId);
    return { registration, watermark };
  });
  let cursorStable = false;
  try {
    cursorStable =
      readExactCursor(deps, expectedHistoryId) === expectedHistoryId;
  } catch (error) {
    if (
      !(
        error instanceof CompanyGmailSourceBootstrapError &&
        error.code === 'cursor_drift'
      )
    ) {
      throw error;
    }
  }
  return report(
    input.mode,
    plan,
    cursorStable,
    result.registration,
    result.watermark,
  );
}
