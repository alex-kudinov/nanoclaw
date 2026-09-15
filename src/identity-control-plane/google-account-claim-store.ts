import type { PoolClient, QueryResultRow } from 'pg';

import { sha256Json } from './canonical.js';
import {
  evaluateGoogleAccountClaim,
  type GoogleAccountClaimContext,
  type GoogleAccountClaimEnvelope,
} from './google-account-claim.js';

export const GOOGLE_CLAIM_ADAPTER_KEY =
  'tandem_identity_google_account_claim_dark';
export const GOOGLE_CLAIM_ADAPTER_VERSION = '1.0.0';

interface ProtectedCounts extends QueryResultRow {
  parties: string;
  refs: string;
  provider_attempts: string;
}

interface DatabaseIdentity extends QueryResultRow {
  database_name: string;
}

export interface GoogleAccountClaimStoreResult {
  outcome: 'accepted' | 'duplicate' | 'held' | 'rejected';
  reasonCode: string;
  receiptInserted: number;
  relatedRefsInserted: number;
  authAccountsInserted: number;
  decisionsInserted: number;
  partyWrites: 0;
  referenceWrites: 0;
  providerAttempts: 0;
  providerWrites: 0;
  accessWrites: 0;
}

function fail(code: string): never {
  throw new Error(`tandem_identity_google_claim:${code}`);
}

function integer(value: string, code: string): number {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) fail(code);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) fail(code);
  return parsed;
}

async function assertDarkDisposableDatabase(client: PoolClient): Promise<void> {
  const result = await client.query<DatabaseIdentity>(
    `SELECT current_database() AS database_name`,
  );
  if (
    result.rowCount !== 1 ||
    !/^nc_tandem_identity_d2_test_[a-z0-9_]+$/.test(
      result.rows[0].database_name,
    )
  ) {
    fail('disposable_database_required');
  }
}

async function protectedCounts(client: PoolClient): Promise<ProtectedCounts> {
  const result = await client.query<ProtectedCounts>(`SELECT
    (SELECT count(*) FROM business_v2.parties)::text AS parties,
    (SELECT count(*) FROM business_v2.party_external_refs)::text AS refs,
    (SELECT count(*) FROM business_v2.provider_projection_attempts)::text
      AS provider_attempts`);
  return result.rows[0];
}

function assertProtectedCounts(
  before: ProtectedCounts,
  after: ProtectedCounts,
): void {
  if (
    before.parties !== after.parties ||
    before.refs !== after.refs ||
    before.provider_attempts !== after.provider_attempts
  ) {
    fail('forbidden_side_effect');
  }
}

async function registerAdapter(
  client: PoolClient,
  claim: GoogleAccountClaimEnvelope,
  observedAt: string,
): Promise<number> {
  const manifest = {
    kind: 'provider_adapter_manifest',
    schemaVersion: 1,
    adapterKey: GOOGLE_CLAIM_ADAPTER_KEY,
    adapterVersion: GOOGLE_CLAIM_ADAPTER_VERSION,
    provider: 'google_identity_platform',
    environment: claim.googleSubject.environment,
    scope: claim.googleSubject.sourceScope,
    entityTypes: ['firebase_user'],
    eventTypes: ['account_link_claim_accepted'],
    mode: 'dark_disposable_account_claim',
    providerNetwork: false,
    realUsers: false,
    partyWrites: false,
    externalReferenceWrites: false,
    accessWrites: false,
    providerWrites: false,
  };
  const manifestSha256 = sha256Json(manifest);
  const conformanceSha256 = sha256Json({
    suite: 'tandem_identity_google_claim_dark_v1',
    manifestSha256,
    result: 'passed',
  });
  const result = await client.query<{ id: string }>(
    `INSERT INTO business_v2.party_context_adapter_registrations
       (adapter_key,adapter_version,source_system,source_scope,
        manifest_version,manifest_sha256,manifest,config_declaration,
        enabled,conformance_status,conformance_receipt_sha256,circuit_status,
        failure_count,last_error_code,last_health_at,environment,accepted_at,
        retired_at,identity_entity_types,identity_event_types)
     VALUES ($1,$2,'google_identity_platform',$3,1,$4,$5::jsonb,$6::jsonb,
       true,'passed',$7,'closed',0,NULL,$8::timestamptz,$9,$8::timestamptz,
       NULL,ARRAY['firebase_user']::text[],
       ARRAY['account_link_claim_accepted']::text[])
     ON CONFLICT (adapter_key,adapter_version,source_scope) DO UPDATE
       SET manifest_sha256=EXCLUDED.manifest_sha256,
           manifest=EXCLUDED.manifest,
           config_declaration=EXCLUDED.config_declaration,
           enabled=true,conformance_status='passed',
           conformance_receipt_sha256=EXCLUDED.conformance_receipt_sha256,
           circuit_status='closed',failure_count=0,last_error_code=NULL,
           last_health_at=EXCLUDED.last_health_at,
           environment=EXCLUDED.environment,
           accepted_at=COALESCE(
             party_context_adapter_registrations.accepted_at,
             EXCLUDED.accepted_at
           ),retired_at=NULL,
           identity_entity_types=EXCLUDED.identity_entity_types,
           identity_event_types=EXCLUDED.identity_event_types,
           updated_at=now()
       WHERE party_context_adapter_registrations.environment =
             EXCLUDED.environment
     RETURNING id::text`,
    [
      GOOGLE_CLAIM_ADAPTER_KEY,
      GOOGLE_CLAIM_ADAPTER_VERSION,
      claim.googleSubject.sourceScope,
      manifestSha256,
      JSON.stringify(manifest),
      JSON.stringify({
        mode: 'dark_disposable_only',
        credential: false,
        network: false,
        realUsers: false,
        partyWrites: false,
        externalReferenceWrites: false,
        accessWrites: false,
        providerWrites: false,
      }),
      conformanceSha256,
      observedAt,
      claim.googleSubject.environment,
    ],
  );
  if (result.rowCount !== 1) fail('adapter_scope_environment_conflict');
  return integer(result.rows[0].id, 'adapter_id_invalid');
}

function zeroWriteResult(
  outcome: 'held' | 'rejected',
  reasonCode: string,
): GoogleAccountClaimStoreResult {
  return {
    outcome,
    reasonCode,
    receiptInserted: 0,
    relatedRefsInserted: 0,
    authAccountsInserted: 0,
    decisionsInserted: 0,
    partyWrites: 0,
    referenceWrites: 0,
    providerAttempts: 0,
    providerWrites: 0,
    accessWrites: 0,
  };
}

export async function applyGoogleAccountClaimWithClient(input: {
  client: PoolClient;
  claim: GoogleAccountClaimEnvelope;
  context: GoogleAccountClaimContext;
}): Promise<GoogleAccountClaimStoreResult> {
  await assertDarkDisposableDatabase(input.client);
  const lock = await input.client.query<{ acquired: boolean }>(
    `SELECT pg_try_advisory_xact_lock(
       hashtext('tandem_identity_google_claim:' || $1::text)
     ) AS acquired`,
    [input.claim.claimId],
  );
  if (!lock.rows[0].acquired) fail('busy');

  const deduplicationKey = `account-claim:${input.claim.claimId}`;
  const existing = await input.client.query<{
    id: string;
    payload_sha256: string;
  }>(
    `SELECT id::text,payload_sha256
       FROM business_v2.identity_event_receipts
      WHERE provider='google_identity_platform'
        AND environment=$1 AND source_scope=$2
        AND deduplication_key=$3
      ORDER BY id LIMIT 1 FOR SHARE`,
    [
      input.claim.googleSubject.environment,
      input.claim.googleSubject.sourceScope,
      deduplicationKey,
    ],
  );
  if (existing.rowCount === 1) {
    if (existing.rows[0].payload_sha256 !== input.claim.payloadSha256) {
      fail('claim_id_payload_conflict');
    }
    const receiptId = integer(
      existing.rows[0].id,
      'existing_receipt_id_invalid',
    );
    const complete = await input.client.query<{
      auth_accounts: string;
      decisions: string;
      related_refs: string;
    }>(
      `SELECT
        (SELECT count(*) FROM business_v2.auth_accounts
          WHERE source_receipt_id=$1 AND account_state='accepted'
            AND binding_basis='accepted_claim')::text AS auth_accounts,
        (SELECT count(*) FROM business_v2.identity_resolution_decisions
          WHERE decision_uuid=$2::uuid
            AND result='resolved_claim_or_operation'
            AND resolution_basis='accepted_claim')::text AS decisions,
        (SELECT count(*) FROM business_v2.identity_event_related_refs
          WHERE receipt_id=$1)::text AS related_refs`,
      [receiptId, input.claim.claimId],
    );
    if (
      integer(complete.rows[0].auth_accounts, 'duplicate_auth_count') !== 1 ||
      integer(complete.rows[0].decisions, 'duplicate_decision_count') !== 1 ||
      integer(complete.rows[0].related_refs, 'duplicate_ref_count') !== 1
    ) {
      fail('duplicate_evidence_incomplete');
    }
    return {
      outcome: 'duplicate',
      reasonCode: 'EXACT_CLAIM_REPLAY_NOOP',
      receiptInserted: 0,
      relatedRefsInserted: 0,
      authAccountsInserted: 0,
      decisionsInserted: 0,
      partyWrites: 0,
      referenceWrites: 0,
      providerAttempts: 0,
      providerWrites: 0,
      accessWrites: 0,
    };
  }

  const evaluation = evaluateGoogleAccountClaim(input.claim, input.context);
  if (evaluation.status !== 'accepted') {
    return zeroWriteResult(evaluation.status, evaluation.reasonCode);
  }
  const before = await protectedCounts(input.client);
  const party = await input.client.query<{ valid: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM business_v2.parties
        WHERE id=$1 AND merged_into IS NULL
     ) AS valid`,
    [evaluation.targetPartyId],
  );
  if (!party.rows[0].valid) fail('target_party_unavailable');
  const priorAccount = await input.client.query<{ party_id: string | null }>(
    `SELECT party_id::text
       FROM business_v2.auth_accounts
      WHERE issuer=$1 AND environment=$2 AND source_scope=$3 AND subject=$4
      ORDER BY account_version DESC LIMIT 1 FOR SHARE`,
    [
      input.claim.googleSubject.issuer,
      input.claim.googleSubject.environment,
      input.claim.googleSubject.sourceScope,
      input.claim.googleSubject.uid,
    ],
  );
  if (priorAccount.rowCount !== 0) fail('auth_subject_already_observed');

  const adapterId = await registerAdapter(
    input.client,
    input.claim,
    input.context.observedAt,
  );
  const receipt = await input.client.query<{
    stored_receipt_id: string;
    inserted: boolean;
  }>(
    `SELECT stored_receipt_id::text,inserted
       FROM business_v2.fn_tandem_identity_store_event_receipt(
         $1,'google_identity_platform',$2,$3,'firebase_user',$4,
         'account_link_claim_accepted',$5,$6,$7,NULL,'authenticated',
         'recent_google_session_explicit_claim','normalized',1,
         'account-claim-v1',$8::timestamptz,$9::timestamptz,$10,1
       )`,
    [
      adapterId,
      input.claim.googleSubject.environment,
      input.claim.googleSubject.sourceScope,
      input.claim.googleSubject.uid,
      input.claim.claimId,
      deduplicationKey,
      input.claim.payloadSha256,
      input.claim.issuedAt,
      input.context.observedAt,
      sha256Json('tandem-identity-google-claim-dark'),
    ],
  );
  if (!receipt.rows[0].inserted) fail('unexpected_duplicate_receipt');
  const receiptId = integer(
    receipt.rows[0].stored_receipt_id,
    'receipt_id_invalid',
  );
  await input.client.query(
    `INSERT INTO business_v2.identity_event_related_refs
       (receipt_id,ref_index,provider,environment,source_scope,entity_type,external_id)
     VALUES ($1,0,$2,$3,$4,$5,$6)`,
    [
      receiptId,
      input.claim.heartbeatRef.provider,
      input.claim.heartbeatRef.environment,
      input.claim.heartbeatRef.scope,
      input.claim.heartbeatRef.entityType,
      input.claim.heartbeatRef.externalId,
    ],
  );
  await input.client.query(
    `INSERT INTO business_v2.auth_accounts
       (issuer,environment,source_scope,subject,account_version,party_id,
        account_state,binding_basis,source_receipt_id,source_effective_at,
        last_observed_at,last_verified_at,valid_from,valid_until,
        retention_policy_version)
     VALUES ($1,$2,$3,$4,1,$5,'accepted','accepted_claim',$6,
       $7::timestamptz,$8::timestamptz,$8::timestamptz,$7::timestamptz,
       NULL,1)`,
    [
      input.claim.googleSubject.issuer,
      input.claim.googleSubject.environment,
      input.claim.googleSubject.sourceScope,
      input.claim.googleSubject.uid,
      evaluation.targetPartyId,
      receiptId,
      input.claim.issuedAt,
      input.context.observedAt,
    ],
  );
  const evidenceRefs = [
    `claim:${input.claim.payloadSha256}`,
    `google-subject:${sha256Json({
      issuer: input.claim.googleSubject.issuer,
      environment: input.claim.googleSubject.environment,
      scope: input.claim.googleSubject.sourceScope,
      uid: input.claim.googleSubject.uid,
    })}`,
    `heartbeat-subject:${sha256Json(input.claim.heartbeatRef)}`,
    `receipt:${receiptId}`,
  ].sort();
  await input.client.query(
    `INSERT INTO business_v2.identity_resolution_decisions
       (decision_uuid,provider,environment,source_scope,entity_type,
        external_id_sha256,result,resolution_basis,party_id,candidate_id,
        evidence_refs,evidence_sha256,reason_code,decided_at,
        retention_policy_version)
     VALUES ($1::uuid,$2,$3,$4,$5,$6,'resolved_claim_or_operation',
       'accepted_claim',$7,NULL,$8::jsonb,
       business_v2.fn_tandem_identity_sha256($8::jsonb::text),
       'EXPLICIT_ACCOUNT_CLAIM_ACCEPTED',$9::timestamptz,1)`,
    [
      input.claim.claimId,
      input.claim.heartbeatRef.provider,
      input.claim.heartbeatRef.environment,
      input.claim.heartbeatRef.scope,
      input.claim.heartbeatRef.entityType,
      sha256Json(input.claim.heartbeatRef.externalId),
      evaluation.targetPartyId,
      JSON.stringify(evidenceRefs),
      input.context.observedAt,
    ],
  );
  const after = await protectedCounts(input.client);
  assertProtectedCounts(before, after);
  return {
    outcome: 'accepted',
    reasonCode: evaluation.reasonCode,
    receiptInserted: 1,
    relatedRefsInserted: 1,
    authAccountsInserted: 1,
    decisionsInserted: 1,
    partyWrites: 0,
    referenceWrites: 0,
    providerAttempts: 0,
    providerWrites: 0,
    accessWrites: 0,
  };
}
