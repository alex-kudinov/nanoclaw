import { describe, expect, it, vi } from 'vitest';

import type { EmailSendActionRow } from './db.js';
import {
  forceSendActors,
  handleForceSend,
  parseForceSendCommand,
  type ForceSendDeps,
  type ForceSendRequest,
} from './email-force-send.js';

const ACTION_ID = '82c0f1d2-f124-4e3d-b06d-a4e6774f82cd';
const OWNER = 'U07L0AXNLKE';

function row(over: Partial<EmailSendActionRow> = {}): EmailSendActionRow {
  return {
    actionId: ACTION_ID,
    draftTs: 'card-ts',
    groupFolder: 'sales',
    chatJid: 'slack:SALES',
    threadTs: 'thread-ts',
    recipient: 'lead@example.co',
    approvedAt: '2026-09-28T10:00:00.000Z',
    state: 'blocked',
    lastErrorCode: 'recipient_guard',
    ...over,
  };
}

function request(over: Partial<ForceSendRequest> = {}): ForceSendRequest {
  return {
    chatJid: 'slack:SALES',
    threadTs: 'thread-ts',
    actorUid: OWNER,
    actorName: 'Alex',
    reason: 'customer is waiting on this reply',
    ...over,
  };
}

function makeDeps(
  actions: EmailSendActionRow[],
  latestCard: string | undefined = 'card-ts',
) {
  const posts: string[] = [];
  const deps: ForceSendDeps = {
    allowedActors: () => new Set([OWNER]),
    listThreadActions: vi.fn(() => actions),
    latestCardTs: vi.fn(() => latestCard),
    armCard: vi.fn(async () => undefined),
    findSentCopy: vi.fn(async () => undefined),
    reconcileAsSent: vi.fn(() => 1),
    reopen: vi.fn((a: EmailSendActionRow) => ({
      ...a,
      state: 'approved' as const,
    })),
    execute: vi.fn(async () => 'sent' as const),
    postThread: vi.fn(async (text: string) => {
      posts.push(text);
    }),
  };
  return { deps, posts };
}

describe('parseForceSendCommand', () => {
  it.each([
    ['force send: customer is waiting', 'customer is waiting'],
    ['Force-Send — card is correct', 'card is correct'],
    ['  FORCE SEND:   spaced reason  ', 'spaced reason'],
    ['force send:', ''],
  ])('parses %j', (text, reason) => {
    expect(parseForceSendCommand(text)).toBe(reason);
  });

  it.each(['send it', 'please force send: x', 'force sending now', ''])(
    'ignores %j',
    (text) => {
      expect(parseForceSendCommand(text)).toBeUndefined();
    },
  );
});

describe('forceSendActors', () => {
  it('is empty by default and trims configured IDs', () => {
    expect(forceSendActors('').size).toBe(0);
    expect([...forceSendActors(' U1, ,U2 ')]).toEqual(['U1', 'U2']);
  });
});

describe('handleForceSend', () => {
  it('refuses a Slack user who is not on the allow-list', async () => {
    const { deps } = makeDeps([row()]);
    const reply = await handleForceSend(request({ actorUid: 'U999' }), deps);
    expect(reply).toContain('EMAIL_FORCE_SEND_SLACK_USERS');
    expect(deps.reopen).not.toHaveBeenCalled();
    expect(deps.execute).not.toHaveBeenCalled();
  });

  it('requires a real reason', async () => {
    const { deps } = makeDeps([row()]);
    const reply = await handleForceSend(request({ reason: 'ok' }), deps);
    expect(reply).toContain('at least 10 characters');
    expect(deps.execute).not.toHaveBeenCalled();
  });

  it('reopens a blocked action with actor and reason, then sends it', async () => {
    const { deps, posts } = makeDeps([row()]);
    const reply = await handleForceSend(request(), deps);
    expect(deps.reopen).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: ACTION_ID }),
      OWNER,
      'customer is waiting on this reply',
    );
    expect(posts[0]).toBe(
      `📤 [FORCE SEND] Alex is sending Action ${ACTION_ID} as approved. Reason: customer is waiting on this reply`,
    );
    expect(deps.execute).toHaveBeenCalledWith(ACTION_ID);
    expect(reply).toBeUndefined();
  });

  it('skips actions superseded by a newer approval', async () => {
    const newer = row({ actionId: 'newer-action' });
    const { deps } = makeDeps([
      row({ lastErrorCode: 'superseded_by_newer_approval' }),
      newer,
    ]);
    await handleForceSend(request(), deps);
    expect(deps.execute).toHaveBeenCalledWith('newer-action');
  });

  it('never resends an action Gmail already confirmed', async () => {
    const { deps } = makeDeps([
      row({ state: 'confirmed', gmailMessageId: 'gmail-msg-1' }),
    ]);
    const reply = await handleForceSend(request(), deps);
    expect(reply).toContain('already sent');
    expect(reply).toContain('gmail-msg-1');
    expect(deps.execute).not.toHaveBeenCalled();
  });

  it('records an uncertain action as sent when Gmail Sent already has it', async () => {
    const { deps } = makeDeps([row({ state: 'uncertain' })]);
    vi.mocked(deps.findSentCopy).mockResolvedValue({
      messageId: 'gmail-msg-9',
      threadId: 'gmail-thread',
    });
    const reply = await handleForceSend(request(), deps);
    expect(deps.reconcileAsSent).toHaveBeenCalled();
    expect(reply).toContain('nothing was resent');
    expect(deps.execute).not.toHaveBeenCalled();
  });

  it('refuses an uncertain action when Gmail Sent cannot be read', async () => {
    const { deps } = makeDeps([row({ state: 'uncertain' })]);
    vi.mocked(deps.findSentCopy).mockRejectedValue(new Error('auth expired'));
    const reply = await handleForceSend(request(), deps);
    expect(reply).toContain('nothing was sent');
    expect(deps.reopen).not.toHaveBeenCalled();
    expect(deps.execute).not.toHaveBeenCalled();
  });

  it('sends an uncertain action once Gmail Sent shows no copy', async () => {
    const { deps } = makeDeps([row({ state: 'uncertain' })]);
    await handleForceSend(request(), deps);
    expect(deps.execute).toHaveBeenCalledWith(ACTION_ID);
  });

  it('arms the newest card when no action exists yet', async () => {
    const { deps } = makeDeps([]);
    vi.mocked(deps.armCard).mockResolvedValue(row({ state: 'approved' }));
    await handleForceSend(request(), deps);
    expect(deps.armCard).toHaveBeenCalledWith('card-ts');
    expect(deps.execute).toHaveBeenCalledWith(ACTION_ID);
  });

  it('never sends an older approval in place of a newer unapproved card', async () => {
    const { deps } = makeDeps(
      [row({ actionId: 'old-action', draftTs: 'old-card' })],
      'new-card',
    );
    vi.mocked(deps.armCard).mockResolvedValue(
      row({ actionId: 'new-action', draftTs: 'new-card', state: 'approved' }),
    );
    await handleForceSend(request(), deps);
    expect(deps.armCard).toHaveBeenCalledWith('new-card');
    expect(deps.execute).toHaveBeenCalledWith('new-action');
    expect(deps.execute).not.toHaveBeenCalledWith('old-action');
  });

  it('runs one force send per thread at a time', async () => {
    const { deps } = makeDeps([row()]);
    let release!: () => void;
    vi.mocked(deps.execute).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve('sent');
        }),
    );
    const first = handleForceSend(request(), deps);
    await vi.waitFor(() => expect(deps.execute).toHaveBeenCalledTimes(1));
    const second = await handleForceSend(request(), deps);
    expect(second).toContain('already running');
    release();
    await first;
    expect(deps.execute).toHaveBeenCalledTimes(1);
    expect(deps.reopen).toHaveBeenCalledTimes(1);
  });

  it('says so when the thread has no sendable card', async () => {
    const { deps } = makeDeps([], undefined);
    const reply = await handleForceSend(request(), deps);
    expect(reply).toContain('found no approval card');
    expect(deps.execute).not.toHaveBeenCalled();
  });

  it('reports a state the ledger will not reopen', async () => {
    const { deps } = makeDeps([row()]);
    vi.mocked(deps.reopen).mockReturnValue(undefined);
    const reply = await handleForceSend(request(), deps);
    expect(reply).toContain('cannot be force-sent');
    expect(deps.execute).not.toHaveBeenCalled();
  });
});
