import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CompanyWorkExceptionLoopService,
  companyWorkExceptionCaseKey,
  expandCompanyWorkExceptionCases,
  renderCompanyWorkExceptionBrief,
  resolveCompanyWorkExceptionLoopConfig,
  runCompanyWorkExceptionLoop,
  type CompanyWorkExceptionCase,
  type CompanyWorkExceptionLoopConfig,
  type CompanyWorkExceptionLoopDeps,
  type CompanyWorkExceptionStore,
} from './company-work-exception-loop.js';
import {
  COMPANY_WORK_EXCEPTION_KINDS,
  type CompanyWorkExceptionReport,
} from './company-work-report.js';

function report(
  overrides: Partial<CompanyWorkExceptionReport> = {},
): CompanyWorkExceptionReport {
  const byKind = Object.fromEntries(
    COMPANY_WORK_EXCEPTION_KINDS.map((kind) => [kind, 0]),
  ) as CompanyWorkExceptionReport['summary']['byKind'];
  byKind.source_gap = 1;
  byKind.failed = 1;
  return {
    status: 'ok',
    generatedAt: '2026-08-17T02:00:00.000Z',
    staleAfterHours: 24,
    scanned: 1,
    totalAvailable: 1,
    truncated: false,
    summary: {
      completed: 0,
      cancelled: 0,
      healthyOpen: 0,
      exceptionItems: 1,
      critical: 1,
      attention: 0,
      watch: 0,
      byWorkflow: {
        sales_email: 1,
        host_job_run: 0,
        program_facts_drift: 0,
      },
      byKind,
    },
    exceptions: [
      {
        workItemId: '4',
        workflowType: 'sales_email',
        sourceSystem: 'sqlite_email_action',
        sourceKey: 'opaque-action-id',
        partyId: '10',
        pipelineEntryId: '20',
        stage: 'approved',
        disposition: 'failed',
        version: 3,
        deadlineAt: null,
        lastTransitionAt: '2026-08-15T00:00:00.000Z',
        ageMinutes: 3000,
        severity: 'critical',
        reasons: [
          {
            kind: 'source_gap',
            code: 'source_gap:mailman_dispatch_missing',
          },
          {
            kind: 'failed',
            code: 'source_gap:mailman_dispatch_missing',
          },
        ],
      },
    ],
    ...overrides,
  };
}

function activeCase(
  overrides: Partial<CompanyWorkExceptionCase> = {},
): CompanyWorkExceptionCase {
  return {
    id: '11',
    caseKey: 'a'.repeat(64),
    workItemId: '4',
    occurrence: 1,
    workItemVersion: 3,
    reasonKind: 'source_gap',
    reasonCode: 'source_gap:mailman_dispatch_missing',
    severity: 'critical',
    state: 'open',
    openedAt: '2026-08-17T02:00:00.000Z',
    lastSeenAt: '2026-08-17T02:00:00.000Z',
    acknowledgedAt: null,
    acknowledgedByUid: null,
    resolvedAt: null,
    ...overrides,
  };
}

function config(
  overrides: Partial<CompanyWorkExceptionLoopConfig> = {},
): CompanyWorkExceptionLoopConfig {
  return {
    enabled: true,
    active: true,
    operatorUids: ['U1234567'],
    intervalMs: 86_400_000,
    reportLimit: 100,
    staleAfterHours: 24,
    targetFolder: 'chief',
    configurationError: null,
    ...overrides,
  };
}

function store(): CompanyWorkExceptionStore {
  return {
    reconcileCases: vi.fn().mockResolvedValue({
      activeCases: [
        activeCase(),
        activeCase({ id: '12', caseKey: 'b'.repeat(64), reasonKind: 'failed' }),
      ],
      opened: 2,
      reopened: 0,
      resolved: 0,
    }),
    claimBrief: vi.fn().mockResolvedValue({
      id: '7',
      fingerprint: 'c'.repeat(64),
      activeCases: [
        activeCase(),
        activeCase({ id: '12', caseKey: 'b'.repeat(64), reasonKind: 'failed' }),
      ],
    }),
    markBriefPosted: vi.fn().mockResolvedValue(undefined),
    markBriefUncertain: vi.fn().mockResolvedValue(undefined),
    findPostedBrief: vi.fn().mockResolvedValue(null),
    acknowledgeBrief: vi.fn().mockResolvedValue({
      briefId: '7',
      acknowledgedCases: 2,
      noLongerActiveCases: 0,
      duplicate: false,
    }),
    markAcknowledgmentReceipt: vi.fn().mockResolvedValue(undefined),
  };
}

function deps(
  overrides: Partial<CompanyWorkExceptionLoopDeps> = {},
): CompanyWorkExceptionLoopDeps {
  return {
    readReport: vi.fn().mockResolvedValue(report()),
    store: store(),
    resolveTargetJid: vi.fn().mockReturnValue('slack:C_CHIEF'),
    postBrief: vi.fn().mockResolvedValue('1800000000.000001'),
    postThread: vi.fn().mockResolvedValue('1800000000.000002'),
    ...overrides,
  };
}

describe('Company Work exception loop configuration', () => {
  it('defaults off and requires named Slack UIDs when enabled', () => {
    expect(resolveCompanyWorkExceptionLoopConfig({})).toMatchObject({
      enabled: false,
      active: false,
      operatorUids: [],
      configurationError: null,
    });
    expect(
      resolveCompanyWorkExceptionLoopConfig({
        COMPANY_WORK_EXCEPTION_BRIEF_ENABLED: '1',
      }),
    ).toMatchObject({
      enabled: true,
      active: false,
      configurationError: 'operator_uid_required',
    });
    expect(
      resolveCompanyWorkExceptionLoopConfig({
        COMPANY_WORK_EXCEPTION_BRIEF_ENABLED: '1',
        COMPANY_WORK_EXCEPTION_OPERATOR_UIDS: 'U1234567,U7654321',
      }),
    ).toMatchObject({
      active: true,
      operatorUids: ['U1234567', 'U7654321'],
      targetFolder: 'chief',
    });
  });

  it('rejects malformed or duplicate operator identity', () => {
    expect(
      resolveCompanyWorkExceptionLoopConfig({
        COMPANY_WORK_EXCEPTION_BRIEF_ENABLED: '1',
        COMPANY_WORK_EXCEPTION_OPERATOR_UIDS: 'alex',
      }).configurationError,
    ).toBe('invalid_operator_uid');
    expect(
      resolveCompanyWorkExceptionLoopConfig({
        COMPANY_WORK_EXCEPTION_BRIEF_ENABLED: '1',
        COMPANY_WORK_EXCEPTION_OPERATOR_UIDS: 'U1234567,U1234567',
      }).configurationError,
    ).toBe('duplicate_operator_uid');
  });

  it('fails closed instead of silently clamping invalid operating bounds', () => {
    expect(
      resolveCompanyWorkExceptionLoopConfig({
        COMPANY_WORK_EXCEPTION_BRIEF_ENABLED: '1',
        COMPANY_WORK_EXCEPTION_OPERATOR_UIDS: 'U1234567',
        COMPANY_WORK_EXCEPTION_BRIEF_INTERVAL_MS: '1',
      }),
    ).toMatchObject({
      active: false,
      configurationError: 'invalid_interval_ms',
    });
    expect(
      resolveCompanyWorkExceptionLoopConfig({
        COMPANY_WORK_EXCEPTION_BRIEF_ENABLED: '1',
        COMPANY_WORK_EXCEPTION_OPERATOR_UIDS: 'U1234567',
        COMPANY_WORK_EXCEPTION_REPORT_LIMIT: '501',
      }),
    ).toMatchObject({
      active: false,
      configurationError: 'invalid_report_limit',
    });
  });
});

describe('Company Work exception case identity and rendering', () => {
  it('expands every exact reason into a stable opaque case key', () => {
    const expanded = expandCompanyWorkExceptionCases(report());
    expect(expanded).toHaveLength(2);
    expect(expanded.map((item) => item.reasonKind).sort()).toEqual([
      'failed',
      'source_gap',
    ]);
    expect(expanded.every((item) => /^[0-9a-f]{64}$/.test(item.caseKey))).toBe(
      true,
    );
    expect(expanded[0].caseKey).toBe(
      companyWorkExceptionCaseKey({
        workItemId: expanded[0].workItemId,
        workflowType: expanded[0].workflowType,
        reasonKind: expanded[0].reasonKind,
        reasonCode: expanded[0].reasonCode,
      }),
    );
  });

  it('states the non-authority contract in the bounded Slack brief', () => {
    const text = renderCompanyWorkExceptionBrief(report(), '7', 2);
    expect(text).toContain('Company OS exception brief #7');
    expect(text).toContain('React ✅ to acknowledge this exact brief');
    expect(text).toContain('does not resolve, approve, retry, send');
    expect(text).not.toContain('opaque-action-id');
    expect(text.length).toBeLessThan(4000);
  });
});

describe('Company Work exception loop execution', () => {
  let d: CompanyWorkExceptionLoopDeps;

  beforeEach(() => {
    d = deps();
  });

  it('does not write or post when the report is unavailable or truncated', async () => {
    vi.mocked(d.readReport)
      .mockResolvedValueOnce({
        status: 'unavailable',
        generatedAt: '2026-08-17T02:00:00.000Z',
        errorCode: 'ledger_query_failed',
      })
      .mockResolvedValueOnce(report({ truncated: true, totalAvailable: 2 }));

    await expect(
      runCompanyWorkExceptionLoop(d, config()),
    ).resolves.toMatchObject({
      outcome: 'unavailable',
      errorCode: 'ledger_query_failed',
    });
    await expect(
      runCompanyWorkExceptionLoop(d, config()),
    ).resolves.toMatchObject({
      outcome: 'truncated',
      errorCode: 'report_truncated',
    });
    expect(d.store.reconcileCases).not.toHaveBeenCalled();
    expect(d.postBrief).not.toHaveBeenCalled();
  });

  it('refuses an oversized reason set before writing attention state', async () => {
    const oversized = report({
      scanned: 251,
      totalAvailable: 251,
      summary: {
        ...report().summary,
        exceptionItems: 251,
      },
      exceptions: Array.from({ length: 251 }, (_value, index) => ({
        ...report().exceptions[0],
        workItemId: String(index + 1),
      })),
    });
    vi.mocked(d.readReport).mockResolvedValueOnce(oversized);
    await expect(
      runCompanyWorkExceptionLoop(d, config()),
    ).resolves.toMatchObject({
      outcome: 'truncated',
      errorCode: 'exception_case_limit_exceeded',
    });
    expect(d.store.reconcileCases).not.toHaveBeenCalled();
    expect(d.postBrief).not.toHaveBeenCalled();
  });

  it('claims before posting and binds the exact Slack receipt', async () => {
    const result = await runCompanyWorkExceptionLoop(
      d,
      config(),
      new Date('2026-08-17T02:00:00.000Z'),
    );
    expect(result).toMatchObject({
      outcome: 'posted',
      briefId: '7',
      messageTs: '1800000000.000001',
      opened: 2,
    });
    expect(d.store.claimBrief).toHaveBeenCalled();
    expect(d.postBrief).toHaveBeenCalledWith(
      'slack:C_CHIEF',
      expect.stringContaining('brief #7'),
    );
    expect(d.store.markBriefPosted).toHaveBeenCalledWith(
      '7',
      'slack:C_CHIEF',
      '1800000000.000001',
      '2026-08-17T02:00:00.000Z',
    );
  });

  it('does not retry an already claimed daily fingerprint', async () => {
    vi.mocked(d.store.claimBrief).mockResolvedValueOnce(null);
    await expect(
      runCompanyWorkExceptionLoop(d, config()),
    ).resolves.toMatchObject({
      outcome: 'duplicate_brief',
    });
    expect(d.postBrief).not.toHaveBeenCalled();
  });

  it('marks ambiguous delivery and does not automatically retry it', async () => {
    vi.mocked(d.postBrief).mockResolvedValueOnce(undefined);
    await expect(
      runCompanyWorkExceptionLoop(d, config()),
    ).resolves.toMatchObject({
      outcome: 'delivery_uncertain',
      errorCode: 'slack_delivery_uncertain',
    });
    expect(d.store.markBriefUncertain).toHaveBeenCalledWith(
      '7',
      'slack:C_CHIEF',
      'slack_delivery_uncertain',
    );
    expect(d.store.markBriefPosted).not.toHaveBeenCalled();
  });

  it('refuses acknowledgment when Slack delivered but durable binding failed', async () => {
    vi.mocked(d.store.markBriefPosted).mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    const service = new CompanyWorkExceptionLoopService(d, config());
    await service.tick(new Date('2026-08-17T02:00:00.000Z'));
    expect(service.getStatus().lastResult).toMatchObject({
      outcome: 'delivery_uncertain',
      messageTs: '1800000000.000001',
      errorCode: 'brief_post_binding_failed',
    });
    expect(d.postThread).toHaveBeenCalledWith(
      'slack:C_CHIEF',
      '1800000000.000001',
      expect.stringContaining('not durably bound'),
    );
    vi.mocked(d.postThread).mockRejectedValueOnce(new Error('Slack down'));
    await expect(
      service.handleApproval('1800000000.000001', 'Alex', {
        jid: 'slack:C_CHIEF',
        reactorUid: 'U1234567',
        source: 'reaction',
      }),
    ).resolves.toBe(true);
    expect(d.store.findPostedBrief).not.toHaveBeenCalled();
    expect(d.store.acknowledgeBrief).not.toHaveBeenCalled();
  });

  it('records source-derived resolution without posting or invoking an action', async () => {
    const empty = report({
      summary: {
        ...report().summary,
        exceptionItems: 0,
        critical: 0,
        byKind: Object.fromEntries(
          COMPANY_WORK_EXCEPTION_KINDS.map((kind) => [kind, 0]),
        ) as CompanyWorkExceptionReport['summary']['byKind'],
      },
      exceptions: [],
    });
    vi.mocked(d.readReport).mockResolvedValueOnce(empty);
    vi.mocked(d.store.reconcileCases).mockResolvedValueOnce({
      activeCases: [],
      opened: 0,
      reopened: 0,
      resolved: 2,
    });
    await expect(
      runCompanyWorkExceptionLoop(d, config()),
    ).resolves.toMatchObject({
      outcome: 'no_exceptions',
      resolved: 2,
    });
    expect(d.store.claimBrief).not.toHaveBeenCalled();
    expect(d.postBrief).not.toHaveBeenCalled();
  });
});

describe('Company Work exact operator acknowledgment', () => {
  it('claims typed approval on an exact brief but refuses to treat it as acknowledgment', async () => {
    const d = deps();
    vi.mocked(d.store.findPostedBrief).mockResolvedValueOnce({
      id: '7',
      channelJid: 'slack:C_CHIEF',
      messageTs: '1800000000.000001',
      acknowledgedAt: null,
      acknowledgmentReceiptStatus: 'none',
    });
    const service = new CompanyWorkExceptionLoopService(d, config());
    await expect(
      service.handleApproval('1800000000.000001', 'Alex', {
        jid: 'slack:C_CHIEF',
        reactorUid: 'U1234567',
        source: 'text',
      }),
    ).resolves.toBe(true);
    expect(d.store.acknowledgeBrief).not.toHaveBeenCalled();
    expect(d.postThread).toHaveBeenCalledWith(
      'slack:C_CHIEF',
      '1800000000.000001',
      expect.stringContaining('Use a ✅ reaction'),
    );
  });

  it('claims typed approval by the exact thread root even after a later bot reply', async () => {
    const d = deps();
    vi.mocked(d.store.findPostedBrief).mockResolvedValueOnce({
      id: '7',
      channelJid: 'slack:C_CHIEF',
      messageTs: '1800000000.000001',
      acknowledgedAt: null,
      acknowledgmentReceiptStatus: 'none',
    });
    const service = new CompanyWorkExceptionLoopService(d, config());
    await expect(
      service.handleApproval('1800000000.000099', 'Alex', {
        jid: 'slack:C_CHIEF',
        reactorUid: 'U1234567',
        source: 'text',
        threadTs: '1800000000.000001',
      }),
    ).resolves.toBe(true);
    expect(d.store.findPostedBrief).toHaveBeenCalledWith(
      'slack:C_CHIEF',
      '1800000000.000001',
    );
    expect(d.store.acknowledgeBrief).not.toHaveBeenCalled();
    expect(d.postThread).toHaveBeenCalledWith(
      'slack:C_CHIEF',
      '1800000000.000001',
      expect.stringContaining('Use a ✅ reaction'),
    );
  });

  it('rejects an unnamed operator without mutating case state', async () => {
    const d = deps();
    vi.mocked(d.store.findPostedBrief).mockResolvedValueOnce({
      id: '7',
      channelJid: 'slack:C_CHIEF',
      messageTs: '1800000000.000001',
      acknowledgedAt: null,
      acknowledgmentReceiptStatus: 'none',
    });
    const service = new CompanyWorkExceptionLoopService(d, config());
    await expect(
      service.handleApproval('1800000000.000001', 'Unknown', {
        jid: 'slack:C_CHIEF',
        reactorUid: 'U9999999',
        source: 'reaction',
      }),
    ).resolves.toBe(true);
    expect(d.store.acknowledgeBrief).not.toHaveBeenCalled();
    expect(d.postThread).toHaveBeenCalledWith(
      'slack:C_CHIEF',
      '1800000000.000001',
      expect.stringContaining('not a configured operator'),
    );
  });

  it('acknowledges only the exact bound brief and posts a non-resolution receipt', async () => {
    const d = deps();
    vi.mocked(d.store.findPostedBrief).mockResolvedValueOnce({
      id: '7',
      channelJid: 'slack:C_CHIEF',
      messageTs: '1800000000.000001',
      acknowledgedAt: null,
      acknowledgmentReceiptStatus: 'none',
    });
    const service = new CompanyWorkExceptionLoopService(d, config());
    await expect(
      service.handleApproval('1800000000.000001', 'Alex', {
        jid: 'slack:C_CHIEF',
        reactorUid: 'U1234567',
        source: 'reaction',
      }),
    ).resolves.toBe(true);
    expect(d.store.acknowledgeBrief).toHaveBeenCalledWith(
      '7',
      'U1234567',
      expect.any(String),
    );
    expect(d.postThread).toHaveBeenCalledWith(
      'slack:C_CHIEF',
      '1800000000.000001',
      expect.stringContaining('Nothing was resolved, approved, retried, sent'),
    );
    expect(d.store.markAcknowledgmentReceipt).toHaveBeenCalledWith(
      '7',
      'posted',
      '1800000000.000002',
    );
  });

  it('does not claim a check reaction on any other bot message', async () => {
    const d = deps();
    const service = new CompanyWorkExceptionLoopService(d, config());
    await expect(
      service.handleApproval('other-ts', 'Alex', {
        jid: 'slack:C_CHIEF',
        reactorUid: 'U1234567',
        source: 'reaction',
      }),
    ).resolves.toBe(false);
    expect(d.store.acknowledgeBrief).not.toHaveBeenCalled();
    expect(d.postThread).not.toHaveBeenCalled();
  });
});
