import { describe, expect, it } from 'vitest';

import {
  clientRelationshipProjectionEnabled,
  deriveClientRelationshipProjection,
} from './relationship-context-client-projection.js';

function evidence(
  overrides: Partial<
    Parameters<typeof deriveClientRelationshipProjection>[0]
  > = {},
) {
  return {
    partyType: 'person',
    recordedClientRoleCount: 0,
    recordedStudentRoleCount: 0,
    recordedProspectRoleCount: 0,
    succeededPaymentIntentCount: 0,
    activeSubscriptionCount: 0,
    ...overrides,
  };
}

describe('relationship context client relationship projection', () => {
  it('keeps recorded client role, paid history, subscription, and other roles distinct', () => {
    expect(
      deriveClientRelationshipProjection(
        evidence({
          recordedClientRoleCount: 1,
          recordedProspectRoleCount: 1,
          succeededPaymentIntentCount: 2,
          activeSubscriptionCount: 1,
        }),
      ),
    ).toEqual({
      schema_version: 1,
      party_type: 'person',
      relationship_state: 'paid_customer',
      customer_or_client: true,
      recorded_client_role: true,
      paid_customer_history: true,
      active_subscription: true,
      recorded_student_role: false,
      recorded_prospect_role: true,
      active_engagement_status: 'unknown',
      evidence_counts: {
        recorded_client_roles: 1,
        succeeded_payment_intents: 2,
        active_subscriptions: 1,
        recorded_student_roles: 0,
        recorded_prospect_roles: 1,
      },
      evidence_tiers: [
        'stripe_succeeded_payment_v1',
        'stripe_current_active_subscription_v1',
        'unproven_client_role_v1',
        'recorded_prospect_role_v1',
      ],
    });
  });

  it('does not treat an unproven recorded client role as authoritative', () => {
    expect(
      deriveClientRelationshipProjection(
        evidence({ recordedClientRoleCount: 1 }),
      ),
    ).toMatchObject({
      relationship_state: 'recorded_client',
      customer_or_client: false,
      recorded_client_role: true,
      active_engagement_status: 'unknown',
    });
  });

  it('does not turn a prospect, student, or unknown Party into a client', () => {
    expect(
      deriveClientRelationshipProjection(
        evidence({ recordedStudentRoleCount: 1 }),
      ),
    ).toMatchObject({
      relationship_state: 'recorded_student',
      customer_or_client: false,
      active_engagement_status: 'unknown',
    });
    expect(
      deriveClientRelationshipProjection(
        evidence({ recordedProspectRoleCount: 1 }),
      ),
    ).toMatchObject({
      relationship_state: 'recorded_prospect',
      customer_or_client: false,
      active_engagement_status: 'unknown',
    });
    expect(deriveClientRelationshipProjection(evidence())).toMatchObject({
      relationship_state: 'unknown',
      customer_or_client: false,
      active_engagement_status: 'unknown',
    });
  });

  it('recognizes active subscription as customer evidence without claiming engagement', () => {
    expect(
      deriveClientRelationshipProjection(
        evidence({ activeSubscriptionCount: 1 }),
      ),
    ).toMatchObject({
      relationship_state: 'paid_customer',
      customer_or_client: true,
      paid_customer_history: false,
      active_subscription: true,
      active_engagement_status: 'unknown',
    });
  });

  it('rejects malformed evidence counts and defaults the runtime flag off', () => {
    expect(() =>
      deriveClientRelationshipProjection(
        evidence({ succeededPaymentIntentCount: -1 }),
      ),
    ).toThrow('relationship_context_client_evidence_invalid');
    expect(clientRelationshipProjectionEnabled({})).toBe(false);
    expect(
      clientRelationshipProjectionEnabled({
        RELATIONSHIP_CONTEXT_CLIENT_PROJECTION_ENABLED: '1',
      }),
    ).toBe(true);
  });

  it('contains no identity or provider payload values', () => {
    const serialized = JSON.stringify(
      deriveClientRelationshipProjection(
        evidence({
          recordedClientRoleCount: 1,
          succeededPaymentIntentCount: 1,
        }),
      ),
    );
    expect(serialized).not.toMatch(
      /email|name|phone|address|amount|currency|external_id|source_record_id|payload|metadata/i,
    );
  });
});
