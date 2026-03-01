import http from 'http';
import https from 'https';
import { PassThrough } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TokenProxy } from './token-proxy.js';

vi.mock('./env.js', () => ({ readEnvFile: vi.fn() }));
vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { readEnvFile } from './env.js';
const mockReadEnvFile = vi.mocked(readEnvFile);

function makeRequest(
  port: number,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'POST', headers },
      (res) => {
        let body = '';
        res.on('data', (c: Buffer) => (body += c.toString()));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on('error', reject);
    req.end('{}');
  });
}

/** Create a fake upstream response with a given status code. */
function makeFakeUpstream(
  statusCode: number,
  capturedHeaders?: Record<string, unknown>,
) {
  const fakeRes = new PassThrough() as unknown as http.IncomingMessage;
  (fakeRes as unknown as Record<string, unknown>).statusCode = statusCode;
  (fakeRes as unknown as Record<string, unknown>).headers = {};

  const fakeReq = new PassThrough() as unknown as http.ClientRequest;

  return {
    fakeRes,
    fakeReq,
    install: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(https, 'request').mockImplementationOnce((...args: any[]) => {
        const options = args[0] as https.RequestOptions;
        const cb = args[1] as ((r: http.IncomingMessage) => void) | undefined;
        if (capturedHeaders)
          Object.assign(capturedHeaders, options.headers ?? {});
        if (cb) {
          setImmediate(() => {
            cb(fakeRes);
            fakeRes.push(null);
          });
        }
        return fakeReq;
      });
    },
  };
}

/** Install a single upstream mock (200 by default). */
function mockUpstream(capturedHeaders: Record<string, unknown>) {
  makeFakeUpstream(200, capturedHeaders).install();
}

describe('TokenProxy', () => {
  let proxy: TokenProxy;
  let port: number;

  beforeEach(() => {
    vi.clearAllMocks();
    port = 49000 + Math.floor(Math.random() * 1000);
    proxy = new TokenProxy(port);
  });

  afterEach(async () => {
    await proxy.stop().catch(() => {});
    vi.restoreAllMocks();
  });

  // --- existing single-token tests ---

  it('returns 401 when no token is configured', async () => {
    mockReadEnvFile.mockReturnValue({});
    await proxy.start();
    const res = await makeRequest(port, '/v1/messages');
    expect(res.status).toBe(401);
    expect(JSON.parse(res.body)).toMatchObject({
      error: { message: expect.stringContaining('No API token') },
    });
  });

  it('forwards with Authorization header when OAuth token present', async () => {
    mockReadEnvFile.mockReturnValue({
      CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-test',
    });
    const captured: Record<string, unknown> = {};
    mockUpstream(captured);
    await proxy.start();
    await makeRequest(port, '/v1/messages', {
      'x-api-key': 'proxy-placeholder',
    });
    expect(captured['authorization']).toBe('Bearer sk-ant-oat01-test');
    expect(captured['x-api-key']).toBeUndefined();
  });

  it('forwards with x-api-key when API key present', async () => {
    mockReadEnvFile.mockReturnValue({ ANTHROPIC_API_KEY: 'sk-ant-api-test' });
    const captured: Record<string, unknown> = {};
    mockUpstream(captured);
    await proxy.start();
    await makeRequest(port, '/v1/messages', {
      authorization: 'Bearer proxy-placeholder',
    });
    expect(captured['x-api-key']).toBe('sk-ant-api-test');
    expect(captured['authorization']).toBeUndefined();
  });

  it('OAuth token takes precedence over API key', async () => {
    mockReadEnvFile.mockReturnValue({
      CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-preferred',
      ANTHROPIC_API_KEY: 'sk-ant-api-ignored',
    });
    const captured: Record<string, unknown> = {};
    mockUpstream(captured);
    await proxy.start();
    await makeRequest(port, '/v1/messages');
    expect(captured['authorization']).toBe('Bearer sk-ant-oat01-preferred');
    expect(captured['x-api-key']).toBeUndefined();
  });

  it('sets host header to api.anthropic.com', async () => {
    mockReadEnvFile.mockReturnValue({ ANTHROPIC_API_KEY: 'sk-ant-test' });
    const captured: Record<string, unknown> = {};
    mockUpstream(captured);
    await proxy.start();
    await makeRequest(port, '/v1/messages', { host: 'should-be-replaced' });
    expect(captured['host']).toBe('api.anthropic.com');
  });

  it('getPort returns configured port', () => {
    expect(proxy.getPort()).toBe(port);
  });

  // --- pool rotation tests ---

  it('uses numbered slots when CLAUDE_CODE_OAUTH_TOKEN_1 is set', async () => {
    mockReadEnvFile.mockReturnValue({
      CLAUDE_CODE_OAUTH_TOKEN_1: 'sk-ant-slot-1',
    });
    const captured: Record<string, unknown> = {};
    mockUpstream(captured);
    await proxy.start();
    await makeRequest(port, '/v1/messages');
    expect(captured['authorization']).toBe('Bearer sk-ant-slot-1');
  });

  it('rotates to next slot on 429', async () => {
    mockReadEnvFile.mockReturnValue({
      CLAUDE_CODE_OAUTH_TOKEN_1: 'sk-ant-slot-1',
      CLAUDE_CODE_OAUTH_TOKEN_2: 'sk-ant-slot-2',
    });

    const capturedSlot1: Record<string, unknown> = {};
    const capturedSlot2: Record<string, unknown> = {};

    // First call → 429
    makeFakeUpstream(429, capturedSlot1).install();
    // Second call → 200
    makeFakeUpstream(200, capturedSlot2).install();

    await proxy.start();
    const res = await makeRequest(port, '/v1/messages');
    expect(res.status).toBe(200);
    expect(capturedSlot1['authorization']).toBe('Bearer sk-ant-slot-1');
    expect(capturedSlot2['authorization']).toBe('Bearer sk-ant-slot-2');
  });

  it('returns 429 when all slots are rate-limited', async () => {
    mockReadEnvFile.mockReturnValue({
      CLAUDE_CODE_OAUTH_TOKEN_1: 'sk-ant-slot-1',
      CLAUDE_CODE_OAUTH_TOKEN_2: 'sk-ant-slot-2',
    });

    makeFakeUpstream(429).install();
    makeFakeUpstream(429).install();

    await proxy.start();
    const res = await makeRequest(port, '/v1/messages');
    expect(res.status).toBe(429);
    expect(JSON.parse(res.body)).toMatchObject({
      error: { message: expect.stringContaining('rate-limited') },
    });
  });

  it('numbered slots take priority over single-token fallback', async () => {
    mockReadEnvFile.mockReturnValue({
      CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-single-ignored',
      CLAUDE_CODE_OAUTH_TOKEN_1: 'sk-ant-slot-1-used',
    });
    const captured: Record<string, unknown> = {};
    mockUpstream(captured);
    await proxy.start();
    await makeRequest(port, '/v1/messages');
    expect(captured['authorization']).toBe('Bearer sk-ant-slot-1-used');
  });

  it('remembers the working slot across requests', async () => {
    mockReadEnvFile.mockReturnValue({
      CLAUDE_CODE_OAUTH_TOKEN_1: 'sk-ant-slot-1',
      CLAUDE_CODE_OAUTH_TOKEN_2: 'sk-ant-slot-2',
    });

    // First request: slot 1 → 429, slot 2 → 200
    makeFakeUpstream(429).install();
    makeFakeUpstream(200).install();
    await proxy.start();
    await makeRequest(port, '/v1/messages');

    // Second request: should start from slot 2 (where we left off)
    const captured: Record<string, unknown> = {};
    makeFakeUpstream(200, captured).install();
    await makeRequest(port, '/v1/messages');
    expect(captured['authorization']).toBe('Bearer sk-ant-slot-2');
  });
});
