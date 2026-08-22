import { describe, expect, it, vi } from 'vitest';

import {
  parseFollowupReviewArgs,
  runFollowupReviewCli,
} from './followup-review-cli.js';
import { makeFollowupShadowObservation } from './followup-shadow.js';
import type { ReceivableCase } from './followup-policy.js';

const NOW = new Date('2026-08-21T16:00:00.000Z');

describe('follow-up review CLI', () => {
  it('defaults to a bounded read-only packet', () => {
    expect(parseFollowupReviewArgs([], NOW)).toEqual({
      mode: 'dry_run',
      observedAt: NOW.toISOString(),
      limit: 10,
    });
  });

  it('allows only dry-run scan controls', () => {
    expect(
      parseFollowupReviewArgs(
        ['--dry-run', '--observed-at', NOW.toISOString(), '--limit', '5'],
        NOW,
      ),
    ).toEqual({
      mode: 'dry_run',
      observedAt: NOW.toISOString(),
      limit: 5,
    });
    expect(() => parseFollowupReviewArgs(['--apply'], NOW)).toThrow(
      'unknown argument',
    );
    expect(() => parseFollowupReviewArgs(['--post'], NOW)).toThrow(
      'unknown argument',
    );
    expect(() => parseFollowupReviewArgs(['--limit', '26'], NOW)).toThrow(
      'integer from 1 to 25',
    );
  });

  it('prints no packet when any required source read failed', async () => {
    const writeOutput = vi.fn();
    const reset = vi.fn(async () => undefined);
    await expect(
      runFollowupReviewCli([], {
        readSources: async () => ({
          observations: [],
          existing: [],
          sourceErrors: [
            { source: 'plutio_transactions', code: 'read_failed' },
          ],
        }),
        writeOutput,
        reset,
      }),
    ).rejects.toThrow('required source reads failed');
    expect(writeOutput).not.toHaveBeenCalled();
    expect(reset).toHaveBeenCalledOnce();
  });

  it('prints the content-minimized dry-run packet', async () => {
    const receivable: ReceivableCase = {
      lane: 'receivable',
      sourceKey: 'plutio-invoice:inv-1',
      observedAt: NOW.toISOString(),
      sourceEvidenceComplete: true,
      sourceIdentityConflict: false,
      pendingAction: false,
      uncertainDelivery: false,
      suppressed: false,
      partyId: '20',
      invoiceStatus: 'overdue',
      dueAt: '2026-08-10T16:00:00.000Z',
      outstandingAmount: 500,
      currency: 'USD',
      paymentReconciled: true,
      collectionApproved: false,
      specialHandling: false,
      recipientResolved: true,
      ownerResolved: false,
      confirmedAttempts: 0,
      lastConfirmedAttemptAt: null,
    };
    const writeOutput = vi.fn();
    const packet = await runFollowupReviewCli(
      ['--observed-at', NOW.toISOString()],
      {
        readSources: async () => ({
          observations: [makeFollowupShadowObservation('plutio', receivable)],
          existing: [],
          sourceErrors: [],
        }),
        writeOutput,
        reset: async () => undefined,
      },
    );
    expect(packet.items).toHaveLength(1);
    expect(writeOutput).toHaveBeenCalledWith(
      expect.stringContaining('"mode": "dry_run"'),
    );
  });
});
