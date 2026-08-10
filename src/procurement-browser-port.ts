import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from 'playwright-core';

import type {
  CaleProcureBaselineObservation,
  CaleProcureBrowserPort,
  CaleProcureSearchObservation,
  CaleProcureSearchRow,
} from './procurement-caleprocure-collector.js';
import type {
  CaleProcureDepartment,
  CaleProcureDetailIdentity,
} from './procurement-identity.js';

const SEARCH_URL =
  'https://caleprocure.ca.gov/pages/Events-BS3/event-search.aspx';
const EVENT_NAME_ID = '#RESP_INQA_WK_ZZ_AUC_NAME';
const CLEAR_ID = '#AUC_PREF_WK_AUC_PREF_CLEAR_PB';
const SEARCH_ID = '#RESP_INQA_WK_INQ_AUC_GO_PB';
const RESULTS_GRID_ID = '#datatable-ready';
const NO_RESULTS_TEXT = 'No event met your search criteria';
const SUMMARY_RE = /^Showing Results (?:\d+-)?\d+ of (\d+)$/;

export interface CaleProcureBrowserOptions {
  cdpUrl?: string;
  timeoutMs?: number;
}

async function requireSingleVisible(
  page: Page,
  selector: string,
  label: string,
): Promise<Locator> {
  const locator = page.locator(`${selector}:visible`);
  const count = await locator.count();
  if (count !== 1) {
    throw new Error(
      `CaleProcure ${label} is ambiguous: ${count} visible matches`,
    );
  }
  return locator;
}

async function waitForBusyToClear(
  page: Page,
  timeoutMs: number,
): Promise<void> {
  const busy = page
    .getByRole('heading', { name: /^(Loading|Searching)\.\.\.$/ })
    .filter({ visible: true });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await busy.count()) === 0) return;
    await page.waitForTimeout(100);
  }
  throw new Error('CaleProcure busy state did not clear before timeout');
}

async function clickAndWaitForBusyCycle(
  page: Page,
  control: Locator,
  timeoutMs: number,
): Promise<void> {
  const busy = page
    .getByRole('heading', { name: /^(Loading|Searching)\.\.\.$/ })
    .filter({ visible: true });
  await Promise.all([
    control.click(),
    busy.waitFor({
      state: 'visible',
      timeout: Math.min(5_000, timeoutMs),
    }),
  ]).catch((error: unknown) => {
    throw new Error('CaleProcure action did not produce a busy transition', {
      cause: error,
    });
  });
  await waitForBusyToClear(page, timeoutMs);
}

export async function waitForCaleProcureResultStateCleared(
  page: Page,
  timeoutMs: number,
): Promise<void> {
  const summaries = page
    .getByText(/^Showing Results /)
    .filter({ visible: true });
  const empty = page
    .getByText(NO_RESULTS_TEXT, { exact: true })
    .filter({ visible: true });
  const grid = page.locator(`${RESULTS_GRID_ID}:visible`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (
      (await summaries.count()) === 0 &&
      (await empty.count()) === 0 &&
      (await grid.count()) === 0
    ) {
      return;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(
    'CaleProcure prior result state did not clear before timeout',
  );
}

async function readVisibleResultTotal(page: Page): Promise<number> {
  const noResults = page
    .getByText(NO_RESULTS_TEXT, { exact: true })
    .filter({ visible: true });
  const summaryTexts = await page
    .getByText(/^Showing Results /)
    .filter({ visible: true })
    .allInnerTexts();
  return parseCaleProcureResultTotal(
    summaryTexts,
    (await noResults.count()) > 0,
  );
}

export function parseCaleProcureResultTotal(
  summaryTexts: readonly string[],
  noResultsVisible: boolean,
): number {
  const totals = new Set<number>();
  for (const raw of summaryTexts) {
    const normalized = raw.replace(/\s+/g, ' ').trim();
    const match = SUMMARY_RE.exec(normalized);
    if (match) totals.add(Number(match[1]));
  }
  if (noResultsVisible && totals.size > 0) {
    throw new Error(
      'CaleProcure result state shows both results and no-results',
    );
  }
  if (noResultsVisible) return 0;
  if (totals.size !== 1) {
    throw new Error(
      `CaleProcure result summary is ambiguous: ${totals.size} distinct visible totals`,
    );
  }
  return [...totals][0];
}

export function parseCaleProcureResultCells(
  values: readonly string[],
  rowNumber: number,
): CaleProcureSearchRow | null {
  if (values.length !== 6) return null;
  const normalized = values.map((value) =>
    value
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  if (!normalized[1] || !normalized[2] || !normalized[3]) {
    throw new Error(`CaleProcure result row ${rowNumber} is incomplete`);
  }
  return {
    eventId: normalized[1],
    title: normalized[2],
    agency: normalized[3],
    ...(normalized[4] ? { closeDate: normalized[4] } : {}),
  };
}

async function waitForResultState(
  page: Page,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const summaries = page
    .getByText(/^Showing Results /)
    .filter({ visible: true });
  const empty = page
    .getByText(NO_RESULTS_TEXT, { exact: true })
    .filter({ visible: true });
  while (Date.now() < deadline) {
    if ((await summaries.count()) > 0 || (await empty.count()) > 0) return;
    await page.waitForTimeout(100);
  }
  throw new Error('CaleProcure result state did not appear before timeout');
}

async function readVisibleRows(page: Page): Promise<CaleProcureSearchRow[]> {
  const grid = page.locator(`${RESULTS_GRID_ID}:visible`);
  const gridCount = await grid.count();
  if (gridCount === 0) return [];
  if (gridCount !== 1) {
    throw new Error(
      `CaleProcure result grid is ambiguous: ${gridCount} visible matches`,
    );
  }

  const rows = grid.locator('tbody tr:visible');
  const output: CaleProcureSearchRow[] = [];
  const rowCount = await rows.count();
  for (let index = 0; index < rowCount; index += 1) {
    const cells = rows.nth(index).locator('td:visible');
    const parsed = parseCaleProcureResultCells(
      await cells.allInnerTexts(),
      index + 1,
    );
    if (!parsed) {
      throw new Error(
        `CaleProcure visible result row ${index + 1} does not have six cells`,
      );
    }
    output.push(parsed);
  }
  return output;
}

export function validatedLoopbackCdpUrl(raw: string): string {
  const url = new URL(raw);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.username ||
    url.password ||
    (url.pathname !== '' && url.pathname !== '/') ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'CaleProcure CDP URL must be an unauthenticated loopback HTTP origin',
    );
  }
  return url.origin;
}

export class PlaywrightCaleProcureBrowserPort implements CaleProcureBrowserPort {
  private constructor(
    private readonly browser: Browser,
    private readonly context: BrowserContext,
    private readonly searchPage: Page,
    private readonly detailPage: Page,
    private readonly timeoutMs: number,
  ) {}

  static async connect(
    options: CaleProcureBrowserOptions = {},
  ): Promise<PlaywrightCaleProcureBrowserPort> {
    const cdpUrl = validatedLoopbackCdpUrl(
      options.cdpUrl ?? 'http://127.0.0.1:9250',
    );
    const timeoutMs = options.timeoutMs ?? 60_000;
    if (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 5_000 ||
      timeoutMs > 180_000
    ) {
      throw new Error('CaleProcure browser timeout must be 5000-180000ms');
    }
    const browser = await chromium.connectOverCDP(cdpUrl, {
      timeout: timeoutMs,
    });
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error('CaleProcure browser has no default context');
    }
    let searchPage: Page | undefined;
    let detailPage: Page | undefined;
    try {
      searchPage = await context.newPage();
      detailPage = await context.newPage();
    } catch (error) {
      await Promise.allSettled([searchPage?.close(), detailPage?.close()]);
      throw error;
    }
    searchPage.setDefaultTimeout(timeoutMs);
    detailPage.setDefaultTimeout(timeoutMs);
    return new PlaywrightCaleProcureBrowserPort(
      browser,
      context,
      searchPage,
      detailPage,
      timeoutMs,
    );
  }

  async open(): Promise<void> {
    await this.searchPage.goto(SEARCH_URL, {
      waitUntil: 'domcontentloaded',
      timeout: this.timeoutMs,
    });
    await this.searchPage
      .getByRole('heading', { name: 'Event Search', exact: true })
      .waitFor({ state: 'visible', timeout: this.timeoutMs });
    await waitForResultState(this.searchPage, this.timeoutMs);
    await waitForBusyToClear(this.searchPage, this.timeoutMs);
  }

  async readBaseline(): Promise<CaleProcureBaselineObservation> {
    const input = await requireSingleVisible(
      this.searchPage,
      EVENT_NAME_ID,
      'Event Name input',
    );
    if ((await input.inputValue()) !== '') {
      throw new Error('CaleProcure baseline is filtered');
    }
    const resultCount = await readVisibleResultTotal(this.searchPage);
    const rows = await readVisibleRows(this.searchPage);
    if (rows.length !== resultCount) {
      throw new Error(
        `CaleProcure baseline reconciliation failed: reported ${resultCount}, extracted ${rows.length}`,
      );
    }
    return { resultCount, extractedRows: rows.length };
  }

  async readDepartmentDirectory(): Promise<CaleProcureDepartment[]> {
    const lookup = this.searchPage
      .getByRole('button', { name: 'Look up businessUnit', exact: true })
      .filter({ visible: true });
    if ((await lookup.count()) !== 1) {
      throw new Error('CaleProcure department lookup control is ambiguous');
    }
    await lookup.click();
    await waitForBusyToClear(this.searchPage, this.timeoutMs);
    const heading = this.searchPage.getByRole('heading', {
      name: 'Look Up',
      exact: true,
    });
    await heading.waitFor({ state: 'visible', timeout: this.timeoutMs });

    const table = this.searchPage.getByRole('table').filter({ visible: true });
    if ((await table.count()) !== 1) {
      throw new Error('CaleProcure department table is ambiguous');
    }
    const rows = table.locator('tbody tr:visible');
    const departments: CaleProcureDepartment[] = [];
    const rowCount = await rows.count();
    for (let index = 0; index < rowCount; index += 1) {
      const cells = rows.nth(index).locator('td:visible');
      if ((await cells.count()) !== 2) continue;
      const values = (await cells.allInnerTexts()).map((value) =>
        value.replace(/\s+/g, ' ').trim(),
      );
      if (values[0] && values[1]) {
        departments.push({ businessUnit: values[0], name: values[1] });
      }
    }

    const back = heading.getByRole('button');
    if ((await back.count()) !== 1) {
      throw new Error(
        'CaleProcure department lookup back control is ambiguous',
      );
    }
    await back.click();
    await waitForBusyToClear(this.searchPage, this.timeoutMs);
    await this.searchPage
      .getByRole('heading', { name: 'Event Search', exact: true })
      .waitFor({ state: 'visible', timeout: this.timeoutMs });
    return departments;
  }

  async search(keyword: string): Promise<CaleProcureSearchObservation> {
    const started = Date.now();
    const clear = await requireSingleVisible(
      this.searchPage,
      CLEAR_ID,
      'Clear Criteria button',
    );
    await clickAndWaitForBusyCycle(this.searchPage, clear, this.timeoutMs);
    await waitForCaleProcureResultStateCleared(this.searchPage, this.timeoutMs);

    const input = await requireSingleVisible(
      this.searchPage,
      EVENT_NAME_ID,
      'Event Name input',
    );
    if ((await input.inputValue()) !== '') {
      throw new Error('CaleProcure Clear Criteria did not empty Event Name');
    }
    await input.fill(keyword);
    if ((await input.inputValue()) !== keyword) {
      throw new Error('CaleProcure Event Name did not retain the exact query');
    }

    const search = await requireSingleVisible(
      this.searchPage,
      SEARCH_ID,
      'Search button',
    );
    await clickAndWaitForBusyCycle(this.searchPage, search, this.timeoutMs);
    await waitForResultState(this.searchPage, this.timeoutMs);

    const echoedQuery = await input.inputValue();
    const resultCount = await readVisibleResultTotal(this.searchPage);
    const rows = await readVisibleRows(this.searchPage);
    return {
      echoedQuery,
      resultCount,
      pagesVisited: 1,
      rows,
      elapsedMs: Date.now() - started,
    };
  }

  async readDetail(
    businessUnit: string,
    eventId: string,
  ): Promise<CaleProcureDetailIdentity> {
    const url = `https://caleprocure.ca.gov/event/${encodeURIComponent(businessUnit)}/${encodeURIComponent(eventId)}`;
    await this.detailPage.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: this.timeoutMs,
    });
    await waitForBusyToClear(this.detailPage, this.timeoutMs);
    await this.detailPage
      .getByRole('heading', { name: 'Event Details', exact: true })
      .waitFor({ state: 'visible', timeout: this.timeoutMs });

    const eventMarker = this.detailPage
      .getByText(`Event : ${eventId}`, { exact: true })
      .filter({ visible: true });
    if ((await eventMarker.count()) !== 1) {
      throw new Error(
        `CaleProcure detail event marker is ambiguous for ${eventId}`,
      );
    }
    const titles = this.detailPage.locator('h3:visible');
    const titleValues = (await titles.allInnerTexts())
      .map((value) => value.replace(/\s+/g, ' ').trim())
      .filter(
        (value) => value && value !== 'Loading...' && value !== 'Searching...',
      );
    if (titleValues.length !== 1) {
      throw new Error(`CaleProcure detail title is ambiguous for ${eventId}`);
    }
    const departmentLines = (
      await this.detailPage.locator('p:visible').allInnerTexts()
    )
      .map((value) => value.replace(/\s+/g, ' ').trim())
      .filter((value) => value.startsWith('Dept:'));
    if (departmentLines.length !== 1) {
      throw new Error(
        `CaleProcure detail department is ambiguous for ${eventId}`,
      );
    }
    return {
      eventId,
      title: titleValues[0],
      agency: departmentLines[0].slice('Dept:'.length).trim(),
    };
  }

  async close(): Promise<void> {
    await Promise.allSettled([
      this.searchPage.close(),
      this.detailPage.close(),
    ]);
    // Do not call browser.close(): this is a shared, launchd-owned Chrome.
    void this.browser;
    void this.context;
  }
}
