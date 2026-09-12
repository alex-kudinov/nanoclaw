import { createHash } from 'node:crypto';

import type { resolveCheckoutCustomerIdentityWithClient } from './checkout-customer-identity.js';
import { PaymentAdmissionStore } from './payment-admission-store.js';
import { PaymentRequestLimiter } from './payment-api-controller.js';
import { PaymentHttpAdapter } from './payment-http-adapter.js';
import { PaymentIdentityApiController } from './payment-identity-api-controller.js';
import { PaymentIdentityReferenceIssuer } from './payment-identity-preparation.js';
import { PaymentIdentityPreparationStore } from './payment-identity-preparation-store.js';
import {
  paymentScopeFingerprint,
  PaymentDomainError,
  type PaymentScope,
} from './payment-domain.js';
import { PaymentPayloadVault } from './payment-payload-vault.js';
import {
  PaymentRequestAuthenticator,
  type PaymentRequestKey,
} from './payment-request-auth.js';
import {
  PaymentResponseSigner,
  type PaymentResponseKey,
} from './payment-signed-response-controller.js';
import type { PaymentTransaction } from './payment-store.js';

export interface PaymentIdentityRuntimeConfig {
  mode: 'test' | 'live';
  caller: string;
  scope: PaymentScope;
  requestKeys: ReadonlyMap<string, PaymentRequestKey>;
  payloadKeyId: string;
  payloadKeys: ReadonlyMap<string, Buffer>;
  responseKeyId: string;
  responseKey: PaymentResponseKey;
  identitySecret: string;
  identityTokenSecret: Buffer;
  identityReferenceSecret: Buffer;
  limits: {
    requestsPerWindow: number;
    maxActive: number;
    windowMs: number;
    maxBodyBytes: number;
    bodyReadTimeoutMs: number;
  };
}

/** Environment-explicit identity composition shared by TEST and LIVE services. */
export function createPaymentIdentityRuntime(
  config: PaymentIdentityRuntimeConfig,
  dependencies: {
    transaction: PaymentTransaction;
    identityResolver?: typeof resolveCheckoutCustomerIdentityWithClient;
  },
) {
  if (
    !['test', 'live'].includes(config.mode) ||
    typeof dependencies?.transaction !== 'function' ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(config.caller) ||
    config.scope.provider !== 'adyen' ||
    config.scope.environment !== config.mode ||
    config.scope.endpointRegion !== 'eu' ||
    config.scope.store === null ||
    config.responseKey.caller !== config.caller ||
    config.requestKeys.size < 1 ||
    [...config.requestKeys.values()].some(
      (value) => value.caller !== config.caller,
    )
  )
    throw new PaymentDomainError('invalid_identity_configuration');
  paymentScopeFingerprint(config.scope);
  const requestSecrets = [...config.requestKeys.values()].map(
    (value) => value.secret,
  );
  const allSecrets = [
    ...requestSecrets,
    ...config.payloadKeys.values(),
    config.responseKey.secret,
    Buffer.from(config.identitySecret),
    config.identityTokenSecret,
    config.identityReferenceSecret,
  ];
  const fingerprints = allSecrets.map((secret) =>
    createHash('sha256').update(secret).digest('hex'),
  );
  if (
    allSecrets.some((secret) => secret.length < 32) ||
    new Set(fingerprints).size !== fingerprints.length
  )
    throw new PaymentDomainError('invalid_identity_configuration');

  const vault = new PaymentPayloadVault(
    config.payloadKeyId,
    config.payloadKeys,
  );
  const authenticator = new PaymentRequestAuthenticator(config.requestKeys);
  const admission = new PaymentAdmissionStore(
    dependencies.transaction,
    authenticator,
    vault,
    () => false,
  );
  const signer = new PaymentResponseSigner(
    config.responseKeyId,
    config.responseKey,
    requestSecrets,
  );
  const store = new PaymentIdentityPreparationStore(
    dependencies.transaction,
    config.caller,
    new PaymentIdentityReferenceIssuer(
      config.identityReferenceSecret,
      config.scope,
    ),
    config.identitySecret,
    config.identityTokenSecret,
    dependencies.identityResolver,
    vault,
  );
  const controller = new PaymentIdentityApiController(
    config.caller,
    new PaymentRequestLimiter(
      config.limits.requestsPerWindow,
      config.limits.maxActive,
      config.limits.windowMs,
    ),
    signer,
    { admission, store },
  );
  return Object.freeze({
    http: new PaymentHttpAdapter(
      controller,
      config.limits.maxBodyBytes,
      config.limits.bodyReadTimeoutMs,
    ),
    readPrivateBindings: (preparationId: string) =>
      store.readPrivateBindings(preparationId),
  });
}
