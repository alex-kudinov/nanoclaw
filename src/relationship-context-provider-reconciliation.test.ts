import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { RelationshipContextContractError } from './relationship-context-contract.js';
import {
  ENCHARGE_CONSENT_FACT_TYPE,
  bindExternalRefOrRecordConflict,
  parseEnchargeSnapshotFile,
  prepareEnchargeSnapshot,
  providerReconciliationManifests,
} from './relationship-context-provider-reconciliation.js';
import { RelationshipContextRegistry } from './relationship-context-registry.js';
import { InMemoryRelationshipContextRepository } from './relationship-context-store.js';

const temporaryPaths: string[] = [];

afterEach(() => {
  for (const target of temporaryPaths.splice(0)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

describe('provider identity reconciliation', () => {
  it('registers Plutio and Encharge through the stable adapter contract', () => {
    const registry = new RelationshipContextRegistry();
    registry.registerFact({
      factType: ENCHARGE_CONSENT_FACT_TYPE,
      schemaVersion: 1,
      projectionTarget: 'consent',
      privacyClass: 'internal',
      maxAgeSeconds: 86_400,
      cardinality: 'one',
      authorityClass: 'native',
    });
    const manifests = providerReconciliationManifests();
    for (const manifest of manifests) {
      registry.registerAdapter({
        describe: () => manifest,
        validateConfig: () => ({ ok: true }),
        health: () => ({
          adapterKey: manifest.adapterKey,
          sourceScope: 'primary',
          status: 'healthy',
          observedAt: '2026-08-26T21:00:00.000Z',
          errorCode: null,
        }),
      });
      registry.markConformance(manifest.adapterKey, 'passed');
    }
    expect(manifests.map((manifest) => manifest.sourceSystem).sort()).toEqual([
      'encharge',
      'plutio',
    ]);
  });

  it('joins only unique Party email and unique Encharge person identities', () => {
    const prepared = prepareEnchargeSnapshot({
      generatedAt: '2026-08-26T21:00:00Z',
      partyEmails: [
        { partyId: 10, email: 'unique@example.test' },
        { partyId: 20, email: 'shared@example.test' },
        { partyId: 21, email: 'shared@example.test' },
      ],
      providerPeople: [
        {
          id: 'encharge-10',
          email: 'Unique@Example.Test',
          updatedAt: '2026-08-26T20:00:00Z',
          unsubscribed: false,
          CommunicationCategories: {
            cat_1: 'subscribed',
            unsafe_nested: { raw: 'drop' },
          },
          firstName: 'must-not-persist',
        },
        { id: 'encharge-20', email: 'shared@example.test' },
        { id: 'encharge-missing', email: 'missing@example.test' },
      ],
    });
    expect(prepared.matched).toBe(1);
    expect(prepared.ambiguousPartyEmails).toBe(1);
    expect(prepared.unmatchedProviderPeople).toBe(1);
    expect(prepared.snapshot.records[0]).toMatchObject({
      partyId: 10,
      enchargePersonId: 'encharge-10',
      globalUnsubscribed: false,
      communicationCategories: { cat_1: 'subscribed' },
    });
    const serialized = JSON.stringify(prepared.snapshot);
    expect(serialized).not.toContain('unique@example.test');
    expect(serialized).not.toContain('must-not-persist');
    expect(serialized).not.toContain('unsafe_nested');
  });

  it('parses only the sanitized snapshot contract and refuses raw email', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'nanoclaw-encharge-snapshot-'),
    );
    temporaryPaths.push(directory);
    const valid = path.join(directory, 'valid.json');
    fs.writeFileSync(
      valid,
      JSON.stringify({
        schemaVersion: 1,
        generatedAt: '2026-08-26T21:00:00Z',
        records: [
          {
            partyId: 10,
            emailFingerprint: 'a'.repeat(64),
            enchargePersonId: 'encharge-10',
            updatedAt: '2026-08-26T20:00:00Z',
            globalUnsubscribed: null,
            communicationCategories: { cat_1: 'unknown' },
          },
        ],
      }),
    );
    expect(parseEnchargeSnapshotFile(valid).records).toHaveLength(1);

    const invalid = path.join(directory, 'invalid.json');
    const raw = JSON.parse(fs.readFileSync(valid, 'utf8'));
    raw.records[0].email = 'must-not-enter-snapshot@example.test';
    fs.writeFileSync(invalid, JSON.stringify(raw));
    expect(() => parseEnchargeSnapshotFile(invalid)).toThrow(
      RelationshipContextContractError,
    );
  });

  it('isolates a different-Party ref collision and records an exception', async () => {
    const repository = new InMemoryRelationshipContextRepository();
    repository.parties.set(10, null);
    repository.parties.set(20, null);
    const reference = {
      provider: 'plutio',
      scope: 'primary',
      entityType: 'person',
      externalId: 'plutio-collision',
    };
    await repository.bindExternalRef({
      partyId: 10,
      reference,
      adapterKey: 'fixture',
      adapterVersion: '1.0.0',
      observedAt: '2026-08-26T20:00:00Z',
      verifiedAt: '2026-08-26T20:00:00Z',
      receiptSha256: 'a'.repeat(64),
    });

    await expect(
      bindExternalRefOrRecordConflict({
        repository,
        partyId: 20,
        reference,
        adapterKey: 'fixture',
        adapterVersion: '1.0.0',
        observedAt: '2026-08-26T21:00:00Z',
        verifiedAt: '2026-08-26T21:00:00Z',
        receiptSha256: 'b'.repeat(64),
        evidenceTier: 'fixture_collision',
      }),
    ).resolves.toBe(false);
    await expect(repository.resolveExternalRef(reference)).resolves.toBe(10);
    expect([...repository.exceptions.values()]).toEqual([
      expect.objectContaining({
        partyIds: [10, 20],
        reasonCode: 'external_ref_conflict',
      }),
    ]);
  });
});
