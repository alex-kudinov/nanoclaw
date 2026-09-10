import { createHmac, randomBytes } from 'node:crypto';
import { enrollmentIngressProofPayload } from '../src/student-enrollment-ingress.js';
import { bookkeeperContractHash as hash } from '../src/bookkeeper-enrollment-contract.js';

/** Test-only mock issuer. Ephemeral keys; no provider/credential access. */
export function signAdmissionFixtures(envelope, issuers, now) {
  const targets = [
    ['funding', envelope.funding.proofKey, 0],
    ['commercial', envelope.commercial.proofKey, 0],
    ...envelope.seats.flatMap((s, i) => [
      ...(s.proofKey ? [['participant', s.proofKey, i]] : []),
      ...(s.assignment ? [['assignment', s.assignment.proofKey, i]] : []),
    ]),
  ];
  return targets.map(([purpose, proofKey, index]) => {
    const issuer = issuers.find((i) => i.purposes.includes(purpose));
    const payload = enrollmentIngressProofPayload(envelope, purpose, index);
    const body = JSON.stringify({
      version: 1,
      audience: 'enrollment_admission_v1',
      issuerId: issuer.issuerId,
      transport: issuer.transport,
      channel: envelope.channel,
      receiptId:
        'receipt:' +
        hash([issuer.issuerId, envelope.channel, payload, now]).slice(0, 32),
      proofKey,
      purpose,
      issuedAt: now,
      expiresAt: now + 300000,
      payload,
    });
    return {
      issuerId: issuer.issuerId,
      body,
      signature: createHmac('sha256', issuer.key).update(body).digest('hex'),
    };
  });
}
export function admissionFixture(label, now, origin = 'provider_event') {
  let clock = now;
  const source = {
    scope: 'stripe:tandem',
    objectType: 'payment_intent',
    objectId: `pi_${label}`,
  };
  const envelope = {
    version: 1,
    intakeKey: `intake:${label}`,
    channel:
      origin === 'operator_decision'
        ? 'manual_stripe_payment'
        : 'website_stripe_checkout',
    sourceAlias: source,
    funding: {
      source,
      aliases: [
        {
          scope: 'stripe:tandem',
          objectType: 'checkout_session',
          objectId: `cs_${label}`,
        },
      ],
      status: 'settled',
      amountMinor: 10000,
      currency: 'USD',
      payerPartyId: 1,
      effectiveAt: new Date(now).toISOString(),
      proofKey: 'proof:funding',
    },
    commercial: {
      offerKey: 'offer:admission',
      seatCount: 1,
      totalMinor: 10000,
      currency: 'USD',
      proofKey: 'proof:commercial',
    },
    seats: [
      {
        participantPartyId: 2,
        payerRelationship: 'separate_payer',
        proofKey: 'proof:person',
        assignment: {
          poolKey: 'pool:admission',
          componentKey: 'component:admission',
          proofKey: 'proof:class',
        },
      },
    ],
  };
  const issuers = [
    {
      issuerId: 'issuer:funding',
      actor: 'synthetic:funding',
      role:
        origin === 'operator_decision' ? 'finance_operator' : 'source_adapter',
      transport: origin,
      purposes: ['funding'],
      sourceScopes: ['stripe:tandem'],
      channels: [envelope.channel],
      key: randomBytes(32),
    },
    {
      issuerId: 'issuer:operator',
      actor: 'synthetic:operator',
      role: 'enrollment_operator',
      transport: 'operator_decision',
      purposes: ['commercial', 'participant', 'assignment'],
      sourceScopes: ['stripe:tandem'],
      channels: [envelope.channel],
      key: randomBytes(32),
    },
  ];
  const catalog = {
    partyIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    offers: [
      {
        offerKey: 'offer:admission',
        bundleKey: 'bundle:admission',
        bundleVersion: 1,
        catalogRevision: 1,
        evidenceSha256: 'a'.repeat(64),
        components: [
          {
            componentKey: 'component:admission',
            state: 'included',
            requiresAssignment: true,
          },
        ],
      },
    ],
  };
  return {
    envelope,
    issuers,
    catalog,
    clock: () => clock,
    setClock: (value) => {
      clock = value;
    },
    statements: signAdmissionFixtures(envelope, issuers, now),
  };
}
