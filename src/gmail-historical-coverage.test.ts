import { describe, expect, it, vi } from 'vitest';

import {
  buildGmailHistoricalCoverageReport,
  deriveGmailHistoricalCoverageScopeIdentity,
  GmailHistoricalCoverageError,
  runGmailHistoricalCoverageAudit,
  type GmailHistoricalClassificationEvidence,
  type GmailHistoricalCoverageCandidate,
} from './gmail-historical-coverage.js';
import {
  normalizeGmailInboundDispositionInput,
  type GmailInboundDisposition,
  type GmailInboundDispositionReason,
  type GmailInboundDispositionReceipt,
} from './gmail-inbound-disposition.js';

const GENERATED_AT = '2026-08-18T03:00:00.000Z';

function receipt(
  messageId: string,
  disposition: GmailInboundDisposition,
  reasonKey: GmailInboundDispositionReason,
): GmailInboundDispositionReceipt {
  const normalized = normalizeGmailInboundDispositionInput({
    messageId,
    disposition,
    reasonKey,
    sourceEvidenceSha256: 'a'.repeat(64),
    observedAt: '2026-08-18T02:00:00.000Z',
  });
  return {
    ...normalized,
    recordedAt: '2026-08-18T02:00:01.000Z',
  };
}

function candidate(
  messageId: string,
  overrides: Partial<GmailHistoricalCoverageCandidate> = {},
): GmailHistoricalCoverageCandidate {
  return {
    messageId,
    receipt: null,
    storedEvidence: 'ordinary_persisted',
    classificationRouted: false,
    ...overrides,
  };
}

function expectCoverageError(
  fn: () => unknown,
  code: GmailHistoricalCoverageError['code'],
): void {
  try {
    fn();
    throw new Error('expected GmailHistoricalCoverageError');
  } catch (error) {
    expect(error).toBeInstanceOf(GmailHistoricalCoverageError);
    expect((error as GmailHistoricalCoverageError).code).toBe(code);
  }
}

describe('Gmail historical coverage contract', () => {
  it('closes aggregate arithmetic across receipts, recoverable evidence, and unknown retained IDs', () => {
    const candidates: GmailHistoricalCoverageCandidate[] = [
      candidate('r-ordinary', {
        receipt: receipt('r-ordinary', 'accepted', 'inbound_message_persisted'),
      }),
      candidate('r-rule', {
        receipt: receipt('r-rule', 'accepted', 'rule_auto_archive_completed'),
        storedEvidence: 'absent',
      }),
      candidate('r-outbound', {
        receipt: receipt('r-outbound', 'rejected', 'own_outbound'),
        storedEvidence: 'outbound_stored',
      }),
      candidate('e-ordinary'),
      candidate('e-route', {
        storedEvidence: 'direct_route_staged',
        classificationRouted: true,
      }),
      candidate('u-route', { storedEvidence: 'direct_route_staged' }),
      candidate('u-outbound', { storedEvidence: 'outbound_stored' }),
      candidate('u-unsupported', {
        storedEvidence: 'unsupported_inbound_stored',
      }),
    ];

    const report = buildGmailHistoricalCoverageReport({
      scopeIdentity: 'gmail:retained-host:test',
      generatedAt: GENERATED_AT,
      candidates,
    });

    expect(report.evidenceScope).toEqual({
      basis: 'retained_host_evidence',
      mailboxComplete: false,
      gmailQueried: false,
    });
    expect(report.totalIds).toBe(8);
    expect(report.terminalReceipts).toMatchObject({
      total: 3,
      accepted: 2,
      rejected: 1,
    });
    expect(report.terminalReceipts.byReason).toMatchObject({
      inbound_message_persisted: 1,
      rule_auto_archive_completed: 1,
      own_outbound: 1,
    });
    expect(report.recoverableEvidence).toEqual({
      total: 2,
      ordinaryPersisted: 1,
      classifiedRoutePersisted: 1,
    });
    expect(report.unknown).toEqual({
      total: 3,
      directRouteUnresolved: 1,
      outboundWithoutReceipt: 1,
      unsupportedInboundStored: 1,
    });
    expect(
      report.terminalReceipts.total +
        report.recoverableEvidence.total +
        report.unknown.total,
    ).toBe(report.totalIds);
    expect(report.accountingClosed).toBe(true);
  });

  it('is replay-stable across ordering and report time without exposing the mailbox identity', () => {
    const chatJid = 'gmail:private-mailbox@example.invalid';
    const scopeIdentity = deriveGmailHistoricalCoverageScopeIdentity(chatJid);
    expect(scopeIdentity).not.toContain('private-mailbox');
    const first = buildGmailHistoricalCoverageReport({
      scopeIdentity,
      generatedAt: GENERATED_AT,
      candidates: [candidate('id-b'), candidate('id-a')],
    });
    const second = buildGmailHistoricalCoverageReport({
      scopeIdentity,
      generatedAt: '2026-08-18T03:10:00.000Z',
      candidates: [candidate('id-a'), candidate('id-b')],
    });
    expect(second.scopeFingerprint).toBe(first.scopeFingerprint);
    expect(second.sourceEvidenceFingerprint).toBe(
      first.sourceEvidenceFingerprint,
    );
    expect(second.reportFingerprint).toBe(first.reportFingerprint);
  });

  it('refuses duplicate IDs and candidates with no retained evidence', () => {
    expectCoverageError(
      () =>
        buildGmailHistoricalCoverageReport({
          scopeIdentity: 'gmail:retained-host:test',
          generatedAt: GENERATED_AT,
          candidates: [candidate('same'), candidate('same')],
        }),
      'duplicate_id',
    );
    expectCoverageError(
      () =>
        buildGmailHistoricalCoverageReport({
          scopeIdentity: 'gmail:retained-host:test',
          generatedAt: GENERATED_AT,
          candidates: [candidate('missing', { storedEvidence: 'absent' })],
        }),
      'contradictory_evidence',
    );
  });

  it('refuses receipts that contradict their exact stored evidence', () => {
    expectCoverageError(
      () =>
        buildGmailHistoricalCoverageReport({
          scopeIdentity: 'gmail:retained-host:test',
          generatedAt: GENERATED_AT,
          candidates: [
            candidate('wrong-row', {
              receipt: receipt(
                'wrong-row',
                'accepted',
                'rule_auto_archive_completed',
              ),
            }),
          ],
        }),
      'contradictory_evidence',
    );
    expectCoverageError(
      () =>
        buildGmailHistoricalCoverageReport({
          scopeIdentity: 'gmail:retained-host:test',
          generatedAt: GENERATED_AT,
          candidates: [
            candidate('wrong-route', {
              receipt: receipt(
                'wrong-route',
                'accepted',
                'classified_route_persisted',
              ),
              storedEvidence: 'direct_route_staged',
            }),
          ],
        }),
      'contradictory_evidence',
    );
  });
});

describe('Gmail historical coverage audit', () => {
  function deps(
    candidates: readonly GmailHistoricalCoverageCandidate[],
    evidence: readonly GmailHistoricalClassificationEvidence[] = [],
  ) {
    return {
      listCandidates: vi.fn().mockResolvedValue(candidates),
      listClassificationEvidence: vi.fn().mockResolvedValue(evidence),
    };
  }

  it('requires one unambiguous rules-runner-v1 routed marker', async () => {
    const source = deps(
      [candidate('route-id', { storedEvidence: 'direct_route_staged' })],
      [
        {
          messageId: 'route-id',
          exactRoutedCount: 1,
          exactUnroutedCount: 0,
          otherClassifierCount: 0,
        },
      ],
    );
    const report = await runGmailHistoricalCoverageAudit({
      scopeIdentity: 'gmail:retained-host:test',
      generatedAt: GENERATED_AT,
      deps: source,
    });
    expect(report.recoverableEvidence.classifiedRoutePersisted).toBe(1);
    expect(report.unknown.directRouteUnresolved).toBe(0);
    expect(source.listCandidates).toHaveBeenCalledTimes(2);
    expect(source.listClassificationEvidence).toHaveBeenCalledTimes(2);
    expect(source.listClassificationEvidence).toHaveBeenCalledWith([
      'route-id',
    ]);
  });

  it('keeps an unrouted marker unknown', async () => {
    const source = deps(
      [candidate('route-id', { storedEvidence: 'direct_route_staged' })],
      [
        {
          messageId: 'route-id',
          exactRoutedCount: 0,
          exactUnroutedCount: 1,
          otherClassifierCount: 0,
        },
      ],
    );
    const report = await runGmailHistoricalCoverageAudit({
      scopeIdentity: 'gmail:retained-host:test',
      generatedAt: GENERATED_AT,
      deps: source,
    });
    expect(report.unknown.directRouteUnresolved).toBe(1);
  });

  it('refuses ambiguous or out-of-scope classification evidence', async () => {
    const base = [
      candidate('route-id', { storedEvidence: 'direct_route_staged' }),
    ];
    await expect(
      runGmailHistoricalCoverageAudit({
        scopeIdentity: 'gmail:retained-host:test',
        generatedAt: GENERATED_AT,
        deps: deps(base, [
          {
            messageId: 'route-id',
            exactRoutedCount: 1,
            exactUnroutedCount: 0,
            otherClassifierCount: 1,
          },
        ]),
      }),
    ).rejects.toMatchObject({ code: 'contradictory_evidence' });
    await expect(
      runGmailHistoricalCoverageAudit({
        scopeIdentity: 'gmail:retained-host:test',
        generatedAt: GENERATED_AT,
        deps: deps(base, [
          {
            messageId: 'not-requested',
            exactRoutedCount: 1,
            exactUnroutedCount: 0,
            otherClassifierCount: 0,
          },
        ]),
      }),
    ).rejects.toMatchObject({ code: 'contradictory_evidence' });
  });

  it('refuses SQLite route assertions and semantic source drift', async () => {
    await expect(
      runGmailHistoricalCoverageAudit({
        scopeIdentity: 'gmail:retained-host:test',
        generatedAt: GENERATED_AT,
        deps: deps([
          candidate('route-id', {
            storedEvidence: 'direct_route_staged',
            classificationRouted: true,
          }),
        ]),
      }),
    ).rejects.toMatchObject({ code: 'contradictory_evidence' });

    const listCandidates = vi
      .fn()
      .mockResolvedValueOnce([candidate('changing')])
      .mockResolvedValueOnce([
        candidate('changing', { storedEvidence: 'outbound_stored' }),
      ]);
    await expect(
      runGmailHistoricalCoverageAudit({
        scopeIdentity: 'gmail:retained-host:test',
        generatedAt: GENERATED_AT,
        deps: {
          listCandidates,
          listClassificationEvidence: vi.fn().mockResolvedValue([]),
        },
      }),
    ).rejects.toMatchObject({ code: 'source_drift' });
  });
});
