import { createHash, hkdfSync, randomUUID } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:https';
import { userInfo } from 'node:os';
import { resolve } from 'node:path';

import { Pool } from 'pg';
import { z } from 'zod';

import { resolveCheckoutCustomerIdentityWithClient } from './checkout-customer-identity.js';
import { ADYEN_CARD_EVENT_CODES } from './adyen-environment.js';
import { liveMcsProviderOptimization } from './payment-live-runtime.js';
import { PaymentDomainError, type PaymentScope } from './payment-domain.js';
import type { PaymentTransaction } from './payment-store.js';
import { createWebsiteCheckoutTestService } from './website-checkout-test-service.js';
import {
  RegisteredHeartbeatToolboxRunner,
  type HeartbeatTestAccessConfig,
} from './website-checkout-heartbeat-test-delivery.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const ref = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_:.\/-]+$/);
export const WEBSITE_CHECKOUT_TEST_ATTRIBUTION_FIELD_MAPS = Object.freeze({
  legacy_v1: Object.freeze({
    id: 'checkout-attribution-fields-v1',
    sha256: '49194295ed5d5a415d3d02d6e0c14bd9d772c54f4d9dd66d9ea226f0ef7fedfc',
  }),
  english_mcs_card_v2: Object.freeze({
    id: 'checkout-attribution-fields-en-mcs-card-v2',
    sha256: '0d7fbf7d6c3b548e7ba6cf3249418e50f14fb315d1dfee5cc597a4c748a8456e',
  }),
});
export type WebsiteCheckoutTestAttributionProfile =
  keyof typeof WEBSITE_CHECKOUT_TEST_ATTRIBUTION_FIELD_MAPS;
export const WEBSITE_CHECKOUT_TEST_EVENT_CODES = ADYEN_CARD_EVENT_CODES;
const privateConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    mode: z.literal('test'),
    root: z.string().min(1).max(1024),
    requestKey: digest,
    responseKey: digest,
    encryptionKey: digest,
    adyen: z
      .object({
        environment: z.literal('test'),
        apiKey: z.string().min(1).max(512),
        company: ref,
        merchant: ref,
        store: ref,
        storeId: ref,
        webhookConfigured: z.boolean(),
        webhookHmacKey: digest.nullable().optional(),
      })
      .passthrough(),
    backend: z
      .object({
        caller: z.literal('tandem-wordpress-test'),
        checkoutProfile: z
          .enum(['protected_preview', 'public_anonymous'])
          .default('protected_preview'),
        attributionProfile: z
          .enum(['legacy_v1', 'english_mcs_card_v2'])
          .default('legacy_v1'),
        requestKeyId: z.literal('wordpress-request-v1'),
        responseKeyId: z.literal('nanoclaw-response-v1'),
        quoteAuthority: z.literal('tandem-wordpress-commerce-v1'),
        cardCaptureConfigurationEvidence: ref.nullable(),
        enrollmentTerms: z
          .object({ version: ref, contentSha256: digest })
          .strict(),
        privacy: z.object({ version: ref, contentSha256: digest }).strict(),
        promotionPolicyReferences: z.array(ref).max(100),
        heartbeatAccess: z
          .discriminatedUnion('enabled', [
            z.object({ enabled: z.literal(false) }).strict(),
            z
              .object({
                enabled: z.literal(true),
                email: z.literal('test@tandemcoach.co'),
                userId: z.literal('97f4285a-18d4-44a9-961d-17e582aa278f'),
                groupId: z.literal('4c54983c-0e7b-4dd0-aebc-0f0cb1c82298'),
                courseId: z.literal('abd312e4-b01a-4718-8918-f79d081753c0'),
                cohortId: z.literal('f2a36eca-a017-4536-9b83-368f51219895'),
              })
              .strict(),
          ])
          .default({ enabled: false }),
      })
      .strict(),
  })
  .passthrough();

export interface WebsiteCheckoutPrivateConfig {
  root: string;
  caller: string;
  checkoutProfile: 'protected_preview' | 'public_anonymous';
  attributionProfile: WebsiteCheckoutTestAttributionProfile;
  requestKeyId: string;
  responseKeyId: string;
  quoteAuthority: 'tandem-wordpress-commerce-v1';
  cardCaptureConfigurationEvidence: string | null;
  requestKey: Buffer;
  responseKey: Buffer;
  encryptionKey: Buffer;
  scope: PaymentScope;
  adyenApiKey: string;
  webhookHmacKey: string | null;
  enrollmentTerms: { version: string; contentSha256: string };
  privacy: { version: string; contentSha256: string };
  promotionPolicyReferences: readonly string[];
  heartbeatAccess: { enabled: false } | HeartbeatTestAccessConfig;
}

export function websiteCheckoutTestReturnPath(
  profile: WebsiteCheckoutPrivateConfig['checkoutProfile'],
): '/checkout/preview/return/' | '/checkout/mcs-foundations/return/' {
  return profile === 'public_anonymous'
    ? '/checkout/mcs-foundations/return/'
    : '/checkout/preview/return/';
}

const migrations = [
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
  '142_student_enrollment_dark_foundation.sql',
  '143_academy_capacity_dark.sql',
  '146_student_enrollment_store_contract.sql',
  '147_student_enrollment_writer_claims.sql',
  '148_student_enrollment_projection_foundation.sql',
  '149_payment_attempt_store.sql',
  '150_payment_request_admission.sql',
  '151_payment_event_ledger.sql',
  '152_payment_method_reconciliation.sql',
  '153_website_checkout_provisional_finance.sql',
  '154_payment_identity_preparation.sql',
  '161_payment_checkout_billing_profile.sql',
  '162_payment_provider_optimization_evidence.sql',
  '155_website_checkout_admission_evidence.sql',
  '156_website_checkout_attribution_admission.sql',
  '157_payment_webhook_method_evidence.sql',
  '159_payment_terminal_card_retry.sql',
] as const;

const databaseName = /^nc_student_enrollment_store_[a-f0-9]{32}$/;
const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    database: z.string().regex(databaseName),
    state: z.enum(['initializing', 'ready']),
    configurationSha256: digest,
  })
  .strict();
type RuntimeManifest = z.infer<typeof manifestSchema>;

function safePrivateFile(path: string, requireOwnerOnly: boolean): void {
  const stat = statSync(path);
  const permissions = stat.mode & 0o777;
  if (
    !stat.isFile() ||
    (requireOwnerOnly && permissions !== 0o600) ||
    (!requireOwnerOnly && (permissions & 0o022) !== 0)
  )
    throw new PaymentDomainError('unsafe_website_checkout_private_file');
}

export function parseWebsiteCheckoutPrivateConfig(
  path: string,
): WebsiteCheckoutPrivateConfig {
  const absolute = resolve(path);
  safePrivateFile(absolute, true);
  let parsed: z.infer<typeof privateConfigSchema>;
  try {
    parsed = privateConfigSchema.parse(
      JSON.parse(readFileSync(absolute, 'utf8')),
    );
  } catch {
    throw new PaymentDomainError('invalid_website_checkout_private_config');
  }
  const root = resolve(parsed.root);
  if (!absolute.startsWith(`${root}/private/`))
    throw new PaymentDomainError('invalid_website_checkout_private_config');
  const requestKey = Buffer.from(parsed.requestKey, 'hex');
  const responseKey = Buffer.from(parsed.responseKey, 'hex');
  const encryptionKey = Buffer.from(parsed.encryptionKey, 'hex');
  if (
    [requestKey, responseKey, encryptionKey].some(
      (value) => value.length !== 32,
    ) ||
    new Set([
      parsed.requestKey,
      parsed.responseKey,
      parsed.encryptionKey,
      ...(parsed.adyen.webhookHmacKey ? [parsed.adyen.webhookHmacKey] : []),
    ]).size !== (parsed.adyen.webhookHmacKey ? 4 : 3) ||
    parsed.adyen.webhookConfigured !==
      (typeof parsed.adyen.webhookHmacKey === 'string') ||
    new Set(parsed.backend.promotionPolicyReferences).size !==
      parsed.backend.promotionPolicyReferences.length
  )
    throw new PaymentDomainError('invalid_website_checkout_private_config');
  return Object.freeze({
    root,
    caller: parsed.backend.caller,
    checkoutProfile: parsed.backend.checkoutProfile,
    attributionProfile: parsed.backend.attributionProfile,
    requestKeyId: parsed.backend.requestKeyId,
    responseKeyId: parsed.backend.responseKeyId,
    quoteAuthority: parsed.backend.quoteAuthority,
    cardCaptureConfigurationEvidence:
      parsed.backend.cardCaptureConfigurationEvidence,
    requestKey,
    responseKey,
    encryptionKey,
    scope: Object.freeze({
      provider: 'adyen' as const,
      environment: 'test' as const,
      company: parsed.adyen.company,
      merchant: parsed.adyen.merchant,
      store: parsed.adyen.store,
      endpointRegion: 'eu' as const,
    }),
    adyenApiKey: parsed.adyen.apiKey,
    webhookHmacKey: parsed.adyen.webhookHmacKey ?? null,
    enrollmentTerms: Object.freeze(parsed.backend.enrollmentTerms),
    privacy: Object.freeze(parsed.backend.privacy),
    promotionPolicyReferences: Object.freeze([
      ...parsed.backend.promotionPolicyReferences,
    ]),
    heartbeatAccess: Object.freeze(parsed.backend.heartbeatAccess),
  });
}

function derive(root: Buffer, label: string): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      root,
      Buffer.from('nc003-website-checkout-test-v1'),
      Buffer.from(label),
      32,
    ),
  );
}

function manifestPath(config: WebsiteCheckoutPrivateConfig): string {
  return `${config.root}/private/website-checkout-test-runtime-manifest.json`;
}

function configurationSha256(
  config: WebsiteCheckoutPrivateConfig,
  includeCheckoutProfile = true,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        caller: config.caller,
        ...(includeCheckoutProfile
          ? { checkoutProfile: config.checkoutProfile }
          : {}),
        ...(config.attributionProfile === 'english_mcs_card_v2'
          ? {
              attributionProfile: config.attributionProfile,
              attributionFieldMap:
                WEBSITE_CHECKOUT_TEST_ATTRIBUTION_FIELD_MAPS[
                  config.attributionProfile
                ],
            }
          : {}),
        requestKeyId: config.requestKeyId,
        responseKeyId: config.responseKeyId,
        quoteAuthority: config.quoteAuthority,
        requestKeySha256: createHash('sha256')
          .update(config.requestKey)
          .digest('hex'),
        responseKeySha256: createHash('sha256')
          .update(config.responseKey)
          .digest('hex'),
        encryptionKeySha256: createHash('sha256')
          .update(config.encryptionKey)
          .digest('hex'),
        adyenApiKeySha256: createHash('sha256')
          .update(config.adyenApiKey)
          .digest('hex'),
        webhookKeySha256:
          config.webhookHmacKey === null
            ? null
            : createHash('sha256')
                .update(Buffer.from(config.webhookHmacKey, 'hex'))
                .digest('hex'),
        scope: config.scope,
        enrollmentTerms: config.enrollmentTerms,
        privacy: config.privacy,
        promotionPolicyReferences: config.promotionPolicyReferences,
        cardCaptureConfigurationEvidence:
          config.cardCaptureConfigurationEvidence,
        heartbeatAccess: config.heartbeatAccess,
      }),
    )
    .digest('hex');
}

export const websiteCheckoutTestConfigurationSha256 = configurationSha256;

function readManifest(path: string): RuntimeManifest {
  safePrivateFile(path, true);
  try {
    return manifestSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    throw new PaymentDomainError('unsafe_website_checkout_database_manifest');
  }
}

function writeManifest(
  path: string,
  value: RuntimeManifest,
  exclusive: boolean,
): void {
  const body = `${JSON.stringify(value)}\n`;
  if (exclusive) {
    writeFileSync(path, body, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    return;
  }
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, body, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function switchWebsiteCheckoutTestProfile(
  configPath: string,
  from: WebsiteCheckoutPrivateConfig['checkoutProfile'],
  to: WebsiteCheckoutPrivateConfig['checkoutProfile'],
): { database: string; from: typeof from; to: typeof to } {
  const config = parseWebsiteCheckoutPrivateConfig(configPath);
  if (config.checkoutProfile !== to)
    throw new PaymentDomainError(
      'website_checkout_profile_switch_target_mismatch',
    );
  const runtimeManifestPath = manifestPath(config);
  if (!existsSync(runtimeManifestPath))
    throw new PaymentDomainError('website_checkout_database_manifest_missing');
  const manifest = readManifest(runtimeManifestPath);
  if (manifest.state !== 'ready')
    throw new PaymentDomainError(
      'website_checkout_database_initialization_incomplete',
    );
  const sourceConfig = { ...config, checkoutProfile: from };
  const expectedHashes = [configurationSha256(sourceConfig)];
  if (from === 'protected_preview')
    expectedHashes.push(configurationSha256(sourceConfig, false));
  if (!expectedHashes.includes(manifest.configurationSha256))
    throw new PaymentDomainError(
      'website_checkout_profile_switch_source_mismatch',
    );
  const backupPath = `${runtimeManifestPath}.before-profile-${from}-to-${to}-${manifest.configurationSha256}.json`;
  writeManifest(backupPath, manifest, true);
  writeManifest(
    runtimeManifestPath,
    {
      ...manifest,
      configurationSha256: configurationSha256(config),
    },
    false,
  );
  return { database: manifest.database, from, to };
}

export function switchWebsiteCheckoutTestAttributionProfile(
  configPath: string,
  from: WebsiteCheckoutTestAttributionProfile,
  to: WebsiteCheckoutTestAttributionProfile,
): { database: string; from: typeof from; to: typeof to } {
  const config = parseWebsiteCheckoutPrivateConfig(configPath);
  if (from === to || config.attributionProfile !== to)
    throw new PaymentDomainError(
      'website_checkout_attribution_switch_target_mismatch',
    );
  const runtimeManifestPath = manifestPath(config);
  if (!existsSync(runtimeManifestPath))
    throw new PaymentDomainError('website_checkout_database_manifest_missing');
  const manifest = readManifest(runtimeManifestPath);
  if (manifest.state !== 'ready')
    throw new PaymentDomainError(
      'website_checkout_database_initialization_incomplete',
    );
  const sourceConfig = { ...config, attributionProfile: from };
  if (manifest.configurationSha256 !== configurationSha256(sourceConfig))
    throw new PaymentDomainError(
      'website_checkout_attribution_switch_source_mismatch',
    );
  const backupPath = `${runtimeManifestPath}.before-attribution-${from}-to-${to}-${manifest.configurationSha256}.json`;
  writeManifest(backupPath, manifest, true);
  writeManifest(
    runtimeManifestPath,
    {
      ...manifest,
      configurationSha256: configurationSha256(config),
    },
    false,
  );
  return { database: manifest.database, from, to };
}

async function verifyReusableDatabase(
  maintenance: Pool,
  database: string,
): Promise<void> {
  const owner = await maintenance.query(
    `SELECT datname,pg_get_userbyid(datdba) owner,datallowconn
     FROM pg_database WHERE datname=$1`,
    [database],
  );
  if (
    owner.rowCount !== 1 ||
    owner.rows[0].owner !== userInfo().username ||
    owner.rows[0].datallowconn !== true
  )
    throw new PaymentDomainError('unsafe_website_checkout_database');
}

function migrationSql(name: string): string {
  return readFileSync(
    new URL(`../data/business/migrations/nanoclaw-v2/${name}`, import.meta.url),
    'utf8',
  );
}

export async function startWebsiteCheckoutTestService(input: {
  configPath: string;
  host?: '127.0.0.1';
  port?: number;
}): Promise<{
  database: string;
  port: number;
  stop: () => Promise<void>;
}> {
  const config = parseWebsiteCheckoutPrivateConfig(input.configPath);
  const host = input.host ?? '127.0.0.1';
  const port = input.port ?? 3443;
  if (
    host !== '127.0.0.1' ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535
  )
    throw new PaymentDomainError('invalid_website_checkout_listener');
  const tlsKeyPath = `${config.root}/private/localhost.key`;
  const tlsCertificatePath = `${config.root}/private/localhost.crt`;
  safePrivateFile(tlsKeyPath, true);
  safePrivateFile(tlsCertificatePath, false);
  const runtimeManifestPath = manifestPath(config);
  const configSha256 = configurationSha256(config);
  let database: string;
  let initialize = false;
  if (existsSync(runtimeManifestPath)) {
    const manifest = readManifest(runtimeManifestPath);
    if (manifest.state !== 'ready')
      throw new PaymentDomainError(
        'website_checkout_database_initialization_incomplete',
      );
    if (manifest.configurationSha256 !== configSha256)
      throw new PaymentDomainError(
        'website_checkout_configuration_manifest_mismatch',
      );
    database = manifest.database;
  } else {
    database = `nc_student_enrollment_store_${randomUUID().replaceAll('-', '')}`;
    writeManifest(
      runtimeManifestPath,
      {
        schemaVersion: 1,
        database,
        state: 'initializing',
        configurationSha256: configSha256,
      },
      true,
    );
    initialize = true;
  }
  const maintenance = new Pool({
    host: '/tmp',
    port: 5432,
    user: userInfo().username,
    database: 'postgres',
    ssl: false,
    options: '-c search_path=pg_catalog',
    connectionTimeoutMillis: 2000,
    max: 1,
  });
  let pool: Pool | null = null;
  let server: Server | null = null;
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    if (server)
      await new Promise<void>((resolveStop) =>
        server!.close(() => resolveStop()),
      );
    if (pool) await pool.end();
    await maintenance.end();
  };
  try {
    const serverIdentity = await maintenance.query(
      `SELECT inet_server_addr() address,
        current_setting('server_version_num')::int version`,
    );
    if (
      serverIdentity.rows[0]?.address !== null ||
      Number(serverIdentity.rows[0]?.version) < 160000
    )
      throw new PaymentDomainError('unsafe_website_checkout_database');
    const admin = await maintenance.query(
      "SELECT 1 FROM pg_roles WHERE rolname='nanoclaw_admin'",
    );
    if (admin.rowCount !== 1)
      throw new PaymentDomainError('unsafe_website_checkout_database');
    if (initialize)
      await maintenance.query(
        `CREATE DATABASE "${database}" TEMPLATE template0`,
      );
    else await verifyReusableDatabase(maintenance, database);
    pool = new Pool({
      host: '/tmp',
      port: 5432,
      user: userInfo().username,
      database,
      ssl: false,
      options: '-c search_path=pg_catalog',
      connectionTimeoutMillis: 2000,
      max: 12,
    });
    if (initialize) {
      await pool.query('CREATE EXTENSION citext');
      await pool.query(
        'CREATE SCHEMA business_v2 AUTHORIZATION nanoclaw_admin',
      );
      await pool.query(`CREATE FUNCTION business_v2.fn_company_work_append_only()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        RAISE EXCEPTION 'append-only disposable relation';
      END $$;
      ALTER FUNCTION business_v2.fn_company_work_append_only() OWNER TO nanoclaw_admin`);
      for (const migration of migrations)
        await pool.query(migrationSql(migration));
      writeManifest(
        runtimeManifestPath,
        {
          schemaVersion: 1,
          database,
          state: 'ready',
          configurationSha256: configSha256,
        },
        false,
      );
    } else {
      const lineage = await pool.query(
        `SELECT
          to_regclass('business_v2.payment_attempts')::text attempts,
          to_regclass('business_v2.payment_checkout_attribution_admissions')::text attribution,
          pg_get_userbyid(c.relowner) owner
         FROM pg_class c
         JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='business_v2' AND c.relname='payment_attempts'`,
      );
      if (
        lineage.rowCount !== 1 ||
        lineage.rows[0].attempts !== 'business_v2.payment_attempts' ||
        lineage.rows[0].attribution !==
          'business_v2.payment_checkout_attribution_admissions' ||
        lineage.rows[0].owner !== 'nanoclaw_admin'
      )
        throw new PaymentDomainError('unsafe_website_checkout_database');
      const projectionFoundation = await pool.query(
        `SELECT count(*)::int count FROM information_schema.columns
         WHERE table_schema='business_v2'
           AND table_name='student_projection_outbox'
           AND column_name IN ('target_idempotency_key','destination_key',
             'provider_operation_id','last_readback_sha256',
             'uncertain_acceptance','supersedes_outbox_id')`,
      );
      if (Number(projectionFoundation.rows[0]?.count) === 0)
        await pool.query(
          migrationSql('148_student_enrollment_projection_foundation.sql'),
        );
      else if (Number(projectionFoundation.rows[0]?.count) !== 6)
        throw new PaymentDomainError('unsafe_website_checkout_database');
      const webhookMethodEvidence = await pool.query(
        `SELECT count(*)::int count FROM information_schema.columns
         WHERE table_schema='business_v2' AND (
           (table_name='payment_method_bindings'
             AND column_name IN ('source_kind','source_event_id')) OR
           (table_name='payment_enrollment_admissions'
             AND column_name IN ('method_source_kind','method_event_id'))
         )`,
      );
      if (Number(webhookMethodEvidence.rows[0]?.count) === 0)
        await pool.query(
          migrationSql('157_payment_webhook_method_evidence.sql'),
        );
      else if (Number(webhookMethodEvidence.rows[0]?.count) !== 4)
        throw new PaymentDomainError('unsafe_website_checkout_database');
      const terminalRetry = await pool.query(
        `SELECT count(*)::int count FROM information_schema.columns
         WHERE table_schema='business_v2' AND (
           (table_name='payment_operations' AND column_name IN
             ('session_sequence','predecessor_operation_id','retry_terminal_receipt_sha256')) OR
           (table_name='payment_session_result_operations' AND column_name IN
             ('payment_operation_id','session_sequence','terminal_status')) OR
           (table_name='payment_events' AND column_name IN
             ('payment_operation_id','session_sequence')) OR
           (table_name='payment_provider_references' AND column_name IN
             ('payment_operation_id','session_sequence'))
         )`,
      );
      if (Number(terminalRetry.rows[0]?.count) === 0)
        await pool.query(migrationSql('159_payment_terminal_card_retry.sql'));
      else if (Number(terminalRetry.rows[0]?.count) !== 10)
        throw new PaymentDomainError('unsafe_website_checkout_database');
    }
    const transaction: PaymentTransaction = async (work) => {
      const client = await pool!.connect();
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
    const publication = JSON.parse(
      readFileSync(
        new URL(
          '../facts/generated/student-foundations-publication-v1.scoped.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const service = createWebsiteCheckoutTestService(
      {
        payment: {
          mode: 'test',
          caller: config.caller,
          scope: config.scope,
          quoteAuthorities: [config.quoteAuthority],
          recoveryOfferLocales: ['mcq-program-a-foundations:en-US'],
          newAttemptOfferLocales: ['mcq-program-a-foundations:en-US'],
          paymentMethodCapabilities: ['card'],
          recoveryMode: 'dispatch',
          requestKeys: new Map([
            [
              config.requestKeyId,
              { caller: config.caller, secret: config.requestKey },
            ],
          ]),
          signedResponses: {
            keyId: config.responseKeyId,
            key: { caller: config.caller, secret: config.responseKey },
          },
          payloadKeyId: 'staging-payload-v1',
          payloadKeys: new Map([
            ['staging-payload-v1', derive(config.encryptionKey, 'payload')],
          ]),
          returnBindingKey: derive(
            config.encryptionKey,
            'session-return-binding',
          ),
          adyenApiKey: config.adyenApiKey,
          sessionRouting: {
            allowedOrigin: 'http://localhost:3000',
            returnPath: websiteCheckoutTestReturnPath(config.checkoutProfile),
          },
          providerOptimization: liveMcsProviderOptimization(),
          webhook:
            config.webhookHmacKey === null
              ? null
              : {
                  hmacKeys: [config.webhookHmacKey],
                  merchantAccount: config.scope.merchant,
                  storeReference: config.scope.store!,
                  referencePrefix: 'tandem-poc-tsv1-',
                  allowedEventCodes: [...WEBSITE_CHECKOUT_TEST_EVENT_CODES],
                  retainVerifiedOwnedUnsupported: true,
                },
          webhookMethodEvidence:
            config.checkoutProfile === 'public_anonymous'
              ? 'card_scope_webhook'
              : 'session_result_only',
          limits: {
            requestsPerWindow: 300,
            maxActive: 8,
            windowMs: 60000,
            maxBodyBytes: 100000,
            bodyReadTimeoutMs: 5000,
          },
        },
        identitySecret: derive(config.encryptionKey, 'identity').toString(
          'hex',
        ),
        identityTokenSecret: derive(config.encryptionKey, 'identity-token'),
        identityReferenceSecret: derive(
          config.encryptionKey,
          'identity-reference',
        ),
        checkoutEvidenceSecret: derive(
          config.encryptionKey,
          'checkout-evidence',
        ),
        attributionFieldMap:
          WEBSITE_CHECKOUT_TEST_ATTRIBUTION_FIELD_MAPS[
            config.attributionProfile
          ],
        promotionPolicyReferences: config.promotionPolicyReferences,
        checkoutDocumentPolicies: [
          {
            kind: 'enrollment_terms',
            ...config.enrollmentTerms,
            effectiveFrom: 0,
            effectiveTo: null,
          },
          {
            kind: 'privacy',
            ...config.privacy,
            effectiveFrom: 0,
            effectiveTo: null,
          },
        ],
        publication,
        publicationPin: {
          publicationId: 'student-foundations-publication-v1',
          publicationRevision: 1,
          payloadSha256:
            '430f11c7cc8299621abb59b4ea0cca29209de6143277f6145d616060da22b9c0',
        },
        cardCaptureConfigurationEvidence:
          config.cardCaptureConfigurationEvidence,
        heartbeatAccess: config.heartbeatAccess,
      },
      {
        pool,
        transaction,
        identityResolver: resolveCheckoutCustomerIdentityWithClient,
        heartbeatToolbox: config.heartbeatAccess.enabled
          ? new RegisteredHeartbeatToolboxRunner()
          : undefined,
      },
    );
    server = createServer(
      {
        key: readFileSync(tlsKeyPath),
        cert: readFileSync(tlsCertificatePath),
        minVersion: 'TLSv1.2',
      },
      service.http.handle,
    );
    server.maxConnections = 32;
    server.headersTimeout = 10000;
    server.requestTimeout = 15000;
    server.keepAliveTimeout = 5000;
    await new Promise<void>((resolveListen, reject) => {
      const onError = (error: Error) => reject(error);
      server!.once('error', onError);
      server!.listen(port, host, () => {
        server!.off('error', onError);
        resolveListen();
      });
    });
    writeManifest(
      runtimeManifestPath,
      {
        schemaVersion: 1,
        database,
        state: 'ready',
        configurationSha256: configSha256,
      },
      false,
    );
    server.on('error', () => void stop());
    return { database, port, stop };
  } catch (error) {
    await stop().catch(() => undefined);
    throw error;
  }
}

/** Explicit bounded cleanup; ordinary service stop intentionally preserves state. */
export async function cleanupWebsiteCheckoutTestService(
  configPath: string,
): Promise<{ database: string }> {
  const config = parseWebsiteCheckoutPrivateConfig(configPath);
  const runtimeManifestPath = manifestPath(config);
  if (!existsSync(runtimeManifestPath))
    throw new PaymentDomainError('website_checkout_database_manifest_missing');
  const manifest = readManifest(runtimeManifestPath);
  const maintenance = new Pool({
    host: '/tmp',
    port: 5432,
    user: userInfo().username,
    database: 'postgres',
    ssl: false,
    options: '-c search_path=pg_catalog',
    connectionTimeoutMillis: 2000,
    max: 1,
  });
  try {
    const database = manifest.database;
    const owner = await maintenance.query(
      `SELECT pg_get_userbyid(datdba) owner,
        (SELECT count(*)::int FROM pg_stat_activity WHERE datname=$1) connections
       FROM pg_database WHERE datname=$1`,
      [database],
    );
    if (owner.rowCount === 1) {
      if (
        owner.rows[0].owner !== userInfo().username ||
        Number(owner.rows[0].connections) !== 0
      )
        throw new PaymentDomainError('unsafe_website_checkout_database');
      await maintenance.query(`DROP DATABASE "${database}"`);
    }
    unlinkSync(runtimeManifestPath);
    return { database };
  } finally {
    await maintenance.end();
  }
}
