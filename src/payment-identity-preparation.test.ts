import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  PaymentIdentityReferenceIssuer,
  identityBodySha256,
  parsePaymentIdentityResolveCommand,
  parsePaymentIdentityStatusCommand,
} from './payment-identity-preparation.js';
import { PaymentResponseSigner } from './payment-signed-response-controller.js';

const scope = {
  provider: 'adyen' as const,
  environment: 'test' as const,
  company: 'company',
  merchant: 'merchant',
  store: 'store',
  endpointRegion: 'eu',
};
const resolve = {
  schemaVersion: 1,
  requestId: '10000000-0000-4000-8000-000000000001',
  preparationId: '20000000-0000-4000-8000-000000000002',
  intentId: '30000000-0000-4000-8000-000000000003',
  offerKey: 'mcs-foundations-es',
  purchaseRelationship: 'self',
  payer: {
    role: 'payer',
    candidate: {
      firstName: 'Alex',
      lastName: 'Morgan',
      email: 'alex@example.test',
    },
  },
  participant: { role: 'participant', sameAs: 'payer' },
};

describe('payment identity preparation contract', () => {
  it('accepts exact explicit self/other requests and strict status bindings', () => {
    expect(parsePaymentIdentityResolveCommand(resolve)).toEqual(resolve);
    expect(
      parsePaymentIdentityResolveCommand({
        ...resolve,
        purchaseRelationship: 'other',
        participant: {
          role: 'participant',
          candidate: {
            firstName: 'Sam',
            lastName: 'Morgan',
            email: 'sam@example.test',
          },
        },
      }),
    ).toMatchObject({ purchaseRelationship: 'other' });
    expect(
      parsePaymentIdentityStatusCommand({
        schemaVersion: 1,
        requestId: '40000000-0000-4000-8000-000000000004',
        preparationId: resolve.preparationId,
        originOperationId: resolve.requestId,
        identityRequestSha256: 'a'.repeat(64),
      }),
    ).toMatchObject({ originOperationId: resolve.requestId });
  });

  it('rejects implicit self, extra provider identity and malformed contacts', () => {
    for (const invalid of [
      {
        ...resolve,
        participant: {
          role: 'participant',
          candidate: resolve.payer.candidate,
        },
      },
      { ...resolve, stripeCustomerId: 'cus_forbidden' },
      {
        ...resolve,
        payer: {
          role: 'payer',
          candidate: { ...resolve.payer.candidate, email: 'not-an-email' },
        },
      },
    ])
      expect(() => parsePaymentIdentityResolveCommand(invalid)).toThrow(
        'invalid_identity_request',
      );
  });

  it('issues stable opaque party, distinct role and receipt references', () => {
    const issuer = new PaymentIdentityReferenceIssuer(
      Buffer.from('i'.repeat(32)),
      scope,
    );
    const party = issuer.party(12345);
    const common = {
      caller: 'tandem-wordpress-test',
      preparationId: resolve.preparationId,
      intentId: resolve.intentId,
      operationId: resolve.requestId,
      offerKey: resolve.offerKey,
      relationship: 'self' as const,
      partyReference: party,
      interactionId: 55,
      requestSha256: 'a'.repeat(64),
    };
    const payerRoleProof = issuer.role({ ...common, role: 'payer' });
    const participantRoleProof = issuer.role({
      ...common,
      role: 'participant',
    });
    expect(party).toMatch(/^party-ref:v1:[a-f0-9]{64}$/);
    expect(payerRoleProof).not.toBe(participantRoleProof);
    expect(
      [party, payerRoleProof, participantRoleProof].join(':'),
    ).not.toContain('12345');
    expect(
      issuer.receipt({
        caller: common.caller,
        preparationId: common.preparationId,
        intentId: common.intentId,
        operationId: common.operationId,
        requestSha256: common.requestSha256,
        payerRoleProof,
        participantRoleProof,
      }),
    ).toMatch(/^identity-preparation:v1:[a-f0-9]{64}$/);
  });

  it('matches the shared PHP identity response fixture exactly', () => {
    const fixtureInner =
      '{"schemaVersion":1,"status":"resolved","identityPreparationReceipt":{"schemaVersion":1,"receiptReference":"identity-preparation:fixture-001","kind":"identity_preparation","caller":"tandem-wordpress-test","operationId":"10000000-0000-4000-8000-000000000001","preparationId":"20000000-0000-4000-8000-000000000002","intentId":"30000000-0000-4000-8000-000000000003","offerKey":"mcs-foundations-es","purchaseRelationship":"self","payerReference":"party-ref:v1:payer-fixture","participantReference":"party-ref:v1:payer-fixture","payerRoleProof":"party-role-proof:v1:payer-fixture","participantRoleProof":"party-role-proof:v1:participant-fixture","source":{"provider":"adyen","environment":"test","company":"company","merchant":"merchant","store":"store","endpointRegion":"eu"}}}';
    const signer = new PaymentResponseSigner(
      'resp-v1',
      {
        caller: 'tandem-wordpress-test',
        secret: Buffer.from('s'.repeat(32)),
      },
      [Buffer.from('r'.repeat(32))],
      () => 1789069000000,
    );
    const signed = signer.sign({
      path: '/internal/payments/identity/resolve',
      operationId: resolve.requestId,
      requestNonce: '40000000-0000-4000-8000-000000000004',
      status: 200,
      body: Buffer.from(fixtureInner),
    });
    expect(identityBodySha256(Buffer.from(fixtureInner))).toBe(
      createHash('sha256').update(fixtureInner).digest('hex'),
    );
    expect(signed.auth.signature).toBe(
      'd45b280d5100d78af9f45f871b9b7c12ff7a69b3433746751f253cacdd6c196a',
    );
    expect(signed.payloadBase64).toBe(
      'eyJzY2hlbWFWZXJzaW9uIjoxLCJzdGF0dXMiOiJyZXNvbHZlZCIsImlkZW50aXR5UHJlcGFyYXRpb25SZWNlaXB0Ijp7InNjaGVtYVZlcnNpb24iOjEsInJlY2VpcHRSZWZlcmVuY2UiOiJpZGVudGl0eS1wcmVwYXJhdGlvbjpmaXh0dXJlLTAwMSIsImtpbmQiOiJpZGVudGl0eV9wcmVwYXJhdGlvbiIsImNhbGxlciI6InRhbmRlbS13b3JkcHJlc3MtdGVzdCIsIm9wZXJhdGlvbklkIjoiMTAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAxIiwicHJlcGFyYXRpb25JZCI6IjIwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMiIsImludGVudElkIjoiMzAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAzIiwib2ZmZXJLZXkiOiJtY3MtZm91bmRhdGlvbnMtZXMiLCJwdXJjaGFzZVJlbGF0aW9uc2hpcCI6InNlbGYiLCJwYXllclJlZmVyZW5jZSI6InBhcnR5LXJlZjp2MTpwYXllci1maXh0dXJlIiwicGFydGljaXBhbnRSZWZlcmVuY2UiOiJwYXJ0eS1yZWY6djE6cGF5ZXItZml4dHVyZSIsInBheWVyUm9sZVByb29mIjoicGFydHktcm9sZS1wcm9vZjp2MTpwYXllci1maXh0dXJlIiwicGFydGljaXBhbnRSb2xlUHJvb2YiOiJwYXJ0eS1yb2xlLXByb29mOnYxOnBhcnRpY2lwYW50LWZpeHR1cmUiLCJzb3VyY2UiOnsicHJvdmlkZXIiOiJhZHllbiIsImVudmlyb25tZW50IjoidGVzdCIsImNvbXBhbnkiOiJjb21wYW55IiwibWVyY2hhbnQiOiJtZXJjaGFudCIsInN0b3JlIjoic3RvcmUiLCJlbmRwb2ludFJlZ2lvbiI6ImV1In19fQ==',
    );
  });
});
