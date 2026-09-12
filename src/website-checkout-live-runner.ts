import { createHash, hkdfSync } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { isAbsolute, resolve } from 'node:path';

import { Pool, type PoolClient } from 'pg';
import { z } from 'zod';

import {
  ADYEN_CARD_EVENT_CODES,
  ADYEN_LIVE_REFERENCE_PREFIX,
} from './adyen-environment.js';
import { resolveCheckoutCustomerIdentityWithClient } from './checkout-customer-identity.js';
import { logger } from './logger.js';
import {
  PaymentChaosObservabilityStore,
  PaymentChaosObservabilityWorker,
} from './payment-chaos-observability.js';
import { PaymentDomainError, type PaymentScope } from './payment-domain.js';
import { PaymentPayloadVault } from './payment-payload-vault.js';
import {
  LIVE_MCS_CARD_CALLER,
  LIVE_MCS_CARD_QUOTE_AUTHORITY,
} from './payment-live-runtime.js';
import {
  PaymentCheckoutDocumentRetentionWorker,
  createCanonicalWebsiteCheckoutDocumentGmail,
  parseWebsiteCheckoutDocumentConfig,
  websiteCheckoutDocumentConfigSchema,
  type WebsiteCheckoutDocumentGmail,
} from './payment-checkout-documents.js';
import type { PaymentTransaction } from './payment-store.js';
import {
  websiteCheckoutActivationReceiptHash,
  type WebsiteCheckoutPublicationActivationReceipt,
} from './website-checkout-enrollment-adapter.js';
import {
  LIVE_FOUNDATIONS_HEARTBEAT_COHORT_ID,
  LIVE_FOUNDATIONS_HEARTBEAT_COURSE_ID,
  LIVE_FOUNDATIONS_HEARTBEAT_GROUP_ID,
} from './website-checkout-heartbeat-live-delivery.js';
import { RegisteredHeartbeatToolboxRunner } from './website-checkout-heartbeat-test-delivery.js';
import { createWebsiteCheckoutLiveService } from './website-checkout-live-service.js';
import { WebsiteCheckoutLiveFulfillmentWorker } from './website-checkout-live-fulfillment-worker.js';
import type { WebsiteCheckoutReceiptWelcomeOwner } from './website-checkout-service.js';
import { createGmailWebsiteCheckoutReceiptWelcomeOwner } from './website-checkout-customer-notices.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const ref = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_:.\/-]+$/);
const absolutePath = z.string().min(1).max(1024).refine(isAbsolute);
const senderHeader = z
  .string()
  .min(3)
  .max(320)
  .refine((value) => {
    if (/[\r\n]/u.test(value)) return false;
    const trimmed = value.trim();
    const address = (trimmed.match(/<([^<>]+)>$/u)?.[1] ?? trimmed)
      .trim()
      .toLowerCase();
    return z.email().safeParse(address).success;
  });
const activationReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    environment: z.literal('live'),
    status: z.literal('accepted'),
    caller: z.literal(LIVE_MCS_CARD_CALLER),
    publicationId: z.literal('student-foundations-publication-v1'),
    publicationRevision: z.number().int().positive(),
    publicationPayloadSha256: digest,
    offerLocale: z.literal('mcq-program-a-foundations:en-US'),
    decisionReference: ref,
    approvedAt: z.iso.datetime({ offset: true }),
    receiptSha256: digest,
  })
  .strict();

const privateConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    mode: z.literal('live'),
    purpose: z.literal('website-checkout-live-v1'),
    requestKey: digest,
    responseKey: digest,
    encryptionKey: digest,
    listener: z
      .object({
        host: z.literal('127.0.0.1'),
        port: z.number().int().min(1024).max(65535),
      })
      .strict(),
    database: z
      .object({
        host: z.string().min(1).max(255),
        port: z.number().int().min(1).max(65535),
        name: ref,
        user: ref,
        ssl: z.enum(['require', 'disable']),
        role: z.literal('nanoclaw_admin'),
        schemaContract: z.enum([
          'nanoclaw-v2:148,149-159',
          'nanoclaw-v2:148,149-160',
          'nanoclaw-v2:148,149-161',
          'nanoclaw-v2:148,149-162',
          'nanoclaw-v2:148,149-163',
          'nanoclaw-v2:148,149-164',
        ]),
      })
      .strict(),
    adyen: z
      .object({
        environment: z.literal('live'),
        endpointPrefix: z
          .string()
          .min(1)
          .max(49)
          .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/),
        apiKey: z.string().min(1).max(512),
        company: ref,
        merchant: ref,
        store: ref,
        webhookHmacKey: digest,
      })
      .strict(),
    backend: z
      .object({
        caller: z.literal(LIVE_MCS_CARD_CALLER),
        requestKeyId: z.string().regex(/^live-request-[A-Za-z0-9_-]{1,40}$/),
        responseKeyId: z.string().regex(/^live-response-[A-Za-z0-9_-]{1,40}$/),
        quoteAuthority: z.literal(LIVE_MCS_CARD_QUOTE_AUTHORITY),
        allowedOrigin: z.url(),
        returnPath: z.string().min(1).max(500).regex(/^\//),
        cardCaptureConfigurationEvidence: ref,
        attributionFieldMap: z.object({ id: ref, sha256: digest }).strict(),
        attributionExternalEmission: z.literal('disabled').default('disabled'),
        enrollmentTerms: z
          .object({ version: ref, contentSha256: digest })
          .strict(),
        privacy: z.object({ version: ref, contentSha256: digest }).strict(),
        promotionPolicyReferences: z.array(ref).max(100),
      })
      .strict(),
    activation: z
      .object({
        serviceEnabled: z.boolean(),
        recoverExisting: z.boolean(),
        newAttemptsEnabled: z.boolean(),
      })
      .strict(),
    publication: z
      .object({
        artifactPath: absolutePath,
        publicationId: z.literal('student-foundations-publication-v1'),
        publicationRevision: z.number().int().positive(),
        payloadSha256: digest,
        activationReceipt: activationReceiptSchema.nullable(),
      })
      .strict(),
    heartbeatAccess: z.discriminatedUnion('enabled', [
      z.object({ enabled: z.literal(false) }).strict(),
      z
        .object({
          enabled: z.literal(true),
          groupId: z.literal(LIVE_FOUNDATIONS_HEARTBEAT_GROUP_ID),
          courseId: z.literal(LIVE_FOUNDATIONS_HEARTBEAT_COURSE_ID),
          cohortId: z.literal(LIVE_FOUNDATIONS_HEARTBEAT_COHORT_ID),
          activationDecisionReference: ref,
          activationApprovedAt: z.iso.datetime({ offset: true }),
          activationReceiptSha256: digest,
        })
        .strict(),
    ]),
    receiptWelcome: z.discriminatedUnion('enabled', [
      z
        .object({ owner: z.literal('unassigned'), enabled: z.literal(false) })
        .strict(),
      z
        .object({
          owner: z.literal('gmail_website_checkout_notices'),
          enabled: z.literal(true),
          caller: z.literal(LIVE_MCS_CARD_CALLER),
          offerLocale: z.literal('mcq-program-a-foundations:en-US'),
          productName: z.literal('Mentor Coaching Foundations'),
          courseUrl: z.url(),
          senderAccount: z.email(),
          senderAddress: senderHeader,
          decisionReference: ref,
          approvedAt: z.iso.datetime({ offset: true }),
          activationReceiptSha256: digest,
        })
        .strict(),
    ]),
    documents: websiteCheckoutDocumentConfigSchema,
    fulfillment: z
      .object({
        pollIntervalMs: z.number().int().min(1000).max(60000),
        batchSize: z.number().int().min(1).max(100),
        excludedAttemptIds: z.array(z.uuid()).max(100).default([]),
      })
      .strict(),
    chaosObservability: z
      .discriminatedUnion('enabled', [
        z.object({ enabled: z.literal(false) }).strict(),
        z
          .object({
            enabled: z.literal(true),
            environment: z.literal('live'),
            endpoint: z.url(),
            webhookToken: z.string().min(32).max(512),
            identityHmacSecret: z.string().min(32).max(512),
            batchSize: z.number().int().min(1).max(100),
            pollIntervalMs: z.number().int().min(1000).max(60000),
          })
          .strict(),
      ])
      .default({ enabled: false }),
  })
  .strict();

type ParsedPrivateConfig = z.infer<typeof privateConfigSchema>;

export interface WebsiteCheckoutLivePrivateConfig extends ParsedPrivateConfig {
  requestKeyBytes: Buffer;
  responseKeyBytes: Buffer;
  encryptionKeyBytes: Buffer;
  scope: PaymentScope;
  publicationArtifact: unknown;
  publicationActivationReceipt: WebsiteCheckoutPublicationActivationReceipt | null;
}

function safePrivateFile(path: string): void {
  const stat = statSync(path);
  if (!stat.isFile() || (stat.mode & 0o777) !== 0o600)
    throw new PaymentDomainError('unsafe_website_checkout_live_private_file');
}

function safePublicArtifact(path: string): void {
  const stat = statSync(path);
  if (!stat.isFile() || (stat.mode & 0o022) !== 0)
    throw new PaymentDomainError('unsafe_website_checkout_live_publication');
}

function heartbeatActivationHash(
  value: ParsedPrivateConfig['heartbeatAccess'],
): string {
  if (!value.enabled) return '';
  return createHash('sha256')
    .update(
      JSON.stringify({
        enabled: true,
        groupId: value.groupId,
        courseId: value.courseId,
        cohortId: value.cohortId,
        activationDecisionReference: value.activationDecisionReference,
        activationApprovedAt: value.activationApprovedAt,
      }),
    )
    .digest('hex');
}

function receiptWelcomeActivationHash(
  value: ParsedPrivateConfig['receiptWelcome'],
): string {
  if (!value.enabled) return '';
  return createHash('sha256')
    .update(
      JSON.stringify({
        owner: value.owner,
        enabled: true,
        caller: value.caller,
        offerLocale: value.offerLocale,
        productName: value.productName,
        courseUrl: value.courseUrl,
        senderAccount: value.senderAccount,
        senderAddress: value.senderAddress,
        decisionReference: value.decisionReference,
        approvedAt: value.approvedAt,
      }),
    )
    .digest('hex');
}

export function parseWebsiteCheckoutLivePrivateConfig(
  path: string,
): WebsiteCheckoutLivePrivateConfig {
  if (!isAbsolute(path))
    throw new PaymentDomainError(
      'invalid_website_checkout_live_private_config',
    );
  const absolute = resolve(path);
  safePrivateFile(absolute);
  let parsed: ParsedPrivateConfig;
  let publicationArtifact: unknown;
  try {
    parsed = privateConfigSchema.parse(
      JSON.parse(readFileSync(absolute, 'utf8')),
    );
    try {
      parsed.documents = parseWebsiteCheckoutDocumentConfig(parsed.documents);
      if (
        parsed.documents.paidInvoice.enabled &&
        parsed.documents.paidInvoice.capturePolicy.evidenceReference !==
          parsed.backend.cardCaptureConfigurationEvidence
      )
        throw new Error('document capture policy mismatch');
    } catch {
      throw new Error('invalid document activation receipt');
    }
    safePublicArtifact(parsed.publication.artifactPath);
    publicationArtifact = JSON.parse(
      readFileSync(parsed.publication.artifactPath, 'utf8'),
    );
  } catch (error) {
    if (error instanceof PaymentDomainError) throw error;
    throw new PaymentDomainError(
      'invalid_website_checkout_live_private_config',
    );
  }
  const keys = [
    parsed.requestKey,
    parsed.responseKey,
    parsed.encryptionKey,
    parsed.adyen.webhookHmacKey,
  ];
  const origin = new URL(parsed.backend.allowedOrigin);
  const courseUrl = parsed.receiptWelcome.enabled
    ? new URL(parsed.receiptWelcome.courseUrl)
    : null;
  const receipt = parsed.publication.activationReceipt;
  if (
    new Set(keys).size !== keys.length ||
    keys.includes(parsed.adyen.apiKey) ||
    origin.protocol !== 'https:' ||
    origin.origin !== parsed.backend.allowedOrigin ||
    origin.username ||
    origin.password ||
    (parsed.receiptWelcome.enabled &&
      (courseUrl?.protocol !== 'https:' ||
        courseUrl.username ||
        courseUrl.password ||
        parsed.receiptWelcome.senderAccount !==
          parsed.receiptWelcome.senderAccount.toLowerCase())) ||
    (parsed.chaosObservability.enabled &&
      (![
        'nanoclaw-v2:148,149-162',
        'nanoclaw-v2:148,149-163',
        'nanoclaw-v2:148,149-164',
      ].includes(parsed.database.schemaContract) ||
        parsed.chaosObservability.webhookToken ===
          parsed.chaosObservability.identityHmacSecret ||
        keys.includes(parsed.chaosObservability.webhookToken) ||
        keys.includes(parsed.chaosObservability.identityHmacSecret))) ||
    (parsed.documents.paidInvoice.enabled &&
      parsed.database.schemaContract !== 'nanoclaw-v2:148,149-164') ||
    (parsed.activation.newAttemptsEnabled &&
      (!parsed.activation.serviceEnabled ||
        !parsed.activation.recoverExisting)) ||
    (parsed.activation.serviceEnabled && !parsed.activation.recoverExisting) ||
    (parsed.activation.serviceEnabled && !receipt) ||
    (receipt !== null &&
      (receipt.receiptSha256 !==
        websiteCheckoutActivationReceiptHash(
          (({ receiptSha256: _ignored, ...value }) => value)(receipt),
        ) ||
        receipt.publicationId !== parsed.publication.publicationId ||
        receipt.publicationRevision !==
          parsed.publication.publicationRevision ||
        receipt.publicationPayloadSha256 !==
          parsed.publication.payloadSha256)) ||
    (parsed.heartbeatAccess.enabled &&
      parsed.heartbeatAccess.activationReceiptSha256 !==
        heartbeatActivationHash(parsed.heartbeatAccess)) ||
    (parsed.receiptWelcome.enabled &&
      parsed.receiptWelcome.activationReceiptSha256 !==
        receiptWelcomeActivationHash(parsed.receiptWelcome)) ||
    (parsed.activation.newAttemptsEnabled &&
      (!parsed.heartbeatAccess.enabled || !parsed.receiptWelcome.enabled)) ||
    new Set(parsed.backend.promotionPolicyReferences).size !==
      parsed.backend.promotionPolicyReferences.length ||
    new Set(parsed.fulfillment.excludedAttemptIds).size !==
      parsed.fulfillment.excludedAttemptIds.length
  )
    throw new PaymentDomainError(
      'invalid_website_checkout_live_private_config',
    );
  return Object.freeze({
    ...parsed,
    requestKeyBytes: Buffer.from(parsed.requestKey, 'hex'),
    responseKeyBytes: Buffer.from(parsed.responseKey, 'hex'),
    encryptionKeyBytes: Buffer.from(parsed.encryptionKey, 'hex'),
    scope: Object.freeze({
      provider: 'adyen' as const,
      environment: 'live' as const,
      company: parsed.adyen.company,
      merchant: parsed.adyen.merchant,
      store: parsed.adyen.store,
      endpointRegion: 'eu' as const,
    }),
    publicationArtifact,
    publicationActivationReceipt: Object.freeze(receipt),
  });
}

const requiredRelations = [
  'student_projection_outbox',
  'student_projection_receipts',
  'payment_attempts',
  'payment_operations',
  'payment_request_nonces',
  'payment_events',
  'payment_method_bindings',
  'payment_session_result_operations',
  'payment_session_terminal_nonpayment_receipts',
  'payment_session_retry_exceptions',
  'student_financial_obligations',
  'payment_identity_preparations',
  'payment_checkout_admission_evidence',
  'payment_checkout_attribution_admissions',
  'payment_enrollment_admissions',
  'website_checkout_customer_notice_jobs',
  'website_checkout_customer_notice_receipts',
  'payment_provider_optimization_evidence',
  'payment_checkout_document_sequences',
  'payment_checkout_documents',
  'payment_checkout_document_capabilities',
  'payment_checkout_document_email_jobs',
  'payment_checkout_document_email_receipts',
  'payment_checkout_document_retention_events',
  'payment_checkout_document_tombstones',
] as const;

export async function verifyWebsiteCheckoutLiveSchema(
  client: Pick<PoolClient, 'query'>,
  expectedDatabase: string,
): Promise<void> {
  const identity = await client.query(
    `SELECT current_database() database,
      EXISTS(SELECT 1 FROM pg_roles WHERE rolname='nanoclaw_admin') role_exists`,
  );
  if (
    identity.rowCount !== 1 ||
    identity.rows[0].database !== expectedDatabase ||
    identity.rows[0].role_exists !== true
  )
    throw new PaymentDomainError('website_checkout_live_schema_mismatch');
  const relations = await client.query(
    `SELECT c.relname,pg_get_userbyid(c.relowner) owner
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='business_v2' AND c.relkind IN ('r','p')
       AND c.relname=ANY($1::text[])`,
    [[...requiredRelations]],
  );
  if (
    relations.rowCount !== requiredRelations.length ||
    new Set(relations.rows.map((row) => row.relname)).size !==
      requiredRelations.length ||
    relations.rows.some((row) => row.owner !== 'nanoclaw_admin')
  )
    throw new PaymentDomainError('website_checkout_live_schema_mismatch');
  const columns = await client.query(
    `SELECT count(*)::int count FROM information_schema.columns
     WHERE table_schema='business_v2' AND (
       (table_name='student_projection_outbox' AND column_name IN
         ('target_idempotency_key','destination_key','provider_operation_id',
          'last_readback_sha256','uncertain_acceptance','supersedes_outbox_id')) OR
       (table_name='payment_checkout_attribution_admissions' AND column_name IN
         ('scope_sha256','caller','attempt_id','checkout_evidence_reference')) OR
       (table_name='payment_identity_preparations' AND column_name IN
         ('caller','preparation_id','participant_party_id','participant_reference',
          'billing_profile_sha256','encrypted_billing_profile')) OR
       (table_name='payment_method_bindings' AND column_name IN
         ('source_kind','source_event_id')) OR
       (table_name='payment_operations' AND column_name IN
         ('session_sequence','predecessor_operation_id','retry_terminal_receipt_sha256')) OR
       (table_name='payment_session_result_operations' AND column_name IN
         ('payment_operation_id','session_sequence','terminal_status')) OR
       (table_name='payment_events' AND column_name IN
         ('payment_operation_id','session_sequence')) OR
       (table_name='payment_provider_references' AND column_name IN
         ('payment_operation_id','session_sequence')) OR
       (table_name='payment_enrollment_admissions' AND column_name IN
         ('method_source_kind','method_event_id')) OR
       (table_name='payment_checkout_documents' AND column_name IN
         ('retention_until','retention_policy_version','amount_minor','currency','attempt_id_sha256'))
     )`,
  );
  if (Number(columns.rows[0]?.count) !== 35)
    throw new PaymentDomainError('website_checkout_live_schema_mismatch');
}

export async function verifyPaymentChaosObservabilitySchema(
  client: Pick<PoolClient, 'query'>,
): Promise<void> {
  const result = await client.query(
    `SELECT c.relname,pg_get_userbyid(c.relowner) owner
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='business_v2' AND c.relkind='r'
       AND c.relname=ANY($1::text[])`,
    [
      [
        'payment_chaos_observability_outbox',
        'payment_chaos_observability_receipts',
      ],
    ],
  );
  if (
    result.rowCount !== 2 ||
    result.rows.some((row) => row.owner !== 'nanoclaw_admin')
  )
    throw new PaymentDomainError('website_checkout_live_schema_mismatch');
}

function derive(root: Buffer, label: string): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      root,
      Buffer.from('website-checkout-live-v1'),
      Buffer.from(label),
      32,
    ),
  );
}

export async function startWebsiteCheckoutLiveService(
  configPath: string,
  injected: {
    pool?: Pool;
    serverFactory?: typeof createServer;
    heartbeatToolbox?: RegisteredHeartbeatToolboxRunner;
    receiptWelcomeOwner?: WebsiteCheckoutReceiptWelcomeOwner;
    documentGmail?: WebsiteCheckoutDocumentGmail;
    chaosTransport?: typeof fetch;
  } = {},
): Promise<{
  host: '127.0.0.1';
  port: number;
  stop: () => Promise<void>;
}> {
  const config = parseWebsiteCheckoutLivePrivateConfig(configPath);
  if (!config.activation.serviceEnabled)
    throw new PaymentDomainError('payment_live_runtime_disabled');
  const pool =
    injected.pool ??
    new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.user,
      ssl:
        config.database.ssl === 'require'
          ? { rejectUnauthorized: true }
          : false,
      options: '-c search_path=pg_catalog',
      connectionTimeoutMillis: 3000,
      max: 12,
    });
  let server: Server | null = null;
  let stopped = false;
  let ready = false;
  let fulfillmentWorker: WebsiteCheckoutLiveFulfillmentWorker | null = null;
  let chaosWorker: PaymentChaosObservabilityWorker | null = null;
  let documentRetentionWorker: PaymentCheckoutDocumentRetentionWorker | null =
    null;
  const guard = async (client: PoolClient) =>
    verifyWebsiteCheckoutLiveSchema(client, config.database.name);
  const transaction: PaymentTransaction = async (work) => {
    const client = await pool.connect();
    try {
      await guard(client);
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
  // Observability schema/transactions are deliberately isolated: an absent or
  // unhealthy optional outbox must never make payment work or readiness fail.
  const observabilityTransaction: PaymentTransaction = async (work) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      await client.query('SET LOCAL ROLE nanoclaw_admin');
      await verifyPaymentChaosObservabilitySchema(client);
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
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    ready = false;
    if (documentRetentionWorker) await documentRetentionWorker.stop();
    if (chaosWorker) await chaosWorker.stop();
    if (fulfillmentWorker) await fulfillmentWorker.stop();
    if (server)
      await new Promise<void>((done) => {
        const timer = setTimeout(() => server!.closeAllConnections?.(), 10000);
        timer.unref();
        server!.close(() => {
          clearTimeout(timer);
          done();
        });
        server!.closeIdleConnections?.();
      });
    await pool.end();
  };
  try {
    const payloadKeyId = 'live-payload-v1';
    const payloadKey = derive(config.encryptionKeyBytes, 'payload');
    const receiptWelcomeOwner = config.receiptWelcome.enabled
      ? (injected.receiptWelcomeOwner ??
        createGmailWebsiteCheckoutReceiptWelcomeOwner(
          {
            enabled: true,
            caller: config.receiptWelcome.caller,
            offerLocale: config.receiptWelcome.offerLocale,
            productName: config.receiptWelcome.productName,
            courseUrl: config.receiptWelcome.courseUrl,
            senderAccount: config.receiptWelcome.senderAccount,
            senderAddress: config.receiptWelcome.senderAddress,
            decisionReference: config.receiptWelcome.decisionReference,
            activationReceiptSha256:
              config.receiptWelcome.activationReceiptSha256,
            scope: config.scope,
            cardCaptureConfigurationEvidence:
              config.backend.cardCaptureConfigurationEvidence,
          },
          { transaction },
        ))
      : undefined;
    const documentGmail = config.receiptWelcome.enabled
      ? (injected.documentGmail ??
        createCanonicalWebsiteCheckoutDocumentGmail(
          config.receiptWelcome.senderAccount,
          config.receiptWelcome.senderAddress,
        ))
      : undefined;
    const service = createWebsiteCheckoutLiveService(
      {
        payment: {
          mode: 'live',
          activation: {
            enabled: config.activation.serviceEnabled,
            recoverExisting: config.activation.recoverExisting,
            newAttemptsEnabled: config.activation.newAttemptsEnabled,
          },
          caller: LIVE_MCS_CARD_CALLER,
          scope: config.scope,
          liveEndpointPrefix: config.adyen.endpointPrefix,
          quoteAuthority: LIVE_MCS_CARD_QUOTE_AUTHORITY,
          recoveryMode: 'dispatch',
          credentials: {
            environment: 'live',
            requestKeys: new Map([
              [
                config.backend.requestKeyId,
                {
                  caller: LIVE_MCS_CARD_CALLER,
                  secret: config.requestKeyBytes,
                },
              ],
            ]),
            signedResponses: {
              keyId: config.backend.responseKeyId,
              key: {
                caller: LIVE_MCS_CARD_CALLER,
                secret: config.responseKeyBytes,
              },
            },
            payloadKeyId,
            payloadKeys: new Map([[payloadKeyId, payloadKey]]),
            returnBindingKey: derive(
              config.encryptionKeyBytes,
              'session-return-binding',
            ),
            adyenApiKey: config.adyen.apiKey,
          },
          sessionRouting: {
            allowedOrigin: config.backend.allowedOrigin,
            returnPath: config.backend.returnPath,
          },
          webhook: {
            environment: 'live',
            hmacKeys: [config.adyen.webhookHmacKey],
            merchantAccount: config.adyen.merchant,
            storeReference: config.adyen.store,
            referencePrefix: ADYEN_LIVE_REFERENCE_PREFIX,
            allowedEventCodes: [...ADYEN_CARD_EVENT_CODES],
            retainVerifiedOwnedUnsupported: true,
            // Shared merchant feed: authenticate the entire batch, then discard
            // foreign signed references in memory before any storage work.
            discardVerifiedForeignReferences: true,
          },
          limits: {
            requestsPerWindow: 300,
            maxActive: 8,
            windowMs: 60000,
            maxBodyBytes: 100000,
            bodyReadTimeoutMs: 5000,
          },
        },
        identitySecret: derive(config.encryptionKeyBytes, 'identity').toString(
          'hex',
        ),
        identityTokenSecret: derive(
          config.encryptionKeyBytes,
          'identity-token',
        ),
        identityReferenceSecret: derive(
          config.encryptionKeyBytes,
          'identity-reference',
        ),
        checkoutEvidenceSecret: derive(
          config.encryptionKeyBytes,
          'checkout-evidence',
        ),
        attributionFieldMap: config.backend.attributionFieldMap,
        promotionPolicyReferences: config.backend.promotionPolicyReferences,
        checkoutDocumentPolicies: [
          {
            kind: 'enrollment_terms',
            ...config.backend.enrollmentTerms,
            effectiveFrom: 0,
            effectiveTo: null,
          },
          {
            kind: 'privacy',
            ...config.backend.privacy,
            effectiveFrom: 0,
            effectiveTo: null,
          },
        ],
        publication: config.publicationArtifact,
        publicationPin: {
          publicationId: config.publication.publicationId,
          publicationRevision: config.publication.publicationRevision,
          payloadSha256: config.publication.payloadSha256,
        },
        publicationActivationReceipt: config.publicationActivationReceipt!,
        cardCaptureConfigurationEvidence:
          config.backend.cardCaptureConfigurationEvidence,
        heartbeatAccess: config.heartbeatAccess.enabled
          ? {
              enabled: true,
              groupId: config.heartbeatAccess.groupId,
              courseId: config.heartbeatAccess.courseId,
              cohortId: config.heartbeatAccess.cohortId,
              cardCaptureConfigurationEvidence:
                config.backend.cardCaptureConfigurationEvidence,
            }
          : { enabled: false },
        receiptWelcome: config.receiptWelcome,
        excludedFulfillmentAttemptIds: config.fulfillment.excludedAttemptIds,
        documents: config.documents,
        documentEncryptionKey: derive(
          config.encryptionKeyBytes,
          'checkout-document-pdf',
        ),
      },
      {
        pool,
        transaction,
        identityResolver: resolveCheckoutCustomerIdentityWithClient,
        heartbeatToolbox: config.heartbeatAccess.enabled
          ? (injected.heartbeatToolbox ??
            new RegisteredHeartbeatToolboxRunner())
          : undefined,
        projectionDatabaseGuard: guard,
        receiptWelcomeOwner,
        documentGmail,
      },
    );
    const client = await pool.connect();
    try {
      await guard(client);
    } finally {
      client.release();
    }
    const serverFactory = injected.serverFactory ?? createServer;
    server = serverFactory(async (request, response) => {
      if (request.url === '/health') {
        response.writeHead(stopped ? 503 : 200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        response.end(
          JSON.stringify({
            status: stopped ? 'stopping' : 'ok',
            service: 'website-checkout-live',
          }),
        );
        return;
      }
      if (request.url === '/ready') {
        try {
          const client = await pool.connect();
          try {
            await guard(client);
          } finally {
            client.release();
          }
          response.writeHead(ready ? 200 : 503, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          });
          response.end(
            JSON.stringify({ status: ready ? 'ready' : 'starting' }),
          );
        } catch {
          response.writeHead(503, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          });
          response.end(JSON.stringify({ status: 'not_ready' }));
        }
        return;
      }
      await service.http.handle(request, response);
    });
    server.maxConnections = 32;
    server.headersTimeout = 10000;
    server.requestTimeout = 15000;
    server.keepAliveTimeout = 5000;
    await new Promise<void>((done, reject) => {
      server!.once('error', reject);
      server!.listen(config.listener.port, config.listener.host, () => {
        server!.off('error', reject);
        done();
      });
    });
    ready = true;
    if (service.documentStore) {
      documentRetentionWorker = new PaymentCheckoutDocumentRetentionWorker(
        config.documents,
        service.documentStore,
        documentGmail,
        undefined,
        (event) =>
          logger.error(event, 'checkout document retention purge held'),
      );
      documentRetentionWorker.start();
    }
    if (config.heartbeatAccess.enabled || receiptWelcomeOwner) {
      fulfillmentWorker = new WebsiteCheckoutLiveFulfillmentWorker(
        pool,
        LIVE_MCS_CARD_CALLER,
        config.scope,
        service,
        guard,
        config.fulfillment.batchSize,
      );
      fulfillmentWorker.start(config.fulfillment.pollIntervalMs);
    }
    if (config.chaosObservability.enabled) {
      const vault = new PaymentPayloadVault(
        payloadKeyId,
        new Map([[payloadKeyId, payloadKey]]),
      );
      chaosWorker = new PaymentChaosObservabilityWorker(
        new PaymentChaosObservabilityStore(
          observabilityTransaction,
          LIVE_MCS_CARD_CALLER,
          config.scope,
          vault,
        ),
        config.chaosObservability,
        injected.chaosTransport,
      );
      chaosWorker.start();
    }
    server.on('error', () => void stop());
    return { host: config.listener.host, port: config.listener.port, stop };
  } catch (error) {
    await stop().catch(() => undefined);
    throw error;
  }
}
