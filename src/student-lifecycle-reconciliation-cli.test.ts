import { describe, expect, it } from 'vitest';

import { parseStudentLifecycleReconciliationArgs } from './student-lifecycle-reconciliation-cli.js';

describe('student lifecycle reconciliation CLI', () => {
  it('parses check mode and refuses unconfirmed record mode', () => {
    expect(
      parseStudentLifecycleReconciliationArgs([
        '--check',
        '--snapshot',
        '/tmp/snapshot.json',
      ]),
    ).toEqual({ mode: 'check', snapshotPath: '/tmp/snapshot.json' });
    expect(() =>
      parseStudentLifecycleReconciliationArgs([
        '--record',
        '--snapshot',
        '/tmp/snapshot.json',
      ]),
    ).toThrow('exact record confirmation');
  });
});
