import { describe, expect, it } from 'vitest';

import {
  REFERENCE_LMS_FACTS,
  ReferenceLmsAdapter,
} from './relationship-context-reference-adapter.js';
import { RelationshipContextRegistry } from './relationship-context-registry.js';
import { validateObservationBatch } from './relationship-context-contract.js';

function configured(): {
  adapter: ReferenceLmsAdapter;
  registry: RelationshipContextRegistry;
} {
  const registry = new RelationshipContextRegistry();
  for (const factType of REFERENCE_LMS_FACTS) {
    registry.registerFact({
      factType,
      schemaVersion: 1,
      projectionTarget: 'learning',
      privacyClass: 'internal',
      maxAgeSeconds: 93_600,
      cardinality: 'many',
      authorityClass: 'native',
    });
  }
  const adapter = new ReferenceLmsAdapter();
  registry.registerAdapter(adapter);
  return { adapter, registry };
}

describe('fixture-only reference LMS adapter', () => {
  it('normalizes scoped refs, candidates, and versioned learning facts without network/config', () => {
    const { adapter, registry } = configured();
    const batch = adapter.normalizeWebhook({
      scope: 'fixture-primary',
      observedAt: '2026-08-25T18:00:00.000Z',
      correlationId: 'fixture-1',
      payload: {
        user_id: 'u-1',
        course_id: 'c-1',
        enrollment_id: 'e-1',
        status: 'completed',
        progress_percent: 100,
        completed_at: '2026-08-24T12:00:00Z',
        identity_fingerprint: 'a'.repeat(64),
      },
    });
    const validated = validateObservationBatch(
      registry.manifest('reference_lms'),
      registry.factCatalog(),
      batch,
    );
    expect(validated.externalReferences).toHaveLength(3);
    expect(validated.identityCandidates).toHaveLength(2);
    expect(validated.facts.map((fact) => fact.factType)).toEqual([
      'learning.enrollment.status@1',
      'learning.progress.percent@1',
      'learning.completion@1',
    ]);
    expect(adapter.validateConfig({})).toEqual({ ok: true });
    expect(adapter.describe().credentialHandle).toBeNull();
  });

  it('rejects out-of-scope or malformed fixture data', () => {
    const adapter = new ReferenceLmsAdapter();
    expect(() =>
      adapter.normalizeWebhook({
        scope: 'another-account',
        observedAt: new Date().toISOString(),
        correlationId: 'bad',
        payload: {},
      }),
    ).toThrow('reference_lms_scope_unsupported');
    expect(
      adapter.validateConfig({ endpoint: 'https://example.test' }),
    ).toEqual({ ok: false, code: 'reference_lms_config_must_be_empty' });
  });
});
