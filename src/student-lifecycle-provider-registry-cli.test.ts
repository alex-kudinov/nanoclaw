import { describe, expect, it } from 'vitest';

import { parseStudentLifecycleProviderRegistryArgs } from './student-lifecycle-provider-registry-cli.js';

const NOW = '2026-08-24T18:30:00.000Z';

describe('student lifecycle provider registry CLI', () => {
  it('parses a baseline check', () => {
    expect(
      parseStudentLifecycleProviderRegistryArgs(
        [
          '--check',
          '--phase',
          'baseline',
          '--snapshot',
          '/tmp/snapshot.json',
          '--observed-at',
          NOW,
        ],
        '/release',
      ),
    ).toMatchObject({
      mode: 'check',
      phase: 'baseline',
      baselinePath:
        '/release/facts/catalogs/student-lifecycle-community-provider-baseline-v1.json',
    });
  });

  it('requires exact record confirmation and shadow evidence', () => {
    expect(() =>
      parseStudentLifecycleProviderRegistryArgs([
        '--record',
        '--phase',
        'baseline',
        '--snapshot',
        '/tmp/snapshot.json',
        '--observed-at',
        NOW,
      ]),
    ).toThrow('exact record confirmation');
    expect(() =>
      parseStudentLifecycleProviderRegistryArgs([
        '--check',
        '--phase',
        'shadow',
        '--snapshot',
        '/tmp/snapshot.json',
        '--observed-at',
        NOW,
      ]),
    ).toThrow('shadow phase requires');
  });
});
