import { z } from 'zod';

import {
  assertAdyenScopeForEnvironment,
  resolveAdyenEnvironment,
  type AdyenEnvironmentProfile,
} from './adyen-environment.js';
import { adyenAttemptReference } from './adyen-payment-identifiers.js';
import type { AdyenApiCredential } from './adyen-session-adapter.js';
import {
  paymentMethodCapabilitiesForAttempt,
  paymentScopeFingerprint,
  PaymentDomainError,
  validateAttempt,
  type PaymentMethodCapability,
  type PaymentScope,
} from './payment-domain.js';

const MAX_RESPONSE_BYTES = 131072;
const REQUEST_TIMEOUT_MS = 15000;
const reference = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_:.\/-]+$/);
const responseBaseSchema = z
  .object({
    id: z.string().min(1).max(200),
    status: z.string().min(1).max(80),
    reference: reference.optional(),
    payments: z
      .array(
        z
          .object({
            pspReference: reference,
            resultCode: z.string().min(1).max(80),
            amount: z
              .object({
                value: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
                currency: z.string().regex(/^[A-Z]{3}$/),
              })
              .strict(),
            paymentMethod: z
              .object({ type: z.string().min(1).max(80) })
              .passthrough(),
          })
          .passthrough(),
      )
      .max(20)
      .optional(),
  })
  .passthrough();

export interface VerifiedAdyenSessionPayment {
  attemptId: string;
  sessionId: string;
  paymentReference: string;
  paymentMethod: PaymentMethodCapability;
  amount: number;
  currency: string;
}
export interface VerifiedAdyenSessionTerminalNonpayment {
  attemptId: string;
  sessionId: string;
  status: 'refused' | 'canceled' | 'expired';
}
export type VerifiedAdyenSessionResult =
  | VerifiedAdyenSessionPayment
  | VerifiedAdyenSessionTerminalNonpayment;
export type VerifiedAdyenTestSessionPayment = VerifiedAdyenSessionPayment;

function withDeadline<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted)
    return Promise.reject(new PaymentDomainError('provider_outcome_unknown'));
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(new PaymentDomainError('provider_outcome_unknown'));
    };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    work.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

async function readBoundedJson(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  if (!response.body) throw new PaymentDomainError('provider_outcome_unknown');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await withDeadline(reader.read(), signal);
      if (done) break;
      size += value.length;
      if (size > MAX_RESPONSE_BYTES)
        throw new PaymentDomainError('provider_outcome_unknown');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    await withDeadline(reader.cancel(), signal).catch(() => undefined);
  }
}

function publicMethod(providerType: string): PaymentMethodCapability | null {
  if (providerType === 'scheme') return 'card';
  if (providerType === 'ach') return 'ach_direct_debit';
  return null;
}

/**
 * One authenticated, non-polling provider read that verifies the actual method used.
 * The browser's sessionResult is untrusted until this call returns a binding.
 */
export class AdyenSessionResultAdapter {
  #apiKey: string;
  private readonly scopeHash: string;
  constructor(
    credential: AdyenApiCredential,
    scope: PaymentScope,
    private readonly profile: AdyenEnvironmentProfile,
    private readonly transport: typeof fetch = fetch,
    private readonly requestTimeoutMs: number = REQUEST_TIMEOUT_MS,
    private readonly scopeMismatchCode = 'adyen_scope_mismatch',
  ) {
    if (
      credential.environment !== profile.environment ||
      !credential.apiKey ||
      /[\r\n]/.test(credential.apiKey)
    )
      throw new PaymentDomainError('adyen_key_unavailable');
    this.#apiKey = credential.apiKey;
    try {
      assertAdyenScopeForEnvironment(scope, profile);
    } catch {
      throw new PaymentDomainError(this.scopeMismatchCode);
    }
    this.scopeHash = paymentScopeFingerprint(scope);
    if (
      !Number.isSafeInteger(requestTimeoutMs) ||
      requestTimeoutMs < 1 ||
      requestTimeoutMs > REQUEST_TIMEOUT_MS
    )
      throw new PaymentDomainError('invalid_session_result_configuration');
  }

  async verify(input: {
    attempt: unknown;
    sessionId: string;
    sessionResult: string;
    sessionSequence?: number;
  }): Promise<VerifiedAdyenSessionResult> {
    const attempt = validateAttempt(input.attempt);
    if (
      attempt.scope.environment !== this.profile.environment ||
      paymentScopeFingerprint(attempt.scope) !== this.scopeHash
    )
      throw new PaymentDomainError(this.scopeMismatchCode);
    if (
      typeof input.sessionId !== 'string' ||
      input.sessionId.length < 1 ||
      input.sessionId.length > 200 ||
      /[\r\n]/.test(input.sessionId) ||
      typeof input.sessionResult !== 'string' ||
      input.sessionResult.length < 1 ||
      Buffer.byteLength(input.sessionResult) > 65536 ||
      /[\r\n]/.test(input.sessionResult)
    )
      throw new PaymentDomainError('invalid_session_result_request');

    let raw: unknown;
    try {
      const url = new URL(
        `${this.profile.sessionsPath}${encodeURIComponent(input.sessionId)}`,
        this.profile.sessionsOrigin,
      );
      url.searchParams.set('sessionResult', input.sessionResult);
      const signal = AbortSignal.timeout(this.requestTimeoutMs);
      const response = await withDeadline(
        this.transport(url, {
          method: 'GET',
          redirect: 'error',
          signal,
          headers: { 'X-API-Key': this.#apiKey },
        }),
        signal,
      );
      if (!response.ok) {
        if (response.body)
          await withDeadline(response.body.cancel(), signal).catch(
            () => undefined,
          );
        throw new PaymentDomainError('provider_outcome_unknown');
      }
      raw = await readBoundedJson(response, signal);
    } catch {
      throw new PaymentDomainError('provider_outcome_unknown');
    }

    const parsed = responseBaseSchema.safeParse(raw);
    const sessionSequence = input.sessionSequence ?? 1;
    if (
      !Number.isSafeInteger(sessionSequence) ||
      sessionSequence < 1 ||
      sessionSequence > 3
    )
      throw new PaymentDomainError('invalid_session_result_request');
    const expectedReference = adyenAttemptReference(
      attempt.attemptId,
      this.profile,
      sessionSequence,
    );
    if (
      parsed.success &&
      parsed.data.id === input.sessionId &&
      ['refused', 'canceled', 'expired'].includes(parsed.data.status)
    ) {
      if (
        parsed.data.reference !== undefined &&
        parsed.data.reference !== expectedReference
      )
        throw new PaymentDomainError('provider_session_result_conflict');
      return Object.freeze({
        attemptId: attempt.attemptId,
        sessionId: input.sessionId,
        status: parsed.data.status as 'refused' | 'canceled' | 'expired',
      });
    }
    if (
      !parsed.success ||
      parsed.data.id !== input.sessionId ||
      parsed.data.status !== 'completed' ||
      parsed.data.reference === undefined ||
      parsed.data.payments === undefined ||
      parsed.data.payments.length !== 1
    )
      throw new PaymentDomainError('provider_session_result_conflict');
    const payment = parsed.data.payments[0];
    const method = publicMethod(payment.paymentMethod.type);
    if (
      method === null ||
      parsed.data.reference !== expectedReference ||
      payment.resultCode !== 'Authorised' ||
      !paymentMethodCapabilitiesForAttempt(attempt).includes(method) ||
      payment.amount.value !== attempt.quote.finalAmount ||
      payment.amount.currency !== attempt.quote.currency
    )
      throw new PaymentDomainError('provider_session_result_conflict');
    return Object.freeze({
      attemptId: attempt.attemptId,
      sessionId: input.sessionId,
      paymentReference: payment.pspReference,
      paymentMethod: method,
      amount: payment.amount.value,
      currency: payment.amount.currency,
    });
  }
}

/** Compatibility wrapper for the existing TEST-only composition. */
export class AdyenTestSessionResultAdapter extends AdyenSessionResultAdapter {
  constructor(
    apiKey: string,
    scope: PaymentScope,
    transport: typeof fetch = fetch,
    requestTimeoutMs: number = REQUEST_TIMEOUT_MS,
  ) {
    super(
      { environment: 'test', apiKey },
      scope,
      resolveAdyenEnvironment({
        environment: 'test',
        liveEndpointPrefix: null,
      }),
      transport,
      requestTimeoutMs,
      'adyen_test_scope_mismatch',
    );
  }
}
