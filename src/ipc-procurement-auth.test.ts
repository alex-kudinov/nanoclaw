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
      pathModule.join(osModule.tmpdir(), 'nanoclaw-procurement-auth-'),
    ),
    dispatch: vi.fn(async (..._args: unknown[]) => {}),
    graderDispatch: vi.fn(async (..._args: unknown[]) => ({
      status: 'complete',
      receipt: {
        idempotencyKey: 'heartbeat:test:m2p2:1',
        messageTs: '1785685710.379679',
      },
    })),
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
  markPendingSendHandoff: vi.fn(() => 0),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  getTaskById: vi.fn(),
  getPendingSendByGmailThread: vi.fn(),
  storeMessageDirect: vi.fn(),
  updateTask: vi.fn(),
}));
vi.mock('./send-watchdog.js', () => ({
  observeConfirmedSend: vi.fn(),
  observeOutbound: vi.fn(),
}));
vi.mock('./gmail-ipc-handlers.js', () => ({
  dispatchGmailIpc: vi.fn(),
  isGmailIpcType: () => false,
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
vi.mock('./procurement-ipc-handlers.js', () => ({
  dispatchProcurementIpc: (...args: unknown[]) => testState.dispatch(...args),
  isProcurementIpcType: (type: string) => type.startsWith('procurement_'),
}));
vi.mock('./grader-file-message.js', () => ({
  dispatchGraderFileMessage: (...args: unknown[]) =>
    testState.graderDispatch(...args),
  isGraderFileMessageType: (type: string) => type === 'slack_file_message',
}));

import { startIpcWatcher, type IpcDeps } from './ipc.js';
import type { RegisteredGroup } from './types.js';

const registeredGroups: Record<string, RegisteredGroup> = {
  'slack:PROCUREMENT': {
    name: 'Procurement',
    folder: 'procurement',
    trigger: '@Gru',
    added_at: new Date().toISOString(),
  },
  'slack:SALES': {
    name: 'Sales',
    folder: 'sales',
    trigger: '@Gru',
    added_at: new Date().toISOString(),
  },
  'slack:MAIN': {
    name: 'Main',
    folder: 'main',
    trigger: '@Gru',
    added_at: new Date().toISOString(),
    isMain: true,
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
  claimedGroup: string,
): string {
  const dir = path.join(testState.root, 'ipc', group, 'messages');
  fs.mkdirSync(dir, { recursive: true });
  const requestPath = path.join(dir, filename);
  fs.writeFileSync(
    requestPath,
    JSON.stringify({
      type: 'procurement_queue',
      groupFolder: claimedGroup,
      limit: 5,
      timestamp: '2026-07-30T00:00:00Z',
    }),
  );
  return requestPath;
}

function writeGraderRequest(group: string, filename: string): string {
  const dir = path.join(testState.root, 'ipc', group, 'messages');
  fs.mkdirSync(dir, { recursive: true });
  const requestPath = path.join(dir, filename);
  fs.writeFileSync(
    requestPath,
    JSON.stringify({
      type: 'slack_file_message',
      text: 'Grade Test - Module 2 Part 2',
      staged_path: 'attachments/work/submission.txt',
      filename: 'submission.txt',
      size: 10,
      sha256: 'a'.repeat(64),
      idempotency_key: 'heartbeat:test:m2p2:1',
      targetGroupFolder: 'grader',
    }),
  );
  return requestPath;
}

describe('Procurement IPC watcher authorization', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
    fs.rmSync(testState.root, { recursive: true, force: true });
  });

  it('derives identity from the IPC directory and quarantines spoofed callers', async () => {
    const denied = writeRequest(
      'sales',
      'sales-procurement.json',
      'procurement',
    );
    const allowed = writeRequest(
      'procurement',
      'procurement-queue.json',
      'sales',
    );
    const deps: IpcDeps = {
      sendMessage: vi.fn(async () => {}),
      registeredGroups: () => registeredGroups,
      registerGroup: vi.fn(),
      syncGroups: vi.fn(async () => {}),
      getAvailableGroups: () => [],
      writeGroupsSnapshot: vi.fn(),
      postProcurementReviewCard: vi.fn(),
      postProcurementReviewThread: vi.fn(),
      postGraderFileMessage: vi.fn(),
    };

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(fs.existsSync(denied)).toBe(false);
    expect(fs.existsSync(allowed)).toBe(false);
    const quarantineDir = path.join(
      testState.root,
      'ipc',
      'quarantine',
      'sales',
    );
    expect(fs.readdirSync(quarantineDir)).toHaveLength(1);
    expect(testState.dispatch).toHaveBeenCalledTimes(1);
    expect(testState.dispatch).toHaveBeenCalledWith(
      'procurement',
      expect.objectContaining({
        type: 'procurement_queue',
        groupFolder: 'sales',
      }),
      expect.objectContaining({
        postReviewCard: deps.postProcurementReviewCard,
        postReviewThread: deps.postProcurementReviewThread,
      }),
    );
  });

  it('allows only the registered main group to invoke fixed grader delivery', async () => {
    const denied = writeGraderRequest('sales', 'sales-grader-file.json');
    const allowed = writeGraderRequest('main', 'main-grader-file.json');
    await vi.advanceTimersByTimeAsync(1_100);

    expect(fs.existsSync(denied)).toBe(false);
    expect(fs.existsSync(allowed)).toBe(false);
    expect(
      fs
        .readdirSync(path.join(testState.root, 'ipc', 'quarantine', 'sales'))
        .some((name) => name.includes('grader-file')),
    ).toBe(true);
    expect(testState.graderDispatch).toHaveBeenCalledTimes(1);
    expect(testState.graderDispatch).toHaveBeenCalledWith(
      'main',
      expect.objectContaining({ type: 'slack_file_message' }),
      expect.objectContaining({
        dataDir: testState.root,
        targetJid: 'slack:GRADER',
      }),
    );
  });
});
