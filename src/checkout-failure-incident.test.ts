import fs from 'fs';
import { describe, expect, it } from 'vitest';

import {
  formatCheckoutRecoveryOperatorIncident,
  type CheckoutRecoveryOperatorIncident,
} from './checkout-recovery-store.js';

const migration = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/140_checkout_failure_incidents.sql',
    import.meta.url,
  ),
  'utf8',
);
const rollback = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/rollback_140_checkout_failure_incidents.sql',
    import.meta.url,
  ),
  'utf8',
);
const releaseBuilder = fs.readFileSync(
  new URL('../scripts/build-release.mjs', import.meta.url),
  'utf8',
);
const storeSource = fs.readFileSync(
  new URL('./checkout-recovery-store.ts', import.meta.url),
  'utf8',
);

function incident(
  overrides: Partial<CheckoutRecoveryOperatorIncident> = {},
): CheckoutRecoveryOperatorIncident {
  return {
    incidentId: 4,
    incidentUuid: '11111111-1111-4111-8111-111111111111',
    version: 3,
    isRoot: true,
    threadKey: 'checkout:failure:11111111-1111-4111-8111-111111111111',
    kind: 'payment_failed',
    outcome: 'open',
    partyId: 10216,
    partyDisplayName: 'Irina Sergeeva',
    relationshipState: 'recorded_prospect',
    productName: 'Mentor Coaching Foundations',
    productKey: 'mcs-foundations',
    amountCents: 29900,
    currency: 'usd',
    guidanceKey: 'contact_issuer_or_change_method',
    paymentMethodBrand: 'visa',
    paymentMethodLast4: '3188',
    caseCount: 2,
    paymentIntentCount: 2,
    providerFailureCount: 6,
    episodeStartedAt: '2026-08-29T15:06:13.000Z',
    lastFailureAt: '2026-08-29T15:12:13.000Z',
    reminderState: 'not_sent_consent_missing',
    ...overrides,
  };
}

describe('checkout failure operator incident', () => {
  it('renders one useful human-first incident without implementation states', () => {
    const message = formatCheckoutRecoveryOperatorIncident(incident());
    expect(message).toContain(
      'Payment unsuccessful: Mentor Coaching Foundations — USD 299.00',
    );
    expect(message).toContain('Irina Sergeeva — Party 10216');
    expect(message).toContain('visa ending 3188');
    expect(message).toContain('2 payment intents / 6 provider failures');
    expect(message).toContain(
      'Reminder: not sent — checkout reminder consent was not received.',
    );
    expect(message).not.toMatch(
      /checkout shadow|shadow_ready|unknown\/unknown/,
    );
    expect(message).not.toContain('do_not_honor');
  });

  it('renders a purchase closure as one thread update', () => {
    expect(
      formatCheckoutRecoveryOperatorIncident(
        incident({ outcome: 'purchased', isRoot: false }),
      ),
    ).toContain('Checkout completed after the failed attempt');
  });

  it('defines an atomic fixed-window incident authority and guarded rollback', () => {
    expect(migration).toContain(
      'CREATE TABLE business_v2.checkout_recovery_operator_incidents',
    );
    expect(migration).toContain(
      'CREATE TABLE business_v2.checkout_recovery_operator_incident_cases',
    );
    expect(migration).toContain(
      'incident_key               text NOT NULL UNIQUE',
    );
    expect(migration).toContain(
      'case_id                    bigint NOT NULL UNIQUE',
    );
    expect(rollback).toContain(
      'rollback refused: checkout failure incident evidence exists',
    );
    expect(releaseBuilder).toContain('140_checkout_failure_incidents.sql');
    expect(releaseBuilder).toContain(
      'rollback_140_checkout_failure_incidents.sql',
    );
  });

  it('allows one purchase closure update but refuses sibling failure reopening', () => {
    expect(storeSource).toContain(
      "if (incident?.status === 'closed') return Number(incident.id)",
    );
    expect(storeSource).toContain("i.status<>'closed' OR");
    expect(storeSource).toContain('i.closed_at>i.last_notified_at');
  });
});
