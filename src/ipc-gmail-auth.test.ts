import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const testState = vi.hoisted(() => {
  const fsModule = require('fs') as typeof import('fs');
  const osModule = require('os') as typeof import('os');
  const pathModule = require('path') as typeof import('path');
  return {
    root: fsModule.mkdtempSync(
      pathModule.join(osModule.tmpdir(), 'nanoclaw-gmail-auth-'),
    ),
    dispatch: vi.fn(async (..._args: unknown[]) => {}),
    claim: vi.fn((..._args: unknown[]): unknown => undefined),
    confirm: vi.fn((..._args: unknown[]) => undefined),
    fail: vi.fn((..._args: unknown[]) => undefined),
    findAction: vi.fn((..._args: unknown[]) => ({ ambiguous: false })),
    getAction: vi.fn((..._args: unknown[]): unknown => undefined),
    testRecipient: '',
  };
});

vi.mock('./config.js', () => ({
  DATA_DIR: testState.root,
  IPC_POLL_INTERVAL: 1000,
  TIMEZONE: 'America/Chicago',
  get GMAIL_TEST_RECIPIENT() {
    return testState.testRecipient;
  },
}));
vi.mock('./logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('./db.js', () => ({
  claimEmailActionExecution: (...args: unknown[]) => testState.claim(...args),
  clearPendingSendsByRecipient: vi.fn(() => 0),
  confirmEmailAction: (...args: unknown[]) => testState.confirm(...args),
  failEmailAction: (...args: unknown[]) => testState.fail(...args),
  findPendingSendAction: (...args: unknown[]) => testState.findAction(...args),
  getPendingSendByActionId: (...args: unknown[]) =>
    testState.getAction(...args),
  markEmailActionHandoff: vi.fn(() => 0),
  markPendingSendHandoff: vi.fn(() => 0),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  getTaskById: vi.fn(),
  getPendingSendByGmailThread: vi.fn((threadId: string) =>
    threadId === 'approved-thread'
      ? { recipient: 'approved@example.co' }
      : undefined,
  ),
  storeMessageDirect: vi.fn(),
  updateTask: vi.fn(),
}));
vi.mock('./send-watchdog.js', () => ({
  observeConfirmedSend: vi.fn(),
  observeOutbound: vi.fn(),
}));
vi.mock('./gmail-ipc-handlers.js', () => ({
  dispatchGmailIpc: (...args: unknown[]) => testState.dispatch(...args),
  isGmailIpcType: (type: string) => type.startsWith('gmail_'),
}));
vi.mock('./learn-ipc-handler.js', () => ({
  handleLearnLesson: vi.fn(),
  handleRouteLesson: vi.fn(),
  isLearnIpcType: () => false,
  isRouteLessonType: () => false,
}));
vi.mock('./classify-ipc-handlers.js', () => ({
  dispatchClassifyIpc: vi.fn(),
  isClassifyIpcType: () => false,
}));
vi.mock('./classify-backfill.js', () => ({
  handleClassificationLesson: vi.fn(),
  isClassificationLesson: () => false,
}));

import { startIpcWatcher, type IpcDeps } from './ipc.js';
import type { RegisteredGroup } from './types.js';

const registeredGroups: Record<string, RegisteredGroup> = {
  'slack:CHIEF': {
    name: 'Chief',
    folder: 'chief',
    trigger: '@Gru',
    added_at: new Date().toISOString(),
  },
  'slack:MAILMAN': {
    name: 'Mailman',
    folder: 'mailman',
    trigger: '@Gru',
    added_at: new Date().toISOString(),
  },
  'slack:GRADER': {
    name: 'Grader',
    folder: 'grader',
    trigger: '@Gru',
    added_at: new Date().toISOString(),
  },
};

function writeRequest(
  group: string,
  filename: string,
  payload: Record<string, unknown> = {},
): string {
  const dir = path.join(testState.root, 'ipc', group, 'messages');
  fs.mkdirSync(dir, { recursive: true });
  const requestPath = path.join(dir, filename);
  fs.writeFileSync(
    requestPath,
    JSON.stringify({
      type: 'gmail_send',
      groupFolder: 'mailman',
      timestamp: '2026-07-30T00:00:00Z',
      to: 'lead@example.co',
      subject: 'Hello',
      body: 'Body',
      ...payload,
    }),
  );
  return requestPath;
}

describe('Gmail IPC watcher authorization', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
    fs.rmSync(testState.root, { recursive: true, force: true });
  });

  it('quarantines spoofed or unbound sends and dispatches one exact approved action', async () => {
    const actionId = '82c0f1d2-f124-4e3d-b06d-a4e6774f82cd';
    const action = {
      actionId,
      draftTs: 'approved-draft',
      groupFolder: 'sales',
      chatJid: 'slack:CHIEF',
      threadTs: 'approval-thread',
      recipient: 'lead@example.co',
      approvedSubject: 'Hello',
      approvedContentSha256:
        'a36a8a21d506129034793a262046fcd7269160c54242dbf8fc1e61b892ba81a0',
      approvedAt: '2026-08-02T00:00:00.000Z',
      state: 'mailman_started',
    };
    testState.getAction.mockReturnValue(action);
    testState.claim.mockReturnValue({ status: 'claimed', action });
    testState.dispatch.mockImplementation(async (...allArgs: unknown[]) => {
      const [payload, ...args] = allArgs as [
        { actionId?: string },
        ...unknown[],
      ];
      if (payload.actionId) {
        const onConfirmed = args[1] as (
          receipt: Record<string, string>,
        ) => Promise<void>;
        await onConfirmed({
          actionId,
          recipient: 'lead@example.co',
          messageId: 'gmail-message',
          threadId: 'gmail-thread',
        });
      }
    });
    const graderRequest = writeRequest('grader', 'grader-send.json');
    const mailmanRequest = writeRequest('mailman', 'mailman-send.json', {
      source_container: 'nanoclaw-mailman-justin',
    });
    const actionRequest = writeRequest('mailman', 'action-send.json', {
      actionId,
    });
    const approvedReply = writeRequest('mailman', 'approved-reply.json', {
      type: 'gmail_reply',
      threadId: 'approved-thread',
      body: 'Approved reply',
    });
    const deps: IpcDeps = {
      sendMessage: vi.fn(async () => {}),
      registeredGroups: () => registeredGroups,
      registerGroup: vi.fn(),
      syncGroups: vi.fn(async () => {}),
      getAvailableGroups: () => [],
      writeGroupsSnapshot: vi.fn(),
      deliverSourceInput: vi.fn(() => true),
    };

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(fs.existsSync(graderRequest)).toBe(false);
    const quarantineDir = path.join(
      testState.root,
      'ipc',
      'quarantine',
      'grader',
    );
    expect(fs.readdirSync(quarantineDir)).toHaveLength(1);
    expect(fs.readdirSync(quarantineDir)[0]).toContain('grader-send.json');
    const denialDir = path.join(testState.root, 'ipc', 'grader', 'input');
    const denial = JSON.parse(
      fs.readFileSync(
        path.join(denialDir, fs.readdirSync(denialDir)[0]),
        'utf8',
      ),
    );
    expect(denial).toEqual(
      expect.objectContaining({
        type: 'message',
        text: expect.stringContaining('[gmail_send DENIED]'),
      }),
    );

    expect(fs.existsSync(mailmanRequest)).toBe(false);
    expect(fs.existsSync(actionRequest)).toBe(false);
    expect(fs.existsSync(approvedReply)).toBe(false);
    expect(
      fs.readdirSync(path.join(testState.root, 'ipc', 'quarantine', 'mailman')),
    ).toHaveLength(2);
    expect(deps.deliverSourceInput).toHaveBeenCalledWith(
      'mailman',
      'nanoclaw-mailman-justin',
      expect.stringContaining('[gmail_send DENIED]'),
    );
    expect(testState.dispatch).toHaveBeenCalledTimes(1);
    expect(testState.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'gmail_send',
        groupFolder: 'mailman',
        actionId,
        approvedRecipient: 'lead@example.co',
      }),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );
    expect(testState.claim).toHaveBeenCalledWith(
      actionId,
      expect.stringMatching(/^[0-9a-f]{64}$/),
      'lead@example.co',
      expect.any(String),
    );
    expect(testState.confirm).toHaveBeenCalledWith(
      actionId,
      'lead@example.co',
      'gmail-message',
      'gmail-thread',
      expect.any(String),
    );
    expect(deps.sendMessage).toHaveBeenCalledWith(
      'slack:CHIEF',
      expect.stringContaining('[EMAIL ACTION HELD]'),
      expect.objectContaining({ fromGroup: 'chief' }),
    );

    await vi.advanceTimersByTimeAsync(1100);
    expect(testState.dispatch).toHaveBeenCalledTimes(1);

    testState.testRecipient = 'internal-canary@example.co';
    const testRoutedRequest = writeRequest(
      'mailman',
      'test-routed-action.json',
      { actionId },
    );
    await vi.advanceTimersByTimeAsync(1100);
    expect(fs.existsSync(testRoutedRequest)).toBe(false);
    expect(testState.dispatch).toHaveBeenCalledTimes(1);
    expect(testState.fail).toHaveBeenCalledWith(
      actionId,
      'blocked',
      'global_test_routing_active',
      expect.any(String),
    );
    testState.testRecipient = '';
  });
});
