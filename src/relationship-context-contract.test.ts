import { describe, expect, it } from 'vitest';

import {
  RELATIONSHIP_CONTEXT_BATCH_MAX_BYTES,
  RELATIONSHIP_CONTEXT_JSON_MAX_BYTES,
  RelationshipContextContractError,
  assertBoundedJson,
  sha256Json,
  stableJson,
  validateObservationBatch,
  validateManifest,
} from './relationship-context-contract.js';

const manifest = {
  manifestVersion: 1 as const,
  adapterKey: 'example_lms',
  adapterVersion: '1.0.0',
  sourceSystem: 'example_lms',
  supportedScopes: ['primary'],
  externalReferenceTypes: ['person'],
  factTypes: ['learning.progress.percent@1'],
  identityClaimTypes: ['provider_user_id' as const],
  collectionModes: ['snapshot' as const],
  projectionTargets: ['learning' as const],
  privacyClasses: ['internal' as const],
  credentialHandle: null,
  healthPolicy: 'default',
  conformanceSuite: 'person_enrichment_adapter_v1' as const,
};

describe('relationship context contract', () => {
  it('canonicalizes and hashes objects independent of key order', () => {
    expect(stableJson({ b: 2, a: { d: 4, c: 3 } })).toBe(
      '{"a":{"c":3,"d":4},"b":2}',
    );
    expect(sha256Json({ a: 1, b: 2 })).toBe(sha256Json({ b: 2, a: 1 }));
  });

  it('accepts a bounded provider-neutral manifest', () => {
    expect(validateManifest(manifest)).toEqual(manifest);
  });

  it('rejects unversioned facts, credential-like invalid handles, and oversized JSON', () => {
    expect(() =>
      validateManifest({ ...manifest, factTypes: ['learning.progress'] }),
    ).toThrow('relationship_context_fact_type_invalid');
    expect(() =>
      validateManifest({
        ...manifest,
        credentialHandle: 'not allowed whitespace',
      }),
    ).toThrow('relationship_context_manifest_contract_invalid');
    expect(() =>
      assertBoundedJson({
        value: 'x'.repeat(RELATIONSHIP_CONTEXT_JSON_MAX_BYTES),
      }),
    ).toThrow(RelationshipContextContractError);
  });

  it('rejects undeclared privacy and identity contract values', () => {
    expect(() =>
      validateManifest({
        ...manifest,
        privacyClasses: ['secret' as never],
      }),
    ).toThrow('relationship_context_privacy_classes_invalid');
    expect(() =>
      validateManifest({
        ...manifest,
        identityClaimTypes: ['government_id' as never],
      }),
    ).toThrow('relationship_context_identity_claim_types_invalid');
  });

  it('allows a multi-fact batch larger than one persisted JSON value but bounds the envelope', () => {
    const factValue = { detail: 'x'.repeat(6_000) };
    const input = {
      adapterKey: manifest.adapterKey,
      adapterVersion: manifest.adapterVersion,
      sourceSystem: manifest.sourceSystem,
      sourceScope: 'primary',
      complete: true,
      watermark: null,
      externalReferences: [],
      identityCandidates: [],
      facts: [1, 2].map((index) => ({
        factType: manifest.factTypes[0],
        sourceFactKey: `fact-${index}`,
        subject: { partyId: index },
        value: factValue,
        sourceSystem: manifest.sourceSystem,
        sourceScope: 'primary',
        sourceRecordType: 'fixture',
        sourceRecordId: `record-${index}`,
        observedAt: '2026-08-25T00:00:00.000Z',
        confidence: 'source_verified' as const,
        conflictState: 'none' as const,
        privacyClass: 'internal' as const,
        factSchemaVersion: 1,
      })),
      errors: [],
    };
    const catalog = new Map([
      [
        manifest.factTypes[0],
        {
          factType: manifest.factTypes[0],
          schemaVersion: 1,
          projectionTarget: 'learning' as const,
          privacyClass: 'internal' as const,
          maxAgeSeconds: null,
          cardinality: 'many' as const,
          authorityClass: 'native' as const,
        },
      ],
    ]);

    expect(Buffer.byteLength(stableJson(input), 'utf8')).toBeGreaterThan(
      RELATIONSHIP_CONTEXT_JSON_MAX_BYTES,
    );
    expect(
      validateObservationBatch(manifest, catalog, input).facts,
    ).toHaveLength(2);
    expect(() =>
      validateObservationBatch(manifest, catalog, {
        ...input,
        watermark: 'x'.repeat(RELATIONSHIP_CONTEXT_BATCH_MAX_BYTES),
      }),
    ).toThrow('relationship_context_batch_too_large');
  });
});
