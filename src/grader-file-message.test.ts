import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  dispatchGraderFileMessage,
  type GraderFileMessagePayload,
} from './grader-file-message.js';

const roots: string[] = [];

function fixture(content = 'student submission') {
  const dataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'nanoclaw-grader-file-'),
  );
  roots.push(dataDir);
  const attachmentDir = path.join(
    dataDir,
    'ipc',
    'main',
    'attachments',
    'work-1',
  );
  fs.mkdirSync(attachmentDir, { recursive: true });
  const filePath = path.join(attachmentDir, 'submission.txt');
  fs.writeFileSync(filePath, content);
  const payload: GraderFileMessagePayload = {
    type: 'slack_file_message',
    text: 'Grade Ada Lovelace - Module 2 Part 2',
    staged_path: path.relative(path.join(dataDir, 'ipc', 'main'), filePath),
    filename: 'submission.txt',
    size: Buffer.byteLength(content),
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    idempotency_key: 'heartbeat:ada:m2p2:attempt-1',
    targetGroupFolder: 'grader',
  };
  return { dataDir, filePath, payload };
}

afterEach(() => {
  vi.restoreAllMocks();
  while (roots.length) {
    fs.rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('grader file message dispatch', () => {
  it('verifies the staged file, writes a receipt, and sends exactly once', async () => {
    const { dataDir, filePath, payload } = fixture();
    const post = vi.fn(async () => ({
      messageTs: '1785685710.379679',
      fileIds: ['F123'],
    }));

    const first = await dispatchGraderFileMessage('main', payload, {
      dataDir,
      targetJid: 'slack:GRADER',
      postGraderFileMessage: post,
    });
    const duplicate = await dispatchGraderFileMessage('main', payload, {
      dataDir,
      targetJid: 'slack:GRADER',
      postGraderFileMessage: post,
    });

    expect(first.status).toBe('complete');
    expect(first.receipt.messageTs).toBe('1785685710.379679');
    expect(duplicate.status).toBe('duplicate_complete');
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      'slack:GRADER',
      payload.text,
      Buffer.from('student submission'),
      'submission.txt',
      'main',
    );
  });

  it('holds an uncertain failed delivery instead of retrying it', async () => {
    const { dataDir, payload } = fixture();
    const post = vi.fn(async () => {
      throw new Error('Slack upload outcome unknown');
    });

    await expect(
      dispatchGraderFileMessage('main', payload, {
        dataDir,
        targetJid: 'slack:GRADER',
        postGraderFileMessage: post,
      }),
    ).rejects.toThrow('Slack upload outcome unknown');

    const second = await dispatchGraderFileMessage('main', payload, {
      dataDir,
      targetJid: 'slack:GRADER',
      postGraderFileMessage: post,
    });
    expect(second.status).toBe('pending');
    expect(second.receipt.lastError).toBe('Slack upload outcome unknown');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('rejects tampered content before any external action', async () => {
    const { dataDir, filePath, payload } = fixture();
    fs.writeFileSync(filePath, 'tampered submission');
    payload.size = fs.statSync(filePath).size;
    const post = vi.fn();

    await expect(
      dispatchGraderFileMessage('main', payload, {
        dataDir,
        targetJid: 'slack:GRADER',
        postGraderFileMessage: post,
      }),
    ).rejects.toThrow('sha256 does not match');
    expect(post).not.toHaveBeenCalled();
  });

  it('rejects staged paths outside the source attachment root', async () => {
    const { dataDir, payload } = fixture();
    payload.staged_path = '../main/messages/request.json';

    await expect(
      dispatchGraderFileMessage('main', payload, {
        dataDir,
        targetJid: 'slack:GRADER',
        postGraderFileMessage: vi.fn(),
      }),
    ).rejects.toThrow('relative and contained');
  });
});
