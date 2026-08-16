import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildHostApprovedEmailExecution } from './approved-email-execution.js';
import { buildApprovedHandoff } from './approved-send-handoff.js';
import type { EmailSendActionRow } from './db.js';
import { hashApprovedEmailContent } from './email-action.js';
import type { GmailIpcPayload } from './gmail-ipc-handlers.js';
import { EMAIL_CRITICAL_TEST_ARGS } from '../scripts/run-email-critical-tests.mjs';

type ApprovalRecoveryCase = {
  id: string;
  historicalRefs: string[];
  mode: 'approval_card_recovery';
  card: string;
  options: {
    actionId?: string;
    sourceGroup?: string;
    originalMessage?: string;
    entryId?: number;
  };
  expected:
    | { status: 'held' }
    | {
        status: 'ready';
        recipient: string;
        subject: string;
        body: string;
        emailType: 'initial' | 'follow-up';
        gmailThreadId?: string;
        handoffContains: string[];
      };
};

type HostExecutionCase = {
  id: string;
  historicalRefs: string[];
  mode: 'host_execution';
  card: string;
  approvedContent: { subject: string; body: string };
  action: Omit<EmailSendActionRow, 'approvedContentSha256'>;
  request: GmailIpcPayload;
  expected:
    | { status: 'blocked'; code: string }
    | {
        status: 'corrected';
        payload: Partial<GmailIpcPayload>;
        correctedFields: string[];
        absentFields: string[];
      };
};

type RequiredRegression = {
  id: string;
  testFile: string;
  marker: string;
};

type IncidentCorpus = {
  schemaVersion: number;
  fixturePolicy: string;
  replayCases: Array<ApprovalRecoveryCase | HostExecutionCase>;
  requiredRegressions: RequiredRegression[];
};

const fixturePath = resolve(
  process.cwd(),
  'evals',
  'email-delivery',
  'incidents.json',
);
const fixtureText = readFileSync(fixturePath, 'utf8');
const corpus = JSON.parse(fixtureText) as IncidentCorpus;

function collectEmailAddresses(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/gi) ?? [];
  }
  if (Array.isArray(value)) return value.flatMap(collectEmailAddresses);
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectEmailAddresses);
  }
  return [];
}

describe('approved-email historical incident corpus', () => {
  it('is versioned, unique, traceable, and synthetic-only', () => {
    expect(corpus.schemaVersion).toBe(2);
    expect(corpus.fixturePolicy).toContain('Synthetic identities');
    expect(corpus.fixturePolicy).toContain('No Gmail');
    expect(corpus.replayCases.length).toBeGreaterThanOrEqual(10);
    expect(corpus.requiredRegressions.length).toBeGreaterThanOrEqual(16);

    const allIds = [
      ...corpus.replayCases.map((testCase) => testCase.id),
      ...corpus.requiredRegressions.map((regression) => regression.id),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);
    for (const testCase of corpus.replayCases) {
      expect(testCase.historicalRefs.length, testCase.id).toBeGreaterThan(0);
      expect(
        testCase.historicalRefs.every(
          (reference) => reference.trim().length > 0,
        ),
        testCase.id,
      ).toBe(true);
    }
    for (const address of collectEmailAddresses(corpus)) {
      expect(address.toLowerCase(), address).toMatch(/@example\.test$/);
    }
  });

  it.each(
    corpus.replayCases.map((testCase) => [testCase.id, testCase] as const),
  )('replays %s without an external side effect', (_id, testCase) => {
    if (testCase.mode === 'approval_card_recovery') {
      const built = buildApprovedHandoff(testCase.card, testCase.options);
      if (testCase.expected.status === 'held') {
        expect(built).toBeNull();
        return;
      }

      expect(built).toMatchObject({
        recipient: testCase.expected.recipient,
        subject: testCase.expected.subject,
        body: testCase.expected.body,
        emailType: testCase.expected.emailType,
        ...(testCase.expected.gmailThreadId
          ? { gmailThreadId: testCase.expected.gmailThreadId }
          : {}),
      });
      for (const fragment of testCase.expected.handoffContains) {
        expect(built?.text, fragment).toContain(fragment);
      }
      return;
    }

    const action: EmailSendActionRow = {
      ...testCase.action,
      approvedContentSha256: hashApprovedEmailContent(
        testCase.approvedContent.subject,
        testCase.approvedContent.body,
      ),
    };
    const result = buildHostApprovedEmailExecution(
      action,
      testCase.card,
      testCase.request,
    );
    if (testCase.expected.status === 'blocked') {
      expect(result).toMatchObject({
        ok: false,
        code: testCase.expected.code,
      });
      return;
    }

    expect(result).toMatchObject({
      ok: true,
      payload: testCase.expected.payload,
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.correctedFields).toEqual(testCase.expected.correctedFields);
    for (const field of testCase.expected.absentFields) {
      expect(result.payload).not.toHaveProperty(field);
    }
  });

  it('keeps every linked stateful regression inside the release-blocking gate', () => {
    for (const regression of corpus.requiredRegressions) {
      expect(EMAIL_CRITICAL_TEST_ARGS, regression.id).toContain(
        regression.testFile,
      );
      const source = readFileSync(
        resolve(process.cwd(), regression.testFile),
        'utf8',
      );
      expect(source, regression.id).toContain(regression.marker);
    }
  });

  it('cannot itself be omitted from the email-critical release gate', () => {
    expect(EMAIL_CRITICAL_TEST_ARGS).toContain(
      'src/email-delivery-incident-replay.test.ts',
    );
  });
});
