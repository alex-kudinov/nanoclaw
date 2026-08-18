import { describe, expect, it } from 'vitest';

import {
  formatCompanyGmailSourceBootstrapReport,
  parseCompanyGmailSourceBootstrapArgs,
} from './company-gmail-source-bootstrap-cli.js';
import {
  buildCompanyGmailSourceBootstrapPlan,
  COMPANY_GMAIL_SOURCE_BOOTSTRAP_CONFIRMATION,
  runCompanyGmailSourceBootstrap,
} from './company-gmail-source-bootstrap.js';

const HISTORY_ID = '123456789';
const OBSERVED_AT = '2026-08-18T05:00:00.000Z';
const HISTORY_ID_SHA256 = buildCompanyGmailSourceBootstrapPlan({
  historyId: HISTORY_ID,
  observedAt: OBSERVED_AT,
}).historyIdSha256;

describe('Company Gmail source bootstrap CLI', () => {
  it('requires one explicit mode and the exact apply confirmation', () => {
    expect(() => parseCompanyGmailSourceBootstrapArgs([])).toThrow(
      'exactly one mode is required',
    );
    expect(() =>
      parseCompanyGmailSourceBootstrapArgs([
        '--apply',
        '--expected-history-id-sha256',
        HISTORY_ID_SHA256,
        '--observed-at',
        OBSERVED_AT,
      ]),
    ).toThrow('exact apply confirmation is required');
    expect(() =>
      parseCompanyGmailSourceBootstrapArgs([
        '--apply',
        '--dry-run',
        '--expected-history-id-sha256',
        HISTORY_ID_SHA256,
        '--observed-at',
        OBSERVED_AT,
      ]),
    ).toThrow('exactly one mode is required');
  });

  it('accepts only the exact apply invocation', () => {
    expect(
      parseCompanyGmailSourceBootstrapArgs([
        '--apply',
        '--expected-history-id-sha256',
        HISTORY_ID_SHA256,
        '--observed-at',
        OBSERVED_AT,
        '--confirm-apply',
        COMPANY_GMAIL_SOURCE_BOOTSTRAP_CONFIRMATION,
      ]),
    ).toEqual({
      mode: 'apply',
      expectedHistoryIdSha256: HISTORY_ID_SHA256,
      observedAt: OBSERVED_AT,
      confirmation: COMPANY_GMAIL_SOURCE_BOOTSTRAP_CONFIRMATION,
    });
  });

  it('keeps dry-run separate from confirmation and rejects unknown flags', () => {
    expect(
      parseCompanyGmailSourceBootstrapArgs([
        '--dry-run',
        '--expected-history-id-sha256',
        HISTORY_ID_SHA256,
        '--observed-at',
        OBSERVED_AT,
      ]),
    ).toMatchObject({ mode: 'dry_run', confirmation: null });
    expect(() =>
      parseCompanyGmailSourceBootstrapArgs([
        '--dry-run',
        '--expected-history-id-sha256',
        HISTORY_ID_SHA256,
        '--observed-at',
        OBSERVED_AT,
        '--gmail-read',
      ]),
    ).toThrow('unknown argument: --gmail-read');
    expect(() =>
      parseCompanyGmailSourceBootstrapArgs([
        '--dry-run',
        '--expected-history-id-sha256',
        HISTORY_ID_SHA256,
        '--expected-history-id-sha256',
        HISTORY_ID_SHA256,
        '--observed-at',
        OBSERVED_AT,
      ]),
    ).toThrow('--expected-history-id-sha256 may appear only once');
    expect(() =>
      parseCompanyGmailSourceBootstrapArgs([
        '--dry-run',
        '--expected-history-id',
        HISTORY_ID,
        '--observed-at',
        OBSERVED_AT,
      ]),
    ).toThrow('unknown argument: --expected-history-id');
  });

  it('formats sanitized output without the raw Gmail history ID', async () => {
    const plan = buildCompanyGmailSourceBootstrapPlan({
      historyId: HISTORY_ID,
      observedAt: OBSERVED_AT,
    });
    const report = await runCompanyGmailSourceBootstrap(
      {
        mode: 'dry_run',
        expectedHistoryId: HISTORY_ID,
        observedAt: OBSERVED_AT,
      },
      {
        readHistoryId: () => HISTORY_ID,
        now: () => '2026-08-18T05:01:00.000Z',
        withTransaction: async () => {
          throw new Error('dry-run must not open a transaction');
        },
        registerSource: async () => ({
          source: plan.source,
          applied: true,
          duplicate: false,
        }),
        recordWatermark: async () => {
          throw new Error('dry-run must not record a watermark');
        },
      },
    );
    const output = formatCompanyGmailSourceBootstrapReport(report);
    expect(output).not.toContain(HISTORY_ID);
    expect(JSON.parse(output)).toMatchObject({
      mode: 'dry_run',
      sqlite: { queryOnly: true, written: false },
      safety: { gmailQueried: false, actionAuthority: 'none' },
    });
  });
});
