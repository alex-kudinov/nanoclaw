import { randomUUID } from 'crypto';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

import {
  PostgresStudentLifecycleRepository,
  processPreparedCommunityLifecycle,
} from './student-lifecycle-store.js';
import { runStudentLifecycleCatalog } from './student-lifecycle-shadow-catalog.js';
import { loadStudentLifecycleShadowManifest } from './student-lifecycle-shadow-manifest.js';
import { prepareCommunityLifecycleEnvelope } from './student-lifecycle.js';

const TEST_DATABASE_URL = process.env.STUDENT_LIFECYCLE_TEST_DATABASE_URL;
const pool = TEST_DATABASE_URL
  ? new Pool({ connectionString: TEST_DATABASE_URL, max: 2 })
  : null;

const COMMUNITY = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const GROUP = '33333333-3333-4333-8333-333333333333';
const COURSE = '44444444-4444-4444-8444-444444444444';
const SECRET = 'integration-test-student-lifecycle-secret';
let partyId = 0;

function prepare(action: 'USER_JOIN' | 'GROUP_JOIN' | 'COURSE_COMPLETED') {
  const data = {
    USER_JOIN: { id: USER, name: 'Test Student', email: 'test@example.com' },
    GROUP_JOIN: { userID: USER, groupID: GROUP },
    COURSE_COMPLETED: {
      userID: USER,
      courseID: COURSE,
      courseName: 'Test Course',
    },
  }[action];
  return prepareCommunityLifecycleEnvelope(
    {
      schema_version: 1,
      workspace: 'community',
      community_id: COMMUNITY,
      delivery_id: randomUUID(),
      observed_at: new Date().toISOString(),
      action: { name: action },
      data,
    },
    SECRET,
  );
}

async function inbox(): Promise<number> {
  if (!pool) throw new Error('disposable pool unavailable');
  const result = await pool.query<{ id: string }>(
    `INSERT INTO business_v2.webhook_inbox
       (source, event_id, event_type, raw_body)
     VALUES ('student-lifecycle', $1, 'integration-fixture', '{}'::jsonb)
     RETURNING id::text`,
    [randomUUID()],
  );
  return Number(result.rows[0].id);
}

async function processEvent(
  event: ReturnType<typeof prepare>['prepared'],
  webhookInboxId: number,
  transientEmail?: string | null,
) {
  if (!pool) throw new Error('disposable pool unavailable');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await processPreparedCommunityLifecycle({
      repository: new PostgresStudentLifecycleRepository(client),
      event,
      webhookInboxId,
      transientEmail,
    });
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
  'Community student lifecycle disposable PostgreSQL',
  () => {
    beforeEach(async () => {
      if (!pool) throw new Error('disposable pool unavailable');
      await pool.query(`
        TRUNCATE
          business_v2.student_lifecycle_exceptions,
          business_v2.student_lifecycle_state_history,
          business_v2.student_lifecycle_enrollments,
          business_v2.student_lifecycle_events,
          business_v2.student_lifecycle_reconciliation_runs,
          business_v2.student_lifecycle_identity_links,
          business_v2.student_lifecycle_catalog_entries,
          business_v2.party_emails,
          business_v2.webhook_inbox,
          business_v2.parties
        RESTART IDENTITY CASCADE
      `);
      const party = await pool.query<{ id: string }>(
        `INSERT INTO business_v2.parties
           (party_type, display_name, primary_email, last_updated_by)
         VALUES ('person', 'Test Student', 'test@example.com', 'integration-test')
         RETURNING id::text`,
      );
      partyId = Number(party.rows[0].id);
      await pool.query(
        `INSERT INTO business_v2.party_emails (party_id, email)
         VALUES ($1, 'test@example.com')`,
        [partyId],
      );
      await pool.query(
        `INSERT INTO business_v2.student_lifecycle_catalog_entries
           (entry_key, catalog_revision, catalog_sha256,
            heartbeat_community_id, heartbeat_group_id, heartbeat_course_id,
            offer_id, mapping_scope, lifecycle_enabled, policy_version,
            source_ref, evidence_sha256, effective_from)
         VALUES
           ('test-course', 1, repeat('a',64), $1::uuid, $2::uuid, $3::uuid,
            'test-offer', 'exact_offer', true, 'test-v1', 'fixture:test',
            repeat('b',64), now() - interval '1 hour')`,
        [COMMUNITY, GROUP, COURSE],
      );
    });

    afterAll(async () => {
      await pool?.end();
    });

    it('binds identity, projects access/completion, and preserves other axes', async () => {
      const joined = prepare('USER_JOIN');
      const joinResult = await processEvent(
        joined.prepared,
        await inbox(),
        joined.transient_email,
      );
      expect(joinResult.processingStatus).toBe('applied');
      expect(joinResult.partyId).toBe(partyId);

      const group = prepare('GROUP_JOIN');
      const groupResult = await processEvent(group.prepared, await inbox());
      expect(groupResult.processingStatus).toBe('applied');
      expect(groupResult.enrollmentIds).toHaveLength(1);

      const completed = prepare('COURSE_COMPLETED');
      const completionResult = await processEvent(
        completed.prepared,
        await inbox(),
      );
      expect(completionResult.processingStatus).toBe('applied');

      if (!pool) throw new Error('disposable pool unavailable');
      const state = await pool.query(
        `SELECT access_state, activation_state, learning_state, grading_state,
                certificate_state, finance_state, marketing_consent_state,
                version
           FROM business_v2.student_lifecycle_enrollments`,
      );
      expect(state.rows).toEqual([
        expect.objectContaining({
          access_state: 'provisioned',
          activation_state: 'unknown',
          learning_state: 'completed',
          grading_state: 'unknown',
          certificate_state: 'blocked',
          finance_state: 'unknown',
          marketing_consent_state: 'unknown',
          version: 2,
        }),
      ]);
      const history = await pool.query(
        `SELECT axis, next_value
           FROM business_v2.student_lifecycle_state_history
          ORDER BY id`,
      );
      expect(history.rows).toEqual([
        { axis: 'access', next_value: 'provisioned' },
        { axis: 'learning', next_value: 'completed' },
      ]);
      const healthClient = await pool.connect();
      const health = await new PostgresStudentLifecycleRepository(
        healthClient,
      ).health();
      healthClient.release();
      expect(health).toMatchObject({
        eventCount: 3,
        activeEnrollmentCount: 1,
        openExceptionCount: 0,
      });
    });

    it('quarantines unknown identity without storing raw email', async () => {
      if (!pool) throw new Error('disposable pool unavailable');
      await pool.query('TRUNCATE business_v2.party_emails');
      await pool.query('UPDATE business_v2.parties SET primary_email = NULL');
      const joined = prepare('USER_JOIN');
      const result = await processEvent(
        joined.prepared,
        await inbox(),
        joined.transient_email,
      );
      expect(result.processingStatus).toBe('quarantined');
      expect(result.exceptionReason).toBe('needs_identity');
      const lifecycle = await pool.query(
        `SELECT identity_fingerprint, facts::text, processing_status
           FROM business_v2.student_lifecycle_events`,
      );
      expect(lifecycle.rows[0].identity_fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(lifecycle.rows[0].facts).not.toContain('test@example.com');
      expect(lifecycle.rows[0].processing_status).toBe('quarantined');
    });

    it('applies the exact shadow catalog once and receipts replay', async () => {
      if (!pool) throw new Error('disposable pool unavailable');
      const manifest = loadStudentLifecycleShadowManifest(
        path.join(
          process.cwd(),
          'facts/catalogs/student-lifecycle-community-shadow-v1.json',
        ),
      );
      const run = async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const report = await runStudentLifecycleCatalog({
            client,
            manifest,
            mode: 'apply',
            observedAt: '2026-08-24T18:30:00.000Z',
          });
          await client.query('COMMIT');
          return report;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      };
      const first = await run();
      expect(first).toMatchObject({ inserted: 1, receiptDuplicate: false });
      const replay = await run();
      expect(replay).toMatchObject({ inserted: 0, receiptDuplicate: false });
      const exactReplay = await run();
      expect(exactReplay).toMatchObject({
        inserted: 0,
        receiptDuplicate: true,
      });
      const stored = await pool.query(
        `SELECT entry_key, mapping_scope, lifecycle_enabled
           FROM business_v2.student_lifecycle_catalog_entries
          WHERE entry_key = $1`,
        [manifest.catalog_entries[0].entry_key],
      );
      expect(stored.rows).toEqual([
        {
          entry_key: manifest.catalog_entries[0].entry_key,
          mapping_scope: 'exact_cohort',
          lifecycle_enabled: true,
        },
      ]);
    });

    it('refuses conflicting event and reconciliation idempotency keys', async () => {
      if (!pool) throw new Error('disposable pool unavailable');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const repository = new PostgresStudentLifecycleRepository(client);
        const event = prepare('GROUP_JOIN').prepared;
        const first = await repository.insertEvent({
          event,
          webhookInboxId: await inbox(),
          partyId,
          catalog: null,
          mappingStatus: 'not_applicable',
          processingStatus: 'normalized',
        });
        expect(first.duplicate).toBe(false);
        await expect(
          repository.insertEvent({
            event: { ...event, payload_sha256: 'f'.repeat(64) },
            webhookInboxId: await inbox(),
            partyId,
            catalog: null,
            mappingStatus: 'not_applicable',
            processingStatus: 'normalized',
          }),
        ).rejects.toThrow('student_lifecycle_source_event_conflict');

        const reconciliation = {
          runKey: 'integration:registry:conflict',
          runType: 'registry' as const,
          scopeKey: 'integration:registry',
          catalogRevision: 1,
          sourceSnapshotSha256: 'a'.repeat(64),
          watermarkBefore: null,
          watermarkAfter: 'a'.repeat(64),
          scopesExpected: 1,
          scopesObserved: 1,
          factsNew: 1,
          factsUnchanged: 0,
          factsConflicting: 0,
          factsQuarantined: 0,
          status: 'completed' as const,
          errorCode: null,
          startedAt: '2026-08-24T18:30:00.000Z',
          completedAt: '2026-08-24T18:30:00.000Z',
        };
        expect(
          await repository.recordReconciliationRun(reconciliation),
        ).toMatchObject({
          duplicate: false,
        });
        expect(
          await repository.recordReconciliationRun(reconciliation),
        ).toMatchObject({
          duplicate: true,
        });
        await expect(
          repository.recordReconciliationRun({
            ...reconciliation,
            sourceSnapshotSha256: 'b'.repeat(64),
          }),
        ).rejects.toThrow('student_lifecycle_reconciliation_run_conflict');
      } finally {
        await client.query('ROLLBACK').catch(() => undefined);
        client.release();
      }
    });
  },
);
