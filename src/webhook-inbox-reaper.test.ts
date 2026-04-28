/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
const mockWithAgentContext = vi.fn();
vi.mock('./business-db.js', () => ({
  query: (...args: any[]) => mockQuery(...args),
  withAgentContext: (...args: any[]) => mockWithAgentContext(...args),
}));
vi.mock('./config.js', () => ({ DATA_DIR: '/tmp/nc-reaper-test' }));
vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import fs from 'fs';
vi.spyOn(fs, 'mkdirSync').mockImplementation(() => '');
vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

import { runReaper } from './webhook-inbox-reaper.js';

const testWebhook = {
  id: 'course-recap',
  name: 'Course Session Recap',
  group: 'courses',
  chat_jid: 'slack:C0AR3K7QU85',
  prompt_template: 'Process recap: {{payload.transcript_note}}',
  secret: 'x',
  context_mode: 'isolated',
  created_at: '2026-04-06T00:00:00Z',
};

const testGroup = {
  name: 'Courses',
  folder: 'courses',
  trigger: '@Mr Gru',
  added_at: '2026-01-01T00:00:00Z',
};

const chiefGroup = {
  name: 'Chief',
  folder: 'chief',
  trigger: '@Mr Gru',
  added_at: '2026-01-01T00:00:00Z',
};

function makeDeps(
  runAgent = vi.fn(async () => ({ status: 'success', result: null }) as any),
) {
  vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify([testWebhook]));
  return {
    webhooksFile: '/tmp/webhooks.json',
    getRegisteredGroups: () => ({
      'slack:C0AR3K7QU85': testGroup,
      'slack:C0AHDHX1NBH': chiefGroup,
    }),
    runAgent,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runReaper', () => {
  it('returns zero processed when claim returns no rows', async () => {
    mockWithAgentContext.mockImplementation(async (_role: string, fn: any) => {
      const client = { query: vi.fn(async () => ({ rows: [] })) };
      return fn(client);
    });
    const r = await runReaper(makeDeps());
    expect(r.processed).toBe(0);
    expect(r.succeeded).toBe(0);
  });

  it('marks handled when dispatch succeeds', async () => {
    const claimed = [
      {
        id: 17,
        source: 'course-recap',
        event_type: 'session-recap',
        raw_body: { transcript_note: 'meeting-x' },
        attempts: 0,
      },
    ];
    mockWithAgentContext.mockImplementation(async (_role: string, fn: any) => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: claimed })
          .mockResolvedValue({ rows: [] }),
      };
      return fn(client);
    });
    mockQuery.mockResolvedValue({ rows: [] });

    const runAgent = vi.fn(
      async () => ({ status: 'success', result: null }) as any,
    );
    const deps = makeDeps(runAgent);
    const r = await runReaper(deps);

    expect(r.processed).toBe(1);
    expect(r.succeeded).toBe(1);
    expect(r.deadLettered).toBe(0);
    expect(runAgent).toHaveBeenCalled();
    // markHandled was called (UPDATE … status='handled')
    const handledCall = mockQuery.mock.calls.find((c) =>
      c[0].includes("status = 'handled'"),
    );
    expect(handledCall).toBeDefined();
  });

  it('marks failed and retries when attempt count below MAX', async () => {
    const claimed = [
      {
        id: 18,
        source: 'course-recap',
        event_type: 'session-recap',
        raw_body: {},
        attempts: 1, // already incremented to 2 after claim — still under 5
      },
    ];
    mockWithAgentContext.mockImplementation(async (_role: string, fn: any) => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: claimed })
          .mockResolvedValue({ rows: [] }),
      };
      return fn(client);
    });
    mockQuery.mockResolvedValue({ rows: [] });

    const runAgent = vi.fn(async () => {
      throw new Error('container exit 137');
    });
    const r = await runReaper(makeDeps(runAgent));

    expect(r.processed).toBe(1);
    expect(r.retried).toBe(1);
    expect(r.deadLettered).toBe(0);
    const failedCall = mockQuery.mock.calls.find((c) =>
      c[0].includes("status = 'failed'"),
    );
    expect(failedCall).toBeDefined();
  });

  it('dead-letters when attempt count exceeds MAX_ATTEMPTS', async () => {
    const claimed = [
      {
        id: 19,
        source: 'course-recap',
        event_type: 'session-recap',
        raw_body: {},
        attempts: 4, // claim bumped to 5 — at threshold
      },
    ];
    mockWithAgentContext.mockImplementation(async (_role: string, fn: any) => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: claimed })
          .mockResolvedValue({ rows: [] }),
      };
      return fn(client);
    });
    mockQuery.mockResolvedValue({ rows: [] });

    const runAgent = vi.fn(async () => {
      throw new Error('persistent failure');
    });
    const r = await runReaper(makeDeps(runAgent));

    expect(r.deadLettered).toBe(1);
    expect(r.deadLetterDetails[0]).toMatchObject({
      id: 19,
      source: 'course-recap',
    });
    const dlCall = mockQuery.mock.calls.find((c) =>
      c[0].includes("status = 'dead_lettered'"),
    );
    expect(dlCall).toBeDefined();
    // Chief alert IPC file written
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('throws when webhook config missing → marks failed', async () => {
    const claimed = [
      {
        id: 20,
        source: 'unknown-source',
        event_type: null,
        raw_body: {},
        attempts: 0,
      },
    ];
    mockWithAgentContext.mockImplementation(async (_role: string, fn: any) => {
      const client = {
        query: vi
          .fn()
          .mockResolvedValueOnce({ rows: claimed })
          .mockResolvedValue({ rows: [] }),
      };
      return fn(client);
    });
    mockQuery.mockResolvedValue({ rows: [] });

    const runAgent = vi.fn();
    const r = await runReaper(makeDeps(runAgent));

    expect(r.retried).toBe(1);
    expect(runAgent).not.toHaveBeenCalled();
  });
});
