/**
 * Host IPC surface for Procurement intake and review.
 *
 * The host derives the caller from the IPC directory. Queue reads are always
 * available; CaleProcure writes and human-review cards are separately gated
 * and never trust model-supplied identity.
 */

import fs from 'fs';
import path from 'path';

import type { QueryResult, QueryResultRow } from 'pg';

import { query as businessQuery } from './business-db.js';
import { DATA_DIR } from './config.js';
import { logger } from './logger.js';
import {
  ingestCaleProcureRows,
  type CaleProcureRow,
  type CaleProcureUnitEvidence,
} from './procurement-intake.js';
import { caleProcureIngestEnabled } from './procurement-policy.js';
import { createProcurementReviewCard } from './procurement-review.js';
import { activeProcurementTaskRun } from './procurement-task-run.js';

export interface ProcurementQueuePayload {
  type: 'procurement_queue';
  limit?: number;
  groupFolder?: string;
}

export interface ProcurementCaleProcureIngestPayload {
  type: 'procurement_caleprocure_ingest';
  runKey: string;
  rows: CaleProcureRow[];
  observedUnits: string[];
  coverageEvidence: Record<string, CaleProcureUnitEvidence>;
  groupFolder?: string;
}

export interface ProcurementPursuitQueuePayload {
  type: 'procurement_pursuit_queue';
  limit?: number;
  groupFolder?: string;
}

export interface ProcurementReviewCardPayload {
  type: 'procurement_review_card';
  opportunityId: number;
  expectedVersion: number;
  recommendation: 'needs_info' | 'process' | 'drop';
  reason: string;
  groupFolder?: string;
}

export type ProcurementIpcPayload =
  | ProcurementQueuePayload
  | ProcurementCaleProcureIngestPayload
  | ProcurementReviewCardPayload
  | ProcurementPursuitQueuePayload;

interface QueueRow extends QueryResultRow {
  opportunity_id: number | string;
  source: string;
  source_key: string;
  title: string;
  agency: string | null;
  close_date: string | null;
  category: string | null;
  review_state: string;
  review_version: number | string;
  days_until_close: number | string | null;
}

interface PursuitQueueRow extends QueryResultRow {
  pursuit_id: number | string;
  pursuit_version: number | string;
  pursuit_state: string;
  opportunity_id: number | string;
  source: string;
  source_key: string;
  title: string;
  agency: string | null;
  close_date: string | null;
  days_until_close: number | string | null;
  next_action: string;
  next_action_due: string;
}

export interface ProcurementIpcDeps {
  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
  writeInput(groupFolder: string, text: string): void;
  postReviewCard?(
    text: string,
    threadKey: string,
  ): Promise<{ channelJid: string; messageTs: string } | null>;
  postReviewThread?(
    channelJid: string,
    threadTs: string,
    text: string,
  ): Promise<string | undefined>;
  env?: NodeJS.ProcessEnv;
}

function defaultWriteInput(groupFolder: string, text: string): void {
  const inputDir = path.join(DATA_DIR, 'ipc', groupFolder, 'input');
  fs.mkdirSync(inputDir, { recursive: true });
  const filename = `procurement-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`;
  fs.writeFileSync(
    path.join(inputDir, filename),
    JSON.stringify({ type: 'message', text }, null, 2),
    'utf8',
  );
}

const defaultDeps: ProcurementIpcDeps = {
  query: (sql, params = []) => businessQuery(sql, params),
  writeInput: defaultWriteInput,
};

export function isProcurementIpcType(
  type: string,
): type is ProcurementIpcPayload['type'] {
  return (
    type === 'procurement_queue' ||
    type === 'procurement_caleprocure_ingest' ||
    type === 'procurement_review_card' ||
    type === 'procurement_pursuit_queue'
  );
}

function formatPursuitQueue(rows: PursuitQueueRow[]): string {
  if (rows.length === 0) {
    return '[PROCUREMENT PURSUITS] No active host-owned pursuits.';
  }
  return rows
    .flatMap((row) => [
      `[PROCUREMENT PURSUIT] #${row.pursuit_id} v${row.pursuit_version} — ${row.title}`,
      `Opportunity: #${row.opportunity_id} · State: ${row.pursuit_state}`,
      `Source: ${row.source} (${row.source_key}) · Agency: ${row.agency ?? 'unknown'}`,
      `Closes: ${row.close_date ?? 'unknown'} (${row.days_until_close ?? 'unknown'} day(s))`,
      `Next: ${row.next_action} · Due: ${row.next_action_due}`,
      '',
    ])
    .join('\n')
    .trimEnd();
}

function boundedLimit(value: number | undefined): number {
  if (value === undefined) return 20;
  if (!Number.isSafeInteger(value) || value < 1 || value > 50) {
    throw new Error('procurement queue limit must be an integer from 1 to 50');
  }
  return value;
}

function formatQueue(rows: QueueRow[]): string {
  if (rows.length === 0) {
    return '[PROCUREMENT QUEUE] No host-normalized opportunities await review.';
  }
  const lines = rows.flatMap((row) => {
    const timing =
      row.days_until_close == null
        ? 'deadline unknown'
        : `${row.days_until_close} day(s)`;
    return [
      `[PROCUREMENT REVIEW] #${row.opportunity_id} v${row.review_version} — ${row.title}`,
      `Source: ${row.source} (${row.source_key})`,
      `Agency: ${row.agency ?? 'unknown'}`,
      `Closes: ${row.close_date ?? 'unknown'} (${timing})`,
      `Category: ${row.category ?? 'unknown'} · State: ${row.review_state}`,
      '',
    ];
  });
  return lines.join('\n').trimEnd();
}

export async function dispatchProcurementIpc(
  sourceGroup: string,
  payload: ProcurementIpcPayload,
  deps: Partial<ProcurementIpcDeps> = {},
): Promise<void> {
  const runtime = { ...defaultDeps, ...deps };
  if (sourceGroup !== 'procurement') {
    throw new Error('procurement IPC is restricted to the procurement group');
  }
  if (payload.type === 'procurement_caleprocure_ingest') {
    if (!caleProcureIngestEnabled(runtime.env)) {
      throw new Error('CaleProcure host intake is disabled');
    }
    if (
      typeof payload.runKey !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(payload.runKey)
    ) {
      throw new Error('CaleProcure runKey is invalid');
    }
    if (!Array.isArray(payload.rows) || payload.rows.length > 200) {
      throw new Error('CaleProcure intake accepts at most 200 rows');
    }
    if (!Array.isArray(payload.observedUnits)) {
      throw new Error('CaleProcure observedUnits is required');
    }
    if (
      typeof payload.coverageEvidence !== 'object' ||
      payload.coverageEvidence === null ||
      Array.isArray(payload.coverageEvidence)
    ) {
      throw new Error('CaleProcure coverageEvidence is required');
    }
    const hostRunKey = activeProcurementTaskRun(sourceGroup);
    const runKey = hostRunKey ?? payload.runKey;
    if (hostRunKey && hostRunKey !== payload.runKey) {
      logger.warn(
        { sourceGroup, modelRunKey: payload.runKey, hostRunKey },
        'Overriding model CaleProcure run key with scheduled-task identity',
      );
    }
    const result = await ingestCaleProcureRows(
      payload.rows,
      runKey,
      new Date().toISOString(),
      { query: runtime.query },
      {
        observedUnits: payload.observedUnits,
        evidence: payload.coverageEvidence,
      },
    );
    runtime.writeInput(
      sourceGroup,
      [
        `[PROCUREMENT CALEPROCURE INGESTED] Run ${result.runId} is ${result.status}.`,
        `Observed: ${result.observationsSeen} · New observations: ${result.observationsNew}`,
        `Missing host-planned units: ${result.missingUnits.join(', ') || 'none'}`,
        `Opportunity IDs: ${result.opportunityIds.join(', ') || 'none'}`,
        'Request procurement_queue to review current actionable rows.',
      ].join('\n'),
    );
    logger.info(
      {
        sourceGroup,
        runId: result.runId,
        seen: result.observationsSeen,
        created: result.observationsNew,
      },
      'CaleProcure intake complete',
    );
    return;
  }

  if (payload.type === 'procurement_review_card') {
    if (!runtime.postReviewCard || !runtime.postReviewThread) {
      throw new Error('Procurement Slack review-card transport is unavailable');
    }
    const result = await createProcurementReviewCard(
      {
        opportunityId: payload.opportunityId,
        expectedVersion: payload.expectedVersion,
        recommendation: payload.recommendation,
        reason: payload.reason,
      },
      {
        query: runtime.query,
        postCard: runtime.postReviewCard,
        postThread: runtime.postReviewThread,
      },
      runtime.env,
    );
    runtime.writeInput(
      sourceGroup,
      result.reused
        ? `[PROCUREMENT REVIEW CARD] Existing host card reused for #${result.opportunityId} v${result.reviewVersion}.`
        : `[PROCUREMENT REVIEW CARD] Host card posted for #${result.opportunityId} v${result.reviewVersion}.`,
    );
    return;
  }

  if (payload.type === 'procurement_pursuit_queue') {
    const limit = boundedLimit(payload.limit);
    const result = await runtime.query<PursuitQueueRow>(
      `SELECT pursuit_id, pursuit_version, pursuit_state, opportunity_id,
              source, source_key, title, agency, close_date, days_until_close,
              next_action, next_action_due
         FROM public.v_procurement_pursuit_queue
        ORDER BY close_date ASC NULLS LAST, next_action_due ASC, pursuit_id ASC
        LIMIT $1`,
      [limit],
    );
    runtime.writeInput(sourceGroup, formatPursuitQueue(result.rows));
    logger.info(
      { sourceGroup, rows: result.rows.length, limit },
      'procurement pursuit queue delivered',
    );
    return;
  }

  const limit = boundedLimit(payload.limit);
  const result = await runtime.query<QueueRow>(
    `SELECT opportunity_id, source, source_key, title, agency, close_date,
            category, review_state, review_version, days_until_close
       FROM public.v_procurement_review_queue
      ORDER BY close_date ASC NULLS LAST, first_seen_at ASC
      LIMIT $1`,
    [limit],
  );
  runtime.writeInput(sourceGroup, formatQueue(result.rows));
  logger.info(
    { sourceGroup, rows: result.rows.length, limit },
    'procurement queue delivered',
  );
}
