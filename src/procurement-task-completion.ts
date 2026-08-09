import type { QueryResult, QueryResultRow } from 'pg';

import { query as businessQuery } from './business-db.js';
import { logger } from './logger.js';
import {
  CALEPROCURE_ADAPTER_VERSION,
  plannedCaleProcureUnits,
} from './procurement-source-config.js';
import { procurementRunToken } from './procurement-task-run.js';
import type { ScheduledTask } from './types.js';

export interface ProcurementTaskCompletionExecutor {
  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
}

interface SourceRunReceiptRow extends QueryResultRow {
  id: number | string;
  status: string;
  planned_count: number | string;
  observed_count: number | string;
  missing_count: number | string;
  adapter_matches: boolean;
  planned_units_match: boolean;
}

const defaultExecutor: ProcurementTaskCompletionExecutor = {
  query: (sql, params = []) => businessQuery(sql, params),
};

export function requiresProcurementSourceReceipt(task: ScheduledTask): boolean {
  if (task.group_folder !== 'procurement') return false;
  const prompt = task.prompt
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?;:,]+$/g, '')
    .toLowerCase();
  const scanPrompts = new Set([
    'run daily procurement scan',
    'rescan',
    'rescan caleprocure',
  ]);
  if (scanPrompts.has(prompt)) return true;
  if (prompt === 'rescan bonfire') return false;
  if (/\b(?:re)?scan\b|caleprocure/.test(prompt)) {
    logger.warn(
      { taskId: task.id, prompt },
      'Procurement task prompt was not classified; requiring source receipt',
    );
    return true;
  }
  return false;
}

/**
 * A model result is not a scan receipt. Procurement source tasks count as
 * successful only when the host ledger contains a complete post-start run
 * covering every release-owned unit.
 */
export async function validateProcurementTaskCompletion(
  task: ScheduledTask,
  startedAtMs: number,
  executor: ProcurementTaskCompletionExecutor = defaultExecutor,
): Promise<void> {
  if (!requiresProcurementSourceReceipt(task)) return;
  const runKey = procurementRunToken(task.id, startedAtMs);
  const startedAt = new Date(startedAtMs).toISOString();
  const plannedUnits = [...plannedCaleProcureUnits()];

  const result = await executor.query<SourceRunReceiptRow>(
    `SELECT id,
            status,
            jsonb_array_length(planned_units) AS planned_count,
            jsonb_array_length(observed_units) AS observed_count,
            jsonb_array_length(missing_units) AS missing_count,
            adapter_version = $3 AS adapter_matches,
            planned_units @> to_jsonb($4::text[])
              AND to_jsonb($4::text[]) @> planned_units
              AND jsonb_array_length(planned_units) = cardinality($4::text[])
              AS planned_units_match
       FROM public.procurement_source_runs r
      WHERE source = 'caleprocure'
        AND run_key = $1
        AND started_at >= $2::timestamptz
      LIMIT 1`,
    [runKey, startedAt, CALEPROCURE_ADAPTER_VERSION, plannedUnits],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(
      'Procurement scan produced no host source-run receipt after task start',
    );
  }

  const planned = Number(row.planned_count);
  const observed = Number(row.observed_count);
  const missing = Number(row.missing_count);
  if (
    row.status !== 'complete' ||
    !Number.isSafeInteger(planned) ||
    planned <= 0 ||
    observed !== planned ||
    missing !== 0 ||
    row.adapter_matches !== true ||
    row.planned_units_match !== true
  ) {
    throw new Error(
      `Procurement source run ${row.id} is not complete with full planned coverage`,
    );
  }
}
