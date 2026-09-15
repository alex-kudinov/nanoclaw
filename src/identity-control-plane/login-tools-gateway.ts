import { OAuth2Client } from 'google-auth-library';
import type { PoolClient, QueryResultRow } from 'pg';
import { z } from 'zod';

import { sha256Json } from './canonical.js';

export const LOGIN_TOOLS_GATEWAY_PATH = '/identity/v1/binding';
export const LOGIN_TOOLS_GATEWAY_MAX_BODY_BYTES = 4_096;
export const GOOGLE_SERVICE_ACCOUNT_ISSUER = 'https://accounts.google.com';

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const bounded = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine(
      (value) => value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value),
      'identity_string_invalid',
    );

export const LoginToolsGatewayRequestSchema = z
  .object({
    kind: z.literal('tandem_identity_binding_lookup'),
    schemaVersion: z.literal(1),
    projectId: bounded(120),
    uid: bounded(500),
    verifiedEmailSha256: sha256.optional(),
  })
  .strict();

export type LoginToolsGatewayRequest = z.infer<
  typeof LoginToolsGatewayRequestSchema
>;

export type LoginToolsGatewayPolicy = {
  projectId: string;
  environment: 'development';
  pilotPartyId: number;
  pilotEmailSha256: string;
};

export type LoginToolsPilotBindingPolicy = LoginToolsGatewayPolicy & {
  decisionRef: string;
  decisionUuid: string;
  callerSubject: string;
};

export type LoginToolsPilotDisablePolicy = LoginToolsPilotBindingPolicy & {
  rollbackDecisionRef: string;
  rollbackDecisionUuid: string;
};

export type LoginToolsGatewayResponse =
  | { status: 'unbound' }
  | { status: 'ambiguous'; exceptionId: string }
  | {
      status: 'bound';
      partyId: string;
      entitlements: Array<{
        schemaVersion: 1;
        key: 'coaching_tools.plus';
        state: 'active' | 'held' | 'revoked';
        validFrom: string;
        validUntil: string;
        verifiedAt: string;
        canonicalVersion: number;
      }>;
    };

export type GoogleServiceCallerPolicy = {
  audience: string;
  principalEmail: string;
  subject: string;
};

export class GoogleServiceCallerVerifier {
  constructor(
    private readonly policy: GoogleServiceCallerPolicy,
    private readonly client = new OAuth2Client(),
  ) {}

  async verify(idToken: string): Promise<void> {
    if (!idToken || Buffer.byteLength(idToken, 'utf8') > 8_192) {
      throw new Error('service_identity_invalid');
    }
    let payload;
    try {
      payload = (
        await this.client.verifyIdToken({
          idToken,
          audience: this.policy.audience,
          maxExpiry: 3_600,
        })
      ).getPayload();
    } catch {
      throw new Error('service_identity_invalid');
    }
    if (
      !payload ||
      payload.iss !== GOOGLE_SERVICE_ACCOUNT_ISSUER ||
      payload.aud !== this.policy.audience ||
      payload.email !== this.policy.principalEmail ||
      payload.email_verified !== true ||
      payload.sub !== this.policy.subject
    ) {
      throw new Error('service_identity_invalid');
    }
  }
}

interface AuthAccountRow extends QueryResultRow {
  party_id: string | null;
  account_state: string;
  binding_basis: string;
  binding_payload_sha256?: string;
}

interface EntitlementRow extends QueryResultRow {
  component_state: string;
  component_version: number;
  enrollment_state: string;
  valid_from: string;
  valid_until: string | null;
}

interface CountRow extends QueryResultRow {
  parties: string;
  refs: string;
  entitlements: string;
  provider_attempts: string;
}

function integer(value: string, code: string): number {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(code);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(code);
  return parsed;
}

function parsePartyId(value: string | null): number | null {
  if (value == null) return null;
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error('party_id_invalid');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error('party_id_invalid');
  return parsed;
}

export async function lookupLoginToolsBindingWithClient(input: {
  client: PoolClient;
  request: unknown;
  policy: LoginToolsGatewayPolicy;
  observedAt: string;
}): Promise<LoginToolsGatewayResponse> {
  const request = LoginToolsGatewayRequestSchema.parse(input.request);
  if (
    request.projectId !== input.policy.projectId ||
    (request.verifiedEmailSha256 != null &&
      request.verifiedEmailSha256 !== input.policy.pilotEmailSha256)
  ) {
    return { status: 'unbound' };
  }
  const issuer = `https://securetoken.google.com/${input.policy.projectId}`;
  const account = await input.client.query<AuthAccountRow>(
    `SELECT party_id::text,account_state,binding_basis
       FROM business_v2.auth_accounts
      WHERE issuer=$1 AND environment=$2 AND source_scope=$3 AND subject=$4
      ORDER BY account_version DESC LIMIT 1`,
    [issuer, input.policy.environment, input.policy.projectId, request.uid],
  );
  if (account.rowCount === 0) return { status: 'unbound' };
  const latest = account.rows[0];
  const partyId = parsePartyId(latest.party_id);
  if (
    latest.account_state !== 'accepted' ||
    latest.binding_basis !== 'operator_decision' ||
    partyId == null
  ) {
    return { status: 'unbound' };
  }
  if (partyId !== input.policy.pilotPartyId) {
    throw new Error('pilot_party_conflict');
  }

  const rows = await input.client.query<EntitlementRow>(
    `SELECT e.state AS component_state,e.version AS component_version,
            en.state AS enrollment_state,
            COALESCE(en.effective_at,en.created_at)::text AS valid_from,
            en.ended_at::text AS valid_until
       FROM business_v2.student_component_entitlements e
       JOIN business_v2.student_enrollments_v2 en ON en.id=e.enrollment_id
      WHERE en.participant_party_id=$1
        AND e.component_key='shared.coaching-tools-plus'
      ORDER BY e.entitlement_key`,
    [partyId],
  );
  const entitlements = rows.rows.map((row) => ({
    schemaVersion: 1 as const,
    key: 'coaching_tools.plus' as const,
    state:
      row.component_state === 'revoked'
        ? ('revoked' as const)
        : row.component_state === 'included' &&
            ['active', 'completed'].includes(row.enrollment_state)
          ? ('active' as const)
          : ('held' as const),
    validFrom: new Date(row.valid_from).toISOString(),
    validUntil: row.valid_until
      ? new Date(row.valid_until).toISOString()
      : '9999-12-31T23:59:59.999Z',
    verifiedAt: new Date(input.observedAt).toISOString(),
    canonicalVersion: row.component_version + 1,
  }));
  return { status: 'bound', partyId: String(partyId), entitlements };
}

async function protectedCounts(client: PoolClient): Promise<CountRow> {
  const result = await client.query<CountRow>(`SELECT
    (SELECT count(*) FROM business_v2.parties)::text AS parties,
    (SELECT count(*) FROM business_v2.party_external_refs)::text AS refs,
    (SELECT count(*) FROM business_v2.student_component_entitlements)::text
      AS entitlements,
    (SELECT count(*) FROM business_v2.provider_projection_attempts)::text
      AS provider_attempts`);
  return result.rows[0];
}

export type LoginToolsPilotBindResult = {
  outcome: 'accepted' | 'duplicate';
  receiptInserted: 0 | 1;
  authAccountsInserted: 0 | 1;
  decisionsInserted: 0 | 1;
  partyWrites: 0;
  referenceWrites: 0;
  entitlementWrites: 0;
  providerWrites: 0;
};

export async function bindLoginToolsPilotWithClient(input: {
  client: PoolClient;
  request: unknown;
  policy: LoginToolsPilotBindingPolicy;
  observedAt: string;
}): Promise<LoginToolsPilotBindResult> {
  const request = LoginToolsGatewayRequestSchema.required({
    verifiedEmailSha256: true,
  }).parse(input.request);
  if (
    request.projectId !== input.policy.projectId ||
    request.verifiedEmailSha256 !== input.policy.pilotEmailSha256
  ) {
    throw new Error('pilot_scope_invalid');
  }
  const issuer = `https://securetoken.google.com/${input.policy.projectId}`;
  const stableBinding = {
    decisionRef: input.policy.decisionRef,
    decisionUuid: input.policy.decisionUuid,
    projectId: request.projectId,
    uid: request.uid,
    verifiedEmailSha256: request.verifiedEmailSha256,
    partyId: input.policy.pilotPartyId,
    callerSubject: input.policy.callerSubject,
  };
  const bindingSha256 = sha256Json(stableBinding);
  const lock = await input.client.query<{ acquired: boolean }>(
    `SELECT pg_try_advisory_xact_lock(
       hashtext('tandem_identity_login_tools:' || $1)
     ) AS acquired`,
    [`${request.projectId}:${request.uid}`],
  );
  if (!lock.rows[0]?.acquired) throw new Error('pilot_binding_busy');

  const existing = await input.client.query<AuthAccountRow>(
    `SELECT a.party_id::text,a.account_state,a.binding_basis,
            r.payload_sha256 AS binding_payload_sha256
       FROM business_v2.auth_accounts a
       JOIN business_v2.identity_event_receipts r ON r.id=a.source_receipt_id
      WHERE a.issuer=$1 AND a.environment=$2 AND a.source_scope=$3
        AND a.subject=$4
      ORDER BY a.account_version DESC LIMIT 1 FOR SHARE OF a`,
    [issuer, input.policy.environment, input.policy.projectId, request.uid],
  );
  if (existing.rowCount === 1) {
    const partyId = parsePartyId(existing.rows[0].party_id);
    if (
      existing.rows[0].account_state !== 'accepted' ||
      existing.rows[0].binding_basis !== 'operator_decision' ||
      partyId !== input.policy.pilotPartyId ||
      existing.rows[0].binding_payload_sha256 !== bindingSha256
    ) {
      throw new Error('pilot_binding_conflict');
    }
    return {
      outcome: 'duplicate',
      receiptInserted: 0,
      authAccountsInserted: 0,
      decisionsInserted: 0,
      partyWrites: 0,
      referenceWrites: 0,
      entitlementWrites: 0,
      providerWrites: 0,
    };
  }

  const party = await input.client.query<{ valid: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM business_v2.parties
        WHERE id=$1 AND merged_into IS NULL AND party_type='person'
     ) AS valid`,
    [input.policy.pilotPartyId],
  );
  if (!party.rows[0]?.valid) throw new Error('pilot_party_unavailable');
  const before = await protectedCounts(input.client);
  const manifest = {
    kind: 'provider_adapter_manifest',
    schemaVersion: 1,
    adapterKey: 'tandem_identity_login_tools_gateway',
    adapterVersion: '1.0.0',
    provider: 'google_identity_platform',
    environment: 'development',
    scope: input.policy.projectId,
    entityTypes: ['firebase_user'],
    eventTypes: [
      'operator_approved_auth_binding',
      'operator_disabled_auth_binding',
    ],
    mode: 'owner_pilot',
    partyWrites: false,
    externalReferenceWrites: false,
    entitlementWrites: false,
    providerWrites: false,
  };
  const manifestSha256 = sha256Json(manifest);
  const adapter = await input.client.query<{ id: string }>(
    `INSERT INTO business_v2.party_context_adapter_registrations
       (adapter_key,adapter_version,source_system,source_scope,
        manifest_version,manifest_sha256,manifest,config_declaration,
        enabled,conformance_status,conformance_receipt_sha256,circuit_status,
        failure_count,last_error_code,last_health_at,environment,accepted_at,
        retired_at,identity_entity_types,identity_event_types)
     VALUES ('tandem_identity_login_tools_gateway','1.0.0',
       'tandem_identity_gateway',$1,1,$2,$3::jsonb,$4::jsonb,true,'passed',$5,
       'closed',0,NULL,$6::timestamptz,'development',$6::timestamptz,NULL,
       ARRAY['firebase_user']::text[],
       ARRAY['operator_approved_auth_binding','operator_disabled_auth_binding']::text[])
     ON CONFLICT (adapter_key,adapter_version,source_scope) DO UPDATE SET
       last_health_at=EXCLUDED.last_health_at,
       updated_at=now()
     WHERE party_context_adapter_registrations.environment='development'
     RETURNING id::text`,
    [
      input.policy.projectId,
      manifestSha256,
      JSON.stringify(manifest),
      JSON.stringify({ decisionRef: input.policy.decisionRef }),
      sha256Json({ manifestSha256, status: 'passed' }),
      input.observedAt,
    ],
  );
  if (adapter.rowCount !== 1) throw new Error('pilot_adapter_conflict');
  const adapterId = integer(adapter.rows[0].id, 'pilot_adapter_id_invalid');
  const receipt = await input.client.query<{
    stored_receipt_id: string;
    inserted: boolean;
  }>(
    `SELECT stored_receipt_id::text,inserted
       FROM business_v2.fn_tandem_identity_store_event_receipt(
         $1,'tandem_identity_gateway','development',$2,'firebase_user',$3,
         'operator_approved_auth_binding',$4,$5,$6,NULL,'authenticated',
         'owner_decision_verified_google_subject','normalized',1,
         'login-tools-pilot-v1',NULL,$7::timestamptz,$8,1
       )`,
    [
      adapterId,
      input.policy.projectId,
      request.uid,
      input.policy.decisionUuid,
      `operator-binding:${bindingSha256}`,
      bindingSha256,
      input.observedAt,
      sha256Json(input.policy.callerSubject),
    ],
  );
  if (!receipt.rows[0]?.inserted) throw new Error('unexpected_binding_receipt');
  const receiptId = integer(
    receipt.rows[0].stored_receipt_id,
    'pilot_receipt_id_invalid',
  );
  await input.client.query(
    `INSERT INTO business_v2.identity_event_related_refs
       (receipt_id,ref_index,provider,environment,source_scope,entity_type,external_id)
     VALUES ($1,0,'google_identity_platform','development',$2,'firebase_user',$3)`,
    [receiptId, input.policy.projectId, request.uid],
  );
  await input.client.query(
    `INSERT INTO business_v2.auth_accounts
       (issuer,environment,source_scope,subject,account_version,party_id,
        account_state,binding_basis,source_receipt_id,source_effective_at,
        last_observed_at,last_verified_at,valid_from,valid_until,
        retention_policy_version)
     VALUES ($1,'development',$2,$3,1,$4,'accepted','operator_decision',$5,
       $6::timestamptz,$6::timestamptz,$6::timestamptz,$6::timestamptz,NULL,1)`,
    [
      issuer,
      input.policy.projectId,
      request.uid,
      input.policy.pilotPartyId,
      receiptId,
      input.observedAt,
    ],
  );
  const evidenceRefs = [
    `decision:${input.policy.decisionRef}`,
    `binding:${bindingSha256}`,
    `receipt:${receiptId}`,
  ].sort();
  await input.client.query(
    `INSERT INTO business_v2.identity_resolution_decisions
       (decision_uuid,provider,environment,source_scope,entity_type,
        external_id_sha256,result,resolution_basis,party_id,candidate_id,
        evidence_refs,evidence_sha256,reason_code,decided_at,
        retention_policy_version)
     VALUES ($1::uuid,'google_identity_platform','development',$2,
       'firebase_user',$3,'resolved_auth_subject','accepted_auth_subject',$4,
       NULL,$5::jsonb,business_v2.fn_tandem_identity_sha256($5::jsonb::text),
       'OWNER_APPROVED_PILOT_BINDING',$6::timestamptz,1)`,
    [
      input.policy.decisionUuid,
      input.policy.projectId,
      sha256Json(request.uid),
      input.policy.pilotPartyId,
      JSON.stringify(evidenceRefs),
      input.observedAt,
    ],
  );
  const after = await protectedCounts(input.client);
  if (
    before.parties !== after.parties ||
    before.refs !== after.refs ||
    before.entitlements !== after.entitlements ||
    before.provider_attempts !== after.provider_attempts
  ) {
    throw new Error('pilot_forbidden_side_effect');
  }
  return {
    outcome: 'accepted',
    receiptInserted: 1,
    authAccountsInserted: 1,
    decisionsInserted: 1,
    partyWrites: 0,
    referenceWrites: 0,
    entitlementWrites: 0,
    providerWrites: 0,
  };
}

export async function disableLoginToolsPilotBindingWithClient(input: {
  client: PoolClient;
  request: unknown;
  policy: LoginToolsPilotDisablePolicy;
  observedAt: string;
}): Promise<{
  outcome: 'disabled' | 'duplicate';
  receiptInserted: 0 | 1;
  authAccountsInserted: 0 | 1;
}> {
  const request = LoginToolsGatewayRequestSchema.required({
    verifiedEmailSha256: true,
  }).parse(input.request);
  if (
    request.projectId !== input.policy.projectId ||
    request.verifiedEmailSha256 !== input.policy.pilotEmailSha256
  ) {
    throw new Error('pilot_scope_invalid');
  }
  const issuer = `https://securetoken.google.com/${input.policy.projectId}`;
  const stableBinding = {
    decisionRef: input.policy.decisionRef,
    decisionUuid: input.policy.decisionUuid,
    projectId: request.projectId,
    uid: request.uid,
    verifiedEmailSha256: request.verifiedEmailSha256,
    partyId: input.policy.pilotPartyId,
    callerSubject: input.policy.callerSubject,
  };
  const bindingSha256 = sha256Json(stableBinding);
  const rollback = {
    bindingSha256,
    rollbackDecisionRef: input.policy.rollbackDecisionRef,
    rollbackDecisionUuid: input.policy.rollbackDecisionUuid,
  };
  const rollbackSha256 = sha256Json(rollback);
  const lock = await input.client.query<{ acquired: boolean }>(
    `SELECT pg_try_advisory_xact_lock(
       hashtext('tandem_identity_login_tools:' || $1)
     ) AS acquired`,
    [`${request.projectId}:${request.uid}`],
  );
  if (!lock.rows[0]?.acquired) throw new Error('pilot_binding_busy');

  const latest = await input.client.query<
    AuthAccountRow & { account_version: number }
  >(
    `SELECT a.party_id::text,a.account_state,a.binding_basis,
            a.account_version,r.payload_sha256 AS binding_payload_sha256
       FROM business_v2.auth_accounts a
       JOIN business_v2.identity_event_receipts r ON r.id=a.source_receipt_id
      WHERE a.issuer=$1 AND a.environment=$2 AND a.source_scope=$3
        AND a.subject=$4
      ORDER BY a.account_version DESC LIMIT 1 FOR SHARE OF a`,
    [issuer, input.policy.environment, input.policy.projectId, request.uid],
  );
  if (latest.rowCount !== 1) throw new Error('pilot_binding_missing');
  const current = latest.rows[0];
  if (current.account_state === 'disabled') {
    if (current.binding_payload_sha256 !== rollbackSha256) {
      throw new Error('pilot_rollback_conflict');
    }
    return {
      outcome: 'duplicate',
      receiptInserted: 0,
      authAccountsInserted: 0,
    };
  }
  if (
    current.account_state !== 'accepted' ||
    current.binding_basis !== 'operator_decision' ||
    parsePartyId(current.party_id) !== input.policy.pilotPartyId ||
    current.binding_payload_sha256 !== bindingSha256
  ) {
    throw new Error('pilot_binding_conflict');
  }
  const adapter = await input.client.query<{ id: string }>(
    `SELECT id::text FROM business_v2.party_context_adapter_registrations
      WHERE adapter_key='tandem_identity_login_tools_gateway'
        AND adapter_version='1.0.0' AND source_scope=$1
        AND environment='development' AND enabled AND conformance_status='passed'`,
    [input.policy.projectId],
  );
  if (adapter.rowCount !== 1) throw new Error('pilot_adapter_unavailable');
  const receipt = await input.client.query<{
    stored_receipt_id: string;
    inserted: boolean;
  }>(
    `SELECT stored_receipt_id::text,inserted
       FROM business_v2.fn_tandem_identity_store_event_receipt(
         $1,'tandem_identity_gateway','development',$2,'firebase_user',$3,
         'operator_disabled_auth_binding',$4,$5,$6,NULL,'authenticated',
         'owner_decision_verified_google_subject','normalized',1,
         'login-tools-pilot-v1',NULL,$7::timestamptz,$8,1
       )`,
    [
      integer(adapter.rows[0].id, 'pilot_adapter_id_invalid'),
      input.policy.projectId,
      request.uid,
      input.policy.rollbackDecisionUuid,
      `operator-disable:${rollbackSha256}`,
      rollbackSha256,
      input.observedAt,
      sha256Json(input.policy.callerSubject),
    ],
  );
  if (!receipt.rows[0]?.inserted)
    throw new Error('unexpected_rollback_receipt');
  const receiptId = integer(
    receipt.rows[0].stored_receipt_id,
    'pilot_receipt_id_invalid',
  );
  await input.client.query(
    `INSERT INTO business_v2.identity_event_related_refs
       (receipt_id,ref_index,provider,environment,source_scope,entity_type,external_id)
     VALUES ($1,0,'google_identity_platform','development',$2,'firebase_user',$3)`,
    [receiptId, input.policy.projectId, request.uid],
  );
  await input.client.query(
    `INSERT INTO business_v2.auth_accounts
       (issuer,environment,source_scope,subject,account_version,party_id,
        account_state,binding_basis,source_receipt_id,source_effective_at,
        last_observed_at,last_verified_at,valid_from,valid_until,
        retention_policy_version)
     VALUES ($1,'development',$2,$3,$4,NULL,'disabled','none',$5,
       $6::timestamptz,$6::timestamptz,$6::timestamptz,$6::timestamptz,NULL,1)`,
    [
      issuer,
      input.policy.projectId,
      request.uid,
      current.account_version + 1,
      receiptId,
      input.observedAt,
    ],
  );
  return { outcome: 'disabled', receiptInserted: 1, authAccountsInserted: 1 };
}
