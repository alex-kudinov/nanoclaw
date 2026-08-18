/** One-shot receipt-backed alignment of an existing SQLite-ahead Gmail cursor. */

import { createHash } from 'node:crypto';

import type { CompanyGmailRuntimeAlignmentRange } from './company-gmail-runtime-alignment-source.js';
import type { CompanyTriggerClient } from './company-trigger.js';
import {
  buildCompanyGmailRuntimeAdvance,
  readCompanyGmailRuntimeWatermarkStateWithClient,
  recordCompanyGmailRuntimeAdvanceWithClient,
} from './company-gmail-runtime-watermark.js';
import type {
  CompanyTriggerWatermarkRecordResult,
  CompanyTriggerWatermarkState,
} from './company-trigger-source.js';

export const COMPANY_GMAIL_RUNTIME_ALIGNMENT_CONTRACT_VERSION = 1 as const;
export const COMPANY_GMAIL_RUNTIME_ALIGNMENT_TASK_ID =
  'NC-20260818-003' as const;
export const COMPANY_GMAIL_RUNTIME_ALIGNMENT_CONFIRMATION =
  'NC-20260818-003-GMAIL-RUNTIME-ALIGNMENT' as const;
export const COMPANY_GMAIL_RUNTIME_ALIGNMENT_MAX_AGE_MS = 10 * 60 * 1000;

const UINT_PATTERN = /^(0|[1-9][0-9]*)$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type CompanyGmailRuntimeAlignmentMode = 'dry_run' | 'apply';

export type CompanyGmailRuntimeAlignmentErrorCode =
  | 'invalid_input'
  | 'stale_observation'
  | 'cursor_drift'
  | 'state_drift'
  | 'storage_unavailable';

export class CompanyGmailRuntimeAlignmentError extends Error {
  constructor(
    public readonly code: CompanyGmailRuntimeAlignmentErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CompanyGmailRuntimeAlignmentError';
  }
}

export interface CompanyGmailRuntimeAlignmentInput {
  mode: CompanyGmailRuntimeAlignmentMode;
  expectedSqliteCursorSha256: string;
  expectedWatermarkCursorSha256: string;
  observedAt: string;
}

export interface CompanyGmailRuntimeAlignmentDependencies {
  readSqliteCursor(): string;
  readWatermarkState(
    client: CompanyTriggerClient,
    forUpdate?: boolean,
  ): Promise<CompanyTriggerWatermarkState>;
  listClosedRange(
    startHistoryId: string,
    targetHistoryId: string,
  ): Promise<CompanyGmailRuntimeAlignmentRange>;
  withTransaction<T>(
    fn: (client: CompanyTriggerClient) => Promise<T>,
  ): Promise<T>;
  recordAdvance(
    client: CompanyTriggerClient,
    input: {
      previousCursor: string;
      nextCursor: string;
      observedThrough: string;
      candidates: CompanyGmailRuntimeAlignmentRange['candidates'];
    },
  ): Promise<CompanyTriggerWatermarkRecordResult>;
  now(): string;
}

export interface CompanyGmailRuntimeAlignmentReport {
  contractVersion: typeof COMPANY_GMAIL_RUNTIME_ALIGNMENT_CONTRACT_VERSION;
  taskId: typeof COMPANY_GMAIL_RUNTIME_ALIGNMENT_TASK_ID;
  mode: CompanyGmailRuntimeAlignmentMode;
  range: {
    sqliteCursorSha256: string;
    watermarkCursorSha256: string;
    terminalHeadSha256: string;
    pagesRead: number;
    candidateCount: number;
    acceptedCount: number;
    rejectedCount: number;
    evidenceSha256: string;
  };
  postgres: {
    transactionAttempted: boolean;
    advanceApplied: boolean | null;
    advanceDuplicate: boolean | null;
    stateVersion: number;
    stateStatus: 'current';
    eventFingerprint: string;
  };
  sqlite: {
    queryOnly: true;
    cursorStable: boolean;
    written: false;
  };
  safety: {
    contentRead: false;
    messageDelivered: false;
    workCreated: false;
    actionAuthority: 'none';
  };
}

function fail(
  code: CompanyGmailRuntimeAlignmentErrorCode,
  message: string,
  cause?: unknown,
): never {
  throw new CompanyGmailRuntimeAlignmentError(
    code,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function hash(parts: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function historyId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UINT_PATTERN.test(value)) {
    fail('invalid_input', `${field} is invalid`);
  }
  return BigInt(value).toString();
}

function timestamp(value: unknown, field: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    fail('invalid_input', `${field} is invalid`);
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value)
    fail('invalid_input', `${field} must be canonical UTC`);
  return normalized;
}

function compare(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function deriveCompanyGmailRuntimeCursorSha256(
  kind: 'sqlite' | 'watermark' | 'terminal_head',
  value: unknown,
): string {
  return hash([
    'company-gmail-runtime-alignment-cursor:v1',
    kind,
    historyId(value, `${kind} cursor`),
  ]);
}

function exactSha256(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    fail('invalid_input', `${field} is invalid`);
  }
  return value;
}

function exactSqliteCursor(
  deps: Pick<CompanyGmailRuntimeAlignmentDependencies, 'readSqliteCursor'>,
  expected: string,
): string {
  let cursor;
  try {
    cursor = historyId(deps.readSqliteCursor(), 'SQLite cursor');
  } catch (error) {
    if (error instanceof CompanyGmailRuntimeAlignmentError) throw error;
    fail('storage_unavailable', 'SQLite Gmail cursor read failed', error);
  }
  if (cursor !== expected) fail('cursor_drift', 'SQLite Gmail cursor changed');
  return cursor;
}

function exactCurrentState(
  state: CompanyTriggerWatermarkState,
  expectedCursor?: string,
  expectedVersion?: number,
): CompanyTriggerWatermarkState {
  if (
    state.status !== 'current' ||
    state.cursorValue === null ||
    state.cursorObservedAt === null ||
    state.openGapEventId !== null ||
    state.lastEventId === null ||
    !Number.isSafeInteger(state.version) ||
    state.version < 1
  ) {
    fail('state_drift', 'Company OS Gmail watermark is not exactly current');
  }
  const cursor = historyId(state.cursorValue, 'watermark cursor');
  if (
    (expectedCursor !== undefined && cursor !== expectedCursor) ||
    (expectedVersion !== undefined && state.version !== expectedVersion)
  ) {
    fail('state_drift', 'Company OS Gmail watermark changed');
  }
  return { ...state, cursorValue: cursor };
}

export async function runCompanyGmailRuntimeAlignment(
  input: CompanyGmailRuntimeAlignmentInput,
  deps: CompanyGmailRuntimeAlignmentDependencies,
): Promise<CompanyGmailRuntimeAlignmentReport> {
  if (input.mode !== 'dry_run' && input.mode !== 'apply') {
    fail('invalid_input', 'alignment mode is invalid');
  }
  const expectedSqliteSha256 = exactSha256(
    input.expectedSqliteCursorSha256,
    'expectedSqliteCursorSha256',
  );
  const expectedWatermarkSha256 = exactSha256(
    input.expectedWatermarkCursorSha256,
    'expectedWatermarkCursorSha256',
  );
  const observedAt = timestamp(input.observedAt, 'observedAt');
  const now = timestamp(deps.now(), 'now');
  if (
    Date.parse(observedAt) > Date.parse(now) ||
    Date.parse(now) - Date.parse(observedAt) >
      COMPANY_GMAIL_RUNTIME_ALIGNMENT_MAX_AGE_MS
  ) {
    fail('stale_observation', 'alignment observation is outside the live gate');
  }
  const targetCursor = historyId(deps.readSqliteCursor(), 'SQLite cursor');
  if (
    deriveCompanyGmailRuntimeCursorSha256('sqlite', targetCursor) !==
    expectedSqliteSha256
  ) {
    fail('cursor_drift', 'SQLite Gmail cursor fingerprint changed');
  }
  const initialState = exactCurrentState(
    await deps.withTransaction((client) =>
      deps.readWatermarkState(client, false),
    ),
  );
  const startCursor = initialState.cursorValue!;
  if (
    deriveCompanyGmailRuntimeCursorSha256('watermark', startCursor) !==
    expectedWatermarkSha256
  ) {
    fail('state_drift', 'Company OS Gmail cursor fingerprint changed');
  }
  if (compare(targetCursor, startCursor) <= 0) {
    fail('cursor_drift', 'SQLite is not ahead of the Company OS watermark');
  }
  exactSqliteCursor(deps, targetCursor);
  const range = await deps.listClosedRange(startCursor, targetCursor);
  if (
    range.startHistoryId !== startCursor ||
    range.targetHistoryId !== targetCursor ||
    !Number.isSafeInteger(range.pagesRead) ||
    range.pagesRead < 1
  ) {
    fail('state_drift', 'Gmail alignment range drifted');
  }
  exactSqliteCursor(deps, targetCursor);
  const observedThrough = timestamp(deps.now(), 'observedThrough');
  const event = buildCompanyGmailRuntimeAdvance({
    state: initialState,
    previousCursor: startCursor,
    nextCursor: targetCursor,
    observedThrough,
    candidates: range.candidates,
  });
  let recorded: CompanyTriggerWatermarkRecordResult | null = null;
  if (input.mode === 'apply') {
    recorded = await deps.withTransaction(async (client) => {
      exactSqliteCursor(deps, targetCursor);
      exactCurrentState(
        await deps.readWatermarkState(client, true),
        startCursor,
        initialState.version,
      );
      const result = await deps.recordAdvance(client, {
        previousCursor: startCursor,
        nextCursor: targetCursor,
        observedThrough,
        candidates: range.candidates,
      });
      exactSqliteCursor(deps, targetCursor);
      return result;
    });
    exactSqliteCursor(deps, targetCursor);
    if (
      recorded.event.eventFingerprint !== event.eventFingerprint ||
      recorded.state.status !== 'current' ||
      recorded.state.cursorValue !== targetCursor ||
      recorded.state.version !== initialState.version + 1
    ) {
      fail('storage_unavailable', 'recorded Gmail alignment result drifted');
    }
  }
  const acceptedCount = range.candidates.filter(
    (candidate) => candidate.disposition === 'accepted',
  ).length;
  return {
    contractVersion: COMPANY_GMAIL_RUNTIME_ALIGNMENT_CONTRACT_VERSION,
    taskId: COMPANY_GMAIL_RUNTIME_ALIGNMENT_TASK_ID,
    mode: input.mode,
    range: {
      sqliteCursorSha256: expectedSqliteSha256,
      watermarkCursorSha256: expectedWatermarkSha256,
      terminalHeadSha256: deriveCompanyGmailRuntimeCursorSha256(
        'terminal_head',
        range.terminalHeadHistoryId,
      ),
      pagesRead: range.pagesRead,
      candidateCount: range.candidates.length,
      acceptedCount,
      rejectedCount: range.candidates.length - acceptedCount,
      evidenceSha256: event.evidenceSha256,
    },
    postgres: {
      transactionAttempted: input.mode === 'apply',
      advanceApplied: recorded?.applied ?? null,
      advanceDuplicate: recorded?.duplicate ?? null,
      stateVersion: recorded?.state.version ?? initialState.version,
      stateStatus: 'current',
      eventFingerprint: event.eventFingerprint,
    },
    sqlite: { queryOnly: true, cursorStable: true, written: false },
    safety: {
      contentRead: false,
      messageDelivered: false,
      workCreated: false,
      actionAuthority: 'none',
    },
  };
}

export const companyGmailRuntimeAlignmentDependencies = {
  readWatermarkState: readCompanyGmailRuntimeWatermarkStateWithClient,
  recordAdvance: recordCompanyGmailRuntimeAdvanceWithClient,
};
