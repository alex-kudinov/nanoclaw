/**
 * Final-text suppression, both relays.
 *
 * `suppressFinalText` alone only fires on a root-triggered run, which makes it a
 * no-op for every threadPerMessage group — the grader included. Widening the
 * condition to all threadPerMessage groups was rejected. Grader and Sales are
 * explicit host-owned boundaries: both publish useful output through gated
 * tools, while raw final text is only an unverified duplicate or status claim.
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
  isSalesNoActionResult,
  noticeSalesRunWithNoOutput,
  routeAdoptedOutput,
  SALES_MISSING_OUTPUT_NOTICE,
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
  {
    threadPerMessage: true,
    suppressFinalText: true,
    suppressFinalTextInThreads: true,
  },
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

  it('suppresses Sales threaded recaps and unverified status claims', () => {
    expect(shouldSuppressFinalText(SALES, 'thr-1')).toBe(true);
  });

  it('fails Sales closed even when its persisted suppression flags are stale', () => {
    const staleSales = grouped({ threadPerMessage: true }, 'sales');
    expect(shouldSuppressFinalText(staleSales, 'thr-1')).toBe(true);
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

  it('suppresses adopted Sales final text in-thread', async () => {
    await routeAdoptedOutput(sidecar(SALES_JID, 'thr-2'), channel, {
      result: 'Still awaiting the Gmail search result.',
    } as never);

    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('Sales missing-output notice', () => {
  it('recognizes only the exact intentional no-action result', () => {
    expect(isSalesNoActionResult('<internal>NO_ACTION</internal>')).toBe(true);
    expect(isSalesNoActionResult(' <internal>NO_ACTION</internal>\n')).toBe(
      true,
    );
    expect(isSalesNoActionResult('<internal>still thinking</internal>')).toBe(
      false,
    );
    expect(isSalesNoActionResult('NO_ACTION')).toBe(false);
  });

  it('posts one fixed notice after a clean run with no gated output', async () => {
    const sendMessage = vi.fn(async () => {});
    const channel = { sendMessage } as unknown as Channel;

    await expect(
      noticeSalesRunWithNoOutput(
        'slack:SALES',
        'thr-quiet',
        '2026-09-08T18:00:00.000Z',
        channel,
        {
          latestResponse: () => undefined,
          wait: async () => {},
          polls: 2,
        },
      ),
    ).resolves.toBe(true);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      'slack:SALES',
      SALES_MISSING_OUTPUT_NOTICE,
      { fromGroup: 'sales', threadTs: 'thr-quiet' },
    );
  });

  it('stays quiet when a real Sales tool post appears during the drain', async () => {
    const sendMessage = vi.fn(async () => {});
    const channel = { sendMessage } as unknown as Channel;
    const latestResponse = vi
      .fn()
      .mockReturnValueOnce(undefined)
      .mockReturnValue('2026-09-08T18:00:01.000Z');

    await expect(
      noticeSalesRunWithNoOutput(
        'slack:SALES',
        'thr-card',
        '2026-09-08T18:00:00.000Z',
        channel,
        {
          latestResponse,
          wait: async () => {},
          polls: 2,
        },
      ),
    ).resolves.toBe(false);

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
