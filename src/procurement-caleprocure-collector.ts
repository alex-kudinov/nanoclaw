import type {
  CaleProcureCoverage,
  CaleProcureRow,
} from './procurement-intake.js';
import {
  assertCaleProcureDetailIdentity,
  resolveCaleProcureBusinessUnit,
  type CaleProcureDepartment,
  type CaleProcureDetailIdentity,
} from './procurement-identity.js';
import { plannedCaleProcureUnits } from './procurement-source-config.js';

const MAX_COLLECTED_ROWS = 200;

export interface CaleProcureSearchRow {
  eventId: string;
  title: string;
  agency: string;
  closeDate?: string;
}

export interface CaleProcureSearchObservation {
  echoedQuery: string;
  resultEvidence: 'visible' | 'response';
  visibleEmptyMarker: boolean;
  resultCount: number;
  pagesVisited: number;
  rows: CaleProcureSearchRow[];
  elapsedMs: number;
}

export interface CaleProcureBaselineObservation {
  resultCount: number;
  extractedRows: number;
}

export interface CaleProcureBrowserPort {
  open(): Promise<void>;
  readBaseline(): Promise<CaleProcureBaselineObservation>;
  readDepartmentDirectory(): Promise<CaleProcureDepartment[]>;
  search(keyword: string): Promise<CaleProcureSearchObservation>;
  readDetail(
    businessUnit: string,
    eventId: string,
  ): Promise<CaleProcureDetailIdentity>;
  close(): Promise<void>;
}

export interface CaleProcureUnitDiagnostic {
  keyword: string;
  status: 'observed' | 'failed';
  resultEvidence: 'visible' | 'response';
  // Diagnostic only: the portal marker is not query-bound and is never evidence.
  visibleEmptyMarker: boolean;
  resultCount: number;
  // For reconciliation failures this is the number pulled from the grid;
  // otherwise it is the number of rows contributed by the unit.
  extractedRows: number;
  pagesVisited: number;
  elapsedMs: number;
  error?:
    | 'row_budget_exceeded'
    | 'reconciliation_failed'
    | 'identity_verification_failed';
}

export interface CaleProcureCollection {
  baseline: CaleProcureBaselineObservation | null;
  rows: CaleProcureRow[];
  coverage: CaleProcureCoverage;
  diagnostics: CaleProcureUnitDiagnostic[];
}

export class CaleProcureCollectionError extends Error {
  constructor(
    message: string,
    readonly partial: CaleProcureCollection,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CaleProcureCollectionError';
  }
}

function emptyCollection(): CaleProcureCollection {
  return {
    baseline: null,
    rows: [],
    coverage: { observedUnits: [], evidence: {} },
    diagnostics: [],
  };
}

function fail(
  message: string,
  partial: CaleProcureCollection,
  cause?: unknown,
): never {
  throw new CaleProcureCollectionError(message, partial, { cause });
}

function abortReason(signal: AbortSignal, operation: string): Error {
  const reason = signal.reason;
  if (reason instanceof Error) return reason;
  return new Error(
    `CaleProcure collection aborted during ${operation}${reason ? `: ${String(reason)}` : ''}`,
  );
}

async function abortable<T>(
  operation: () => Promise<T>,
  signal: AbortSignal | undefined,
  label: string,
): Promise<T> {
  if (!signal) return operation();
  if (signal.aborted) throw abortReason(signal, label);

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      reject(abortReason(signal, label));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    operation().then(
      (value) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

export async function collectCaleProcure(
  port: CaleProcureBrowserPort,
  units: readonly string[] = plannedCaleProcureUnits(),
  signal?: AbortSignal,
): Promise<CaleProcureCollection> {
  const output = emptyCollection();
  const detailCache = new Set<string>();

  try {
    await abortable(() => port.open(), signal, 'opening the search page');
    output.baseline = await abortable(
      () => port.readBaseline(),
      signal,
      'reading the baseline',
    );
    if (output.baseline.resultCount < 1 || output.baseline.extractedRows < 1) {
      fail('CaleProcure unfiltered baseline is empty', output);
    }

    const departments = await abortable(
      () => port.readDepartmentDirectory(),
      signal,
      'reading the department directory',
    );
    if (departments.length < 1) {
      fail('CaleProcure department directory is empty', output);
    }

    for (const keyword of units) {
      let observed: CaleProcureSearchObservation;
      try {
        observed = await abortable(
          () => port.search(keyword),
          signal,
          `searching ${JSON.stringify(keyword)}`,
        );
      } catch (error) {
        fail(
          `CaleProcure search failed for ${JSON.stringify(keyword)}`,
          output,
          error,
        );
      }

      if (observed.echoedQuery !== keyword) {
        fail(
          `CaleProcure echoed query mismatch for ${JSON.stringify(keyword)}`,
          output,
        );
      }
      if (
        observed.resultEvidence !== 'visible' &&
        observed.resultEvidence !== 'response'
      ) {
        fail(
          `CaleProcure result evidence is invalid for ${JSON.stringify(keyword)}`,
          output,
        );
      }
      if (typeof observed.visibleEmptyMarker !== 'boolean') {
        fail(
          `CaleProcure visible empty-marker diagnostic is invalid for ${JSON.stringify(keyword)}`,
          output,
        );
      }
      if (
        !Number.isSafeInteger(observed.resultCount) ||
        observed.resultCount < 0 ||
        !Number.isSafeInteger(observed.pagesVisited) ||
        observed.pagesVisited < 1
      ) {
        fail(
          `CaleProcure result metadata is invalid for ${JSON.stringify(keyword)}`,
          output,
        );
      }
      if (observed.rows.length !== observed.resultCount) {
        output.diagnostics.push({
          keyword,
          status: 'failed',
          resultEvidence: observed.resultEvidence,
          visibleEmptyMarker: observed.visibleEmptyMarker,
          resultCount: observed.resultCount,
          extractedRows: observed.rows.length,
          pagesVisited: observed.pagesVisited,
          elapsedMs: observed.elapsedMs,
          error: 'reconciliation_failed',
        });
        continue;
      }

      const remainingRowBudget = MAX_COLLECTED_ROWS - output.rows.length;
      if (observed.rows.length > remainingRowBudget) {
        output.diagnostics.push({
          keyword,
          status: 'failed',
          resultEvidence: observed.resultEvidence,
          visibleEmptyMarker: observed.visibleEmptyMarker,
          resultCount: observed.resultCount,
          extractedRows: 0,
          pagesVisited: observed.pagesVisited,
          elapsedMs: observed.elapsedMs,
          error: 'row_budget_exceeded',
        });
        continue;
      }

      const verifiedRows: CaleProcureRow[] = [];
      try {
        for (const row of observed.rows) {
          const department = resolveCaleProcureBusinessUnit(
            departments,
            row.agency,
          );
          const identityKey = `${department.businessUnit}/${row.eventId}`;
          if (!detailCache.has(identityKey)) {
            const detail = await abortable(
              () => port.readDetail(department.businessUnit, row.eventId),
              signal,
              `verifying ${department.businessUnit}/${row.eventId}`,
            );
            assertCaleProcureDetailIdentity(
              {
                eventId: row.eventId,
                title: row.title,
                agency: row.agency,
              },
              detail,
            );
            detailCache.add(identityKey);
          }
          verifiedRows.push({
            event_id: row.eventId,
            business_unit: department.businessUnit,
            title: row.title,
            agency: row.agency,
            ...(row.closeDate ? { close_date: row.closeDate } : {}),
            url: `https://caleprocure.ca.gov/event/${encodeURIComponent(department.businessUnit)}/${encodeURIComponent(row.eventId)}`,
            search_keyword: keyword,
          });
        }
      } catch (error) {
        if (signal?.aborted) {
          fail('CaleProcure collection aborted', output, error);
        }
        output.diagnostics.push({
          keyword,
          status: 'failed',
          resultEvidence: observed.resultEvidence,
          visibleEmptyMarker: observed.visibleEmptyMarker,
          resultCount: observed.resultCount,
          extractedRows: 0,
          pagesVisited: observed.pagesVisited,
          elapsedMs: observed.elapsedMs,
          error: 'identity_verification_failed',
        });
        continue;
      }

      output.rows.push(...verifiedRows);
      output.coverage.observedUnits.push(keyword);
      output.coverage.evidence[keyword] = {
        resultCount: observed.resultCount,
        pagesVisited: observed.pagesVisited,
      };
      output.diagnostics.push({
        keyword,
        status: 'observed',
        resultEvidence: observed.resultEvidence,
        visibleEmptyMarker: observed.visibleEmptyMarker,
        resultCount: observed.resultCount,
        extractedRows: verifiedRows.length,
        pagesVisited: observed.pagesVisited,
        elapsedMs: observed.elapsedMs,
      });
    }

    return output;
  } catch (error) {
    if (error instanceof CaleProcureCollectionError) throw error;
    fail('CaleProcure collection failed', output, error);
  } finally {
    await port.close().catch(() => undefined);
  }
}
