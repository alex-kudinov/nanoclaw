import { describe, expect, it, vi } from 'vitest';
import type { Page } from 'playwright-core';

import {
  PlaywrightCaleProcureBrowserPort,
  isCaleProcureZeroResultResponse,
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
  it('accepts only an exact query-bound PeopleSoft no-results response', () => {
    const response = {
      CaptureResults: {
        eventName: [{ Properties: { value: 'coaching' } }],
        box_error_items: [
          {
            Properties: {
              text: '  No event met your search criteria  ',
            },
          },
        ],
      },
    };

    expect(isCaleProcureZeroResultResponse(response, 'coaching')).toBe(true);
    expect(isCaleProcureZeroResultResponse(response, 'facilitation')).toBe(
      false,
    );
    expect(
      isCaleProcureZeroResultResponse(
        {
          CaptureResults: {
            ...response.CaptureResults,
            box_error_items: [
              { Properties: { text: 'Search criteria are required' } },
            ],
          },
        },
        'coaching',
      ),
    ).toBe(false);
    expect(
      isCaleProcureZeroResultResponse(
        {
          CaptureResults: {
            ...response.CaptureResults,
            eventName: [
              { Properties: { value: 'coaching' } },
              { Properties: { value: 'coaching' } },
            ],
          },
        },
        'coaching',
      ),
    ).toBe(false);
    expect(isCaleProcureZeroResultResponse(null, 'coaching')).toBe(false);
  });

  it('closes owned pages and disconnects the CDP client', async () => {
    const browserClose = vi.fn(async () => undefined);
    const searchClose = vi.fn(async () => undefined);
    const detailClose = vi.fn(async () => undefined);
    const Port = PlaywrightCaleProcureBrowserPort as unknown as new (
      browser: { close(): Promise<void> },
      context: object,
      searchPage: { close(): Promise<void> },
      detailPage: { close(): Promise<void> },
      timeoutMs: number,
    ) => PlaywrightCaleProcureBrowserPort;
    const port = Reflect.construct(Port, [
      { close: browserClose },
      {},
      { close: searchClose },
      { close: detailClose },
      60_000,
    ]);

    await port.close();

    expect(searchClose).toHaveBeenCalledOnce();
    expect(detailClose).toHaveBeenCalledOnce();
    expect(browserClose).toHaveBeenCalledOnce();
  });

  it('does not hang when the CDP transport does not acknowledge close', async () => {
    vi.useFakeTimers();
    try {
      const browserClose = vi.fn(() => new Promise<void>(() => undefined));
      const Port = PlaywrightCaleProcureBrowserPort as unknown as new (
        browser: { close(): Promise<void> },
        context: object,
        searchPage: { close(): Promise<void> },
        detailPage: { close(): Promise<void> },
        timeoutMs: number,
      ) => PlaywrightCaleProcureBrowserPort;
      const port = Reflect.construct(Port, [
        { close: browserClose },
        {},
        { close: async () => undefined },
        { close: async () => undefined },
        60_000,
      ]);

      const closing = port.close();
      await vi.advanceTimersByTimeAsync(10_000);
      await closing;

      expect(browserClose).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

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
