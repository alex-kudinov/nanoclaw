import type { QueryResult, QueryResultRow } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  CompanyTriggerSourceError,
  normalizeCompanyTriggerSource,
  normalizeCompanyTriggerWatermarkEvent,
  recordCompanyTriggerWatermarkWithClient,
  registerCompanyTriggerSourceWithClient,
} from './company-trigger-source.js';
import {
  normalizeCompanyTrigger,
  type CompanyTriggerClient,
} from './company-trigger.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const FROM = '2026-08-17T12:00:00.000Z';
const THROUGH = '2026-08-17T12:05:00.000Z';

function sourceInput(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    kind: 'gmail',
    sourceSystem: 'gmail',
    sourceKey: 'mailbox:primary:inbound-v1',
    adapterKey: 'gmail_history',
    adapterVersion: '1.0.0',
    cursorKind: 'uint',
    reconciliationMode: 'bounded_scan',
    maxReconciliationWindowSeconds: 604800,
    freshnessBudgetSeconds: 1200,
    ownerKey: 'core:gmail',
    alertRouteKey: 'group:chief',
    ...overrides,
  };
}

const source = normalizeCompanyTriggerSource(sourceInput());

function watermarkInput(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    definitionId: source.definitionId,
    eventKey: 'gmail:bootstrap:100',
    eventType: 'bootstrap',
    expectedVersion: 0,
    previousCursor: null,
    nextCursor: '100',
    observedFrom: FROM,
    observedThrough: THROUGH,
    evidenceSha256: HASH_A,
    observedCount: 2,
    acceptedCount: 1,
    rejectedCount: 1,
    gapReason: null,
    resolvesEventId: null,
    ...overrides,
  };
}

function queryResult<T extends QueryResultRow>(
  rows: T[],
  rowCount: number | null = rows.length,
): QueryResult<T> {
  return {
    command: 'SELECT',
    rowCount,
    oid: 0,
    fields: [],
    rows,
  };
}

function sequentialClient(results: QueryResult<QueryResultRow>[]): {
  client: CompanyTriggerClient;
  query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn();
  for (const result of results) query.mockResolvedValueOnce(result);
  return { client: { query } as CompanyTriggerClient, query };
}

async function expectSourceError(
  run: () => unknown | Promise<unknown>,
  code: CompanyTriggerSourceError['code'],
): Promise<void> {
  try {
    await run();
    throw new Error('expected CompanyTriggerSourceError');
  } catch (error) {
    expect(error).toBeInstanceOf(CompanyTriggerSourceError);
    expect((error as CompanyTriggerSourceError).code).toBe(code);
  }
}

function sourceRow(cursorKind: 'none' | 'uint' | 'utc_timestamp' = 'uint') {
  return {
    definition_id: source.definitionId,
    cursor_kind: cursorKind,
    reconciliation_mode:
      cursorKind === 'none'
        ? ('unsupported' as const)
        : ('bounded_scan' as const),
  };
}

function stateRow(
  overrides: Partial<{
    version: string;
    status: 'uninitialized' | 'current' | 'gap';
    cursor_value: string | null;
    cursor_observed_at: string | null;
    open_gap_event_id: string | null;
    last_event_id: string | null;
  }> = {},
) {
  return {
    definition_id: source.definitionId,
    version: '0',
    status: 'uninitialized' as const,
    cursor_value: null,
    cursor_observed_at: null,
    open_gap_event_id: null,
    last_event_id: null,
    ...overrides,
  };
}

describe('Company OS trigger-source inventory', () => {
  it('shares the exact v1 definition identity and grants no authority', () => {
    const occurrence = normalizeCompanyTrigger({
      kind: 'gmail',
      sourceSystem: 'gmail',
      sourceKey: 'mailbox:primary:inbound-v1',
      occurrenceKey: 'message:abc123',
      observedAt: THROUGH,
      payloadSha256: HASH_A,
      workRequest: {
        operation: 'create',
        workflowType: 'inbound_email',
        sourceSystem: 'gmail',
        sourceKey: 'message:abc123',
      },
    });

    expect(source.definitionId).toBe(occurrence.definitionId);
    expect(source.sourceFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(source.actionAuthority).toBe('none');
    expect(Object.isFrozen(source)).toBe(true);
  });

  it('supports a source with no applicable cursor without inventing freshness', () => {
    expect(
      normalizeCompanyTriggerSource(
        sourceInput({
          kind: 'time',
          sourceSystem: 'scheduled_task',
          sourceKey: 'task:daily:boundary-v1',
          adapterKey: 'scheduled_task_claim',
          cursorKind: 'none',
          reconciliationMode: 'not_applicable',
          maxReconciliationWindowSeconds: null,
          freshnessBudgetSeconds: null,
        }),
      ),
    ).toMatchObject({ cursorKind: 'none', actionAuthority: 'none' });
  });

  it.each([
    ['raw source config', { rawConfig: { mailbox: 'secret' } }],
    ['activation switch', { enabled: true }],
    ['action authority', { actionAuthority: 'send_email' }],
  ])('rejects unsupported %s', async (_name, extra) => {
    await expectSourceError(
      () => normalizeCompanyTriggerSource(sourceInput(extra)),
      'invalid_input',
    );
  });

  it('rejects cursor and reconciliation settings that cannot prove recovery', async () => {
    await expectSourceError(
      () =>
        normalizeCompanyTriggerSource(
          sourceInput({
            cursorKind: 'uint',
            reconciliationMode: 'unsupported',
            maxReconciliationWindowSeconds: null,
            freshnessBudgetSeconds: null,
          }),
        ),
      'invalid_input',
    );
  });

  it('registers a new immutable source and initializes version-zero state', async () => {
    const { client, query } = sequentialClient([
      queryResult([{ definition_id: source.definitionId }]),
      queryResult([], 1),
    ]);

    const result = await registerCompanyTriggerSourceWithClient(
      client,
      sourceInput(),
    );

    expect(result).toMatchObject({ applied: true, duplicate: false });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain(
      'INSERT INTO business_v2.company_trigger_sources',
    );
    expect(query.mock.calls[0][0]).not.toMatch(
      /raw_|payload|content|message|prompt|secret|enabled/i,
    );
    expect(query.mock.calls[1][0]).toContain(
      'INSERT INTO business_v2.company_trigger_watermark_state',
    );
  });

  it('converges exact registration replay', async () => {
    const { client } = sequentialClient([
      queryResult([]),
      queryResult([
        {
          definition_id: source.definitionId,
          source_fingerprint: source.sourceFingerprint,
        },
      ]),
      queryResult([], 0),
    ]);

    await expect(
      registerCompanyTriggerSourceWithClient(client, sourceInput()),
    ).resolves.toMatchObject({ applied: false, duplicate: true });
  });

  it('fails closed when a registered definition changes adapter facts', async () => {
    const { client } = sequentialClient([
      queryResult([]),
      queryResult([
        {
          definition_id: source.definitionId,
          source_fingerprint: HASH_B,
        },
      ]),
    ]);

    await expectSourceError(
      () => registerCompanyTriggerSourceWithClient(client, sourceInput()),
      'conflict',
    );
  });
});

describe('Company OS trigger-source watermarks', () => {
  it('normalizes a complete checkpoint with exact accounting', () => {
    const event = normalizeCompanyTriggerWatermarkEvent(
      'uint',
      watermarkInput(),
    );
    expect(event).toMatchObject({
      eventType: 'bootstrap',
      previousCursor: null,
      nextCursor: '100',
      actionAuthority: 'none',
    });
    expect(event.eventFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(event)).toBe(true);
  });

  it('canonicalizes UTC-timestamp cursors before fingerprinting', () => {
    const event = normalizeCompanyTriggerWatermarkEvent(
      'utc_timestamp',
      watermarkInput({
        eventKey: 'condition:advance:2',
        eventType: 'advance',
        expectedVersion: 1,
        previousCursor: '2026-08-17T07:00:00-05:00',
        nextCursor: '2026-08-17T07:05:00-05:00',
      }),
    );
    expect(event.previousCursor).toBe('2026-08-17T12:00:00.000Z');
    expect(event.nextCursor).toBe('2026-08-17T12:05:00.000Z');
  });

  it.each([
    ['unaccounted observation', { observedCount: 3 }],
    [
      'regressing cursor',
      {
        eventType: 'advance',
        expectedVersion: 1,
        previousCursor: '100',
        nextCursor: '99',
        eventKey: 'gmail:advance:99',
      },
    ],
    ['raw evidence', { rawMessages: ['secret'] }],
  ])('rejects %s', async (_name, overrides) => {
    await expectSourceError(
      () =>
        normalizeCompanyTriggerWatermarkEvent(
          'uint',
          watermarkInput(overrides),
        ),
      'invalid_input',
    );
  });

  it('bootstraps version-zero state through one append-only event', async () => {
    const { client, query } = sequentialClient([
      queryResult([sourceRow()]),
      queryResult([stateRow()]),
      queryResult([]),
      queryResult([{ id: '50' }]),
      queryResult([
        stateRow({
          version: '1',
          status: 'current',
          cursor_value: '100',
          cursor_observed_at: THROUGH,
          last_event_id: '50',
        }),
      ]),
    ]);

    const result = await recordCompanyTriggerWatermarkWithClient(
      client,
      watermarkInput(),
    );

    expect(result).toMatchObject({
      applied: true,
      duplicate: false,
      eventId: '50',
      state: { version: 1, status: 'current', cursorValue: '100' },
    });
    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls[3][0]).toContain(
      'INSERT INTO business_v2.company_trigger_watermark_events',
    );
    expect(query.mock.calls[3][0]).not.toMatch(
      /raw_|payload|content|message|prompt|secret/i,
    );
  });

  it('returns exact event replay without advancing state again', async () => {
    const event = normalizeCompanyTriggerWatermarkEvent(
      'uint',
      watermarkInput(),
    );
    const { client, query } = sequentialClient([
      queryResult([sourceRow()]),
      queryResult([
        stateRow({
          version: '1',
          status: 'current',
          cursor_value: '100',
          cursor_observed_at: THROUGH,
          last_event_id: '50',
        }),
      ]),
      queryResult([{ id: '50', event_fingerprint: event.eventFingerprint }]),
    ]);

    await expect(
      recordCompanyTriggerWatermarkWithClient(client, watermarkInput()),
    ).resolves.toMatchObject({
      applied: false,
      duplicate: true,
      eventId: '50',
      state: { version: 1, cursorValue: '100' },
    });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('fails closed when an event key is replayed with different facts', async () => {
    const original = normalizeCompanyTriggerWatermarkEvent(
      'uint',
      watermarkInput(),
    );
    const { client } = sequentialClient([
      queryResult([sourceRow()]),
      queryResult([stateRow()]),
      queryResult([{ id: '50', event_fingerprint: original.eventFingerprint }]),
    ]);

    await expectSourceError(
      () =>
        recordCompanyTriggerWatermarkWithClient(
          client,
          watermarkInput({ evidenceSha256: HASH_B }),
        ),
      'conflict',
    );
  });

  it('refuses a stale compare-and-swap version', async () => {
    const { client } = sequentialClient([
      queryResult([sourceRow()]),
      queryResult([
        stateRow({
          version: '2',
          status: 'current',
          cursor_value: '200',
          cursor_observed_at: THROUGH,
          last_event_id: '51',
        }),
      ]),
      queryResult([]),
    ]);

    await expectSourceError(
      () =>
        recordCompanyTriggerWatermarkWithClient(
          client,
          watermarkInput({
            eventType: 'advance',
            eventKey: 'gmail:advance:200',
            expectedVersion: 1,
            previousCursor: '100',
            nextCursor: '200',
          }),
        ),
      'stale_version',
    );
  });

  it('records a gap without moving the durable cursor', async () => {
    const { client } = sequentialClient([
      queryResult([sourceRow()]),
      queryResult([
        stateRow({
          version: '1',
          status: 'current',
          cursor_value: '100',
          cursor_observed_at: THROUGH,
          last_event_id: '50',
        }),
      ]),
      queryResult([]),
      queryResult([{ id: '51' }]),
      queryResult([
        stateRow({
          version: '2',
          status: 'gap',
          cursor_value: '100',
          cursor_observed_at: THROUGH,
          open_gap_event_id: '51',
          last_event_id: '51',
        }),
      ]),
    ]);

    const result = await recordCompanyTriggerWatermarkWithClient(
      client,
      watermarkInput({
        eventType: 'gap_detected',
        eventKey: 'gmail:gap:500',
        expectedVersion: 1,
        previousCursor: '100',
        nextCursor: '500',
        gapReason: 'history_expired',
      }),
    );

    expect(result.state).toMatchObject({
      version: 2,
      status: 'gap',
      cursorValue: '100',
      openGapEventId: '51',
    });
  });

  it('blocks ordinary advancement while a gap is open', async () => {
    const { client } = sequentialClient([
      queryResult([sourceRow()]),
      queryResult([
        stateRow({
          version: '2',
          status: 'gap',
          cursor_value: '100',
          cursor_observed_at: THROUGH,
          open_gap_event_id: '51',
          last_event_id: '51',
        }),
      ]),
      queryResult([]),
    ]);

    await expectSourceError(
      () =>
        recordCompanyTriggerWatermarkWithClient(
          client,
          watermarkInput({
            eventType: 'advance',
            eventKey: 'gmail:advance:500',
            expectedVersion: 2,
            previousCursor: '100',
            nextCursor: '500',
          }),
        ),
      'gap_open',
    );
  });

  it('requires reconciliation to bind the exact open gap', async () => {
    const { client } = sequentialClient([
      queryResult([sourceRow()]),
      queryResult([
        stateRow({
          version: '2',
          status: 'gap',
          cursor_value: '100',
          cursor_observed_at: THROUGH,
          open_gap_event_id: '51',
          last_event_id: '51',
        }),
      ]),
      queryResult([]),
    ]);

    await expectSourceError(
      () =>
        recordCompanyTriggerWatermarkWithClient(
          client,
          watermarkInput({
            eventType: 'gap_reconciled',
            eventKey: 'gmail:reconcile:500',
            expectedVersion: 2,
            previousCursor: '100',
            nextCursor: '500',
            resolvesEventId: '52',
          }),
        ),
      'gap_mismatch',
    );
  });

  it('resumes only after the exact gap receives complete reconciliation', async () => {
    const { client } = sequentialClient([
      queryResult([sourceRow()]),
      queryResult([
        stateRow({
          version: '2',
          status: 'gap',
          cursor_value: '100',
          cursor_observed_at: THROUGH,
          open_gap_event_id: '51',
          last_event_id: '51',
        }),
      ]),
      queryResult([]),
      queryResult([{ id: '52' }]),
      queryResult([
        stateRow({
          version: '3',
          status: 'current',
          cursor_value: '500',
          cursor_observed_at: THROUGH,
          open_gap_event_id: null,
          last_event_id: '52',
        }),
      ]),
    ]);

    const result = await recordCompanyTriggerWatermarkWithClient(
      client,
      watermarkInput({
        eventType: 'gap_reconciled',
        eventKey: 'gmail:reconcile:500',
        expectedVersion: 2,
        previousCursor: '100',
        nextCursor: '500',
        resolvesEventId: '51',
      }),
    );

    expect(result.state).toMatchObject({
      version: 3,
      status: 'current',
      cursorValue: '500',
      openGapEventId: null,
    });
  });

  it('refuses a registered source that has no bounded recovery contract', async () => {
    const { client, query } = sequentialClient([
      queryResult([sourceRow('none')]),
    ]);

    await expectSourceError(
      () => recordCompanyTriggerWatermarkWithClient(client, watermarkInput()),
      'not_reconcilable',
    );
    expect(query).toHaveBeenCalledTimes(1);
  });
});
