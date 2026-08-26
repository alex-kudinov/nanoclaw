import { describe, expect, it } from 'vitest';

import {
  InMemoryRelationshipContextRepository,
  identityExceptionFingerprint,
} from './relationship-context-store.js';

describe('relationship context in-memory repository', () => {
  it('resolves canonical merge chains and rejects external-ref reassignment', async () => {
    const repository = new InMemoryRelationshipContextRepository();
    repository.parties.set(1, 2);
    repository.parties.set(2, null);
    repository.parties.set(3, null);
    expect(await repository.canonicalParty(1)).toBe(2);
    const reference = {
      provider: 'reference_lms',
      scope: 'fixture-primary',
      entityType: 'person',
      externalId: 'u-1',
    };
    await repository.bindExternalRef({
      partyId: 1,
      reference,
      adapterKey: 'reference_lms',
      adapterVersion: '1.0.0',
      observedAt: '2026-08-25T18:00:00Z',
      receiptSha256: 'a'.repeat(64),
    });
    expect(await repository.resolveExternalRef(reference)).toBe(2);
    await expect(
      repository.bindExternalRef({
        partyId: 3,
        reference,
        adapterKey: 'reference_lms',
        adapterVersion: '1.0.0',
        observedAt: '2026-08-25T18:00:00Z',
        receiptSha256: 'b'.repeat(64),
      }),
    ).rejects.toThrow('relationship_context_external_ref_conflict');
  });

  it('keeps shared claims ambiguous and fingerprints exceptions deterministically', async () => {
    const repository = new InMemoryRelationshipContextRepository();
    repository.parties.set(1, null);
    repository.parties.set(2, null);
    for (const partyId of [1, 2]) {
      await repository.addIdentifierClaim({
        partyId,
        kind: 'verified_email_candidate',
        fingerprint: 'a'.repeat(64),
        verified: true,
        effectiveAt: '2026-08-25T18:00:00Z',
        evidenceSha256: 'b'.repeat(64),
      });
    }
    expect(
      await repository.resolveIdentifierClaim(
        'verified_email_candidate',
        'a'.repeat(64),
      ),
    ).toEqual([1, 2]);
    const input = {
      sourceSystem: 'reference_lms',
      sourceScope: 'fixture-primary',
      sourceRef: {
        provider: 'reference_lms',
        scope: 'fixture-primary',
        entityType: 'person',
        externalId: 'u-1',
      },
      reasonCode: 'identity_ambiguous',
      partyIds: [1, 2],
    };
    expect(identityExceptionFingerprint(input)).toBe(
      identityExceptionFingerprint(structuredClone(input)),
    );
  });

  it('rebinds a reference to the winner after its Party is merged', async () => {
    const repository = new InMemoryRelationshipContextRepository();
    repository.parties.set(1, null);
    repository.parties.set(2, null);
    const reference = {
      provider: 'trafft',
      scope: 'primary',
      entityType: 'customer',
      externalId: 'customer-merge',
    };
    await repository.bindExternalRef({
      partyId: 1,
      reference,
      adapterKey: 'trafft_host_ledger',
      adapterVersion: '1.0.0',
      observedAt: '2026-08-26T18:00:00Z',
      receiptSha256: 'a'.repeat(64),
    });
    repository.parties.set(1, 2);
    await repository.bindExternalRef({
      partyId: 2,
      reference,
      adapterKey: 'trafft_host_ledger',
      adapterVersion: '1.0.0',
      observedAt: '2026-08-26T19:00:00Z',
      receiptSha256: 'b'.repeat(64),
    });
    expect(await repository.resolveExternalRef(reference)).toBe(2);
  });
});
