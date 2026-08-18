import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

import {
  buildCompanyGmailSourceBootstrapPlan,
  runCompanyGmailSourceBootstrap,
  type CompanyGmailSourceBootstrapDependencies,
} from './company-gmail-source-bootstrap.js';
import {
  recordCompanyTriggerWatermarkWithClient,
  registerCompanyTriggerSourceWithClient,
} from './company-trigger-source.js';

const TEST_DATABASE_URL = process.env.COMPANY_GMAIL_BOOTSTRAP_TEST_DATABASE_URL;
const HISTORY_ID = '123456789';
const OBSERVED_AT = '2026-08-18T05:00:00.000Z';
const NOW = '2026-08-18T05:01:00.000Z';

const pool = TEST_DATABASE_URL
  ? new Pool({ connectionString: TEST_DATABASE_URL, max: 2 })
  : null;

function dependencies(
  cursors: readonly string[],
): CompanyGmailSourceBootstrapDependencies {
  let cursorIndex = 0;
  return {
    readHistoryId: () => cursors[Math.min(cursorIndex++, cursors.length - 1)],
    now: () => NOW,
    withTransaction: async (fn) => {
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
    },
    registerSource: registerCompanyTriggerSourceWithClient,
    recordWatermark: recordCompanyTriggerWatermarkWithClient,
  };
}

describe.skipIf(!TEST_DATABASE_URL)(
  'Company Gmail source bootstrap disposable PostgreSQL',
  () => {
    afterAll(async () => {
      await pool?.end();
    });

    it('rolls back cursor drift, then applies and exactly replays one source/event/state', async () => {
      if (!pool) throw new Error('disposable pool is unavailable');

      await expect(
        runCompanyGmailSourceBootstrap(
          {
            mode: 'apply',
            expectedHistoryId: HISTORY_ID,
            observedAt: OBSERVED_AT,
          },
          dependencies([HISTORY_ID, HISTORY_ID, '987654321']),
        ),
      ).rejects.toMatchObject({ code: 'cursor_drift' });

      const afterRollback = await pool.query(
        `SELECT
           (SELECT count(*)::int FROM business_v2.company_trigger_sources) AS sources,
           (SELECT count(*)::int FROM business_v2.company_trigger_watermark_events) AS events,
           (SELECT count(*)::int FROM business_v2.company_trigger_watermark_state) AS states`,
      );
      expect(afterRollback.rows[0]).toEqual({
        sources: 0,
        events: 0,
        states: 0,
      });

      const applied = await runCompanyGmailSourceBootstrap(
        {
          mode: 'apply',
          expectedHistoryId: HISTORY_ID,
          observedAt: OBSERVED_AT,
        },
        dependencies([HISTORY_ID]),
      );
      expect(applied.postgres).toMatchObject({
        sourceApplied: true,
        sourceDuplicate: false,
        bootstrapApplied: true,
        bootstrapDuplicate: false,
        stateVersion: 1,
        stateStatus: 'current',
      });

      const replay = await runCompanyGmailSourceBootstrap(
        {
          mode: 'apply',
          expectedHistoryId: HISTORY_ID,
          observedAt: OBSERVED_AT,
        },
        dependencies([HISTORY_ID]),
      );
      expect(replay.postgres).toMatchObject({
        sourceApplied: false,
        sourceDuplicate: true,
        bootstrapApplied: false,
        bootstrapDuplicate: true,
        stateVersion: 1,
        stateStatus: 'current',
      });

      const plan = buildCompanyGmailSourceBootstrapPlan({
        historyId: HISTORY_ID,
        observedAt: OBSERVED_AT,
      });
      const durable = await pool.query(
        `SELECT
           (SELECT count(*)::int FROM business_v2.company_trigger_sources) AS sources,
           (SELECT count(*)::int FROM business_v2.company_trigger_watermark_events) AS events,
           (SELECT count(*)::int FROM business_v2.company_trigger_watermark_state) AS states,
           s.definition_id,
           s.source_key,
           s.adapter_key,
           s.adapter_version,
           w.version::int,
           w.status,
           w.cursor_value,
           e.event_key,
           e.event_type,
           e.observed_count,
           e.accepted_count,
           e.rejected_count
         FROM business_v2.company_trigger_sources s
         JOIN business_v2.company_trigger_watermark_state w
           USING (definition_id)
         JOIN business_v2.company_trigger_watermark_events e
           ON e.id = w.last_event_id`,
      );
      expect(durable.rows[0]).toMatchObject({
        sources: 1,
        events: 1,
        states: 1,
        definition_id: plan.source.definitionId,
        source_key: 'mailbox:primary:inbound-v1',
        adapter_key: 'gmail_inbound_full_snapshot',
        adapter_version: '1.0.0',
        version: 1,
        status: 'current',
        cursor_value: HISTORY_ID,
        event_key: plan.event.eventKey,
        event_type: 'bootstrap',
        observed_count: 0,
        accepted_count: 0,
        rejected_count: 0,
      });
    });
  },
);
