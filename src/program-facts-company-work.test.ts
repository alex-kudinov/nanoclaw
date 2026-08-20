import { beforeEach, describe, expect, it, vi } from 'vitest';

const ledger = vi.hoisted(() => ({
  ensure: vi.fn(),
  get: vi.fn(),
  transition: vi.fn(),
}));
const trigger = vi.hoisted(() => ({ record: vi.fn() }));

vi.mock('./company-work-ledger.js', () => ({
  ensureCompanyConditionWorkItemWithClient: ledger.ensure,
  getCompanyConditionWorkItemBySourceWithClient: ledger.get,
  transitionCompanyConditionWorkItemWithClient: ledger.transition,
}));
vi.mock('./company-trigger.js', () => ({
  recordCompanyTriggerWithClient: trigger.record,
}));

import { applyProgramFactsCompanyWorkWithClient } from './program-facts-company-work.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const NOW = '2026-08-20T14:00:00.000Z';

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: '42',
    workflowType: 'program_facts_drift',
    sourceSystem: 'program_facts_detector',
    sourceKey: 'program-facts-v1',
    partyId: null,
    pipelineEntryId: null,
    completionDefinition: 'detector_clean_receipt',
    stage: 'accepted',
    disposition: 'blocked',
    version: 1,
    blockCode: 'fact_authority:owner_review_required',
    failureCode: null,
    deadlineAt: '2026-08-22T14:00:00.000Z',
    createdAt: NOW,
    updatedAt: NOW,
    lastTransitionAt: NOW,
    lastTransitionBy: 'program-facts-work:host',
    ...overrides,
  };
}

function run(
  options: { clean?: boolean; fingerprint?: string; runKey?: string } = {},
) {
  const clean = options.clean ?? false;
  return {
    runKey: options.runKey ?? 'run-1',
    observedAt: NOW,
    result: {
      checked: 3,
      findings: clean
        ? []
        : [
            {
              program: 'practitioner-series',
              kind: 'kb_missing_fact' as const,
              detail: 'content remains outside the durable control plane',
            },
          ],
    },
    evidence: {
      detectorVersion: 1 as const,
      factsSha256: HASH_A,
      salesKbSha256: HASH_A,
      productsSha256: HASH_A,
      productsAvailable: true,
      findingFingerprint: options.fingerprint ?? HASH_A,
      payloadSha256: HASH_B,
    },
  };
}

function clientWith(rows: Array<{ rows: unknown[] }>) {
  const query = vi.fn();
  for (const value of rows) query.mockResolvedValueOnce(value);
  return { query };
}

beforeEach(() => {
  vi.clearAllMocks();
  trigger.record.mockResolvedValue({
    occurrence: { occurrenceId: 'c'.repeat(64) },
    applied: true,
    duplicate: false,
  });
});

describe('program-facts detector-to-work adapter', () => {
  it('atomically opens and owner-blocks the first drift finding', async () => {
    ledger.get.mockResolvedValue(null);
    ledger.ensure.mockResolvedValue({
      item: item({ disposition: 'open', version: 0, blockCode: null }),
      applied: true,
      duplicate: false,
    });
    ledger.transition.mockResolvedValue({
      item: item(),
      applied: true,
      duplicate: false,
    });
    const client = clientWith([{ rows: [{ id: '1' }] }]);

    const result = await applyProgramFactsCompanyWorkWithClient(
      client as never,
      run(),
    );
    expect(result).toMatchObject({
      outcome: 'opened',
      shouldNotify: true,
      observationApplied: true,
      workItem: { id: '42', disposition: 'blocked' },
    });
    expect(trigger.record).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        kind: 'business_condition',
        workRequest: expect.objectContaining({
          workflowType: 'program_facts_drift',
          operation: 'create',
        }),
      }),
    );
    expect(ledger.transition).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        eventType: 'blocked',
        exceptionCode: 'fact_authority:owner_review_required',
      }),
    );
  });

  it('records unchanged observations without repeating the Sales alert', async () => {
    ledger.get.mockResolvedValue(item());
    const client = clientWith([
      { rows: [{ finding_fingerprint: HASH_A }] },
      { rows: [{ id: '2' }] },
    ]);
    const result = await applyProgramFactsCompanyWorkWithClient(
      client as never,
      run(),
    );
    expect(result).toMatchObject({
      outcome: 'unchanged',
      shouldNotify: false,
      observationApplied: true,
    });
    expect(trigger.record).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        workRequest: expect.objectContaining({ operation: 'create' }),
      }),
    );
    expect(ledger.transition).not.toHaveBeenCalled();
  });

  it('alerts when an accepted item still needs its first owner-review route', async () => {
    ledger.get.mockResolvedValue(
      item({ disposition: 'open', version: 0, blockCode: null }),
    );
    ledger.transition.mockResolvedValue({
      item: item(),
      applied: true,
      duplicate: false,
    });
    const client = clientWith([{ rows: [] }, { rows: [{ id: '2b' }] }]);

    const result = await applyProgramFactsCompanyWorkWithClient(
      client as never,
      run({ runKey: 'run-route' }),
    );

    expect(result).toMatchObject({ outcome: 'updated', shouldNotify: true });
    expect(ledger.transition).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ eventType: 'blocked' }),
    );
  });

  it('notifies when the durable finding fingerprint changes', async () => {
    ledger.get.mockResolvedValue(item());
    const client = clientWith([
      { rows: [{ finding_fingerprint: HASH_A }] },
      { rows: [{ id: '3' }] },
    ]);
    const result = await applyProgramFactsCompanyWorkWithClient(
      client as never,
      run({ fingerprint: HASH_B }),
    );
    expect(result).toMatchObject({ outcome: 'updated', shouldNotify: true });
  });

  it('closes blocked work only through an exact clean-detector receipt', async () => {
    ledger.get.mockResolvedValue(item());
    ledger.transition.mockResolvedValue({
      item: item({
        stage: 'outcome_validated',
        disposition: 'completed',
        version: 2,
        blockCode: null,
      }),
      applied: true,
      duplicate: false,
    });
    const client = clientWith([{ rows: [{ id: '4' }] }]);
    const result = await applyProgramFactsCompanyWorkWithClient(
      client as never,
      run({ clean: true, runKey: 'run-2' }),
    );
    expect(result).toMatchObject({ outcome: 'closed', shouldNotify: true });
    expect(ledger.transition).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        eventType: 'outcome_validated',
        receipt: expect.objectContaining({
          type: 'outcome_validation',
          externalActionId: 'run-2',
        }),
      }),
    );
  });

  it('reopens a later recurrence before owner-blocking it again', async () => {
    ledger.get.mockResolvedValue(
      item({
        stage: 'outcome_validated',
        disposition: 'completed',
        version: 2,
        blockCode: null,
      }),
    );
    ledger.transition
      .mockResolvedValueOnce({
        item: item({ disposition: 'open', version: 3, blockCode: null }),
        applied: true,
        duplicate: false,
      })
      .mockResolvedValueOnce({
        item: item({ version: 4 }),
        applied: true,
        duplicate: false,
      });
    const client = clientWith([
      { rows: [{ finding_fingerprint: HASH_A }] },
      { rows: [{ id: '5' }] },
    ]);
    const result = await applyProgramFactsCompanyWorkWithClient(
      client as never,
      run({ runKey: 'run-3' }),
    );
    expect(result).toMatchObject({ outcome: 'reopened', shouldNotify: true });
    expect(
      ledger.transition.mock.calls.map((call) => call[1].eventType),
    ).toEqual(['reopened', 'blocked']);
  });

  it('does not create ledger noise for a clean detector with no open work', async () => {
    ledger.get.mockResolvedValue(null);
    const client = clientWith([]);
    await expect(
      applyProgramFactsCompanyWorkWithClient(
        client as never,
        run({ clean: true }),
      ),
    ).resolves.toMatchObject({
      outcome: 'clean_no_work',
      workItem: null,
      shouldNotify: false,
    });
    expect(trigger.record).not.toHaveBeenCalled();
    expect(client.query).not.toHaveBeenCalled();
  });
});
