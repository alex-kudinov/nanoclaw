import { describe, expect, it } from 'vitest';

import {
  buildCompanyGmailRuntimeAdvance,
  classifyCompanyGmailRuntimePreparation,
  CompanyGmailRuntimeWatermarkError,
  runtimeCandidate,
} from './company-gmail-runtime-watermark.js';
import { createCompanyGmailInboundSource } from './company-gmail-reconciliation.js';
import { COMPANY_GMAIL_SOURCE_OPTIONS } from './company-gmail-source-bootstrap.js';
import type { CompanyTriggerWatermarkState } from './company-trigger-source.js';

const source = createCompanyGmailInboundSource(COMPANY_GMAIL_SOURCE_OPTIONS);
const OBSERVED = '2026-08-18T12:00:00.000Z';

function state(
  overrides: Partial<CompanyTriggerWatermarkState> = {},
): CompanyTriggerWatermarkState {
  return {
    definitionId: source.definitionId,
    version: 4,
    status: 'current',
    cursorValue: '100',
    cursorObservedAt: OBSERVED,
    openGapEventId: null,
    lastEventId: '40',
    ...overrides,
  };
}

function authority(options?: {
  state?: CompanyTriggerWatermarkState;
  eventType?: string;
  expectedVersion?: number;
  previousCursor?: string | null;
  nextCursor?: string;
  gapReason?: string | null;
}) {
  const durableState = options?.state ?? state();
  return {
    state: durableState,
    lastEvent: {
      id: durableState.lastEventId!,
      eventType: options?.eventType ?? 'advance',
      expectedVersion: options?.expectedVersion ?? durableState.version - 1,
      previousCursor: options?.previousCursor ?? '90',
      nextCursor: options?.nextCursor ?? durableState.cursorValue!,
      gapReason: options?.gapReason ?? null,
    },
  };
}

describe('Company Gmail runtime watermark', () => {
  it('proceeds only when SQLite and the current watermark are exact', () => {
    expect(
      classifyCompanyGmailRuntimePreparation({
        sqliteCursor: '100',
        authority: authority(),
      }),
    ).toEqual({ decision: 'proceed', cursor: '100', stateVersion: 4 });
  });

  it('catches SQLite up only across the exact last durable advance', () => {
    const durableState = state({ version: 5, cursorValue: '120' });
    expect(
      classifyCompanyGmailRuntimePreparation({
        sqliteCursor: '100',
        authority: authority({
          state: durableState,
          expectedVersion: 4,
          previousCursor: '100',
          nextCursor: '120',
        }),
      }),
    ).toEqual({
      decision: 'catch_up_sqlite',
      cursor: '120',
      stateVersion: 5,
      eventId: '40',
    });
  });

  it('refuses unexplained cursor divergence', () => {
    expect(() =>
      classifyCompanyGmailRuntimePreparation({
        sqliteCursor: '110',
        authority: authority(),
      }),
    ).toThrowError(
      expect.objectContaining<Partial<CompanyGmailRuntimeWatermarkError>>({
        code: 'cursor_drift',
      }),
    );
  });

  it('holds an exact durable history-expired gap', () => {
    const durableState = state({
      version: 5,
      status: 'gap',
      openGapEventId: '40',
    });
    expect(
      classifyCompanyGmailRuntimePreparation({
        sqliteCursor: '100',
        authority: authority({
          state: durableState,
          eventType: 'gap_detected',
          expectedVersion: 4,
          previousCursor: '100',
          nextCursor: '150',
          gapReason: 'history_expired',
        }),
      }),
    ).toEqual({
      decision: 'hold_gap',
      cursor: '100',
      stateVersion: 5,
      gapEventId: '40',
    });
  });

  it('builds a stable content-free advance from sorted closed receipts', () => {
    const input = {
      state: state(),
      previousCursor: '100',
      nextCursor: '200',
      observedThrough: '2026-08-18T12:01:00.000Z',
      candidates: [
        runtimeCandidate('m2', {
          disposition: 'rejected',
          reasonKey: 'own_outbound',
          evidenceSha256: 'b'.repeat(64),
        }),
        runtimeCandidate('m1', {
          disposition: 'accepted',
          reasonKey: 'inbound_message_persisted',
          evidenceSha256: 'a'.repeat(64),
        }),
      ],
    } as const;
    const first = buildCompanyGmailRuntimeAdvance(input);
    const second = buildCompanyGmailRuntimeAdvance({
      ...input,
      candidates: [...input.candidates].reverse(),
    });
    expect(first.eventFingerprint).toBe(second.eventFingerprint);
    expect(first).toMatchObject({
      eventType: 'advance',
      previousCursor: '100',
      nextCursor: '200',
      observedCount: 2,
      acceptedCount: 1,
      rejectedCount: 1,
      actionAuthority: 'none',
    });
  });

  it('rejects unknown candidate accounting', () => {
    expect(() =>
      runtimeCandidate('m1', {
        disposition: 'unknown',
        reasonKey: 'receipt_missing',
        evidenceSha256: 'a'.repeat(64),
      }),
    ).toThrowError(
      expect.objectContaining<Partial<CompanyGmailRuntimeWatermarkError>>({
        code: 'invalid_input',
      }),
    );
  });
});
