import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { userInfo } from 'node:os';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveCheckoutCustomerIdentityWithClient } from './checkout-customer-identity.js';
import { identityBodySha256 } from './payment-identity-preparation.js';
import { createPaymentIdentityTestRuntime } from './payment-identity-test-runtime.js';
import { PaymentRequestAuthenticator } from './payment-request-auth.js';
import type { PaymentTransaction } from './payment-store.js';

const database = `nc_payment_identity_disposable_${process.pid}_${randomUUID().replaceAll('-', '')}`;
if (!/^nc_payment_identity_disposable_[0-9]+_[a-f0-9]{32}$/.test(database))
  throw new Error('unsafe disposable name');
const pgConfig = {
  host: '/tmp',
  port: 5432,
  user: userInfo().username,
  password: 'unused-local-disposable',
  ssl: false as const,
  options: '-c search_path=pg_catalog',
  connectionTimeoutMillis: 2000,
  max: 8,
};
const maintenance = new Pool({ ...pgConfig, database: 'postgres' });
let pool: Pool;
let server: Server;
let serverB: Server;
let baseUrl: string;
let baseUrlB: string;
let runtime: ReturnType<typeof createPaymentIdentityTestRuntime>;
let created = false;
let holdResolver = true;
let enterResolver!: () => void;
let releaseResolver!: () => void;
let resolverEntered = new Promise<void>((resolve) => {
  enterResolver = resolve;
});
let resolverRelease = new Promise<void>((resolve) => {
  releaseResolver = resolve;
});

const caller = 'tandem-wordpress-test';
const callerB = 'tandem-wordpress-secondary';
const scope = {
  provider: 'adyen' as const,
  environment: 'test' as const,
  company: 'company',
  merchant: 'merchant',
  store: 'store',
  endpointRegion: 'eu',
};
const requestSecret = Buffer.from('r'.repeat(32));
const responseSecret = Buffer.from('s'.repeat(32));
const requestSecretB = Buffer.from('R'.repeat(32));
const responseSecretB = Buffer.from('S'.repeat(32));
const requestKeys = new Map([['req-v1', { caller, secret: requestSecret }]]);
const authenticator = new PaymentRequestAuthenticator(requestKeys);
const requestKeysB = new Map([
  ['req-v1-b', { caller: callerB, secret: requestSecretB }],
]);
const authenticatorB = new PaymentRequestAuthenticator(requestKeysB);
const seenSourceKeys = new Set<string>();
const sql = (name: string) =>
  readFileSync(
    new URL(`../data/business/migrations/nanoclaw-v2/${name}`, import.meta.url),
    'utf8',
  );
const transaction: PaymentTransaction = async (work) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query('SET LOCAL ROLE nanoclaw_admin');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

const selfResolve = {
  schemaVersion: 1,
  requestId: '10000000-0000-4000-8000-000000000001',
  preparationId: '20000000-0000-4000-8000-000000000002',
  intentId: '30000000-0000-4000-8000-000000000003',
  offerKey: 'mcs-foundations-es',
  purchaseRelationship: 'self',
  payer: {
    role: 'payer',
    candidate: {
      firstName: 'Alex',
      lastName: 'Morgan',
      email: 'alex@example.test',
    },
  },
  participant: { role: 'participant', sameAs: 'payer' },
  billingProfile: {
    schemaVersion: 1,
    companyLegalName: 'Example Coaching LLC',
    invoiceEmail: 'accounts@example.test',
    taxId: '12-3456789',
    address: {
      street: 'Main Street',
      houseNumberOrName: '42',
      city: 'Chicago',
      postalCode: '60601',
      stateOrProvince: 'IL',
      country: 'US',
    },
  },
};

function wire(
  path:
    | '/internal/payments/identity/resolve'
    | '/internal/payments/identity/status',
  command: Record<string, unknown>,
  nonce = randomUUID(),
  callerVariant: 'a' | 'b' = 'a',
) {
  const activeCaller = callerVariant === 'a' ? caller : callerB;
  const activeAuthenticator =
    callerVariant === 'a' ? authenticator : authenticatorB;
  const body = Buffer.from(JSON.stringify(command));
  const envelope = activeAuthenticator.sign(
    {
      version: 1,
      keyId: callerVariant === 'a' ? 'req-v1' : 'req-v1-b',
      caller: activeCaller,
      method: 'POST',
      path,
      timestamp: Date.now(),
      nonce,
      operationId: String(command.requestId),
    },
    body,
  );
  return {
    nonce,
    body,
    wire: JSON.stringify({
      auth: envelope,
      payloadBase64: body.toString('base64'),
    }),
  };
}

async function post(
  path:
    | '/internal/payments/identity/resolve'
    | '/internal/payments/identity/status',
  command: Record<string, unknown>,
  callerVariant: 'a' | 'b' = 'a',
) {
  const request = wire(path, command, randomUUID(), callerVariant);
  const response = await fetch(
    `${callerVariant === 'a' ? baseUrl : baseUrlB}${path}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: request.wire,
    },
  );
  const outer = (await response.json()) as any;
  const innerBytes = Buffer.from(outer.payloadBase64, 'base64');
  const signing = [
    'tandem-payments-response-v1',
    outer.auth.keyId,
    outer.auth.caller,
    'POST',
    path,
    String(command.requestId),
    request.nonce,
    String(response.status),
    String(outer.auth.timestamp),
    createHash('sha256').update(innerBytes).digest('hex'),
  ].join('\n');
  expect(
    createHmac(
      'sha256',
      callerVariant === 'a' ? responseSecret : responseSecretB,
    )
      .update(signing)
      .digest('hex'),
  ).toBe(outer.auth.signature);
  return {
    response,
    inner: JSON.parse(innerBytes.toString('utf8')) as Record<string, any>,
  };
}

beforeAll(async () => {
  expect(
    (await maintenance.query('SELECT inet_server_addr() AS address')).rows[0]
      .address,
  ).toBeNull();
  await maintenance.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
  created = true;
  pool = new Pool({ ...pgConfig, database });
  await pool.query('CREATE EXTENSION citext');
  await pool.query('CREATE SCHEMA business_v2 AUTHORIZATION nanoclaw_admin');
  for (const migration of [
    '01_extensions.sql',
    '02_lookups.sql',
    '03_parties.sql',
    '04_roles.sql',
    '05_engagements.sql',
    '06_programs.sql',
    '07_pipeline.sql',
    '08_interactions.sql',
    '09_documents.sql',
    '10_outbox.sql',
    '11_helpers.sql',
    '12_triggers.sql',
    '13_views.sql',
    '14_grants.sql',
    '16_cutover_helpers.sql',
    '137_relationship_context_dark.sql',
    '149_payment_attempt_store.sql',
    '150_payment_request_admission.sql',
    '154_payment_identity_preparation.sql',
    'rollback_154_payment_identity_preparation.sql',
    '154_payment_identity_preparation.sql',
    '161_payment_checkout_billing_profile.sql',
    '165_deferred_checkout_identity.sql',
  ]) {
    try {
      await pool.query(sql(migration));
    } catch (error) {
      throw new Error(`failed ${migration}`, { cause: error });
    }
  }

  const seeded = await transaction(async (client) => {
    const party = await client.query<{ id: string }>(
      `SELECT business_v2.fn_create_party(
       'person','Alex Morgan','alex@example.test'::citext,'wordpress','{}'::jsonb
       )::text AS id`,
    );
    await client.query(
      `INSERT INTO business_v2.party_external_refs
       (party_id,provider,source_scope,entity_type,external_id,adapter_key,
        adapter_version,schema_version,status,verified_at,first_seen_at,
        last_seen_at,source_receipt_sha256)
       VALUES($1,'stripe','tandem','customer','cus_1234567890abc',
        'identity_fixture','1.0.0',1,'active',now(),now(),now(),repeat('a',64))`,
      [party.rows[0].id],
    );
    return Number(party.rows[0].id);
  });
  expect(seeded).toBeGreaterThan(0);

  runtime = createPaymentIdentityTestRuntime(
    {
      mode: 'test',
      caller,
      scope,
      requestKeys,
      payloadKeyId: 'payload-v1',
      payloadKeys: new Map([['payload-v1', Buffer.from('p'.repeat(32))]]),
      responseKeyId: 'resp-v1',
      responseKey: { caller, secret: responseSecret },
      identitySecret: 'i'.repeat(32),
      identityTokenSecret: Buffer.from('t'.repeat(32)),
      identityReferenceSecret: Buffer.from('o'.repeat(32)),
      limits: {
        requestsPerWindow: 100,
        maxActive: 8,
        windowMs: 60000,
        maxBodyBytes: 100000,
        bodyReadTimeoutMs: 1000,
      },
    },
    {
      transaction,
      identityResolver: async (input) => {
        seenSourceKeys.add(input.request.sourceRequestKey);
        if (holdResolver) {
          holdResolver = false;
          enterResolver();
          await resolverRelease;
        }
        return resolveCheckoutCustomerIdentityWithClient(input);
      },
    },
  );
  server = createServer(runtime.http.handle);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no listener');
  baseUrl = `http://127.0.0.1:${address.port}`;

  const runtimeB = createPaymentIdentityTestRuntime(
    {
      mode: 'test',
      caller: callerB,
      scope,
      requestKeys: requestKeysB,
      payloadKeyId: 'payload-v1-b',
      payloadKeys: new Map([['payload-v1-b', Buffer.from('q'.repeat(32))]]),
      responseKeyId: 'resp-v1-b',
      responseKey: { caller: callerB, secret: responseSecretB },
      identitySecret: 'j'.repeat(32),
      identityTokenSecret: Buffer.from('u'.repeat(32)),
      identityReferenceSecret: Buffer.from('n'.repeat(32)),
      limits: {
        requestsPerWindow: 100,
        maxActive: 8,
        windowMs: 60000,
        maxBodyBytes: 100000,
        bodyReadTimeoutMs: 1000,
      },
    },
    {
      transaction,
      identityResolver: async (input) => {
        seenSourceKeys.add(input.request.sourceRequestKey);
        return resolveCheckoutCustomerIdentityWithClient(input);
      },
    },
  );
  serverB = createServer(runtimeB.http.handle);
  await new Promise<void>((resolve) => serverB.listen(0, '127.0.0.1', resolve));
  const addressB = serverB.address();
  if (!addressB || typeof addressB === 'string')
    throw new Error('no secondary listener');
  baseUrlB = `http://127.0.0.1:${addressB.port}`;
});

afterAll(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  if (serverB)
    await new Promise<void>((resolve, reject) =>
      serverB.close((error) => (error ? reject(error) : resolve())),
    );
  if (pool) await pool.end();
  if (created) {
    await maintenance.query(`DROP DATABASE IF EXISTS "${database}"`);
    created = false;
  }
  await maintenance.end();
});

describe('disposable identity preparation HTTP/store composition', () => {
  it('recovers a simultaneous lost resolve ACK through PII-free status', async () => {
    const resolveRequest = post(
      '/internal/payments/identity/resolve',
      selfResolve,
    );
    await resolverEntered;
    const resolveBody = Buffer.from(JSON.stringify(selfResolve));
    const status = {
      schemaVersion: 1,
      requestId: '50000000-0000-4000-8000-000000000005',
      preparationId: selfResolve.preparationId,
      originOperationId: selfResolve.requestId,
      identityRequestSha256: identityBodySha256(resolveBody),
    };
    const statusRequest = post('/internal/payments/identity/status', status);
    await new Promise((resolve) => setTimeout(resolve, 20));
    releaseResolver();
    const [resolved, recovered] = await Promise.all([
      resolveRequest,
      statusRequest,
    ]);
    expect(resolved.response.status).toBe(200);
    expect(recovered.response.status).toBe(200);
    expect(resolved.inner).toEqual(recovered.inner);
    const receipt = resolved.inner.identityPreparationReceipt;
    expect(receipt).toMatchObject({
      kind: 'identity_preparation',
      operationId: selfResolve.requestId,
      preparationId: selfResolve.preparationId,
      intentId: selfResolve.intentId,
      purchaseRelationship: 'self',
      source: scope,
    });
    expect(receipt.payerReference).toBe(receipt.participantReference);
    expect(receipt.payerRoleProof).not.toBe(receipt.participantRoleProof);
    expect(JSON.stringify(receipt)).not.toContain('alex@example.test');

    expect(
      await runtime.readPrivateBindings(selfResolve.preparationId),
    ).toMatchObject({
      payerExistingStripeCustomerId: 'cus_1234567890abc',
      participantExistingStripeCustomerId: 'cus_1234567890abc',
      billingProfile: selfResolve.billingProfile,
    });
    const stored = await pool.query(
      'SELECT * FROM business_v2.payment_identity_preparations WHERE preparation_id=$1',
      [selfResolve.preparationId],
    );
    expect(stored.rows).toHaveLength(1);
    expect(JSON.stringify(stored.rows[0])).not.toContain('alex@example.test');
    expect(JSON.stringify(stored.rows[0])).not.toContain('Example Coaching');
    expect(stored.rows[0].billing_profile_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.rows[0].encrypted_billing_profile).toMatch(/^payload-v1\./);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int n FROM business_v2.party_external_refs WHERE provider='stripe'",
        )
      ).rows[0].n,
    ).toBe(1);
  });

  it('replays exactly, conflicts changed origin semantics and hides status mismatch', async () => {
    const replay = await post(
      '/internal/payments/identity/resolve',
      selfResolve,
    );
    expect(replay.response.status).toBe(200);
    const changed = await post('/internal/payments/identity/resolve', {
      ...selfResolve,
      offerKey: 'mcs-foundations-fr',
    });
    expect(changed.response.status).toBe(409);
    expect(changed.inner).toEqual({ error: 'identity_operation_conflict' });
    const missing = await post('/internal/payments/identity/status', {
      schemaVersion: 1,
      requestId: '60000000-0000-4000-8000-000000000006',
      preparationId: selfResolve.preparationId,
      originOperationId: selfResolve.requestId,
      identityRequestSha256: 'f'.repeat(64),
    });
    expect(missing.inner).toEqual({ schemaVersion: 1, status: 'not_found' });
  });

  it('resolves explicit other roles and rolls back equal-Party other claims', async () => {
    const other = {
      ...selfResolve,
      requestId: '70000000-0000-4000-8000-000000000007',
      preparationId: '80000000-0000-4000-8000-000000000008',
      intentId: '90000000-0000-4000-8000-000000000009',
      purchaseRelationship: 'other',
      participant: {
        role: 'participant',
        candidate: {
          firstName: 'Sam',
          lastName: 'River',
          email: 'sam@example.test',
        },
      },
    };
    const result = await post('/internal/payments/identity/resolve', other);
    expect(result.response.status).toBe(200);
    expect(result.inner.identityPreparationReceipt.payerReference).not.toBe(
      result.inner.identityPreparationReceipt.participantReference,
    );

    const sameParty = {
      ...other,
      requestId: 'a0000000-0000-4000-8000-00000000000a',
      preparationId: 'b0000000-0000-4000-8000-00000000000b',
      intentId: 'c0000000-0000-4000-8000-00000000000c',
      participant: {
        role: 'participant',
        candidate: { ...selfResolve.payer.candidate },
      },
    };
    const conflict = await post(
      '/internal/payments/identity/resolve',
      sameParty,
    );
    expect(conflict.response.status).toBe(409);
    expect(conflict.inner).toEqual({ error: 'identity_relationship_conflict' });
    expect(
      (
        await pool.query(
          'SELECT count(*)::int n FROM business_v2.payment_identity_preparations WHERE preparation_id=$1',
          [sameParty.preparationId],
        )
      ).rows[0].n,
    ).toBe(0);
  });

  it('isolates concurrent callers that reuse one preparation UUID', async () => {
    const sharedPreparationId = '21000000-0000-4000-8000-000000000021';
    const callerA = {
      ...selfResolve,
      requestId: '22000000-0000-4000-8000-000000000022',
      preparationId: sharedPreparationId,
      intentId: '23000000-0000-4000-8000-000000000023',
      payer: {
        role: 'payer',
        candidate: {
          firstName: 'Caller',
          lastName: 'Alpha',
          email: 'caller-alpha@example.test',
        },
      },
    };
    const callerBCommand = {
      ...selfResolve,
      requestId: '24000000-0000-4000-8000-000000000024',
      preparationId: sharedPreparationId,
      intentId: '25000000-0000-4000-8000-000000000025',
      payer: {
        role: 'payer',
        candidate: {
          firstName: 'Caller',
          lastName: 'Beta',
          email: 'caller-beta@example.test',
        },
      },
    };
    const [resolvedA, resolvedB] = await Promise.all([
      post('/internal/payments/identity/resolve', callerA),
      post('/internal/payments/identity/resolve', callerBCommand, 'b'),
    ]);
    expect(resolvedA.response.status).toBe(200);
    expect(resolvedB.response.status).toBe(200);
    expect(resolvedA.inner.identityPreparationReceipt.caller).toBe(caller);
    expect(resolvedB.inner.identityPreparationReceipt.caller).toBe(callerB);
    expect(
      (
        await pool.query(
          'SELECT count(*)::int n FROM business_v2.payment_identity_preparations WHERE preparation_id=$1',
          [sharedPreparationId],
        )
      ).rows[0].n,
    ).toBe(2);

    const crossStatus = await post(
      '/internal/payments/identity/status',
      {
        schemaVersion: 1,
        requestId: '26000000-0000-4000-8000-000000000026',
        preparationId: sharedPreparationId,
        originOperationId: callerA.requestId,
        identityRequestSha256: identityBodySha256(
          Buffer.from(JSON.stringify(callerA)),
        ),
      },
      'b',
    );
    expect(crossStatus.inner).toEqual({
      schemaVersion: 1,
      status: 'not_found',
    });
    expect([...seenSourceKeys]).toEqual(
      expect.arrayContaining([
        `identity:${caller}:${sharedPreparationId}:payer`,
        `identity:${callerB}:${sharedPreparationId}:payer`,
        `identity:${caller}:80000000-0000-4000-8000-000000000008:payer`,
        `identity:${caller}:80000000-0000-4000-8000-000000000008:participant`,
      ]),
    );
    expect([...seenSourceKeys].every((key) => key.length <= 500)).toBe(true);
  });

  it('rejects authenticated schema extras and unsigned contact tampering before writes', async () => {
    const extra = {
      ...selfResolve,
      requestId: 'd0000000-0000-4000-8000-00000000000d',
      preparationId: 'e0000000-0000-4000-8000-00000000000e',
      intentId: 'f0000000-0000-4000-8000-00000000000f',
      stripeCustomerId: 'cus_forbidden',
    };
    const rejected = await post('/internal/payments/identity/resolve', extra);
    expect(rejected.response.status).toBe(400);
    expect(rejected.inner).toEqual({ error: 'invalid_identity_request' });

    const request = wire('/internal/payments/identity/resolve', {
      ...selfResolve,
      requestId: '11000000-0000-4000-8000-000000000011',
      preparationId: '12000000-0000-4000-8000-000000000012',
      intentId: '13000000-0000-4000-8000-000000000013',
    });
    const outer = JSON.parse(request.wire);
    const tampered = JSON.parse(request.body.toString('utf8'));
    tampered.payer.candidate.email = 'attacker@example.test';
    outer.payloadBase64 = Buffer.from(JSON.stringify(tampered)).toString(
      'base64',
    );
    const response = await fetch(
      `${baseUrl}/internal/payments/identity/resolve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(outer),
      },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_request' });
    expect(
      (
        await pool.query(
          'SELECT count(*)::int n FROM business_v2.payment_identity_preparations WHERE preparation_id IN ($1,$2)',
          [extra.preparationId, tampered.preparationId],
        )
      ).rows[0].n,
    ).toBe(0);
  });

  it('refuses populated rollback and leaves tables inaccessible to non-admin roles', async () => {
    await expect(
      pool.query(sql('rollback_161_payment_checkout_billing_profile.sql')),
    ).rejects.toThrow('populated payment billing profile rollback refused');
    await pool.query('ROLLBACK');
    await expect(
      pool.query(sql('rollback_154_payment_identity_preparation.sql')),
    ).rejects.toThrow('rollback154 refused');
    await pool.query('ROLLBACK');
    expect(
      (
        await pool.query(
          `SELECT count(*)::int n FROM information_schema.role_table_grants
           WHERE table_schema='business_v2'
             AND table_name='payment_identity_preparations'
             AND grantee NOT IN ('nanoclaw_admin',current_user)`,
        )
      ).rows[0].n,
    ).toBe(0);
  });
});
