import type { QueryResult, QueryResultRow } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import {
  COMPANY_TRIGGER_KINDS,
  CompanyTriggerError,
  classifyCompanyTriggerReplay,
  normalizeCompanyTrigger,
  recordCompanyTriggerWithClient,
  type CompanyTriggerClient,
} from './company-trigger.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const NOW = '2026-08-17T12:00:00.000Z';

function input(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    kind: 'time',
    sourceSystem: 'scheduled_task',
    sourceKey: 'task:daily-chief-brief',
    occurrenceKey: '2026-08-17T12:00:00.000Z',
    observedAt: NOW,
    payloadSha256: HASH_A,
    workRequest: {
      operation: 'create',
      workflowType: 'management_brief',
      sourceSystem: 'scheduled_task',
      sourceKey: 'task:daily-chief-brief:2026-08-17',
    },
    ...overrides,
  };
}

function queryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    command: 'SELECT',
    rowCount: rows.length,
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

async function expectTriggerError(
  run: () => unknown | Promise<unknown>,
  code: CompanyTriggerError['code'],
): Promise<void> {
  try {
    await run();
    throw new Error('expected CompanyTriggerError');
  } catch (error) {
    expect(error).toBeInstanceOf(CompanyTriggerError);
    expect((error as CompanyTriggerError).code).toBe(code);
  }
}

describe('Company OS normalized trigger contract', () => {
  it.each(COMPANY_TRIGGER_KINDS)(
    'normalizes a content-free %s occurrence',
    (kind) => {
      const occurrence = normalizeCompanyTrigger(
        input({
          kind,
          sourceSystem: kind,
          sourceKey: `${kind}:definition-1`,
          occurrenceKey: `${kind}:occurrence-1`,
        }),
      );

      expect(occurrence).toMatchObject({
        contractVersion: 1,
        kind,
        actionAuthority: 'none',
      });
      expect(occurrence.definitionId).toMatch(/^[0-9a-f]{64}$/);
      expect(occurrence.occurrenceId).toMatch(/^[0-9a-f]{64}$/);
      expect(occurrence.semanticFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(Object.isFrozen(occurrence)).toBe(true);
      expect(Object.isFrozen(occurrence.workRequest)).toBe(true);
      expect(Object.keys(occurrence).sort()).toEqual(
        [
          'actionAuthority',
          'contractVersion',
          'definitionId',
          'kind',
          'observedAt',
          'occurrenceId',
          'occurrenceKey',
          'payloadSha256',
          'semanticFingerprint',
          'sourceKey',
          'sourceSystem',
          'workRequest',
        ].sort(),
      );
    },
  );

  it('normalizes clocks and locks the v1 time-trigger identities', () => {
    const occurrence = normalizeCompanyTrigger(
      input({ observedAt: '2026-08-17T07:00:00-05:00' }),
    );

    expect(occurrence.observedAt).toBe(NOW);
    expect(occurrence.definitionId).toBe(
      'd4fe8aec80a5eb2f5bde901432253d27ad5cb6de8ae336d4926d420d0fc63f27',
    );
    expect(occurrence.occurrenceId).toBe(
      '0749a6d6e5876a53b7c6b51b4c295c2758a84c1e990e826078202fe5026c5cf2',
    );
    expect(occurrence.semanticFingerprint).toBe(
      'fbfa4dca1c7663bffd6ee8621f38b219a79b43333fbc08c07f48e9cfec3568f2',
    );
  });

  it('classifies exact replay, semantic conflict, and a new occurrence', () => {
    const existing = normalizeCompanyTrigger(input());
    const duplicate = normalizeCompanyTrigger(input());
    const conflict = normalizeCompanyTrigger(input({ payloadSha256: HASH_B }));
    const next = normalizeCompanyTrigger(
      input({ occurrenceKey: '2026-08-18T12:00:00.000Z' }),
    );

    expect(classifyCompanyTriggerReplay(existing, duplicate)).toBe('duplicate');
    expect(classifyCompanyTriggerReplay(existing, conflict)).toBe('conflict');
    expect(classifyCompanyTriggerReplay(existing, next)).toBe('new');
  });

  it.each([
    ['raw trigger payload', { rawPayload: { subject: 'secret' } }],
    ['authority request', { actionAuthority: 'send_email' }],
    ['skill selection', { skillVersion: 'mailman@2' }],
  ])('rejects an unsupported %s field', async (_name, extra) => {
    await expectTriggerError(
      () => normalizeCompanyTrigger(input(extra)),
      'invalid_input',
    );
  });

  it('rejects unknown fields inside the work request', async () => {
    await expectTriggerError(
      () =>
        normalizeCompanyTrigger(
          input({
            workRequest: {
              operation: 'create',
              workflowType: 'management_brief',
              sourceSystem: 'scheduled_task',
              sourceKey: 'work:1',
              prompt: 'do the work',
            },
          }),
        ),
      'invalid_input',
    );
  });

  it.each([
    ['kind', 'schedule'],
    ['sourceSystem', 'Gmail Primary'],
    ['sourceKey', ''],
    ['occurrenceKey', 'contains whitespace'],
    ['observedAt', 'not-a-time'],
    ['observedAt', '2026-08-17'],
    ['observedAt', '2026-02-31T12:00:00Z'],
    ['payloadSha256', 'abc123'],
  ])('rejects invalid %s', async (field, value) => {
    await expectTriggerError(
      () => normalizeCompanyTrigger(input({ [field]: value })),
      'invalid_input',
    );
  });

  it('rejects malformed work intent', async () => {
    await expectTriggerError(
      () =>
        normalizeCompanyTrigger(
          input({
            workRequest: {
              operation: 'execute',
              workflowType: 'Management Brief',
              sourceSystem: 'scheduled_task',
              sourceKey: 'work:1',
            },
          }),
        ),
      'invalid_input',
    );
  });
});

describe('Company OS trigger occurrence store', () => {
  it('records a new normalized occurrence without raw payload columns', async () => {
    const { client, query } = sequentialClient([queryResult([{ id: '41' }])]);

    const result = await recordCompanyTriggerWithClient(client, input());

    expect(result).toMatchObject({ applied: true, duplicate: false });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain(
      'INSERT INTO business_v2.company_trigger_occurrences',
    );
    expect(query.mock.calls[0][0]).not.toMatch(
      /raw_|payload_json|content|subject|body|prompt/i,
    );
    expect(query.mock.calls[0][1]).toHaveLength(14);
  });

  it('converges an exact durable replay', async () => {
    const occurrence = normalizeCompanyTrigger(input());
    const { client, query } = sequentialClient([
      queryResult([]),
      queryResult([
        {
          occurrence_id: occurrence.occurrenceId,
          semantic_fingerprint: occurrence.semanticFingerprint,
        },
      ]),
    ]);

    const result = await recordCompanyTriggerWithClient(client, input());

    expect(result).toMatchObject({ applied: false, duplicate: true });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('fails closed when an occurrence identity has different facts', async () => {
    const occurrence = normalizeCompanyTrigger(input());
    const { client } = sequentialClient([
      queryResult([]),
      queryResult([
        {
          occurrence_id: occurrence.occurrenceId,
          semantic_fingerprint: HASH_B,
        },
      ]),
    ]);

    await expectTriggerError(
      () => recordCompanyTriggerWithClient(client, input()),
      'conflict',
    );
  });

  it('fails closed when occurrence and source identities resolve separately', async () => {
    const occurrence = normalizeCompanyTrigger(input());
    const { client } = sequentialClient([
      queryResult([]),
      queryResult([
        {
          occurrence_id: occurrence.occurrenceId,
          semantic_fingerprint: occurrence.semanticFingerprint,
        },
        {
          occurrence_id: HASH_B,
          semantic_fingerprint: occurrence.semanticFingerprint,
        },
      ]),
    ]);

    await expectTriggerError(
      () => recordCompanyTriggerWithClient(client, input()),
      'conflict',
    );
  });
});
