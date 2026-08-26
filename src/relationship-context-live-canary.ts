import crypto from 'node:crypto';
import type { PoolClient, QueryResultRow } from 'pg';

import { withAgentContext } from './business-db.js';
import type { ExternalReferenceInput } from './relationship-context-contract.js';
import {
  consumeRelationshipContextGrant,
  issueRelationshipContextGrant,
} from './relationship-context-policy.js';
import {
  PostgresRelationshipContextRepository,
  type RelationshipContextRepository,
} from './relationship-context-store.js';
import { getRelationshipContext } from './relationship-context.js';

export interface RelationshipContextCanarySummary {
  schemaVersion: 1;
  resolution: 'resolved';
  sectionStatus: 'current' | 'stale';
  projectionCount: number;
  receiptId: number;
  deliveryStatus: 'delivered';
}

export async function runRelationshipContextExactReadCanary(input: {
  repository: RelationshipContextRepository;
  reference: ExternalReferenceInput;
  nowMs?: number;
}): Promise<RelationshipContextCanarySummary> {
  const nowMs = input.nowMs ?? Date.now();
  const runId = crypto.randomUUID();
  const sourceContainer = 'host:relationship-context-exact-read-canary';
  const request = {
    purpose: 'answer_appointment_inquiry' as const,
    subject: { kind: 'external_ref' as const, reference: input.reference },
    sections: ['appointments' as const],
  };
  const env = { RELATIONSHIP_CONTEXT_ENABLED: '1' } as NodeJS.ProcessEnv;
  issueRelationshipContextGrant({
    group: 'booking',
    runId,
    sourceContainer,
    workItemId: 'work:relationship-context-trafft-exact-identity',
    ...request,
    ttlSeconds: 60,
    nowMs,
    env,
  });
  const grant = consumeRelationshipContextGrant({
    group: 'booking',
    runId,
    sourceContainer,
    request,
    nowMs,
    env,
  });
  const pack = await getRelationshipContext({
    repository: input.repository,
    grant,
    nowMs,
  });
  try {
    const appointments = pack.sections.appointments;
    if (
      pack.resolution !== 'resolved' ||
      !appointments ||
      !['current', 'stale'].includes(appointments.status) ||
      appointments.projections.length < 1
    ) {
      throw new Error('relationship_context_exact_read_canary_not_ready');
    }
    await input.repository.markQueryDelivery({
      receiptId: pack.receiptId,
      status: 'delivered',
      errorCode: null,
      deliveredAt: new Date(nowMs).toISOString(),
    });
    return {
      schemaVersion: 1,
      resolution: 'resolved',
      sectionStatus: appointments.status as 'current' | 'stale',
      projectionCount: appointments.projections.length,
      receiptId: pack.receiptId,
      deliveryStatus: 'delivered',
    };
  } catch (error) {
    await input.repository.markQueryDelivery({
      receiptId: pack.receiptId,
      status: 'failed',
      errorCode: 'exact_read_canary_not_ready',
      deliveredAt: null,
    });
    throw error;
  }
}

interface ExactReferenceRow extends QueryResultRow {
  provider: string;
  source_scope: string;
  entity_type: string;
  external_id: string;
}

async function latestExactAppointmentReference(
  client: PoolClient,
): Promise<ExternalReferenceInput> {
  const result = await client.query<ExactReferenceRow>(
    `SELECT provider,source_scope,entity_type,external_id
       FROM business_v2.party_external_refs
      WHERE provider='trafft' AND source_scope='primary'
        AND entity_type='appointment' AND status='active'
        AND verified_at IS NOT NULL
      ORDER BY verified_at DESC,id DESC
      LIMIT 1`,
  );
  const row = result.rows[0];
  if (!row) throw new Error('relationship_context_exact_read_canary_no_ref');
  return {
    provider: row.provider,
    scope: row.source_scope,
    entityType: row.entity_type,
    externalId: row.external_id,
  };
}

export async function runLatestTrafftExactReadCanary(
  nowMs?: number,
): Promise<RelationshipContextCanarySummary> {
  return withAgentContext(
    'relationship-context-exact-read-canary',
    async (client) =>
      runRelationshipContextExactReadCanary({
        repository: new PostgresRelationshipContextRepository(client),
        reference: await latestExactAppointmentReference(client),
        nowMs,
      }),
  );
}
