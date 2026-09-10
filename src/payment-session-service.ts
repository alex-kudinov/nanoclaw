import {
  AdyenTestSessionAdapter,
  buildAdyenTestSessionRequest,
  type AdyenSession,
  type AdyenSessionRouting,
} from './adyen-session-adapter.js';
import {
  paymentMethodCapabilitiesForAttempt,
  PaymentDomainError,
  validateAttempt,
  validatePaymentMethodCapabilities,
  type PaymentMethodCapability,
} from './payment-domain.js';
import type { PaymentStore } from './payment-store.js';

type SessionStore = Pick<
  PaymentStore,
  | 'acceptAttempt'
  | 'readAttempt'
  | 'prepareSession'
  | 'acquireDispatch'
  | 'finishDispatch'
>;
export type CheckoutPreparation =
  | {
      state: 'pending' | 'reconciliation_required' | 'failed';
      paymentMethodCapabilities: readonly PaymentMethodCapability[];
    }
  | {
      state: 'checkout_ready';
      session: AdyenSession;
      paymentMethodCapabilities: readonly PaymentMethodCapability[];
    };

/** Internal host service only. Caller authentication/capabilities precede this API. */
export class PaymentSessionService {
  private readonly allowedOffers: ReadonlySet<string>;
  private readonly configuredPaymentMethods: readonly PaymentMethodCapability[];
  constructor(
    private readonly store: SessionStore,
    private readonly adapter: Pick<AdyenTestSessionAdapter, 'create'>,
    private readonly routing: AdyenSessionRouting,
    allowedOffers: Iterable<string>,
    configuredPaymentMethods: unknown = ['card'],
    private readonly recoveryMode: 'dispatch' | 'reconcile_only' = 'dispatch',
  ) {
    this.allowedOffers = new Set(allowedOffers);
    this.configuredPaymentMethods = validatePaymentMethodCapabilities(
      configuredPaymentMethods,
    );
    if (recoveryMode !== 'dispatch' && recoveryMode !== 'reconcile_only')
      throw new PaymentDomainError('invalid_dispatch_mode');
  }

  async start(input: unknown): Promise<CheckoutPreparation> {
    if (this.recoveryMode !== 'dispatch')
      throw new PaymentDomainError('payment_dispatch_disabled');
    const attempt = this.validateStart(input);
    const request = buildAdyenTestSessionRequest(
      attempt,
      this.routing,
      this.configuredPaymentMethods,
    );
    await this.store.acceptAttempt(attempt);
    await this.store.prepareSession({
      attemptId: attempt.attemptId,
      operationId: attempt.attemptId,
      idempotencyKey: attempt.attemptId,
      request,
      retryWindowMs: 24 * 60 * 60 * 1000,
    });
    return this.recover(attempt);
  }

  validateStart(input: unknown) {
    const attempt = validateAttempt(input);
    if (
      !this.allowedOffers.has(
        `${attempt.quote.offerKey}:${attempt.quote.locale}`,
      )
    )
      throw new PaymentDomainError('offer_not_enabled');
    buildAdyenTestSessionRequest(
      attempt,
      this.routing,
      this.configuredPaymentMethods,
    );
    return attempt;
  }

  /** Existing attempts recover only from the original persisted contract/request. */
  async resume(attemptId: string): Promise<CheckoutPreparation> {
    const stored = await this.store.readAttempt(attemptId);
    if (!stored) throw new PaymentDomainError('attempt_not_found');
    return this.recover(stored);
  }

  private async recover(input: unknown): Promise<CheckoutPreparation> {
    const attempt = validateAttempt(input);
    const paymentMethodCapabilities =
      paymentMethodCapabilitiesForAttempt(attempt);
    const lease = await this.store.acquireDispatch(
      attempt.attemptId,
      30000,
      this.recoveryMode === 'dispatch' ? 'allow' : 'reconcile_only',
    );
    if (lease.decision === 'busy')
      return { state: 'pending', paymentMethodCapabilities };
    if (lease.decision === 'reconcile')
      return { state: 'reconciliation_required', paymentMethodCapabilities };
    if (lease.decision === 'stop')
      return { state: 'failed', paymentMethodCapabilities };
    if (lease.decision === 'reuse_session')
      return {
        state: 'checkout_ready',
        session: JSON.parse(lease.response) as AdyenSession,
        paymentMethodCapabilities,
      };
    if (lease.decision !== 'dispatch')
      throw new PaymentDomainError('invalid_dispatch_decision');
    let session: AdyenSession;
    try {
      session = await this.adapter.create(
        lease.request,
        lease.operation.idempotencyKey,
      );
      const expiry = Date.parse(session.expiresAt);
      if (
        !Number.isFinite(expiry) ||
        expiry > attempt.quote.expiresAt ||
        expiry <= Date.now()
      )
        throw new PaymentDomainError('provider_session_expiry_conflict');
    } catch {
      await this.store.finishDispatch({
        operationId: attempt.attemptId,
        leaseToken: lease.leaseToken,
        version: lease.version,
        result: 'unknown',
      });
      return { state: 'pending', paymentMethodCapabilities };
    }
    // Do not report checkout-ready until encrypted response and receipt commit.
    await this.store.finishDispatch({
      operationId: attempt.attemptId,
      leaseToken: lease.leaseToken,
      version: lease.version,
      result: 'session_available',
      response: JSON.stringify(session),
      sessionExpiresAt: Date.parse(session.expiresAt),
    });
    return { state: 'checkout_ready', session, paymentMethodCapabilities };
  }
}
