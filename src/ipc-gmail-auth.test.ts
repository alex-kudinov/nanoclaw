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
    getMessage: vi.fn((..._args: unknown[]): unknown => undefined),
    getPendingByThread: vi.fn((..._args: unknown[]): unknown => undefined),
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
  getMessageById: (...args: unknown[]) => testState.getMessage(...args),
  getPendingSendByActionId: (...args: unknown[]) =>
    testState.getAction(...args),
  markEmailActionHandoff: vi.fn(() => 0),
  markPendingSendHandoff: vi.fn(() => 0),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  getTaskById: vi.fn(),
  getPendingSendByGmailThread: (...args: unknown[]) =>
    testState.getPendingByThread(...args),
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
import { hashApprovedEmailContent } from './email-action.js';
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
    const approvedBody = 'Use A & B exactly.';
    const approvedCard = [
      '[SALES REVIEW] Lead #1003',
      'Email: lead@example.co',
      '',
      'DRAFT RESPONSE TO LEAD:',
      '---',
      'Subject: Hello',
      '',
      approvedBody,
      '---',
    ].join('\n');
    const action = {
      actionId,
      draftTs: 'approved-draft',
      groupFolder: 'sales',
      chatJid: 'slack:CHIEF',
      threadTs: 'approval-thread',
      gmailThreadId: 'approved-thread',
      recipient: 'lead@example.co',
      approvedSubject: 'Hello',
      approvedContentSha256: hashApprovedEmailContent('Hello', approvedBody),
      approvedAt: '2026-08-02T00:00:00.000Z',
      state: 'mailman_started',
    };
    testState.getAction.mockReturnValue(action);
    testState.getMessage.mockReturnValue({ content: approvedCard });
    testState.getPendingByThread.mockImplementation((threadId: unknown) =>
      threadId === 'approved-thread'
        ? { action, candidates: [action], ambiguous: false }
        : { candidates: [], ambiguous: false },
    );
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
      type: 'gmail_reply',
      threadId: 'approved-thread',
      body: 'Use A &amp; B exactly.',
      html: true,
      cc: undefined,
    });
    const approvedReply = writeRequest('mailman', 'approved-reply.json', {
      type: 'gmail_reply',
      threadId: 'unapproved-thread',
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
        type: 'gmail_reply',
        groupFolder: 'mailman',
        actionId,
        threadId: 'approved-thread',
        body: approvedBody,
        markdown: true,
        approvedRecipient: 'lead@example.co',
      }),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );
    expect(testState.dispatch.mock.calls[0]?.[0]).not.toHaveProperty('html');
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

    // Lead #1029 production regression: an unthreaded first response reached
    // Mailman without its Action-ID, and Mailman entity-escaped a literal `&`
    // in both subject and body. The exact-hash lookup cannot identify that
    // mutated request, so the unique recipient context must recover the action;
    // the host then executes only the immutable approved card fields.
    testState.findAction.mockImplementation((opts: unknown) =>
      (opts as { approvedContentSha256?: string }).approvedContentSha256
        ? { ambiguous: false }
        : { ambiguous: false, action },
    );
    const unthreadedMutatedSend = writeRequest(
      'mailman',
      'unthreaded-mutated-send.json',
      {
        actionId: undefined,
        threadId: undefined,
        subject: 'Hello &amp;',
        body: 'Use A &amp; B exactly.',
        html: true,
      },
    );
    await vi.advanceTimersByTimeAsync(1100);
    expect(fs.existsSync(unthreadedMutatedSend)).toBe(false);
    expect(testState.dispatch).toHaveBeenCalledTimes(2);
    expect(testState.dispatch.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        type: 'gmail_send',
        actionId,
        to: 'lead@example.co',
        subject: 'Hello',
        body: approvedBody,
        markdown: true,
        approvedRecipient: 'lead@example.co',
      }),
    );
    expect(testState.dispatch.mock.calls[1]?.[0]).not.toHaveProperty('html');

    await vi.advanceTimersByTimeAsync(1100);
    expect(testState.dispatch).toHaveBeenCalledTimes(2);

    // Claude R1 B1 regression: two still-active approvals share one Gmail
    // thread and the model omitted Action-ID. Mutated request bytes identify
    // neither card exactly, so the host must hold instead of selecting the
    // oldest (or newest) approval.
    const newerAction = {
      ...action,
      actionId: '1a6d9d42-c03e-499d-b255-ad0823676355',
      draftTs: 'approved-draft-v2',
      approvedSubject: 'Hello v2',
      approvedContentSha256: hashApprovedEmailContent('Hello v2', 'Body v2'),
      approvedAt: '2026-08-02T00:01:00.000Z',
    };
    testState.getPendingByThread.mockReturnValue({
      action: undefined,
      candidates: [newerAction, action],
      ambiguous: true,
    });
    const ambiguousReply = writeRequest(
      'mailman',
      'ambiguous-thread-reply.json',
      {
        type: 'gmail_reply',
        actionId: undefined,
        threadId: 'approved-thread',
        subject: undefined,
        body: 'Use A &amp; B exactly.',
        source_container: 'nanoclaw-mailman-ambiguous',
      },
    );
    await vi.advanceTimersByTimeAsync(1100);
    expect(fs.existsSync(ambiguousReply)).toBe(false);
    expect(testState.dispatch).toHaveBeenCalledTimes(2);
    expect(deps.deliverSourceInput).toHaveBeenCalledWith(
      'mailman',
      'nanoclaw-mailman-ambiguous',
      expect.stringContaining('multiple approved email actions'),
    );

    testState.claim.mockReturnValue({
      status: 'held',
      action,
      reason: 'subject/body hash does not match the approved action',
    });
    const deterministicHold = writeRequest(
      'mailman',
      'deterministic-hold.json',
      { actionId },
    );
    await vi.advanceTimersByTimeAsync(1100);
    expect(fs.existsSync(deterministicHold)).toBe(false);
    expect(testState.dispatch).toHaveBeenCalledTimes(2);
    expect(deps.sendMessage).toHaveBeenCalledWith(
      'slack:CHIEF',
      expect.stringContaining('Gmail was not called'),
      expect.objectContaining({
        fromGroup: 'sales',
        threadTs: 'approval-thread',
      }),
    );

    testState.testRecipient = 'internal-canary@example.co';
    const testRoutedRequest = writeRequest(
      'mailman',
      'test-routed-action.json',
      { actionId },
    );
    await vi.advanceTimersByTimeAsync(1100);
    expect(fs.existsSync(testRoutedRequest)).toBe(false);
    expect(testState.dispatch).toHaveBeenCalledTimes(2);
    expect(testState.fail).toHaveBeenCalledWith(
      actionId,
      'blocked',
      'global_test_routing_active',
      expect.any(String),
    );
    testState.testRecipient = '';
  });
});
