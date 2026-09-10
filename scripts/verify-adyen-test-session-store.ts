/** Explicit TEST-only, unused-Session proof. No SDK payment, webhook or fulfillment. */
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { Pool } from 'pg';

import { AdyenTestSessionAdapter } from '../src/adyen-session-adapter.js';
import { createPaymentAttempt } from '../src/payment-domain.js';
import { PaymentPayloadVault } from '../src/payment-payload-vault.js';
import { PaymentStore, type PaymentTransaction } from '../src/payment-store.js';
import { PaymentSessionService } from '../src/payment-session-service.js';

const args = process.argv.slice(2);
if (
  args.length !== 5 ||
  args[0] !== '--confirm-test-only' ||
  args[1] !== '--catalog' ||
  args[3] !== '--policy'
)
  throw new Error(
    'usage: --confirm-test-only --catalog <reviewed products.json> --policy <reviewed checkout policy>',
  );
const env = process.env;
if (
  env.TANDEM_ADYEN_TEST_ENVIRONMENT !== 'test' ||
  !env.TANDEM_ADYEN_TEST_API_KEY ||
  env.TANDEM_ADYEN_TEST_MERCHANT_ACCOUNT !== 'SoleraMerchantServicesECOM' ||
  env.TANDEM_ADYEN_TEST_STORE_REFERENCE !== 'tandem_test_ecom_v1' ||
  env.TANDEM_ADYEN_TEST_ALLOWED_ORIGIN !== 'http://localhost:3000'
)
  throw new Error('exact TEST configuration unavailable');

const catalogBytes = readFileSync(args[2], 'utf8');
const product = JSON.parse(catalogBytes)['mcq-program-a-foundations'];
if (
  !product ||
  product.active !== true ||
  product.price_cents !== 29900 ||
  product.currency?.toUpperCase() !== 'USD'
)
  throw new Error('reviewed Foundations TEST offer changed');
const terms = readFileSync(args[4], 'utf8').match(
  /ENROLLMENT_TERMS_VERSION\s*=\s*'([^']+)'/,
)?.[1];
if (!terms) throw new Error('checkout terms version unavailable');

const database = `nc_payment_disposable_${process.pid}_${randomUUID().replaceAll('-', '')}`;
if (!/^nc_payment_disposable_[0-9]+_[a-f0-9]{32}$/.test(database))
  throw new Error('unsafe generated database');
const config = {
  host: '/tmp',
  port: 5432,
  user: userInfo().username,
  password: 'unused-local-disposable',
  ssl: false as const,
  options: '-c search_path=pg_catalog',
  connectionTimeoutMillis: 2000,
};
const maintenance = new Pool({ ...config, database: 'postgres' });
let pool: Pool | undefined;
let created = false;
let proof: Record<string, unknown> | undefined;
let phase = 'database_setup';
const providerStatuses: number[] = [];
let providerCalls = 0;
const vault = new PaymentPayloadVault(
  'fixture-only',
  new Map([['fixture-only', randomBytes(32)]]),
);
function transaction(currentPool: Pool): PaymentTransaction {
  return async (work) => {
    const client = await currentPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE nanoclaw_admin');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };
}

try {
  const local = await maintenance.query('SELECT inet_server_addr() AS address');
  if (local.rows[0].address !== null)
    throw new Error('nonlocal database refused');
  if (
    (
      await maintenance.query(
        "SELECT rolname FROM pg_roles WHERE rolname='nanoclaw_admin'",
      )
    ).rows.length !== 1
  )
    throw new Error('existing admin role unavailable');
  await maintenance.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
  created = true;
  pool = new Pool({ ...config, database });
  await pool.query('CREATE SCHEMA business_v2 AUTHORIZATION nanoclaw_admin');
  await pool.query(
    readFileSync(
      new URL(
        '../data/business/migrations/nanoclaw-v2/149_payment_attempt_store.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const now = Date.now();
  const attempt = createPaymentAttempt({
    attemptId: randomUUID(),
    now,
    scope: {
      provider: 'adyen',
      environment: 'test',
      company: 'SoleraMerchantServices',
      merchant: env.TANDEM_ADYEN_TEST_MERCHANT_ACCOUNT,
      store: env.TANDEM_ADYEN_TEST_STORE_REFERENCE,
      endpointRegion: 'eu',
    },
    quote: {
      schemaVersion: 1,
      quoteId: randomUUID(),
      authority: 'wordpress:test',
      offerKey: 'mcq-program-a-foundations',
      catalogVersion: createHash('sha256').update(catalogBytes).digest('hex'),
      bundleVersion: 'unpublished-foundations-test-v1',
      deliveryVersion: 'unpublished-foundations-test-v1',
      locale: 'en',
      country: 'US',
      payerReference: null,
      participantReference: null,
      currency: 'USD',
      originalAmount: product.price_cents,
      discountAmount: 0,
      finalAmount: product.price_cents,
      discountPolicyReference: null,
      redemptionReference: null,
      paymentOption: 'one_time',
      termsVersion: terms,
      consentReceipt: 'test-fixture:no-customer',
      acceptedAt: now,
      createdAt: now,
      expiresAt: now + 1800000,
    },
  });
  const transport: typeof fetch = async (url, options) => {
    providerCalls++;
    const response = await fetch(url, options);
    providerStatuses.push(response.status);
    return response;
  };
  const adapter = new AdyenTestSessionAdapter(
    env.TANDEM_ADYEN_TEST_API_KEY,
    transport,
  );
  const routing = {
    scope: attempt.scope,
    allowedOrigin: env.TANDEM_ADYEN_TEST_ALLOWED_ORIGIN,
    returnPath: '/',
  };
  let service = new PaymentSessionService(
    new PaymentStore(transaction(pool), vault),
    adapter,
    routing,
    ['mcq-program-a-foundations:en'],
  );
  phase = 'test_session_create';
  const started = await service.start(attempt);
  if (started.state !== 'checkout_ready')
    throw new Error(
      `TEST session not ready; statuses=${providerStatuses.join(',')}`,
    );
  phase = 'pool_reopen';
  await pool.end();
  pool = new Pool({ ...config, database });
  service = new PaymentSessionService(
    new PaymentStore(transaction(pool), vault),
    adapter,
    routing,
    [],
  );
  const resumed = await service.resume(attempt);
  if (
    resumed.state !== 'checkout_ready' ||
    JSON.stringify(resumed.session) !== JSON.stringify(started.session) ||
    providerCalls !== 1
  )
    throw new Error('durable session reuse failed');
  phase = 'durable_readback';
  const counts = (
    await pool.query(`SELECT
    (SELECT count(*) FROM business_v2.payment_attempts) AS attempts,
    (SELECT count(*) FROM business_v2.payment_operations) AS operations,
    (SELECT count(*) FROM business_v2.payment_operation_receipts) AS receipts`)
  ).rows[0];
  const stored = (
    await pool.query(
      'SELECT encrypted_request,encrypted_response FROM business_v2.payment_operations',
    )
  ).rows[0];
  if (JSON.stringify(stored).includes(started.session.sessionData))
    throw new Error('unencrypted session response refused');
  proof = {
    environment: 'test',
    offer: attempt.quote.offerKey,
    amount: 29900,
    currency: 'USD',
    attemptId: attempt.attemptId,
    providerCalls,
    providerStatuses,
    counts,
    poolReopenReusedExactSession: true,
    sessionIdSha256: createHash('sha256')
      .update(started.session.id)
      .digest('hex'),
    sessionExpiresAt: started.session.expiresAt,
    encryptedAtRest: true,
    paymentAuthorized: false,
    webhookVerified: false,
    enrollmentChanged: false,
    providerSessionUnused: true,
  };
} catch {
  // Never emit provider payloads, session tokens, keys, connection details or SQL values.
  process.exitCode = 1;
  process.stderr.write(
    JSON.stringify({
      error: 'test_session_proof_failed',
      phase,
      providerCalls,
      providerStatuses,
      paymentAttempted: false,
    }) + '\n',
  );
} finally {
  await pool?.end();
  try {
    if (created) {
      await maintenance.query(`DROP DATABASE "${database}" WITH (FORCE)`);
      if (
        (
          await maintenance.query(
            'SELECT datname FROM pg_database WHERE datname=$1',
            [database],
          )
        ).rows.length !== 0
      )
        throw new Error('generated database cleanup failed');
    }
  } finally {
    await maintenance.end();
  }
}
if (proof && process.exitCode !== 1)
  process.stdout.write(
    JSON.stringify({ ...proof, generatedDatabaseRemoved: true }) + '\n',
  );
