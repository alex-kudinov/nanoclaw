/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock business-db
const mockQuery = vi.fn();
const mockWithAgentContext = vi.fn();
vi.mock('./business-db.js', () => ({
  query: (...args: any[]) => mockQuery(...args),
  withAgentContext: (...args: any[]) => mockWithAgentContext(...args),
}));

// Mock config
vi.mock('./config.js', () => ({
  DATA_DIR: '/tmp/nanoclaw-test-data',
}));

// Mock logger
vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock child_process
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
    },
  };
});

import { runReaper } from './plutio-outbox-reaper.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runReaper', () => {
  it('returns zero counts when no pending rows', async () => {
    mockWithAgentContext.mockImplementation(
      async (_agent: string, fn: (client: any) => Promise<any>) => {
        const client = {
          query: vi.fn().mockResolvedValue({ rows: [] }),
        };
        return fn(client);
      },
    );

    const result = await runReaper();
    expect(result.processed).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.retried).toBe(0);
    expect(result.deadLettered).toBe(0);
  });

  it('claims rows via withAgentContext transaction', async () => {
    const claimQuery = vi.fn().mockResolvedValue({ rows: [] });
    mockWithAgentContext.mockImplementation(
      async (_agent: string, fn: (client: any) => Promise<any>) => {
        const client = { query: claimQuery };
        // Return empty rows — SELECT returns nothing
        claimQuery.mockResolvedValueOnce({ rows: [] });
        return fn(client);
      },
    );

    await runReaper();
    expect(mockWithAgentContext).toHaveBeenCalledWith(
      'plutio-reaper',
      expect.any(Function),
    );
  });

  it('marks rows as failed on dispatch error and dead-letters after max attempts', async () => {
    const failRow = {
      id: 99,
      operation: 'sync',
      kind: 'party',
      party_id: 1,
      document_id: null,
      payload: {},
      attempts: 4, // one more = dead
    };

    mockWithAgentContext.mockImplementation(
      async (_agent: string, fn: (client: any) => Promise<any>) => {
        const client = {
          query: vi
            .fn()
            .mockResolvedValueOnce({ rows: [failRow] }) // SELECT
            .mockResolvedValue({ rows: [] }), // UPDATE claim
        };
        return fn(client);
      },
    );

    // party lookup will fail (no email) triggering markFailure
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // lookupPartyEmail → null
      .mockResolvedValueOnce({ rows: [] }); // markFailure UPDATE

    const result = await runReaper();
    expect(result.processed).toBe(1);
    expect(result.deadLettered).toBe(1);
    expect(result.deadLetterDetails[0].id).toBe(99);
  });
});
