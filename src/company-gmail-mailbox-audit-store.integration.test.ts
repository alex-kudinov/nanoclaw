import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';

import {
  deriveCompanyGmailMailboxAuditCompletionEvidence,
  type CompanyGmailMailboxAuditSnapshot,
} from './company-gmail-mailbox-audit.js';
import {
  beginCompanyGmailMailboxAuditWithClient,
  completeCompanyGmailMailboxAuditWithClient,
  recordCompanyGmailMailboxAuditPageWithClient,
} from './company-gmail-mailbox-audit-store.js';
import { createCompanyGmailInboundSource } from './company-gmail-reconciliation.js';
import { COMPANY_GMAIL_SOURCE_OPTIONS } from './company-gmail-source-bootstrap.js';

const TEST_DATABASE_URL =
  process.env.COMPANY_GMAIL_MAILBOX_AUDIT_TEST_DATABASE_URL;
const pool = TEST_DATABASE_URL
  ? new Pool({ connectionString: TEST_DATABASE_URL, max: 2 })
  : null;
const source = createCompanyGmailInboundSource(COMPANY_GMAIL_SOURCE_OPTIONS);
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

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
  'Company Gmail mailbox audit disposable PostgreSQL',
  () => {
    beforeEach(async () => {
      if (!pool) throw new Error('disposable pool is unavailable');
      await pool.query(
        `TRUNCATE business_v2.company_gmail_mailbox_audit_candidates,
                  business_v2.company_gmail_mailbox_audit_pages,
                  business_v2.company_gmail_mailbox_audits`,
      );
      await pool.query(
        `DELETE FROM business_v2.company_trigger_watermark_state`,
      );
      await pool.query(`DELETE FROM business_v2.company_trigger_sources`);
      await pool.query(
        `INSERT INTO business_v2.company_trigger_sources
           (definition_id, source_fingerprint)
         VALUES ($1, $2)`,
        [source.definitionId, source.sourceFingerprint],
      );
      await pool.query(
        `INSERT INTO business_v2.company_trigger_watermark_state
           (definition_id, version, status, cursor_value)
         VALUES ($1, 1, 'current', '100')`,
        [source.definitionId],
      );
    });

    afterAll(async () => {
      await pool?.end();
    });

    it('commits closed three-way accounting and exact completion', async () => {
      const begun = await transaction((client) =>
        beginCompanyGmailMailboxAuditWithClient(client, {
          startedAt: '2026-08-18T15:00:00.000Z',
          initialHistoryId: '200',
        }),
      );
      expect(begun).toMatchObject({ applied: true, duplicate: false });

      const listed = await transaction((client) =>
        recordCompanyGmailMailboxAuditPageWithClient(client, {
          auditId: begun.snapshot.auditId,
          expectedVersion: 0,
          requestPageToken: null,
          page: {
            messageIds: ['accepted-1', 'unknown-1'],
            nextPageToken: null,
          },
          candidates: [
            {
              messageId: 'accepted-1',
              disposition: 'accepted',
              reasonKey: 'inbound_message_persisted',
              evidenceSha256: HASH_A,
            },
            {
              messageId: 'unknown-1',
              disposition: 'unknown',
              reasonKey: 'receipt_missing',
              evidenceSha256: HASH_B,
            },
          ],
        }),
      );
      expect(listed.snapshot).toMatchObject({
        status: 'listed',
        version: 1,
        candidateCount: 2,
        acceptedCount: 1,
        rejectedCount: 0,
        unknownCount: 1,
      });

      const completionEvidence =
        deriveCompanyGmailMailboxAuditCompletionEvidence(
          listed.snapshot,
          '200',
        );
      const completed = await transaction((client) =>
        completeCompanyGmailMailboxAuditWithClient(client, {
          auditId: listed.snapshot.auditId,
          expectedVersion: 1,
          completedAt: '2026-08-18T15:00:02.000Z',
          finalHistoryId: '200',
          auditEvidenceSha256: completionEvidence,
        }),
      );
      expect(completed.snapshot).toMatchObject({
        status: 'complete',
        version: 2,
        auditEvidenceSha256: completionEvidence,
      });

      const durable = await pool!.query(
        `SELECT
           (SELECT count(*)::int FROM business_v2.company_gmail_mailbox_audits) AS audits,
           (SELECT count(*)::int FROM business_v2.company_gmail_mailbox_audit_pages) AS pages,
           (SELECT count(*)::int FROM business_v2.company_gmail_mailbox_audit_candidates) AS candidates,
           candidate_count, accepted_count, rejected_count, unknown_count,
           status, next_page_token
         FROM business_v2.company_gmail_mailbox_audits`,
      );
      expect(durable.rows[0]).toEqual({
        audits: 1,
        pages: 1,
        candidates: 2,
        candidate_count: 2,
        accepted_count: 1,
        rejected_count: 0,
        unknown_count: 1,
        status: 'complete',
        next_page_token: null,
      });
    });

    it('refuses a page when the registered cursor authority drifts', async () => {
      const begun = await transaction((client) =>
        beginCompanyGmailMailboxAuditWithClient(client, {
          startedAt: '2026-08-18T15:00:00.000Z',
          initialHistoryId: '200',
        }),
      );
      await pool!.query(
        `UPDATE business_v2.company_trigger_watermark_state
            SET version = 2, cursor_value = '101'
          WHERE definition_id = $1`,
        [source.definitionId],
      );
      await expect(
        transaction((client) =>
          recordCompanyGmailMailboxAuditPageWithClient(client, {
            auditId: begun.snapshot.auditId,
            expectedVersion: 0,
            requestPageToken: null,
            page: { messageIds: [], nextPageToken: null },
            candidates: [],
          }),
        ),
      ).rejects.toMatchObject({ code: 'conflict' });
      const durable = await pool!.query<CompanyGmailMailboxAuditSnapshot>(
        `SELECT pages_read AS "pagesRead", candidate_count AS "candidateCount"
           FROM business_v2.company_gmail_mailbox_audits`,
      );
      expect(durable.rows[0]).toMatchObject({
        pagesRead: 0,
        candidateCount: 0,
      });
    });
  },
);
