import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sha256Json } from './canonical.js';
import { runTandemIdentityD2ShadowWithClient } from './d2-student-lifecycle-shadow.js';
import { importHeartbeatAggregateSnapshotWithClient } from './d3-heartbeat-reconciliation.js';
import { prepareHeartbeatAggregateSnapshot } from './d3-heartbeat-snapshot.js';
import { createGoogleAccountClaimEnvelope } from './google-account-claim.js';
import { applyGoogleAccountClaimProposalWithClient } from './google-account-claim-proposal-store.js';
import { applyGoogleAccountClaimWithClient } from './google-account-claim-store.js';

const ROOT = process.cwd();
const PREFIX = 'nc_tandem_identity_d2_test_';
const database = `${PREFIX}${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const pgBin = '/opt/homebrew/opt/postgresql@16/bin';
const migration = path.join(
  ROOT,
  'data/business/migrations/nanoclaw-v2/167_tandem_identity_control_plane.sql',
);
let pool: Pool;

function childEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR']
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]]),
  );
}

function run(binary: string, args: string[]): string {
  const result = spawnSync(binary, args, {
    cwd: ROOT,
    env: childEnv(),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `${path.basename(binary)} failed: ${(result.stderr || result.stdout || '').trim().slice(-2000)}`,
    );
  }
  return result.stdout.trim();
}

function psql(args: string[]): string {
  return run(path.join(pgBin, 'psql'), [
    '-X',
    '--no-psqlrc',
    '-v',
    'ON_ERROR_STOP=1',
    '-h',
    '/tmp',
    '-p',
    '5432',
    '-d',
    database,
    ...args,
  ]);
}

async function transaction<T>(
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE nanoclaw_admin');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function serializableTransaction<T>(
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query('SET LOCAL ROLE nanoclaw_admin');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

beforeAll(() => {
  if (!fs.existsSync(path.join(pgBin, 'psql')) || !fs.existsSync(migration)) {
    throw new Error('PostgreSQL 16 or migration 167 is unavailable');
  }
  if (!/^nc_tandem_identity_d2_test_[a-z0-9_]+$/.test(database)) {
    throw new Error('unsafe disposable D2 database name');
  }
  run(path.join(pgBin, 'createdb'), [
    '--maintenance-db=postgres',
    '--template=template0',
    '-h',
    '/tmp',
    '-p',
    '5432',
    database,
  ]);
  psql([
    '-c',
    `CREATE SCHEMA business_v2 AUTHORIZATION nanoclaw_admin;
     CREATE TABLE business_v2.parties (
       id bigserial PRIMARY KEY,
       merged_into bigint REFERENCES business_v2.parties(id)
     );
     CREATE TABLE business_v2.party_external_refs (
       id bigserial PRIMARY KEY,
       party_id bigint NOT NULL REFERENCES business_v2.parties(id),
       provider text NOT NULL,
       source_scope text NOT NULL,
       entity_type text NOT NULL,
       external_id text NOT NULL,
       UNIQUE(provider,source_scope,entity_type,external_id)
     );
     CREATE TABLE business_v2.party_identifier_claims (
       id bigserial PRIMARY KEY,
       party_id bigint NOT NULL REFERENCES business_v2.parties(id),
       identifier_kind text NOT NULL CHECK (
         identifier_kind IN ('provider_user_id','verified_email_candidate','email_candidate')
       ),
       identifier_fingerprint text NOT NULL CHECK (
         identifier_fingerprint ~ '^[0-9a-f]{64}$'
       ),
       restricted_value text,
       source_ref_id bigint REFERENCES business_v2.party_external_refs(id),
       verification_method text NOT NULL,
       confidence text NOT NULL CHECK (
         confidence IN ('source_verified','provider_asserted','candidate','unknown')
       ),
       status text NOT NULL DEFAULT 'active' CHECK (
         status IN ('active','retired','conflicting')
       ),
       valid_from timestamptz NOT NULL,
       valid_until timestamptz,
       evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now(),
       CHECK (valid_until IS NULL OR valid_from <= valid_until)
     );
     CREATE UNIQUE INDEX party_identifier_claims_active_exact_uniq
       ON business_v2.party_identifier_claims
         (party_id,identifier_kind,identifier_fingerprint)
       WHERE status='active';
     CREATE TABLE business_v2.party_identity_exceptions (
       id bigserial PRIMARY KEY,
       fingerprint text NOT NULL UNIQUE CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
       current_party_id bigint REFERENCES business_v2.parties(id),
       candidate_party_ids bigint[] NOT NULL DEFAULT '{}'::bigint[],
       reason_code text NOT NULL,
       status text NOT NULL DEFAULT 'open' CHECK (
         status IN ('open','resolved','no_action')
       ),
       owner_group text NOT NULL DEFAULT 'chief',
       evidence_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
       occurrence_count integer NOT NULL DEFAULT 1,
       first_seen_at timestamptz NOT NULL,
       last_seen_at timestamptz NOT NULL,
       resolution_code text,
       resolution_receipt_sha256 text,
       resolved_at timestamptz,
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now(),
       CHECK (first_seen_at <= last_seen_at),
       CHECK (
         (status='open' AND resolved_at IS NULL AND resolution_code IS NULL
           AND resolution_receipt_sha256 IS NULL) OR
         (status IN ('resolved','no_action') AND resolved_at IS NOT NULL
           AND resolution_code IS NOT NULL
           AND resolution_receipt_sha256 IS NOT NULL)
       )
     );
     CREATE TABLE business_v2.party_context_adapter_registrations (
       id bigserial PRIMARY KEY,
       adapter_key text NOT NULL,
       adapter_version text NOT NULL,
       source_system text NOT NULL,
       source_scope text NOT NULL,
       manifest_version integer NOT NULL,
       manifest_sha256 text NOT NULL,
       manifest jsonb NOT NULL,
       config_declaration jsonb NOT NULL DEFAULT '{}'::jsonb,
       enabled boolean NOT NULL DEFAULT false,
       conformance_status text NOT NULL DEFAULT 'pending',
       conformance_receipt_sha256 text,
       circuit_status text NOT NULL DEFAULT 'closed',
       failure_count integer NOT NULL DEFAULT 0,
       last_error_code text,
       last_health_at timestamptz,
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now(),
       UNIQUE(adapter_key,adapter_version,source_scope),
       UNIQUE(source_system,source_scope)
     );
     CREATE TABLE business_v2.party_context_observations (
       id bigserial PRIMARY KEY,
       observation_uuid uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
       schema_version integer NOT NULL,
       adapter_key text NOT NULL,
       adapter_version text NOT NULL,
       source_system text NOT NULL,
       source_scope text NOT NULL,
       source_fact_key text NOT NULL,
       fact_type text NOT NULL,
       fact_schema_version integer NOT NULL,
       original_party_id bigint REFERENCES business_v2.parties(id),
       current_party_id bigint REFERENCES business_v2.parties(id),
       related_party_ids bigint[] NOT NULL DEFAULT '{}'::bigint[],
       value jsonb NOT NULL,
       value_sha256 text NOT NULL,
       source_record_type text NOT NULL,
       source_record_id text NOT NULL,
       source_event_id text,
       effective_at timestamptz,
       observed_at timestamptz NOT NULL,
       verified_at timestamptz,
       fresh_until timestamptz,
       confidence text NOT NULL,
       conflict_state text NOT NULL DEFAULT 'none',
       privacy_class text NOT NULL,
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now(),
       UNIQUE(source_system,source_scope,source_fact_key)
     );
     CREATE TABLE business_v2.student_lifecycle_events (
       id bigserial PRIMARY KEY,
       event_uuid uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
       source_event_key text NOT NULL UNIQUE,
       event_name text NOT NULL,
       observed_at timestamptz NOT NULL,
       heartbeat_user_id uuid,
       heartbeat_group_id uuid,
       heartbeat_course_id uuid,
       heartbeat_cohort_id uuid,
       party_id bigint REFERENCES business_v2.parties(id),
       catalog_entry_id bigint,
       payload_sha256 text NOT NULL,
       relay_authenticity text NOT NULL,
       provider_authenticity text NOT NULL,
       mapping_status text NOT NULL,
       processing_status text NOT NULL
     );
     INSERT INTO business_v2.parties DEFAULT VALUES;
     INSERT INTO business_v2.parties DEFAULT VALUES;
     INSERT INTO business_v2.student_lifecycle_events
       (source_event_key,event_name,observed_at,heartbeat_user_id,
        heartbeat_group_id,party_id,catalog_entry_id,payload_sha256,
        relay_authenticity,provider_authenticity,mapping_status,processing_status)
     VALUES
       ('event-1','community_login_first','2026-09-01T00:00:00Z',
        '00000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',1,1,repeat('a',64),
        'hmac_verified','source_asserted_unreconciled','exact','applied'),
       ('event-2','learning_access_observed','2026-09-02T00:00:00Z',
        '00000000-0000-4000-8000-000000000002',NULL,NULL,NULL,repeat('b',64),
        'hmac_verified','source_asserted_unreconciled','unresolved_identity','quarantined'),
       ('event-3','heartbeat_user_reconciliation_requested','2026-09-03T00:00:00Z',
        '00000000-0000-4000-8000-000000000001',NULL,2,NULL,repeat('c',64),
        'hmac_verified','source_asserted_unreconciled','not_applicable','applied'),
       ('event-4','course_completed','2026-09-04T00:00:00Z',
        '00000000-0000-4000-8000-000000000003',NULL,NULL,NULL,repeat('d',64),
        'hmac_verified','source_asserted_unreconciled','unresolved_identity','quarantined');
     ALTER TABLE business_v2.party_context_observations OWNER TO nanoclaw_admin;
     ALTER TABLE business_v2.student_lifecycle_events OWNER TO nanoclaw_admin;
     ALTER TABLE business_v2.parties OWNER TO nanoclaw_admin;
     ALTER TABLE business_v2.party_external_refs OWNER TO nanoclaw_admin;
     ALTER TABLE business_v2.party_identifier_claims OWNER TO nanoclaw_admin;
     ALTER TABLE business_v2.party_identity_exceptions OWNER TO nanoclaw_admin;
     ALTER TABLE business_v2.party_context_adapter_registrations OWNER TO nanoclaw_admin;
     ALTER SEQUENCE business_v2.parties_id_seq OWNER TO nanoclaw_admin;
     ALTER SEQUENCE business_v2.party_external_refs_id_seq OWNER TO nanoclaw_admin;
     ALTER SEQUENCE business_v2.party_identifier_claims_id_seq OWNER TO nanoclaw_admin;
     ALTER SEQUENCE business_v2.party_identity_exceptions_id_seq OWNER TO nanoclaw_admin;
     ALTER SEQUENCE business_v2.party_context_adapter_registrations_id_seq OWNER TO nanoclaw_admin;
     ALTER SEQUENCE business_v2.party_context_observations_id_seq OWNER TO nanoclaw_admin;
     ALTER SEQUENCE business_v2.student_lifecycle_events_id_seq OWNER TO nanoclaw_admin;`,
  ]);
  psql(['-f', migration]);
  pool = new Pool({
    host: '/tmp',
    port: 5432,
    database,
    max: 3,
  });
});

afterAll(async () => {
  await pool?.end();
  run(path.join(pgBin, 'dropdb'), [
    '--maintenance-db=postgres',
    '--if-exists',
    '-h',
    '/tmp',
    '-p',
    '5432',
    database,
  ]);
});

describe('Tandem Identity D2 disposable PostgreSQL mirror', () => {
  it('catches up in bounded batches, remains held, and replays as a no-op', async () => {
    const first = await transaction((client) =>
      runTandemIdentityD2ShadowWithClient({
        client,
        batchLimit: 2,
        observedAt: '2026-09-14T02:40:00Z',
      }),
    );
    expect(first).toMatchObject({
      outcome: 'batch_applied',
      scanned: 2,
      receiptsInserted: 2,
      observationsInserted: 2,
      candidatesInserted: 2,
      health: { status: 'catching_up', unmirroredRows: 2 },
    });

    const second = await transaction((client) =>
      runTandemIdentityD2ShadowWithClient({
        client,
        batchLimit: 2,
        observedAt: '2026-09-14T02:41:00Z',
      }),
    );
    expect(second).toMatchObject({
      outcome: 'caught_up',
      scanned: 2,
      receiptsInserted: 2,
      observationsInserted: 2,
      candidatesInserted: 1,
      health: {
        status: 'blocked',
        reason: 'provider_authenticity_unreconciled',
        sourceRows: 4,
        sourcePartyLinkedRows: 2,
        distinctSourceUsers: 3,
        mirroredReceipts: 4,
        heldObservations: 4,
        openCandidates: 3,
        unmirroredRows: 0,
        acceptedFacts: 0,
        providerAttempts: 0,
        partyWrites: 0,
        externalReferenceWrites: 0,
        accessWrites: 0,
        providerWrites: 0,
      },
    });

    const replay = await transaction((client) =>
      runTandemIdentityD2ShadowWithClient({
        client,
        batchLimit: 500,
        observedAt: '2026-09-14T02:42:00Z',
      }),
    );
    expect(replay).toMatchObject({
      outcome: 'caught_up',
      scanned: 0,
      receiptsInserted: 0,
      observationsInserted: 0,
      candidatesInserted: 0,
      health: { mirroredReceipts: 4, unmirroredRows: 0 },
    });

    const readback = await transaction((client) =>
      client.query(`SELECT
         (SELECT count(*) FROM business_v2.parties)::int AS parties,
         (SELECT count(*) FROM business_v2.party_external_refs)::int AS refs,
         (SELECT count(*) FROM business_v2.identity_resolution_decisions)::int AS decisions,
         (SELECT count(*) FROM business_v2.provider_desired_projections)::int AS projections,
         (SELECT count(*) FROM business_v2.provider_projection_commands)::int AS commands,
         (SELECT count(*) FROM business_v2.provider_projection_attempts)::int AS attempts,
         (SELECT count(*) FROM business_v2.provider_projection_readbacks)::int AS readbacks,
         (SELECT count(*) FROM business_v2.party_context_observations
           WHERE current_party_id IS NOT NULL OR original_party_id IS NOT NULL)::int
           AS linked_observations,
         (SELECT count(*) FROM business_v2.identity_candidates
           WHERE party_materialization_allowed)::int AS materializable_candidates,
         (SELECT count(*) FROM business_v2.identity_event_receipts
           WHERE authenticity_status <> 'unverified_hint'
              OR normalization_status <> 'held')::int AS promoted_receipts`),
    );
    expect(readback.rows[0]).toEqual({
      parties: 2,
      refs: 0,
      decisions: 0,
      projections: 0,
      commands: 0,
      attempts: 0,
      readbacks: 0,
      linked_observations: 0,
      materializable_candidates: 0,
      promoted_receipts: 0,
    });
  });

  it('reports an unsupported subject as terminally blocked rather than catching up forever', async () => {
    await transaction((client) =>
      client.query(`INSERT INTO business_v2.student_lifecycle_events
         (source_event_key,event_name,observed_at,heartbeat_user_id,
          payload_sha256,relay_authenticity,provider_authenticity,
          mapping_status,processing_status)
       VALUES ('event-no-user','community_login_first',now(),NULL,repeat('e',64),
         'hmac_verified','source_asserted_unreconciled','not_applicable','quarantined')`),
    );
    const result = await transaction((client) =>
      runTandemIdentityD2ShadowWithClient({
        client,
        batchLimit: 500,
        observedAt: '2026-09-14T02:42:30Z',
      }),
    );
    expect(result).toMatchObject({
      outcome: 'caught_up',
      scanned: 0,
      receiptsInserted: 0,
      health: {
        status: 'blocked',
        reason: 'unsupported_source_subject',
        sourceRowsWithoutUser: 1,
        unmirroredRows: 1,
      },
    });
  });

  it('rolls the whole batch back when source authenticity leaves the D2 contract', async () => {
    await transaction((client) =>
      client.query(`INSERT INTO business_v2.student_lifecycle_events
         (source_event_key,event_name,observed_at,heartbeat_user_id,
          payload_sha256,relay_authenticity,provider_authenticity,
          mapping_status,processing_status)
       VALUES ('event-invalid','community_login_first',now(),
         '00000000-0000-4000-8000-000000000004',repeat('f',64),
         'hmac_verified','provider_reconciled','exact','applied')`),
    );
    await expect(
      transaction((client) =>
        runTandemIdentityD2ShadowWithClient({
          client,
          batchLimit: 500,
          observedAt: '2026-09-14T02:43:00Z',
        }),
      ),
    ).rejects.toThrow('tandem_identity_d2_source_contract_mismatch');
    const readback = await transaction((client) =>
      client.query(`SELECT
         (SELECT count(*) FROM business_v2.identity_event_receipts)::int AS receipts,
         (SELECT count(*) FROM business_v2.party_context_observations)::int AS observations,
         (SELECT count(*) FROM business_v2.identity_candidates)::int AS candidates`),
    );
    expect(readback.rows[0]).toEqual({
      receipts: 4,
      observations: 4,
      candidates: 3,
    });
  });

  it('imports one aggregate Heartbeat reconciliation and makes exact replay write zero', async () => {
    const rawCensus = (observedAt: string) => ({
      ok: true,
      data: {
        instance: 'main',
        complete: true,
        observed_at: observedAt,
        user_count: 2,
        user_ids_sha256: 'a'.repeat(64),
        snapshot_sha256: 'b'.repeat(64),
        disposition: 'unchanged',
        missing_email_count: 0,
        duplicate_email_values_across_user_ids: 0,
        zero_group_users: 0,
        membership_edges: 4,
        role_membership_edges: 2,
        access_membership_edges: 2,
        zero_access_group_users: 1,
        role_counts: [
          { role: 'Administrator', count: 0 },
          { role: 'Instructor', count: 0 },
          { role: 'User', count: 2 },
        ],
        status_counts: [{ status: 'active', count: 2 }],
        created_at: {},
        updated_at: {},
        groups: [
          {
            group_id: '00000000-0000-4000-8000-000000000001',
            group_name: 'Never persisted',
            member_count: 2,
            membership_sha256: 'c'.repeat(64),
          },
        ],
      },
    });
    const snapshot = prepareHeartbeatAggregateSnapshot({
      firstCensus: rawCensus('2026-09-14T03:00:00.000Z'),
      secondCensus: rawCensus('2026-09-14T03:01:00.000Z'),
      webhooks: {
        ok: true,
        data: [
          {
            id: '10000000-0000-4000-8000-000000000001',
            action: 'USER_JOIN',
            filter: {},
            destination_host: 'example.test',
            url_sha256: 'd'.repeat(64),
          },
        ],
      },
      webhookObservedAt: '2026-09-14T03:01:30.000Z',
    });

    const first = await transaction((client) =>
      importHeartbeatAggregateSnapshotWithClient({
        client,
        snapshot,
        importedAt: '2026-09-14T03:02:00.000Z',
      }),
    );
    expect(first).toMatchObject({
      outcome: 'imported',
      snapshotItemsInserted: 4,
      desiredProjectionsInserted: 1,
      blockedCommandsInserted: 1,
      readbacksInserted: 1,
      providerAttempts: 0,
      partyWrites: 0,
      externalReferenceWrites: 0,
      authAccountWrites: 0,
      resolutionDecisionWrites: 0,
      d2Drift: 0,
      individualIdentityGraphAvailable: false,
      status: 'blocked',
      reason: 'INDIVIDUAL_IDENTITY_GRAPH_UNAVAILABLE',
    });
    const replay = await transaction((client) =>
      importHeartbeatAggregateSnapshotWithClient({
        client,
        snapshot,
        importedAt: '2026-09-14T03:03:00.000Z',
      }),
    );
    expect(replay).toMatchObject({
      outcome: 'duplicate',
      snapshotItemsInserted: 0,
      desiredProjectionsInserted: 0,
      blockedCommandsInserted: 0,
      readbacksInserted: 0,
      providerAttempts: 0,
      d2Drift: 0,
    });

    const readback = await transaction((client) =>
      client.query(`SELECT
      (SELECT count(*) FROM business_v2.parties)::int AS parties,
      (SELECT count(*) FROM business_v2.party_external_refs)::int AS refs,
      (SELECT count(*) FROM business_v2.auth_accounts)::int AS auth_accounts,
      (SELECT count(*) FROM business_v2.identity_resolution_decisions)::int AS decisions,
      (SELECT count(*) FROM business_v2.identity_event_receipts)::int AS d2_receipts,
      (SELECT count(*) FROM business_v2.party_context_observations
        WHERE adapter_key='tandem_identity_student_lifecycle_shadow')::int AS d2_observations,
      (SELECT count(*) FROM business_v2.identity_candidates)::int AS d2_candidates,
      (SELECT count(*) FROM business_v2.provider_reconciliation_runs)::int AS runs,
      (SELECT count(*) FROM business_v2.provider_snapshot_items)::int AS items,
      (SELECT count(*) FROM business_v2.provider_desired_projections)::int AS projections,
      (SELECT count(*) FROM business_v2.provider_projection_commands
        WHERE status='blocked' AND NOT writes_enabled AND attempt_count=0)::int AS commands,
      (SELECT count(*) FROM business_v2.provider_projection_attempts)::int AS attempts,
      (SELECT count(*) FROM business_v2.provider_projection_readbacks
        WHERE result='unavailable')::int AS readbacks`),
    );
    expect(readback.rows[0]).toEqual({
      parties: 2,
      refs: 0,
      auth_accounts: 0,
      decisions: 0,
      d2_receipts: 4,
      d2_observations: 4,
      d2_candidates: 3,
      runs: 1,
      items: 4,
      projections: 1,
      commands: 1,
      attempts: 0,
      readbacks: 1,
    });
  });

  it('atomically accepts one explicit Google claim, no-ops replay, and rolls back a late conflict', async () => {
    const heartbeatRef = {
      provider: 'heartbeat',
      environment: 'test' as const,
      scope: 'main-community',
      entityType: 'user',
      externalId: '30000000-0000-4000-8000-000000000001',
    };
    const claimBody = {
      kind: 'google_account_link_claim' as const,
      schemaVersion: 1 as const,
      claimId: '30000000-0000-4000-8000-000000000002',
      googleSubject: {
        issuer: 'https://securetoken.google.com/tandem-identity-dev-2026',
        projectId: 'tandem-identity-dev-2026',
        environment: 'test' as const,
        sourceScope: 'tandem-identity-dev-2026',
        uid: 'firebase-disposable-uid-1',
        emailVerified: true as const,
        verifiedEmailSha256: '1'.repeat(64),
        authenticatedAt: '2026-09-15T00:00:00.000Z',
      },
      heartbeatRef,
      selectedBy: 'explicit_provider_subject' as const,
      role: 'participant' as const,
      payerLearnerRelationship: 'self' as const,
      targetPartyId: 1,
      issuedAt: '2026-09-15T00:01:00.000Z',
      expiresAt: '2026-09-15T00:11:00.000Z',
      evidenceRefs: ['receipt:google-session', 'receipt:explicit-selection'],
    };
    const claim = createGoogleAccountClaimEnvelope(claimBody);
    const context = {
      observedAt: '2026-09-15T00:02:00.000Z',
      candidatePartyIds: [1],
      sharedIdentifier: false,
      openIdentityConflict: false,
      explicitSeatRelationship: false,
    };

    await transaction((client) =>
      client.query(
        `INSERT INTO business_v2.identity_candidates
           (subject_sha256,provider,environment,source_scope,entity_type,
            external_id_sha256,candidate_version,status,creation_basis,
            party_materialization_allowed,evidence_sha256,first_seen_at,
            last_observed_at,retention_policy_version)
         VALUES ($1,'heartbeat','test','main-community','user',$1,1,'open',
           'none',false,$2,'2026-09-15T00:00:00Z','2026-09-15T00:00:00Z',1)`,
        ['2'.repeat(64), '3'.repeat(64)],
      ),
    );
    const held = await transaction((client) =>
      applyGoogleAccountClaimWithClient({
        client,
        claim,
        context: { ...context, sharedIdentifier: true },
      }),
    );
    expect(held).toMatchObject({
      outcome: 'held',
      reasonCode: 'IDENTITY_CONFLICT_OR_AMBIGUITY',
      receiptInserted: 0,
      authAccountsInserted: 0,
      decisionsInserted: 0,
    });

    const accepted = await transaction((client) =>
      applyGoogleAccountClaimWithClient({ client, claim, context }),
    );
    expect(accepted).toMatchObject({
      outcome: 'accepted',
      reasonCode: 'EXPLICIT_ACCOUNT_CLAIM_ACCEPTED',
      receiptInserted: 1,
      relatedRefsInserted: 1,
      authAccountsInserted: 1,
      decisionsInserted: 1,
      partyWrites: 0,
      referenceWrites: 0,
      providerAttempts: 0,
      providerWrites: 0,
      accessWrites: 0,
    });
    const replay = await transaction((client) =>
      applyGoogleAccountClaimWithClient({ client, claim, context }),
    );
    expect(replay).toMatchObject({
      outcome: 'duplicate',
      reasonCode: 'EXACT_CLAIM_REPLAY_NOOP',
      receiptInserted: 0,
      authAccountsInserted: 0,
      decisionsInserted: 0,
    });
    const alteredReplay = createGoogleAccountClaimEnvelope({
      ...claimBody,
      evidenceRefs: ['receipt:altered-reuse'],
    });
    await expect(
      transaction((client) =>
        applyGoogleAccountClaimWithClient({
          client,
          claim: alteredReplay,
          context,
        }),
      ),
    ).rejects.toThrow(/claim_id_payload_conflict/i);

    const countsAfterAcceptance = await transaction((client) =>
      client.query(`SELECT
        (SELECT count(*) FROM business_v2.identity_event_receipts)::int AS receipts,
        (SELECT count(*) FROM business_v2.identity_event_related_refs)::int AS related_refs,
        (SELECT count(*) FROM business_v2.auth_accounts)::int AS auth_accounts,
        (SELECT count(*) FROM business_v2.identity_resolution_decisions)::int AS decisions,
        (SELECT count(*) FROM business_v2.party_context_adapter_registrations)::int AS adapters`),
    );
    const missingPartyClaim = createGoogleAccountClaimEnvelope({
      ...claimBody,
      claimId: '30000000-0000-4000-8000-000000000077',
      googleSubject: {
        ...claimBody.googleSubject,
        uid: 'firebase-disposable-uid-missing-party',
      },
      targetPartyId: 999,
    });
    await expect(
      transaction((client) =>
        applyGoogleAccountClaimWithClient({
          client,
          claim: missingPartyClaim,
          context: { ...context, candidatePartyIds: [999] },
        }),
      ),
    ).rejects.toThrow(/target_party_unavailable/i);
    const reusedSubjectClaim = createGoogleAccountClaimEnvelope({
      ...claimBody,
      claimId: '30000000-0000-4000-8000-000000000078',
      targetPartyId: 2,
    });
    await expect(
      transaction((client) =>
        applyGoogleAccountClaimWithClient({
          client,
          claim: reusedSubjectClaim,
          context: { ...context, candidatePartyIds: [2] },
        }),
      ),
    ).rejects.toThrow(/auth_subject_already_observed/i);
    const afterGuardRefusals = await transaction((client) =>
      client.query(`SELECT
        (SELECT count(*) FROM business_v2.identity_event_receipts)::int AS receipts,
        (SELECT count(*) FROM business_v2.identity_event_related_refs)::int AS related_refs,
        (SELECT count(*) FROM business_v2.auth_accounts)::int AS auth_accounts,
        (SELECT count(*) FROM business_v2.identity_resolution_decisions)::int AS decisions,
        (SELECT count(*) FROM business_v2.party_context_adapter_registrations)::int AS adapters`),
    );
    expect(afterGuardRefusals.rows[0]).toEqual(countsAfterAcceptance.rows[0]);

    await transaction((client) =>
      client.query(
        `INSERT INTO business_v2.identity_resolution_decisions
           (decision_uuid,provider,environment,source_scope,entity_type,
            external_id_sha256,result,resolution_basis,party_id,candidate_id,
            evidence_refs,evidence_sha256,reason_code,decided_at,
            retention_policy_version)
         VALUES ('30000000-0000-4000-8000-000000000099','heartbeat','test',
           'main-community','user',$1,'ambiguous',NULL,NULL,NULL,$2::jsonb,
           business_v2.fn_tandem_identity_sha256($2::jsonb::text),
           'FIXTURE_PREEXISTING_DECISION','2026-09-15T00:02:00Z',1)`,
        ['4'.repeat(64), JSON.stringify(['receipt:fixture-conflict'])],
      ),
    );
    const beforeFailure = await transaction((client) =>
      client.query(`SELECT
        (SELECT count(*) FROM business_v2.identity_event_receipts)::int AS receipts,
        (SELECT count(*) FROM business_v2.identity_event_related_refs)::int AS related_refs,
        (SELECT count(*) FROM business_v2.auth_accounts)::int AS auth_accounts,
        (SELECT count(*) FROM business_v2.identity_resolution_decisions)::int AS decisions,
        (SELECT count(*) FROM business_v2.party_context_adapter_registrations)::int AS adapters`),
    );
    const lateConflictClaim = createGoogleAccountClaimEnvelope({
      ...claimBody,
      claimId: '30000000-0000-4000-8000-000000000099',
      googleSubject: {
        ...claimBody.googleSubject,
        uid: 'firebase-disposable-uid-2',
      },
      targetPartyId: 2,
    });
    await expect(
      transaction((client) =>
        applyGoogleAccountClaimWithClient({
          client,
          claim: lateConflictClaim,
          context: { ...context, candidatePartyIds: [2] },
        }),
      ),
    ).rejects.toThrow(/duplicate key value violates unique constraint/i);
    const afterFailure = await transaction((client) =>
      client.query(`SELECT
        (SELECT count(*) FROM business_v2.identity_event_receipts)::int AS receipts,
        (SELECT count(*) FROM business_v2.identity_event_related_refs)::int AS related_refs,
        (SELECT count(*) FROM business_v2.auth_accounts)::int AS auth_accounts,
        (SELECT count(*) FROM business_v2.identity_resolution_decisions)::int AS decisions,
        (SELECT count(*) FROM business_v2.party_context_adapter_registrations)::int AS adapters`),
    );
    expect(afterFailure.rows[0]).toEqual(beforeFailure.rows[0]);

    const crossEnvironmentClaim = createGoogleAccountClaimEnvelope({
      ...claimBody,
      claimId: '30000000-0000-4000-8000-000000000088',
      heartbeatRef: { ...heartbeatRef, environment: 'development' },
      googleSubject: {
        ...claimBody.googleSubject,
        environment: 'development',
        uid: 'firebase-disposable-uid-cross-environment',
      },
      targetPartyId: 2,
    });
    await expect(
      transaction((client) =>
        applyGoogleAccountClaimWithClient({
          client,
          claim: crossEnvironmentClaim,
          context: { ...context, candidatePartyIds: [2] },
        }),
      ),
    ).rejects.toThrow(/adapter_scope_environment_conflict/i);
    const afterCrossEnvironment = await transaction((client) =>
      client.query(`SELECT
        (SELECT count(*) FROM business_v2.identity_event_receipts)::int AS receipts,
        (SELECT count(*) FROM business_v2.identity_event_related_refs)::int AS related_refs,
        (SELECT count(*) FROM business_v2.auth_accounts)::int AS auth_accounts,
        (SELECT count(*) FROM business_v2.identity_resolution_decisions)::int AS decisions,
        (SELECT count(*) FROM business_v2.party_context_adapter_registrations)::int AS adapters`),
    );
    expect(afterCrossEnvironment.rows[0]).toEqual(beforeFailure.rows[0]);

    const readback = await transaction((client) =>
      client.query(`SELECT
        (SELECT count(*) FROM business_v2.parties)::int AS parties,
        (SELECT count(*) FROM business_v2.party_external_refs)::int AS refs,
        (SELECT count(*) FROM business_v2.identity_candidates
          WHERE provider='heartbeat' AND environment='test'
            AND source_scope='main-community' AND status='open'
            AND NOT party_materialization_allowed)::int AS open_candidates,
        (SELECT count(*) FROM business_v2.auth_accounts
          WHERE account_state='accepted' AND binding_basis='accepted_claim'
            AND party_id=1)::int AS accepted_auth_accounts,
        (SELECT count(*) FROM business_v2.identity_resolution_decisions
          WHERE result='resolved_claim_or_operation'
            AND resolution_basis='accepted_claim' AND party_id=1)::int AS accepted_decisions,
        (SELECT count(*) FROM business_v2.provider_projection_attempts)::int AS provider_attempts`),
    );
    expect(readback.rows[0]).toEqual({
      parties: 2,
      refs: 0,
      open_candidates: 1,
      accepted_auth_accounts: 1,
      accepted_decisions: 1,
      provider_attempts: 0,
    });
  });

  it('derives proposal context in a serializable transaction and reuses the accepted-claim store', async () => {
    const proposal = {
      kind: 'google_account_claim_proposal' as const,
      schemaVersion: 1 as const,
      audience: 'tandem-company-os:identity-account-claim' as const,
      claimId: '40000000-0000-4000-8000-000000000002',
      googleSubject: {
        issuer: 'https://securetoken.google.com/tandem-identity-dev-2026',
        projectId: 'tandem-identity-dev-2026',
        environment: 'test' as const,
        sourceScope: 'tandem-identity-dev-2026',
        uid: 'firebase-synthetic-cross-repository-uid',
        emailVerified: true as const,
        verifiedEmailSha256:
          'a905ebe662b7385d1b3c25adf6f5f252dde2a3b456c93d81f11aac822b2f7083',
        authenticatedAt: '2026-09-15T01:59:00.000Z',
      },
      heartbeatRef: {
        provider: 'heartbeat' as const,
        environment: 'test' as const,
        scope: 'main-community',
        entityType: 'user' as const,
        externalId: '40000000-0000-4000-8000-000000000001',
      },
      selectedBy: 'explicit_heartbeat_user' as const,
      role: 'participant' as const,
      payerLearnerRelationship: 'self' as const,
      issuedAt: '2026-09-15T02:00:00.000Z',
      expiresAt: '2026-09-15T02:10:00.000Z',
    };
    const policy = {
      expectedProjectId: 'tandem-identity-dev-2026',
      expectedEnvironment: 'test' as const,
      observedAt: '2026-09-15T02:01:00.000Z',
    };
    const identityWriteCounts = () =>
      transaction((client) =>
        client.query(`SELECT
          (SELECT count(*) FROM business_v2.identity_event_receipts)::int AS receipts,
          (SELECT count(*) FROM business_v2.identity_event_related_refs)::int AS related_refs,
          (SELECT count(*) FROM business_v2.auth_accounts)::int AS auth_accounts,
          (SELECT count(*) FROM business_v2.identity_resolution_decisions)::int AS decisions,
          (SELECT count(*) FROM business_v2.parties)::int AS parties,
          (SELECT count(*) FROM business_v2.party_external_refs)::int AS refs,
          (SELECT count(*) FROM business_v2.provider_projection_attempts)::int AS provider_attempts`),
      );

    const initial = await identityWriteCounts();
    await expect(
      transaction((client) =>
        applyGoogleAccountClaimProposalWithClient({
          client,
          proposal,
          policy,
        }),
      ),
    ).rejects.toThrow(/serializable_transaction_required/i);
    expect((await identityWriteCounts()).rows[0]).toEqual(initial.rows[0]);

    const autocommitClient = await pool.connect();
    try {
      await autocommitClient.query(
        `SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL SERIALIZABLE`,
      );
      await expect(
        applyGoogleAccountClaimProposalWithClient({
          client: autocommitClient,
          proposal,
          policy,
        }),
      ).rejects.toThrow(/transaction_boundary_lost/i);
    } finally {
      await autocommitClient.query(
        `SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL READ COMMITTED`,
      );
      autocommitClient.release();
    }
    expect((await identityWriteCounts()).rows[0]).toEqual(initial.rows[0]);

    const noCandidate = await serializableTransaction((client) =>
      applyGoogleAccountClaimProposalWithClient({ client, proposal, policy }),
    );
    expect(noCandidate).toMatchObject({
      outcome: 'held',
      reasonCode: 'VERIFIED_IDENTIFIER_CANDIDATE_NOT_FOUND',
      candidateCount: 0,
      receiptInserted: 0,
      authAccountsInserted: 0,
      decisionsInserted: 0,
    });
    expect((await identityWriteCounts()).rows[0]).toEqual(initial.rows[0]);

    await transaction((client) =>
      client.query(
        `INSERT INTO business_v2.party_identifier_claims
           (party_id,identifier_kind,identifier_fingerprint,
            verification_method,confidence,status,valid_from,valid_until,
            evidence_sha256)
         VALUES (2,'verified_email_candidate',$1,'provider_verified',
           'source_verified','active','2026-09-15T01:00:00Z',NULL,$2)`,
        [proposal.googleSubject.verifiedEmailSha256, '5'.repeat(64)],
      ),
    );
    const beforeAccepted = await identityWriteCounts();
    const accepted = await serializableTransaction((client) =>
      applyGoogleAccountClaimProposalWithClient({ client, proposal, policy }),
    );
    expect(accepted).toMatchObject({
      outcome: 'accepted',
      reasonCode: 'EXPLICIT_ACCOUNT_CLAIM_ACCEPTED',
      candidateCount: 1,
      openConflict: false,
      receiptInserted: 1,
      relatedRefsInserted: 1,
      authAccountsInserted: 1,
      decisionsInserted: 1,
      partyWrites: 0,
      referenceWrites: 0,
      providerAttempts: 0,
      providerWrites: 0,
      accessWrites: 0,
    });
    const afterAccepted = await identityWriteCounts();
    expect(afterAccepted.rows[0]).toEqual({
      ...beforeAccepted.rows[0],
      receipts: beforeAccepted.rows[0].receipts + 1,
      related_refs: beforeAccepted.rows[0].related_refs + 1,
      auth_accounts: beforeAccepted.rows[0].auth_accounts + 1,
      decisions: beforeAccepted.rows[0].decisions + 1,
    });

    const replay = await serializableTransaction((client) =>
      applyGoogleAccountClaimProposalWithClient({ client, proposal, policy }),
    );
    expect(replay).toMatchObject({
      outcome: 'duplicate',
      reasonCode: 'EXACT_CLAIM_REPLAY_NOOP',
      candidateCount: 1,
      receiptInserted: 0,
      authAccountsInserted: 0,
      decisionsInserted: 0,
    });
    expect((await identityWriteCounts()).rows[0]).toEqual(
      afterAccepted.rows[0],
    );

    await expect(
      serializableTransaction((client) =>
        applyGoogleAccountClaimProposalWithClient({
          client,
          proposal: {
            ...proposal,
            googleSubject: {
              ...proposal.googleSubject,
              authenticatedAt: '2026-09-15T01:58:59.000Z',
            },
          },
          policy,
        }),
      ),
    ).rejects.toThrow(/claim_id_payload_conflict/i);
    expect((await identityWriteCounts()).rows[0]).toEqual(
      afterAccepted.rows[0],
    );

    const sharedProposal = {
      ...proposal,
      claimId: '40000000-0000-4000-8000-000000000012',
      googleSubject: {
        ...proposal.googleSubject,
        uid: 'firebase-synthetic-shared-uid',
        verifiedEmailSha256: 'b'.repeat(64),
      },
      heartbeatRef: {
        ...proposal.heartbeatRef,
        externalId: '40000000-0000-4000-8000-000000000011',
      },
    };
    await transaction(async (client) => {
      for (const partyId of [1, 2]) {
        await client.query(
          `INSERT INTO business_v2.party_identifier_claims
             (party_id,identifier_kind,identifier_fingerprint,
              verification_method,confidence,status,valid_from,
              evidence_sha256)
           VALUES ($1,'verified_email_candidate',$2,'provider_verified',
             'source_verified','active','2026-09-15T01:00:00Z',$3)`,
          [
            partyId,
            sharedProposal.googleSubject.verifiedEmailSha256,
            '6'.repeat(64),
          ],
        );
      }
    });
    const beforeShared = await identityWriteCounts();
    expect(
      await serializableTransaction((client) =>
        applyGoogleAccountClaimProposalWithClient({
          client,
          proposal: sharedProposal,
          policy,
        }),
      ),
    ).toMatchObject({
      outcome: 'held',
      reasonCode: 'SHARED_VERIFIED_IDENTIFIER',
      candidateCount: 2,
      receiptInserted: 0,
      decisionsInserted: 0,
    });
    expect((await identityWriteCounts()).rows[0]).toEqual(beforeShared.rows[0]);

    const conflictedProposal = {
      ...proposal,
      claimId: '40000000-0000-4000-8000-000000000022',
      googleSubject: {
        ...proposal.googleSubject,
        uid: 'firebase-synthetic-conflicted-uid',
        verifiedEmailSha256: 'c'.repeat(64),
      },
      heartbeatRef: {
        ...proposal.heartbeatRef,
        externalId: '40000000-0000-4000-8000-000000000021',
      },
    };
    await transaction(async (client) => {
      await client.query(
        `INSERT INTO business_v2.party_identifier_claims
           (party_id,identifier_kind,identifier_fingerprint,
            verification_method,confidence,status,valid_from,
            evidence_sha256)
         VALUES (2,'verified_email_candidate',$1,'provider_verified',
           'source_verified','active','2026-09-15T01:00:00Z',$2)`,
        [conflictedProposal.googleSubject.verifiedEmailSha256, '7'.repeat(64)],
      );
      await client.query(
        `INSERT INTO business_v2.party_identity_exceptions
           (fingerprint,candidate_party_ids,reason_code,status,owner_group,
            evidence_refs,first_seen_at,last_seen_at)
         VALUES ($1,ARRAY[2]::bigint[],'identity_ambiguous','open','chief',
           $2::jsonb,'2026-09-15T01:00:00Z','2026-09-15T01:00:00Z')`,
        [
          '8'.repeat(64),
          JSON.stringify({
            source_ref_sha256: sha256Json(conflictedProposal.heartbeatRef),
          }),
        ],
      );
    });
    const beforeConflict = await identityWriteCounts();
    expect(
      await serializableTransaction((client) =>
        applyGoogleAccountClaimProposalWithClient({
          client,
          proposal: conflictedProposal,
          policy,
        }),
      ),
    ).toMatchObject({
      outcome: 'held',
      reasonCode: 'OPEN_IDENTITY_CONFLICT',
      candidateCount: 1,
      openConflict: true,
      receiptInserted: 0,
      decisionsInserted: 0,
    });
    expect((await identityWriteCounts()).rows[0]).toEqual(
      beforeConflict.rows[0],
    );

    const decisionConflictProposal = {
      ...proposal,
      claimId: '40000000-0000-4000-8000-000000000032',
      googleSubject: {
        ...proposal.googleSubject,
        uid: 'firebase-synthetic-decision-conflict-uid',
        verifiedEmailSha256: 'd'.repeat(64),
      },
      heartbeatRef: {
        ...proposal.heartbeatRef,
        externalId: '40000000-0000-4000-8000-000000000031',
      },
    };
    await transaction((client) =>
      client.query(
        `INSERT INTO business_v2.identity_resolution_decisions
           (decision_uuid,provider,environment,source_scope,entity_type,
            external_id_sha256,result,resolution_basis,party_id,candidate_id,
            evidence_refs,evidence_sha256,reason_code,decided_at,
            retention_policy_version)
         VALUES ($1,'heartbeat','test','main-community','user',$2,
           'ambiguous',NULL,NULL,NULL,$3::jsonb,
           business_v2.fn_tandem_identity_sha256($3::jsonb::text),
           'FIXTURE_DECISION_CONFLICT','2026-09-15T02:01:00Z',1)`,
        [
          decisionConflictProposal.claimId,
          sha256Json(decisionConflictProposal.heartbeatRef.externalId),
          JSON.stringify(['receipt:fixture-decision-conflict']),
        ],
      ),
    );
    const beforeDecisionConflict = await identityWriteCounts();
    expect(
      await serializableTransaction((client) =>
        applyGoogleAccountClaimProposalWithClient({
          client,
          proposal: decisionConflictProposal,
          policy,
        }),
      ),
    ).toMatchObject({
      outcome: 'held',
      reasonCode: 'CLAIM_ID_DECISION_CONFLICT',
      openConflict: true,
      receiptInserted: 0,
      decisionsInserted: 0,
    });
    expect((await identityWriteCounts()).rows[0]).toEqual(
      beforeDecisionConflict.rows[0],
    );
  });
});
