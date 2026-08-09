import fixture from './fixtures/caleprocure-results.json' with { type: 'json' };
import { describe, expect, it, vi } from 'vitest';

import {
  ingestCaleProcureRows,
  ingestEmailProcurementObservation,
  ingestProcurementObservation,
  normalizeCaleProcureRows,
  normalizeProcurementDate,
  transitionProcurementReview,
  type QueryExecutor,
} from './procurement-intake.js';
import { CALEPROCURE_PLANNED_UNITS } from './procurement-source-config.js';

function executorWithRows(rows: Record<string, unknown>[]): QueryExecutor {
  const query = vi.fn(async () => ({
    rows,
    rowCount: rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  }));
  return {
    query: query as unknown as QueryExecutor['query'],
  };
}

function evidenceFor(units: readonly string[]) {
  return Object.fromEntries(
    units.map((unit) => [unit, { resultCount: 0, pagesVisited: 1 }]),
  );
}

describe('CaleProcure normalization', () => {
  it('normalizes dates and deduplicates one event found by two keywords', () => {
    const rows = normalizeCaleProcureRows(fixture, '2026-07-30T17:00:00.000Z');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        source: 'caleprocure',
        sourceKey: '3900/0000042001',
        closeDate: '2026-08-21',
        searchKeywords: ['executive coaching', 'leadership development'],
        observedAt: '2026-07-30T17:00:00.000Z',
      }),
    );
    expect(rows[1].closeDate).toBe('2026-09-04');
  });

  it('accepts ISO and US dates but rejects rollover dates', () => {
    expect(normalizeProcurementDate('2026-08-21')).toBe('2026-08-21');
    expect(normalizeProcurementDate('8/21/2026 2:00 PM')).toBe('2026-08-21');
    expect(() => normalizeProcurementDate('02/30/2026')).toThrow(
      'unsupported or invalid',
    );
  });

  it('rejects non-CaleProcure URLs and conflicting duplicate rows', () => {
    expect(() =>
      normalizeCaleProcureRows([
        {
          ...fixture[0],
          url: 'https://evil.example/event/3900/0000042001',
        },
      ]),
    ).toThrow('must use https://caleprocure.ca.gov');

    expect(() =>
      normalizeCaleProcureRows([
        fixture[0],
        { ...fixture[0], title: 'Conflicting title' },
      ]),
    ).toThrow('conflicting CaleProcure rows');
  });

  it('rejects unknown row fields instead of silently changing the contract', () => {
    expect(() =>
      normalizeCaleProcureRows([{ ...fixture[0], surprise: 'drift' }]),
    ).toThrow();
  });
});

describe('Procurement database boundary', () => {
  it('uses parameters for untrusted observation content', async () => {
    const db = executorWithRows([
      {
        opportunity_id: 42,
        observation_created: true,
        opportunity_created: true,
        review_state: 'unreviewed',
        review_version: 0,
      },
    ]);
    const title = `Leadership RFP'); DROP TABLE public.procurement_opportunities; --`;

    const result = await ingestProcurementObservation(
      {
        source: 'caleprocure',
        sourceKey: '3900/0000042001',
        title,
        searchKeywords: ['leadership development'],
        observedAt: '2026-07-30T17:00:00.000Z',
        rawPayload: { title },
      },
      db,
    );

    expect(result.opportunityId).toBe(42);
    const [sql, params] = vi.mocked(db.query).mock.calls[0];
    expect(sql).not.toContain(title);
    expect(params).toContain(title);
    expect(sql).toContain('fn_record_procurement_observation');
  });

  it('stores email routing metadata without accepting an email body', async () => {
    const db = executorWithRows([
      {
        opportunity_id: 77,
        observation_created: true,
        opportunity_created: true,
        review_state: 'unreviewed',
        review_version: 0,
      },
    ]);

    await ingestEmailProcurementObservation(
      {
        label: 'procurement/rfp',
        senderEmail: 'buyer@example.gov',
        senderName: 'Example Buyer',
        subject: 'RFP for coaching',
        messageId: 'gmail-message-1',
        threadId: 'gmail-thread-1',
        observedAt: '2026-07-30T17:00:00.000Z',
      },
      db,
    );

    const [, params] = vi.mocked(db.query).mock.calls[0];
    expect(params).toContain('gmail-message-1');
    expect(params).toContain('gmail-thread-1');
    expect(JSON.stringify(params)).not.toContain('email body');
  });

  it('records run completion from the database answers', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            run_id: 8,
            status: 'running',
            observations_seen: 0,
            observations_new: 0,
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            opportunity_id: 41,
            observation_created: true,
            opportunity_created: true,
            review_state: 'unreviewed',
            review_version: 0,
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [{ fn_link_procurement_run_opportunity: true }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            opportunity_id: 42,
            observation_created: false,
            opportunity_created: false,
            review_state: 'unreviewed',
            review_version: 0,
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [{ fn_link_procurement_run_opportunity: true }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            run_id: 8,
            status: 'complete',
            observations_seen: 2,
            observations_new: 1,
            missing_units: [],
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });
    const db = { query } as QueryExecutor;

    const result = await ingestCaleProcureRows(
      fixture,
      'cale-2026-07-30T17:00Z',
      '2026-07-30T17:00:00.000Z',
      db,
      {
        observedUnits: [...CALEPROCURE_PLANNED_UNITS],
        evidence: evidenceFor(CALEPROCURE_PLANNED_UNITS),
      },
    );

    expect(result).toEqual({
      runId: 8,
      status: 'complete',
      observationsSeen: 2,
      observationsNew: 1,
      opportunityIds: [41, 42],
      missingUnits: [],
    });
    expect(query.mock.calls.at(-1)?.[1]).toEqual([
      8,
      expect.any(String),
      JSON.stringify([...CALEPROCURE_PLANNED_UNITS].sort()),
      JSON.stringify(evidenceFor([...CALEPROCURE_PLANNED_UNITS].sort())),
      2,
      1,
      null,
    ]);
  });

  it('returns the prior result for an idempotent completed run', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            run_id: 8,
            status: 'complete',
            observations_seen: 2,
            observations_new: 1,
            missing_units: [],
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [{ opportunity_id: 41 }, { opportunity_id: 42 }],
        rowCount: 2,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });
    const db = { query } as QueryExecutor;

    await expect(
      ingestCaleProcureRows(
        fixture,
        'cale-2026-07-30T17:00Z',
        '2026-07-30T17:00:00.000Z',
        db,
        {
          observedUnits: [...CALEPROCURE_PLANNED_UNITS],
          evidence: evidenceFor(CALEPROCURE_PLANNED_UNITS),
        },
      ),
    ).resolves.toEqual({
      runId: 8,
      status: 'complete',
      observationsSeen: 2,
      observationsNew: 1,
      opportunityIds: [41, 42],
      missingUnits: [],
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('fn_record_procurement_observation'),
      ),
    ).toBe(false);
  });

  it('marks a begun run failed when row normalization detects drift', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            run_id: 9,
            status: 'running',
            observations_seen: 0,
            observations_new: 0,
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            run_id: 9,
            status: 'failed',
            observations_seen: 0,
            observations_new: 0,
            missing_units: ['coaching'],
          },
        ],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      });
    const db = { query } as QueryExecutor;

    await expect(
      ingestCaleProcureRows(
        [{ ...fixture[0], unexpected: 'schema drift' }],
        'cale-drift-1',
        '2026-07-30T17:00:00.000Z',
        db,
        {
          observedUnits: ['executive coaching'],
          evidence: evidenceFor(['executive coaching']),
        },
      ),
    ).rejects.toThrow();
    expect(query.mock.calls.at(-1)?.[1]).toEqual([
      9,
      expect.any(String),
      '["executive coaching"]',
      JSON.stringify(evidenceFor(['executive coaching'])),
      0,
      0,
      'adapter_zoderror',
    ]);
  });

  it('uses optimistic typed review transitions for host repair decisions', async () => {
    const db = executorWithRows([
      {
        opportunity_id: 42,
        review_state: 'needs_info',
        review_version: 3,
        status: 'new',
      },
    ]);

    const result = await transitionProcurementReview(
      {
        opportunityId: 42,
        expectedVersion: 2,
        decision: 'needs_info',
        reason: 'Deadline evidence is missing',
        owner: 'operator@example.com',
      },
      db,
    );

    expect(result).toEqual({
      opportunityId: 42,
      reviewState: 'needs_info',
      reviewVersion: 3,
      status: 'new',
    });
    expect(vi.mocked(db.query).mock.calls[0][1]).toEqual([
      42,
      2,
      'needs_info',
      'Deadline evidence is missing',
      'operator@example.com',
    ]);
  });

  it('requires the bound-card path for every process decision', async () => {
    const query = vi.fn();
    await expect(
      transitionProcurementReview(
        {
          opportunityId: 42,
          expectedVersion: 0,
          decision: 'process',
          reason: 'Looks relevant',
          owner: 'operator@example.com',
        },
        { query } as QueryExecutor,
      ),
    ).rejects.toThrow('bound Slack review card');
    expect(query).not.toHaveBeenCalled();
  });
});
