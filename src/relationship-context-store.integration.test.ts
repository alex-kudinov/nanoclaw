import crypto from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sha256Json } from './relationship-context-contract.js';
import {
  clearRelationshipContextGrantsForTests,
  consumeRelationshipContextGrant,
  issueRelationshipContextGrant,
} from './relationship-context-policy.js';
import { runRelationshipContextExactReadCanary } from './relationship-context-live-canary.js';
import {
  ingestEnchargeSnapshotWithClient,
  reconcilePlutioReferencesWithClient,
} from './relationship-context-provider-reconciliation.js';
import { ingestTrafftRelationshipContextShadowWithClient } from './relationship-context-trafft-shadow.js';
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

  it('persists replay-safe minimized Trafft shadow context and registration', async () => {
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO business_v2.interactions
           (party_id,channel,direction,subject,occurred_at,source_provider,
            source_id,metadata,last_updated_by)
         VALUES ($1,'booking','inbound','fixture booking',$2::timestamptz,
                 'trafft','appt-shadow-pg',$3::jsonb,'integration')`,
        [
          partyId,
          '2026-08-25T20:00:00Z',
          JSON.stringify({
            event_type: 'booked',
            status: 'approved',
            service: 'Fixture consultation',
            raw_payload: {
              customerId: 'legacy-customer-pg',
              customerEmail: 'must-not-persist@example.invalid',
            },
          }),
        ],
      );
      const first = await ingestTrafftRelationshipContextShadowWithClient(
        client,
        { limit: 100, observedAt: '2026-08-25T20:05:00Z' },
      );
      expect(first.observationsNew).toBeGreaterThanOrEqual(1);
      expect(first.complete).toBe(true);
      expect(first.heldIdentityFacts).toBe(first.rows.length);
      expect(first.exactCustomerReferences).toBe(0);
      expect(first.exactAppointmentReferences).toBe(0);

      const safeParty = await client.query<{ id: string }>(
        `INSERT INTO business_v2.parties
           (party_type,display_name,source_provider,last_updated_by)
         VALUES ('person','Safe Trafft Fixture','trafft','integration')
         RETURNING id::text`,
      );
      await client.query(
        `INSERT INTO business_v2.interactions
           (party_id,channel,direction,subject,occurred_at,source_provider,
            source_id,metadata,last_updated_by)
         VALUES ($1,'booking','inbound','safe fixture booking',now(),'trafft',
                 'appt-safe-pg',$2::jsonb,'integration')`,
        [
          safeParty.rows[0].id,
          JSON.stringify({
            event_type: 'booked',
            status: 'approved',
            service: 'Safe fixture consultation',
            raw_payload: {
              customerId: 'safe-customer-pg',
              customerEmail: 'also-must-not-persist@example.invalid',
            },
          }),
        ],
      );
      const ambiguousParty = await client.query<{ id: string }>(
        `INSERT INTO business_v2.parties
           (party_type,display_name,source_provider,last_updated_by)
         VALUES ('person','Ambiguous Trafft Fixture','trafft','integration')
         RETURNING id::text`,
      );
      for (const suffix of ['a', 'b']) {
        await client.query(
          `INSERT INTO business_v2.interactions
             (party_id,channel,direction,subject,occurred_at,source_provider,
              source_id,metadata,last_updated_by)
           VALUES ($1,'booking','inbound','ambiguous fixture booking',now(),
                   'trafft',$2,$3::jsonb,'integration')`,
          [
            ambiguousParty.rows[0].id,
            `appt-ambiguous-pg-${suffix}`,
            JSON.stringify({
              event_type: 'booked',
              status: 'approved',
              service: 'Ambiguous fixture consultation',
              raw_payload: { customerId: `ambiguous-customer-pg-${suffix}` },
            }),
          ],
        );
      }
      const missingCustomerParty = await client.query<{ id: string }>(
        `INSERT INTO business_v2.parties
           (party_type,display_name,last_updated_by)
         VALUES ('person','Missing Customer Fixture','integration')
         RETURNING id::text`,
      );
      await client.query(
        `INSERT INTO business_v2.interactions
           (party_id,channel,direction,subject,occurred_at,source_provider,
            source_id,metadata,last_updated_by)
         VALUES ($1,'booking','inbound','missing customer fixture',now(),
                 'trafft','appt-missing-customer-pg',$2::jsonb,'integration')`,
        [
          missingCustomerParty.rows[0].id,
          JSON.stringify({ event_type: 'booked', status: 'approved' }),
        ],
      );
      const corroboratedParty = await client.query<{ id: string }>(
        `INSERT INTO business_v2.parties
           (party_type,display_name,last_updated_by)
         VALUES ('person','Plutio Corroborated Fixture','integration')
         RETURNING id::text`,
      );
      await client.query(
        `INSERT INTO business_v2.plutio_refs
           (entity_type,entity_id,plutio_entity_type,plutio_id,last_pushed_at)
         VALUES ('party',$1,'party','plutio-person-pg',now())`,
        [corroboratedParty.rows[0].id],
      );
      await client.query(
        `INSERT INTO business_v2.interactions
           (party_id,channel,direction,subject,occurred_at,source_provider,
            source_id,metadata,last_updated_by)
         VALUES ($1,'booking','inbound','corroborated fixture booking',now(),
                 'trafft','appt-corroborated-pg',$2::jsonb,'integration')`,
        [
          corroboratedParty.rows[0].id,
          JSON.stringify({
            event_type: 'booked',
            status: 'approved',
            service: 'Corroborated fixture consultation',
            raw_payload: { customerId: 'corroborated-customer-pg' },
          }),
        ],
      );
      const limited = await ingestTrafftRelationshipContextShadowWithClient(
        client,
        { limit: 1, observedAt: '2026-08-25T20:05:25Z' },
      );
      expect(limited.complete).toBe(false);
      expect(limited.legacyCustomerReferences).toBe(3);
      expect(limited.legacyAppointmentReferences).toBe(4);
      const limitedLegacy = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM business_v2.party_identity_exceptions
          WHERE status='no_action' AND reason_code='legacy_identity'`,
      );
      expect(limitedLegacy.rows[0].count).toBe('4');
      const exact = await ingestTrafftRelationshipContextShadowWithClient(
        client,
        { limit: 100, observedAt: '2026-08-25T20:05:30Z' },
      );
      expect(exact.exactCustomerReferences).toBe(2);
      expect(exact.exactAppointmentReferences).toBe(2);
      expect(exact.exactPlutioReferences).toBe(1);
      expect(exact.corroboratedCustomerReferences).toBe(1);
      expect(exact.legacyCustomerReferences).toBe(3);
      expect(exact.legacyAppointmentReferences).toBe(4);
      expect(exact.exactReferenceConflicts).toBe(0);
      expect(exact.projectionsChanged).toBe(1);
      expect(exact.heldIdentityFacts).toBe(4);

      await client.query(
        `INSERT INTO business_v2.party_emails
           (party_id,email,is_primary,verified_at)
         VALUES ($1,'fixture-encharge@example.invalid',true,now())`,
        [partyId],
      );
      const encharge = await ingestEnchargeSnapshotWithClient({
        client,
        snapshot: {
          schemaVersion: 1,
          generatedAt: '2026-08-25T20:05:45Z',
          records: [
            {
              partyId,
              emailFingerprint: crypto
                .createHash('sha256')
                .update('fixture-encharge@example.invalid')
                .digest('hex'),
              enchargePersonId: 'encharge-person-pg',
              updatedAt: '2026-08-25T20:05:40Z',
              globalUnsubscribed: false,
              communicationCategories: { cat_fixture: 'subscribed' },
            },
          ],
        },
      });
      expect(encharge).toMatchObject({
        exactEnchargeReferences: 1,
        refusedIdentity: 0,
        observationsNew: 1,
        projectionsChanged: 1,
      });
      const postEncharge =
        await ingestTrafftRelationshipContextShadowWithClient(client, {
          limit: 100,
          observedAt: '2026-08-25T20:06:00Z',
        });
      expect(postEncharge).toMatchObject({
        exactCustomerReferences: 3,
        exactAppointmentReferences: 3,
        corroboratedCustomerReferences: 2,
        legacyCustomerReferences: 2,
        legacyAppointmentReferences: 3,
        observationsNew: 1,
        projectionsChanged: 1,
      });
      const replay = await ingestTrafftRelationshipContextShadowWithClient(
        client,
        { limit: 100, observedAt: '2026-08-25T20:06:15Z' },
      );
      expect(replay.observationsDuplicate).toBe(replay.rows.length);
      const stored = await client.query<{
        value: Record<string, unknown>;
        current_party_id: string | null;
      }>(
        `SELECT o.value,o.current_party_id::text
           FROM business_v2.party_context_observations o
          WHERE o.source_system='trafft'
            AND o.source_record_id='appt-shadow-pg'`,
      );
      expect(stored.rows).toHaveLength(2);
      expect(JSON.stringify(stored.rows)).not.toContain('customerEmail');
      expect(
        stored.rows.filter((row) => row.current_party_id != null),
      ).toHaveLength(1);
      const projectionCount = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM business_v2.party_context_projections
          WHERE party_id=$1 AND section='appointments'`,
        [partyId],
      );
      expect(projectionCount.rows[0].count).toBe('1');
      const exactState = await client.query<{
        current_party_id: string | null;
        projection_count: string;
        projection_status: string | null;
        ref_count: string;
      }>(
        `SELECT
           (SELECT current_party_id::text
              FROM business_v2.party_context_observations
             WHERE source_record_id='appt-safe-pg') AS current_party_id,
           (SELECT count(*)::text
              FROM business_v2.party_context_projections
             WHERE party_id=$1 AND section='appointments') AS projection_count,
           (SELECT status
              FROM business_v2.party_context_projections
             WHERE party_id=$1 AND section='appointments'
             LIMIT 1) AS projection_status,
           (SELECT count(*)::text
              FROM business_v2.party_external_refs
             WHERE party_id=$1 AND provider='trafft'
               AND entity_type IN ('customer','appointment')) AS ref_count`,
        [safeParty.rows[0].id],
      );
      expect(exactState.rows[0]).toEqual({
        current_party_id: safeParty.rows[0].id,
        projection_count: '1',
        projection_status: 'current',
        ref_count: '2',
      });
      const canary = await runRelationshipContextExactReadCanary({
        repository: new PostgresRelationshipContextRepository(client),
        reference: {
          provider: 'trafft',
          scope: 'primary',
          entityType: 'appointment',
          externalId: 'appt-safe-pg',
        },
        nowMs: Date.parse('2026-08-25T20:06:30Z'),
      });
      expect(canary).toMatchObject({
        resolution: 'resolved',
        sectionStatus: 'current',
        projectionCount: 1,
        deliveryStatus: 'delivered',
      });
      const mergeWinner = await client.query<{ id: string }>(
        `INSERT INTO business_v2.parties
           (party_type,display_name,last_updated_by)
         VALUES ('person','Safe Trafft Merge Winner','integration')
         RETURNING id::text`,
      );
      await client.query(
        `SELECT business_v2.fn_merge_parties($1,$2,'exact ref integration')`,
        [safeParty.rows[0].id, mergeWinner.rows[0].id],
      );
      const mergedRepository = new PostgresRelationshipContextRepository(
        client,
      );
      expect(
        await mergedRepository.resolveExternalRef({
          provider: 'trafft',
          scope: 'primary',
          entityType: 'appointment',
          externalId: 'appt-safe-pg',
        }),
      ).toBe(Number(mergeWinner.rows[0].id));
      await mergedRepository.bindExternalRef({
        partyId: Number(mergeWinner.rows[0].id),
        reference: {
          provider: 'trafft',
          scope: 'primary',
          entityType: 'customer',
          externalId: 'safe-customer-pg',
        },
        adapterKey: 'trafft_host_ledger',
        adapterVersion: '1.0.0',
        observedAt: '2026-08-25T20:07:00Z',
        verifiedAt: '2026-08-25T20:05:30Z',
        receiptSha256: 'c'.repeat(64),
      });
      expect(
        await mergedRepository.resolveExternalRef({
          provider: 'trafft',
          scope: 'primary',
          entityType: 'customer',
          externalId: 'safe-customer-pg',
        }),
      ).toBe(Number(mergeWinner.rows[0].id));
      const ambiguousState = await client.query<{
        ref_count: string;
        attached_count: string;
      }>(
        `SELECT
           (SELECT count(*)::text
              FROM business_v2.party_external_refs
             WHERE party_id=$1 AND provider='trafft') AS ref_count,
           (SELECT count(*)::text
              FROM business_v2.party_context_observations
             WHERE source_record_id LIKE 'appt-ambiguous-pg-%'
               AND current_party_id IS NOT NULL) AS attached_count`,
        [ambiguousParty.rows[0].id],
      );
      expect(ambiguousState.rows[0]).toEqual({
        ref_count: '0',
        attached_count: '0',
      });
      const identityClassification = await client.query<{
        status: string;
        reason_code: string;
        count: string;
      }>(
        `SELECT status,reason_code,count(*)::text AS count
           FROM business_v2.party_identity_exceptions
          WHERE reason_code IN ('exact_reference_bound','legacy_identity')
          GROUP BY status,reason_code
          ORDER BY status,reason_code`,
      );
      expect(identityClassification.rows).toEqual([
        { status: 'no_action', reason_code: 'legacy_identity', count: '3' },
        {
          status: 'resolved',
          reason_code: 'exact_reference_bound',
          count: '1',
        },
      ]);
      const registration = await client.query<{
        adapter_key: string;
        enabled: boolean;
        conformance_status: string;
      }>(
        `SELECT adapter_key,enabled,conformance_status
           FROM business_v2.party_context_adapter_registrations
          WHERE adapter_key IN (
            'trafft_host_ledger','plutio_reference_ledger',
            'encharge_person_snapshot'
          )
          ORDER BY adapter_key`,
      );
      expect(registration.rows).toEqual([
        {
          adapter_key: 'encharge_person_snapshot',
          enabled: true,
          conformance_status: 'passed',
        },
        {
          adapter_key: 'plutio_reference_ledger',
          enabled: true,
          conformance_status: 'passed',
        },
        {
          adapter_key: 'trafft_host_ledger',
          enabled: true,
          conformance_status: 'passed',
        },
      ]);
    } finally {
      client.release();
    }
  });

  it('bounds first-run Plutio import and isolates a conflicting ref', async () => {
    const client = await pool.connect();
    try {
      await client.query(
        `WITH inserted AS (
           INSERT INTO business_v2.parties
             (party_type,display_name,last_updated_by)
           SELECT 'person','Scale Fixture ' || value::text,'integration'
             FROM generate_series(1,1400) AS value
           RETURNING id
         )
         INSERT INTO business_v2.plutio_refs
           (entity_type,entity_id,plutio_entity_type,plutio_id,last_pushed_at)
         SELECT 'party',id,'party','plutio-scale-' || id::text,now()
           FROM inserted`,
      );
      const conflictParties = await client.query<{ id: string }>(
        `INSERT INTO business_v2.parties
           (party_type,display_name,last_updated_by)
         VALUES ('person','Conflict Source','integration'),
                ('person','Conflict Existing','integration')
         RETURNING id::text`,
      );
      await client.query(
        `INSERT INTO business_v2.plutio_refs
           (entity_type,entity_id,plutio_entity_type,plutio_id,last_pushed_at)
         VALUES ('party',$1,'party','plutio-scale-conflict',now())`,
        [conflictParties.rows[0].id],
      );
      await new PostgresRelationshipContextRepository(client).bindExternalRef({
        partyId: Number(conflictParties.rows[1].id),
        reference: {
          provider: 'plutio',
          scope: 'primary',
          entityType: 'person',
          externalId: 'plutio-scale-conflict',
        },
        adapterKey: 'plutio_reference_ledger',
        adapterVersion: '1.0.0',
        observedAt: '2026-08-25T21:00:00Z',
        verifiedAt: '2026-08-25T21:00:00Z',
        receiptSha256: 'd'.repeat(64),
      });

      const started = Date.now();
      const first = await reconcilePlutioReferencesWithClient({
        client,
        observedAt: '2026-08-25T21:01:00Z',
      });
      expect(Date.now() - started).toBeLessThan(10_000);
      expect(first.exactPlutioReferences).toBeGreaterThanOrEqual(1_402);
      expect(first.plutioReferenceConflicts).toBe(1);
      const replayStarted = Date.now();
      const replay = await reconcilePlutioReferencesWithClient({
        client,
        observedAt: '2026-08-25T21:02:00Z',
      });
      expect(Date.now() - replayStarted).toBeLessThan(2_000);
      expect(replay.exactPlutioReferences).toBe(first.exactPlutioReferences);
      expect(replay.plutioReferenceConflicts).toBe(1);
      const exception = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM business_v2.party_identity_exceptions
          WHERE status='open' AND reason_code='external_ref_conflict'`,
      );
      expect(exception.rows[0].count).toBe('1');
    } finally {
      client.release();
    }
  });
});
