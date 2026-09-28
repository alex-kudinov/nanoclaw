import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EmailSendActionRow } from './db.js';
import { armedActionText, cancelOutcomeText } from './email-thread-notices.js';

const NOW = new Date('2026-09-28T10:05:00.000Z');

function action(over: Partial<EmailSendActionRow>): EmailSendActionRow {
  return {
    actionId: 'action-1',
    draftTs: 'card-ts',
    groupFolder: 'sales',
    chatJid: 'slack:SALES',
    threadTs: 'thread-ts',
    approvedAt: '2026-09-28T10:00:00.000Z',
    state: 'approved',
    ...over,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('cancelOutcomeText', () => {
  it('confirms what was stopped', () => {
    expect(cancelOutcomeText('Alex', ['action-1'], [], NOW)).toBe(
      '🛑 [EMAIL CANCELLED] Alex stopped Action action-1 before Gmail. Nothing was sent. Approve a revised card, or say `force send: <reason>` to send this one after all.',
    );
    expect(cancelOutcomeText('sales', ['a', 'b'], [], NOW)).toContain(
      'stopped 2 approved emails',
    );
  });

  it('says "too late" when the email had just reached Gmail', () => {
    const text = cancelOutcomeText(
      'Alex',
      [],
      [
        action({
          state: 'confirmed',
          executionStartedAt: '2026-09-28T10:00:31.000Z',
        }),
      ],
      NOW,
    );
    expect(text).toContain('Too late to stop Action action-1');
    expect(text).toContain('Gmail already accepted it');
  });

  it('stays quiet when the stop concerns no recent email', () => {
    expect(cancelOutcomeText('Alex', [], [], NOW)).toBeUndefined();
    expect(
      cancelOutcomeText(
        'Alex',
        [],
        [
          action({
            state: 'confirmed',
            executionStartedAt: '2026-09-28T09:00:00.000Z',
          }),
        ],
        NOW,
      ),
    ).toBeUndefined();
    expect(
      cancelOutcomeText('Alex', [], [action({ state: 'blocked' })], NOW),
    ).toBeUndefined();
  });
});

describe('armedActionText', () => {
  it('names the Action-ID and the cancel window', () => {
    vi.stubEnv('MAILMAN_HOLD_SECONDS', '45');
    const text = armedActionText('action-1');
    expect(text).toContain('Action-ID: action-1');
    expect(text).toContain('in 45 seconds');
  });
});
