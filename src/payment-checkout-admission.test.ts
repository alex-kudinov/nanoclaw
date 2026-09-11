import { describe, expect, it } from 'vitest';

import {
  CheckoutAdmissionEvidenceIssuer,
  parsePaymentCheckoutAdmissionCommand,
  validateCheckoutDocumentPolicies,
} from './payment-checkout-admission.js';

const command = {
  schemaVersion: 1,
  requestId: '10000000-0000-4000-8000-000000000001',
  attemptId: '20000000-0000-4000-8000-000000000002',
  quoteId: '30000000-0000-4000-8000-000000000003',
  quoteFingerprint: 'a'.repeat(64),
  identity: {
    preparationId: '40000000-0000-4000-8000-000000000004',
    originOperationId: '50000000-0000-4000-8000-000000000005',
    receiptReference: 'identity-preparation:v1:fixture',
    payerReference: 'party-ref:v1:payer',
    participantReference: 'party-ref:v1:payer',
    payerRoleProof: 'party-role-proof:v1:payer',
    participantRoleProof: 'party-role-proof:v1:participant',
    purchaseRelationship: 'self',
  },
  consentBundle: {
    bundleReceiptReference: 'consent-bundle:v1:fixture',
    enrollmentTerms: {
      version: 'terms-v1',
      contentSha256: 'b'.repeat(64),
      receiptReference: 'terms:v1:fixture',
      acceptedAt: 100,
    },
    privacy: {
      version: 'privacy-v1',
      contentSha256: 'c'.repeat(64),
      receiptReference: 'privacy:v1:fixture',
      acceptedAt: 100,
    },
    achMandate: null,
  },
};

describe('checkout admission evidence contract', () => {
  it('accepts exact general consent and bounded optional WEB fixture mandate', () => {
    expect(parsePaymentCheckoutAdmissionCommand(command)).toEqual(command);
    expect(
      parsePaymentCheckoutAdmissionCommand({
        ...command,
        consentBundle: {
          ...command.consentBundle,
          achMandate: {
            version: 'mandate-v1',
            contentSha256: 'd'.repeat(64),
            receiptReference: 'mandate:v1:fixture',
            acceptedAt: 101,
            amountMinor: 19900,
            currency: 'USD',
            frequency: 'one_time',
            secCode: 'WEB',
          },
        },
      }),
    ).toMatchObject({
      consentBundle: { achMandate: { secCode: 'WEB' } },
    });
  });

  it.each([
    {
      identity: {
        ...command.identity,
        payerRoleProof: command.identity.participantRoleProof,
      },
    },
    {
      identity: {
        ...command.identity,
        purchaseRelationship: 'other',
      },
    },
    {
      consentBundle: {
        ...command.consentBundle,
        privacy: { ...command.consentBundle.privacy, acceptedAt: 101 },
      },
    },
    { browserSuccess: true },
  ])('rejects inconsistent or browser-selected evidence %#', (change) => {
    expect(() =>
      parsePaymentCheckoutAdmissionCommand({ ...command, ...change }),
    ).toThrow('invalid_checkout_admission_request');
  });

  it('validates fixed policy registry intervals and content identities', () => {
    expect(
      validateCheckoutDocumentPolicies([
        {
          kind: 'enrollment_terms',
          version: 'terms-v1',
          contentSha256: 'a'.repeat(64),
          effectiveFrom: 10,
          effectiveTo: 20,
        },
        {
          kind: 'privacy',
          version: 'privacy-v1',
          contentSha256: 'b'.repeat(64),
          effectiveFrom: 10,
          effectiveTo: null,
        },
      ]),
    ).toHaveLength(2);
    expect(() =>
      validateCheckoutDocumentPolicies([
        {
          kind: 'enrollment_terms',
          version: 'terms-v1',
          contentSha256: 'a'.repeat(64),
          effectiveFrom: 20,
          effectiveTo: 10,
        },
        {
          kind: 'privacy',
          version: 'privacy-v1',
          contentSha256: 'b'.repeat(64),
          effectiveFrom: 10,
          effectiveTo: null,
        },
      ]),
    ).toThrow('invalid_checkout_admission_configuration');
  });

  it('issues a stable opaque evidence reference bound to supplied semantics', () => {
    const issuer = new CheckoutAdmissionEvidenceIssuer(
      Buffer.from('x'.repeat(32)),
    );
    const first = issuer.issue(['scope', 'caller', 'operation', 'attempt']);
    expect(first).toMatch(/^checkout-admission:v1:[a-f0-9]{64}$/);
    expect(issuer.issue(['scope', 'caller', 'operation', 'attempt'])).toBe(
      first,
    );
    expect(issuer.issue(['scope', 'other', 'operation', 'attempt'])).not.toBe(
      first,
    );
  });
});
