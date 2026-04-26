/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const mockReadEnvFile = vi.fn<(keys: string[]) => Record<string, string>>(
  () => ({}),
);
vi.mock('./env.js', () => ({
  readEnvFile: (keys: string[]) => mockReadEnvFile(keys),
}));

import { bridgePrint } from './claude-bridge.js';
import { logger } from './logger.js';

const mockFetch = vi.fn();

beforeEach(() => {
  (global as any).fetch = mockFetch;
  mockFetch.mockReset();
  mockReadEnvFile.mockReset();
  mockReadEnvFile.mockReturnValue({});
  process.env.CLAUDE_BRIDGE_KEY = 'test-key';
  delete process.env.CLAUDE_BRIDGE_URL;
});

afterEach(() => {
  delete (global as any).fetch;
  delete process.env.CLAUDE_BRIDGE_KEY;
});

function okResponse(result: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, data: { result } }),
    text: async () => '',
  };
}

describe('bridgePrint', () => {
  it('posts to the default URL with the bridge key header', async () => {
    mockFetch.mockResolvedValue(okResponse('hello'));
    const res = await bridgePrint({ prompt: 'say hello' });
    expect(res).toBe('hello');
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://100.115.115.206:40960/v1/print');
    expect((init as any).method).toBe('POST');
    expect((init as any).headers['X-Bridge-Key']).toBe('test-key');
    expect((init as any).headers['Content-Type']).toBe('application/json');
    const body = JSON.parse((init as any).body as string);
    expect(body.prompt).toBe('say hello');
    expect(body.model).toBe('sonnet');
  });

  it('honors CLAUDE_BRIDGE_URL env override', async () => {
    process.env.CLAUDE_BRIDGE_URL = 'http://localhost:9000/print';
    mockFetch.mockResolvedValue(okResponse('ok'));
    await bridgePrint({ prompt: 'hi' });
    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:9000/print');
  });

  it('passes model + system when provided', async () => {
    mockFetch.mockResolvedValue(okResponse('ok'));
    await bridgePrint({ prompt: 'hi', model: 'haiku', system: 'be terse' });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('haiku');
    expect(body.system_prompt).toBe('be terse');
  });

  it('throws when prompt is empty', async () => {
    await expect(bridgePrint({ prompt: '' })).rejects.toThrow(/empty/);
    await expect(bridgePrint({ prompt: '   ' })).rejects.toThrow(/empty/);
  });

  it('throws when CLAUDE_BRIDGE_KEY is missing from both process.env and .env', async () => {
    delete process.env.CLAUDE_BRIDGE_KEY;
    mockReadEnvFile.mockReturnValue({});
    await expect(bridgePrint({ prompt: 'hi' })).rejects.toThrow(
      /CLAUDE_BRIDGE_KEY/,
    );
  });

  it('falls back to readEnvFile when CLAUDE_BRIDGE_KEY is absent from process.env', async () => {
    delete process.env.CLAUDE_BRIDGE_KEY;
    mockReadEnvFile.mockReturnValue({ CLAUDE_BRIDGE_KEY: 'file-key' });
    mockFetch.mockResolvedValue(okResponse('hi'));
    await bridgePrint({ prompt: 'hi' });
    expect((mockFetch.mock.calls[0][1] as any).headers['X-Bridge-Key']).toBe(
      'file-key',
    );
  });

  it('surfaces HTTP errors', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({}),
      text: async () => 'bad gateway',
    });
    await expect(bridgePrint({ prompt: 'hi' })).rejects.toThrow(/HTTP 502/);
  });

  it('surfaces ok:false error bodies', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, code: 'RATE_LIMIT', error: 'slow down' }),
      text: async () => '',
    });
    await expect(bridgePrint({ prompt: 'hi' })).rejects.toThrow(
      /RATE_LIMIT.*slow down/,
    );
  });

  it('throws on missing data.result in success body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: {} }),
      text: async () => '',
    });
    await expect(bridgePrint({ prompt: 'hi' })).rejects.toThrow(
      /unexpected response shape/,
    );
  });

  it('warns when prompt is very large', async () => {
    mockFetch.mockResolvedValue(okResponse('ok'));
    const big = 'x'.repeat(150_000);
    await bridgePrint({ prompt: big });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ estimatedTokens: expect.any(Number) }),
      expect.stringMatching(/large prompt/),
    );
  });

  it('rejects with a timeout error when the signal aborts', async () => {
    mockFetch.mockImplementation((_url: string, init: any) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
    await expect(bridgePrint({ prompt: 'hi', timeout_ms: 10 })).rejects.toThrow(
      /timed out after 10ms/,
    );
  });
});
