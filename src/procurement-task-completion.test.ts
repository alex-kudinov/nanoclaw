import { describe, expect, it, vi } from 'vitest';

import {
  requiresProcurementSourceReceipt,
  validateProcurementTaskCompletion,
  type ProcurementTaskCompletionExecutor,
} from './procurement-task-completion.js';
import {
  CALEPROCURE_ADAPTER_VERSION,
  CALEPROCURE_PLANNED_UNITS,
} from './procurement-source-config.js';
import { procurementRunToken } from './procurement-task-run.js';
import type { ScheduledTask } from './types.js';

const task = (overrides: Partial<ScheduledTask> = {}): ScheduledTask => ({
  id: 'task-1',
  group_folder: 'procurement',
  chat_jid: 'procurement@example.test',
  prompt: 'rescan caleprocure',
  schedule_type: 'once',
  schedule_value: '',
  context_mode: 'isolated',
  next_run: null,
  last_run: null,
  last_result: null,
  status: 'active',
  created_at: '2026-08-09T00:00:00.000Z',
  ...overrides,
});

const executor = (rows: Record<string, unknown>[]) =>
  ({
    query: vi.fn().mockResolvedValue({ rows }),
  }) as unknown as ProcurementTaskCompletionExecutor;

describe('Procurement task completion receipts', () => {
  it('requires receipts for every CaleProcure scan prompt and fails closed on scan-shaped drift', () => {
    expect(requiresProcurementSourceReceipt(task())).toBe(true);
    expect(
      requiresProcurementSourceReceipt(
        task({ prompt: 'Run daily procurement scan' }),
      ),
    ).toBe(true);
    expect(requiresProcurementSourceReceipt(task({ prompt: 'rescan' }))).toBe(
      true,
    );
    expect(
      requiresProcurementSourceReceipt(task({ prompt: 'please scan now' })),
    ).toBe(true);
    expect(
      requiresProcurementSourceReceipt(task({ prompt: 'rescan bonfire' })),
    ).toBe(false);
    expect(requiresProcurementSourceReceipt(task({ prompt: 'queue' }))).toBe(
      false,
    );
    expect(
      requiresProcurementSourceReceipt(task({ group_folder: 'sales' })),
    ).toBe(false);
  });

  it('rejects a model-complete scan with no host source-run receipt', async () => {
    await expect(
      validateProcurementTaskCompletion(
        task(),
        Date.parse('2026-08-09T22:00:00.000Z'),
        executor([]),
      ),
    ).rejects.toThrow('no host source-run receipt');
  });

  it('rejects partial or structurally incomplete coverage', async () => {
    await expect(
      validateProcurementTaskCompletion(
        task(),
        Date.parse('2026-08-09T22:00:00.000Z'),
        executor([
          {
            id: 9,
            status: 'partial',
            planned_count: 9,
            observed_count: 8,
            missing_count: 1,
            adapter_matches: true,
            planned_units_match: true,
          },
        ]),
      ),
    ).rejects.toThrow('not complete with full planned coverage');
  });

  it('accepts only a complete receipt covering every planned unit', async () => {
    const db = executor([
      {
        id: 10,
        status: 'complete',
        planned_count: 9,
        observed_count: 9,
        missing_count: 0,
        adapter_matches: true,
        planned_units_match: true,
      },
    ]);
    await expect(
      validateProcurementTaskCompletion(
        task(),
        Date.parse('2026-08-09T22:00:00.000Z'),
        db,
      ),
    ).resolves.toBeUndefined();
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('run_key = $1'),
      [
        procurementRunToken('task-1', Date.parse('2026-08-09T22:00:00.000Z')),
        '2026-08-09T22:00:00.000Z',
        CALEPROCURE_ADAPTER_VERSION,
        [...CALEPROCURE_PLANNED_UNITS],
      ],
    );
  });

  it('rejects an internally complete run that does not match the release contract', async () => {
    await expect(
      validateProcurementTaskCompletion(
        task(),
        Date.parse('2026-08-09T22:00:00.000Z'),
        executor([
          {
            id: 11,
            status: 'complete',
            planned_count: 1,
            observed_count: 1,
            missing_count: 0,
            adapter_matches: true,
            planned_units_match: false,
          },
        ]),
      ),
    ).rejects.toThrow('not complete with full planned coverage');

    await expect(
      validateProcurementTaskCompletion(
        task(),
        Date.parse('2026-08-09T22:00:00.000Z'),
        executor([
          {
            id: 12,
            status: 'complete',
            planned_count: 9,
            observed_count: 9,
            missing_count: 0,
            adapter_matches: false,
            planned_units_match: true,
          },
        ]),
      ),
    ).rejects.toThrow('not complete with full planned coverage');
  });
});
