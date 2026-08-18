import { describe, expect, it, vi } from 'vitest';

import type { CompanyTriggerClient } from './company-trigger.js';
import {
  buildCompanyGmailSourceBootstrapPlan,
  COMPANY_GMAIL_SOURCE_BOOTSTRAP_CONFIRMATION,
  CompanyGmailSourceBootstrapError,
  deriveCompanyGmailHistoryIdSha256,
  runCompanyGmailSourceBootstrap,
  type CompanyGmailSourceBootstrapDependencies,
} from './company-gmail-source-bootstrap.js';

const HISTORY_ID = '123456789';
const OBSERVED_AT = '2026-08-18T05:00:00.000Z';
const NOW = '2026-08-18T05:01:00.000Z';

const client = { query: vi.fn() } as unknown as CompanyTriggerClient;

function deps(
  cursors: string[] = [HISTORY_ID, HISTORY_ID, HISTORY_ID, HISTORY_ID],
): CompanyGmailSourceBootstrapDependencies {
  let index = 0;
  return {
    readHistoryId: vi.fn(() => cursors[Math.min(index++, cursors.length - 1)]),
    now: () => NOW,
    withTransaction: vi.fn(async (fn) => fn(client)),
    registerSource: vi.fn(async () => ({
      source: buildCompanyGmailSourceBootstrapPlan({
        historyId: HISTORY_ID,
        observedAt: OBSERVED_AT,
      }).source,
      applied: true,
      duplicate: false,
    })),
    recordWatermark: vi.fn(async () => ({
      event: buildCompanyGmailSourceBootstrapPlan({
        historyId: HISTORY_ID,
        observedAt: OBSERVED_AT,
      }).event,
      eventId: '1',
      state: {
        definitionId: buildCompanyGmailSourceBootstrapPlan({
          historyId: HISTORY_ID,
          observedAt: OBSERVED_AT,
        }).source.definitionId,
        version: 1,
        status: 'current' as const,
        cursorValue: HISTORY_ID,
        cursorObservedAt: OBSERVED_AT,
        openGapEventId: null,
        lastEventId: '1',
      },
      applied: true,
      duplicate: false,
    })),
  };
}

async function expectCode(
  promise: Promise<unknown>,
  code: CompanyGmailSourceBootstrapError['code'],
): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('Company Gmail source bootstrap', () => {
  it('derives the exact immutable source and content-free bootstrap event', () => {
    const plan = buildCompanyGmailSourceBootstrapPlan({
      historyId: HISTORY_ID,
      observedAt: OBSERVED_AT,
    });
    expect(plan.source).toMatchObject({
      sourceKey: 'mailbox:primary:inbound-v1',
      adapterKey: 'gmail_inbound_full_snapshot',
      adapterVersion: '1.0.0',
      cursorKind: 'uint',
      reconciliationMode: 'full_snapshot',
      ownerKey: 'core:gmail',
      alertRouteKey: 'group:chief',
      actionAuthority: 'none',
    });
    expect(plan.event).toMatchObject({
      eventType: 'bootstrap',
      expectedVersion: 0,
      previousCursor: null,
      nextCursor: HISTORY_ID,
      observedFrom: OBSERVED_AT,
      observedThrough: OBSERVED_AT,
      observedCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      actionAuthority: 'none',
    });
    expect(plan.event.eventKey).toMatch(/^gmail:bootstrap:[0-9a-f]{64}$/);
    expect(plan.historyIdSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(deriveCompanyGmailHistoryIdSha256(HISTORY_ID)).toBe(
      plan.historyIdSha256,
    );
  });

  it('dry-runs with two stable SQLite reads and no PostgreSQL transaction', async () => {
    const dependencies = deps([HISTORY_ID, HISTORY_ID]);
    const report = await runCompanyGmailSourceBootstrap(
      {
        mode: 'dry_run',
        expectedHistoryId: HISTORY_ID,
        observedAt: OBSERVED_AT,
      },
      dependencies,
    );
    expect(report).toMatchObject({
      mode: 'dry_run',
      sqlite: { queryOnly: true, cursorStable: true, written: false },
      postgres: { transactionAttempted: false },
      safety: {
        gmailQueried: false,
        shadowRowsWritten: false,
        cursorAuthorityChanged: false,
        actionAuthority: 'none',
      },
    });
    expect(dependencies.readHistoryId).toHaveBeenCalledTimes(2);
    expect(dependencies.withTransaction).not.toHaveBeenCalled();
  });

  it('atomically registers and bootstraps through one shared client', async () => {
    const dependencies = deps();
    const report = await runCompanyGmailSourceBootstrap(
      {
        mode: 'apply',
        expectedHistoryId: HISTORY_ID,
        observedAt: OBSERVED_AT,
      },
      dependencies,
    );
    expect(dependencies.withTransaction).toHaveBeenCalledTimes(1);
    expect(dependencies.registerSource).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        sourceKey: 'mailbox:primary:inbound-v1',
        adapterVersion: '1.0.0',
        maxReconciliationWindowSeconds: 691200,
        freshnessBudgetSeconds: 1200,
        ownerKey: 'core:gmail',
        alertRouteKey: 'group:chief',
      }),
    );
    expect(dependencies.recordWatermark).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ eventType: 'bootstrap' }),
    );
    const watermarkInput = vi.mocked(dependencies.recordWatermark).mock
      .calls[0]?.[1] as Record<string, unknown>;
    expect(watermarkInput).not.toHaveProperty('eventFingerprint');
    expect(watermarkInput).not.toHaveProperty('actionAuthority');
    expect(report.postgres).toEqual({
      transactionAttempted: true,
      sourceApplied: true,
      sourceDuplicate: false,
      bootstrapApplied: true,
      bootstrapDuplicate: false,
      stateVersion: 1,
      stateStatus: 'current',
    });
    expect(report.sqlite.cursorStable).toBe(true);
  });

  it('reports exact source and event replay without advancing again', async () => {
    const dependencies = deps();
    dependencies.registerSource = vi.fn(async () => ({
      source: buildCompanyGmailSourceBootstrapPlan({
        historyId: HISTORY_ID,
        observedAt: OBSERVED_AT,
      }).source,
      applied: false,
      duplicate: true,
    }));
    dependencies.recordWatermark = vi.fn(async () => ({
      event: buildCompanyGmailSourceBootstrapPlan({
        historyId: HISTORY_ID,
        observedAt: OBSERVED_AT,
      }).event,
      eventId: '1',
      state: {
        definitionId: buildCompanyGmailSourceBootstrapPlan({
          historyId: HISTORY_ID,
          observedAt: OBSERVED_AT,
        }).source.definitionId,
        version: 1,
        status: 'current' as const,
        cursorValue: HISTORY_ID,
        cursorObservedAt: OBSERVED_AT,
        openGapEventId: null,
        lastEventId: '1',
      },
      applied: false,
      duplicate: true,
    }));
    const report = await runCompanyGmailSourceBootstrap(
      {
        mode: 'apply',
        expectedHistoryId: HISTORY_ID,
        observedAt: OBSERVED_AT,
      },
      dependencies,
    );
    expect(report.postgres).toMatchObject({
      sourceApplied: false,
      sourceDuplicate: true,
      bootstrapApplied: false,
      bootstrapDuplicate: true,
      stateVersion: 1,
    });
  });

  it('rolls back a storage result that does not prove the exact version-one state', async () => {
    const dependencies = deps();
    dependencies.recordWatermark = vi.fn(async (_client, input) => ({
      event: input as ReturnType<
        typeof buildCompanyGmailSourceBootstrapPlan
      >['event'],
      eventId: '1',
      state: {
        definitionId: buildCompanyGmailSourceBootstrapPlan({
          historyId: HISTORY_ID,
          observedAt: OBSERVED_AT,
        }).source.definitionId,
        version: 2,
        status: 'current' as const,
        cursorValue: HISTORY_ID,
        cursorObservedAt: OBSERVED_AT,
        openGapEventId: null,
        lastEventId: '1',
      },
      applied: true,
      duplicate: false,
    }));
    await expectCode(
      runCompanyGmailSourceBootstrap(
        {
          mode: 'apply',
          expectedHistoryId: HISTORY_ID,
          observedAt: OBSERVED_AT,
        },
        dependencies,
      ),
      'storage_unavailable',
    );
    expect(dependencies.withTransaction).toHaveBeenCalledTimes(1);
  });

  it('refuses cursor drift before any transaction', async () => {
    const dependencies = deps(['987654321']);
    await expectCode(
      runCompanyGmailSourceBootstrap(
        {
          mode: 'apply',
          expectedHistoryId: HISTORY_ID,
          observedAt: OBSERVED_AT,
        },
        dependencies,
      ),
      'cursor_drift',
    );
    expect(dependencies.withTransaction).not.toHaveBeenCalled();
  });

  it('refuses in-transaction drift so the PostgreSQL transaction rolls back', async () => {
    const dependencies = deps([HISTORY_ID, HISTORY_ID, '987654321']);
    await expectCode(
      runCompanyGmailSourceBootstrap(
        {
          mode: 'apply',
          expectedHistoryId: HISTORY_ID,
          observedAt: OBSERVED_AT,
        },
        dependencies,
      ),
      'cursor_drift',
    );
    expect(dependencies.withTransaction).toHaveBeenCalledTimes(1);
  });

  it('reports a post-commit cursor change without hiding the applied write', async () => {
    const dependencies = deps([
      HISTORY_ID,
      HISTORY_ID,
      HISTORY_ID,
      '987654321',
    ]);
    const report = await runCompanyGmailSourceBootstrap(
      {
        mode: 'apply',
        expectedHistoryId: HISTORY_ID,
        observedAt: OBSERVED_AT,
      },
      dependencies,
    );
    expect(report.sqlite.cursorStable).toBe(false);
    expect(report.postgres).toMatchObject({
      sourceApplied: true,
      bootstrapApplied: true,
      stateVersion: 1,
    });
  });

  it('classifies an unreadable durable cursor as storage unavailable', async () => {
    const dependencies = deps();
    dependencies.readHistoryId = vi.fn(() => {
      throw new Error('synthetic read failure');
    });
    await expectCode(
      runCompanyGmailSourceBootstrap(
        {
          mode: 'dry_run',
          expectedHistoryId: HISTORY_ID,
          observedAt: OBSERVED_AT,
        },
        dependencies,
      ),
      'storage_unavailable',
    );
    expect(dependencies.withTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ['zero cursor', '0', OBSERVED_AT, 'invalid_input'],
    ['leading-zero cursor', '0123', OBSERVED_AT, 'invalid_input'],
    [
      'noncanonical timestamp',
      HISTORY_ID,
      '2026-08-18T05:00:00Z',
      'invalid_input',
    ],
    [
      'stale observation',
      HISTORY_ID,
      '2026-08-18T04:00:00.000Z',
      'stale_observation',
    ],
  ])('refuses %s', async (_name, historyId, observedAt, code) => {
    await expectCode(
      runCompanyGmailSourceBootstrap(
        { mode: 'dry_run', expectedHistoryId: historyId, observedAt },
        deps(),
      ),
      code as CompanyGmailSourceBootstrapError['code'],
    );
  });

  it('keeps the apply confirmation value stable for the production gate', () => {
    expect(COMPANY_GMAIL_SOURCE_BOOTSTRAP_CONFIRMATION).toBe(
      'NC-20260818-001-GMAIL-SOURCE-BOOTSTRAP',
    );
  });
});
