/** Read-only Gmail history range used only by the one-shot runtime alignment. */

import type { gmail_v1 } from 'googleapis';

import {
  COMPANY_GMAIL_RECONCILIATION_MAX_PAGES,
  COMPANY_GMAIL_RECONCILIATION_PAGE_SIZE,
  type CompanyGmailCandidateAccounting,
  type CompanyGmailCandidateReceipt,
} from './company-gmail-reconciliation.js';
import { runtimeCandidate } from './company-gmail-runtime-watermark.js';

const UINT_PATTERN = /^(0|[1-9][0-9]*)$/;
const MESSAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export type CompanyGmailRuntimeAlignmentSourceErrorCode =
  | 'invalid_input'
  | 'history_expired'
  | 'page_limit'
  | 'source_unavailable'
  | 'source_drift';

export class CompanyGmailRuntimeAlignmentSourceError extends Error {
  constructor(
    public readonly code: CompanyGmailRuntimeAlignmentSourceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CompanyGmailRuntimeAlignmentSourceError';
  }
}

export interface CompanyGmailRuntimeAlignmentRange {
  startHistoryId: string;
  targetHistoryId: string;
  terminalHeadHistoryId: string;
  pagesRead: number;
  candidates: readonly CompanyGmailCandidateReceipt[];
}

function fail(
  code: CompanyGmailRuntimeAlignmentSourceErrorCode,
  message: string,
  cause?: unknown,
): never {
  throw new CompanyGmailRuntimeAlignmentSourceError(
    code,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function historyId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UINT_PATTERN.test(value)) {
    fail('source_drift', `${field} is invalid`);
  }
  return BigInt(value).toString();
}

function compare(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function createCompanyGmailRuntimeAlignmentReadOnlyPort(
  gmail: gmail_v1.Gmail,
  accountCandidate: (
    messageId: string,
  ) => Promise<CompanyGmailCandidateAccounting>,
): {
  listClosedRange(
    startHistoryId: string,
    targetHistoryId: string,
  ): Promise<CompanyGmailRuntimeAlignmentRange>;
} {
  return {
    async listClosedRange(startValue, targetValue) {
      const startHistoryId = historyId(startValue, 'startHistoryId');
      const targetHistoryId = historyId(targetValue, 'targetHistoryId');
      if (compare(targetHistoryId, startHistoryId) <= 0) {
        fail('invalid_input', 'alignment target must advance the start cursor');
      }
      const messageIds = new Set<string>();
      let pageToken: string | undefined;
      let pagesRead = 0;
      let previousRecordId = startHistoryId;
      let terminalHeadHistoryId = startHistoryId;
      for (
        let page = 0;
        page < COMPANY_GMAIL_RECONCILIATION_MAX_PAGES;
        page++
      ) {
        let response;
        try {
          response = await gmail.users.history.list({
            userId: 'me',
            startHistoryId,
            historyTypes: ['messageAdded'],
            maxResults: COMPANY_GMAIL_RECONCILIATION_PAGE_SIZE,
            ...(pageToken ? { pageToken } : {}),
          });
        } catch (error) {
          if ((error as { code?: number }).code === 404) {
            fail(
              'history_expired',
              'alignment start history ID expired',
              error,
            );
          }
          fail(
            'source_unavailable',
            'Gmail alignment history read failed',
            error,
          );
        }
        pagesRead++;
        terminalHeadHistoryId = historyId(
          response.data.historyId,
          'history response head',
        );
        for (const record of response.data.history ?? []) {
          const recordId = historyId(record.id, 'history record ID');
          if (compare(recordId, previousRecordId) <= 0) {
            fail('source_drift', 'Gmail history records are not increasing');
          }
          previousRecordId = recordId;
          if (compare(recordId, targetHistoryId) > 0) continue;
          for (const added of record.messagesAdded ?? []) {
            const messageId = added.message?.id;
            if (
              typeof messageId !== 'string' ||
              !MESSAGE_ID_PATTERN.test(messageId)
            ) {
              fail('source_drift', 'Gmail history candidate ID is invalid');
            }
            messageIds.add(messageId);
          }
        }
        pageToken = response.data.nextPageToken ?? undefined;
        if (!pageToken) break;
      }
      if (pageToken) {
        fail('page_limit', 'Gmail alignment exceeded the 20-page bound');
      }
      if (compare(terminalHeadHistoryId, targetHistoryId) < 0) {
        fail('source_drift', 'Gmail history head is behind alignment target');
      }
      const candidates: CompanyGmailCandidateReceipt[] = [];
      for (const messageId of [...messageIds].sort()) {
        candidates.push(
          runtimeCandidate(messageId, await accountCandidate(messageId)),
        );
      }
      return Object.freeze({
        startHistoryId,
        targetHistoryId,
        terminalHeadHistoryId,
        pagesRead,
        candidates: Object.freeze(candidates),
      });
    },
  };
}
