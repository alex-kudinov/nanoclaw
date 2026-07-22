import { describe, it, expect, vi, beforeEach } from 'vitest';

const fsm = vi.hoisted(() => ({ readFileSync: vi.fn() }));
vi.mock('fs', () => ({ default: fsm, ...fsm }));
vi.mock('os', () => ({
  default: { homedir: () => '/home' },
  homedir: () => '/home',
}));

import { activeOAuthToken, injectClaudeToken } from './claude-token.js';

function tokenFiles(p: string): string {
  if (p.includes('.claude-active-token')) return 'info\n';
  if (p.includes('.claude-tokens.json')) return '{"info":"sk-ant-oat01-test"}';
  return '';
}

beforeEach(() => {
  fsm.readFileSync.mockReset().mockImplementation(tokenFiles);
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
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

describe('injectClaudeToken', () => {
  it('injects the rotated token and drops a stray API key', () => {
    const env: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY: 'sk-api', PATH: '/x' };
    injectClaudeToken(env);
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe('sk-ant-oat01-test');
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.PATH).toBe('/x'); // unrelated vars untouched
  });

  it('is a no-op (leaves env intact) when no token is available', () => {
    fsm.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const env: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY: 'sk-api' };
    injectClaudeToken(env);
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
    // No token to prefer, so we don't strip a (possibly needed) API key either.
    expect(env.ANTHROPIC_API_KEY).toBe('sk-api');
  });
});
