/**
 * The IPC half of the grader output boundary.
 *
 * The discriminator is source-AND-destination, never the author tag alone. This
 * file pins the three cases that discriminator exists to separate: grader output
 * into its own channel (gated), the grader→certifier certificate handoff
 * (untouched), and cross-group input addressed to the grader (untouched).
 */
import fs from 'fs';
import path from 'path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { tmpRoot } = vi.hoisted(() => {
  const o = require('os') as typeof import('os');
  const f = require('fs') as typeof import('fs');
  const p = require('path') as typeof import('path');
  return {
    tmpRoot: f.mkdtempSync(p.join(o.tmpdir(), 'nanoclaw-ipc-grader-')),
  };
});

vi.mock('./config.js', () => ({
  DATA_DIR: tmpRoot,
  IPC_POLL_INTERVAL: 1000,
  TIMEZONE: 'America/Los_Angeles',
}));
vi.mock('./logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('./db.js', () => ({
  storeMessageDirect: vi.fn(),
  clearPendingSendsByRecipient: vi.fn(() => 0),
  markPendingSendHandoff: vi.fn(() => 0),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  getTaskById: vi.fn(),
  updateTask: vi.fn(),
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

import type { IpcDeps } from './ipc.js';
import type { RegisteredGroup } from './types.js';

function group(name: string, folder: string): RegisteredGroup {
  return {
    name,
    folder,
    trigger: '@Gru',
    added_at: '2026-08-09T00:00:00.000Z',
  };
}

const GRADER_JID = 'slack:GRADER';
const CERTIFIER_JID = 'slack:CERTIFIER';
const CHIEF_JID = 'slack:CHIEF';

const registeredGroups: Record<string, RegisteredGroup> = {
  [GRADER_JID]: group('Grader', 'grader'),
  [CERTIFIER_JID]: group('Certifier', 'certifier'),
  [CHIEF_JID]: group('Chief', 'chief'),
};

function writeIpcMessage(
  sourceGroup: string,
  payload: Record<string, unknown>,
): void {
  const dir = path.join(tmpRoot, 'ipc', sourceGroup, 'messages');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(
      dir,
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
    ),
    JSON.stringify({ type: 'message', ...payload }),
  );
}

function errorFiles(): string[] {
  const dir = path.join(tmpRoot, 'ipc', 'errors');
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
}

describe('IPC grader output boundary', () => {
  let sendMessage: ReturnType<typeof vi.fn>;
  let deliverGraderOutput: ReturnType<typeof vi.fn>;
  let deps: IpcDeps;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    process.env.MAILMAN_HOLD_SECONDS = '0';
    sendMessage = vi.fn(async () => {});
    deliverGraderOutput = vi.fn(async () => ({
      outcome: 'delivered' as const,
      kind: 'student' as const,
      ts: 'ts-1',
      violations: [],
      noticePosted: false,
    }));
    deps = {
      sendMessage,
      deliverGraderOutput,
      registeredGroups: () => registeredGroups,
      registerGroup: vi.fn(),
      syncGroups: vi.fn(async () => {}),
      getAvailableGroups: () => [],
      writeGroupsSnapshot: vi.fn(),
    } as unknown as IpcDeps;
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(path.join(tmpRoot, 'ipc'), { recursive: true, force: true });
  });

  it('routes grader output to its own channel through the boundary, not sendMessage', async () => {
    const { startIpcWatcher } = await import('./ipc.js');
    writeIpcMessage('grader', {
      chatJid: GRADER_JID,
      text: 'PASS\nYour example names the observed behavior.',
      thread_ts: 'thr-1',
    });

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(deliverGraderOutput).toHaveBeenCalledWith({
      jid: GRADER_JID,
      threadTs: 'thr-1',
      text: 'PASS\nYour example names the observed behavior.',
      source: 'ipc',
    });
    // The ungated path must not also run.
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('leaves the grader→certifier certificate handoff untouched', async () => {
    const { startIpcWatcher } = await import('./ipc.js');
    const text = '[HANDOFF: grader→certifier] Student passed Foundation.';
    writeIpcMessage('grader', { chatJid: GRADER_JID, text });

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    // Author is the grader, destination is the certifier's channel: neither a
    // verdict line nor operator-marked, so an author-keyed gate would have
    // blocked it and dropped a block notice in the wrong channel.
    expect(sendMessage).toHaveBeenCalledWith(
      CERTIFIER_JID,
      text,
      expect.objectContaining({ fromGroup: 'grader' }),
    );
    expect(deliverGraderOutput).not.toHaveBeenCalled();
  });

  it('leaves cross-group input addressed to the grader untouched', async () => {
    const { startIpcWatcher } = await import('./ipc.js');
    writeIpcMessage('chief', {
      chatJid: GRADER_JID,
      text: 'New submission for grading.',
      thread_ts: 'thr-2',
    });

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(sendMessage).toHaveBeenCalledWith(
      GRADER_JID,
      'New submission for grading.',
      expect.objectContaining({ fromGroup: 'chief' }),
    );
    expect(deliverGraderOutput).not.toHaveBeenCalled();
  });

  it('leaves every non-grader message on the existing send path', async () => {
    const { startIpcWatcher } = await import('./ipc.js');
    writeIpcMessage('chief', {
      chatJid: CERTIFIER_JID,
      text: 'Routine cross-group note.',
    });

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(sendMessage).toHaveBeenCalledWith(
      CERTIFIER_JID,
      'Routine cross-group note.',
      expect.objectContaining({ fromGroup: 'chief' }),
    );
    expect(deliverGraderOutput).not.toHaveBeenCalled();
  });

  it('fails closed and quarantines when the boundary is unavailable', async () => {
    const { startIpcWatcher } = await import('./ipc.js');
    const withoutBoundary = { ...deps } as IpcDeps;
    delete (withoutBoundary as { deliverGraderOutput?: unknown })
      .deliverGraderOutput;
    writeIpcMessage('grader', {
      chatJid: GRADER_JID,
      text: 'PASS\nUngated bytes must not reach Slack.',
      thread_ts: 'thr-3',
    });

    startIpcWatcher(withoutBoundary);
    await vi.advanceTimersByTimeAsync(50);

    expect(sendMessage).not.toHaveBeenCalled();
    expect(errorFiles()).toHaveLength(1);
  });

  it('quarantines without retry when a strict send rejects', async () => {
    const { startIpcWatcher } = await import('./ipc.js');
    deliverGraderOutput.mockRejectedValue(
      new Error('Slack is disconnected; grader message was not queued'),
    );
    writeIpcMessage('grader', {
      chatJid: GRADER_JID,
      text: 'PASS\nfeedback',
      thread_ts: 'thr-4',
    });

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(errorFiles()).toHaveLength(1);
    // At-most-once: one attempt, and the file is not left for a second pass.
    expect(deliverGraderOutput).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(deliverGraderOutput).toHaveBeenCalledTimes(1);
  });

  it('consumes the IPC file after a blocked message so nothing loops', async () => {
    const { startIpcWatcher } = await import('./ipc.js');
    deliverGraderOutput.mockResolvedValue({
      outcome: 'blocked',
      kind: 'student',
      ts: 'ts-notice',
      violations: ['em-dash'],
      noticePosted: true,
    });
    writeIpcMessage('grader', {
      chatJid: GRADER_JID,
      text: 'PASS\nYour example is specific — and well supported.',
      thread_ts: 'thr-5',
    });

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(2000);

    expect(deliverGraderOutput).toHaveBeenCalledTimes(1);
    expect(errorFiles()).toHaveLength(0);
    expect(
      fs.readdirSync(path.join(tmpRoot, 'ipc', 'grader', 'messages')),
    ).toHaveLength(0);
  });

  it('hands the boundary the run context the host recorded for this thread', async () => {
    const { setGraderRunContext, _resetGraderRunContexts } =
      await import('./grader-run-context.js');
    _resetGraderRunContexts();
    const runId = '8f49f42f-105f-4b14-8e68-1846f9a7271b';
    setGraderRunContext(runId, GRADER_JID, 'thr-ctx', {
      studentName: 'Ada Lovelace',
      code: 'eval-m4',
      title: 'Module 4 Part 2: Session Analysis of Recording A',
      mode: 'snapshot-only',
      registeredAtMs: Date.now(),
    });
    const { startIpcWatcher } = await import('./ipc.js');
    writeIpcMessage('grader', {
      chatJid: GRADER_JID,
      text: 'PASS\n\nYour reading of the recording is specific.',
      thread_ts: 'thr-ctx',
      run_id: runId,
    });

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(deliverGraderOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionContext: expect.objectContaining({
          studentName: 'Ada Lovelace',
        }),
      }),
    );
    _resetGraderRunContexts();
  });

  it('sends no context for a thread the host never recorded, which is the post-restart case', async () => {
    const { _resetGraderRunContexts } = await import('./grader-run-context.js');
    _resetGraderRunContexts();
    const { startIpcWatcher } = await import('./ipc.js');
    writeIpcMessage('grader', {
      chatJid: GRADER_JID,
      text: 'PASS\n\nYour reading of the recording is specific.',
      thread_ts: 'thr-adopted',
      run_id: 'f9285a23-73d3-4c67-8379-35a3906ca0c0',
    });

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(deliverGraderOutput).toHaveBeenCalledWith(
      expect.objectContaining({ submissionContext: undefined }),
    );
  });

  it('does not borrow a resolved later run when an earlier run id had no context', async () => {
    const { setGraderRunContext, _resetGraderRunContexts } =
      await import('./grader-run-context.js');
    _resetGraderRunContexts();
    setGraderRunContext('run-b', GRADER_JID, 'thr-overlap', {
      studentName: 'Resolved Student',
      code: 'eval-m4',
      title: 'Module 4 Part 2',
      mode: 'snapshot-only',
      registeredAtMs: Date.now(),
    });
    const { startIpcWatcher } = await import('./ipc.js');
    writeIpcMessage('grader', {
      chatJid: GRADER_JID,
      text: 'PASS\n\nThis belongs to unavailable run A.',
      thread_ts: 'thr-overlap',
      run_id: 'run-a',
    });

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(deliverGraderOutput).toHaveBeenCalledWith(
      expect.objectContaining({ submissionContext: undefined }),
    );
    _resetGraderRunContexts();
  });

  it('rejects a run id replayed into a different thread', async () => {
    const { setGraderRunContext, _resetGraderRunContexts } =
      await import('./grader-run-context.js');
    _resetGraderRunContexts();
    setGraderRunContext('run-a', GRADER_JID, 'thr-original', {
      studentName: 'Original Student',
      code: 'eval-m4',
      title: 'Module 4 Part 2',
      mode: 'snapshot-only',
      registeredAtMs: Date.now(),
    });
    const { startIpcWatcher } = await import('./ipc.js');
    writeIpcMessage('grader', {
      chatJid: GRADER_JID,
      text: 'PASS\n\nReplayed into another thread.',
      thread_ts: 'thr-other',
      run_id: 'run-a',
    });

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(deliverGraderOutput).toHaveBeenCalledWith(
      expect.objectContaining({ submissionContext: undefined }),
    );
    _resetGraderRunContexts();
  });

  it('routes grader output addressed by targetGroupFolder as well as by jid', async () => {
    const { startIpcWatcher } = await import('./ipc.js');
    writeIpcMessage('grader', {
      chatJid: 'slack:UNUSED',
      targetGroupFolder: 'grader',
      text: 'OPERATOR ONLY - DO NOT COPY TO HEARTBEAT\nRecord saved.',
      thread_ts: 'thr-6',
    });

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(deliverGraderOutput).toHaveBeenCalledWith(
      expect.objectContaining({ jid: GRADER_JID, source: 'ipc' }),
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('returns a denial to the caller when host-side grader-file validation rejects', async () => {
    const { startIpcWatcher } = await import('./ipc.js');
    deps.postGraderFileMessage = vi.fn();
    writeIpcMessage('chief', {
      type: 'slack_file_message',
      chatJid: CHIEF_JID,
      targetGroupFolder: 'grader',
      text: 'Ada Lovelace\nModule 2 Part 2\nextra line',
      idempotency_key: 'submission-123',
    });

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(errorFiles()).toHaveLength(1);
    expect(deps.postGraderFileMessage).not.toHaveBeenCalled();
    const inputDir = path.join(tmpRoot, 'ipc', 'chief', 'input');
    const denial = JSON.parse(
      fs.readFileSync(
        path.join(inputDir, fs.readdirSync(inputDir)[0]),
        'utf-8',
      ),
    ) as { text: string };
    expect(denial.text).toContain('[GRADER FILE DENIED]');
    expect(denial.text).toContain('exactly two nonblank lines');
  });
});
