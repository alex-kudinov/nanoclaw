import type { PoolClient, QueryResultRow } from 'pg';

import { withAgentContext } from './business-db.js';
import { sha256Json } from './relationship-context-contract.js';
import {
  PostgresRelationshipContextRepository,
  type StoredProjection,
} from './relationship-context-store.js';
import { logger } from './logger.js';

export const CLIENT_RELATIONSHIP_PROJECTION_INTERVAL_MS = 15 * 60 * 1000;
export const CLIENT_RELATIONSHIP_PROJECTION_KEY =
  'relationship.client_status.v1';

const CLIENT_RELATIONSHIP_DECISION =
  'decision:relationship-context-client-relationship-projection-2026-08-26';
const CLIENT_RELATIONSHIP_PAGE_SIZE = 500;
const CLIENT_RELATIONSHIP_LOCK_KEY =
  'relationship-context-client-projection-v1';

export type RelationshipState =
  | 'paid_customer'
  | 'recorded_client'
  | 'recorded_student'
  | 'recorded_prospect'
  | 'unknown';

export interface ClientRelationshipEvidence {
  partyType: string;
  recordedClientRoleCount: number;
  recordedStudentRoleCount: number;
  recordedProspectRoleCount: number;
  succeededPaymentIntentCount: number;
  activeSubscriptionCount: number;
}

export interface ClientRelationshipProjectionValue extends Record<
  string,
  unknown
> {
  schema_version: 1;
  party_type: string;
  relationship_state: RelationshipState;
  customer_or_client: boolean;
  recorded_client_role: boolean;
  paid_customer_history: boolean;
  active_subscription: boolean;
  recorded_student_role: boolean;
  recorded_prospect_role: boolean;
  active_engagement_status: 'unknown';
  evidence_counts: {
    recorded_client_roles: number;
    succeeded_payment_intents: number;
    active_subscriptions: number;
    recorded_student_roles: number;
    recorded_prospect_roles: number;
  };
  evidence_tiers: string[];
}

function nonNegativeInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('relationship_context_client_evidence_invalid');
  }
  return value;
}

export function deriveClientRelationshipProjection(
  evidence: ClientRelationshipEvidence,
): ClientRelationshipProjectionValue {
  const recordedClientRoleCount = nonNegativeInteger(
    evidence.recordedClientRoleCount,
  );
  const recordedStudentRoleCount = nonNegativeInteger(
    evidence.recordedStudentRoleCount,
  );
  const recordedProspectRoleCount = nonNegativeInteger(
    evidence.recordedProspectRoleCount,
  );
  const succeededPaymentIntentCount = nonNegativeInteger(
    evidence.succeededPaymentIntentCount,
  );
  const activeSubscriptionCount = nonNegativeInteger(
    evidence.activeSubscriptionCount,
  );
  const recordedClient = recordedClientRoleCount > 0;
  const paidCustomer = succeededPaymentIntentCount > 0;
  const activeSubscription = activeSubscriptionCount > 0;
  const recordedStudent = recordedStudentRoleCount > 0;
  const recordedProspect = recordedProspectRoleCount > 0;
  const relationshipState: RelationshipState =
    paidCustomer || activeSubscription
      ? 'paid_customer'
      : recordedClient
        ? 'recorded_client'
        : recordedStudent
          ? 'recorded_student'
          : recordedProspect
            ? 'recorded_prospect'
            : 'unknown';
  const evidenceTiers: string[] = [];
  if (paidCustomer) evidenceTiers.push('stripe_succeeded_payment_v1');
  if (activeSubscription) {
    evidenceTiers.push('stripe_current_active_subscription_v1');
  }
  if (recordedClient) evidenceTiers.push('unproven_client_role_v1');
  if (recordedStudent) evidenceTiers.push('accepted_student_role_v1');
  if (recordedProspect) evidenceTiers.push('recorded_prospect_role_v1');
  return {
    schema_version: 1,
    party_type: evidence.partyType,
    relationship_state: relationshipState,
    customer_or_client: paidCustomer || activeSubscription,
    recorded_client_role: recordedClient,
    paid_customer_history: paidCustomer,
    active_subscription: activeSubscription,
    recorded_student_role: recordedStudent,
    recorded_prospect_role: recordedProspect,
    active_engagement_status: 'unknown',
    evidence_counts: {
      recorded_client_roles: recordedClientRoleCount,
      succeeded_payment_intents: succeededPaymentIntentCount,
      active_subscriptions: activeSubscriptionCount,
      recorded_student_roles: recordedStudentRoleCount,
      recorded_prospect_roles: recordedProspectRoleCount,
    },
    evidence_tiers: evidenceTiers,
  };
}

interface ClientRelationshipRow extends QueryResultRow {
  party_id: string;
  party_type: string;
  recorded_client_role_count: string;
  recorded_student_role_count: string;
  recorded_prospect_role_count: string;
  succeeded_payment_intent_count: string;
  active_subscription_count: string;
  role_watermark: string;
  stripe_watermark: string;
  prior_version: number | null;
}

const CLIENT_RELATIONSHIP_PAGE_SQL = `
WITH page AS (
  SELECT id,party_type
    FROM business_v2.parties
   WHERE merged_into IS NULL AND id > $1
   ORDER BY id
   LIMIT $2
),
role_evidence AS (
  SELECT r.party_id,
         count(*) FILTER (WHERE r.role_type='client')::text
           AS recorded_client_role_count,
         count(*) FILTER (WHERE r.role_type='student')::text
           AS recorded_student_role_count,
         count(*) FILTER (WHERE r.role_type='prospect')::text
           AS recorded_prospect_role_count,
         coalesce(max(r.id),0)::text AS role_watermark
    FROM business_v2.party_roles r
    JOIN page p ON p.id=r.party_id
   WHERE r.ended_at IS NULL
   GROUP BY r.party_id
),
latest_payment_intents AS (
  SELECT DISTINCT ON (
           o.current_party_id,o.source_scope,o.source_record_id
         )
         o.current_party_id AS party_id,o.id,o.value->>'status' AS fact_status
    FROM business_v2.party_context_observations o
    JOIN page p ON p.id=o.current_party_id
   WHERE o.fact_type='commercial.stripe.payment_intent_status@1'
   ORDER BY o.current_party_id,o.source_scope,o.source_record_id,
            o.observed_at DESC,o.id DESC
),
latest_subscriptions AS (
  SELECT DISTINCT ON (
           o.current_party_id,o.source_scope,o.source_record_id
         )
         o.current_party_id AS party_id,o.id,o.value->>'status' AS fact_status
    FROM business_v2.party_context_observations o
    JOIN page p ON p.id=o.current_party_id
   WHERE o.fact_type='commercial.stripe.subscription_status@1'
   ORDER BY o.current_party_id,o.source_scope,o.source_record_id,
            o.observed_at DESC,o.id DESC
),
stripe_evidence AS (
  SELECT party_id,
         count(*) FILTER (WHERE source_kind='payment_intent'
                            AND fact_status='succeeded')::text
           AS succeeded_payment_intent_count,
         count(*) FILTER (WHERE source_kind='subscription'
                            AND fact_status='active')::text
           AS active_subscription_count,
         coalesce(max(id),0)::text AS stripe_watermark
    FROM (
      SELECT party_id,id,fact_status,'payment_intent'::text AS source_kind
        FROM latest_payment_intents
      UNION ALL
      SELECT party_id,id,fact_status,'subscription'::text AS source_kind
        FROM latest_subscriptions
    ) evidence
   GROUP BY party_id
)
SELECT p.id::text AS party_id,p.party_type,
       coalesce(r.recorded_client_role_count,'0')
         AS recorded_client_role_count,
       coalesce(r.recorded_student_role_count,'0')
         AS recorded_student_role_count,
       coalesce(r.recorded_prospect_role_count,'0')
         AS recorded_prospect_role_count,
       coalesce(s.succeeded_payment_intent_count,'0')
         AS succeeded_payment_intent_count,
       coalesce(s.active_subscription_count,'0')
         AS active_subscription_count,
       coalesce(r.role_watermark,'0') AS role_watermark,
       coalesce(s.stripe_watermark,'0') AS stripe_watermark,
       prior.version AS prior_version
  FROM page p
  LEFT JOIN role_evidence r ON r.party_id=p.id
  LEFT JOIN stripe_evidence s ON s.party_id=p.id
  LEFT JOIN business_v2.party_context_projections prior
    ON prior.party_id=p.id
   AND prior.section='relationship'
   AND prior.projection_key=$3
 ORDER BY p.id`;

export interface ClientRelationshipProjectionResult {
  activeParties: number;
  people: number;
  organizations: number;
  projectedParties: number;
  customerOrClientParties: number;
  recordedClientRoleParties: number;
  paidCustomerParties: number;
  activeSubscriberParties: number;
  recordedStudentParties: number;
  recordedProspectParties: number;
  unknownRelationshipParties: number;
  projectionsChanged: number;
  complete: boolean;
  activeEngagementEvidenceAvailable: false;
}

function numberFromDatabase(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('relationship_context_client_database_count_invalid');
  }
  return parsed;
}

function projectionMissingCodes(
  value: ClientRelationshipProjectionValue,
): string[] {
  const missing = ['active_engagement_evidence_unavailable'];
  if (value.recorded_client_role) {
    missing.push('client_role_provenance_unavailable');
  }
  if (!value.customer_or_client) missing.push('client_evidence_not_found');
  return missing;
}

export async function projectClientRelationshipsWithClient(input: {
  client: PoolClient;
  observedAt: string;
  pageSize?: number;
}): Promise<ClientRelationshipProjectionResult> {
  const pageSize = input.pageSize ?? CLIENT_RELATIONSHIP_PAGE_SIZE;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1_000) {
    throw new Error('relationship_context_client_page_size_invalid');
  }
  await input.client.query(
    `SELECT set_config('statement_timeout','60000',true),
            set_config('lock_timeout','5000',true)`,
  );
  const lock = await input.client.query<{ acquired: boolean }>(
    'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired',
    [CLIENT_RELATIONSHIP_LOCK_KEY],
  );
  if (!lock.rows[0]?.acquired) {
    throw new Error('relationship_context_client_projection_busy');
  }
  const repository = new PostgresRelationshipContextRepository(input.client);
  const result: ClientRelationshipProjectionResult = {
    activeParties: 0,
    people: 0,
    organizations: 0,
    projectedParties: 0,
    customerOrClientParties: 0,
    recordedClientRoleParties: 0,
    paidCustomerParties: 0,
    activeSubscriberParties: 0,
    recordedStudentParties: 0,
    recordedProspectParties: 0,
    unknownRelationshipParties: 0,
    projectionsChanged: 0,
    complete: false,
    activeEngagementEvidenceAvailable: false,
  };
  let cursor = 0;
  while (true) {
    const page = await input.client.query<ClientRelationshipRow>(
      CLIENT_RELATIONSHIP_PAGE_SQL,
      [cursor, pageSize, CLIENT_RELATIONSHIP_PROJECTION_KEY],
    );
    if (page.rows.length === 0) break;
    for (const row of page.rows) {
      const partyId = numberFromDatabase(row.party_id);
      const value = deriveClientRelationshipProjection({
        partyType: row.party_type,
        recordedClientRoleCount: numberFromDatabase(
          row.recorded_client_role_count,
        ),
        recordedStudentRoleCount: numberFromDatabase(
          row.recorded_student_role_count,
        ),
        recordedProspectRoleCount: numberFromDatabase(
          row.recorded_prospect_role_count,
        ),
        succeededPaymentIntentCount: numberFromDatabase(
          row.succeeded_payment_intent_count,
        ),
        activeSubscriptionCount: numberFromDatabase(
          row.active_subscription_count,
        ),
      });
      const projection: Omit<StoredProjection, 'id' | 'version'> = {
        partyId,
        section: 'relationship',
        projectionKey: CLIENT_RELATIONSHIP_PROJECTION_KEY,
        value,
        valueSha256: sha256Json(value),
        sourceWatermarks: {
          party_roles: row.role_watermark,
          stripe_observations: row.stripe_watermark,
          projection_policy: CLIENT_RELATIONSHIP_DECISION,
        },
        status: 'partial',
        missingCodes: projectionMissingCodes(value),
        conflictCodes: [],
        effectiveAt: null,
        observedAt: input.observedAt,
        freshUntil: null,
      };
      const stored = await repository.upsertProjection(projection);
      if (row.prior_version == null || stored.version !== row.prior_version) {
        result.projectionsChanged += 1;
      }
      result.activeParties += 1;
      result.projectedParties += 1;
      if (row.party_type === 'person') result.people += 1;
      if (row.party_type === 'org') result.organizations += 1;
      if (value.customer_or_client) result.customerOrClientParties += 1;
      if (value.recorded_client_role) result.recordedClientRoleParties += 1;
      if (value.paid_customer_history) result.paidCustomerParties += 1;
      if (value.active_subscription) result.activeSubscriberParties += 1;
      if (value.recorded_student_role) result.recordedStudentParties += 1;
      if (value.recorded_prospect_role) result.recordedProspectParties += 1;
      if (value.relationship_state === 'unknown') {
        result.unknownRelationshipParties += 1;
      }
      cursor = partyId;
    }
    if (page.rows.length < pageSize) break;
  }
  const coverage = await input.client.query<{
    active_parties: string;
    projected_parties: string;
  }>(
    `SELECT count(*)::text AS active_parties,
            count(p.id)::text AS projected_parties
       FROM business_v2.parties party
       LEFT JOIN business_v2.party_context_projections p
         ON p.party_id=party.id
        AND p.section='relationship'
        AND p.projection_key=$1
      WHERE party.merged_into IS NULL`,
    [CLIENT_RELATIONSHIP_PROJECTION_KEY],
  );
  const activeParties = numberFromDatabase(coverage.rows[0].active_parties);
  const projectedParties = numberFromDatabase(
    coverage.rows[0].projected_parties,
  );
  result.complete =
    activeParties === result.activeParties &&
    projectedParties === activeParties &&
    result.projectedParties === result.activeParties;
  if (!result.complete) {
    throw new Error('relationship_context_client_projection_incomplete');
  }
  return result;
}

export interface ClientRelationshipProjectionHealth {
  enabled: boolean;
  mode: 'internal_projection';
  consumerEnabled: false;
  status: 'disabled' | 'never_run' | 'healthy' | 'degraded';
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  result: ClientRelationshipProjectionResult | null;
  errorCodes: string[];
}

function baseHealth(): ClientRelationshipProjectionHealth {
  return {
    enabled: false,
    mode: 'internal_projection',
    consumerEnabled: false,
    status: 'disabled',
    lastRunAt: null,
    lastSuccessAt: null,
    result: null,
    errorCodes: [],
  };
}

let currentHealth = baseHealth();

export function clientRelationshipProjectionEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.RELATIONSHIP_CONTEXT_CLIENT_PROJECTION_ENABLED === '1';
}

export function getClientRelationshipProjectionHealth(): ClientRelationshipProjectionHealth {
  return structuredClone(currentHealth);
}

export function resetClientRelationshipProjectionHealthForTests(): void {
  currentHealth = baseHealth();
}

function projectionErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return /^[a-z][a-z0-9_]{0,99}$/.test(message)
    ? message
    : 'relationship_context_client_projection_failed';
}

export async function runClientRelationshipProjection(
  input: { env?: NodeJS.ProcessEnv; nowMs?: number } = {},
): Promise<ClientRelationshipProjectionHealth> {
  if (!clientRelationshipProjectionEnabled(input.env)) {
    currentHealth = baseHealth();
    return getClientRelationshipProjectionHealth();
  }
  const runAt = new Date(input.nowMs ?? Date.now()).toISOString();
  currentHealth = {
    ...currentHealth,
    enabled: true,
    status: currentHealth.lastSuccessAt ? 'healthy' : 'never_run',
    lastRunAt: runAt,
    errorCodes: [],
  };
  try {
    const projectionResult = await withAgentContext(
      'relationship-context-client-projection',
      (client) =>
        projectClientRelationshipsWithClient({
          client,
          observedAt: runAt,
        }),
    );
    currentHealth = {
      enabled: true,
      mode: 'internal_projection',
      consumerEnabled: false,
      status: 'healthy',
      lastRunAt: runAt,
      lastSuccessAt: runAt,
      result: projectionResult,
      errorCodes: [],
    };
    logger.info(
      currentHealth,
      'relationship context client projection complete',
    );
  } catch (error) {
    currentHealth = {
      ...currentHealth,
      enabled: true,
      status: 'degraded',
      lastRunAt: runAt,
      errorCodes: [projectionErrorCode(error)],
    };
    logger.warn(
      { ...currentHealth, errorCode: projectionErrorCode(error) },
      'relationship context client projection degraded',
    );
  }
  return getClientRelationshipProjectionHealth();
}
