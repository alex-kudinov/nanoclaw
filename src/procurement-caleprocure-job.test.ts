import { describe, expect, it, vi } from 'vitest';

import type { CaleProcureBrowserPort } from './procurement-caleprocure-collector.js';
import {
  CaleProcureJobError,
  runCaleProcureJob,
} from './procurement-caleprocure-job.js';

describe('CaleProcure host job failure evidence', () => {
  it('writes one partial receipt and closes the port when collection aborts', async () => {
    const controller = new AbortController();
    const close = vi.fn(async () => undefined);
    const port: CaleProcureBrowserPort = {
      open: async () => undefined,
      readBaseline: async () => ({ resultCount: 320, extractedRows: 320 }),
      readDepartmentDirectory: async () => [
        { businessUnit: '3820', name: 'SF Bay Conservation Commission' },
      ],
      search: async () => new Promise(() => undefined),
      readDetail: async () => {
        throw new Error('not reached');
      },
      close,
    };
    const ingest = vi.fn(async () => ({
      runId: 77,
      status: 'partial' as const,
      observationsSeen: 0,
      observationsNew: 0,
      missingUnits: ['coaching'],
      opportunityIds: [],
    }));

    const run = runCaleProcureJob({
      shadow: false,
      port,
      signal: controller.signal,
      ingest,
      now: new Date('2026-08-10T00:00:00.000Z'),
    });
    setTimeout(() => controller.abort(new Error('test deadline')), 0);

    await expect(run).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(CaleProcureJobError);
      expect((error as CaleProcureJobError).partialSummary).toEqual(
        expect.objectContaining({ mode: 'partial' }),
      );
      return true;
    });
    expect(ingest).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
