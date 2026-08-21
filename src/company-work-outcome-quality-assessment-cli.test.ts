import { describe, expect, it } from 'vitest';

import {
  formatCompanyWorkOutcomeAssessmentReport,
  parseCompanyWorkOutcomeAssessmentArgs,
} from './company-work-outcome-quality-assessment-cli.js';
import { COMPANY_WORK_OUTCOME_ASSESSMENT_CONFIRMATION } from './company-work-outcome-quality-assessment.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const RELEASE = 'd'.repeat(40);

function commonArgs(): string[] {
  return [
    '--work-item-id',
    '41',
    '--delivery-event-version',
    '7',
    '--assessment',
    'clean',
    '--source-key-sha256',
    HASH_A,
    '--evidence-sha256',
    HASH_B,
    '--assessor-key-sha256',
    HASH_C,
    '--evidence-occurred-at',
    '2026-08-20T11:30:00.000Z',
    '--assessed-at',
    '2026-08-20T12:00:00.000Z',
  ];
}

describe('Company Work outcome-quality assessment CLI', () => {
  it('defaults to dry-run and accepts no apply-only flags', () => {
    expect(parseCompanyWorkOutcomeAssessmentArgs(commonArgs())).toMatchObject({
      mode: 'dry_run',
      workItemId: '41',
      deliveryEventVersion: 7,
      expectedPlanSha256: null,
      confirmation: null,
      confirmHost: null,
      expectedRelease: null,
    });
    expect(() =>
      parseCompanyWorkOutcomeAssessmentArgs([
        ...commonArgs(),
        '--expected-plan-sha256',
        HASH_A,
      ]),
    ).toThrow('apply confirmation flags are not valid for dry-run');
  });

  it('requires the complete exact apply gate', () => {
    const args = [
      '--apply',
      ...commonArgs(),
      '--expected-plan-sha256',
      HASH_A,
      '--confirm-apply',
      COMPANY_WORK_OUTCOME_ASSESSMENT_CONFIRMATION,
      '--confirm-host',
      'mini-claw',
      '--expected-release',
      RELEASE,
    ];
    expect(parseCompanyWorkOutcomeAssessmentArgs(args)).toMatchObject({
      mode: 'apply',
      expectedPlanSha256: HASH_A,
      confirmation: COMPANY_WORK_OUTCOME_ASSESSMENT_CONFIRMATION,
      confirmHost: 'mini-claw',
      expectedRelease: RELEASE,
    });

    expect(() =>
      parseCompanyWorkOutcomeAssessmentArgs(['--apply', ...commonArgs()]),
    ).toThrow('--expected-plan-sha256 is required with --apply');
    expect(() =>
      parseCompanyWorkOutcomeAssessmentArgs([
        '--apply',
        ...commonArgs(),
        '--expected-plan-sha256',
        HASH_A,
        '--confirm-apply',
        'yes',
        '--confirm-host',
        'mini-claw',
        '--expected-release',
        RELEASE,
      ]),
    ).toThrow('exact --confirm-apply value is required with --apply');
  });

  it('rejects duplicate modes, duplicate values, unsafe versions, and unknown flags', () => {
    expect(() =>
      parseCompanyWorkOutcomeAssessmentArgs([
        '--dry-run',
        '--apply',
        ...commonArgs(),
      ]),
    ).toThrow('mode may appear only once');
    expect(() =>
      parseCompanyWorkOutcomeAssessmentArgs([
        ...commonArgs(),
        '--work-item-id',
        '42',
      ]),
    ).toThrow('--work-item-id may appear only once');
    expect(() =>
      parseCompanyWorkOutcomeAssessmentArgs(
        commonArgs().map((value) => (value === '7' ? '-1' : value)),
      ),
    ).toThrow('--delivery-event-version must be a nonnegative integer');
    expect(() =>
      parseCompanyWorkOutcomeAssessmentArgs([...commonArgs(), '--send']),
    ).toThrow('unknown argument: --send');
  });

  it('formats only the bounded report and release identity', () => {
    const output = formatCompanyWorkOutcomeAssessmentReport({
      report: {
        contractVersion: 1,
        taskId: 'NC-20260820-007',
        mode: 'dry_run',
        status: 'planned',
        plan: {
          contractVersion: 1,
          taskId: 'NC-20260820-007',
          target: {
            workflow: 'sales_email',
            workItemId: '41',
            deliveryEventVersion: 7,
            deliveryOccurredAt: '2026-08-20T11:00:00.000Z',
          },
          assessment: {
            value: 'clean',
            sourceSystem: 'operator_review',
            sourceKeySha256: HASH_A,
            evidenceSha256: HASH_B,
            assessorKind: 'operator',
            assessorKeySha256: HASH_C,
            evidenceOccurredAt: '2026-08-20T11:30:00.000Z',
            assessedAt: '2026-08-20T12:00:00.000Z',
          },
          chain: {
            disposition: 'insert',
            assessmentRevision: 1,
            supersedesReceiptId: null,
            existingReceiptId: null,
          },
          authorization: {
            expiresAt: '2026-08-20T12:15:00.000Z',
            requiredConfirmation: COMPANY_WORK_OUTCOME_ASSESSMENT_CONFIRMATION,
          },
          safety: {
            gmailQueried: false,
            slackQueried: false,
            customerContentRead: false,
            daemonImported: false,
            agentAuthority: 'none',
            externalActionAuthority: 'none',
          },
          planSha256: HASH_A,
        },
        receipt: { inserted: false, receiptId: null, assessmentRevision: 1 },
      },
      runtime: null,
    });
    expect(output).toContain('"requiredForApply": true');
    expect(output).not.toContain('lead@example.com');
    expect(output).not.toContain('customer message');
  });
});
