import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

import {
  PostgresCompanyWorkOutcomeReviewStore,
  type CompanyWorkOutcomeReviewEvidence,
} from './company-work-outcome-review.js';

const TEST_DATABASE_URL =
  process.env.COMPANY_WORK_OUTCOME_REVIEW_TEST_DATABASE_URL;
const pool = TEST_DATABASE_URL
  ? new Pool({ connectionString: TEST_DATABASE_URL, max: 2 })
  : null;
const store = new PostgresCompanyWorkOutcomeReviewStore({
  query: async (sql, params) => {
    if (!pool) throw new Error('disposable pool unavailable');
    return pool.query(sql, params);
  },
  withAgentContext: async (fn) => {
    if (!pool) throw new Error('disposable pool unavailable');
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
});

describe.skipIf(!TEST_DATABASE_URL)(
  'Company Work outcome review disposable PostgreSQL',
  () => {
    beforeAll(async () => {
      if (!pool) throw new Error('disposable pool unavailable');
      await pool.query(`
      INSERT INTO business_v2.parties (party_type, display_name)
      VALUES ('person', 'Synthetic Review Fixture');
      INSERT INTO business_v2.programs (slug, kind, display_name)
      VALUES ('synthetic-review', 'cohort', 'Synthetic Review');
      INSERT INTO business_v2.pipeline_entries (party_id, program_id, stage)
      SELECT p.id, g.id, 'new'
        FROM business_v2.parties p, business_v2.programs g
       WHERE p.display_name = 'Synthetic Review Fixture'
         AND g.slug = 'synthetic-review';
      INSERT INTO business_v2.company_work_items
        (workflow_type, source_system, source_key, party_id, pipeline_entry_id,
         stage, disposition, version, created_at, updated_at,
         last_transition_at)
      SELECT 'sales_email', 'sqlite_email_action', 'action-1', p.id, e.id,
             'outcome_validated', 'completed', 2,
             '2026-08-20T10:00:00Z', '2026-08-20T11:30:00Z',
             '2026-08-20T11:30:00Z'
        FROM business_v2.parties p
        JOIN business_v2.pipeline_entries e ON e.party_id = p.id
       WHERE p.display_name = 'Synthetic Review Fixture';
      INSERT INTO business_v2.company_work_receipts
        (work_item_id, receipt_type, receipt_system, receipt_key,
         evidence_sha256, external_action_id, occurred_at)
      SELECT id, 'external_delivery', 'gmail', 'gmail-receipt-1',
             repeat('a', 64), 'action-1', '2026-08-20T11:00:00Z'
        FROM business_v2.company_work_items WHERE source_key = 'action-1';
      INSERT INTO business_v2.company_work_receipts
        (work_item_id, receipt_type, receipt_system, receipt_key,
         evidence_sha256, external_action_id, occurred_at)
      SELECT id, 'outcome_validation', 'sqlite_messages', 'slack-outcome-1',
             repeat('b', 64), 'action-1', '2026-08-20T11:30:00Z'
        FROM business_v2.company_work_items WHERE source_key = 'action-1';
      INSERT INTO business_v2.company_work_events
        (work_item_id, work_item_version, event_type, from_stage, to_stage,
         from_disposition, to_disposition, actor, source_system,
         source_event_key, idempotency_key, event_fingerprint,
         evidence_sha256, occurred_at)
      SELECT id, 0, 'accepted', NULL, 'accepted', NULL, 'open',
             'fixture', 'fixture', 'accepted', 'accepted', repeat('c', 64),
             repeat('d', 64), '2026-08-20T10:00:00Z'
        FROM business_v2.company_work_items WHERE source_key = 'action-1';
      INSERT INTO business_v2.company_work_events
        (work_item_id, work_item_version, event_type, from_stage, to_stage,
         from_disposition, to_disposition, actor, source_system,
         source_event_key, idempotency_key, event_fingerprint, receipt_id,
         occurred_at)
      SELECT i.id, 1, 'external_acknowledged', 'accepted',
             'external_acknowledged', 'open', 'open', 'fixture', 'fixture',
             'external', 'external', repeat('e', 64), r.id,
             '2026-08-20T11:00:00Z'
        FROM business_v2.company_work_items i
        JOIN business_v2.company_work_receipts r ON r.work_item_id = i.id
       WHERE i.source_key = 'action-1' AND r.receipt_type = 'external_delivery';
      INSERT INTO business_v2.company_work_events
        (work_item_id, work_item_version, event_type, from_stage, to_stage,
         from_disposition, to_disposition, actor, source_system,
         source_event_key, idempotency_key, event_fingerprint, receipt_id,
         occurred_at)
      SELECT i.id, 2, 'outcome_validated', 'external_acknowledged',
             'outcome_validated', 'open', 'completed', 'fixture', 'fixture',
             'outcome', 'outcome', repeat('f', 64), r.id,
             '2026-08-20T11:30:00Z'
        FROM business_v2.company_work_items i
        JOIN business_v2.company_work_receipts r ON r.work_item_id = i.id
       WHERE i.source_key = 'action-1' AND r.receipt_type = 'outcome_validation';
    `);
    });

    afterAll(async () => {
      await pool?.end();
    });

    it('claims, binds, decides, and closes one content-free packet', async () => {
      if (!pool) throw new Error('disposable pool unavailable');
      const candidates = await store.listCandidates(
        '2026-08-19T00:00:00.000Z',
        10,
      );
      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({
        sourceKey: 'action-1',
        deliveryEventVersion: 1,
        deliveryReceiptKey: 'gmail-receipt-1',
        outcomeEventVersion: 2,
        outcomeReceiptKey: 'slack-outcome-1',
      });
      const evidence: CompanyWorkOutcomeReviewEvidence = {
        target: candidates[0],
        sourceText: 'transient only',
        approvedSubject: 'transient only',
        approvedBody: 'transient only',
        packetFingerprint: '1'.repeat(64),
        sourceKeySha256: '2'.repeat(64),
        evidenceSha256: '3'.repeat(64),
        evidenceOccurredAt: '2026-08-20T11:30:00.000Z',
      };
      const claim = await store.claimPacket(
        evidence,
        '2026-08-20T12:00:00.000Z',
      );
      expect(claim?.id).toMatch(/^[1-9][0-9]*$/);
      await expect(
        store.claimPacket(evidence, '2026-08-20T12:00:01.000Z'),
      ).resolves.toBeNull();
      await store.markPacketPosted(
        claim!.id,
        'slack:C1234567',
        '1800000000.000001',
        '2026-08-20T12:00:00.000Z',
      );

      const receipt = await pool.query<{ id: string }>(`
      INSERT INTO business_v2.company_work_outcome_quality_receipts
        (work_item_id, delivery_event_version, assessment_revision, assessment,
         source_system, source_key_sha256, evidence_sha256, assessor_kind,
         assessor_key_sha256, evidence_occurred_at, assessed_at)
      SELECT id, 1, 1, 'clean', 'operator_review', repeat('2', 64),
             repeat('3', 64), 'operator', repeat('4', 64),
             '2026-08-20T11:30:00Z', '2026-08-20T12:01:00Z'
        FROM business_v2.company_work_items WHERE source_key = 'action-1'
      RETURNING id::text
    `);
      await store.recordDecision({
        packetId: claim!.id,
        assessment: 'clean',
        actorSha256: '4'.repeat(64),
        reaction: 'white_check_mark',
        decidedAt: '2026-08-20T12:01:00.000Z',
        assessmentReceiptId: receipt.rows[0].id,
      });
      await store.markDecisionReceipt(
        claim!.id,
        'posted',
        '2026-08-20T12:01:01.000Z',
        '1800000001.000001',
      );

      await expect(
        store.findPacket('slack:C1234567', '1800000000.000001'),
      ).resolves.toMatchObject({
        status: 'decided',
        decisionAssessment: 'clean',
        decisionReceiptStatus: 'posted',
        assessmentReceiptId: receipt.rows[0].id,
      });
      const durable = await pool.query(`
      SELECT
        (SELECT count(*)::int FROM business_v2.company_work_outcome_review_packets) AS packets,
        (SELECT count(*)::int FROM business_v2.company_work_outcome_review_events) AS events
    `);
      expect(durable.rows[0]).toEqual({ packets: 1, events: 4 });
      await expect(
        pool.query(`
      UPDATE business_v2.company_work_outcome_review_packets
         SET decision_assessment = 'customer_visible_defect'
       WHERE id = ${claim!.id}
    `),
      ).rejects.toThrow(
        /invalid outcome-review packet transition|decision binding is immutable/,
      );
    });
  },
);
