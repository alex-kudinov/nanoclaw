/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';

import {
  beginContadorFulfillmentWithClient,
  finalizeContadorFulfillmentWithClient,
} from './contador-payment-fulfillment-store.js';

const LEASE = '00000000-0000-4000-8000-000000000001';

function caseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '42',
    stripe_account: 'heartbeat',
    payment_intent_id: 'pi_test',
    state: 'processing',
    version: 0,
    attempt_count: 1,
    lease_token: LEASE,
    lease_expires_at: '2026-08-24T03:05:00.000Z',
    lease_active: true,
    owner_group: 'contador',
    last_event_type: 'payment_intent.succeeded',
    last_source_object_id: 'pi_test',
    last_source_event_id: 'evt_test',
    last_error_code: null,
    last_evidence_sha256: 'a'.repeat(64),
    review_deadline: null,
    resolved_at: null,
    ...overrides,
  };
}

function beginInput() {
  return {
    stripeAccount: 'heartbeat' as const,
    paymentIntentId: 'pi_test',
    sourceObjectId: 'pi_test',
    sourceEventId: 'evt_test',
    eventType: 'payment_intent.succeeded',
    observedAt: '2026-08-24T03:00:00.000Z',
    leaseToken: LEASE,
    aliases: [{ kind: 'payment_intent' as const, id: 'pi_test' }],
  };
}

describe('Contador payment fulfillment store', () => {
  it('admits one new case before processor work and records the source receipt', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [] }) // no case
      .mockResolvedValueOnce({ rows: [caseRow()] }) // insert case
      .mockResolvedValueOnce({ rows: [] }) // no alias
      .mockResolvedValueOnce({ rows: [] }) // insert alias
      .mockResolvedValueOnce({ rows: [] }); // admission receipt
    const result = await beginContadorFulfillmentWithClient(
      { query } as any,
      beginInput(),
    );
    expect(result).toMatchObject({
      duplicateComplete: false,
      inFlight: false,
      leaseToken: LEASE,
      item: { id: '42', state: 'processing', version: 0, attemptCount: 1 },
    });
    expect(query.mock.calls[2][0]).toContain(
      'contador_payment_fulfillment_cases',
    );
    expect(query.mock.calls[5][0]).toContain(
      'contador_payment_fulfillment_receipts',
    );
  });

  it('returns a verified complete replay without starting another attempt', async () => {
    const complete = caseRow({
      state: 'complete',
      version: 2,
      attempt_count: 2,
      lease_token: null,
      lease_expires_at: null,
      lease_active: false,
      resolved_at: '2026-08-24T03:01:00.000Z',
    });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [complete] })
      .mockResolvedValueOnce({ rows: [{ case_id: '42' }] });
    const result = await beginContadorFulfillmentWithClient(
      { query } as any,
      beginInput(),
    );
    expect(result).toMatchObject({
      duplicateComplete: true,
      inFlight: false,
      leaseToken: null,
      item: { state: 'complete', version: 2, attemptCount: 2 },
    });
    expect(
      query.mock.calls.some((call) =>
        String(call[0]).includes(
          'INSERT INTO business_v2.contador_payment_fulfillment_receipts',
        ),
      ),
    ).toBe(false);
  });

  it('refuses a second processor while the existing lease is active', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [caseRow()] })
      .mockResolvedValueOnce({ rows: [{ case_id: '42' }] });
    const result = await beginContadorFulfillmentWithClient(
      { query } as any,
      beginInput(),
    );
    expect(result).toMatchObject({
      duplicateComplete: false,
      inFlight: true,
      leaseToken: null,
      item: { id: '42', version: 0, attemptCount: 1 },
    });
    expect(
      query.mock.calls.some((call) =>
        String(call[0]).includes('attempt_count = attempt_count + 1'),
      ),
    ).toBe(false);
    expect(
      query.mock.calls.some((call) =>
        String(call[0]).includes(
          'INSERT INTO business_v2.contador_payment_fulfillment_receipts',
        ),
      ),
    ).toBe(false);
  });

  it('finalizes only the exact processing version with stage and final receipts', async () => {
    const finalRow = caseRow({
      state: 'complete',
      resolved_at: '2026-08-24T03:01:00.000Z',
    });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [caseRow()] }) // lock
      .mockResolvedValueOnce({ rows: [] }) // stripe receipt
      .mockResolvedValueOnce({ rows: [] }) // payment log receipt
      .mockResolvedValueOnce({ rows: [] }) // Postgres receipt
      .mockResolvedValueOnce({ rows: [] }) // roster receipt
      .mockResolvedValueOnce({ rows: [finalRow] }) // case update
      .mockResolvedValueOnce({ rows: [] }); // final receipt
    const result = await finalizeContadorFulfillmentWithClient(
      { query } as any,
      {
        caseId: '42',
        expectedVersion: 0,
        leaseToken: LEASE,
        sourceEventId: 'evt_test',
        state: 'complete',
        errorCode: null,
        occurredAt: '2026-08-24T03:01:00.000Z',
        aliases: [],
        receipts: [
          {
            stage: 'stripe_source',
            outcome: 'verified',
            resultCode: 'stripe_source_resolved',
          },
          {
            stage: 'payment_log',
            outcome: 'verified',
            resultCode: 'payment_log_readback_verified',
          },
          {
            stage: 'postgres_payment',
            outcome: 'verified',
            resultCode: 'postgres_payment_readback_verified',
          },
          {
            stage: 'student_roster',
            outcome: 'verified',
            resultCode: 'student_roster_readback_verified',
          },
        ],
      },
    );
    expect(result).toMatchObject({
      state: 'complete',
      resolvedAt: expect.any(String),
    });
    expect(query.mock.calls[5][0]).toContain('state = $2');
    expect(query.mock.calls[5][1]).toEqual([
      '42',
      'complete',
      null,
      expect.stringMatching(/^[0-9a-f]{64}$/),
      '2026-08-24T03:01:00.000Z',
      0,
      LEASE,
    ]);
  });

  it('rejects invalid final state/error pairs before touching the database', async () => {
    const query = vi.fn();
    await expect(
      finalizeContadorFulfillmentWithClient({ query } as any, {
        caseId: '42',
        expectedVersion: 0,
        leaseToken: LEASE,
        sourceEventId: 'evt_test',
        state: 'needs_product',
        errorCode: null,
        occurredAt: '2026-08-24T03:01:00.000Z',
        aliases: [],
        receipts: [],
      }),
    ).rejects.toThrow('final state/error mismatch');
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses completion without every verified readback stage', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [caseRow()] });
    await expect(
      finalizeContadorFulfillmentWithClient({ query } as any, {
        caseId: '42',
        expectedVersion: 0,
        leaseToken: LEASE,
        sourceEventId: 'evt_test',
        state: 'complete',
        errorCode: null,
        occurredAt: '2026-08-24T03:01:00.000Z',
        aliases: [],
        receipts: [
          {
            stage: 'stripe_source',
            outcome: 'verified',
            resultCode: 'stripe_source_resolved',
          },
          {
            stage: 'payment_log',
            outcome: 'verified',
            resultCode: 'payment_log_readback_verified',
          },
        ],
      }),
    ).rejects.toThrow('postgres_payment receipt is required');
  });

  it('fails closed when a provider alias already belongs to another case', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [caseRow()] })
      .mockResolvedValueOnce({ rows: [{ case_id: '99' }] });
    await expect(
      beginContadorFulfillmentWithClient({ query } as any, beginInput()),
    ).rejects.toThrow('provider alias belongs to another case');
  });
});
