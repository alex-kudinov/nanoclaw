import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { Pool } from 'pg';

import type { resolveCheckoutCustomerIdentityWithClient } from './checkout-customer-identity.js';
import { PaymentAdmissionStore } from './payment-admission-store.js';
import { PaymentRequestLimiter } from './payment-api-controller.js';
import {
  PaymentCheckoutAdmissionController,
  type WebsiteCheckoutAccessDelivery,
} from './payment-checkout-admission-controller.js';
import { PaymentCheckoutDocumentApiController } from './payment-checkout-document-api-controller.js';
import {
  PaymentCheckoutDocumentOwner,
  PgPaymentCheckoutDocumentAuthorityReader,
  PgPaymentCheckoutDocumentStore,
  type WebsiteCheckoutDocumentConfig,
  type WebsiteCheckoutDocumentGmail,
} from './payment-checkout-documents.js';
import { PaymentCheckoutAdmissionStore } from './payment-checkout-admission-store.js';
import { PaymentCheckoutAttributionStore } from './payment-checkout-attribution-store.js';
import {
  CheckoutAdmissionEvidenceIssuer,
  type CheckoutDocumentPolicy,
} from './payment-checkout-admission.js';
import { PaymentDomainError } from './payment-domain.js';
import { PaymentHttpAdapter } from './payment-http-adapter.js';
import { createPaymentIdentityRuntime } from './payment-identity-runtime.js';
import {
  createPaymentLiveRuntime,
  LIVE_MCS_CARD_CALLER,
  LIVE_MCS_CARD_OFFER_LOCALE,
  type PaymentLiveRuntimeConfig,
} from './payment-live-runtime.js';
import { PaymentPayloadVault } from './payment-payload-vault.js';
import { PaymentPromotionConsumptionReceiptReader } from './payment-promotion-consumption-receipt.js';
import { PaymentRequestAuthenticator } from './payment-request-auth.js';
import {
  PaymentAttemptAcceptanceReceiptReader,
  PaymentResponseSigner,
  PaymentSignedResponseController,
} from './payment-signed-response-controller.js';
import {
  createPaymentTestRuntime,
  type PaymentTestRuntimeConfig,
} from './payment-test-runtime.js';
import {
  ADYEN_LIVE_WEBHOOK_PATH,
  ADYEN_TEST_WEBHOOK_PATH,
  PaymentWebhookHttpAdapter,
} from './payment-test-webhook-http-adapter.js';
import type { PaymentTransaction } from './payment-store.js';
import type { ProjectionDatabaseGuard } from './student-enrollment-projection-store.js';
import {
  WebsiteCheckoutEnrollmentAdapter,
  type WebsiteCheckoutPublicationActivationReceipt,
  type WebsiteCheckoutPublicationPin,
} from './website-checkout-enrollment-adapter.js';

type SignedTestPayment = PaymentTestRuntimeConfig & {
  signedResponses: NonNullable<PaymentTestRuntimeConfig['signedResponses']>;
};

export type WebsiteCheckoutServicePaymentProfile =
  | { environment: 'test'; config: SignedTestPayment }
  | { environment: 'live'; config: PaymentLiveRuntimeConfig };

export interface WebsiteCheckoutServiceConfig {
  profile: WebsiteCheckoutServicePaymentProfile;
  identitySecret: string;
  identityTokenSecret: Buffer;
  identityReferenceSecret: Buffer;
  checkoutEvidenceSecret: Buffer;
  attributionFieldMap: { id: string; sha256: string };
  promotionPolicyReferences: readonly string[];
  checkoutDocumentPolicies: readonly CheckoutDocumentPolicy[];
  publication: unknown;
  publicationPin: WebsiteCheckoutPublicationPin;
  publicationActivationReceipt?: WebsiteCheckoutPublicationActivationReceipt;
  liveNewAttemptPrerequisites?: {
    accessDeliveryOwnerConfigured: true;
    receiptWelcomeOwnerConfigured: true;
  };
  cardCaptureConfigurationEvidence: string | null;
  documents?: WebsiteCheckoutDocumentConfig;
  documentEncryptionKey?: Buffer;
}

export interface WebsiteCheckoutServiceDependencies {
  pool: Pick<Pool, 'connect'>;
  transaction: PaymentTransaction;
  identityResolver?: typeof resolveCheckoutCustomerIdentityWithClient;
  providerTransport?: typeof fetch;
  accessDelivery?: WebsiteCheckoutAccessDelivery;
  receiptWelcomeOwner?: WebsiteCheckoutReceiptWelcomeOwner;
  enrollmentDatabaseGuard?: ProjectionDatabaseGuard;
  excludedFulfillmentAttemptIds?: ReadonlySet<string>;
  documentGmail?: WebsiteCheckoutDocumentGmail;
}

export interface WebsiteCheckoutReceiptWelcomeOwner {
  reconcile(input: {
    attemptId: string;
    idempotencyKey: string;
    enrollment: Awaited<ReturnType<WebsiteCheckoutEnrollmentAdapter['admit']>>;
  }): Promise<{
    state: 'verified' | 'queued' | 'held';
    receiptReference: string | null;
  }>;
}

export async function fulfillWebsiteCheckoutAttempt(
  attemptId: string,
  dependencies: {
    enrollment: Pick<WebsiteCheckoutEnrollmentAdapter, 'admit'>;
    accessDelivery?: WebsiteCheckoutAccessDelivery;
    receiptWelcomeOwner?: WebsiteCheckoutReceiptWelcomeOwner;
  },
) {
  const admittedEnrollment = await dependencies.enrollment.admit(attemptId);
  const enrollmentResult = dependencies.accessDelivery
    ? await dependencies.accessDelivery.deliver(attemptId, admittedEnrollment)
    : admittedEnrollment;
  const receiptWelcome =
    dependencies.receiptWelcomeOwner &&
    enrollmentResult.canonicalEnrollment === 'materialized' &&
    ['accepted', 'duplicate'].includes(enrollmentResult.disposition) &&
    enrollmentResult.currentPaymentState === 'eligible'
      ? await dependencies.receiptWelcomeOwner.reconcile({
          attemptId,
          idempotencyKey: `website_checkout_receipt_welcome:${attemptId}`,
          enrollment: enrollmentResult,
        })
      : { state: 'held' as const, receiptReference: null };
  return Object.freeze({ enrollmentResult, receiptWelcome });
}

const corePaths = new Set([
  '/internal/payments/sessions',
  '/internal/payments/attempts',
  '/internal/payments/status',
  '/internal/payments/returns',
  '/internal/payments/session-retries',
  '/internal/payments/session-submit-checks',
]);
const identityPaths = new Set([
  '/internal/payments/identity/resolve',
  '/internal/payments/identity/status',
]);
const enrollmentPath = '/internal/payments/enrollment-admissions';
const documentPaths = new Set([
  '/internal/payments/documents/prepare',
  '/internal/payments/documents/download',
  '/internal/payments/documents/email',
]);

function normalized(config: WebsiteCheckoutServiceConfig) {
  const profile = config.profile;
  if (profile.environment === 'test') {
    const payment = profile.config;
    return {
      payment,
      caller: payment.caller,
      scope: payment.scope,
      requestKeys: payment.requestKeys,
      signedResponses: payment.signedResponses,
      payloadKeyId: payment.payloadKeyId,
      payloadKeys: payment.payloadKeys,
      limits: payment.limits,
      webhookConfigured: payment.webhook !== null,
      webhookPath: ADYEN_TEST_WEBHOOK_PATH,
    } as const;
  }
  const payment = profile.config;
  return {
    payment,
    caller: payment.caller,
    scope: payment.scope,
    requestKeys: payment.credentials.requestKeys,
    signedResponses: payment.credentials.signedResponses,
    payloadKeyId: payment.credentials.payloadKeyId,
    payloadKeys: payment.credentials.payloadKeys,
    limits: payment.limits,
    webhookConfigured: true,
    webhookPath: ADYEN_LIVE_WEBHOOK_PATH,
  } as const;
}

/** Full private checkout composition shared by explicit TEST and LIVE profiles. */
export function createWebsiteCheckoutService(
  config: WebsiteCheckoutServiceConfig,
  dependencies: WebsiteCheckoutServiceDependencies,
) {
  const values = normalized(config);
  const { payment } = values;
  const isTest = config.profile.environment === 'test';
  if (
    !dependencies?.pool ||
    typeof dependencies.transaction !== 'function' ||
    (isTest
      ? payment.mode !== 'test' ||
        payment.paymentMethodCapabilities.length !== 1 ||
        payment.paymentMethodCapabilities[0] !== 'card' ||
        payment.recoveryOfferLocales.length !== 1 ||
        payment.recoveryOfferLocales[0] !== LIVE_MCS_CARD_OFFER_LOCALE ||
        payment.newAttemptOfferLocales.length !== 1 ||
        payment.newAttemptOfferLocales[0] !== LIVE_MCS_CARD_OFFER_LOCALE ||
        payment.recoveryMode !== 'dispatch'
      : payment.mode !== 'live' ||
        payment.caller !== LIVE_MCS_CARD_CALLER ||
        !dependencies.enrollmentDatabaseGuard ||
        (payment.activation.newAttemptsEnabled &&
          (!config.liveNewAttemptPrerequisites?.accessDeliveryOwnerConfigured ||
            !config.liveNewAttemptPrerequisites.receiptWelcomeOwnerConfigured ||
            !dependencies.accessDelivery ||
            !dependencies.receiptWelcomeOwner))) ||
    (config.documents &&
      (!config.documentEncryptionKey ||
        config.documentEncryptionKey.length !== 32)) ||
    (config.cardCaptureConfigurationEvidence !== null &&
      (typeof config.cardCaptureConfigurationEvidence !== 'string' ||
        config.cardCaptureConfigurationEvidence.length < 1))
  )
    throw new PaymentDomainError('invalid_website_checkout_configuration');
  const secrets = [
    ...values.requestKeys.values(),
    ...values.payloadKeys.values(),
    values.signedResponses.key.secret,
    Buffer.from(config.identitySecret),
    config.identityTokenSecret,
    config.identityReferenceSecret,
    config.checkoutEvidenceSecret,
  ].map((value) =>
    Buffer.isBuffer(value)
      ? value
      : 'secret' in value
        ? value.secret
        : Buffer.alloc(0),
  );
  const secretDigests = secrets.map((secret) =>
    createHash('sha256').update(secret).digest('hex'),
  );
  if (
    secrets.some((secret) => secret.length < 32) ||
    new Set(secretDigests).size !== secretDigests.length
  )
    throw new PaymentDomainError('invalid_website_checkout_configuration');

  const core = isTest
    ? createPaymentTestRuntime(
        config.profile.config as SignedTestPayment,
        dependencies,
      )
    : createPaymentLiveRuntime(
        config.profile.config as PaymentLiveRuntimeConfig,
        dependencies,
      );
  const identity = createPaymentIdentityRuntime(
    {
      mode: config.profile.environment,
      caller: values.caller,
      scope: values.scope,
      requestKeys: values.requestKeys,
      payloadKeyId: values.payloadKeyId,
      payloadKeys: values.payloadKeys,
      responseKeyId: values.signedResponses.keyId,
      responseKey: values.signedResponses.key,
      identitySecret: config.identitySecret,
      identityTokenSecret: config.identityTokenSecret,
      identityReferenceSecret: config.identityReferenceSecret,
      limits: values.limits,
    },
    dependencies,
  );
  const vault = new PaymentPayloadVault(
    values.payloadKeyId,
    values.payloadKeys,
  );
  const authenticator = new PaymentRequestAuthenticator(values.requestKeys);
  const requestSecrets = [...values.requestKeys.values()].map(
    (value) => value.secret,
  );
  const admission = new PaymentAdmissionStore(
    dependencies.transaction,
    authenticator,
    vault,
    () => false,
  );
  const checkoutStore = new PaymentCheckoutAdmissionStore(
    dependencies.transaction,
    values.caller,
    values.scope,
    new CheckoutAdmissionEvidenceIssuer(config.checkoutEvidenceSecret),
    config.checkoutDocumentPolicies,
  );
  const attribution = new PaymentCheckoutAttributionStore(
    dependencies.transaction,
    values.caller,
    values.scope,
    vault,
    config.attributionFieldMap,
  );
  const enrollment = new WebsiteCheckoutEnrollmentAdapter(
    dependencies.pool,
    values.caller,
    values.scope,
    config.publication,
    config.publicationPin,
    config.cardCaptureConfigurationEvidence,
    true,
    isTest
      ? { environment: 'test' }
      : {
          environment: 'live',
          activationReceipt: config.publicationActivationReceipt!,
        },
    dependencies.enrollmentDatabaseGuard,
    dependencies.excludedFulfillmentAttemptIds,
  );
  const promotion = new PaymentPromotionConsumptionReceiptReader(
    dependencies.transaction,
    values.caller,
    values.scope,
    config.promotionPolicyReferences,
  );
  const documentStore =
    !isTest && config.documents
      ? new PgPaymentCheckoutDocumentStore(
          dependencies.transaction,
          values.caller,
          payment.scope,
          vault,
          config.documentEncryptionKey!,
        )
      : null;
  const checkout = new PaymentHttpAdapter(
    new PaymentCheckoutAdmissionController(
      values.caller,
      new PaymentRequestLimiter(
        values.limits.requestsPerWindow,
        values.limits.maxActive,
        values.limits.windowMs,
      ),
      new PaymentResponseSigner(
        values.signedResponses.keyId,
        values.signedResponses.key,
        requestSecrets,
      ),
      {
        admission,
        store: checkoutStore,
        attribution,
        enrollment,
        promotion,
        accessDelivery: dependencies.accessDelivery,
      },
    ),
    values.limits.maxBodyBytes,
    values.limits.bodyReadTimeoutMs,
  );
  const documentHttp =
    !isTest && config.documents
      ? new PaymentHttpAdapter(
          new PaymentSignedResponseController(
            values.caller,
            authenticator,
            new PaymentCheckoutDocumentApiController(
              LIVE_MCS_CARD_CALLER,
              new PaymentRequestLimiter(
                values.limits.requestsPerWindow,
                values.limits.maxActive,
                values.limits.windowMs,
              ),
              admission,
              new PaymentCheckoutDocumentOwner(
                config.documents,
                new PgPaymentCheckoutDocumentAuthorityReader(
                  dependencies.transaction,
                  LIVE_MCS_CARD_CALLER,
                  payment.scope,
                  identity.readPrivateBindings,
                ),
                documentStore!,
                dependencies.documentGmail,
              ),
            ),
            new PaymentResponseSigner(
              values.signedResponses.keyId,
              values.signedResponses.key,
              requestSecrets,
              undefined,
              1_048_576,
            ),
            new PaymentAttemptAcceptanceReceiptReader(
              dependencies.transaction,
              values.caller,
              payment.scope,
            ),
          ),
          values.limits.maxBodyBytes,
          values.limits.bodyReadTimeoutMs,
        )
      : null;
  const webhook = new PaymentWebhookHttpAdapter(
    values.webhookPath,
    values.webhookConfigured,
    core.recordWebhook,
    values.limits.maxBodyBytes,
    values.limits.bodyReadTimeoutMs,
  );
  const handle = (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    const path = request.url ?? '';
    if (path === values.webhookPath) return webhook.handle(request, response);
    if (corePaths.has(path)) return core.http.handle(request, response);
    if (identityPaths.has(path)) return identity.http.handle(request, response);
    if (path === enrollmentPath) return checkout.handle(request, response);
    if (documentHttp && documentPaths.has(path))
      return documentHttp.handle(request, response);
    return core.http.handle(request, response);
  };
  const fulfillAttempt = (attemptId: string) =>
    fulfillWebsiteCheckoutAttempt(attemptId, {
      enrollment,
      accessDelivery: dependencies.accessDelivery,
      receiptWelcomeOwner: dependencies.receiptWelcomeOwner,
    });
  return Object.freeze({
    environment: config.profile.environment,
    http: Object.freeze({ handle }),
    recordWebhook: core.recordWebhook,
    readPrivateIdentityBindings: identity.readPrivateBindings,
    fulfillAttempt,
    documentStore,
  });
}
