import { describe, expect, it, vi } from 'vitest';

import {
  deriveCompanyGmailRuntimeCursorSha256,
  runCompanyGmailRuntimeAlignment,
} from './company-gmail-runtime-alignment.js';
import { buildCompanyGmailRuntimeAdvance } from './company-gmail-runtime-watermark.js';
import { createCompanyGmailInboundSource } from './company-gmail-reconciliation.js';
import { COMPANY_GMAIL_SOURCE_OPTIONS } from './company-gmail-source-bootstrap.js';
import type { CompanyTriggerWatermarkState } from './company-trigger-source.js';

const source = createCompanyGmailInboundSource(COMPANY_GMAIL_SOURCE_OPTIONS);
const OBSERVED = '2026-08-18T12:00:00.000Z';
const THROUGH = '2026-08-18T12:01:00.000Z';

function watermarkState(): CompanyTriggerWatermarkState {
  return {
    definitionId: source.definitionId,
    version: 1,
    status: 'current',
    cursorValue: '100',
    cursorObservedAt: OBSERVED,
    openGapEventId: null,
    lastEventId: '1',
  };
}

function dependencies() {
  const state = watermarkState();
  const readSqliteCursor = vi.fn().mockReturnValue('200');
  const readWatermarkState = vi.fn().mockResolvedValue(state);
  const range = {
    startHistoryId: '100',
    targetHistoryId: '200',
    terminalHeadHistoryId: '250',
    pagesRead: 1,
    candidates: [
      {
        messageId: 'm1',
        disposition: 'accepted' as const,
        reasonKey: 'inbound_message_persisted',
        evidenceSha256: 'a'.repeat(64),
      },
    ],
  };
  const recordAdvance = vi.fn().mockImplementation(async (_client, input) => {
    const event = buildCompanyGmailRuntimeAdvance({ state, ...input });
    return {
      event,
      eventId: '2',
      state: {
        ...state,
        version: 2,
        cursorValue: '200',
        cursorObservedAt: THROUGH,
        lastEventId: '2',
      },
      applied: true,
      duplicate: false,
    };
  });
  return {
    readSqliteCursor,
    readWatermarkState,
    listClosedRange: vi.fn().mockResolvedValue(range),
    withTransaction: vi.fn(async (fn) => fn({ query: vi.fn() } as any)),
    recordAdvance,
    now: vi.fn().mockReturnValue(THROUGH),
  };
}

function input(mode: 'dry_run' | 'apply') {
  return {
    mode,
    expectedSqliteCursorSha256: deriveCompanyGmailRuntimeCursorSha256(
      'sqlite',
      '200',
    ),
    expectedWatermarkCursorSha256: deriveCompanyGmailRuntimeCursorSha256(
      'watermark',
      '100',
    ),
    observedAt: THROUGH,
  } as const;
}

describe('Company Gmail runtime alignment', () => {
  it('dry-runs a closed receipt-backed range without a PostgreSQL write', async () => {
    const deps = dependencies();
    const report = await runCompanyGmailRuntimeAlignment(
      input('dry_run'),
      deps,
    );
    expect(report).toMatchObject({
      mode: 'dry_run',
      range: {
        pagesRead: 1,
        candidateCount: 1,
        acceptedCount: 1,
        rejectedCount: 0,
      },
      postgres: { transactionAttempted: false, stateVersion: 1 },
      sqlite: { queryOnly: true, cursorStable: true, written: false },
      safety: { contentRead: false, actionAuthority: 'none' },
    });
    expect(deps.recordAdvance).not.toHaveBeenCalled();
  });

  it('rechecks both authorities inside one transaction before recording', async () => {
    const deps = dependencies();
    const report = await runCompanyGmailRuntimeAlignment(input('apply'), deps);
    expect(report.postgres).toMatchObject({
      transactionAttempted: true,
      advanceApplied: true,
      advanceDuplicate: false,
      stateVersion: 2,
    });
    expect(deps.readWatermarkState).toHaveBeenLastCalledWith(
      expect.anything(),
      true,
    );
    expect(deps.recordAdvance).toHaveBeenCalledTimes(1);
  });

  it('refuses SQLite drift before the PostgreSQL advance', async () => {
    const deps = dependencies();
    deps.readSqliteCursor
      .mockReturnValueOnce('200')
      .mockReturnValueOnce('200')
      .mockReturnValueOnce('200')
      .mockReturnValueOnce('201');
    await expect(
      runCompanyGmailRuntimeAlignment(input('apply'), deps),
    ).rejects.toMatchObject({ code: 'cursor_drift' });
    expect(deps.recordAdvance).not.toHaveBeenCalled();
  });
});
