import {
  AdyenSessionAdapter,
  buildAdyenSessionRequest,
  type AdyenSession,
  type AdyenSessionRouting,
} from './adyen-session-adapter.js';
import {
  resolveAdyenEnvironment,
  type AdyenEnvironmentProfile,
} from './adyen-environment.js';
import {
  paymentMethodCapabilitiesForAttempt,
  PaymentDomainError,
  validateAttempt,
  validatePaymentMethodCapabilities,
  type PaymentMethodCapability,
} from './payment-domain.js';
import type { PaymentStore } from './payment-store.js';
import {
  PaymentSessionReturnBindingIssuer,
  SESSION_RESULT_RECOVERY_WINDOW_MS,
  sessionIdSha256,
} from './payment-session-return-binding.js';

type SessionStore = Pick<
  PaymentStore,
  | 'acceptAttempt'
  | 'readAttempt'
  | 'prepareSession'
  | 'acquireDispatch'
  | 'finishDispatch'
> &
  Partial<
    Pick<
      PaymentStore,
      'currentOperationId' | 'prepareSuccessorSession' | 'checkSessionSubmit'
    >
  >;
export type CheckoutPreparation =
  | {
      state: 'pending' | 'reconciliation_required' | 'failed';
      paymentMethodCapabilities: readonly PaymentMethodCapability[];
    }
  | {
      state: 'checkout_ready';
      session: AdyenSession;
      returnBinding: string;
      paymentMethodCapabilities: readonly PaymentMethodCapability[];
    };

/** Internal host service only. Caller authentication/capabilities precede this API. */
export class PaymentSessionService {
  private readonly allowedOffers: ReadonlySet<string>;
  private readonly configuredPaymentMethods: readonly PaymentMethodCapability[];
  private readonly returnBindings: PaymentSessionReturnBindingIssuer;
  constructor(
    private readonly store: SessionStore,
    private readonly adapter: Pick<AdyenSessionAdapter, 'create'>,
    private readonly routing: AdyenSessionRouting,
    allowedOffers: Iterable<string>,
    configuredPaymentMethods: unknown = ['card'],
    private readonly recoveryMode: 'dispatch' | 'reconcile_only' = 'dispatch',
    private readonly environmentProfile: AdyenEnvironmentProfile = resolveAdyenEnvironment(
      {
        environment: 'test',
        liveEndpointPrefix: null,
      },
    ),
    returnBindings?: PaymentSessionReturnBindingIssuer,
  ) {
    this.allowedOffers = new Set(allowedOffers);
    this.configuredPaymentMethods = validatePaymentMethodCapabilities(
      configuredPaymentMethods,
    );
    if (recoveryMode !== 'dispatch' && recoveryMode !== 'reconcile_only')
      throw new PaymentDomainError('invalid_dispatch_mode');
    if (!returnBindings && environmentProfile.environment !== 'test')
      throw new PaymentDomainError('invalid_return_binding_configuration');
    // Compatibility is intentionally TEST-only; composed runtimes always inject
    // their separately derived purpose key.
    this.returnBindings =
      returnBindings ??
      new PaymentSessionReturnBindingIssuer(Buffer.alloc(32, 0x54));
  }

  async start(input: unknown): Promise<CheckoutPreparation> {
    if (this.recoveryMode !== 'dispatch')
      throw new PaymentDomainError('payment_dispatch_disabled');
    const attempt = this.validateStart(input);
    const request = buildAdyenSessionRequest(
      attempt,
      this.routing,
      this.environmentProfile,
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
    return this.recover(attempt, attempt.attemptId);
  }

  validateStart(input: unknown) {
    const attempt = validateAttempt(input);
    if (
      !this.allowedOffers.has(
        `${attempt.quote.offerKey}:${attempt.quote.locale}`,
      )
    )
      throw new PaymentDomainError('offer_not_enabled');
    buildAdyenSessionRequest(
      attempt,
      this.routing,
      this.environmentProfile,
      this.configuredPaymentMethods,
    );
    return attempt;
  }

  /** Existing attempts recover only from the original persisted contract/request. */
  async resume(attemptId: string): Promise<CheckoutPreparation> {
    const stored = await this.store.readAttempt(attemptId);
    if (!stored) throw new PaymentDomainError('attempt_not_found');
    return this.recover(
      stored,
      this.store.currentOperationId
        ? await this.store.currentOperationId(stored.attemptId)
        : stored.attemptId,
    );
  }

  async retry(input: {
    attemptId: string;
    operationId: string;
    terminalReceipt: string;
  }): Promise<
    | CheckoutPreparation
    | {
        state:
          | 'reconfirmation_required'
          | 'limit_reached'
          | 'retry_not_allowed';
        paymentMethodCapabilities: readonly PaymentMethodCapability[];
      }
  > {
    const stored = await this.store.readAttempt(input.attemptId);
    if (!stored) throw new PaymentDomainError('attempt_not_found');
    const paymentMethodCapabilities =
      paymentMethodCapabilitiesForAttempt(stored);
    if (
      this.recoveryMode !== 'dispatch' ||
      !this.allowedOffers.has(`${stored.quote.offerKey}:${stored.quote.locale}`)
    )
      return {
        state: 'retry_not_allowed',
        paymentMethodCapabilities,
      };
    if (!this.store.prepareSuccessorSession)
      throw new PaymentDomainError('payment_retry_unavailable');
    const prepared = await this.store.prepareSuccessorSession({
      ...input,
      requestForSequence: (attempt, sessionSequence) => {
        this.validateStart(attempt);
        return buildAdyenSessionRequest(
          attempt,
          this.routing,
          this.environmentProfile,
          this.configuredPaymentMethods,
          sessionSequence,
        );
      },
      retryWindowMs: 24 * 60 * 60 * 1000,
    });
    if (prepared.disposition !== 'prepared') {
      return {
        state: prepared.disposition,
        paymentMethodCapabilities,
      };
    }
    return this.recover(prepared.attempt, prepared.operationId);
  }

  async checkSubmit(input: {
    attemptId: string;
    returnBinding: string;
  }): Promise<
    | { state: 'session_submit_allowed' }
    | {
        state: 'session_submit_blocked';
        reason:
          | 'stale_session'
          | 'needs_review'
          | 'not_payable'
          | 'expired'
          | 'unavailable';
      }
  > {
    const stored = await this.store.readAttempt(input.attemptId);
    if (!stored) throw new PaymentDomainError('attempt_not_found');
    if (
      this.recoveryMode !== 'dispatch' ||
      !this.allowedOffers.has(`${stored.quote.offerKey}:${stored.quote.locale}`)
    )
      return { state: 'session_submit_blocked', reason: 'unavailable' };
    if (!this.store.checkSessionSubmit)
      return { state: 'session_submit_blocked', reason: 'unavailable' };
    const binding = this.returnBindings.open(input.returnBinding);
    if (binding.attemptId !== input.attemptId)
      throw new PaymentDomainError('return_binding_conflict');
    return this.store.checkSessionSubmit(binding);
  }

  private async recover(
    input: unknown,
    paymentOperationId: string,
  ): Promise<CheckoutPreparation> {
    const attempt = validateAttempt(input);
    const paymentMethodCapabilities =
      paymentMethodCapabilitiesForAttempt(attempt);
    const lease = await this.store.acquireDispatch(
      paymentOperationId,
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
        returnBinding: this.issueReturnBinding(
          attempt.attemptId,
          lease.operationId,
          lease.sessionSequence,
          JSON.parse(lease.response) as AdyenSession,
        ),
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
        operationId: paymentOperationId,
        leaseToken: lease.leaseToken,
        version: lease.version,
        result: 'unknown',
      });
      return { state: 'pending', paymentMethodCapabilities };
    }
    // Do not report checkout-ready until encrypted response and receipt commit.
    await this.store.finishDispatch({
      operationId: paymentOperationId,
      leaseToken: lease.leaseToken,
      version: lease.version,
      result: 'session_available',
      response: JSON.stringify(session),
      sessionExpiresAt: Date.parse(session.expiresAt),
    });
    return {
      state: 'checkout_ready',
      session,
      returnBinding: this.issueReturnBinding(
        attempt.attemptId,
        paymentOperationId,
        lease.sessionSequence,
        session,
      ),
      paymentMethodCapabilities,
    };
  }

  private issueReturnBinding(
    attemptId: string,
    paymentOperationId: string,
    sessionSequence: number,
    session: AdyenSession,
  ): string {
    return this.returnBindings.issue({
      attemptId,
      paymentOperationId,
      sessionSequence,
      sessionIdSha256: sessionIdSha256(session.id),
      // This extends only authenticated read/reconciliation of the old result.
      // Successor creation separately rechecks the immutable quote with DB time.
      expiresAt:
        Date.parse(session.expiresAt) + SESSION_RESULT_RECOVERY_WINDOW_MS,
    });
  }
}
