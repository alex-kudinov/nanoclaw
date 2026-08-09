import { describe, expect, it, vi } from 'vitest';

import {
  ingestCaleProcureRows,
  type QueryExecutor,
} from './procurement-intake.js';
import { CALEPROCURE_PLANNED_UNITS } from './procurement-source-config.js';

function result(rows: Record<string, unknown>[]) {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function evidenceFor(units: readonly string[]) {
  return Object.fromEntries(
    units.map((unit) => [unit, { resultCount: 0, pagesVisited: 1 }]),
  );
}

describe('CaleProcure source completeness', () => {
  it('accepts zero results as complete only with every planned unit observed', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(
        result([
          {
            run_id: 1,
            status: 'running',
            observations_seen: 0,
            observations_new: 0,
            missing_units: [...CALEPROCURE_PLANNED_UNITS],
          },
        ]),
      )
      .mockResolvedValueOnce(
        result([
          {
            run_id: 1,
            status: 'complete',
            observations_seen: 0,
            observations_new: 0,
            missing_units: [],
          },
        ]),
      );
    const db = { query } as QueryExecutor;

    const run = await ingestCaleProcureRows(
      [],
      'cale-zero-complete',
      '2026-08-09T20:00:00Z',
      db,
      {
        observedUnits: [...CALEPROCURE_PLANNED_UNITS],
        evidence: evidenceFor(CALEPROCURE_PLANNED_UNITS),
      },
    );
    expect(run.status).toBe('complete');
    expect(run.missingUnits).toEqual([]);
  });

  it('reports partial when any host-planned unit is missing', async () => {
    const missing = CALEPROCURE_PLANNED_UNITS.slice(1);
    const query = vi
      .fn()
      .mockResolvedValueOnce(
        result([
          {
            run_id: 2,
            status: 'running',
            observations_seen: 0,
            observations_new: 0,
            missing_units: [...CALEPROCURE_PLANNED_UNITS],
          },
        ]),
      )
      .mockResolvedValueOnce(
        result([
          {
            run_id: 2,
            status: 'partial',
            observations_seen: 0,
            observations_new: 0,
            missing_units: missing,
          },
        ]),
      );
    const db = { query } as QueryExecutor;

    const run = await ingestCaleProcureRows(
      [],
      'cale-zero-partial',
      '2026-08-09T20:00:00Z',
      db,
      {
        observedUnits: ['coaching'],
        evidence: evidenceFor(['coaching']),
      },
    );
    expect(run.status).toBe('partial');
    expect(run.missingUnits).toEqual(missing);
  });

  it('rejects model-supplied units outside the release-owned plan', async () => {
    const query = vi.fn();
    await expect(
      ingestCaleProcureRows(
        [],
        'cale-invented-unit',
        '2026-08-09T20:00:00Z',
        { query } as QueryExecutor,
        {
          observedUnits: ['whatever the model wants'],
          evidence: evidenceFor(['whatever the model wants']),
        },
      ),
    ).rejects.toThrow('not host-planned');
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects missing or malformed receipts before starting a run', async () => {
    const query = vi.fn();
    await expect(
      ingestCaleProcureRows(
        [],
        'cale-unreceipted-unit',
        '2026-08-09T20:00:00Z',
        { query } as QueryExecutor,
        { observedUnits: ['coaching'], evidence: {} },
      ),
    ).rejects.toThrow('exactly receipt');
    await expect(
      ingestCaleProcureRows(
        [],
        'cale-malformed-receipt',
        '2026-08-09T20:00:00Z',
        { query } as QueryExecutor,
        {
          observedUnits: ['coaching'],
          evidence: {
            coaching: { resultCount: -1, pagesVisited: 0 },
          },
        },
      ),
    ).rejects.toThrow('receipt is invalid');
    expect(query).not.toHaveBeenCalled();
  });
});
