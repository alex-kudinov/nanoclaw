import { afterAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';

import { readCompanyWorkExceptionReportWithClient } from '../company-work-report.js';
import { applyHealerCompanyWorkCatalogWithClient } from './company-work-adapter.js';
import {
  buildHealerResolutionCatalog,
  type HealerResolutionSourceRow,
} from './resolution-catalog.js';

const TEST_DATABASE_URL = process.env.HEALER_COMPANY_WORK_TEST_DATABASE_URL;
const pool = TEST_DATABASE_URL
  ? new Pool({ connectionString: TEST_DATABASE_URL, max: 2 })
  : null;
const BASE_TIME = '2026-08-23T14:00:00.000Z';

function sourceRow(
  overrides: Partial<HealerResolutionSourceRow> = {},
): HealerResolutionSourceRow {
  return {
    id: '1',
    source: 'job:example',
    fingerprint: 'abcdef1234567890',
    severity: 'error',
    status: 'needs_human',
    occurrences: 2,
    first_seen: '2026-08-23T12:00:00.000Z',
    last_seen: BASE_TIME,
    updated_at: BASE_TIME,
    remediation_class: 'config',
    diagnosis: 'Config mismatch.',
    proposed_kind: 'diff',
    proposed_summary: 'Restore the reviewed value.',
    confidence: 'medium',
    cause_or_symptom: 'root_cause',
    evidence: ['config source mismatch'],
    applied_action_kind: null,
    decision_actor: null,
    outcome: 'escalated',
    ...overrides,
  };
}

async function transaction<T>(fn: (client: PoolClient) => Promise<T>) {
  if (!pool) throw new Error('disposable pool is unavailable');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await fn(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

describe.skipIf(!TEST_DATABASE_URL)(
  'healer Company Work disposable PostgreSQL',
  () => {
    afterAll(async () => {
      await pool?.end();
    });

    it('opens, replays, updates, verifies, reopens, and records named no-action closure', async () => {
      if (!pool) throw new Error('disposable pool is unavailable');
      const first = buildHealerResolutionCatalog([sourceRow()], BASE_TIME);
      await expect(
        transaction((client) =>
          applyHealerCompanyWorkCatalogWithClient(client, first),
        ),
      ).resolves.toMatchObject({
        items: [
          {
            operation: 'ensure_blocked',
            transitionApplied: true,
            observationApplied: true,
          },
        ],
      });

      await expect(
        transaction((client) =>
          applyHealerCompanyWorkCatalogWithClient(client, first),
        ),
      ).resolves.toMatchObject({
        items: [
          {
            operation: 'no_op',
            transitionApplied: false,
            observationApplied: false,
          },
        ],
      });

      await expect(
        transaction((client) =>
          applyHealerCompanyWorkCatalogWithClient(
            client,
            buildHealerResolutionCatalog(
              [
                sourceRow({
                  proposed_summary: 'Restore the reviewed value after audit.',
                  updated_at: '2026-08-23T15:00:00.000Z',
                }),
              ],
              '2026-08-23T15:00:00.000Z',
            ),
          ),
        ),
      ).resolves.toMatchObject({
        items: [{ operation: 'update_blocked', transitionApplied: true }],
      });

      await expect(
        transaction((client) =>
          applyHealerCompanyWorkCatalogWithClient(
            client,
            buildHealerResolutionCatalog(
              [
                sourceRow({
                  status: 'resolved',
                  outcome: 'verified_fixed',
                  updated_at: '2026-08-23T16:00:00.000Z',
                }),
              ],
              '2026-08-23T16:00:00.000Z',
            ),
          ),
        ),
      ).resolves.toMatchObject({
        items: [{ operation: 'close_verified', transitionApplied: true }],
      });

      await expect(
        transaction((client) =>
          applyHealerCompanyWorkCatalogWithClient(
            client,
            buildHealerResolutionCatalog(
              [
                sourceRow({
                  status: 'recurring',
                  occurrences: 3,
                  updated_at: '2026-08-23T17:00:00.000Z',
                }),
              ],
              '2026-08-23T17:00:00.000Z',
            ),
          ),
        ),
      ).resolves.toMatchObject({
        items: [{ operation: 'reopen_blocked', transitionApplied: true }],
      });

      await expect(
        transaction((client) =>
          applyHealerCompanyWorkCatalogWithClient(
            client,
            buildHealerResolutionCatalog(
              [
                sourceRow({
                  status: 'wont_fix',
                  applied_action_kind: 'proposal_rejected',
                  decision_actor: 'operator-1',
                  updated_at: '2026-08-23T18:00:00.000Z',
                }),
              ],
              '2026-08-23T18:00:00.000Z',
            ),
          ),
        ),
      ).resolves.toMatchObject({
        items: [
          {
            operation: 'close_decided_no_action',
            transitionApplied: true,
          },
        ],
      });

      await expect(
        transaction((client) =>
          applyHealerCompanyWorkCatalogWithClient(
            client,
            buildHealerResolutionCatalog(
              [
                sourceRow({
                  status: 'wont_fix',
                  applied_action_kind: 'proposal_rejected',
                  decision_actor: 'operator-1',
                  updated_at: '2026-08-23T18:00:00.000Z',
                }),
              ],
              '2026-08-23T18:00:00.000Z',
            ),
          ),
        ),
      ).resolves.toMatchObject({
        items: [
          {
            operation: 'no_op',
            transitionApplied: false,
            observationApplied: false,
          },
        ],
      });

      const durable = await pool.query(
        `SELECT
           (SELECT count(*)::int FROM business_v2.company_work_items
             WHERE workflow_type = 'healer_resolution') AS items,
           (SELECT count(*)::int
              FROM business_v2.company_healer_resolution_observations)
             AS observations,
           (SELECT count(*)::int FROM business_v2.company_work_receipts r
             JOIN business_v2.company_work_items w ON w.id = r.work_item_id
            WHERE w.workflow_type = 'healer_resolution') AS receipts,
           (SELECT count(*)::int FROM business_v2.company_work_events e
             JOIN business_v2.company_work_items w ON w.id = e.work_item_id
            WHERE w.workflow_type = 'healer_resolution') AS events,
           w.stage, w.disposition, w.version
         FROM business_v2.company_work_items w
        WHERE w.workflow_type = 'healer_resolution'`,
      );
      expect(durable.rows[0]).toMatchObject({
        items: 1,
        observations: 5,
        receipts: 2,
        events: 7,
        stage: 'outcome_validated',
        disposition: 'completed',
        version: 6,
      });

      const report = await readCompanyWorkExceptionReportWithClient(pool, {
        workflow: 'healer_resolution',
        now: new Date('2026-08-23T18:05:00.000Z'),
      });
      expect(report.exceptions).toEqual([]);
      expect(report.summary.byWorkflow.healer_resolution).toBe(1);

      await expect(
        pool.query(
          `UPDATE business_v2.company_healer_resolution_observations
              SET evidence_sha256 = evidence_sha256`,
        ),
      ).rejects.toThrow(/append-only/);
    });

    it('keeps approval-required and stale lifecycle incidents as distinct pending decisions', async () => {
      if (!pool) throw new Error('disposable pool is unavailable');
      const catalog = buildHealerResolutionCatalog(
        [
          sourceRow({
            id: '2',
            fingerprint: 'bbbbbbbbbbbbbbbb',
            status: 'awaiting_approval',
            updated_at: '2026-08-23T18:30:00.000Z',
          }),
          sourceRow({
            id: '3',
            fingerprint: 'cccccccccccccccc',
            status: 'investigating',
            updated_at: '2026-08-23T17:00:00.000Z',
          }),
        ],
        '2026-08-23T19:00:00.000Z',
      );

      const applied = await transaction((client) =>
        applyHealerCompanyWorkCatalogWithClient(client, catalog),
      );
      expect(applied.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sourceKey: 'healer:bbbbbbbbbbbbbbbb',
            operation: 'ensure_blocked',
          }),
          expect.objectContaining({
            sourceKey: 'healer:cccccccccccccccc',
            operation: 'ensure_blocked',
          }),
        ]),
      );

      const durable = await pool.query(
        `SELECT w.source_key, w.disposition, o.decision_code,
                count(*) OVER ()::int AS item_count
           FROM business_v2.company_work_items w
           JOIN LATERAL (
             SELECT decision_code
               FROM business_v2.company_healer_resolution_observations
              WHERE work_item_id = w.id
              ORDER BY observed_at DESC, id DESC
              LIMIT 1
           ) o ON true
          WHERE w.source_key IN (
            'healer:bbbbbbbbbbbbbbbb', 'healer:cccccccccccccccc'
          )
          ORDER BY w.source_key`,
      );
      expect(durable.rows).toEqual([
        expect.objectContaining({
          source_key: 'healer:bbbbbbbbbbbbbbbb',
          disposition: 'blocked',
          decision_code: 'approve_proposed_fix',
          item_count: 2,
        }),
        expect.objectContaining({
          source_key: 'healer:cccccccccccccccc',
          disposition: 'blocked',
          decision_code: 'review_stale_lifecycle_state',
          item_count: 2,
        }),
      ]);
    });
  },
);
