import {
  AdyenTestSessionAdapter,
  buildAdyenTestSessionRequest,
  type AdyenSession,
  type AdyenSessionRouting,
} from './adyen-session-adapter.js';
import { PaymentDomainError, validateAttempt } from './payment-domain.js';
import type { PaymentStore } from './payment-store.js';

type SessionStore = Pick<
  PaymentStore,
  'acceptAttempt' | 'prepareSession' | 'acquireDispatch' | 'finishDispatch'
>;
export type CheckoutPreparation =
  | { state: 'pending' | 'reconciliation_required' | 'failed' }
  | { state: 'checkout_ready'; session: AdyenSession };

/** Internal host service only. Caller authentication/capabilities precede this API. */
export class PaymentSessionService {
  private readonly allowedOffers: ReadonlySet<string>;
  constructor(
    private readonly store: SessionStore,
    private readonly adapter: Pick<AdyenTestSessionAdapter, 'create'>,
    private readonly routing: AdyenSessionRouting,
    allowedOffers: Iterable<string>,
  ) {
    this.allowedOffers = new Set(allowedOffers);
  }

  async start(input: unknown): Promise<CheckoutPreparation> {
    const attempt = validateAttempt(input);
    if (
      !this.allowedOffers.has(
        `${attempt.quote.offerKey}:${attempt.quote.locale}`,
      )
    )
      throw new PaymentDomainError('offer_not_enabled');
    const request = buildAdyenTestSessionRequest(attempt, this.routing);
    await this.store.acceptAttempt(attempt);
    await this.store.prepareSession({
      attemptId: attempt.attemptId,
      operationId: attempt.attemptId,
      idempotencyKey: attempt.attemptId,
      request,
      retryWindowMs: 24 * 60 * 60 * 1000,
    });
    return this.resume(attempt);
  }

  /** Existing attempts retain their provider even if new-offer routing is disabled. */
  async resume(input: unknown): Promise<CheckoutPreparation> {
    const attempt = validateAttempt(input);
    const expectedRequest = buildAdyenTestSessionRequest(attempt, this.routing);
    // Exact immutable contract readback prevents using an ID with a forged quote.
    await this.store.acceptAttempt(attempt);
    const lease = await this.store.acquireDispatch(attempt.attemptId);
    if (lease.decision === 'busy') return { state: 'pending' };
    if (lease.decision === 'reconcile')
      return { state: 'reconciliation_required' };
    if (lease.decision === 'stop') return { state: 'failed' };
    if (lease.decision === 'reuse_session')
      return {
        state: 'checkout_ready',
        session: JSON.parse(lease.response) as AdyenSession,
      };
    if (lease.decision !== 'dispatch')
      throw new PaymentDomainError('invalid_dispatch_decision');
    if (lease.request !== expectedRequest)
      throw new PaymentDomainError('stored_session_request_conflict');
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
      return { state: 'pending' };
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
    return { state: 'checkout_ready', session };
  }
}
