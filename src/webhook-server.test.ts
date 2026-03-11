import http from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WebhookServer, WebhookServerDeps } from './webhook-server.js';
import { WebhookDefinition } from './types.js';

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(() => '[]'),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      watchFile: vi.fn(),
      unwatchFile: vi.fn(),
    },
  };
});

function makeRequest(
  port: number,
  opts: {
    method?: string;
    path: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: opts.path,
        method: opts.method ?? 'POST',
        headers: opts.headers ?? {},
      },
      (res) => {
        let body = '';
        res.on('data', (c: Buffer) => (body += c.toString()));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on('error', reject);
    req.end(opts.body ?? '{}');
  });
}

const testWebhook: WebhookDefinition = {
  id: 'test-hook',
  name: 'Test Hook',
  group: 'main',
  chat_jid: 'slack:C123',
  prompt_template: 'Event received: {{payload}}',
  secret: 'hook-secret',
  context_mode: 'isolated',
  created_at: '2026-01-01T00:00:00Z',
};

const testGroup = {
  name: 'Main',
  folder: 'main',
  trigger: '@Gru',
  added_at: '2026-01-01T00:00:00Z',
};

function makeDeps(overrides?: Partial<WebhookServerDeps>): WebhookServerDeps {
  return {
    port: 49100 + Math.floor(Math.random() * 900),
    webhooksFile: '/tmp/webhooks.json',
    globalSecret: '',
    getRegisteredGroups: () => ({ 'slack:C123': testGroup }),
    runAgent: vi.fn(async () => ({ status: 'success' as const, result: null })),
    sendMessage: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('WebhookServer', () => {
  let server: WebhookServer;
  let deps: WebhookServerDeps;

  beforeEach(async () => {
    vi.clearAllMocks();
    deps = makeDeps();
    server = new WebhookServer(deps);
    await server.start();
    // Set webhook AFTER start() so loadWebhooks() (returns [] via mock) doesn't overwrite it
    (server as unknown as { webhooks: WebhookDefinition[] }).webhooks = [
      testWebhook,
    ];
  });

  afterEach(async () => {
    await server.stop().catch(() => {});
  });

  it('returns 404 for unknown webhook ID', async () => {
    const res = await makeRequest(deps.port, {
      path: '/hook/does-not-exist',
      headers: { 'x-webhook-secret': 'hook-secret' },
    });
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({
      error: expect.stringContaining('not found'),
    });
  });

  it('returns 404 for unknown routes', async () => {
    const res = await makeRequest(deps.port, { path: '/unknown' });
    expect(res.status).toBe(404);
  });

  it('returns 401 when secret is wrong', async () => {
    const res = await makeRequest(deps.port, {
      path: '/hook/test-hook',
      headers: { 'x-webhook-secret': 'wrong-secret' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 for malformed JSON body', async () => {
    const res = await makeRequest(deps.port, {
      path: '/hook/test-hook',
      headers: { 'x-webhook-secret': 'hook-secret' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({
      error: expect.stringContaining('JSON'),
    });
  });

  it('returns 202 and triggers agent on valid request', async () => {
    const res = await makeRequest(deps.port, {
      path: '/hook/test-hook',
      headers: { 'x-webhook-secret': 'hook-secret' },
    });
    expect(res.status).toBe(202);
    const parsed = JSON.parse(res.body);
    expect(parsed).toHaveProperty('request_id');
    expect(typeof parsed.request_id).toBe('string');
  });

  it('uses global secret fallback when webhook has no secret', async () => {
    const d = makeDeps({ globalSecret: 'global-secret' });
    const s = new WebhookServer(d);
    await s.start();
    const noSecretHook: WebhookDefinition = {
      ...testWebhook,
      id: 'no-secret-hook',
      secret: undefined,
    };
    (s as unknown as { webhooks: WebhookDefinition[] }).webhooks = [
      noSecretHook,
    ];

    try {
      const res = await makeRequest(d.port, {
        path: '/hook/no-secret-hook',
        headers: { 'x-webhook-secret': 'global-secret' },
      });
      expect(res.status).toBe(202);
    } finally {
      await s.stop().catch(() => {});
    }
  });

  it('renders {{payload}} in prompt template', async () => {
    const runAgent = vi.fn(async () => ({
      status: 'success' as const,
      result: null,
    }));
    const d = makeDeps({ runAgent });
    const s = new WebhookServer(d);
    await s.start();
    (s as unknown as { webhooks: WebhookDefinition[] }).webhooks = [
      testWebhook,
    ];

    try {
      await makeRequest(d.port, {
        path: '/hook/test-hook',
        headers: { 'x-webhook-secret': 'hook-secret' },
        body: JSON.stringify({ key: 'value' }),
      });
      // Give agent invocation a tick to fire
      await new Promise((r) => setTimeout(r, 10));
      expect(runAgent).toHaveBeenCalledWith(
        testGroup,
        expect.objectContaining({
          prompt: expect.stringContaining('"key": "value"'),
        }),
        expect.any(Function),
        expect.any(Function),
      );
    } finally {
      await s.stop().catch(() => {});
    }
  });

  it('renders {{payload.field}} in prompt template', async () => {
    const hook: WebhookDefinition = {
      ...testWebhook,
      id: 'field-hook',
      prompt_template: 'Repo: {{payload.repo}}',
    };
    const runAgent = vi.fn(async () => ({
      status: 'success' as const,
      result: null,
    }));
    const d = makeDeps({ runAgent });
    const s = new WebhookServer(d);
    await s.start();
    (s as unknown as { webhooks: WebhookDefinition[] }).webhooks = [hook];

    try {
      await makeRequest(d.port, {
        path: '/hook/field-hook',
        headers: { 'x-webhook-secret': 'hook-secret' },
        body: JSON.stringify({ repo: 'myapp' }),
      });
      await new Promise((r) => setTimeout(r, 10));
      expect(runAgent).toHaveBeenCalledWith(
        testGroup,
        expect.objectContaining({ prompt: 'Repo: myapp' }),
        expect.any(Function),
        expect.any(Function),
      );
    } finally {
      await s.stop().catch(() => {});
    }
  });

  it('calls sendMessage when no callback URL and agent produces result', async () => {
    const sendMessage = vi.fn(async () => {});
    const runAgent = vi.fn(async (_group, _input, _onProc, onOutput) => {
      await onOutput?.({
        status: 'success',
        result: 'Agent done',
        newSessionId: undefined,
      });
      return { status: 'success' as const, result: 'Agent done' };
    });
    const d = makeDeps({ runAgent, sendMessage });
    const s = new WebhookServer(d);
    await s.start();
    (s as unknown as { webhooks: WebhookDefinition[] }).webhooks = [
      testWebhook,
    ];

    try {
      await makeRequest(d.port, {
        path: '/hook/test-hook',
        headers: { 'x-webhook-secret': 'hook-secret' },
      });
      await new Promise((r) => setTimeout(r, 20));
      expect(sendMessage).toHaveBeenCalledWith('slack:C123', 'Agent done');
    } finally {
      await s.stop().catch(() => {});
    }
  });

  it('strips <internal> blocks before sending message', async () => {
    const sendMessage = vi.fn(async () => {});
    const runAgent = vi.fn(async (_group, _input, _onProc, onOutput) => {
      await onOutput?.({
        status: 'success',
        result: 'Visible<internal>hidden</internal> text',
        newSessionId: undefined,
      });
      return { status: 'success' as const, result: null };
    });
    const d = makeDeps({ runAgent, sendMessage });
    const s = new WebhookServer(d);
    await s.start();
    (s as unknown as { webhooks: WebhookDefinition[] }).webhooks = [
      testWebhook,
    ];

    try {
      await makeRequest(d.port, {
        path: '/hook/test-hook',
        headers: { 'x-webhook-secret': 'hook-secret' },
      });
      await new Promise((r) => setTimeout(r, 20));
      expect(sendMessage).toHaveBeenCalledWith('slack:C123', 'Visible text');
    } finally {
      await s.stop().catch(() => {});
    }
  });

  it('GET /hooks returns webhooks with secrets redacted', async () => {
    const d = makeDeps({ globalSecret: 'admin-secret' });
    const s = new WebhookServer(d);
    await s.start();
    (s as unknown as { webhooks: WebhookDefinition[] }).webhooks = [
      testWebhook,
    ];

    try {
      const res = await makeRequest(d.port, {
        method: 'GET',
        path: '/hooks',
        headers: { 'x-webhook-secret': 'admin-secret' },
      });
      expect(res.status).toBe(200);
      const list = JSON.parse(res.body);
      expect(list).toHaveLength(1);
      expect(list[0]).not.toHaveProperty('secret');
      expect(list[0].id).toBe('test-hook');
    } finally {
      await s.stop().catch(() => {});
    }
  });

  it('GET /hooks returns 401 with wrong global secret', async () => {
    const d = makeDeps({ globalSecret: 'admin-secret' });
    const s = new WebhookServer(d);
    await s.start();

    try {
      const res = await makeRequest(d.port, {
        method: 'GET',
        path: '/hooks',
        headers: { 'x-webhook-secret': 'wrong' },
      });
      expect(res.status).toBe(401);
    } finally {
      await s.stop().catch(() => {});
    }
  });

  it('getPort returns configured port', () => {
    expect(server.getPort()).toBe(deps.port);
  });
});
