import { describe, expect, it } from 'vitest';

import {
  formatGmailHistoricalCoverageReport,
  GMAIL_HISTORICAL_COVERAGE_CONFIRMATION,
  parseGmailHistoricalCoverageArgs,
} from './gmail-historical-coverage-cli.js';
import { buildGmailHistoricalCoverageReport } from './gmail-historical-coverage.js';

describe('Gmail historical coverage CLI', () => {
  it('requires an explicit finite ID bound and exact read-only confirmation', () => {
    expect(() => parseGmailHistoricalCoverageArgs([])).toThrow(
      '--max-ids is required',
    );
    expect(() =>
      parseGmailHistoricalCoverageArgs(['--max-ids', '500']),
    ).toThrow('exact read-only coverage confirmation is required');
    expect(() =>
      parseGmailHistoricalCoverageArgs([
        '--max-ids',
        '500',
        '--confirm-read-only',
        'wrong',
      ]),
    ).toThrow('exact read-only coverage confirmation is required');
    expect(() =>
      parseGmailHistoricalCoverageArgs([
        '--max-ids',
        '100001',
        '--confirm-read-only',
        GMAIL_HISTORICAL_COVERAGE_CONFIRMATION,
      ]),
    ).toThrow('--max-ids cannot exceed 100000');
  });

  it('accepts only the bounded read-only invocation', () => {
    expect(
      parseGmailHistoricalCoverageArgs([
        '--max-ids',
        '500',
        '--confirm-read-only',
        GMAIL_HISTORICAL_COVERAGE_CONFIRMATION,
      ]),
    ).toEqual({
      maxIds: 500,
      confirmation: GMAIL_HISTORICAL_COVERAGE_CONFIRMATION,
    });
    expect(() =>
      parseGmailHistoricalCoverageArgs([
        '--max-ids',
        '500',
        '--confirm-read-only',
        GMAIL_HISTORICAL_COVERAGE_CONFIRMATION,
        '--gmail-read',
      ]),
    ).toThrow('unknown argument: --gmail-read');
  });

  it('formats aggregate-only JSON without raw retained IDs', () => {
    const report = buildGmailHistoricalCoverageReport({
      scopeIdentity: 'gmail:retained-host:test',
      generatedAt: '2026-08-18T03:00:00.000Z',
      candidates: [
        {
          messageId: 'private-raw-gmail-id',
          receipt: null,
          storedEvidence: 'ordinary_persisted',
          classificationRouted: false,
        },
      ],
    });
    const output = formatGmailHistoricalCoverageReport(report);
    expect(output).not.toContain('private-raw-gmail-id');
    expect(JSON.parse(output)).toMatchObject({
      evidenceScope: {
        basis: 'retained_host_evidence',
        mailboxComplete: false,
        gmailQueried: false,
      },
      totalIds: 1,
      accountingClosed: true,
    });
  });
});
