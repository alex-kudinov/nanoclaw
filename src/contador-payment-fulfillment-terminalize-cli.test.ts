import { describe, expect, it } from 'vitest';

import { parseContadorTerminalizationArgs } from './contador-payment-fulfillment-terminalize-cli.js';

describe('Contador expired-case terminalizer CLI', () => {
  it('is dry-run by default and requires exact version and attempt guards', () => {
    expect(
      parseContadorTerminalizationArgs(['--case', '8:3:4', '--case', '11:2:3']),
    ).toEqual({
      apply: false,
      specs: [
        { caseId: '8', expectedVersion: 3, expectedAttemptCount: 4 },
        { caseId: '11', expectedVersion: 2, expectedAttemptCount: 3 },
      ],
    });
  });

  it('requires the explicit apply flag for mutation', () => {
    expect(
      parseContadorTerminalizationArgs(['--case', '8:3:4', '--apply']),
    ).toMatchObject({ apply: true });
  });

  it('rejects malformed, duplicate, empty, and broad case selection', () => {
    expect(() => parseContadorTerminalizationArgs([])).toThrow(
      'case_batch_out_of_bounds',
    );
    expect(() => parseContadorTerminalizationArgs(['--case', '8:3'])).toThrow(
      'case_spec_invalid',
    );
    expect(() =>
      parseContadorTerminalizationArgs(['--case', '8:3:4', '--case', '8:3:4']),
    ).toThrow('case_id_duplicate');
  });
});
