import type { PoolClient, QueryResultRow } from 'pg';

import { sha256Json } from './canonical.js';
import { createGoogleAccountClaimEnvelope } from './google-account-claim.js';
import { applyGoogleAccountClaimWithClient } from './google-account-claim-store.js';
import {
  validateGoogleAccountClaimProposal,
  type GoogleAccountClaimProposal,
  type GoogleAccountClaimProposalPolicy,
} from './google-account-claim-proposal.js';

interface DatabaseIdentity extends QueryResultRow {
  database_name: string;
}

interface IsolationLevel extends QueryResultRow {
  transaction_isolation: string;
}

interface TransactionIdentity extends QueryResultRow {
  transaction_id: string;
}

interface CandidateParty extends QueryResultRow {
  party_id: string;
}

interface ExistingDecision extends QueryResultRow {
  result: string;
  resolution_basis: string | null;
  party_id: string | null;
  provider: string;
  environment: string;
  source_scope: string;
  entity_type: string;
  external_id_sha256: string;
}

export type GoogleAccountClaimProposalStoreResult = {
  outcome: 'accepted' | 'duplicate' | 'held' | 'rejected';
  reasonCode: string;
  candidateCount: number;
  openConflict: boolean;
  receiptInserted: number;
  relatedRefsInserted: number;
  authAccountsInserted: number;
  decisionsInserted: number;
  partyWrites: 0;
  referenceWrites: 0;
  providerAttempts: 0;
  providerWrites: 0;
  accessWrites: 0;
};

function fail(code: string): never {
  throw new Error(`tandem_identity_claim_proposal_store:${code}`);
}

function integer(value: string, code: string): number {
  if (!/^[1-9][0-9]*$/.test(value)) fail(code);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) fail(code);
  return parsed;
}

function zeroWriteResult(
  outcome: 'held' | 'rejected',
  reasonCode: string,
  candidateCount = 0,
  openConflict = false,
): GoogleAccountClaimProposalStoreResult {
  return {
    outcome,
    reasonCode,
    candidateCount,
    openConflict,
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

async function currentTransactionId(client: PoolClient): Promise<string> {
  const transaction = await client.query<TransactionIdentity>(
    `SELECT pg_current_xact_id()::text AS transaction_id`,
  );
  if (
    transaction.rowCount !== 1 ||
    !/^[1-9][0-9]*$/.test(transaction.rows[0].transaction_id)
  ) {
    fail('transaction_identity_unavailable');
  }
  return transaction.rows[0].transaction_id;
}

async function assertDisposableSerializable(
  client: PoolClient,
): Promise<string> {
  const database = await client.query<DatabaseIdentity>(
    `SELECT current_database() AS database_name`,
  );
  if (
    database.rowCount !== 1 ||
    !/^nc_tandem_identity_d2_test_[a-z0-9_]+$/.test(
      database.rows[0].database_name,
    )
  ) {
    fail('disposable_database_required');
  }
  const isolation = await client.query<IsolationLevel>(
    `SELECT current_setting('transaction_isolation') AS transaction_isolation`,
  );
  if (
    isolation.rowCount !== 1 ||
    isolation.rows[0].transaction_isolation !== 'serializable'
  ) {
    fail('serializable_transaction_required');
  }
  return currentTransactionId(client);
}

async function assertSameTransaction(
  client: PoolClient,
  expectedTransactionId: string,
): Promise<void> {
  if ((await currentTransactionId(client)) !== expectedTransactionId) {
    fail('transaction_boundary_lost');
  }
}

function decisionMatchesProposal(
  decision: ExistingDecision,
  proposal: GoogleAccountClaimProposal,
): boolean {
  return (
    decision.result === 'resolved_claim_or_operation' &&
    decision.resolution_basis === 'accepted_claim' &&
    decision.provider === proposal.heartbeatRef.provider &&
    decision.environment === proposal.heartbeatRef.environment &&
    decision.source_scope === proposal.heartbeatRef.scope &&
    decision.entity_type === proposal.heartbeatRef.entityType &&
    decision.external_id_sha256 ===
      sha256Json(proposal.heartbeatRef.externalId) &&
    decision.party_id != null
  );
}

async function deriveTarget(input: {
  client: PoolClient;
  proposal: GoogleAccountClaimProposal;
  observedAt: string;
}): Promise<
  | { kind: 'candidate'; partyId: number; candidateCount: 1 }
  | {
      kind: 'held';
      reasonCode: string;
      candidateCount: number;
      openConflict: boolean;
    }
  | { kind: 'replay'; partyId: number }
> {
  const priorDecision = await input.client.query<ExistingDecision>(
    `SELECT result,resolution_basis,party_id::text,provider,environment,
            source_scope,entity_type,external_id_sha256
       FROM business_v2.identity_resolution_decisions
      WHERE decision_uuid=$1::uuid
      LIMIT 1 FOR SHARE`,
    [input.proposal.claimId],
  );
  if (priorDecision.rowCount === 1) {
    if (!decisionMatchesProposal(priorDecision.rows[0], input.proposal)) {
      return {
        kind: 'held',
        reasonCode: 'CLAIM_ID_DECISION_CONFLICT',
        candidateCount: 0,
        openConflict: true,
      };
    }
    return {
      kind: 'replay',
      partyId: integer(
        priorDecision.rows[0].party_id!,
        'prior_decision_party_invalid',
      ),
    };
  }

  const candidates = await input.client.query<CandidateParty>(
    `SELECT claims.party_id::text
       FROM business_v2.party_identifier_claims claims
       JOIN business_v2.parties parties ON parties.id=claims.party_id
      WHERE claims.identifier_kind='verified_email_candidate'
        AND claims.identifier_fingerprint=$1
        AND claims.status='active'
        AND claims.confidence IN ('source_verified','provider_asserted')
        AND claims.valid_from <= $2::timestamptz
        AND (claims.valid_until IS NULL OR claims.valid_until > $2::timestamptz)
        AND parties.merged_into IS NULL
      ORDER BY claims.party_id
      FOR SHARE OF claims,parties`,
    [input.proposal.googleSubject.verifiedEmailSha256, input.observedAt],
  );
  const candidatePartyIds = candidates.rows.map((row) =>
    integer(row.party_id, 'candidate_party_invalid'),
  );
  const sourceRefSha256 = sha256Json(input.proposal.heartbeatRef);
  const conflict = await input.client.query<{ present: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM business_v2.party_identity_exceptions
        WHERE status='open'
          AND evidence_refs->>'source_ref_sha256'=$1
        FOR SHARE
     ) AS present`,
    [sourceRefSha256],
  );
  const openConflict = conflict.rows[0]?.present === true;
  if (openConflict) {
    return {
      kind: 'held',
      reasonCode: 'OPEN_IDENTITY_CONFLICT',
      candidateCount: candidatePartyIds.length,
      openConflict: true,
    };
  }
  if (candidatePartyIds.length === 0) {
    return {
      kind: 'held',
      reasonCode: 'VERIFIED_IDENTIFIER_CANDIDATE_NOT_FOUND',
      candidateCount: 0,
      openConflict: false,
    };
  }
  if (candidatePartyIds.length !== 1) {
    return {
      kind: 'held',
      reasonCode: 'SHARED_VERIFIED_IDENTIFIER',
      candidateCount: candidatePartyIds.length,
      openConflict: false,
    };
  }
  return {
    kind: 'candidate',
    partyId: candidatePartyIds[0],
    candidateCount: 1,
  };
}

export async function applyGoogleAccountClaimProposalWithClient(input: {
  client: PoolClient;
  proposal: unknown;
  policy: GoogleAccountClaimProposalPolicy;
}): Promise<GoogleAccountClaimProposalStoreResult> {
  const validation = validateGoogleAccountClaimProposal(
    input.proposal,
    input.policy,
  );
  if (validation.status !== 'accepted') {
    return zeroWriteResult('rejected', validation.reasonCode);
  }
  const transactionId = await assertDisposableSerializable(input.client);
  const derived = await deriveTarget({
    client: input.client,
    proposal: validation.proposal,
    observedAt: input.policy.observedAt,
  });
  await assertSameTransaction(input.client, transactionId);
  if (derived.kind === 'held') {
    return zeroWriteResult(
      'held',
      derived.reasonCode,
      derived.candidateCount,
      derived.openConflict,
    );
  }
  const candidatePartyIds = [derived.partyId];
  const claim = createGoogleAccountClaimEnvelope({
    kind: 'google_account_link_claim',
    schemaVersion: 1,
    claimId: validation.proposal.claimId,
    googleSubject: validation.proposal.googleSubject,
    heartbeatRef: validation.proposal.heartbeatRef,
    selectedBy: 'explicit_provider_subject',
    role: 'participant',
    payerLearnerRelationship: 'self',
    targetPartyId: derived.partyId,
    issuedAt: validation.proposal.issuedAt,
    expiresAt: validation.proposal.expiresAt,
    evidenceRefs: [
      `proposal:${sha256Json(validation.proposal)}`,
      'bff-sequence-fixture:firebase-id-token-verified',
    ],
  });
  const stored = await applyGoogleAccountClaimWithClient({
    client: input.client,
    claim,
    context: {
      observedAt: input.policy.observedAt,
      candidatePartyIds,
      sharedIdentifier: false,
      openIdentityConflict: false,
      explicitSeatRelationship: false,
    },
  });
  return {
    ...stored,
    candidateCount: candidatePartyIds.length,
    openConflict: false,
  };
}
