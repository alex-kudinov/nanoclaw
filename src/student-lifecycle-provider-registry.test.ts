import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  compareLifecycleProviderRegistry,
  loadLifecycleProviderBaseline,
} from './student-lifecycle-provider-registry.js';

const baseline = loadLifecycleProviderBaseline(
  path.join(
    process.cwd(),
    'facts/catalogs/student-lifecycle-community-provider-baseline-v1.json',
  ),
);

describe('student lifecycle provider registry', () => {
  it('accepts an unchanged 18-registration legacy baseline', () => {
    expect(
      compareLifecycleProviderRegistry({
        baseline,
        current: structuredClone(baseline.registrations),
        phase: 'baseline',
      }),
    ).toMatchObject({
      baselineCount: 18,
      shadowCount: 0,
      totalCount: 18,
      legacyUnchanged: true,
      circle: false,
    });
  });

  it('accepts exactly four additive shadow registrations', () => {
    const sha = 'a'.repeat(64);
    const additions = [
      'USER_JOIN',
      'USER_UPDATE',
      'GROUP_JOIN',
      'COURSE_COMPLETED',
    ].map((action, index) => ({
      id: `0000000${index}-0000-4000-8000-00000000000${index}`,
      action,
      filter: {},
      destination_host: 'webhooks.tandemcoach.co',
      url_sha256: sha,
    }));
    expect(
      compareLifecycleProviderRegistry({
        baseline,
        current: [...baseline.registrations, ...additions],
        phase: 'shadow',
        shadowDestinationHost: 'webhooks.tandemcoach.co',
        shadowUrlSha256: sha,
      }),
    ).toMatchObject({ shadowCount: 4, totalCount: 22 });
  });

  it('refuses legacy drift and any fifth shadow registration', () => {
    const drifted = structuredClone(baseline.registrations);
    drifted[0].destination_host = 'changed.invalid';
    expect(() =>
      compareLifecycleProviderRegistry({
        baseline,
        current: drifted,
        phase: 'baseline',
      }),
    ).toThrow('student_lifecycle_legacy_registry_drift');
    const extra = structuredClone(baseline.registrations);
    extra.push({
      id: '11111111-1111-4111-8111-111111111111',
      action: 'USER_JOIN',
      filter: {},
      destination_host: 'webhooks.tandemcoach.co',
      url_sha256: 'a'.repeat(64),
    });
    expect(() =>
      compareLifecycleProviderRegistry({
        baseline,
        current: extra,
        phase: 'baseline',
      }),
    ).toThrow('student_lifecycle_unexpected_registry_addition');
  });
});
