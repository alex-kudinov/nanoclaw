import http from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WebhookServer, WebhookServerDeps } from './webhook-server.js';
import { recordFailure, recordSuccess } from './circuit-breaker.js';
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
    // Let the kernel allocate a free ephemeral port. A random fixed range
    // collided with macOS services (notably rapportd on 49152), making the
    // full release gate nondeterministically fail with EADDRINUSE.
    port: 0,
    webhooksFile: '/tmp/webhooks.json',
    globalSecret: '',
    heartbeatPath: '/tmp/nanoclaw-heartbeat.json',
    getRegisteredGroups: () => ({ 'slack:C123': testGroup }),
    runAgent: vi.fn(async () => ({ status: 'success' as const, result: null })),
    // Stub of GroupQueue.enqueueTask: run the task fn immediately, as the
    // real queue does when no container is active for the group.
    enqueueAgentTask: vi.fn((_groupJid, _taskId, fn: () => Promise<void>) => {
      void fn();
    }),
    sendMessage: vi.fn(async () => {}),
    getHealth: () => ({
      release: {
        mode: 'release',
        verified: true,
        commit: 'a'.repeat(40),
        sourceTree: 'b'.repeat(40),
        artifactHash: 'c'.repeat(64),
        builtAt: '2026-07-31T00:00:00.000Z',
        nodePin: '22.23.2',
        nodeVersion: '22.23.2',
      },
      channels: {},
      activeContainers: 0,
      lastMessageAt: null,
    }),
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
    deps.port = server.getPort();
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

  it('archives envelope before dispatch and includes inbox id in response', async () => {
    const archiveWebhook = vi.fn(async () => ({ id: 42, isDuplicate: false }));
    const markWebhookDispatched = vi.fn(async () => {});
    const d = makeDeps({ archiveWebhook, markWebhookDispatched });
    const s = new WebhookServer(d);
    await s.start();
    (s as unknown as { webhooks: WebhookDefinition[] }).webhooks = [
      testWebhook,
    ];
    try {
      const res = await makeRequest(d.port, {
        path: '/hook/test-hook',
        headers: { 'x-webhook-secret': 'hook-secret' },
        body: JSON.stringify({ ping: 'pong' }),
      });
      expect(res.status).toBe(202);
      const parsed = JSON.parse(res.body);
      expect(parsed.webhook_inbox_id).toBe(42);
      expect(archiveWebhook).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'test-hook', delivery_path: 'n8n' }),
      );
      // markDispatched runs after the 202 response; give it a beat
      await new Promise((r) => setTimeout(r, 20));
      expect(markWebhookDispatched).toHaveBeenCalledWith(42);
    } finally {
      await s.stop().catch(() => {});
    }
  });

  it('returns 200 + duplicate flag when archive reports duplicate; skips agent dispatch', async () => {
    const archiveWebhook = vi.fn(async () => ({ id: 99, isDuplicate: true }));
    const runAgent = vi.fn(async () => ({
      status: 'success' as const,
      result: null,
    }));
    const d = makeDeps({ archiveWebhook, runAgent });
    const s = new WebhookServer(d);
    await s.start();
    (s as unknown as { webhooks: WebhookDefinition[] }).webhooks = [
      testWebhook,
    ];
    try {
      const res = await makeRequest(d.port, {
        path: '/hook/test-hook',
        headers: { 'x-webhook-secret': 'hook-secret' },
      });
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toMatchObject({
        webhook_inbox_id: 99,
        duplicate: true,
      });
      expect(runAgent).not.toHaveBeenCalled();
    } finally {
      await s.stop().catch(() => {});
    }
  });

  it('returns 500 when archive fails; agent is not dispatched', async () => {
    const archiveWebhook = vi.fn(async () => {
      throw new Error('db down');
    });
    const runAgent = vi.fn(async () => ({
      status: 'success' as const,
      result: null,
    }));
    const d = makeDeps({ archiveWebhook, runAgent });
    const s = new WebhookServer(d);
    await s.start();
    (s as unknown as { webhooks: WebhookDefinition[] }).webhooks = [
      testWebhook,
    ];
    try {
      const res = await makeRequest(d.port, {
        path: '/hook/test-hook',
        headers: { 'x-webhook-secret': 'hook-secret' },
      });
      expect(res.status).toBe(500);
      expect(runAgent).not.toHaveBeenCalled();
    } finally {
      await s.stop().catch(() => {});
    }
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
      expect(sendMessage).toHaveBeenCalledWith('slack:C123', 'Agent done', {
        fromGroup: 'main',
      });
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
      expect(sendMessage).toHaveBeenCalledWith('slack:C123', 'Visible text', {
        fromGroup: 'main',
      });
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

describe('WebhookServer — Gmail Pub/Sub push endpoint', () => {
  let server: WebhookServer;
  let deps: WebhookServerDeps;
  let handleGmailPush: ReturnType<
    typeof vi.fn<(emailAddress: string, historyId: string) => Promise<void>>
  >;

  beforeEach(async () => {
    vi.clearAllMocks();
    handleGmailPush = vi.fn<
      (emailAddress: string, historyId: string) => Promise<void>
    >(async () => {});
    deps = makeDeps({
      globalSecret: 'global-secret',
      gmailPushSecret: 'push-secret',
      handleGmailPush,
    });
    server = new WebhookServer(deps);
    await server.start();
  });

  afterEach(async () => {
    await server.stop().catch(() => {});
  });

  function envelope(payload: unknown): string {
    const data = Buffer.from(JSON.stringify(payload)).toString('base64');
    return JSON.stringify({ message: { data, messageId: 'msg-1' } });
  }

  it('decodes base64 payload and dispatches to handler', async () => {
    const res = await makeRequest(deps.port, {
      path: '/hook/gmail-push',
      headers: {
        'x-webhook-secret': 'push-secret',
        'content-type': 'application/json',
      },
      body: envelope({
        emailAddress: 'info@tandemcoach.co',
        historyId: '4242',
      }),
    });
    expect(res.status).toBe(204);
    // Handler is fire-and-forget; allow microtask flush.
    await new Promise((r) => setImmediate(r));
    expect(handleGmailPush).toHaveBeenCalledWith('info@tandemcoach.co', '4242');
  });

  it('coerces numeric historyId to string', async () => {
    const res = await makeRequest(deps.port, {
      path: '/hook/gmail-push',
      headers: { 'x-webhook-secret': 'push-secret' },
      body: envelope({ emailAddress: 'info@tandemcoach.co', historyId: 4242 }),
    });
    expect(res.status).toBe(204);
    await new Promise((r) => setImmediate(r));
    expect(handleGmailPush).toHaveBeenCalledWith('info@tandemcoach.co', '4242');
  });

  it('rejects with 401 when secret is wrong', async () => {
    const res = await makeRequest(deps.port, {
      path: '/hook/gmail-push',
      headers: { 'x-webhook-secret': 'nope' },
      body: envelope({ emailAddress: 'x@y.z', historyId: '1' }),
    });
    expect(res.status).toBe(401);
    expect(handleGmailPush).not.toHaveBeenCalled();
  });

  it('falls back to global secret when gmailPushSecret is unset', async () => {
    await server.stop();
    deps = makeDeps({
      globalSecret: 'global-secret',
      handleGmailPush,
    });
    server = new WebhookServer(deps);
    await server.start();

    const res = await makeRequest(deps.port, {
      path: '/hook/gmail-push',
      headers: { 'x-webhook-secret': 'global-secret' },
      body: envelope({ emailAddress: 'a@b.c', historyId: '1' }),
    });
    expect(res.status).toBe(204);
  });

  it('returns 400 for missing message.data', async () => {
    const res = await makeRequest(deps.port, {
      path: '/hook/gmail-push',
      headers: { 'x-webhook-secret': 'push-secret' },
      body: JSON.stringify({ message: {} }),
    });
    expect(res.status).toBe(400);
    expect(handleGmailPush).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid base64 payload', async () => {
    const res = await makeRequest(deps.port, {
      path: '/hook/gmail-push',
      headers: { 'x-webhook-secret': 'push-secret' },
      body: JSON.stringify({ message: { data: 'not-valid-base64-json@@' } }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when emailAddress or historyId is missing', async () => {
    const res = await makeRequest(deps.port, {
      path: '/hook/gmail-push',
      headers: { 'x-webhook-secret': 'push-secret' },
      body: envelope({ emailAddress: 'a@b.c' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 503 when handler is not configured', async () => {
    await server.stop();
    deps = makeDeps({
      globalSecret: 'global-secret',
      gmailPushSecret: 'push-secret',
      // handleGmailPush intentionally omitted
    });
    server = new WebhookServer(deps);
    await server.start();

    const res = await makeRequest(deps.port, {
      path: '/hook/gmail-push',
      headers: { 'x-webhook-secret': 'push-secret' },
      body: envelope({ emailAddress: 'a@b.c', historyId: '1' }),
    });
    expect(res.status).toBe(503);
  });

  it('does not conflict with generic /hook/:id matcher', async () => {
    // A webhook registered with id "gmail-push" should still be intercepted
    // by the Pub/Sub endpoint, not the generic handler.
    (server as unknown as { webhooks: WebhookDefinition[] }).webhooks = [
      { ...testWebhook, id: 'gmail-push', secret: 'other-secret' },
    ];
    const res = await makeRequest(deps.port, {
      path: '/hook/gmail-push',
      headers: { 'x-webhook-secret': 'push-secret' },
      body: envelope({ emailAddress: 'a@b.c', historyId: '1' }),
    });
    expect(res.status).toBe(204);
  });
});

describe('WebhookServer — [PROCESSING] message (T02)', () => {
  afterEach(() => vi.clearAllMocks());

  async function fire(group: Record<string, unknown>) {
    const d = makeDeps({
      getRegisteredGroups: () => ({ 'slack:C123': group as never }),
    });
    const s = new WebhookServer(d);
    await s.start();
    (s as unknown as { webhooks: WebhookDefinition[] }).webhooks = [
      testWebhook,
    ];
    try {
      const res = await makeRequest(d.port, {
        path: '/hook/test-hook',
        headers: { 'x-webhook-secret': 'hook-secret' },
        body: JSON.stringify({ ping: 'pong' }),
      });
      expect(res.status).toBe(202);
      // let the async dispatch run
      await new Promise((r) => setTimeout(r, 30));
    } finally {
      await s.stop().catch(() => {});
    }
    return d;
  }

  it('posts exactly one [PROCESSING] line for a flagged group', async () => {
    const d = await fire({
      ...testGroup,
      containerConfig: { processingMessage: 'Working on it' },
    });
    const processingCalls = (
      d.sendMessage as ReturnType<typeof vi.fn>
    ).mock.calls.filter(
      (c) => typeof c[1] === 'string' && c[1].startsWith('[PROCESSING]'),
    );
    expect(processingCalls).toHaveLength(1);
    expect(processingCalls[0][1]).toBe('[PROCESSING] Working on it');
    expect(processingCalls[0][2]).toMatchObject({ fromGroup: 'main' });
    // agent still dispatched exactly once
    expect(d.runAgent).toHaveBeenCalledTimes(1);
  });

  it('posts no [PROCESSING] line for an unflagged group', async () => {
    const d = await fire({ ...testGroup });
    const processingCalls = (
      d.sendMessage as ReturnType<typeof vi.fn>
    ).mock.calls.filter(
      (c) => typeof c[1] === 'string' && c[1].startsWith('[PROCESSING]'),
    );
    expect(processingCalls).toHaveLength(0);
    expect(d.runAgent).toHaveBeenCalledTimes(1);
  });
});

vi.mock('./booking-host-write.js', async () => {
  const actual = await vi.importActual<
    typeof import('./booking-host-write.js')
  >('./booking-host-write.js');
  return { ...actual, bookingHostWrite: vi.fn() };
});

import { bookingHostWrite } from './booking-host-write.js';
import bookedFixture from './fixtures/booked-webhook.json' with { type: 'json' };

describe('WebhookServer — host-side booking write (T03b)', () => {
  const trafftWebhook: WebhookDefinition = {
    ...testWebhook,
    id: 'trafft',
    group: 'booking',
    chat_jid: 'slack:CBOOKING',
    secret: 'hook-secret',
  };
  const bookingGroup = {
    name: 'Booking',
    folder: 'booking',
    trigger: '@Gru',
    added_at: '2026-01-01T00:00:00Z',
  };
  const chiefGroup = {
    name: 'Chief',
    folder: 'chief',
    trigger: '@Gru',
    added_at: '2026-01-01T00:00:00Z',
  };
  const mockBookingWrite = bookingHostWrite as ReturnType<typeof vi.fn>;

  afterEach(() => vi.clearAllMocks());

  async function fireTrafft(
    body: unknown,
    deps: WebhookServerDeps,
  ): Promise<void> {
    const s = new WebhookServer(deps);
    await s.start();
    (s as unknown as { webhooks: WebhookDefinition[] }).webhooks = [
      trafftWebhook,
    ];
    try {
      const res = await makeRequest(deps.port, {
        path: '/hook/trafft',
        headers: { 'x-webhook-secret': 'hook-secret' },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(202);
      await new Promise((r) => setTimeout(r, 40));
    } finally {
      await s.stop().catch(() => {});
    }
  }

  it('host-writes a valid booked event with no agent spawn', async () => {
    mockBookingWrite.mockResolvedValue({
      booking_row_id: 9001,
      party_id: 4242,
      interaction_id: 9001,
    });
    const markWebhookHandled = vi.fn(async () => {});
    const d = makeDeps({
      getRegisteredGroups: () => ({ 'slack:CBOOKING': bookingGroup }),
      archiveWebhook: vi.fn(async () => ({ id: 77, isDuplicate: false })),
      markWebhookHandled,
    });
    await fireTrafft(bookedFixture, d);

    expect(mockBookingWrite).toHaveBeenCalledTimes(1);
    expect(d.runAgent).not.toHaveBeenCalled();
    const sent = (d.sendMessage as ReturnType<typeof vi.fn>).mock.calls;
    expect(sent).toHaveLength(1);
    expect(sent[0][0]).toBe('slack:CBOOKING');
    expect(sent[0][1]).toContain('[BOOKING]');
    expect(sent[0][1]).toContain('party 4242 · interaction 9001');
    expect(sent[0][2]).toMatchObject({ fromGroup: 'booking' });
    expect(markWebhookHandled).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ handled_by: 'booking:host-write' }),
    );
    // no [PROCESSING] line for a host-written booked event
    expect(
      sent.filter(
        (c) => typeof c[1] === 'string' && c[1].startsWith('[PROCESSING]'),
      ),
    ).toHaveLength(0);
  });

  it('escalates to chief and skips the agent when the host write throws', async () => {
    mockBookingWrite.mockRejectedValue(new Error('db down'));
    const markWebhookFailed = vi.fn(async () => {});
    const d = makeDeps({
      getRegisteredGroups: () => ({
        'slack:CBOOKING': bookingGroup,
        'slack:CCHIEF': chiefGroup,
      }),
      archiveWebhook: vi.fn(async () => ({ id: 78, isDuplicate: false })),
      markWebhookFailed,
    });
    await fireTrafft(bookedFixture, d);

    expect(d.runAgent).not.toHaveBeenCalled();
    expect(markWebhookFailed).toHaveBeenCalledTimes(1);
    const escalations = (
      d.sendMessage as ReturnType<typeof vi.fn>
    ).mock.calls.filter(
      (c) => typeof c[1] === 'string' && c[1].startsWith('[ESCALATION]'),
    );
    expect(escalations).toHaveLength(1);
    expect(escalations[0][0]).toBe('slack:CCHIEF');
    expect(escalations[0][2]).toMatchObject({ fromGroup: 'chief' });
  });

  it('falls back to the agent on a malformed booked payload', async () => {
    const malformed = { ...bookedFixture } as Record<string, unknown>;
    delete malformed.appointmentId;
    const markWebhookHandled = vi.fn(async () => {});
    const d = makeDeps({
      getRegisteredGroups: () => ({ 'slack:CBOOKING': bookingGroup }),
      markWebhookHandled,
    });
    await fireTrafft(malformed, d);

    expect(mockBookingWrite).not.toHaveBeenCalled();
    expect(d.runAgent).toHaveBeenCalledTimes(1);
    expect(markWebhookHandled).not.toHaveBeenCalled();
  });

  // The webhook dispatch path spawns agent containers directly, bypassing the
  // GroupQueue. Without a breaker, a group with persistently failing containers
  // gets a storm of concurrent doomed spawns from back-to-back deliveries.
  describe('circuit breaker — webhook dispatch', () => {
    // circuit-breaker module state is process-global; reset 'main' each test.
    beforeEach(() => recordSuccess('main'));
    afterEach(() => recordSuccess('main'));

    it('skips dispatch and marks the inbox row failed while the circuit is open', async () => {
      recordFailure('main');
      recordFailure('main');
      recordFailure('main'); // FAILURE_THRESHOLD reached → circuit open
      const runAgent = vi.fn(async () => ({
        status: 'success' as const,
        result: null,
      }));
      const archiveWebhook = vi.fn(async () => ({
        id: 77,
        isDuplicate: false,
      }));
      const markWebhookFailed = vi.fn(async () => {});
      const d = makeDeps({ runAgent, archiveWebhook, markWebhookFailed });
      const s = new WebhookServer(d);
      await s.start();
      (s as unknown as { webhooks: WebhookDefinition[] }).webhooks = [
        testWebhook,
      ];
      try {
        const res = await makeRequest(d.port, {
          path: '/hook/test-hook',
          headers: { 'x-webhook-secret': 'hook-secret' },
          body: JSON.stringify({ k: 'v' }),
        });
        expect(res.status).toBe(202);
        await new Promise((r) => setTimeout(r, 25));
        expect(runAgent).not.toHaveBeenCalled();
        expect(markWebhookFailed).toHaveBeenCalledWith(
          77,
          expect.stringContaining('circuit open'),
        );
      } finally {
        await s.stop().catch(() => {});
      }
    });

    it('dispatches normally while the circuit is closed', async () => {
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
          body: JSON.stringify({ k: 'v' }),
        });
        await new Promise((r) => setTimeout(r, 25));
        expect(runAgent).toHaveBeenCalledTimes(1);
      } finally {
        await s.stop().catch(() => {});
      }
    });

    it('opens the circuit after repeated errored runs so later deliveries are skipped', async () => {
      const runAgent = vi.fn(async () => ({
        status: 'error' as const,
        result: null,
        error: 'spawn timeout',
      }));
      const d = makeDeps({ runAgent });
      const s = new WebhookServer(d);
      await s.start();
      (s as unknown as { webhooks: WebhookDefinition[] }).webhooks = [
        testWebhook,
      ];
      try {
        for (let i = 0; i < 3; i++) {
          await makeRequest(d.port, {
            path: '/hook/test-hook',
            headers: { 'x-webhook-secret': 'hook-secret' },
            body: JSON.stringify({ n: i }),
          });
          await new Promise((r) => setTimeout(r, 25));
        }
        expect(runAgent).toHaveBeenCalledTimes(3);
        // Fourth delivery — circuit is now open, dispatch must be skipped.
        await makeRequest(d.port, {
          path: '/hook/test-hook',
          headers: { 'x-webhook-secret': 'hook-secret' },
          body: JSON.stringify({ n: 3 }),
        });
        await new Promise((r) => setTimeout(r, 25));
        expect(runAgent).toHaveBeenCalledTimes(3);
      } finally {
        await s.stop().catch(() => {});
      }
    });
  });
});

describe('WebhookServer — form-submitted observed suppression', () => {
  const formWebhook: WebhookDefinition = {
    id: 'form-submitted',
    name: 'Form Submitted',
    group: 'main',
    chat_jid: 'slack:C123',
    prompt_template: '{{payload}}',
    secret: 'hook-secret',
    context_mode: 'isolated',
    created_at: '2026-01-01T00:00:00Z',
  };

  async function fireForm(
    body: unknown,
    deps: WebhookServerDeps,
  ): Promise<void> {
    const s = new WebhookServer(deps);
    await s.start();
    (s as unknown as { webhooks: WebhookDefinition[] }).webhooks = [
      formWebhook,
    ];
    try {
      await makeRequest(deps.port, {
        path: '/hook/form-submitted',
        headers: { 'x-webhook-secret': 'hook-secret' },
        body: JSON.stringify(body),
      });
      await new Promise((r) => setTimeout(r, 40));
    } finally {
      await s.stop().catch(() => {});
    }
  }

  it('suppresses the Slack post for an observed-only event but marks it handled', async () => {
    const markWebhookHandled = vi.fn(async () => {});
    const d = makeDeps({
      archiveWebhook: vi.fn(async () => ({ id: 501, isDuplicate: false })),
      markWebhookHandled,
    });
    await fireForm(
      {
        display_name: 'Hanne',
        email: 'hanne@example.com',
        identity_status: 'observed',
        form_event_subtype: 'mcqf-brochure',
        form_page: '/mcs/mentor-coaching-foundations/',
      },
      d,
    );

    const formPosts = (
      d.sendMessage as ReturnType<typeof vi.fn>
    ).mock.calls.filter(
      (c) => typeof c[1] === 'string' && c[1].startsWith('[form]'),
    );
    expect(formPosts).toHaveLength(0);
    expect(d.runAgent).not.toHaveBeenCalled();
    expect(markWebhookHandled).toHaveBeenCalledWith(
      501,
      expect.objectContaining({
        handled_by: 'form-submitted:observed-suppressed',
      }),
    );
  });

  it('still posts a verified form event', async () => {
    const markWebhookHandled = vi.fn(async () => {});
    const d = makeDeps({
      archiveWebhook: vi.fn(async () => ({ id: 502, isDuplicate: false })),
      markWebhookHandled,
    });
    await fireForm(
      {
        display_name: 'Hanne',
        email: 'hanne@example.com',
        identity_status: 'verified',
        form_event_subtype: 'mcqf-brochure',
        form_page: '/mcs/mentor-coaching-foundations/',
      },
      d,
    );

    const formPosts = (
      d.sendMessage as ReturnType<typeof vi.fn>
    ).mock.calls.filter(
      (c) => typeof c[1] === 'string' && c[1].startsWith('[form]'),
    );
    expect(formPosts).toHaveLength(1);
    expect(formPosts[0][1]).toContain('verified');
    expect(formPosts[0][2]).toMatchObject({ fromGroup: 'main' });
    expect(markWebhookHandled).toHaveBeenCalledWith(
      502,
      expect.objectContaining({ handled_by: 'form-submitted:host-handler' }),
    );
  });
});
