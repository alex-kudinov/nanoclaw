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

function resultStatePage(options: {
  clearsAfterWait: boolean;
  persistentEmpty?: boolean;
}): Page {
  let cleared = false;
  const locator = (kind: 'summary' | 'empty' | 'grid') => ({
    filter: () => locator(kind),
    count: async () => {
      if (kind === 'empty') return options.persistentEmpty ? 1 : 0;
      return cleared ? 0 : 1;
    },
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

function zeroResultSearchPage(
  options: {
    emitTerminal?: boolean;
    visibleAfterSearch?: 'none' | 'empty' | 'results';
    persistEmptyAfterClear?: boolean;
  } = {},
): {
  page: Page;
  rejectedJson: ReturnType<typeof vi.fn>;
  responseListenerCount: () => number;
} {
  let inputValue = '';
  let priorResultsVisible = true;
  let afterSearchState: 'none' | 'empty' | 'results' = 'none';
  let emptyMarkerVisible = false;
  const listeners = new Set<(response: unknown) => void>();
  const rejectedJson = vi.fn(async () => {
    throw new Error('must not parse');
  });
  const response = (payload: unknown) => ({
    url: () =>
      'https://caleprocure.ca.gov/nlx3/psc/psfpd1/SUPPLIER/ERP/c/AUC_MANAGE_BIDS.AUC_RESP_INQ_AUC.GBL',
    request: () => ({ method: () => 'POST' }),
    status: () => 200,
    headers: () => ({ 'content-type': 'application/json; charset=UTF-8' }),
    json: async () => payload,
  });
  const terminal = () => ({
    CaptureResults: {
      eventName: [{ Properties: { value: inputValue } }],
      box_error_items: [
        {
          Properties: {
            text: 'No event met your search criteria. Please change your search criteria and try again',
          },
        },
      ],
    },
  });
  const locator = (
    kind: 'busy' | 'clear' | 'input' | 'search' | 'summary' | 'empty' | 'grid',
  ) => ({
    filter: () => locator(kind),
    count: async () => {
      if (kind === 'summary' || kind === 'grid') {
        return priorResultsVisible || afterSearchState === 'results' ? 1 : 0;
      }
      if (kind === 'empty') return emptyMarkerVisible ? 1 : 0;
      if (kind === 'busy') return 0;
      return 1;
    },
    waitFor: async () => undefined,
    click: async () => {
      if (kind === 'clear') {
        inputValue = '';
        priorResultsVisible = false;
        afterSearchState = 'none';
        if (!options.persistEmptyAfterClear) emptyMarkerVisible = false;
      }
      if (kind === 'search') {
        const rejected = {
          ...response({}),
          status: () => 500,
          headers: () => ({ 'content-type': 'text/html' }),
          json: rejectedJson,
        };
        const advisory = {
          CaptureResults: {
            eventName: [{ Properties: { value: inputValue } }],
            box_error_items: [{ Properties: {} }],
          },
        };
        for (const listener of listeners) listener(rejected);
        for (const listener of listeners) listener(response(advisory));
        if (options.emitTerminal !== false) {
          for (const listener of listeners) listener(response(terminal()));
        }
        afterSearchState = options.visibleAfterSearch ?? 'none';
        if (afterSearchState === 'empty') emptyMarkerVisible = true;
      }
    },
    fill: async (value: string) => {
      inputValue = value;
    },
    inputValue: async () => inputValue,
    allInnerTexts: async () =>
      afterSearchState === 'results' ? ['Showing Results 1 of 1'] : [],
  });
  return {
    page: {
      locator: (selector: string) => {
        if (selector.startsWith('#AUC_PREF_WK_AUC_PREF_CLEAR_PB')) {
          return locator('clear');
        }
        if (selector.startsWith('#RESP_INQA_WK_ZZ_AUC_NAME')) {
          return locator('input');
        }
        if (selector.startsWith('#RESP_INQA_WK_INQ_AUC_GO_PB')) {
          return locator('search');
        }
        return locator('grid');
      },
      getByRole: () => locator('busy'),
      getByText: (value: string | RegExp) =>
        locator(typeof value === 'string' ? 'empty' : 'summary'),
      waitForTimeout: async () => undefined,
      on: (event: string, listener: (response: unknown) => void) => {
        if (event === 'response') listeners.add(listener);
      },
      off: (event: string, listener: (response: unknown) => void) => {
        if (event === 'response') listeners.delete(listener);
      },
    } as unknown as Page,
    rejectedJson,
    responseListenerCount: () => listeners.size,
  };
}

function positiveResultSearchPage(
  options: { staleEmpty?: boolean } = {},
): Page {
  let inputValue = '';
  let priorResultsVisible = true;
  let positiveResultsVisible = false;
  let emptyMarkerVisible = options.staleEmpty ?? false;
  const listeners = new Set<(response: unknown) => void>();
  const cells = {
    allInnerTexts: async () => [
      '',
      '0000039985',
      'Facilitation Services',
      'SF Bay Conservation Commission',
      '08/13/2026 3:00PM PDT',
      'Posted',
    ],
  };
  const rows = {
    count: async () => (positiveResultsVisible ? 1 : 0),
    nth: () => ({ locator: () => cells }),
  };
  const locator = (
    kind: 'busy' | 'clear' | 'input' | 'search' | 'summary' | 'empty' | 'grid',
  ) => ({
    filter: () => locator(kind),
    count: async () => {
      if (kind === 'summary' || kind === 'grid') {
        return priorResultsVisible || positiveResultsVisible ? 1 : 0;
      }
      if (kind === 'empty') return emptyMarkerVisible ? 1 : 0;
      if (kind === 'busy') return 0;
      return 1;
    },
    waitFor: async () => undefined,
    click: async () => {
      if (kind === 'clear') {
        priorResultsVisible = false;
        positiveResultsVisible = false;
        emptyMarkerVisible = options.staleEmpty ?? false;
      }
      if (kind === 'search') {
        for (const listener of listeners) {
          listener({
            url: () =>
              'https://caleprocure.ca.gov/nlx3/psc/psfpd1/SUPPLIER/ERP/c/AUC_MANAGE_BIDS.AUC_RESP_INQ_AUC.GBL',
            request: () => ({ method: () => 'POST' }),
            status: () => 200,
            headers: () => ({ 'content-type': 'application/json' }),
            json: async () => ({
              CaptureResults: {
                eventName: [{ Properties: { value: 'coaching' } }],
                box_error_items: [
                  {
                    Properties: {
                      text: 'No event met your search criteria. Please change your search criteria and try again',
                    },
                  },
                ],
              },
            }),
          });
        }
        positiveResultsVisible = true;
      }
    },
    fill: async (value: string) => {
      inputValue = value;
    },
    inputValue: async () => inputValue,
    allInnerTexts: async () =>
      positiveResultsVisible ? ['Showing Results 1 of 1'] : [],
    locator: () => rows,
  });
  return {
    locator: (selector: string) => {
      if (selector.startsWith('#AUC_PREF_WK_AUC_PREF_CLEAR_PB')) {
        return locator('clear');
      }
      if (selector.startsWith('#RESP_INQA_WK_ZZ_AUC_NAME')) {
        return locator('input');
      }
      if (selector.startsWith('#RESP_INQA_WK_INQ_AUC_GO_PB')) {
        return locator('search');
      }
      return locator('grid');
    },
    getByRole: () => locator('busy'),
    getByText: (value: string | RegExp) =>
      locator(typeof value === 'string' ? 'empty' : 'summary'),
    waitForTimeout: async () => undefined,
    on: (event: string, listener: (response: unknown) => void) => {
      if (event === 'response') listeners.add(listener);
    },
    off: (event: string, listener: (response: unknown) => void) => {
      if (event === 'response') listeners.delete(listener);
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
              text: '  No event met your search criteria. Please change your search criteria and try again  ',
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

  it('search accepts only the terminal query-bound zero response and removes its listener', async () => {
    const fake = zeroResultSearchPage();
    const Port = PlaywrightCaleProcureBrowserPort as unknown as new (
      browser: object,
      context: object,
      searchPage: Page,
      detailPage: object,
      timeoutMs: number,
    ) => PlaywrightCaleProcureBrowserPort;
    const port = Reflect.construct(Port, [{}, {}, fake.page, {}, 5_000]);

    await expect(port.search('coaching')).resolves.toEqual({
      echoedQuery: 'coaching',
      resultEvidence: 'response',
      visibleEmptyMarker: false,
      resultCount: 0,
      pagesVisited: 1,
      rows: [],
      elapsedMs: expect.any(Number),
    });
    expect(fake.rejectedJson).not.toHaveBeenCalled();
    expect(fake.responseListenerCount()).toBe(0);
  });

  it('search ignores another keyword zero and uses the reconciled visible row', async () => {
    const Port = PlaywrightCaleProcureBrowserPort as unknown as new (
      browser: object,
      context: object,
      searchPage: Page,
      detailPage: object,
      timeoutMs: number,
    ) => PlaywrightCaleProcureBrowserPort;
    const port = Reflect.construct(Port, [
      {},
      {},
      positiveResultSearchPage(),
      {},
      5_000,
    ]);

    await expect(port.search('facilitation')).resolves.toEqual({
      echoedQuery: 'facilitation',
      resultEvidence: 'visible',
      visibleEmptyMarker: false,
      resultCount: 1,
      pagesVisited: 1,
      rows: [
        {
          eventId: '0000039985',
          title: 'Facilitation Services',
          agency: 'SF Bay Conservation Commission',
          closeDate: '08/13/2026 3:00PM PDT',
        },
      ],
      elapsedMs: expect.any(Number),
    });
  });

  it('search requires response provenance even when a current zero marker is visible', async () => {
    const fake = zeroResultSearchPage({ visibleAfterSearch: 'empty' });
    const Port = PlaywrightCaleProcureBrowserPort as unknown as new (
      browser: object,
      context: object,
      searchPage: Page,
      detailPage: object,
      timeoutMs: number,
    ) => PlaywrightCaleProcureBrowserPort;
    const port = Reflect.construct(Port, [{}, {}, fake.page, {}, 5_000]);

    await expect(port.search('coaching')).resolves.toEqual({
      echoedQuery: 'coaching',
      resultEvidence: 'response',
      visibleEmptyMarker: true,
      resultCount: 0,
      pagesVisited: 1,
      rows: [],
      elapsedMs: expect.any(Number),
    });
  });

  it('search rejects a response zero that contradicts visible results', async () => {
    const fake = zeroResultSearchPage({ visibleAfterSearch: 'results' });
    const Port = PlaywrightCaleProcureBrowserPort as unknown as new (
      browser: object,
      context: object,
      searchPage: Page,
      detailPage: object,
      timeoutMs: number,
    ) => PlaywrightCaleProcureBrowserPort;
    const port = Reflect.construct(Port, [{}, {}, fake.page, {}, 5_000]);

    await expect(port.search('coaching')).rejects.toThrow(
      'response proves no results but the page shows results',
    );
    expect(fake.responseListenerCount()).toBe(0);
  });

  it('search times out fail-closed when neither evidence path appears', async () => {
    const fake = zeroResultSearchPage({ emitTerminal: false });
    const Port = PlaywrightCaleProcureBrowserPort as unknown as new (
      browser: object,
      context: object,
      searchPage: Page,
      detailPage: object,
      timeoutMs: number,
    ) => PlaywrightCaleProcureBrowserPort;
    const port = Reflect.construct(Port, [{}, {}, fake.page, {}, 50]);

    await expect(port.search('coaching')).rejects.toThrow(
      'result state did not appear before timeout',
    );
    expect(fake.responseListenerCount()).toBe(0);
  });

  it('does not accept a visible zero marker without a query-bound response', async () => {
    const fake = zeroResultSearchPage({
      emitTerminal: false,
      visibleAfterSearch: 'empty',
      persistEmptyAfterClear: true,
    });
    const Port = PlaywrightCaleProcureBrowserPort as unknown as new (
      browser: object,
      context: object,
      searchPage: Page,
      detailPage: object,
      timeoutMs: number,
    ) => PlaywrightCaleProcureBrowserPort;
    const port = Reflect.construct(Port, [{}, {}, fake.page, {}, 50]);

    await expect(port.search('leadership development')).rejects.toThrow(
      'result state did not appear before timeout',
    );
  });

  it('reconciles a positive result while a stale zero marker remains visible', async () => {
    const Port = PlaywrightCaleProcureBrowserPort as unknown as new (
      browser: object,
      context: object,
      searchPage: Page,
      detailPage: object,
      timeoutMs: number,
    ) => PlaywrightCaleProcureBrowserPort;
    const port = Reflect.construct(Port, [
      {},
      {},
      positiveResultSearchPage({ staleEmpty: true }),
      {},
      5_000,
    ]);

    await expect(port.search('facilitation')).resolves.toMatchObject({
      resultEvidence: 'visible',
      visibleEmptyMarker: true,
      resultCount: 1,
      rows: [{ eventId: '0000039985' }],
    });
  });

  it('uses query-bound response provenance for consecutive zero searches', async () => {
    const fake = zeroResultSearchPage({
      visibleAfterSearch: 'empty',
      persistEmptyAfterClear: true,
    });
    const Port = PlaywrightCaleProcureBrowserPort as unknown as new (
      browser: object,
      context: object,
      searchPage: Page,
      detailPage: object,
      timeoutMs: number,
    ) => PlaywrightCaleProcureBrowserPort;
    const port = Reflect.construct(Port, [{}, {}, fake.page, {}, 5_000]);

    await expect(port.search('coaching')).resolves.toMatchObject({
      resultEvidence: 'response',
      resultCount: 0,
    });
    await expect(port.search('leadership development')).resolves.toMatchObject({
      echoedQuery: 'leadership development',
      resultEvidence: 'response',
      visibleEmptyMarker: true,
      resultCount: 0,
      rows: [],
    });
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
      parseCaleProcureResultTotal([
        'Showing Results 1-320 of 320',
        'Showing Results 1-320 of 320',
      ]),
    ).toBe(320);
    expect(() =>
      parseCaleProcureResultTotal([
        'Showing Results 1 of 1',
        'Showing Results 1-320 of 320',
      ]),
    ).toThrow('ambiguous');
    expect(() => parseCaleProcureResultTotal([])).toThrow('ambiguous');
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

  it('treats a persistent empty marker as non-authoritative clear-state residue', async () => {
    await expect(
      waitForCaleProcureResultStateCleared(
        resultStatePage({
          clearsAfterWait: true,
          persistentEmpty: true,
        }),
        50,
      ),
    ).resolves.toBeUndefined();
  });
});
