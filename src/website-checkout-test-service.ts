import type { Pool } from 'pg';

import type { resolveCheckoutCustomerIdentityWithClient } from './checkout-customer-identity.js';
import type { CheckoutDocumentPolicy } from './payment-checkout-admission.js';
import { PaymentDomainError } from './payment-domain.js';
import type { PaymentTestRuntimeConfig } from './payment-test-runtime.js';
import type { PaymentTransaction } from './payment-store.js';
import type { WebsiteCheckoutPublicationPin } from './website-checkout-enrollment-adapter.js';
import {
  WebsiteCheckoutHeartbeatTestDelivery,
  holdDisabledHeartbeatTestDelivery,
  type HeartbeatTestAccessConfig,
  type HeartbeatToolboxRunner,
} from './website-checkout-heartbeat-test-delivery.js';
import {
  createWebsiteCheckoutService,
  type WebsiteCheckoutReceiptWelcomeOwner,
} from './website-checkout-service.js';

export interface WebsiteCheckoutTestServiceConfig {
  payment: PaymentTestRuntimeConfig & {
    signedResponses: NonNullable<PaymentTestRuntimeConfig['signedResponses']>;
  };
  identitySecret: string;
  identityTokenSecret: Buffer;
  identityReferenceSecret: Buffer;
  checkoutEvidenceSecret: Buffer;
  attributionFieldMap: { id: string; sha256: string };
  promotionPolicyReferences: readonly string[];
  checkoutDocumentPolicies: readonly CheckoutDocumentPolicy[];
  publication: unknown;
  publicationPin: WebsiteCheckoutPublicationPin;
  cardCaptureConfigurationEvidence: string | null;
  heartbeatAccess?: { enabled: false } | HeartbeatTestAccessConfig;
}

export interface WebsiteCheckoutTestServiceDependencies {
  pool: Pick<Pool, 'connect'>;
  transaction: PaymentTransaction;
  identityResolver?: typeof resolveCheckoutCustomerIdentityWithClient;
  providerTransport?: typeof fetch;
  heartbeatToolbox?: HeartbeatToolboxRunner;
  receiptWelcomeOwner?: WebsiteCheckoutReceiptWelcomeOwner;
}

/** Compatibility wrapper over the environment-explicit full service factory. */
export function createWebsiteCheckoutTestService(
  config: WebsiteCheckoutTestServiceConfig,
  dependencies: WebsiteCheckoutTestServiceDependencies,
) {
  if (config.heartbeatAccess?.enabled && !dependencies.heartbeatToolbox)
    throw new PaymentDomainError('invalid_website_checkout_configuration');
  const accessDelivery = config.heartbeatAccess?.enabled
    ? new WebsiteCheckoutHeartbeatTestDelivery(
        dependencies.pool,
        config.payment.caller,
        config.payment.scope,
        config.heartbeatAccess,
        dependencies.heartbeatToolbox!,
      )
    : {
        async deliver(
          _attemptId: string,
          enrollment: Parameters<typeof holdDisabledHeartbeatTestDelivery>[0],
        ) {
          return holdDisabledHeartbeatTestDelivery(enrollment);
        },
      };
  return createWebsiteCheckoutService(
    {
      profile: { environment: 'test', config: config.payment },
      identitySecret: config.identitySecret,
      identityTokenSecret: config.identityTokenSecret,
      identityReferenceSecret: config.identityReferenceSecret,
      checkoutEvidenceSecret: config.checkoutEvidenceSecret,
      attributionFieldMap: config.attributionFieldMap,
      promotionPolicyReferences: config.promotionPolicyReferences,
      checkoutDocumentPolicies: config.checkoutDocumentPolicies,
      publication: config.publication,
      publicationPin: config.publicationPin,
      cardCaptureConfigurationEvidence: config.cardCaptureConfigurationEvidence,
    },
    { ...dependencies, accessDelivery },
  );
}
