import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock child_process — store the mock fn so tests can configure it
const mockExecSync = vi.fn();
vi.mock('child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

import {
  CONTAINER_RUNTIME_BIN,
  readonlyMountArgs,
  stopContainer,
  rmContainer,
  ensureContainerRuntimeRunning,
  cleanupOrphans,
} from './container-runtime.js';
import { logger } from './logger.js';

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Pure functions ---

describe('readonlyMountArgs', () => {
  it('returns --mount flag for a real directory source', () => {
    const dir = process.cwd(); // a real directory
    const args = readonlyMountArgs(dir, '/container/path');
    expect(args).toEqual([
      '--mount',
      `type=bind,source=${dir},target=/container/path,readonly`,
    ]);
  });

  it('returns -v flag for a file/device source (e.g. /dev/null shadow)', () => {
    // --mount type=bind rejects non-directory sources on Apple Container;
    // /dev/null (used to shadow .env) must mount via -v or the container fails.
    expect(readonlyMountArgs('/dev/null', '/workspace/project/.env')).toEqual([
      '-v',
      '/dev/null:/workspace/project/.env:ro',
    ]);
  });

  it('returns -v flag for a non-existent source', () => {
    expect(readonlyMountArgs('/no/such/path', '/c')).toEqual([
      '-v',
      '/no/such/path:/c:ro',
    ]);
  });

  it('returns -v flag for paths with commas', () => {
    const args = readonlyMountArgs(
      '/Users/x/Library/CloudStorage/OneDrive-SoleraHoldings,Inc/Drop',
      '/workspace/extra/drop',
    );
    expect(args).toEqual([
      '-v',
      '/Users/x/Library/CloudStorage/OneDrive-SoleraHoldings,Inc/Drop:/workspace/extra/drop:ro',
    ]);
  });
});

describe('stopContainer', () => {
  it('returns stop command using CONTAINER_RUNTIME_BIN', () => {
    expect(stopContainer('nanoclaw-test-123')).toBe(
      `${CONTAINER_RUNTIME_BIN} stop nanoclaw-test-123`,
    );
  });
});

describe('rmContainer', () => {
  it('returns rm command using CONTAINER_RUNTIME_BIN', () => {
    expect(rmContainer('nanoclaw-test-123')).toBe(
      `${CONTAINER_RUNTIME_BIN} rm nanoclaw-test-123`,
    );
  });
});

// --- ensureContainerRuntimeRunning ---

describe('ensureContainerRuntimeRunning', () => {
  it('does nothing when runtime is already running', () => {
    mockExecSync.mockReturnValueOnce('');

    ensureContainerRuntimeRunning();

    expect(mockExecSync).toHaveBeenCalledTimes(1);
    expect(mockExecSync).toHaveBeenCalledWith(
      `${CONTAINER_RUNTIME_BIN} system status`,
      { stdio: 'pipe', timeout: 10000 },
    );
    expect(logger.debug).toHaveBeenCalledWith(
      'Container runtime already running',
    );
  });

  it('auto-starts when system status fails', () => {
    // First call (system status) fails
    mockExecSync.mockImplementationOnce(() => {
      throw new Error('not running');
    });
    // Second call (system start) succeeds
    mockExecSync.mockReturnValueOnce('');

    ensureContainerRuntimeRunning();

    expect(mockExecSync).toHaveBeenCalledTimes(2);
    expect(mockExecSync).toHaveBeenNthCalledWith(
      2,
      `${CONTAINER_RUNTIME_BIN} system start`,
      { stdio: 'pipe', timeout: 30000 },
    );
    expect(logger.info).toHaveBeenCalledWith('Container runtime started');
  });

  it('throws when both status and start fail', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('failed');
    });

    expect(() => ensureContainerRuntimeRunning()).toThrow(
      'Container runtime is required but failed to start',
    );
    expect(logger.error).toHaveBeenCalled();
  });
});

// --- cleanupOrphans ---

describe('cleanupOrphans', () => {
  it('stops running and removes stopped nanoclaw containers', () => {
    const lsOutput = JSON.stringify([
      { status: 'running', configuration: { id: 'nanoclaw-group1-111' } },
      { status: 'stopped', configuration: { id: 'nanoclaw-group2-222' } },
      { status: 'running', configuration: { id: 'nanoclaw-group3-333' } },
      { status: 'running', configuration: { id: 'other-container' } },
    ]);
    mockExecSync.mockReturnValueOnce(lsOutput);
    mockExecSync.mockReturnValue('');

    cleanupOrphans();

    // ls + 2 stop (running) + 1 rm (stopped)
    expect(mockExecSync).toHaveBeenCalledTimes(4);
    expect(mockExecSync).toHaveBeenNthCalledWith(
      2,
      `${CONTAINER_RUNTIME_BIN} stop nanoclaw-group1-111`,
      { stdio: 'pipe', timeout: 10000 },
    );
    expect(mockExecSync).toHaveBeenNthCalledWith(
      3,
      `${CONTAINER_RUNTIME_BIN} stop nanoclaw-group3-333`,
      { stdio: 'pipe', timeout: 10000 },
    );
    expect(mockExecSync).toHaveBeenNthCalledWith(
      4,
      `${CONTAINER_RUNTIME_BIN} rm nanoclaw-group2-222`,
      { stdio: 'pipe', timeout: 10000 },
    );
    expect(logger.info).toHaveBeenCalledWith(
      { running: 2, stopped: 1 },
      'Cleaned up orphaned containers',
    );
  });

  it('does nothing when no orphans exist', () => {
    mockExecSync.mockReturnValueOnce('[]');

    cleanupOrphans();

    expect(mockExecSync).toHaveBeenCalledTimes(1);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('warns and continues when ls fails', () => {
    mockExecSync.mockImplementationOnce(() => {
      throw new Error('container not available');
    });

    cleanupOrphans(); // should not throw

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Failed to clean up orphaned containers',
    );
  });

  it('continues stopping remaining containers when one stop fails', () => {
    const lsOutput = JSON.stringify([
      { status: 'running', configuration: { id: 'nanoclaw-a-1' } },
      { status: 'running', configuration: { id: 'nanoclaw-b-2' } },
    ]);
    mockExecSync.mockReturnValueOnce(lsOutput);
    // First stop fails
    mockExecSync.mockImplementationOnce(() => {
      throw new Error('already stopped');
    });
    // Second stop succeeds
    mockExecSync.mockReturnValueOnce('');

    cleanupOrphans(); // should not throw

    expect(mockExecSync).toHaveBeenCalledTimes(3);
    expect(logger.info).toHaveBeenCalledWith(
      { running: 2, stopped: 0 },
      'Cleaned up orphaned containers',
    );
  });

  it('uses rm for stopped containers and stop for running', () => {
    const lsOutput = JSON.stringify([
      { status: 'stopped', configuration: { id: 'nanoclaw-old-1' } },
      { status: 'stopped', configuration: { id: 'nanoclaw-old-2' } },
    ]);
    mockExecSync.mockReturnValueOnce(lsOutput);
    mockExecSync.mockReturnValue('');

    cleanupOrphans();

    // ls + 2 rm calls (no stop calls since none running)
    expect(mockExecSync).toHaveBeenCalledTimes(3);
    expect(mockExecSync).toHaveBeenNthCalledWith(
      2,
      `${CONTAINER_RUNTIME_BIN} rm nanoclaw-old-1`,
      { stdio: 'pipe', timeout: 10000 },
    );
    expect(mockExecSync).toHaveBeenNthCalledWith(
      3,
      `${CONTAINER_RUNTIME_BIN} rm nanoclaw-old-2`,
      { stdio: 'pipe', timeout: 10000 },
    );
  });
});
