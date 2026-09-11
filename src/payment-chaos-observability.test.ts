import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
  chaosPersonKey,
  PaymentChaosObservabilityWorker,
  type PaymentChaosObservabilityConfig,
} from './payment-chaos-observability.js';
import type { PaymentChaosObservabilityStore } from './payment-chaos-observability.js';

const config: PaymentChaosObservabilityConfig = {
  environment: 'live',
  endpoint: 'https://chaos.example/wp-json/chaos/v1/lifecycle-event',
  webhookToken: 'w'.repeat(32),
  identityHmacSecret: 'i'.repeat(32),
  batchSize: 20,
  pollIntervalMs: 1000,
};

const row = {
  id: 7,
  source_event_sha256: 'a'.repeat(64),
  scope_sha256: 'd'.repeat(64),
  attempt_id: '00000000-0000-4000-8000-000000000001',
  event_name: 'checkout_started' as const,
  action: 'session_ready' as const,
  outcome: 'ready' as const,
  reason_code: 'none',
  session_sequence: 1,
  evidence_class: 'signed_private_response',
  occurred_at: '2026-09-11T12:00:00.000Z',
  attempts: 1,
  lease_token: '00000000-0000-4000-8000-000000000002',
};

function store(overrides: Record<string, unknown> = {}) {
  return {
    projectCommitted: vi.fn().mockResolvedValue(1),
    claim: vi.fn().mockResolvedValueOnce([row]).mockResolvedValue([]),
    deliveryAuthority: vi
      .fn()
      .mockResolvedValue({ state: 'send', personKey: 'b'.repeat(64) }),
    markAccepted: vi.fn().mockResolvedValue(undefined),
    markSuppressed: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(false),
    ...overrides,
  } as unknown as PaymentChaosObservabilityStore;
}

describe('PaymentChaosObservabilityWorker', () => {
  it('refuses TEST or noncanonical endpoint configuration before delivery', () => {
    expect(
      () =>
        new PaymentChaosObservabilityWorker(store(), {
          ...config,
          environment: 'test',
        } as unknown as PaymentChaosObservabilityConfig),
    ).toThrow('invalid_payment_chaos_configuration');
    expect(
      () =>
        new PaymentChaosObservabilityWorker(store(), {
          ...config,
          endpoint: 'https://chaos.example/collect',
        }),
    ).toThrow('invalid_payment_chaos_configuration');
  });

  it('projects without a browser and sends only minimized hashed authority', async () => {
    const ledger = store();
    const transport = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'recorded' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const worker = new PaymentChaosObservabilityWorker(
      ledger,
      config,
      transport,
    );
    await expect(worker.drainOnce()).resolves.toEqual({
      projected: 1,
      processed: 1,
      accepted: 1,
      suppressed: 0,
      retried: 0,
      deadLettered: 0,
    });
    expect(ledger.projectCommitted).toHaveBeenCalledWith(20);
    expect(ledger.markAccepted).toHaveBeenCalledWith(row, 200);
    const request = transport.mock.calls[0][1] as RequestInit;
    expect(request.redirect).toBe('error');
    const body = JSON.parse(String(request.body));
    expect(body).toMatchObject({
      event_name: 'checkout_started',
      source_system: 'nanoclaw_adyen',
      identity: { person_key: 'b'.repeat(64) },
      program: 'mcs',
      product_slug: 'mcq-program-a-foundations',
      properties: {
        payment_provider: 'adyen',
        environment: 'live',
        payment_action: 'session_ready',
        payment_outcome: 'ready',
        reason_code: 'none',
        sequence: 'initial',
        evidence_class: 'signed_private_response',
      },
    });
    expect(body.source_event_id).toMatch(
      /^payment-observability-v1:[a-f0-9]{64}$/,
    );
    expect(JSON.stringify(body)).not.toContain(row.attempt_id);
    expect(JSON.stringify(body)).not.toMatch(
      /email|sessionResult|returnBinding|pspReference|merchantReference/i,
    );
  });

  it('requires canonical admission before emitting purchase completion', async () => {
    const purchase = {
      ...row,
      source_event_sha256: 'c'.repeat(64),
      event_name: 'purchase_completed' as const,
      action: 'purchase_admitted' as const,
      outcome: 'verified' as const,
      evidence_class: 'canonical_enrollment',
      session_sequence: 2,
    };
    const transport = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: 'duplicate' }), { status: 200 }),
      );
    const worker = new PaymentChaosObservabilityWorker(
      store({
        claim: vi.fn().mockResolvedValueOnce([purchase]).mockResolvedValue([]),
      }),
      config,
      transport,
    );
    await worker.drainOnce();
    const body = JSON.parse(String(transport.mock.calls[0][1].body));
    expect(body.properties).toMatchObject({
      sequence: 'retry',
      authorization_state: 'verified',
      enrollment_state: 'admitted',
      settlement_state: 'unproven',
    });
  });

  it('suppresses denied consent without calling the external route', async () => {
    const ledger = store({
      deliveryAuthority: vi.fn().mockResolvedValue({
        state: 'suppress',
        reason: 'tracking_consent_denied',
      }),
    });
    const transport = vi.fn();
    const worker = new PaymentChaosObservabilityWorker(
      ledger,
      config,
      transport,
    );
    await expect(worker.drainOnce()).resolves.toMatchObject({ suppressed: 1 });
    expect(transport).not.toHaveBeenCalled();
    expect(ledger.markSuppressed).toHaveBeenCalledWith(
      row,
      'tracking_consent_denied',
    );
  });

  it('records transport failure for retry without failing the payment caller', async () => {
    const ledger = store();
    const worker = new PaymentChaosObservabilityWorker(
      ledger,
      config,
      vi.fn().mockRejectedValue(new Error('network body with private details')),
    );
    await expect(worker.drainOnce()).resolves.toMatchObject({ retried: 1 });
    expect(ledger.markFailed).toHaveBeenCalledWith(
      row,
      'transport_error',
      null,
    );
  });

  it('restarts from durable state and sends no duplicate accepted row', async () => {
    const transport = vi.fn();
    const worker = new PaymentChaosObservabilityWorker(
      store({
        projectCommitted: vi.fn().mockResolvedValue(0),
        claim: vi.fn().mockResolvedValue([]),
      }),
      config,
      transport,
    );
    await expect(worker.drainOnce()).resolves.toMatchObject({
      projected: 0,
      processed: 0,
      accepted: 0,
    });
    expect(transport).not.toHaveBeenCalled();
  });
});

describe('payment observability contract', () => {
  it('matches Chaos person-key normalization and HMAC semantics exactly', () => {
    const secret = randomBytes(32).toString('hex');
    const expected = createHmac('sha256', secret)
      .update('chaos-person-v1|payer@example.test')
      .digest('hex');
    expect(chaosPersonKey(' Payer@Example.Test ', secret)).toBe(expected);
  });

  it('projects only committed card-first facts and never stores provider or contact fields', () => {
    const source = readFileSync(
      new URL('./payment-chaos-observability.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain('payment_attempts');
    expect(source).toContain('payment_operation_receipts');
    expect(source).toContain('payment_session_terminal_nonpayment_receipts');
    expect(source).toContain('payment_event_exceptions');
    expect(source).toContain('payment_session_retry_exceptions');
    expect(source).toContain('payment_enrollment_admissions');
    expect(source).toContain("pe.fact->>'success'='true'");
    expect(source).not.toContain('purchase_refunded');

    const migration = readFileSync(
      new URL(
        '../data/business/migrations/nanoclaw-v2/160_payment_chaos_observability.sql',
        import.meta.url,
      ),
      'utf8',
    );
    expect(migration).toContain('payment_chaos_observability_receipts');
    expect(migration).toContain('payment_chaos_observability_guard');
    expect(migration).not.toMatch(
      /\b(email|name|provider_event_id|psp_reference)\b/i,
    );
  });
});
