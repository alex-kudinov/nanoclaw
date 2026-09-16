import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  grantCoachingToolsPlusCanaryWithClient,
  revokeCoachingToolsPlusCanaryWithClient,
  type CoachingToolsPlusCanaryPolicy,
} from './coaching-tools-plus-canary.js';
import { lookupLoginToolsBindingWithClient } from './login-tools-gateway.js';

const root = process.cwd();
const pgBin = '/opt/homebrew/opt/postgresql@16/bin';
const database = `nc_plus_canary_${randomUUID().replaceAll('-', '_')}`;
const migration = path.join(
  root,
  'data/business/migrations/nanoclaw-v2/142_student_enrollment_dark_foundation.sql',
);
let pool: Pool;

function run(binary: string, args: string[], input?: string): string {
  const result = spawnSync(binary, args, {
    cwd: root,
    env: Object.fromEntries(
      ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR']
        .filter((key) => process.env[key] !== undefined)
        .map((key) => [key, process.env[key]]),
    ),
    encoding: 'utf8',
    input,
  });
  if (result.status !== 0) {
    throw new Error(
      `${path.basename(binary)} failed: ${(result.stderr || result.stdout || '').trim().slice(-4000)}`,
    );
  }
  return result.stdout.trim();
}

function psql(args: string[], input?: string): string {
  return run(
    path.join(pgBin, 'psql'),
    ['-X', '--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-h', '/tmp', '-p', '5432', '-d', database, ...args],
    input,
  );
}

async function serializable<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
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

const request = {
  schemaVersion: 1 as const,
  projectId: 'tandem-identity-dev-2026' as const,
  uid: 'firebase-owner-pilot-uid',
  verifiedEmailSha256: '9'.repeat(64),
  partyId: 10069 as const,
  heartbeatUserId: 'bc42394c-ad45-4d81-89eb-448347b3d518',
  heartbeatGroupId: 'bc095770-0c8b-4495-9369-985e4c4649d7',
  expiresAt: '2026-09-16T12:10:00.000Z',
};

const policy: CoachingToolsPlusCanaryPolicy = {
  projectId: 'tandem-identity-dev-2026',
  environment: 'development',
  partyId: 10069,
  verifiedEmailSha256: '9'.repeat(64),
  heartbeatUserId: request.heartbeatUserId,
  heartbeatGroupId: request.heartbeatGroupId,
  decisionRef: '.program/decisions/plus-canary.json',
  decisionUuid: '083c2829-0151-4f95-a6aa-8df28c29123d',
};

beforeAll(() => {
  if (!fs.existsSync(path.join(pgBin, 'psql')) || !fs.existsSync(migration)) {
    throw new Error('PostgreSQL 16 or migration 142 is unavailable');
  }
  run(path.join(pgBin, 'createdb'), ['-h', '/tmp', '-p', '5432', database]);
  psql(
    ['-q'],
    `DO $$ BEGIN
       CREATE ROLE nanoclaw_admin NOLOGIN;
     EXCEPTION WHEN duplicate_object THEN NULL; END $$;
     CREATE SCHEMA business_v2;
     CREATE TABLE business_v2.parties (
       id bigserial PRIMARY KEY,
       party_type text NOT NULL CHECK (party_type IN ('person','org')),
       display_name text NOT NULL,
       primary_email text,
       source_provider text,
       source_id text,
       merged_into bigint REFERENCES business_v2.parties(id),
       merged_at timestamptz,
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now(),
       last_updated_by text NOT NULL DEFAULT 'unknown',
       CHECK ((merged_into IS NULL)=(merged_at IS NULL))
     );
     CREATE TABLE business_v2.party_emails (
       party_id bigint NOT NULL REFERENCES business_v2.parties(id),
       email text NOT NULL,
       is_primary boolean NOT NULL DEFAULT false,
       verified_at timestamptz,
       PRIMARY KEY (party_id,email)
     );
     CREATE TABLE business_v2.party_external_refs (id bigserial PRIMARY KEY);
     CREATE TABLE business_v2.auth_accounts (
       id bigserial PRIMARY KEY,
       issuer text NOT NULL,
       environment text NOT NULL,
       source_scope text NOT NULL,
       subject text NOT NULL,
       party_id bigint REFERENCES business_v2.parties(id),
       account_state text NOT NULL,
       binding_basis text NOT NULL,
       account_version integer NOT NULL DEFAULT 0
     );
     CREATE TABLE business_v2.provider_projection_attempts (id bigserial PRIMARY KEY);
     CREATE FUNCTION business_v2.fn_company_work_append_only()
       RETURNS trigger LANGUAGE plpgsql AS $$
     BEGIN RAISE EXCEPTION 'append-only fixture relation'; END $$;
     GRANT nanoclaw_admin TO CURRENT_USER;
     GRANT USAGE ON SCHEMA business_v2 TO nanoclaw_admin;
     GRANT ALL ON ALL TABLES IN SCHEMA business_v2 TO nanoclaw_admin;
     GRANT ALL ON ALL SEQUENCES IN SCHEMA business_v2 TO nanoclaw_admin;`,
  );
  psql(['-q', '-f', migration]);
  psql(
    ['-q'],
    `GRANT ALL ON ALL TABLES IN SCHEMA business_v2 TO nanoclaw_admin;
     GRANT ALL ON ALL SEQUENCES IN SCHEMA business_v2 TO nanoclaw_admin;
     INSERT INTO business_v2.parties
       (id,party_type,display_name,primary_email,created_at,updated_at,last_updated_by)
     VALUES (10069,'person','Owner pilot','owner@example.test',now(),now(),'fixture');
     INSERT INTO business_v2.auth_accounts
       (issuer,environment,source_scope,subject,party_id,account_state,binding_basis,account_version)
     VALUES ('https://securetoken.google.com/tandem-identity-dev-2026','development',
       'tandem-identity-dev-2026','firebase-owner-pilot-uid',10069,
       'accepted','operator_decision',1);
     INSERT INTO business_v2.student_enrollment_orders
       (order_key,source_channel,offer_key,bundle_key,bundle_version,payer_party_id,
        seat_count,financial_classification,state,version,policy_revision,evidence_sha256,
        effective_at,created_at,updated_at,updated_by)
     VALUES ('existing-mcs-order','migration_or_correction','mcq-program-a-foundations',
       'mcs-foundations-en:v1',1,NULL,1,'settled','materialized',0,1,
       repeat('a',64),now(),now(),now(),'fixture');
     INSERT INTO business_v2.student_enrollment_seats
       (seat_key,order_id,seat_number,participant_party_id,participant_evidence_sha256,
        payer_relationship,state,version,created_at,updated_at,updated_by)
     SELECT 'existing-mcs-seat',id,1,10069,repeat('a',64),'unknown','materialized',0,
       now(),now(),'fixture' FROM business_v2.student_enrollment_orders
       WHERE order_key='existing-mcs-order';
     INSERT INTO business_v2.student_enrollments_v2
       (id,enrollment_key,order_id,seat_id,participant_party_id,offer_key,bundle_key,
        bundle_version,catalog_revision,state,version,effective_at,ended_at,
        materialization_sha256,created_at,updated_at,updated_by)
     SELECT 82,'existing-mcs-enrollment',o.id,s.id,10069,'mcq-program-a-foundations',
       'mcs-foundations-en:v1',1,1,'active',0,now(),NULL,repeat('a',64),
       now(),now(),'fixture'
       FROM business_v2.student_enrollment_orders o
       JOIN business_v2.student_enrollment_seats s ON s.order_id=o.id
      WHERE o.order_key='existing-mcs-order';
     INSERT INTO business_v2.student_component_entitlements
       (entitlement_key,enrollment_id,component_key,grant_episode,state,version,
        evidence_sha256,created_at,updated_at,updated_by)
     VALUES ('existing-mcs-foundations',82,'mcs.foundations',1,'included',0,
       repeat('a',64),now(),now(),'fixture');`,
  );
  pool = new Pool({
    host: '/tmp',
    port: 5432,
    database,
    user: process.env.USER,
    max: 4,
  });
});

afterAll(async () => {
  if (pool) await pool.end();
  run(path.join(pgBin, 'dropdb'), ['-h', '/tmp', '-p', '5432', '--if-exists', database]);
});

describe('Coaching Tools Plus canonical canary', () => {
  it('grants once, resolves access, revokes once, and preserves enrollment 82', async () => {
    const protectedCounts = () =>
      serializable((client) =>
        client.query(`SELECT
          (SELECT count(*) FROM business_v2.parties)::int AS parties,
          (SELECT count(*) FROM business_v2.party_external_refs)::int AS refs,
          (SELECT count(*) FROM business_v2.auth_accounts)::int AS auth_accounts,
          (SELECT count(*) FROM business_v2.provider_projection_attempts)::int AS provider_attempts`),
      );
    const enrollment82 = () =>
      serializable((client) =>
        client.query(`SELECT en.state,en.version,en.ended_at,
          jsonb_agg(jsonb_build_object('key',e.component_key,'state',e.state,'version',e.version)
            ORDER BY e.id) AS components
          FROM business_v2.student_enrollments_v2 en
          JOIN business_v2.student_component_entitlements e ON e.enrollment_id=en.id
         WHERE en.id=82 GROUP BY en.id`),
      );
    const beforeProtected = (await protectedCounts()).rows[0];
    const before82 = (await enrollment82()).rows[0];

    await expect(
      serializable((client) =>
        grantCoachingToolsPlusCanaryWithClient({
          client,
          request,
          policy,
          observedAt: '2026-09-16T12:00:00.000Z',
        }),
      ),
    ).resolves.toMatchObject({
      outcome: 'accepted',
      orderInserted: 1,
      enrollmentInserted: 1,
      entitlementInserted: 1,
      historyInserted: 5,
      partyWrites: 0,
      providerWrites: 0,
    });
    expect((await protectedCounts()).rows[0]).toEqual(beforeProtected);
    expect((await enrollment82()).rows[0]).toEqual(before82);

    await expect(
      serializable((client) =>
        lookupLoginToolsBindingWithClient({
          client,
          request: {
            kind: 'tandem_identity_binding_lookup',
            schemaVersion: 1,
            projectId: request.projectId,
            uid: request.uid,
            verifiedEmailSha256: request.verifiedEmailSha256,
          },
          policy: {
            projectId: request.projectId,
            environment: 'development',
            pilotPartyId: 10069,
            pilotEmailSha256: request.verifiedEmailSha256,
          },
          observedAt: '2026-09-16T12:01:00.000Z',
        }),
      ),
    ).resolves.toMatchObject({
      status: 'bound',
      partyId: '10069',
      entitlements: [
        {
          key: 'coaching_tools.plus',
          state: 'active',
          validUntil: '2026-09-16T12:10:00.000Z',
        },
      ],
    });

    await expect(
      serializable((client) =>
        grantCoachingToolsPlusCanaryWithClient({
          client,
          request,
          policy,
          observedAt: '2026-09-16T12:02:00.000Z',
        }),
      ),
    ).resolves.toMatchObject({ outcome: 'duplicate', entitlementInserted: 0 });

    const canaryCounts = await serializable((client) =>
      client.query(`SELECT
        (SELECT count(*) FROM business_v2.student_enrollment_orders
          WHERE order_key LIKE 'tandem-identity-plus-canary:%')::int AS orders,
        (SELECT count(*) FROM business_v2.student_enrollments_v2
          WHERE enrollment_key LIKE 'tandem-identity-plus-canary:%')::int AS enrollments,
        (SELECT count(*) FROM business_v2.student_component_entitlements
          WHERE entitlement_key LIKE 'tandem-identity-plus-canary:%')::int AS entitlements`),
    );
    expect(canaryCounts.rows[0]).toEqual({ orders: 1, enrollments: 1, entitlements: 1 });

    await expect(
      serializable((client) =>
        grantCoachingToolsPlusCanaryWithClient({
          client,
          request: { ...request, heartbeatGroupId: '00000000-0000-4000-8000-000000000001' },
          policy,
          observedAt: '2026-09-16T12:02:30.000Z',
        }),
      ),
    ).rejects.toThrow(/plus_canary_scope_invalid/);
    expect((await protectedCounts()).rows[0]).toEqual(beforeProtected);

    await expect(
      serializable((client) =>
        revokeCoachingToolsPlusCanaryWithClient({
          client,
          request,
          policy,
          observedAt: '2026-09-16T12:11:00.000Z',
        }),
      ),
    ).resolves.toMatchObject({
      outcome: 'revoked',
      entitlementUpdated: 1,
      enrollmentUpdated: 1,
      historyInserted: 5,
      providerWrites: 0,
    });
    expect((await protectedCounts()).rows[0]).toEqual(beforeProtected);
    expect((await enrollment82()).rows[0]).toEqual(before82);

    await expect(
      serializable((client) =>
        revokeCoachingToolsPlusCanaryWithClient({
          client,
          request,
          policy,
          observedAt: '2026-09-16T12:12:00.000Z',
        }),
      ),
    ).resolves.toMatchObject({ outcome: 'duplicate', entitlementUpdated: 0 });

    const finalState = await serializable((client) =>
      client.query(`SELECT en.state AS enrollment_state,en.version AS enrollment_version,
          e.state AS entitlement_state,e.version AS entitlement_version
        FROM business_v2.student_enrollments_v2 en
        JOIN business_v2.student_component_entitlements e ON e.enrollment_id=en.id
       WHERE en.enrollment_key LIKE 'tandem-identity-plus-canary:%'`),
    );
    expect(finalState.rows[0]).toEqual({
      enrollment_state: 'cancelled',
      enrollment_version: 1,
      entitlement_state: 'revoked',
      entitlement_version: 1,
    });
  }, 30_000);

  it('rejects a canary safety expiry beyond thirty minutes', async () => {
    await expect(
      serializable((client) =>
        grantCoachingToolsPlusCanaryWithClient({
          client,
          request: { ...request, expiresAt: '2026-09-16T13:00:01.000Z' },
          policy,
          observedAt: '2026-09-16T12:30:00.000Z',
        }),
      ),
    ).rejects.toThrow(/plus_canary_expiry_invalid/);
  });
});
