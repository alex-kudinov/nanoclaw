import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sha256Json } from './relationship-context-contract.js';
import {
  clearRelationshipContextGrantsForTests,
  consumeRelationshipContextGrant,
  issueRelationshipContextGrant,
} from './relationship-context-policy.js';
import {
  REFERENCE_LMS_FACTS,
  ReferenceLmsAdapter,
} from './relationship-context-reference-adapter.js';
import { RelationshipContextRegistry } from './relationship-context-registry.js';
import { PostgresRelationshipContextRepository } from './relationship-context-store.js';
import {
  getRelationshipContext,
  ingestRelationshipContextBatch,
} from './relationship-context.js';

const database = process.env.RELATIONSHIP_CONTEXT_TEST_DATABASE;
const suite = database ? describe : describe.skip;

suite('relationship context disposable PostgreSQL store', () => {
  const pool = new Pool({ database, host: '/tmp' });
  let partyId: number;

  beforeAll(async () => {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO business_v2.parties
         (party_type,display_name,last_updated_by)
       VALUES ('person','RC Store Fixture','integration')
       RETURNING id::text`,
    );
    partyId = Number(result.rows[0].id);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('persists exact identity, idempotent observations/projections, and a minimized query receipt', async () => {
    clearRelationshipContextGrantsForTests();
    const client = await pool.connect();
    try {
      const repository = new PostgresRelationshipContextRepository(client);
      const registry = new RelationshipContextRegistry();
      for (const factType of REFERENCE_LMS_FACTS) {
        registry.registerFact({
          factType,
          schemaVersion: 1,
          projectionTarget: 'learning',
          privacyClass: 'internal',
          maxAgeSeconds: 93_600,
          cardinality: 'many',
          authorityClass: 'native',
        });
      }
      const adapter = new ReferenceLmsAdapter();
      registry.registerAdapter(adapter);
      registry.markConformance('reference_lms', 'passed');
      const fingerprint = sha256Json({
        scope: 'fixture-primary',
        user_id: 'u-pg-1',
      });
      await repository.addIdentifierClaim({
        partyId,
        kind: 'provider_user_id',
        fingerprint,
        verified: true,
        effectiveAt: '2026-08-25T18:00:00Z',
        evidenceSha256: 'a'.repeat(64),
      });
      const batch = adapter.normalizeWebhook({
        scope: 'fixture-primary',
        observedAt: '2026-08-25T18:00:00Z',
        correlationId: 'pg-fixture',
        payload: {
          user_id: 'u-pg-1',
          course_id: 'c-pg-1',
          enrollment_id: 'e-pg-1',
          status: 'active',
          progress_percent: 40,
        },
      });
      const first = await ingestRelationshipContextBatch({
        repository,
        registry,
        batch,
      });
      expect(first.observationsNew).toBe(2);
      const replay = await ingestRelationshipContextBatch({
        repository,
        registry,
        batch,
      });
      expect(replay.observationsDuplicate).toBe(2);
      const env = { RELATIONSHIP_CONTEXT_ENABLED: '1' } as NodeJS.ProcessEnv;
      issueRelationshipContextGrant({
        group: 'grader',
        runId: '00000000-0000-4000-8000-000000000099',
        sourceContainer: 'container-pg',
        workItemId: 'work:pg:fixture',
        purpose: 'grading_prerequisite',
        subject: { kind: 'party', partyId },
        sections: ['learning'],
        env,
      });
      const grant = consumeRelationshipContextGrant({
        group: 'grader',
        runId: '00000000-0000-4000-8000-000000000099',
        sourceContainer: 'container-pg',
        request: {
          purpose: 'grading_prerequisite',
          subject: { kind: 'party', partyId },
          sections: ['learning'],
        },
        env,
      });
      const pack = await getRelationshipContext({ repository, grant });
      expect(pack.resolution).toBe('resolved');
      expect(pack.sections.learning?.projections).toHaveLength(2);
      await repository.markQueryDelivery({
        receiptId: pack.receiptId,
        status: 'delivered',
        errorCode: null,
        deliveredAt: new Date().toISOString(),
      });
      const receipt = await client.query<{
        work_item_id: string;
        response_sha256: string;
        delivery_status: string;
      }>(
        `SELECT work_item_id,response_sha256,delivery_status
           FROM business_v2.party_context_query_receipts
          WHERE id=$1`,
        [pack.receiptId],
      );
      expect(receipt.rows[0].work_item_id).toBe('work:pg:fixture');
      expect(receipt.rows[0].response_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(receipt.rows[0].delivery_status).toBe('delivered');
    } finally {
      client.release();
    }
  });
});
