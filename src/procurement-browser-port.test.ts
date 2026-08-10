import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';

import {
  parseCaleProcureResultCells,
  parseCaleProcureResultTotal,
  validatedLoopbackCdpUrl,
  waitForCaleProcureResultStateCleared,
} from './procurement-browser-port.js';

function resultStatePage(options: { clearsAfterWait: boolean }): Page {
  let cleared = false;
  const locator = (kind: 'summary' | 'empty' | 'grid') => ({
    filter: () => locator(kind),
    count: async () => (cleared ? 0 : kind === 'empty' ? 0 : 1),
  });
  return {
    getByText: (value: string | RegExp) =>
      locator(typeof value === 'string' ? 'empty' : 'summary'),
    locator: () => locator('grid'),
    waitForTimeout: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      if (options.clearsAfterWait) cleared = true;
    },
  } as unknown as Page;
}

describe('CaleProcure browser contract parsers', () => {
  it('accepts duplicate visible summaries only when they agree', () => {
    expect(
      parseCaleProcureResultTotal(
        ['Showing Results 1-320 of 320', 'Showing Results 1-320 of 320'],
        false,
      ),
    ).toBe(320);
    expect(() =>
      parseCaleProcureResultTotal(
        ['Showing Results 1 of 1', 'Showing Results 1-320 of 320'],
        false,
      ),
    ).toThrow('ambiguous');
    expect(() =>
      parseCaleProcureResultTotal(['Showing Results 1 of 1'], true),
    ).toThrow('both results and no-results');
    expect(parseCaleProcureResultTotal([], true)).toBe(0);
  });

  it('parses the six visible result cells and rejects incomplete identity', () => {
    expect(
      parseCaleProcureResultCells(
        [
          '\u00a0',
          '0000039985',
          ' NOTICE OF   INTENT TO AWARD ',
          'SF Bay Conservation Commission',
          '08/13/2026\n3:00PM PDT',
          'Posted',
        ],
        1,
      ),
    ).toEqual({
      eventId: '0000039985',
      title: 'NOTICE OF INTENT TO AWARD',
      agency: 'SF Bay Conservation Commission',
      closeDate: '08/13/2026 3:00PM PDT',
    });
    expect(
      parseCaleProcureResultCells(['responsive', 'duplicate'], 1),
    ).toBeNull();
    expect(() =>
      parseCaleProcureResultCells(['', '', 'Title', 'Agency', '', 'Posted'], 2),
    ).toThrow('row 2 is incomplete');
  });

  it('allows loopback CDP only and rejects the old container bridge', () => {
    expect(validatedLoopbackCdpUrl('http://127.0.0.1:9250')).toBe(
      'http://127.0.0.1:9250',
    );
    expect(() => validatedLoopbackCdpUrl('http://localhost:9250/')).toThrow(
      'loopback',
    );
    expect(() => validatedLoopbackCdpUrl('http://192.168.64.1:9250')).toThrow(
      'loopback',
    );
    expect(() => validatedLoopbackCdpUrl('https://127.0.0.1:9250')).toThrow(
      'loopback',
    );
  });

  it('requires the prior visible result state to disappear after Clear Criteria', async () => {
    await expect(
      waitForCaleProcureResultStateCleared(
        resultStatePage({ clearsAfterWait: true }),
        50,
      ),
    ).resolves.toBeUndefined();

    await expect(
      waitForCaleProcureResultStateCleared(
        resultStatePage({ clearsAfterWait: false }),
        5,
      ),
    ).rejects.toThrow('prior result state did not clear');
  });
});
