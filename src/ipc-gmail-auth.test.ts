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
  };
});

vi.mock('./config.js', () => ({
  DATA_DIR: testState.root,
  IPC_POLL_INTERVAL: 1000,
  TIMEZONE: 'America/Chicago',
}));
vi.mock('./logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('./db.js', () => ({
  clearPendingSendsByRecipient: vi.fn(() => 0),
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

  it('quarantines with a denial response, ignores spoofed identity, and restores an approved reply', async () => {
    const graderRequest = writeRequest('grader', 'grader-send.json');
    const mailmanRequest = writeRequest('mailman', 'mailman-send.json');
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
    expect(fs.existsSync(approvedReply)).toBe(false);
    expect(testState.dispatch).toHaveBeenCalledTimes(2);
    expect(testState.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'gmail_send',
        groupFolder: 'mailman',
      }),
      expect.any(Function),
      expect.any(Function),
    );
    expect(testState.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'gmail_reply',
        groupFolder: 'mailman',
        threadId: 'approved-thread',
        approvedRecipient: 'approved@example.co',
      }),
      expect.any(Function),
      expect.any(Function),
    );

    await vi.advanceTimersByTimeAsync(1100);
    expect(testState.dispatch).toHaveBeenCalledTimes(2);
  });
});
