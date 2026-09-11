import fs from 'fs';
import path from 'path';

export const RELEASE_TASK_ADMISSION_RELATIVE_PATH = path.join(
  'data',
  'runtime',
  'release-task-admission.json',
);

interface BarrierRecord {
  schemaVersion: 1;
  ownerToken: string;
  expectedCurrentCommit: string;
  createdAt: string;
}

export interface TaskAdmissionBarrierHealth {
  taskAdmissionPaused: boolean;
  valid: boolean;
  expectedCurrentCommit: string | null;
  createdAt: string | null;
}

export function taskAdmissionBarrierPath(workingDirectory: string): string {
  if (!path.isAbsolute(workingDirectory)) {
    throw new Error('task-admission working directory must be absolute');
  }
  return path.join(workingDirectory, RELEASE_TASK_ADMISSION_RELATIVE_PATH);
}

function parseRecord(value: unknown): BarrierRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== 1 ||
    typeof record.ownerToken !== 'string' ||
    !record.ownerToken ||
    typeof record.expectedCurrentCommit !== 'string' ||
    !/^[0-9a-f]{40}$/i.test(record.expectedCurrentCommit) ||
    typeof record.createdAt !== 'string' ||
    Number.isNaN(Date.parse(record.createdAt))
  ) {
    return null;
  }
  return record as unknown as BarrierRecord;
}

function readRecord(barrierPath: string): BarrierRecord | null {
  return parseRecord(JSON.parse(fs.readFileSync(barrierPath, 'utf8')));
}

export function taskAdmissionBarrierHealth(
  workingDirectory = process.cwd(),
): TaskAdmissionBarrierHealth {
  const barrierPath = taskAdmissionBarrierPath(workingDirectory);
  if (!fs.existsSync(barrierPath)) {
    return {
      taskAdmissionPaused: false,
      valid: true,
      expectedCurrentCommit: null,
      createdAt: null,
    };
  }
  try {
    const record = readRecord(barrierPath);
    return record
      ? {
          taskAdmissionPaused: true,
          valid: true,
          expectedCurrentCommit: record.expectedCurrentCommit,
          createdAt: record.createdAt,
        }
      : {
          taskAdmissionPaused: true,
          valid: false,
          expectedCurrentCommit: null,
          createdAt: null,
        };
  } catch {
    // Presence always pauses admission. A malformed or unreadable barrier is
    // never interpreted as permission to start new task work.
    return {
      taskAdmissionPaused: true,
      valid: false,
      expectedCurrentCommit: null,
      createdAt: null,
    };
  }
}

export function isReleaseTaskAdmissionPaused(
  workingDirectory = process.cwd(),
): boolean {
  return taskAdmissionBarrierHealth(workingDirectory).taskAdmissionPaused;
}

export function createTaskAdmissionBarrier(input: {
  workingDirectory: string;
  ownerToken: string;
  expectedCurrentCommit: string;
  createdAt?: string;
}): string {
  if (!input.ownerToken)
    throw new Error('task-admission owner token is required');
  if (!/^[0-9a-f]{40}$/i.test(input.expectedCurrentCommit)) {
    throw new Error('task-admission expected commit must be a full Git commit');
  }
  const barrierPath = taskAdmissionBarrierPath(input.workingDirectory);
  const directory = path.dirname(barrierPath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const record: BarrierRecord = {
    schemaVersion: 1,
    ownerToken: input.ownerToken,
    expectedCurrentCommit: input.expectedCurrentCommit,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  let fd: number | null = null;
  try {
    fd = fs.openSync(barrierPath, 'wx', 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(record)}\n`);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    const directoryFd = fs.openSync(directory, 'r');
    try {
      fs.fsyncSync(directoryFd);
    } finally {
      fs.closeSync(directoryFd);
    }
  } catch (error) {
    if (fd !== null) fs.closeSync(fd);
    throw new Error(`task-admission barrier claim failed: ${barrierPath}`, {
      cause: error,
    });
  }
  return barrierPath;
}

export function releaseTaskAdmissionBarrier(input: {
  workingDirectory: string;
  ownerToken: string;
}): void {
  const barrierPath = taskAdmissionBarrierPath(input.workingDirectory);
  let record: BarrierRecord | null;
  try {
    record = readRecord(barrierPath);
  } catch (error) {
    throw new Error(`task-admission barrier is unreadable: ${barrierPath}`, {
      cause: error,
    });
  }
  if (!record || record.ownerToken !== input.ownerToken) {
    throw new Error(
      `refusing to release a foreign task-admission barrier: ${barrierPath}`,
    );
  }
  fs.unlinkSync(barrierPath);
  const directoryFd = fs.openSync(path.dirname(barrierPath), 'r');
  try {
    fs.fsyncSync(directoryFd);
  } finally {
    fs.closeSync(directoryFd);
  }
}
