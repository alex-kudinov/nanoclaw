import { describe, expect, it } from 'vitest';

import { COMPANY_GMAIL_RUNTIME_ALIGNMENT_CONFIRMATION } from './company-gmail-runtime-alignment.js';
import { parseCompanyGmailRuntimeAlignmentArgs } from './company-gmail-runtime-alignment-cli.js';

const SHA = 'a'.repeat(64);

describe('Company Gmail runtime alignment CLI', () => {
  it('requires exact cursor fingerprints and apply confirmation', () => {
    expect(
      parseCompanyGmailRuntimeAlignmentArgs([
        '--apply',
        '--expected-sqlite-cursor-sha256',
        SHA,
        '--expected-watermark-cursor-sha256',
        SHA,
        '--observed-at',
        '2026-08-18T12:00:00.000Z',
        '--confirm-apply',
        COMPANY_GMAIL_RUNTIME_ALIGNMENT_CONFIRMATION,
      ]),
    ).toMatchObject({
      mode: 'apply',
      confirmation: COMPANY_GMAIL_RUNTIME_ALIGNMENT_CONFIRMATION,
    });
  });

  it('rejects apply without the task-bound confirmation', () => {
    expect(() =>
      parseCompanyGmailRuntimeAlignmentArgs([
        '--apply',
        '--expected-sqlite-cursor-sha256',
        SHA,
        '--expected-watermark-cursor-sha256',
        SHA,
        '--observed-at',
        '2026-08-18T12:00:00.000Z',
      ]),
    ).toThrow('exact apply confirmation is required');
  });
});
