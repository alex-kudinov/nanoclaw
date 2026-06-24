import { describe, it, expect, vi, beforeEach } from 'vitest';

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
const fsm = vi.hoisted(() => ({ readFileSync: vi.fn() }));

vi.mock('child_process', () => ({ spawn }));
vi.mock('fs', () => ({ default: fsm, ...fsm }));
vi.mock('os', () => ({
  default: { homedir: () => '/home' },
  homedir: () => '/home',
}));
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { activeOAuthToken, agenticEnv, runAgenticClaude } from './agentic.js';

function tokenFiles(p: string): string {
  if (p.includes('.claude-active-token')) return 'info\n';
  if (p.includes('.claude-tokens.json')) return '{"info":"sk-ant-oat01-test"}';
  return '';
}

/** A spawn() stub whose stdout emits `out` then closes with `code`. */
function fakeChild(code: number, out: string) {
  return {
    stdout: {
      on: (e: string, cb: (d: Buffer) => void) =>
        e === 'data' && cb(Buffer.from(out)),
    },
    stderr: { on: () => {} },
    on: (e: string, cb: (arg: number) => void) => e === 'close' && cb(code),
  };
}

beforeEach(() => {
  fsm.readFileSync.mockReset().mockImplementation(tokenFiles);
  spawn.mockReset();
  delete process.env.ANTHROPIC_API_KEY;
});

describe('activeOAuthToken', () => {
  it('resolves the active account to its rotated token', () => {
    expect(activeOAuthToken()).toBe('sk-ant-oat01-test');
  });
  it('returns null when the rotation files are missing', () => {
    fsm.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(activeOAuthToken()).toBeNull();
  });
});

describe('agenticEnv', () => {
  it('injects the OAuth token and drops a stray API key', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-api';
    const env = agenticEnv('tok');
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe('tok');
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });
});

describe('runAgenticClaude', () => {
  it('skips spawning and returns {ok:false} when no token is available', async () => {
    fsm.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(await runAgenticClaude('p')).toEqual({ ok: false, stdout: '' });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('spawns claude and returns ok:true with captured stdout on exit 0', async () => {
    spawn.mockReturnValue(fakeChild(0, 'investigation output'));
    const r = await runAgenticClaude('p', { allowedTools: 'Read Grep Glob' });
    expect(r).toEqual({ ok: true, stdout: 'investigation output' });
    expect(spawn).toHaveBeenCalledTimes(1);
    const args = spawn.mock.calls[0][1] as string[];
    expect(args).toContain('--allowedTools');
    expect(args).toContain('Read Grep Glob');
  });

  it('returns ok:false on a non-zero exit', async () => {
    spawn.mockReturnValue(fakeChild(1, 'boom'));
    expect(await runAgenticClaude('p')).toEqual({ ok: false, stdout: 'boom' });
  });

  it('caps concurrent claude processes at HEALER_DIAGNOSE_CONCURRENCY (default 2)', async () => {
    const closers: Array<() => void> = [];
    let live = 0;
    let peak = 0;
    spawn.mockImplementation(() => {
      live++;
      peak = Math.max(peak, live);
      let onClose: (c: number) => void = () => {};
      closers.push(() => {
        live--;
        onClose(0);
      });
      return {
        stdout: {
          on: (e: string, cb: (d: Buffer) => void) =>
            e === 'data' && cb(Buffer.from('x')),
        },
        stderr: { on: () => {} },
        on: (e: string, cb: (c: number) => void) => {
          if (e === 'close') onClose = cb;
        },
      };
    });
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const runs = [
      runAgenticClaude('a'),
      runAgenticClaude('b'),
      runAgenticClaude('c'),
    ];
    await tick();
    expect(spawn).toHaveBeenCalledTimes(2); // the 3rd is queued behind the cap
    closers[0](); // free a slot → the 3rd run starts
    await tick();
    expect(spawn).toHaveBeenCalledTimes(3);
    closers[1]();
    closers[2]();
    await Promise.all(runs);
    expect(peak).toBe(2);
  });
});
