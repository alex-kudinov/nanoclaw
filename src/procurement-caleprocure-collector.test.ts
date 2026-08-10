import { describe, expect, it, vi } from 'vitest';

import {
  CaleProcureCollectionError,
  collectCaleProcure,
  type CaleProcureBrowserPort,
  type CaleProcureSearchObservation,
} from './procurement-caleprocure-collector.js';

function fakePort(
  observations: Record<string, CaleProcureSearchObservation>,
): CaleProcureBrowserPort {
  return {
    open: async () => undefined,
    readBaseline: async () => ({ resultCount: 320, extractedRows: 320 }),
    readDepartmentDirectory: async () => [
      { businessUnit: '3820', name: 'SF Bay Conservation Commission' },
    ],
    search: async (keyword) => observations[keyword],
    readDetail: async (_businessUnit, eventId) => ({
      eventId,
      title: 'NOTICE OF INTENT TO AWARD',
      agency: 'SF Bay Conservation Commission',
    }),
    close: async () => undefined,
  };
}

function zero(keyword: string): CaleProcureSearchObservation {
  return {
    echoedQuery: keyword,
    resultEvidence: 'response',
    resultCount: 0,
    pagesVisited: 1,
    rows: [],
    elapsedMs: 10,
  };
}

describe('deterministic CaleProcure collector', () => {
  it('completes nine independently observed zero-result units', async () => {
    const units = Array.from({ length: 9 }, (_, index) => `unit-${index}`);
    const observations = Object.fromEntries(
      units.map((unit) => [unit, zero(unit)]),
    );
    const result = await collectCaleProcure(fakePort(observations), units);

    expect(result.rows).toEqual([]);
    expect(result.coverage.observedUnits).toEqual(units);
    expect(Object.keys(result.coverage.evidence)).toEqual(units);
    expect(result.diagnostics).toHaveLength(9);
  });

  it('verifies a positive row before emitting host-ingest input', async () => {
    const result = await collectCaleProcure(
      fakePort({
        facilitation: {
          echoedQuery: 'facilitation',
          resultEvidence: 'visible',
          resultCount: 1,
          pagesVisited: 1,
          elapsedMs: 120,
          rows: [
            {
              eventId: '0000039985',
              title: 'NOTICE OF INTENT TO AWARD',
              agency: 'SF Bay Conservation Commission',
              closeDate: '08/13/2026 3:00PM PDT',
            },
          ],
        },
      }),
      ['facilitation'],
    );

    expect(result.rows).toEqual([
      expect.objectContaining({
        event_id: '0000039985',
        business_unit: '3820',
        search_keyword: 'facilitation',
        url: 'https://caleprocure.ca.gov/event/3820/0000039985',
      }),
    ]);
    expect(result.diagnostics[0]).toEqual(
      expect.objectContaining({ resultEvidence: 'visible' }),
    );
  });

  it('isolates a count mismatch and continues later units', async () => {
    const result = await collectCaleProcure(
      fakePort({
        first: zero('first'),
        second: {
          ...zero('second'),
          resultCount: 1,
        },
        third: zero('third'),
      }),
      ['first', 'second', 'third'],
    );

    expect(result.coverage.observedUnits).toEqual(['first', 'third']);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ keyword: 'first', status: 'observed' }),
      expect.objectContaining({
        keyword: 'second',
        status: 'failed',
        resultCount: 1,
        extractedRows: 0,
        error: 'reconciliation_failed',
      }),
      expect.objectContaining({ keyword: 'third', status: 'observed' }),
    ]);
  });

  it('does not count an echoed-query mismatch as observed', async () => {
    await expect(
      collectCaleProcure(
        fakePort({ first: { ...zero('wrong'), echoedQuery: 'wrong' } }),
        ['first'],
      ),
    ).rejects.toSatisfy((error: unknown) => {
      const collectionError = error as CaleProcureCollectionError;
      expect(collectionError.partial.coverage.observedUnits).toEqual([]);
      return true;
    });
  });

  it('fails before planned units when the permanent baseline is empty', async () => {
    const port = fakePort({ first: zero('first') });
    port.readBaseline = async () => ({ resultCount: 0, extractedRows: 0 });
    await expect(collectCaleProcure(port, ['first'])).rejects.toThrow(
      'unfiltered baseline is empty',
    );
  });

  it('rejects an oversized unit before any detail navigation', async () => {
    const readDetail = vi.fn(async () => ({
      eventId: 'unused',
      title: 'unused',
      agency: 'SF Bay Conservation Commission',
    }));
    const port = fakePort({
      broad: {
        echoedQuery: 'broad',
        resultEvidence: 'visible',
        resultCount: 201,
        pagesVisited: 1,
        elapsedMs: 10,
        rows: Array.from({ length: 201 }, (_, index) => ({
          eventId: String(index),
          title: `Event ${index}`,
          agency: 'SF Bay Conservation Commission',
        })),
      },
    });
    port.readDetail = readDetail;

    const result = await collectCaleProcure(port, ['broad']);

    expect(readDetail).not.toHaveBeenCalled();
    expect(result.coverage.observedUnits).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        keyword: 'broad',
        status: 'failed',
        error: 'row_budget_exceeded',
      }),
    ]);
  });

  it('omits an identity-failed unit and continues later units', async () => {
    const result = await collectCaleProcure(
      fakePort({
        first: {
          echoedQuery: 'first',
          resultEvidence: 'visible',
          resultCount: 1,
          pagesVisited: 1,
          elapsedMs: 10,
          rows: [
            {
              eventId: 'bad',
              title: 'Unknown',
              agency: 'Unresolvable Agency',
            },
          ],
        },
        second: zero('second'),
      }),
      ['first', 'second'],
    );

    expect(result.coverage.observedUnits).toEqual(['second']);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        keyword: 'first',
        status: 'failed',
        error: 'identity_verification_failed',
      }),
      expect.objectContaining({ keyword: 'second', status: 'observed' }),
    ]);
  });

  it('closes the browser and preserves earlier coverage when aborted', async () => {
    const controller = new AbortController();
    const close = vi.fn(async () => undefined);
    const port = fakePort({ first: zero('first') });
    port.search = async () => new Promise(() => undefined);
    port.close = close;

    const collection = collectCaleProcure(port, ['first'], controller.signal);
    setTimeout(() => controller.abort(new Error('test internal deadline')), 0);

    await expect(collection).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(CaleProcureCollectionError);
      expect(
        (error as CaleProcureCollectionError).partial.coverage.observedUnits,
      ).toEqual([]);
      return true;
    });
    expect(close).toHaveBeenCalledOnce();
  });
});
