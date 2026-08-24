import { describe, expect, it } from 'vitest';

import { parseStudentLifecycleShadowArgs } from './student-lifecycle-shadow-cli.js';

const NOW = '2026-08-24T18:20:00.000Z';

describe('student lifecycle shadow catalog CLI', () => {
  it('parses dry-run and defaults the manifest below code root', () => {
    const result = parseStudentLifecycleShadowArgs(
      ['--dry-run', '--observed-at', NOW],
      '/release',
    );
    expect(result).toMatchObject({
      mode: 'dry_run',
      manifestPath:
        '/release/facts/catalogs/student-lifecycle-community-shadow-v1.json',
      observedAt: NOW,
      confirmation: null,
    });
  });

  it('requires exact apply confirmation and canonical time', () => {
    expect(() =>
      parseStudentLifecycleShadowArgs(['--apply', '--observed-at', NOW]),
    ).toThrow('exact apply confirmation');
    expect(() =>
      parseStudentLifecycleShadowArgs([
        '--apply',
        '--observed-at',
        NOW,
        '--confirm-apply',
        'NC-20260824-006-APPLY-CATALOG',
      ]),
    ).not.toThrow();
    expect(() =>
      parseStudentLifecycleShadowArgs([
        '--dry-run',
        '--observed-at',
        '2026-08-24T18:20:00Z',
      ]),
    ).toThrow('canonical UTC');
  });
});
