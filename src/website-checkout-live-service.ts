import type { Pool } from 'pg';

import type { resolveCheckoutCustomerIdentityWithClient } from './checkout-customer-identity.js';
import type { CheckoutDocumentPolicy } from './payment-checkout-admission.js';
import type {
  WebsiteCheckoutDocumentConfig,
  WebsiteCheckoutDocumentGmail,
} from './payment-checkout-documents.js';
import { PaymentDomainError } from './payment-domain.js';
import type { PaymentLiveRuntimeConfig } from './payment-live-runtime.js';
import type { PaymentTransaction } from './payment-store.js';
import type { ProjectionDatabaseGuard } from './student-enrollment-projection-store.js';
import type {
  WebsiteCheckoutEnrollmentResult,
  WebsiteCheckoutPublicationActivationReceipt,
  WebsiteCheckoutPublicationPin,
} from './website-checkout-enrollment-adapter.js';
import {
  WebsiteCheckoutHeartbeatLiveDelivery,
  type HeartbeatLiveAccessConfig,
  type HeartbeatLiveToolboxRunner,
} from './website-checkout-heartbeat-live-delivery.js';
import {
  createWebsiteCheckoutService,
  type WebsiteCheckoutReceiptWelcomeOwner,
} from './website-checkout-service.js';

export interface WebsiteCheckoutLiveServiceConfig {
  payment: PaymentLiveRuntimeConfig;
  identitySecret: string;
  identityTokenSecret: Buffer;
  identityReferenceSecret: Buffer;
  checkoutEvidenceSecret: Buffer;
  attributionFieldMap: { id: string; sha256: string };
  promotionPolicyReferences: readonly string[];
  checkoutDocumentPolicies: readonly CheckoutDocumentPolicy[];
  publication: unknown;
  publicationPin: WebsiteCheckoutPublicationPin;
  publicationActivationReceipt: WebsiteCheckoutPublicationActivationReceipt;
  cardCaptureConfigurationEvidence: string;
  heartbeatAccess: { enabled: false } | HeartbeatLiveAccessConfig;
  receiptWelcome:
    | { owner: 'unassigned'; enabled: false }
    | {
        owner: 'gmail_website_checkout_notices';
        enabled: true;
        decisionReference: string;
        approvedAt: string;
        activationReceiptSha256: string;
      };
  excludedFulfillmentAttemptIds: readonly string[];
  documents: WebsiteCheckoutDocumentConfig;
  documentEncryptionKey: Buffer;
}

export interface WebsiteCheckoutLiveServiceDependencies {
  pool: Pick<Pool, 'connect'>;
  transaction: PaymentTransaction;
  identityResolver?: typeof resolveCheckoutCustomerIdentityWithClient;
  providerTransport?: typeof fetch;
  heartbeatToolbox?: HeartbeatLiveToolboxRunner;
  projectionDatabaseGuard: ProjectionDatabaseGuard;
  receiptWelcomeOwner?: WebsiteCheckoutReceiptWelcomeOwner;
  documentGmail?: WebsiteCheckoutDocumentGmail;
}

function holdDisabled(enrollment: WebsiteCheckoutEnrollmentResult) {
  if (
    enrollment.canonicalEnrollment !== 'materialized' ||
    !['accepted', 'duplicate'].includes(enrollment.disposition)
  )
    return enrollment;
  return {
    ...enrollment,
    accessDelivery: 'held' as const,
    reasons: [
      ...new Set([
        ...enrollment.reasons,
        'heartbeat_live_membership_delivery_disabled',
      ]),
    ],
  };
}

/** Complete signed LIVE service composition; no listener or dependency opens here. */
export function createWebsiteCheckoutLiveService(
  config: WebsiteCheckoutLiveServiceConfig,
  dependencies: WebsiteCheckoutLiveServiceDependencies,
) {
  if (
    !dependencies.projectionDatabaseGuard ||
    (config.heartbeatAccess.enabled && !dependencies.heartbeatToolbox) ||
    (config.payment.activation.newAttemptsEnabled &&
      (!config.heartbeatAccess.enabled ||
        !config.receiptWelcome.enabled ||
        !dependencies.receiptWelcomeOwner))
  )
    throw new PaymentDomainError('invalid_website_checkout_configuration');
  const accessDelivery = config.heartbeatAccess.enabled
    ? new WebsiteCheckoutHeartbeatLiveDelivery(
        dependencies.pool,
        config.payment.caller,
        config.payment.scope,
        config.heartbeatAccess,
        dependencies.heartbeatToolbox!,
        dependencies.projectionDatabaseGuard,
        dependencies.transaction,
      )
    : {
        async deliver(
          _attemptId: string,
          enrollment: WebsiteCheckoutEnrollmentResult,
        ) {
          return holdDisabled(enrollment);
        },
      };
  return createWebsiteCheckoutService(
    {
      profile: { environment: 'live', config: config.payment },
      identitySecret: config.identitySecret,
      identityTokenSecret: config.identityTokenSecret,
      identityReferenceSecret: config.identityReferenceSecret,
      checkoutEvidenceSecret: config.checkoutEvidenceSecret,
      attributionFieldMap: config.attributionFieldMap,
      promotionPolicyReferences: config.promotionPolicyReferences,
      checkoutDocumentPolicies: config.checkoutDocumentPolicies,
      publication: config.publication,
      publicationPin: config.publicationPin,
      publicationActivationReceipt: config.publicationActivationReceipt,
      liveNewAttemptPrerequisites:
        config.heartbeatAccess.enabled && config.receiptWelcome.enabled
          ? {
              accessDeliveryOwnerConfigured: true,
              receiptWelcomeOwnerConfigured: true,
            }
          : undefined,
      cardCaptureConfigurationEvidence: config.cardCaptureConfigurationEvidence,
      documents: config.documents,
      documentEncryptionKey: config.documentEncryptionKey,
    },
    {
      ...dependencies,
      accessDelivery,
      enrollmentDatabaseGuard: dependencies.projectionDatabaseGuard,
      excludedFulfillmentAttemptIds: new Set(
        config.excludedFulfillmentAttemptIds,
      ),
      documentGmail: dependencies.documentGmail,
    },
  );
}
