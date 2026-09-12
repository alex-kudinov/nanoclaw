import { z } from 'zod';
import { PaymentDomainError, validateAttempt } from './payment-domain.js';
import type {
  PaymentAdmissionStore,
  PaymentCallerPolicy,
} from './payment-admission-store.js';
import type { PaymentStore } from './payment-store.js';
import type { PaymentSessionService } from './payment-session-service.js';
import type { PaymentEventStore } from './payment-event-store.js';
import type { PaymentMethodReconciliationStore } from './payment-method-reconciliation-store.js';

export interface PaymentApiResponse {
  status: number;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}
const transportSchema = z
  .object({ auth: z.unknown(), payloadBase64: z.string().max(87384) })
  .strict();
const startSchema = z
  .object({ requestId: z.uuid(), attempt: z.unknown() })
  .strict();
const readSchema = z
  .object({
    requestId: z.uuid(),
    attemptId: z.uuid(),
    capability: z.string().max(64),
  })
  .strict();
const returnSchema = readSchema
  .extend({
    sessionResult: z.string().min(1).max(65536),
    returnBinding: z.string().min(1).max(1000).optional(),
  })
  .strict();
const retrySchema = readSchema
  .extend({
    terminalReceipt: z.string().regex(/^terminal-nonpayment:v1:[a-f0-9]{64}$/),
  })
  .strict();
const submitCheckSchema = readSchema
  .extend({ returnBinding: z.string().min(1).max(1000) })
  .strict();
const paths = new Set([
  '/internal/payments/sessions',
  '/internal/payments/attempts',
  '/internal/payments/status',
  '/internal/payments/returns',
  '/internal/payments/session-retries',
  '/internal/payments/session-submit-checks',
]);

/** One bounded bucket per configured caller/controller, not attacker-chosen IDs. */
export class PaymentRequestLimiter {
  private windowStart = 0;
  private requests = 0;
  private active = 0;
  constructor(
    private readonly maxRequests: number,
    private readonly maxActive: number,
    private readonly windowMs: number,
    private readonly clock = () => Date.now(),
  ) {
    if (
      ![maxRequests, maxActive, windowMs].every(
        (n) => Number.isSafeInteger(n) && n > 0,
      ) ||
      maxRequests > 10000 ||
      maxActive > 100 ||
      windowMs > 86400000
    )
      throw new PaymentDomainError('invalid_payment_rate_limit');
  }
  acquire(): (() => void) | null {
    const now = this.clock();
    if (!Number.isSafeInteger(now) || now < 0) return null;
    if (now >= this.windowStart + this.windowMs) {
      this.windowStart = now;
      this.requests = 0;
    }
    if (this.active >= this.maxActive || this.requests >= this.maxRequests)
      return null;
    this.active++;
    this.requests++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.active--;
      }
    };
  }
}

type Dependencies = {
  admission: Pick<
    PaymentAdmissionStore,
    'preflightSignature' | 'admit' | 'issueStatusCapability' | 'permitsStatus'
  >;
  store: Pick<PaymentStore, 'acceptAttempt' | 'readAttempt'>;
  sessions: Pick<PaymentSessionService, 'validateStart' | 'start' | 'resume'> &
    Partial<Pick<PaymentSessionService, 'retry' | 'checkSubmit'>>;
  events: Pick<PaymentEventStore, 'readInternalEvidence'> &
    Partial<Pick<PaymentEventStore, 'readConfirmationSummary'>>;
  reconciliation?: Pick<
    PaymentMethodReconciliationStore,
    'verify' | 'readState'
  > &
    Partial<Pick<PaymentMethodReconciliationStore, 'readTerminalRetry'>>;
};

/** Unwired HTTP adapter. Caller/path come from server routing, never the envelope. */
export class PaymentApiController {
  constructor(
    private readonly caller: string,
    private readonly permits: PaymentCallerPolicy,
    private readonly limiter: PaymentRequestLimiter,
    private readonly deps: Dependencies,
  ) {
    if (
      !/^[A-Za-z0-9_-]{1,64}$/.test(caller) ||
      !(limiter instanceof PaymentRequestLimiter)
    )
      throw new PaymentDomainError('invalid_payment_api_configuration');
  }

  private response(
    status: number,
    body: Record<string, unknown>,
  ): PaymentApiResponse {
    return {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      },
      body,
    };
  }

  async handle(
    method: string,
    path: string,
    raw: Buffer,
  ): Promise<PaymentApiResponse> {
    if (!paths.has(path)) return this.response(404, { error: 'not_found' });
    if (method !== 'POST')
      return this.response(405, { error: 'method_not_allowed' });
    let release: (() => void) | null = null;
    try {
      if (!Buffer.isBuffer(raw) || raw.length > 100000)
        return this.response(413, { error: 'request_too_large' });
      let outer: unknown;
      try {
        outer = JSON.parse(raw.toString('utf8'));
      } catch {
        return this.response(400, { error: 'invalid_request' });
      }
      const parsed = transportSchema.safeParse(outer);
      if (!parsed.success)
        return this.response(400, { error: 'invalid_request' });
      const body = Buffer.from(parsed.data.payloadBase64, 'base64');
      if (
        body.length > 65536 ||
        body.toString('base64') !== parsed.data.payloadBase64
      )
        return this.response(400, { error: 'invalid_request' });
      const expected = {
        caller: this.caller,
        method: 'POST',
        path,
      };
      this.deps.admission.preflightSignature(parsed.data.auth, body, expected);
      release = this.limiter.acquire();
      if (!release)
        return {
          ...this.response(429, { error: 'payment_rate_limited' }),
          headers: { ...this.response(429, {}).headers, 'Retry-After': '1' },
        };
      const receipt = await this.deps.admission.admit(
        parsed.data.auth,
        body,
        expected,
      );
      let command: unknown;
      try {
        command = JSON.parse(body.toString('utf8'));
      } catch {
        return this.response(400, { error: 'invalid_request' });
      }
      if (path === '/internal/payments/sessions') {
        const start = startSchema.safeParse(command);
        if (!start.success || start.data.requestId !== receipt.operationId)
          return this.response(400, { error: 'invalid_request' });
        const proposed = validateAttempt(start.data.attempt);
        const existing = await this.deps.store.readAttempt(proposed.attemptId);
        if (existing && JSON.stringify(existing) !== JSON.stringify(proposed))
          throw new PaymentDomainError('attempt_identity_conflict');
        const attempt = existing ?? this.deps.sessions.validateStart(proposed);
        if (!this.permits(this.caller, attempt))
          throw new PaymentDomainError('payment_scope_denied');
        if (!existing) await this.deps.store.acceptAttempt(attempt);
        // Capability exists before a provider call, and exact-operation retry
        // returns the same encrypted token if the first HTTP response is lost.
        const capability = await this.deps.admission.issueStatusCapability(
          receipt,
          attempt.attemptId,
          86400000,
        );
        const result = existing
          ? await this.deps.sessions.resume(attempt.attemptId)
          : await this.deps.sessions.start(attempt);
        return this.response(200, {
          ...result,
          attemptId: attempt.attemptId,
          capability: capability.token,
          capabilityExpiresAt: capability.expiresAt,
        });
      }
      const read = (
        path === '/internal/payments/returns'
          ? returnSchema
          : path === '/internal/payments/session-retries'
            ? retrySchema
            : path === '/internal/payments/session-submit-checks'
              ? submitCheckSchema
              : readSchema
      ).safeParse(command);
      if (!read.success || read.data.requestId !== receipt.operationId)
        return this.response(400, { error: 'invalid_request' });
      if (
        !(await this.deps.admission.permitsStatus(
          read.data.capability,
          read.data.attemptId,
        ))
      )
        return this.response(401, { error: 'status_access_denied' });
      const attempt = await this.deps.store.readAttempt(read.data.attemptId);
      if (!attempt || !this.permits(this.caller, attempt))
        return this.response(401, { error: 'status_access_denied' });
      if (path === '/internal/payments/attempts') {
        const result = await this.deps.sessions.resume(attempt.attemptId);
        return this.response(200, { ...result, attemptId: attempt.attemptId });
      }
      if (path === '/internal/payments/session-retries') {
        if (!this.deps.sessions.retry)
          return this.response(503, { error: 'payment_service_unavailable' });
        const retry = retrySchema.parse(command);
        const result = await this.deps.sessions.retry({
          attemptId: attempt.attemptId,
          operationId: receipt.operationId,
          terminalReceipt: retry.terminalReceipt,
        });
        return this.response(200, { ...result, attemptId: attempt.attemptId });
      }
      if (path === '/internal/payments/session-submit-checks') {
        if (!this.deps.sessions.checkSubmit)
          return this.response(200, {
            attemptId: attempt.attemptId,
            state: 'session_submit_blocked',
            reason: 'unavailable',
          });
        const check = submitCheckSchema.parse(command);
        const result = await this.deps.sessions.checkSubmit({
          attemptId: attempt.attemptId,
          returnBinding: check.returnBinding,
        });
        return this.response(200, { attemptId: attempt.attemptId, ...result });
      }
      if (path === '/internal/payments/returns') {
        if (!this.deps.reconciliation)
          return this.response(503, { error: 'payment_service_unavailable' });
        const returned = returnSchema.parse(command);
        const result = await this.deps.reconciliation.verify({
          operationId: receipt.operationId,
          attemptId: attempt.attemptId,
          sessionResult: returned.sessionResult,
          ...(returned.returnBinding
            ? { returnBinding: returned.returnBinding }
            : {}),
        });
        const terminalRetry =
          result.state === 'terminal_nonpayment'
            ? await this.deps.reconciliation.readTerminalRetry?.(
                attempt.attemptId,
              )
            : null;
        const state =
          result.state === 'needs_review'
            ? 'needs_review'
            : result.state === 'terminal_nonpayment'
              ? 'terminal_nonpayment'
              : 'confirming_payment';
        const confirmation =
          state === 'confirming_payment'
            ? await this.deps.events.readConfirmationSummary?.(
                attempt.attemptId,
              )
            : null;
        return this.response(200, {
          attemptId: attempt.attemptId,
          state,
          ...(terminalRetry
            ? {
                retry: {
                  disposition: terminalRetry.disposition,
                  terminalReceipt: terminalRetry.terminalReceipt,
                },
              }
            : {}),
          ...(confirmation ? { confirmation } : {}),
        });
      }
      const reconciliationState = await this.deps.reconciliation?.readState(
        attempt.attemptId,
      );
      if (reconciliationState === 'needs_review')
        return this.response(200, {
          attemptId: attempt.attemptId,
          state: 'needs_review',
        });
      if (reconciliationState === 'terminal_nonpayment') {
        const retry = await this.deps.reconciliation?.readTerminalRetry?.(
          attempt.attemptId,
        );
        if (!retry)
          return this.response(200, {
            attemptId: attempt.attemptId,
            state: 'needs_review',
          });
        return this.response(200, {
          attemptId: attempt.attemptId,
          state: retry.state,
          retry: {
            disposition: retry.disposition,
            terminalReceipt: retry.terminalReceipt,
          },
        });
      }
      const evidence = await this.deps.events.readInternalEvidence(
        attempt.attemptId,
      );
      if (!evidence)
        return this.response(503, { error: 'payment_service_unavailable' });
      const state =
        evidence?.state === 'needs_review'
          ? 'needs_review'
          : evidence?.state === 'payment_pending'
            ? 'payment_pending'
            : evidence?.state === 'payment_failed'
              ? 'payment_failed'
              : evidence?.state === 'payment_reversed'
                ? 'payment_reversed'
                : evidence?.state === 'refund_pending'
                  ? 'refund_pending'
                  : evidence?.state === 'authorization_recorded' ||
                      evidence?.state === 'awaiting_prior_evidence'
                    ? 'confirming_payment'
                    : 'awaiting_payment';
      // No PSP refs, reasons, identities or session tokens in a status response.
      // No paid/access claim until the separately governed fulfillment adapter exists.
      const confirmation =
        state === 'confirming_payment'
          ? await this.deps.events.readConfirmationSummary?.(attempt.attemptId)
          : null;
      return this.response(200, {
        attemptId: attempt.attemptId,
        state,
        ...(confirmation ? { confirmation } : {}),
      });
    } catch (error) {
      const code =
        error instanceof PaymentDomainError && typeof error.code === 'string'
          ? error.code
          : '';
      if (code === 'internal_request_denied')
        return this.response(401, { error: 'request_access_denied' });
      if (code === 'internal_request_replayed')
        return this.response(409, { error: 'request_replayed' });
      if (
        [
          'invalid_contract',
          'quote_arithmetic_mismatch',
          'quote_time_mismatch',
          'discount_policy_missing',
          'free_order_requires_separate_admission',
          'quote_not_current_at_acceptance',
          'quote_expired_before_dispatch',
          'quote_not_current_at_attempt_creation',
          'invalid_attempt_identity',
          'invalid_capability_request',
          'invalid_payment_method_capabilities',
          'invalid_session_result_request',
          'invalid_return_binding',
          'return_binding_expired',
          'invalid_terminal_retry_request',
        ].includes(code)
      )
        return this.response(400, { error: 'invalid_request' });
      if (
        [
          'offer_not_enabled',
          'payment_scope_denied',
          'capability_scope_denied',
          'adyen_test_scope_mismatch',
          'payment_method_not_enabled',
          'payment_method_scope_mismatch',
          'provider_locale_mapping_required',
          'invalid_provider_locale',
          'payment_dispatch_disabled',
        ].includes(code)
      )
        return this.response(403, { error: 'checkout_unavailable' });
      if (
        code.includes('conflict') ||
        (error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === '23505')
      )
        return this.response(409, { error: 'checkout_conflict' });
      return this.response(503, { error: 'payment_service_unavailable' });
    } finally {
      release?.();
    }
  }
}
