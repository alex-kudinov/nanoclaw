import { describe, it, expect, vi, beforeEach } from 'vitest';

const { readEnvFile } = vi.hoisted(() => ({ readEnvFile: vi.fn() }));
vi.mock('../env.js', () => ({ readEnvFile }));
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { askRouter, diagnoseModel } from './router.js';

function envWith(map: Record<string, string>) {
  readEnvFile.mockImplementation((keys: string[]) => {
    const out: Record<string, string> = {};
    for (const k of keys) if (map[k] !== undefined) out[k] = map[k];
    return out;
  });
}

beforeEach(() => {
  readEnvFile.mockReset();
  vi.unstubAllGlobals();
});

describe('askRouter', () => {
  it('returns the trimmed result on ok', async () => {
    envWith({ ROUTER_SECRET: 'k' });
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, data: { result: '  hi  ' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await askRouter('p')).toBe('hi');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBeUndefined(); // default omits model → bridge picks
    expect(fetchMock.mock.calls[0][1].headers['X-Bridge-Key']).toBe('k');
  });

  it('returns null when ok is false', async () => {
    envWith({ ROUTER_SECRET: 'k' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: false, code: 'RATE_LIMITED' }),
      }),
    );
    expect(await askRouter('p')).toBeNull();
  });

  it('returns null without a key and never calls fetch', async () => {
    envWith({});
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await askRouter('p')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null on a thrown/aborted fetch', async () => {
    envWith({ ROUTER_SECRET: 'k' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));
    expect(await askRouter('p')).toBeNull();
  });

  it('falls back to CLAUDE_BRIDGE_KEY and honors HEALER_DIAGNOSE_MODEL', async () => {
    envWith({ CLAUDE_BRIDGE_KEY: 'legacy', HEALER_DIAGNOSE_MODEL: 'gpt5' });
    expect(diagnoseModel()).toBe('gpt5');
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, data: { result: 'x' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await askRouter('p', { model: 'kimi' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('kimi');
    expect(fetchMock.mock.calls[0][1].headers['X-Bridge-Key']).toBe('legacy');
  });
});
