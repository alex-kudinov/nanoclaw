import type { resolveCheckoutCustomerIdentityWithClient } from './checkout-customer-identity.js';
import {
  createPaymentIdentityRuntime,
  type PaymentIdentityRuntimeConfig,
} from './payment-identity-runtime.js';
import type { PaymentTransaction } from './payment-store.js';

export interface PaymentIdentityTestRuntimeConfig extends Omit<
  PaymentIdentityRuntimeConfig,
  'mode'
> {
  mode: 'test';
}

/** Compatibility wrapper preserving the established TEST-only public factory. */
export function createPaymentIdentityTestRuntime(
  config: PaymentIdentityTestRuntimeConfig,
  dependencies: {
    transaction: PaymentTransaction;
    identityResolver?: typeof resolveCheckoutCustomerIdentityWithClient;
  },
) {
  return createPaymentIdentityRuntime(config, dependencies);
}
