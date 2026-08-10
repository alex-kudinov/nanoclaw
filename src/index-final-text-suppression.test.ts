/**
 * Final-text suppression, both relays.
 *
 * `suppressFinalText` alone only fires on a root-triggered run, which makes it a
 * no-op for every threadPerMessage group — the grader included. Widening the
 * condition to all threadPerMessage groups was rejected: Sales is registered
 * with BOTH flags, and there the in-thread echo is the agent's only progress
 * channel. Hence the narrow opt-in pinned here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./logger.js', () => ({
  logger: {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
  },
}));

import {
  _setRegisteredGroups,
  routeAdoptedOutput,
  shouldSuppressFinalText,
} from './index.js';
import type { Channel, RegisteredGroup } from './types.js';

function grouped(
  containerConfig: RegisteredGroup['containerConfig'],
  folder = 'grader',
): RegisteredGroup {
  return {
    name: 'g',
    folder,
    trigger: '',
    added_at: '2026-08-09T00:00:00.000Z',
    containerConfig,
  };
}

const GRADER = grouped({
  threadPerMessage: true,
  suppressFinalText: true,
  suppressFinalTextInThreads: true,
});
// Live production config, read read-only during the R4 preflight.
const SALES = grouped(
  { threadPerMessage: true, suppressFinalText: true },
  'sales',
);
const INBOX = grouped({ suppressFinalText: true }, 'inbox');
const CONVERSATIONAL = grouped({}, 'chief');

describe('shouldSuppressFinalText', () => {
  it('suppresses grader final text in its submission thread', () => {
    expect(shouldSuppressFinalText(GRADER, 'thr-1')).toBe(true);
  });

  it('fails the grader closed even when its registered flags are stale', () => {
    const staleGrader = grouped({
      threadPerMessage: true,
      suppressFinalText: false,
    });
    expect(shouldSuppressFinalText(staleGrader, 'thr-1')).toBe(true);
  });

  it('suppresses grader final text on a root-triggered run too', () => {
    expect(shouldSuppressFinalText(GRADER, undefined)).toBe(true);
  });

  it('leaves Sales threaded progress posts alone', () => {
    // The regression that a generic threadPerMessage fix would have caused:
    // Sales is threadPerMessage AND suppressFinalText, and a blanket rule once
    // hid a stalled send for 45 minutes (Entry 938).
    expect(shouldSuppressFinalText(SALES, 'thr-1')).toBe(false);
  });

  it('still suppresses Sales root recaps', () => {
    expect(shouldSuppressFinalText(SALES, undefined)).toBe(true);
  });

  it('leaves Inbox behaviour unchanged in both positions', () => {
    expect(shouldSuppressFinalText(INBOX, undefined)).toBe(true);
    expect(shouldSuppressFinalText(INBOX, 'thr-1')).toBe(false);
  });

  it('never suppresses for a group that did not opt in', () => {
    expect(shouldSuppressFinalText(CONVERSATIONAL, undefined)).toBe(false);
    expect(shouldSuppressFinalText(CONVERSATIONAL, 'thr-1')).toBe(false);
    expect(shouldSuppressFinalText(undefined, 'thr-1')).toBe(false);
  });

  it('ignores suppressFinalTextInThreads without suppressFinalText', () => {
    const halfSet = grouped(
      { suppressFinalTextInThreads: true },
      'some-other-group',
    );
    expect(shouldSuppressFinalText(halfSet, 'thr-1')).toBe(false);
    expect(shouldSuppressFinalText(halfSet, undefined)).toBe(false);
  });
});

describe('routeAdoptedOutput', () => {
  const GRADER_JID = 'slack:GRADER';
  const SALES_JID = 'slack:SALES';
  let sendMessage: ReturnType<typeof vi.fn>;
  let channel: Channel;

  beforeEach(() => {
    sendMessage = vi.fn(async () => {});
    channel = { sendMessage } as unknown as Channel;
    _setRegisteredGroups({ [GRADER_JID]: GRADER, [SALES_JID]: SALES });
  });

  function sidecar(chatJid: string, threadTs: string | null) {
    return {
      chatJid,
      threadTs,
      groupFolder: chatJid === GRADER_JID ? 'grader' : 'sales',
      groupName: 'g',
      sessionKey: 'k',
      compositeKey: `${chatJid}||${threadTs ?? 'root'}`,
    } as never;
  }

  // B2: this relay had no suppression check at all, so after a host restart
  // adopted a running grader container the raw final text went straight into the
  // submission thread, ungated and unmarked.
  it('suppresses adopted grader output in-thread', async () => {
    await routeAdoptedOutput(sidecar(GRADER_JID, 'thr-1'), channel, {
      result: 'The submission is graded. Feedback posted.',
    } as never);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('uses the adopted sidecar source when registration is stale', async () => {
    _setRegisteredGroups({
      [GRADER_JID]: grouped({ suppressFinalText: false }),
    });

    await routeAdoptedOutput(sidecar(GRADER_JID, 'thr-1'), channel, {
      result: 'The submission is graded. Feedback posted.',
    } as never);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('still relays adopted output for a group that did not opt in', async () => {
    await routeAdoptedOutput(sidecar(SALES_JID, 'thr-2'), channel, {
      result: 'Still awaiting the Gmail search result.',
    } as never);

    expect(sendMessage).toHaveBeenCalledWith(
      SALES_JID,
      'Still awaiting the Gmail search result.',
      expect.objectContaining({ fromGroup: 'sales', threadTs: 'thr-2' }),
    );
  });
});
