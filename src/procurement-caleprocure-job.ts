#!/usr/bin/env node

import crypto from 'crypto';
import type { Writable } from 'stream';
import { pathToFileURL } from 'url';

import { resetBusinessPool } from './business-db.js';
import {
  CaleProcureCollectionError,
  collectCaleProcure,
  type CaleProcureBrowserPort,
  type CaleProcureCollection,
} from './procurement-caleprocure-collector.js';
import { PlaywrightCaleProcureBrowserPort } from './procurement-browser-port.js';
import { ingestCaleProcureRows } from './procurement-intake.js';

const DEFAULT_JOB_TIMEOUT_MS = 900_000;

function compactTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14);
}

function browserTimeoutMs(): number {
  const raw = process.env.PROCUREMENT_CALEPROCURE_BROWSER_TIMEOUT_MS;
  if (!raw) return 60_000;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 5_000 || parsed > 180_000) {
    throw new Error(
      'PROCUREMENT_CALEPROCURE_BROWSER_TIMEOUT_MS must be 5000-180000',
    );
  }
  return parsed;
}

export function publicSummary(
  mode: 'shadow' | 'live' | 'partial',
  collection: CaleProcureCollection,
  receipt?: {
    runId: number;
    status: string;
    observationsSeen: number;
    observationsNew: number;
    missingUnits: string[];
  },
): Record<string, unknown> {
  return {
    source: 'caleprocure',
    mode,
    baseline: collection.baseline,
    observedUnits: collection.coverage.observedUnits.length,
    verifiedRows: collection.rows.length,
    units: collection.diagnostics,
    ...(receipt ? { receipt } : {}),
  };
}

export class CaleProcureJobError extends Error {
  constructor(
    message: string,
    readonly partialSummary: Record<string, unknown> | null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CaleProcureJobError';
  }
}

export interface RunCaleProcureJobOptions {
  shadow: boolean;
  port: CaleProcureBrowserPort;
  signal?: AbortSignal;
  ingest?: typeof ingestCaleProcureRows;
  now?: Date;
}

export async function runCaleProcureJob({
  shadow,
  port,
  signal,
  ingest = ingestCaleProcureRows,
  now = new Date(),
}: RunCaleProcureJobOptions): Promise<Record<string, unknown>> {
  const runKey = `host-${compactTimestamp(now)}-${crypto.randomUUID()}`;

  try {
    const collection = await collectCaleProcure(port, undefined, signal);
    if (shadow) return publicSummary('shadow', collection);

    const receipt = await ingest(
      collection.rows,
      runKey,
      now.toISOString(),
      undefined,
      collection.coverage,
    );
    if (receipt.status !== 'complete') {
      throw new CaleProcureJobError(
        `CaleProcure host receipt is ${receipt.status}; missing units: ${receipt.missingUnits.join(',')}`,
        publicSummary('partial', collection, receipt),
      );
    }
    return publicSummary('live', collection, receipt);
  } catch (error) {
    if (!shadow && error instanceof CaleProcureCollectionError) {
      const receipt = await ingest(
        error.partial.rows,
        runKey,
        now.toISOString(),
        undefined,
        error.partial.coverage,
      );
      throw new CaleProcureJobError(
        error.message,
        publicSummary('partial', error.partial, receipt),
        { cause: error },
      );
    }
    throw error;
  }
}

function jobTimeoutMs(): number {
  const raw = process.env.NANOCLAW_JOB_TIMEOUT_MS;
  if (!raw) return DEFAULT_JOB_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 60_000) {
    throw new Error('NANOCLAW_JOB_TIMEOUT_MS must be an integer >= 60000');
  }
  return parsed;
}

async function writeLine(stream: Writable, value: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    stream.write(`${value}\n`, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function main(signal: AbortSignal): Promise<void> {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => arg !== '--shadow')) {
    throw new Error('Usage: procurement-caleprocure-job.js [--shadow]');
  }
  const shadow = args.has('--shadow');
  if (
    !shadow &&
    process.env.PROCUREMENT_CALEPROCURE_COLLECTOR_ENABLED !== '1'
  ) {
    throw new Error(
      'CaleProcure collector writes are disabled; set PROCUREMENT_CALEPROCURE_COLLECTOR_ENABLED=1',
    );
  }

  const port = await PlaywrightCaleProcureBrowserPort.connect({
    cdpUrl:
      process.env.PROCUREMENT_CALEPROCURE_CDP_URL ?? 'http://127.0.0.1:9250',
    timeoutMs: browserTimeoutMs(),
  });
  const summary = await runCaleProcureJob({ shadow, port, signal });
  await writeLine(process.stdout, JSON.stringify(summary));
}

async function runCli(): Promise<void> {
  const controller = new AbortController();
  const deadlineMs = Math.floor(jobTimeoutMs() * 0.8);
  const deadline = setTimeout(() => {
    controller.abort(
      new Error(`CaleProcure internal deadline reached after ${deadlineMs}ms`),
    );
  }, deadlineMs);
  const terminate = () => {
    controller.abort(new Error('CaleProcure collector received SIGTERM'));
  };
  process.once('SIGTERM', terminate);

  try {
    await main(controller.signal);
  } catch (error: unknown) {
    if (error instanceof CaleProcureJobError && error.partialSummary) {
      await writeLine(process.stderr, JSON.stringify(error.partialSummary));
    }
    const message = error instanceof Error ? error.message : String(error);
    await writeLine(process.stderr, `CaleProcure collector failed: ${message}`);
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
    process.off('SIGTERM', terminate);
    await resetBusinessPool();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void runCli();
}
