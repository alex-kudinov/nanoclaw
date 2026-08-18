import { describe, expect, it, vi } from 'vitest';

import { createCompanyGmailRuntimeAlignmentReadOnlyPort } from './company-gmail-runtime-alignment-source.js';

function gmailWithResponses(...responses: unknown[]) {
  return {
    users: {
      history: {
        list: vi.fn().mockImplementation(() => {
          const response = responses.shift();
          if (response instanceof Error || (response as any)?.code) {
            return Promise.reject(response);
          }
          return Promise.resolve(response);
        }),
      },
    },
  } as any;
}

describe('Company Gmail runtime alignment source', () => {
  it('fully pages and accounts only messageAdded records through the fixed target', async () => {
    const gmail = gmailWithResponses(
      {
        data: {
          historyId: '200',
          nextPageToken: 'p2',
          history: [
            { id: '110', messagesAdded: [{ message: { id: 'm1' } }] },
            { id: '130', messagesAdded: [{ message: { id: 'later' } }] },
          ],
        },
      },
      {
        data: {
          historyId: '210',
          history: [
            { id: '150', messagesAdded: [{ message: { id: 'later2' } }] },
          ],
        },
      },
    );
    const accountCandidate = vi.fn().mockResolvedValue({
      disposition: 'accepted',
      reasonKey: 'inbound_message_persisted',
      evidenceSha256: 'a'.repeat(64),
    });
    const port = createCompanyGmailRuntimeAlignmentReadOnlyPort(
      gmail,
      accountCandidate,
    );

    const result = await port.listClosedRange('100', '120');

    expect(result).toMatchObject({
      startHistoryId: '100',
      targetHistoryId: '120',
      terminalHeadHistoryId: '210',
      pagesRead: 2,
    });
    expect(result.candidates.map((candidate) => candidate.messageId)).toEqual([
      'm1',
    ]);
    expect(accountCandidate).toHaveBeenCalledTimes(1);
    expect(gmail.users.history.list).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        startHistoryId: '100',
        historyTypes: ['messageAdded'],
        maxResults: 500,
      }),
    );
  });

  it('refuses an expired alignment start without changing evidence', async () => {
    const port = createCompanyGmailRuntimeAlignmentReadOnlyPort(
      gmailWithResponses({ code: 404 }),
      vi.fn(),
    );
    await expect(port.listClosedRange('100', '120')).rejects.toMatchObject({
      code: 'history_expired',
    });
  });

  it('refuses non-increasing history records', async () => {
    const port = createCompanyGmailRuntimeAlignmentReadOnlyPort(
      gmailWithResponses({
        data: {
          historyId: '200',
          history: [{ id: '110' }, { id: '109' }],
        },
      }),
      vi.fn(),
    );
    await expect(port.listClosedRange('100', '120')).rejects.toMatchObject({
      code: 'source_drift',
    });
  });
});
