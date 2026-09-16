import type { PoolClient, QueryResultRow } from 'pg';
import { z } from 'zod';

import { sha256Json } from './canonical.js';

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const uuid = z.uuid();

export const CoachingToolsPlusCanaryRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    projectId: z.literal('tandem-identity-dev-2026'),
    uid: z.string().min(1).max(500),
    verifiedEmailSha256: sha256,
    partyId: z.literal(10069),
    heartbeatUserId: uuid,
    heartbeatGroupId: uuid,
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type CoachingToolsPlusCanaryPolicy = {
  projectId: 'tandem-identity-dev-2026';
  environment: 'development';
  partyId: 10069;
  verifiedEmailSha256: string;
  heartbeatUserId: string;
  heartbeatGroupId: string;
  decisionRef: string;
  decisionUuid: string;
};

type CanaryRequest = z.infer<typeof CoachingToolsPlusCanaryRequestSchema>;

type ProtectedCounts = QueryResultRow & {
  parties: string;
  refs: string;
  authAccounts: string;
  providerAttempts: string;
};

type CanaryState = QueryResultRow & {
  sourceEvidenceSha256: string;
  orderState: string;
  orderVersion: number;
  seatState: string;
  seatVersion: number;
  agreementState: string;
  agreementVersion: number;
  enrollmentState: string;
  enrollmentVersion: number;
  effectiveAt: string | Date | null;
  endedAt: string | Date | null;
  entitlementState: string;
  entitlementVersion: number;
  entitlementEvidenceSha256: string;
};

export type CoachingToolsPlusCanaryGrantResult = {
  outcome: 'accepted' | 'duplicate';
  orderInserted: 0 | 1;
  sourceRefInserted: 0 | 1;
  seatInserted: 0 | 1;
  agreementInserted: 0 | 1;
  enrollmentInserted: 0 | 1;
  entitlementInserted: 0 | 1;
  evidenceInserted: 0 | 1;
  historyInserted: 0 | 5;
  partyWrites: 0;
  referenceWrites: 0;
  authAccountWrites: 0;
  providerWrites: 0;
};

export type CoachingToolsPlusCanaryRevokeResult = {
  outcome: 'revoked' | 'duplicate';
  orderUpdated: 0 | 1;
  seatUpdated: 0 | 1;
  agreementUpdated: 0 | 1;
  enrollmentUpdated: 0 | 1;
  entitlementUpdated: 0 | 1;
  evidenceInserted: 0 | 1;
  historyInserted: 0 | 5;
  partyWrites: 0;
  referenceWrites: 0;
  authAccountWrites: 0;
  providerWrites: 0;
};

function canaryKeys(policy: CoachingToolsPlusCanaryPolicy) {
  const prefix = `tandem-identity-plus-canary:${policy.decisionUuid}`;
  return {
    prefix,
    order: `${prefix}:order`,
    sourceRef: `${prefix}:source-ref`,
    seat: `${prefix}:seat:1`,
    agreement: `${prefix}:agreement`,
    enrollment: `${prefix}:enrollment`,
    entitlement: `${prefix}:entitlement:1`,
    grantEvidence: `${prefix}:evidence:grant`,
    revokeEvidence: `${prefix}:evidence:revoke`,
  };
}

function validateScope(input: {
  request: unknown;
  policy: CoachingToolsPlusCanaryPolicy;
  observedAt: string;
}, requireFutureExpiry = true): CanaryRequest {
  const request = CoachingToolsPlusCanaryRequestSchema.parse(input.request);
  if (
    request.projectId !== input.policy.projectId ||
    request.partyId !== input.policy.partyId ||
    request.verifiedEmailSha256 !== input.policy.verifiedEmailSha256 ||
    request.heartbeatUserId !== input.policy.heartbeatUserId ||
    request.heartbeatGroupId !== input.policy.heartbeatGroupId
  ) {
    throw new Error('plus_canary_scope_invalid');
  }
  const observedAt = new Date(input.observedAt).getTime();
  const expiresAt = new Date(request.expiresAt).getTime();
  if (!Number.isFinite(observedAt) || !Number.isFinite(expiresAt)) {
    throw new Error('plus_canary_expiry_invalid');
  }
  if (
    requireFutureExpiry &&
    (expiresAt < observedAt + 60_000 || expiresAt > observedAt + 30 * 60_000)
  )
    throw new Error('plus_canary_expiry_invalid');
  return request;
}

async function acquireLock(client: PoolClient, decisionUuid: string): Promise<void> {
  const lock = await client.query<{ acquired: boolean }>(
    `SELECT pg_try_advisory_xact_lock(
       hashtext('tandem_identity_plus_canary:' || $1)
     ) AS acquired`,
    [decisionUuid],
  );
  if (!lock.rows[0]?.acquired) throw new Error('plus_canary_busy');
}

async function protectedCounts(client: PoolClient): Promise<ProtectedCounts> {
  const result = await client.query<ProtectedCounts>(`SELECT
    (SELECT count(*) FROM business_v2.parties)::text AS parties,
    (SELECT count(*) FROM business_v2.party_external_refs)::text AS refs,
    (SELECT count(*) FROM business_v2.auth_accounts)::text AS "authAccounts",
    (SELECT count(*) FROM business_v2.provider_projection_attempts)::text
      AS "providerAttempts"`);
  return result.rows[0];
}

async function enrollment82Fingerprint(client: PoolClient): Promise<string> {
  const result = await client.query(`SELECT jsonb_build_object(
      'enrollment',to_jsonb(en),
      'entitlements',COALESCE((
        SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id)
          FROM business_v2.student_component_entitlements e
         WHERE e.enrollment_id=en.id
      ),'[]'::jsonb)
    ) AS value
    FROM business_v2.student_enrollments_v2 en
    WHERE en.id=82 AND en.participant_party_id=10069`);
  if (result.rowCount !== 1) throw new Error('plus_canary_enrollment_82_missing');
  return sha256Json(result.rows[0].value);
}

async function requireBinding(
  client: PoolClient,
  request: CanaryRequest,
  policy: CoachingToolsPlusCanaryPolicy,
): Promise<void> {
  const issuer = `https://securetoken.google.com/${request.projectId}`;
  const binding = await client.query<{ valid: boolean }>(
    `SELECT EXISTS(
       SELECT 1
         FROM business_v2.auth_accounts
        WHERE issuer=$1 AND environment=$2 AND source_scope=$3 AND subject=$4
          AND party_id=$5 AND account_state='accepted'
          AND binding_basis='operator_decision'
     ) AS valid`,
    [issuer, policy.environment, request.projectId, request.uid, policy.partyId],
  );
  if (!binding.rows[0]?.valid) throw new Error('plus_canary_binding_unavailable');
  const party = await client.query<{ valid: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM business_v2.parties
        WHERE id=$1 AND merged_into IS NULL AND party_type='person'
     ) AS valid`,
    [policy.partyId],
  );
  if (!party.rows[0]?.valid) throw new Error('plus_canary_party_unavailable');
}

async function readCanaryState(
  client: PoolClient,
  policy: CoachingToolsPlusCanaryPolicy,
): Promise<CanaryState | null> {
  const keys = canaryKeys(policy);
  const result = await client.query<CanaryState>(
    `SELECT sr.evidence_sha256 AS "sourceEvidenceSha256",
            o.state AS "orderState",o.version AS "orderVersion",
            s.state AS "seatState",s.version AS "seatVersion",
            a.state AS "agreementState",a.version AS "agreementVersion",
            en.state AS "enrollmentState",en.version AS "enrollmentVersion",
            en.effective_at AS "effectiveAt",en.ended_at AS "endedAt",
            e.state AS "entitlementState",e.version AS "entitlementVersion",
            e.evidence_sha256 AS "entitlementEvidenceSha256"
       FROM business_v2.student_enrollment_orders o
       JOIN business_v2.student_enrollment_order_source_refs sr
         ON sr.order_id=o.id AND sr.idempotency_key=$2
       JOIN business_v2.student_enrollment_seats s
         ON s.order_id=o.id AND s.seat_key=$3
       JOIN business_v2.student_financial_agreements a
         ON a.order_id=o.id AND a.agreement_key=$4
       JOIN business_v2.student_enrollments_v2 en
         ON en.order_id=o.id AND en.seat_id=s.id AND en.enrollment_key=$5
       JOIN business_v2.student_component_entitlements e
         ON e.enrollment_id=en.id AND e.entitlement_key=$6
      WHERE o.order_key=$1`,
    [keys.order, keys.sourceRef, keys.seat, keys.agreement, keys.enrollment, keys.entitlement],
  );
  if (result.rowCount === 0) return null;
  if (result.rowCount !== 1) throw new Error('plus_canary_state_ambiguous');
  return result.rows[0];
}

function grantEvidence(input: {
  request: CanaryRequest;
  policy: CoachingToolsPlusCanaryPolicy;
}): string {
  return sha256Json({
    kind: 'tandem_identity_coaching_tools_plus_canary',
    schemaVersion: 1,
    decisionRef: input.policy.decisionRef,
    decisionUuid: input.policy.decisionUuid,
    projectId: input.request.projectId,
    uid: input.request.uid,
    verifiedEmailSha256: input.request.verifiedEmailSha256,
    partyId: input.request.partyId,
    heartbeatUserId: input.request.heartbeatUserId,
    heartbeatGroupId: input.request.heartbeatGroupId,
    expiresAt: input.request.expiresAt,
  });
}

function isExactActiveState(
  state: CanaryState,
  evidenceSha256: string,
  request: CanaryRequest,
): boolean {
  return (
    state.sourceEvidenceSha256 === evidenceSha256 &&
    state.entitlementEvidenceSha256 === evidenceSha256 &&
    state.orderState === 'materialized' &&
    state.orderVersion === 0 &&
    state.seatState === 'materialized' &&
    state.seatVersion === 0 &&
    state.agreementState === 'complete' &&
    state.agreementVersion === 0 &&
    state.enrollmentState === 'active' &&
    state.enrollmentVersion === 0 &&
    state.entitlementState === 'included' &&
    state.entitlementVersion === 0 &&
    state.endedAt != null &&
    new Date(state.endedAt).toISOString() === new Date(request.expiresAt).toISOString()
  );
}

export async function grantCoachingToolsPlusCanaryWithClient(input: {
  client: PoolClient;
  request: unknown;
  policy: CoachingToolsPlusCanaryPolicy;
  observedAt: string;
}): Promise<CoachingToolsPlusCanaryGrantResult> {
  const request = validateScope(input);
  await acquireLock(input.client, input.policy.decisionUuid);
  await requireBinding(input.client, request, input.policy);
  const beforeProtected = await protectedCounts(input.client);
  const enrollment82Before = await enrollment82Fingerprint(input.client);
  const evidenceSha256 = grantEvidence({ request, policy: input.policy });
  const keys = canaryKeys(input.policy);
  const existing = await readCanaryState(input.client, input.policy);
  if (existing) {
    if (!isExactActiveState(existing, evidenceSha256, request)) {
      throw new Error('plus_canary_grant_conflict');
    }
    if ((await enrollment82Fingerprint(input.client)) !== enrollment82Before) {
      throw new Error('plus_canary_enrollment_82_changed');
    }
    return {
      outcome: 'duplicate',
      orderInserted: 0,
      sourceRefInserted: 0,
      seatInserted: 0,
      agreementInserted: 0,
      enrollmentInserted: 0,
      entitlementInserted: 0,
      evidenceInserted: 0,
      historyInserted: 0,
      partyWrites: 0,
      referenceWrites: 0,
      authAccountWrites: 0,
      providerWrites: 0,
    };
  }
  const partial = await input.client.query<{ count: string }>(
    `SELECT (
       (SELECT count(*) FROM business_v2.student_enrollment_orders WHERE order_key LIKE $1) +
       (SELECT count(*) FROM business_v2.student_enrollment_seats WHERE seat_key LIKE $1) +
       (SELECT count(*) FROM business_v2.student_enrollments_v2 WHERE enrollment_key LIKE $1) +
       (SELECT count(*) FROM business_v2.student_component_entitlements WHERE entitlement_key LIKE $1)
     )::text AS count`,
    [`${keys.prefix}%`],
  );
  if (partial.rows[0]?.count !== '0') throw new Error('plus_canary_partial_state');

  const actor = 'tandem-identity-plus-canary';
  const order = await input.client.query<{ id: string }>(
    `INSERT INTO business_v2.student_enrollment_orders
       (order_key,source_channel,offer_key,bundle_key,bundle_version,payer_party_id,
        seat_count,financial_classification,state,version,policy_revision,
        evidence_sha256,effective_at,created_at,updated_at,updated_by)
     VALUES ($1,'complimentary_owner_grant','coaching-tools-plus-canary',
       'coaching-tools-plus-canary:v1',1,NULL,1,'not_applicable','materialized',0,1,
       $2,$3::timestamptz,$3::timestamptz,$3::timestamptz,$4)
     RETURNING id::text`,
    [keys.order, evidenceSha256, input.observedAt, actor],
  );
  const orderId = order.rows[0]?.id;
  if (!orderId) throw new Error('plus_canary_order_insert_failed');
  const sourceRef = await input.client.query<{ id: string }>(
    `INSERT INTO business_v2.student_enrollment_order_source_refs
       (order_id,source_scope,source_object_type,source_object_id,idempotency_key,
        evidence_sha256,observed_at,recorded_at,recorded_by)
     VALUES ($1,'tandem_identity_plus_canary','owner_decision',$2,$3,$4,
       $5::timestamptz,$5::timestamptz,$6)
     RETURNING id::text`,
    [orderId, input.policy.decisionUuid, keys.sourceRef, evidenceSha256, input.observedAt, actor],
  );
  const sourceRefId = sourceRef.rows[0]?.id;
  if (!sourceRefId) throw new Error('plus_canary_source_ref_insert_failed');
  const seat = await input.client.query<{ id: string }>(
    `INSERT INTO business_v2.student_enrollment_seats
       (seat_key,order_id,seat_number,participant_party_id,
        participant_evidence_sha256,payer_relationship,state,version,
        created_at,updated_at,updated_by)
     VALUES ($1,$2,1,$3,$4,'not_applicable','materialized',0,
       $5::timestamptz,$5::timestamptz,$6)
     RETURNING id::text`,
    [keys.seat, orderId, input.policy.partyId, evidenceSha256, input.observedAt, actor],
  );
  const seatId = seat.rows[0]?.id;
  if (!seatId) throw new Error('plus_canary_seat_insert_failed');
  const agreement = await input.client.query<{ id: string }>(
    `INSERT INTO business_v2.student_financial_agreements
       (agreement_key,order_id,agreement_type,state,source_reference_id,version,
        evidence_sha256,created_at,updated_at,updated_by)
     VALUES ($1,$2,'complimentary','complete',$3,0,$4,
       $5::timestamptz,$5::timestamptz,$6)
     RETURNING id::text`,
    [keys.agreement, orderId, sourceRefId, evidenceSha256, input.observedAt, actor],
  );
  if (!agreement.rows[0]?.id) throw new Error('plus_canary_agreement_insert_failed');
  const enrollment = await input.client.query<{ id: string }>(
    `INSERT INTO business_v2.student_enrollments_v2
       (enrollment_key,order_id,seat_id,participant_party_id,offer_key,bundle_key,
        bundle_version,catalog_revision,state,version,effective_at,ended_at,
        materialization_sha256,created_at,updated_at,updated_by)
     VALUES ($1,$2,$3,$4,'coaching-tools-plus-canary','coaching-tools-plus-canary:v1',
       1,1,'active',0,$5::timestamptz,$6::timestamptz,$7,
       $5::timestamptz,$5::timestamptz,$8)
     RETURNING id::text`,
    [
      keys.enrollment,
      orderId,
      seatId,
      input.policy.partyId,
      input.observedAt,
      request.expiresAt,
      evidenceSha256,
      actor,
    ],
  );
  const enrollmentId = enrollment.rows[0]?.id;
  if (!enrollmentId) throw new Error('plus_canary_enrollment_insert_failed');
  const entitlement = await input.client.query<{ id: string }>(
    `INSERT INTO business_v2.student_component_entitlements
       (entitlement_key,enrollment_id,component_key,grant_episode,state,version,
        evidence_sha256,created_at,updated_at,updated_by)
     VALUES ($1,$2,'shared.coaching-tools-plus',1,'included',0,$3,
       $4::timestamptz,$4::timestamptz,$5)
     RETURNING id::text`,
    [keys.entitlement, enrollmentId, evidenceSha256, input.observedAt, actor],
  );
  if (!entitlement.rows[0]?.id) throw new Error('plus_canary_entitlement_insert_failed');
  const evidence = await input.client.query(
    `INSERT INTO business_v2.student_enrollment_evidence
       (evidence_key,subject_type,subject_key,evidence_type,source_reference_id,
        evidence_sha256,observed_at,recorded_at,recorded_by)
     VALUES ($1,'entitlement',$2,'owner_canary_authorization',$3,$4,
       $5::timestamptz,$5::timestamptz,$6)`,
    [keys.grantEvidence, keys.entitlement, sourceRefId, evidenceSha256, input.observedAt, actor],
  );
  if (evidence.rowCount !== 1) throw new Error('plus_canary_evidence_insert_failed');
  const subjects: Array<[string, string]> = [
    ['order', keys.order],
    ['seat', keys.seat],
    ['agreement', keys.agreement],
    ['enrollment', keys.enrollment],
    ['entitlement', keys.entitlement],
  ];
  let historyInserted = 0;
  for (const [subjectType, subjectKey] of subjects) {
    const history = await input.client.query(
      `INSERT INTO business_v2.student_enrollment_history
         (subject_type,subject_key,previous_version,new_version,command_key,
          reason_code,evidence_sha256,actor,occurred_at,recorded_at)
       VALUES ($1,$2,NULL,0,'grant_plus_canary','owner_canary_authorization',
         $3,$4,$5::timestamptz,$5::timestamptz)`,
      [subjectType, subjectKey, evidenceSha256, actor, input.observedAt],
    );
    historyInserted += history.rowCount ?? 0;
  }
  if (historyInserted !== 5) throw new Error('plus_canary_history_insert_failed');
  const state = await readCanaryState(input.client, input.policy);
  if (!state || !isExactActiveState(state, evidenceSha256, request)) {
    throw new Error('plus_canary_grant_readback_failed');
  }
  if ((await enrollment82Fingerprint(input.client)) !== enrollment82Before) {
    throw new Error('plus_canary_enrollment_82_changed');
  }
  if (JSON.stringify(await protectedCounts(input.client)) !== JSON.stringify(beforeProtected)) {
    throw new Error('plus_canary_protected_counts_changed');
  }
  return {
    outcome: 'accepted',
    orderInserted: 1,
    sourceRefInserted: 1,
    seatInserted: 1,
    agreementInserted: 1,
    enrollmentInserted: 1,
    entitlementInserted: 1,
    evidenceInserted: evidence.rowCount === 1 ? 1 : 0,
    historyInserted: historyInserted === 5 ? 5 : 0,
    partyWrites: 0,
    referenceWrites: 0,
    authAccountWrites: 0,
    providerWrites: 0,
  };
}

function isExactRevokedState(
  state: CanaryState,
  grantEvidenceSha256: string,
  revokeEvidenceSha256: string,
): boolean {
  return (
    state.sourceEvidenceSha256 === grantEvidenceSha256 &&
    state.entitlementEvidenceSha256 === revokeEvidenceSha256 &&
    state.orderState === 'cancelled' &&
    state.orderVersion === 1 &&
    state.seatState === 'cancelled' &&
    state.seatVersion === 1 &&
    state.agreementState === 'cancelled' &&
    state.agreementVersion === 1 &&
    state.enrollmentState === 'cancelled' &&
    state.enrollmentVersion === 1 &&
    state.entitlementState === 'revoked' &&
    state.entitlementVersion === 1 &&
    state.endedAt != null
  );
}

export async function revokeCoachingToolsPlusCanaryWithClient(input: {
  client: PoolClient;
  request: unknown;
  policy: CoachingToolsPlusCanaryPolicy;
  observedAt: string;
}): Promise<CoachingToolsPlusCanaryRevokeResult> {
  const request = validateScope(input, false);
  await acquireLock(input.client, input.policy.decisionUuid);
  await requireBinding(input.client, request, input.policy);
  const beforeProtected = await protectedCounts(input.client);
  const enrollment82Before = await enrollment82Fingerprint(input.client);
  const grantEvidenceSha256 = grantEvidence({ request, policy: input.policy });
  const revokeEvidenceSha256 = sha256Json({ grantEvidenceSha256, outcome: 'revoked' });
  const keys = canaryKeys(input.policy);
  const state = await readCanaryState(input.client, input.policy);
  if (!state) throw new Error('plus_canary_grant_missing');
  if (isExactRevokedState(state, grantEvidenceSha256, revokeEvidenceSha256)) {
    if ((await enrollment82Fingerprint(input.client)) !== enrollment82Before) {
      throw new Error('plus_canary_enrollment_82_changed');
    }
    return {
      outcome: 'duplicate',
      orderUpdated: 0,
      seatUpdated: 0,
      agreementUpdated: 0,
      enrollmentUpdated: 0,
      entitlementUpdated: 0,
      evidenceInserted: 0,
      historyInserted: 0,
      partyWrites: 0,
      referenceWrites: 0,
      authAccountWrites: 0,
      providerWrites: 0,
    };
  }
  if (!isExactActiveState(state, grantEvidenceSha256, request)) {
    throw new Error('plus_canary_revoke_conflict');
  }
  const actor = 'tandem-identity-plus-canary';
  const updates = {
    entitlement: await input.client.query(
      `UPDATE business_v2.student_component_entitlements
          SET state='revoked',version=version+1,evidence_sha256=$2,
              updated_at=$3::timestamptz,updated_by=$4
        WHERE entitlement_key=$1 AND state='included' AND version=0`,
      [keys.entitlement, revokeEvidenceSha256, input.observedAt, actor],
    ),
    enrollment: await input.client.query(
      `UPDATE business_v2.student_enrollments_v2
          SET state='cancelled',version=version+1,ended_at=$2::timestamptz,
              updated_at=$2::timestamptz,updated_by=$3
        WHERE enrollment_key=$1 AND state='active' AND version=0`,
      [keys.enrollment, input.observedAt, actor],
    ),
    agreement: await input.client.query(
      `UPDATE business_v2.student_financial_agreements
          SET state='cancelled',version=version+1,updated_at=$2::timestamptz,
              updated_by=$3
        WHERE agreement_key=$1 AND state='complete' AND version=0`,
      [keys.agreement, input.observedAt, actor],
    ),
    seat: await input.client.query(
      `UPDATE business_v2.student_enrollment_seats
          SET state='cancelled',version=version+1,updated_at=$2::timestamptz,
              updated_by=$3
        WHERE seat_key=$1 AND state='materialized' AND version=0`,
      [keys.seat, input.observedAt, actor],
    ),
    order: await input.client.query(
      `UPDATE business_v2.student_enrollment_orders
          SET state='cancelled',version=version+1,updated_at=$2::timestamptz,
              updated_by=$3
        WHERE order_key=$1 AND state='materialized' AND version=0`,
      [keys.order, input.observedAt, actor],
    ),
  };
  if (Object.values(updates).some((result) => result.rowCount !== 1)) {
    throw new Error('plus_canary_revoke_update_failed');
  }
  const sourceRef = await input.client.query<{ id: string }>(
    `SELECT id::text FROM business_v2.student_enrollment_order_source_refs
      WHERE idempotency_key=$1 AND evidence_sha256=$2`,
    [keys.sourceRef, grantEvidenceSha256],
  );
  if (sourceRef.rowCount !== 1) throw new Error('plus_canary_source_ref_conflict');
  const evidence = await input.client.query(
    `INSERT INTO business_v2.student_enrollment_evidence
       (evidence_key,subject_type,subject_key,evidence_type,source_reference_id,
        evidence_sha256,observed_at,recorded_at,recorded_by)
     VALUES ($1,'entitlement',$2,'owner_canary_revocation',$3,$4,
       $5::timestamptz,$5::timestamptz,$6)`,
    [keys.revokeEvidence, keys.entitlement, sourceRef.rows[0].id, revokeEvidenceSha256, input.observedAt, actor],
  );
  if (evidence.rowCount !== 1) throw new Error('plus_canary_evidence_insert_failed');
  const subjects: Array<[string, string]> = [
    ['order', keys.order],
    ['seat', keys.seat],
    ['agreement', keys.agreement],
    ['enrollment', keys.enrollment],
    ['entitlement', keys.entitlement],
  ];
  let historyInserted = 0;
  for (const [subjectType, subjectKey] of subjects) {
    const history = await input.client.query(
      `INSERT INTO business_v2.student_enrollment_history
         (subject_type,subject_key,previous_version,new_version,command_key,
          reason_code,evidence_sha256,actor,occurred_at,recorded_at)
       VALUES ($1,$2,0,1,'revoke_plus_canary','owner_canary_complete',
         $3,$4,$5::timestamptz,$5::timestamptz)`,
      [subjectType, subjectKey, revokeEvidenceSha256, actor, input.observedAt],
    );
    historyInserted += history.rowCount ?? 0;
  }
  if (historyInserted !== 5) throw new Error('plus_canary_history_insert_failed');
  const after = await readCanaryState(input.client, input.policy);
  if (!after || !isExactRevokedState(after, grantEvidenceSha256, revokeEvidenceSha256)) {
    throw new Error('plus_canary_revoke_readback_failed');
  }
  if ((await enrollment82Fingerprint(input.client)) !== enrollment82Before) {
    throw new Error('plus_canary_enrollment_82_changed');
  }
  if (JSON.stringify(await protectedCounts(input.client)) !== JSON.stringify(beforeProtected)) {
    throw new Error('plus_canary_protected_counts_changed');
  }
  return {
    outcome: 'revoked',
    orderUpdated: 1,
    seatUpdated: 1,
    agreementUpdated: 1,
    enrollmentUpdated: 1,
    entitlementUpdated: 1,
    evidenceInserted: evidence.rowCount === 1 ? 1 : 0,
    historyInserted: historyInserted === 5 ? 5 : 0,
    partyWrites: 0,
    referenceWrites: 0,
    authAccountWrites: 0,
    providerWrites: 0,
  };
}
