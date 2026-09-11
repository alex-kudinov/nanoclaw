import { describe, expect, it } from 'vitest';

import { holdDisabledHeartbeatTestDelivery } from './website-checkout-heartbeat-test-delivery.js';

describe('website checkout Heartbeat TEST access state', () => {
  it('keeps non-materialized enrollment not requested and holds materialized enrollment while disabled', () => {
    const held = {
      disposition: 'held' as const,
      orderKey: 'website-checkout:fixture',
      canonicalEnrollment: 'not_materialized' as const,
      accessDelivery: 'not_requested' as const,
      certificateFinancialClearance: 'not_evaluated' as const,
      currentPaymentState: 'pending' as const,
      reasons: ['payment_evidence_pending'],
      evidenceReference: null,
    };
    expect(holdDisabledHeartbeatTestDelivery(held)).toBe(held);

    const accepted = {
      ...held,
      disposition: 'accepted' as const,
      canonicalEnrollment: 'materialized' as const,
      currentPaymentState: 'eligible' as const,
      evidenceReference: `enrollment-admission:v1:${'a'.repeat(64)}`,
    };
    expect(holdDisabledHeartbeatTestDelivery(accepted)).toMatchObject({
      accessDelivery: 'held',
      reasons: expect.arrayContaining([
        'heartbeat_membership_delivery_disabled',
      ]),
    });
  });
});
