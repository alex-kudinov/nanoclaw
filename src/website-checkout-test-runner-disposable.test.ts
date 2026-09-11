import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';

import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import {
  createPaymentAttempt,
  paymentScopeFingerprint,
  type PaymentScope,
} from './payment-domain.js';
import {
  cleanupWebsiteCheckoutTestService,
  startWebsiteCheckoutTestService,
} from './website-checkout-test-runner.js';

const testKey = `-----BEGIN PRIVATE KEY-----
MIIBeQIBADCCAQMGByqGSM49AgEwgfcCAQEwLAYHKoZIzj0BAQIhAP////8AAAAB
AAAAAAAAAAAAAAAA////////////////MFsEIP////8AAAABAAAAAAAAAAAAAAAA
///////////////8BCBaxjXYqjqT57PrvVV2mIa8ZR0GsMxTsPY7zjw+J9JgSwMV
AMSdNgiG5wSTamZ44ROdJreBn36QBEEEaxfR8uEsQkf4vOblY6RA8ncDfYEt6zOg
9KE5RdiYwpZP40Li/hp/m47n60p8D54WK84zV2sxXs7LtkBoN79R9QIhAP////8A
AAAA//////////+85vqtpxeehPO5ysL8YyVRAgEBBG0wawIBAQQg3ZeZg+OTx/Ud
DVAqg38Db5yK2ctxsJHn4uenPndWR/ChRANCAASDDjPtQEQS3u/y17KcLSz9NmTw
ox0kSEC8nBWaNceeeZ9T5oLOmH7UfaAltULJcGeY/kydKAivozGWLe1hek84
-----END PRIVATE KEY-----
`;
const testCertificate = `-----BEGIN CERTIFICATE-----
MIICDTCCAbICCQCveQAw4VPapzAKBggqhkjOPQQDAjAUMRIwEAYDVQQDDAlsb2Nh
bGhvc3QwHhcNMjYwOTExMDMyNDA5WhcNMjYwOTEyMDMyNDA5WjAUMRIwEAYDVQQD
DAlsb2NhbGhvc3QwggFLMIIBAwYHKoZIzj0CATCB9wIBATAsBgcqhkjOPQEBAiEA
/////wAAAAEAAAAAAAAAAAAAAAD///////////////8wWwQg/////wAAAAEAAAAA
AAAAAAAAAAD///////////////wEIFrGNdiqOpPns+u9VXaYhrxlHQawzFOw9jvO
PD4n0mBLAxUAxJ02CIbnBJNqZnjhE50mt4GffpAEQQRrF9Hy4SxCR/i85uVjpEDy
dwN9gS3rM6D0oTlF2JjClk/jQuL+Gn+bjufrSnwPnhYrzjNXazFezsu2QGg3v1H1
AiEA/////wAAAAD//////////7zm+q2nF56E87nKwvxjJVECAQEDQgAEgw4z7UBE
Et7v8teynC0s/TZk8KMdJEhAvJwVmjXHnnmfU+aCzph+1H2gJbVCyXBnmP5MnSgI
r6Mxli3tYXpPODAKBggqhkjOPQQDAgNJADBGAiEA5KySb+AfZoFm0QU/92FxtzAO
TcPCIiewJFSL4lZA8pYCIQCRty/S2rqVzS1WDyYbLvTkMxobF5yFBNHcLgWxcnk9
OA==
-----END CERTIFICATE-----
`;

const root = mkdtempSync(join(tmpdir(), 'nc003-runner-restart-'));
const privateDirectory = join(root, 'private');
const configPath = join(privateDirectory, 'runtime.json');
const manifestPath = join(
  privateDirectory,
  'website-checkout-test-runtime-manifest.json',
);

const scope: PaymentScope = {
  provider: 'adyen',
  environment: 'test',
  company: 'test-company',
  merchant: 'test-merchant',
  store: 'test-store-reference',
  endpointRegion: 'eu',
};

function config(capture: string | null) {
  return {
    schemaVersion: 1,
    mode: 'test',
    root,
    requestKey: '1'.repeat(64),
    responseKey: '2'.repeat(64),
    encryptionKey: '3'.repeat(64),
    adyen: {
      environment: 'test',
      apiKey: 'synthetic-test-key-never-dispatched',
      company: scope.company,
      merchant: scope.merchant,
      store: scope.store,
      storeId: 'management-store-id-not-checkout',
      webhookConfigured: false,
    },
    backend: {
      caller: 'tandem-wordpress-test',
      requestKeyId: 'wordpress-request-v1',
      responseKeyId: 'nanoclaw-response-v1',
      quoteAuthority: 'tandem-wordpress-commerce-v1',
      cardCaptureConfigurationEvidence: capture,
      enrollmentTerms: {
        version: '2026-09-06',
        contentSha256: '5'.repeat(64),
      },
      privacy: {
        version: 'privacy-current-v1',
        contentSha256: '6'.repeat(64),
      },
      promotionPolicyReferences: ['mcs-promo-v1-005'],
    },
  };
}

async function unusedPort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  await new Promise<void>((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

afterAll(async () => {
  if (existsSync(manifestPath))
    await cleanupWebsiteCheckoutTestService(configPath).catch(() => undefined);
  rmSync(root, { recursive: true, force: true });
});

describe('persistent disposable website checkout TEST runner', () => {
  it('reuses guarded payment state across unchanged restart and cleans only explicitly', async () => {
    mkdirSync(privateDirectory, { mode: 0o700 });
    writeFileSync(join(privateDirectory, 'localhost.key'), testKey, {
      mode: 0o600,
    });
    writeFileSync(join(privateDirectory, 'localhost.crt'), testCertificate, {
      mode: 0o644,
    });
    writeFileSync(configPath, JSON.stringify(config(null)), { mode: 0o600 });

    const first = await startWebsiteCheckoutTestService({
      configPath,
      port: await unusedPort(),
    });
    const firstManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(firstManifest).toMatchObject({
      schemaVersion: 1,
      database: first.database,
      state: 'ready',
    });
    await first.stop();

    const now = Date.now();
    const attempt = createPaymentAttempt({
      attemptId: randomUUID(),
      now,
      scope,
      paymentMethodCapabilities: ['card'],
      quote: {
        schemaVersion: 1,
        quoteId: randomUUID(),
        authority: 'tandem-wordpress-commerce-v1',
        offerKey: 'mcq-program-a-foundations',
        catalogVersion: 'fixture-catalog',
        bundleVersion: 'fixture-bundle',
        deliveryVersion: 'fixture-delivery',
        locale: 'en-US',
        country: 'US',
        payerReference: null,
        participantReference: null,
        currency: 'USD',
        originalAmount: 29900,
        discountAmount: 0,
        finalAmount: 29900,
        discountPolicyReference: null,
        redemptionReference: null,
        paymentOption: 'one_time',
        termsVersion: '2026-09-06',
        consentReceipt: 'consent:v1:restart-fixture',
        acceptedAt: now,
        createdAt: now,
        expiresAt: now + 300000,
      },
    });
    const pool = new Pool({
      host: '/tmp',
      port: 5432,
      user: userInfo().username,
      database: first.database,
      ssl: false,
      options: '-c search_path=pg_catalog',
      max: 1,
    });
    await pool.query('SET ROLE nanoclaw_admin');
    await pool.query(
      readFileSync(
        new URL(
          '../data/business/migrations/nanoclaw-v2/rollback_148_student_enrollment_projection_foundation.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    await pool.query(
      `INSERT INTO business_v2.payment_attempts
       (attempt_id,scope_sha256,quote_id,contract) VALUES($1,$2,$3,$4::jsonb)`,
      [
        attempt.attemptId,
        paymentScopeFingerprint(scope),
        attempt.quote.quoteId,
        JSON.stringify(attempt),
      ],
    );
    await pool.end();

    writeFileSync(configPath, JSON.stringify(config(null)), { mode: 0o600 });
    const second = await startWebsiteCheckoutTestService({
      configPath,
      port: await unusedPort(),
    });
    expect(second.database).toBe(first.database);
    const recovered = new Pool({
      host: '/tmp',
      port: 5432,
      user: userInfo().username,
      database: second.database,
      ssl: false,
      options: '-c search_path=pg_catalog',
      max: 1,
    });
    expect(
      Number(
        (
          await recovered.query(
            'SELECT count(*)::int n FROM business_v2.payment_attempts WHERE attempt_id=$1',
            [attempt.attemptId],
          )
        ).rows[0].n,
      ),
    ).toBe(1);
    expect(
      Number(
        (
          await recovered.query(
            `SELECT count(*)::int n FROM information_schema.columns
             WHERE table_schema='business_v2'
               AND table_name='student_projection_outbox'
               AND column_name IN ('target_idempotency_key','destination_key',
                 'provider_operation_id','last_readback_sha256',
                 'uncertain_acceptance','supersedes_outbox_id')`,
          )
        ).rows[0].n,
      ),
    ).toBe(6);
    await recovered.end();
    const secondManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(secondManifest.database).toBe(first.database);
    expect(secondManifest.configurationSha256).toBe(
      firstManifest.configurationSha256,
    );
    await second.stop();

    const maintenance = new Pool({
      host: '/tmp',
      port: 5432,
      user: userInfo().username,
      database: 'postgres',
      ssl: false,
      options: '-c search_path=pg_catalog',
      max: 1,
    });
    expect(
      Number(
        (
          await maintenance.query(
            'SELECT count(*)::int n FROM pg_database WHERE datname=$1',
            [first.database],
          )
        ).rows[0].n,
      ),
    ).toBe(1);
    await maintenance.end();
    const cleaned = await cleanupWebsiteCheckoutTestService(configPath);
    expect(cleaned.database).toBe(first.database);
    expect(existsSync(manifestPath)).toBe(false);
  });
});
