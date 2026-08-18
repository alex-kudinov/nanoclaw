import { afterAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';

import {
  COMPANY_GMAIL_SOURCE_REGISTRATION_INPUT,
  buildCompanyGmailSourceBootstrapPlan,
} from './company-gmail-source-bootstrap.js';
import {
  deriveCompanyGmailRuntimeCursorSha256,
  runCompanyGmailRuntimeAlignment,
} from './company-gmail-runtime-alignment.js';
import {
  createCompanyGmailRuntimeWatermark,
  readCompanyGmailRuntimeWatermarkStateWithClient,
  recordCompanyGmailRuntimeAdvanceWithClient,
} from './company-gmail-runtime-watermark.js';
import {
  recordCompanyTriggerWatermarkWithClient,
  registerCompanyTriggerSourceWithClient,
} from './company-trigger-source.js';

const TEST_DATABASE_URL = process.env.COMPANY_GMAIL_RUNTIME_TEST_DATABASE_URL;
const pool = TEST_DATABASE_URL
  ? new Pool({ connectionString: TEST_DATABASE_URL, max: 2 })
  : null;
const OBSERVED = '2026-08-18T12:00:00.000Z';
const THROUGH = '2026-08-18T12:01:00.000Z';

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

function recordInput(
  event: ReturnType<typeof buildCompanyGmailSourceBootstrapPlan>['event'],
) {
  return {
    definitionId: event.definitionId,
    eventKey: event.eventKey,
    eventType: event.eventType,
    expectedVersion: event.expectedVersion,
    previousCursor: event.previousCursor,
    nextCursor: event.nextCursor,
    observedFrom: event.observedFrom,
    observedThrough: event.observedThrough,
    evidenceSha256: event.evidenceSha256,
    observedCount: event.observedCount,
    acceptedCount: event.acceptedCount,
    rejectedCount: event.rejectedCount,
    gapReason: event.gapReason,
    resolvesEventId: event.resolvesEventId,
  };
}

describe.skipIf(!TEST_DATABASE_URL)(
  'Company Gmail runtime watermark disposable PostgreSQL',
  () => {
    afterAll(async () => {
      await pool?.end();
    });

    it('aligns, crash-catches SQLite up, and freezes one durable 404 gap', async () => {
      if (!pool) throw new Error('disposable pool is unavailable');
      const bootstrap = buildCompanyGmailSourceBootstrapPlan({
        historyId: '100',
        observedAt: OBSERVED,
      });
      await transaction(async (client) => {
        await registerCompanyTriggerSourceWithClient(
          client,
          COMPANY_GMAIL_SOURCE_REGISTRATION_INPUT,
        );
        await recordCompanyTriggerWatermarkWithClient(
          client,
          recordInput(bootstrap.event),
        );
      });

      const alignment = await runCompanyGmailRuntimeAlignment(
        {
          mode: 'apply',
          expectedSqliteCursorSha256: deriveCompanyGmailRuntimeCursorSha256(
            'sqlite',
            '200',
          ),
          expectedWatermarkCursorSha256: deriveCompanyGmailRuntimeCursorSha256(
            'watermark',
            '100',
          ),
          observedAt: THROUGH,
        },
        {
          readSqliteCursor: () => '200',
          readWatermarkState: readCompanyGmailRuntimeWatermarkStateWithClient,
          listClosedRange: async () => ({
            startHistoryId: '100',
            targetHistoryId: '200',
            terminalHeadHistoryId: '250',
            pagesRead: 1,
            candidates: [
              {
                messageId: 'm1',
                disposition: 'accepted',
                reasonKey: 'inbound_message_persisted',
                evidenceSha256: 'a'.repeat(64),
              },
            ],
          }),
          withTransaction: transaction,
          recordAdvance: recordCompanyGmailRuntimeAdvanceWithClient,
          now: () => THROUGH,
        },
      );
      expect(alignment.postgres).toMatchObject({
        advanceApplied: true,
        stateVersion: 2,
      });

      const bridge = createCompanyGmailRuntimeWatermark({
        withTransaction: transaction,
      });
      await expect(bridge.prepare('100')).resolves.toMatchObject({
        decision: 'catch_up_sqlite',
        cursor: '200',
        stateVersion: 2,
      });
      await expect(bridge.prepare('200')).resolves.toMatchObject({
        decision: 'proceed',
        cursor: '200',
      });
      const gap = await bridge.recordGap({
        previousCursor: '200',
        notificationHistoryId: '300',
        detectedAt: '2026-08-18T12:02:00.000Z',
      });
      expect(gap).toMatchObject({
        applied: true,
        state: { version: 3, status: 'gap', cursorValue: '200' },
      });
      await expect(bridge.prepare('200')).resolves.toMatchObject({
        decision: 'hold_gap',
        cursor: '200',
        stateVersion: 3,
      });
      await expect(
        bridge.recordAdvance({
          previousCursor: '200',
          nextCursor: '400',
          observedThrough: '2026-08-18T12:03:00.000Z',
          candidates: [],
        }),
      ).rejects.toMatchObject({ code: 'cursor_drift' });

      const durable = await pool.query(
        `SELECT w.version::int, w.status, w.cursor_value,
                count(e.id)::int AS events,
                count(*) FILTER (WHERE e.event_type = 'advance')::int AS advances,
                count(*) FILTER (WHERE e.event_type = 'gap_detected')::int AS gaps
           FROM business_v2.company_trigger_watermark_state w
           JOIN business_v2.company_trigger_watermark_events e
             USING (definition_id)
          GROUP BY w.version, w.status, w.cursor_value`,
      );
      expect(durable.rows[0]).toMatchObject({
        version: 3,
        status: 'gap',
        cursor_value: '200',
        events: 3,
        advances: 1,
        gaps: 1,
      });
    });
  },
);
