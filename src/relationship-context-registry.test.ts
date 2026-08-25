import { describe, expect, it } from 'vitest';

import { RelationshipContextRegistry } from './relationship-context-registry.js';
import {
  REFERENCE_LMS_FACTS,
  ReferenceLmsAdapter,
} from './relationship-context-reference-adapter.js';

function registry(): RelationshipContextRegistry {
  const value = new RelationshipContextRegistry();
  for (const factType of REFERENCE_LMS_FACTS) {
    value.registerFact({
      factType,
      schemaVersion: 1,
      projectionTarget: 'learning',
      privacyClass: 'internal',
      maxAgeSeconds: 93_600,
      cardinality: factType === 'learning.completion@1' ? 'one' : 'many',
      authorityClass: 'native',
    });
  }
  return value;
}

describe('relationship context registry', () => {
  it('rejects invalid adapter version and privacy declarations at registration', () => {
    const value = registry();
    const adapter = new ReferenceLmsAdapter();
    expect(() =>
      value.registerAdapter(
        Object.assign(new ReferenceLmsAdapter(), {
          describe: () => ({ ...adapter.describe(), adapterVersion: 'latest' }),
        }),
      ),
    ).toThrow('relationship_context_adapter_version_invalid');
    expect(() =>
      value.registerAdapter(
        Object.assign(new ReferenceLmsAdapter(), {
          describe: () => ({
            ...adapter.describe(),
            privacyClasses: ['secret' as never],
          }),
        }),
      ),
    ).toThrow('relationship_context_privacy_classes_invalid');
  });

  it('requires facts before adapter registration and conformance before use', () => {
    const missing = new RelationshipContextRegistry();
    expect(() => missing.registerAdapter(new ReferenceLmsAdapter())).toThrow(
      'relationship_context_adapter_fact_unregistered',
    );
    const value = registry();
    const registration = value.registerAdapter(new ReferenceLmsAdapter());
    expect(registration.enabled).toBe(false);
    expect(() => value.adapter('reference_lms')).toThrow(
      'relationship_context_adapter_unavailable',
    );
    value.markConformance('reference_lms', 'passed');
    expect(value.adapter('reference_lms')).toBeInstanceOf(ReferenceLmsAdapter);
  });

  it('refuses duplicate adapters/source scopes and isolates circuit failure', () => {
    const value = registry();
    value.registerAdapter(new ReferenceLmsAdapter());
    expect(() => value.registerAdapter(new ReferenceLmsAdapter())).toThrow(
      'relationship_context_adapter_duplicate',
    );
    value.markConformance('reference_lms', 'passed');
    value.recordFailure('reference_lms', 'fixture_error');
    value.recordFailure('reference_lms', 'fixture_error');
    const failed = value.recordFailure('reference_lms', 'fixture_error');
    expect(failed.circuitStatus).toBe('open');
    expect(() => value.adapter('reference_lms')).toThrow(
      'relationship_context_adapter_unavailable',
    );
    expect(value.recordRecovery('reference_lms').circuitStatus).toBe('closed');
  });
});
