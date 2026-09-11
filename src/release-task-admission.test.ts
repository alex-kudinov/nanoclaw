import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createTaskAdmissionBarrier,
  isReleaseTaskAdmissionPaused,
  releaseTaskAdmissionBarrier,
  taskAdmissionBarrierHealth,
  taskAdmissionBarrierPath,
} from './release-task-admission.js';

const roots: string[] = [];

function root(): string {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoclaw-admission-'));
  roots.push(value);
  return value;
}

afterEach(() => {
  for (const value of roots.splice(0))
    fs.rmSync(value, { recursive: true, force: true });
});

describe('release task-admission barrier', () => {
  it('claims durably, pauses admission, and releases only for its owner', () => {
    const workingDirectory = root();
    const expectedCurrentCommit = 'a'.repeat(40);
    const barrierPath = createTaskAdmissionBarrier({
      workingDirectory,
      ownerToken: 'owner-one',
      expectedCurrentCommit,
      createdAt: '2026-09-11T01:00:00.000Z',
    });

    expect(barrierPath).toBe(taskAdmissionBarrierPath(workingDirectory));
    expect(fs.statSync(barrierPath).mode & 0o777).toBe(0o600);
    expect(taskAdmissionBarrierHealth(workingDirectory)).toEqual({
      taskAdmissionPaused: true,
      valid: true,
      expectedCurrentCommit,
      createdAt: '2026-09-11T01:00:00.000Z',
    });
    expect(isReleaseTaskAdmissionPaused(workingDirectory)).toBe(true);
    expect(() =>
      releaseTaskAdmissionBarrier({
        workingDirectory,
        ownerToken: 'owner-two',
      }),
    ).toThrow(/foreign task-admission barrier/);
    expect(fs.existsSync(barrierPath)).toBe(true);

    releaseTaskAdmissionBarrier({ workingDirectory, ownerToken: 'owner-one' });
    expect(isReleaseTaskAdmissionPaused(workingDirectory)).toBe(false);
  });

  it('refuses a second owner and treats malformed state as paused', () => {
    const workingDirectory = root();
    createTaskAdmissionBarrier({
      workingDirectory,
      ownerToken: 'owner-one',
      expectedCurrentCommit: 'a'.repeat(40),
    });
    expect(() =>
      createTaskAdmissionBarrier({
        workingDirectory,
        ownerToken: 'owner-two',
        expectedCurrentCommit: 'a'.repeat(40),
      }),
    ).toThrow(/barrier claim failed/);

    fs.writeFileSync(taskAdmissionBarrierPath(workingDirectory), '{broken');
    expect(taskAdmissionBarrierHealth(workingDirectory)).toMatchObject({
      taskAdmissionPaused: true,
      valid: false,
    });
  });
});
