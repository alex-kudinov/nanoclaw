import { afterAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';

import { applyProgramFactsCompanyWorkWithClient } from './program-facts-company-work.js';

const TEST_DATABASE_URL =
  process.env.PROGRAM_FACTS_COMPANY_WORK_TEST_DATABASE_URL;
const pool = TEST_DATABASE_URL
  ? new Pool({ connectionString: TEST_DATABASE_URL, max: 2 })
  : null;
const NOW = '2026-08-20T14:00:00.000Z';

function detectorRun(options: {
  runKey: string;
  observedAt: string;
  clean?: boolean;
  fingerprint: string;
  payload: string;
}) {
  return {
    runKey: options.runKey,
    observedAt: options.observedAt,
    result: {
      checked: 3,
      findings: options.clean
        ? []
        : [
            {
              program: 'practitioner-series',
              kind: 'kb_missing_fact' as const,
              detail: 'content remains outside the durable control plane',
            },
          ],
    },
    evidence: {
      detectorVersion: 1 as const,
      factsSha256: 'a'.repeat(64),
      salesKbSha256: 'b'.repeat(64),
      productsSha256: 'c'.repeat(64),
      productsAvailable: true,
      findingFingerprint: options.fingerprint,
      payloadSha256: options.payload,
    },
  };
}

async function transaction<T>(fn: (client: PoolClient) => Promise<T>) {
  if (!pool) throw new Error('disposable pool is unavailable');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

describe.skipIf(!TEST_DATABASE_URL)(
  'program-facts Company Work disposable PostgreSQL',
  () => {
    afterAll(async () => {
      await pool?.end();
    });

    it('opens, replays, updates, clean-closes, and reopens one stable item', async () => {
      if (!pool) throw new Error('disposable pool is unavailable');
      const first = detectorRun({
        runKey: 'job-1',
        observedAt: NOW,
        fingerprint: 'd'.repeat(64),
        payload: 'e'.repeat(64),
      });

      await expect(
        transaction((client) =>
          applyProgramFactsCompanyWorkWithClient(client, first),
        ),
      ).resolves.toMatchObject({ outcome: 'opened', shouldNotify: true });
      await expect(
        transaction((client) =>
          applyProgramFactsCompanyWorkWithClient(client, first),
        ),
      ).resolves.toMatchObject({
        outcome: 'unchanged',
        triggerApplied: false,
        observationApplied: false,
        shouldNotify: false,
      });

      await expect(
        transaction((client) =>
          applyProgramFactsCompanyWorkWithClient(
            client,
            detectorRun({
              runKey: 'job-2',
              observedAt: '2026-08-20T15:00:00.000Z',
              fingerprint: 'f'.repeat(64),
              payload: '1'.repeat(64),
            }),
          ),
        ),
      ).resolves.toMatchObject({ outcome: 'updated', shouldNotify: true });

      await expect(
        transaction((client) =>
          applyProgramFactsCompanyWorkWithClient(
            client,
            detectorRun({
              runKey: 'job-3',
              observedAt: '2026-08-20T16:00:00.000Z',
              clean: true,
              fingerprint: '0'.repeat(64),
              payload: '2'.repeat(64),
            }),
          ),
        ),
      ).resolves.toMatchObject({ outcome: 'closed', shouldNotify: true });

      await expect(
        transaction((client) =>
          applyProgramFactsCompanyWorkWithClient(
            client,
            detectorRun({
              runKey: 'job-4',
              observedAt: '2026-08-20T17:00:00.000Z',
              fingerprint: '3'.repeat(64),
              payload: '4'.repeat(64),
            }),
          ),
        ),
      ).resolves.toMatchObject({ outcome: 'reopened', shouldNotify: true });

      const durable = await pool.query(
        `SELECT
           (SELECT count(*)::int
              FROM business_v2.company_work_items
             WHERE workflow_type = 'program_facts_drift') AS items,
           (SELECT count(*)::int
              FROM business_v2.company_trigger_occurrences
             WHERE trigger_kind = 'business_condition') AS occurrences,
           (SELECT count(*)::int
              FROM business_v2.company_program_fact_observations) AS observations,
           (SELECT count(*)::int
              FROM business_v2.company_work_events
             WHERE event_type = 'reopened') AS reopened,
           w.stage, w.disposition, w.block_code
         FROM business_v2.company_work_items w
        WHERE w.workflow_type = 'program_facts_drift'`,
      );
      expect(durable.rows[0]).toMatchObject({
        items: 1,
        occurrences: 4,
        observations: 4,
        reopened: 1,
        stage: 'accepted',
        disposition: 'blocked',
        block_code: 'fact_authority:owner_review_required',
      });

      await expect(
        pool.query(
          `UPDATE business_v2.company_program_fact_observations
              SET finding_count = finding_count`,
        ),
      ).rejects.toThrow(/append-only/);
    });
  },
);
