import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PassThrough } from 'stream';

// Sentinel markers must match container-runner.ts
const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

// Mock config
vi.mock('./config.js', () => ({
  CONTAINER_IMAGE: 'nanoclaw-agent:latest',
  CONTAINER_MAX_OUTPUT_SIZE: 10485760,
  CONTAINER_TIMEOUT: 1800000, // 30min
  DATA_DIR: '/tmp/nanoclaw-test-data',
  EAGER_TOKEN_PROBE_GROUPS: [],
  GROUPS_DIR: '/tmp/nanoclaw-test-groups',
  IDLE_TIMEOUT: 1800000, // 30min
  MEMORY_SAMPLE_INTERVAL_MS: 0,
  SPAWN_TIMEOUT: 90000, // 90s
  TIMEZONE: 'America/Los_Angeles',
}));

// Mock logger
vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(() => false),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn(() => ''),
      readdirSync: vi.fn(() => []),
      statSync: vi.fn(() => ({ isDirectory: () => false, size: 0 })),
      openSync: vi.fn(() => 101),
      closeSync: vi.fn(),
      readSync: vi.fn(() => 0),
      unlinkSync: vi.fn(),
      copyFileSync: vi.fn(),
      chmodSync: vi.fn(),
    },
  };
});

// Mock mount-security
vi.mock('./mount-security.js', () => ({
  validateAdditionalMounts: vi.fn(() => []),
}));

// Mock env — provide CLAUDE_CODE_OAUTH_TOKEN so readSecrets doesn't throw
// Includes business DB keys for PGOPTIONS tests
vi.mock('./env.js', () => ({
  readEnvFile: vi.fn(() => ({
    CLAUDE_CODE_OAUTH_TOKEN: 'test-token-for-unit-tests',
    BUSINESS_DB_HOST: '192.168.64.1',
    BUSINESS_DB_PORT: '5432',
    BUSINESS_DB_NAME: 'nanoclaw_business',
    BUSINESS_DB_ROLE_INBOX: 'nanoclaw_inbox',
    BUSINESS_DB_PASS_INBOX: 'inbox-pass',
    BUSINESS_DB_ROLE_SALES: 'nanoclaw_sales',
    BUSINESS_DB_PASS_SALES: 'sales-pass',
    BUSINESS_DB_ROLE_CHIEF: 'nanoclaw_chief',
    BUSINESS_DB_PASS_CHIEF: 'chief-pass',
    BUSINESS_DB_ROLE_ADMIN: 'nanoclaw_admin',
    BUSINESS_DB_PASS_ADMIN: 'admin-pass',
    BUSINESS_DB_ROLE_CONTADOR: 'nanoclaw_contador',
    BUSINESS_DB_PASS_CONTADOR: 'contador-pass',
    BUSINESS_DB_ROLE_MAILMAN: 'nanoclaw_mailman',
    BUSINESS_DB_PASS_MAILMAN: 'mailman-pass',
    BUSINESS_DB_ROLE_BOOKING: 'nanoclaw_booking',
    BUSINESS_DB_PASS_BOOKING: 'booking-pass',
    BUSINESS_DB_ROLE_PROCUREMENT: 'nanoclaw_procurement',
    BUSINESS_DB_PASS_PROCUREMENT: 'procurement-pass',
  })),
}));

// Create a controllable fake ChildProcess
function createFakeProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
    pid: number;
  };
  proc.stdin = new PassThrough();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.kill = vi.fn();
  proc.pid = 12345;
  return proc;
}

let fakeProc: ReturnType<typeof createFakeProcess>;

// The production runner tails detached stdout from a file so work survives a
// daemon restart. Unit tests keep their controllable PassThrough process and
// adapt it to the LogTail contract instead of touching the real filesystem.
vi.mock('./log-tail.js', () => ({
  LogTail: class {
    private readonly onChunk: (chunk: string) => void;
    private listener?: (chunk: Buffer | string) => void;

    constructor(_filePath: string, onChunk: (chunk: string) => void) {
      this.onChunk = onChunk;
    }

    start(): void {
      this.listener = (chunk) => this.onChunk(chunk.toString());
      fakeProc.stdout.on('data', this.listener);
    }

    drainNow(): void {}

    stop(): void {
      if (this.listener) fakeProc.stdout.off('data', this.listener);
    }

    getOffset(): number {
      return 0;
    }
  },
}));

// Mock child_process.spawn
vi.mock('child_process', async () => {
  const actual =
    await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    spawn: vi.fn(() => fakeProc),
    exec: vi.fn(
      (_cmd: string, _opts: unknown, cb?: (err: Error | null) => void) => {
        if (cb) cb(null);
        return new EventEmitter();
      },
    ),
  };
});

import {
  containerTimeoutRemainingMs,
  effectiveContainerTimeoutMs,
  runContainerAgent,
  ContainerOutput,
  coursesSmtpCapabilityAllowed,
  filterExternalWriteMounts,
  planReleaseOwnedInstructionMounts,
  resolveOAuthToken,
  sweepExitedContainerInputs,
} from './container-runner.js';
import { logger } from './logger.js';
import type { RegisteredGroup } from './types.js';

const testGroup: RegisteredGroup = {
  name: 'Test Group',
  folder: 'test-group',
  trigger: '@Gru',
  added_at: new Date().toISOString(),
};

const testInput = {
  prompt: 'Hello',
  groupFolder: 'test-group',
  chatJid: 'test@g.us',
  isMain: false,
};

describe('release-owned instruction mounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers manifest-covered group knowledge over a mutable configured mount', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({
      isDirectory: () => true,
    } as never);

    const plan = planReleaseOwnedInstructionMounts(
      '/releases/abc123',
      'procurement',
      [
        {
          hostPath: 'knowledge/agents/procurement',
          containerPath: 'knowledge',
          readonly: true,
        },
        {
          hostPath: '/operations/vault',
          containerPath: 'vault-procurement',
          readonly: false,
        },
      ],
    );

    expect(plan.knowledgeMount).toEqual({
      hostPath: '/releases/abc123/knowledge/agents/procurement',
      containerPath: '/workspace/extra/knowledge',
      readonly: true,
    });
    expect(plan.additionalMounts).toEqual([
      {
        hostPath: '/operations/vault',
        containerPath: 'vault-procurement',
        readonly: false,
      },
    ]);
  });

  it.each([
    {
      containerPath: '',
      hostPath: '/operations/knowledge',
      label: 'an empty configured target',
    },
    {
      containerPath: 'knowledge/',
      hostPath: 'knowledge/agents/procurement',
      label: 'a trailing slash',
    },
    {
      containerPath: './knowledge',
      hostPath: 'knowledge/agents/procurement',
      label: 'a relative path prefix',
    },
  ])(
    'suppresses the mutable knowledge alias expressed with $label',
    ({ containerPath, hostPath }) => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as never);

      const plan = planReleaseOwnedInstructionMounts(
        '/releases/abc123',
        'procurement',
        [
          {
            hostPath,
            containerPath,
            readonly: true,
          },
        ],
      );

      expect(plan.knowledgeMount?.containerPath).toBe(
        '/workspace/extra/knowledge',
      );
      expect(plan.additionalMounts).toEqual([]);
    },
  );

  it('retains the configured fallback for an older release without knowledge', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const configured = [
      {
        hostPath: 'knowledge/agents/procurement',
        containerPath: 'knowledge',
        readonly: true,
      },
    ];

    expect(
      planReleaseOwnedInstructionMounts(
        '/releases/old',
        'procurement',
        configured,
      ),
    ).toEqual({ knowledgeMount: null, additionalMounts: configured });
  });

  it('rejects an unsafe group folder before resolving a release path', () => {
    const configured = [
      {
        hostPath: 'knowledge/agents/procurement',
        containerPath: 'knowledge',
        readonly: true,
      },
    ];

    expect(
      planReleaseOwnedInstructionMounts(
        '/releases/current',
        '../escape',
        configured,
      ),
    ).toEqual({ knowledgeMount: null, additionalMounts: configured });
  });
});

describe('Courses SMTP capability boundary', () => {
  const mounts = [
    {
      hostPath: '/tools/email',
      containerPath: 'email',
      readonly: true,
    },
    {
      hostPath: '/tools/instructors',
      containerPath: 'instructors',
      readonly: true,
    },
  ];

  it('preserves the current mount in compatibility mode', () => {
    expect(
      filterExternalWriteMounts('courses', mounts, {
        enforcementEnabled: false,
        globalSafeMode: false,
        disabledSystems: [],
        valid: true,
      }),
    ).toEqual(mounts);
  });

  it.each([
    {
      name: 'global safe mode',
      config: {
        enforcementEnabled: false,
        globalSafeMode: true,
        disabledSystems: [] as const,
        valid: true,
      },
    },
    {
      name: 'per-system safe mode',
      config: {
        enforcementEnabled: false,
        globalSafeMode: false,
        disabledSystems: ['courses_smtp'] as const,
        valid: true,
      },
    },
    {
      name: 'envelope enforcement',
      config: {
        enforcementEnabled: true,
        globalSafeMode: false,
        disabledSystems: [] as const,
        valid: true,
      },
    },
  ])('withholds only the raw SMTP mount under $name', ({ config }) => {
    expect(
      filterExternalWriteMounts('courses', mounts, {
        ...config,
        disabledSystems: [...config.disabledSystems],
      }),
    ).toEqual([mounts[1]]);
    expect(
      coursesSmtpCapabilityAllowed('courses', {
        ...config,
        disabledSystems: [...config.disabledSystems],
      }),
    ).toBe(false);
    expect(
      coursesSmtpCapabilityAllowed('sales', {
        ...config,
        disabledSystems: [...config.disabledSystems],
      }),
    ).toBe(true);
  });
});

function emitOutputMarker(
  proc: ReturnType<typeof createFakeProcess>,
  output: ContainerOutput,
) {
  const json = JSON.stringify(output);
  proc.stdout.push(`${OUTPUT_START_MARKER}\n${json}\n${OUTPUT_END_MARKER}\n`);
}

describe('exited-container IPC cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('warns when an unacknowledged ephemeral result is discarded', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['gmail-result.json'] as never);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        target_container: 'nanoclaw-mailman-one',
        chat_cursor_recoverable: false,
      }),
    );

    expect(
      sweepExitedContainerInputs(
        '/tmp/ipc/mailman/input',
        'nanoclaw-mailman-one',
      ),
    ).toBe(1);
    expect(fs.unlinkSync).toHaveBeenCalledWith(
      '/tmp/ipc/mailman/input/gmail-result.json',
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ containerName: 'nanoclaw-mailman-one' }),
      expect.stringContaining('operator retry is required'),
    );
  });
});

describe('container-runner timeout behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakeProc = createFakeProcess();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('timeout after output resolves as success', async () => {
    const onOutput = vi.fn(async () => {});
    const resultPromise = runContainerAgent(
      testGroup,
      testInput,
      () => {},
      onOutput,
    );

    // Emit output with a result
    emitOutputMarker(fakeProc, {
      status: 'success',
      result: 'Here is my response',
      newSessionId: 'session-123',
    });

    // Let output processing settle
    await vi.advanceTimersByTimeAsync(10);

    // Fire the hard timeout (IDLE_TIMEOUT + 30s = 1830000ms)
    await vi.advanceTimersByTimeAsync(1830000);

    // Emit close event (as if container was stopped by the timeout)
    fakeProc.emit('close', 137);

    // Let the promise resolve
    await vi.advanceTimersByTimeAsync(10);

    const result = await resultPromise;
    expect(result.status).toBe('success');
    expect(result.newSessionId).toBe('session-123');
    expect(onOutput).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'Here is my response' }),
    );
  });

  it('heartbeats do not extend the absolute runtime deadline', async () => {
    const { exec } = await import('child_process');
    vi.mocked(exec).mockClear();
    const resultPromise = runContainerAgent(
      testGroup,
      testInput,
      () => {},
      vi.fn(async () => {}),
    );

    emitOutputMarker(fakeProc, { status: 'success', result: null });
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(1_799_990);
    fakeProc.stdout.push('---NANOCLAW_HEARTBEAT---\n');
    await vi.advanceTimersByTimeAsync(30_000);

    expect(exec).toHaveBeenCalledTimes(1);
    expect(vi.mocked(exec).mock.calls[0]?.[0]).toContain('nanoclaw-test-group');

    fakeProc.emit('close', 137);
    await vi.advanceTimersByTimeAsync(10);
    await resultPromise;
  });

  it('uses the original wall-clock deadline for adopted containers', () => {
    const salesGroup: RegisteredGroup = {
      ...testGroup,
      containerConfig: { timeout: 600_000 },
    };

    // The idle-close grace remains the floor (30 min + 30 sec in this test).
    expect(effectiveContainerTimeoutMs(salesGroup)).toBe(1_830_000);
    expect(containerTimeoutRemainingMs(salesGroup, 1_000, 1_501_000)).toBe(
      330_000,
    );
    expect(containerTimeoutRemainingMs(salesGroup, 1_000, 1_831_000)).toBe(0);
  });

  it('honors a scheduled task timeout without the message idle floor', () => {
    const procurementGroup: RegisteredGroup = {
      ...testGroup,
      containerConfig: { timeout: 900_000 },
    };

    expect(effectiveContainerTimeoutMs(procurementGroup, true)).toBe(900_000);
    expect(effectiveContainerTimeoutMs(procurementGroup, false)).toBe(
      1_830_000,
    );
  });

  it('spawn timeout with no output resolves as error', async () => {
    const onOutput = vi.fn(async () => {});
    const resultPromise = runContainerAgent(
      testGroup,
      testInput,
      () => {},
      onOutput,
    );

    // No output emitted — spawn timeout (90s) fires before hard timeout
    await vi.advanceTimersByTimeAsync(90000);

    // Emit close event (as if container was stopped by spawn timeout)
    fakeProc.emit('close', 137);

    await vi.advanceTimersByTimeAsync(10);

    const result = await resultPromise;
    expect(result.status).toBe('error');
    expect(result.error).toContain('no output');
    expect(onOutput).not.toHaveBeenCalled();
  });

  it('normal exit after output resolves as success', async () => {
    const onOutput = vi.fn(async () => {});
    const resultPromise = runContainerAgent(
      testGroup,
      testInput,
      () => {},
      onOutput,
    );

    // Emit output
    emitOutputMarker(fakeProc, {
      status: 'success',
      result: 'Done',
      newSessionId: 'session-456',
    });

    await vi.advanceTimersByTimeAsync(10);

    // Normal exit (no timeout)
    fakeProc.emit('close', 0);

    await vi.advanceTimersByTimeAsync(10);

    const result = await resultPromise;
    expect(result.status).toBe('success');
    expect(result.newSessionId).toBe('session-456');
  });
});

describe('PGOPTIONS agent identity injection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakeProc = createFakeProcess();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets PGOPTIONS with agent name and role for inbox group', async () => {
    const inboxGroup: RegisteredGroup = {
      name: 'Inbox',
      folder: 'inbox',
      trigger: '@Gru',
      added_at: new Date().toISOString(),
    };
    const input = {
      prompt: 'test',
      groupFolder: 'inbox',
      chatJid: 'test@g.us',
      isMain: false,
    };

    const resultPromise = runContainerAgent(
      inboxGroup,
      input,
      () => {},
      async () => {},
    );

    // Capture stdin data
    const chunks: Buffer[] = [];
    fakeProc.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));

    // Let stdin write settle
    await vi.advanceTimersByTimeAsync(50);

    // Emit output + close to resolve the promise
    emitOutputMarker(fakeProc, {
      status: 'success',
      result: 'ok',
      newSessionId: 'sess-1',
    });
    await vi.advanceTimersByTimeAsync(10);
    fakeProc.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);

    await resultPromise;

    const stdinData = Buffer.concat(chunks).toString();
    const parsed = JSON.parse(stdinData);
    expect(parsed.secrets.PGOPTIONS).toContain("-c app.current_agent='inbox'");
    expect(parsed.secrets.PGOPTIONS).toContain(
      "-c app.current_agent_role='nanoclaw_inbox'",
    );
    expect(parsed.secrets.BUSINESS_DB_URL).toContain('nanoclaw_inbox');
  });
});

describe('per-group model threading (T10)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakeProc = createFakeProcess();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function captureStdinModel(
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const resultPromise = runContainerAgent(
      testGroup,
      input as never,
      () => {},
      async () => {},
    );
    const chunks: Buffer[] = [];
    fakeProc.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
    await vi.advanceTimersByTimeAsync(50);
    emitOutputMarker(fakeProc, {
      status: 'success',
      result: 'ok',
      newSessionId: 'sess-1',
    });
    await vi.advanceTimersByTimeAsync(10);
    fakeProc.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);
    await resultPromise;
    const parsed = JSON.parse(Buffer.concat(chunks).toString());
    return parsed.model;
  }

  it('passes an explicit model into the agent-runner payload', async () => {
    const model = await captureStdinModel({
      prompt: 'test',
      groupFolder: 'test-group',
      chatJid: 'test@g.us',
      isMain: false,
      model: 'haiku',
    });
    expect(model).toBe('haiku');
  });

  it('omits model when not specified (agent-runner defaults to sonnet)', async () => {
    const model = await captureStdinModel({
      prompt: 'test',
      groupFolder: 'test-group',
      chatJid: 'test@g.us',
      isMain: false,
    });
    expect(model).toBeUndefined();
  });

  it('coerces an empty/whitespace model to undefined', async () => {
    const model = await captureStdinModel({
      prompt: 'test',
      groupFolder: 'test-group',
      chatJid: 'test@g.us',
      isMain: false,
      model: '   ',
    });
    expect(model).toBeUndefined();
  });
});

describe('per-group model config (T11)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakeProc = createFakeProcess();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function captureModelForGroup(
    group: RegisteredGroup,
  ): Promise<unknown> {
    const resultPromise = runContainerAgent(
      group,
      {
        prompt: 'test',
        groupFolder: group.folder,
        chatJid: 'test@g.us',
        isMain: false,
      } as never,
      () => {},
      async () => {},
    );
    const chunks: Buffer[] = [];
    fakeProc.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
    await vi.advanceTimersByTimeAsync(50);
    emitOutputMarker(fakeProc, {
      status: 'success',
      result: 'ok',
      newSessionId: 'sess-1',
    });
    await vi.advanceTimersByTimeAsync(10);
    fakeProc.emit('close', 0);
    await vi.advanceTimersByTimeAsync(10);
    await resultPromise;
    return JSON.parse(Buffer.concat(chunks).toString()).model;
  }

  it('resolves group.containerConfig.model onto ContainerInput.model', async () => {
    const haikuGroup: RegisteredGroup = {
      name: 'Archivarista',
      folder: 'archivarista',
      trigger: '@Gru',
      added_at: new Date().toISOString(),
      containerConfig: { model: 'haiku' },
    };
    expect(await captureModelForGroup(haikuGroup)).toBe('haiku');
  });

  it('omits model when the group has no model config (agent-runner → sonnet)', async () => {
    const plainGroup: RegisteredGroup = {
      name: 'Sales',
      folder: 'sales',
      trigger: '@Gru',
      added_at: new Date().toISOString(),
      containerConfig: { timeout: 600000 },
    };
    expect(await captureModelForGroup(plainGroup)).toBeUndefined();
  });
});

describe('resolveOAuthToken (token pool round-robin)', () => {
  const mockFs = vi.mocked(fs);
  const cwd = process.cwd();
  const poolPath = path.join(cwd, 'data', '.token-pool.json');
  const cursorPath = path.join(cwd, 'data', '.token-cursor');
  const pool = [
    { name: 'alex', token: 'tok-alex' },
    { name: 'info', token: 'tok-info' },
    { name: 'nanoclaw', token: 'tok-nc' },
  ];

  it('returns first token when cursor is 0', () => {
    mockFs.readFileSync.mockImplementation((p) => {
      if (p === poolPath) return JSON.stringify(pool);
      if (p === cursorPath) return '0';
      return '';
    });
    mockFs.writeFileSync.mockImplementation(() => {});
    expect(resolveOAuthToken()).toBe('tok-alex');
  });

  it('returns second token when cursor is 1', () => {
    mockFs.readFileSync.mockImplementation((p) => {
      if (p === poolPath) return JSON.stringify(pool);
      if (p === cursorPath) return '1';
      return '';
    });
    mockFs.writeFileSync.mockImplementation(() => {});
    expect(resolveOAuthToken()).toBe('tok-info');
  });

  it('returns third token when cursor is 2', () => {
    mockFs.readFileSync.mockImplementation((p) => {
      if (p === poolPath) return JSON.stringify(pool);
      if (p === cursorPath) return '2';
      return '';
    });
    mockFs.writeFileSync.mockImplementation(() => {});
    expect(resolveOAuthToken()).toBe('tok-nc');
  });

  it('wraps around: cursor 3 with 3 tokens returns first', () => {
    mockFs.readFileSync.mockImplementation((p) => {
      if (p === poolPath) return JSON.stringify(pool);
      if (p === cursorPath) return '3';
      return '';
    });
    mockFs.writeFileSync.mockImplementation(() => {});
    expect(resolveOAuthToken()).toBe('tok-alex');
  });

  it('advances cursor after each call', () => {
    let written = '';
    mockFs.readFileSync.mockImplementation((p) => {
      if (p === poolPath) return JSON.stringify(pool);
      if (p === cursorPath) return '1';
      return '';
    });
    mockFs.writeFileSync.mockImplementation((_p, data) => {
      if (_p === cursorPath) written = data as string;
    });
    resolveOAuthToken();
    expect(written).toBe('2');
  });

  it('defaults to cursor 0 when cursor file is missing', () => {
    mockFs.readFileSync.mockImplementation((p) => {
      if (p === poolPath) return JSON.stringify(pool);
      if (p === cursorPath) throw new Error('ENOENT');
      return '';
    });
    mockFs.writeFileSync.mockImplementation(() => {});
    expect(resolveOAuthToken()).toBe('tok-alex');
  });

  it('returns undefined when pool file is missing', () => {
    mockFs.readFileSync.mockImplementation((p) => {
      if (p === poolPath) throw new Error('ENOENT');
      return '';
    });
    expect(resolveOAuthToken()).toBeUndefined();
  });

  it('returns undefined when pool is empty', () => {
    mockFs.readFileSync.mockImplementation((p) => {
      if (p === poolPath) return '[]';
      return '';
    });
    expect(resolveOAuthToken()).toBeUndefined();
  });

  it('returns undefined when pool JSON is invalid', () => {
    mockFs.readFileSync.mockImplementation((p) => {
      if (p === poolPath) return 'not-json';
      return '';
    });
    expect(resolveOAuthToken()).toBeUndefined();
  });
});
