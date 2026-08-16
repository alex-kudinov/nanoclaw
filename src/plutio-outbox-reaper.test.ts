/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock business-db
const mockQuery = vi.fn();
const mockWithAgentContext = vi.fn();
const mockIsBookingPlutioOutboxRow = vi.fn<(row: any) => boolean>(() => false);
const mockDispatchBookingPlutioOutboxRow = vi.fn<(row: any) => Promise<any>>();
vi.mock('./business-db.js', () => ({
  query: (...args: any[]) => mockQuery(...args),
  withAgentContext: (...args: any[]) => mockWithAgentContext(...args),
}));
vi.mock('./booking-plutio-host.js', () => ({
  isBookingPlutioOutboxRow: (row: any) => mockIsBookingPlutioOutboxRow(row),
  dispatchBookingPlutioOutboxRow: (row: any) =>
    mockDispatchBookingPlutioOutboxRow(row),
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
  mockIsBookingPlutioOutboxRow.mockReturnValue(false);
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
    expect(String(claimQuery.mock.calls[0][0])).toContain(
      "kind LIKE 'booking_activity:%'",
    );
  });

  it('dispatches the typed Booking row and stores its opaque receipt', async () => {
    const row = {
      id: 77,
      operation: 'sync',
      kind: `booking_activity:${'a'.repeat(64)}`,
      party_id: 42,
      document_id: null,
      payload: {
        schema_version: 1,
        kind: `booking_activity:${'a'.repeat(64)}`,
        webhook_inbox_id: 91,
        event_id: 'appt:47:canceled',
      },
      attempts: 0,
    };
    const receipt = {
      eventId: 'appt:47:canceled',
      marker: `<!-- nanoclaw-booking:${'b'.repeat(64)} -->`,
      plutioPersonId: 'person_1',
      noteId: 'note_1',
      remoteStatus: 'recorded' as const,
    };
    mockWithAgentContext.mockImplementation(
      async (_agent: string, fn: (client: any) => Promise<any>) => {
        const client = {
          query: vi
            .fn()
            .mockResolvedValueOnce({ rows: [row] })
            .mockResolvedValue({ rows: [] }),
        };
        return fn(client);
      },
    );
    mockIsBookingPlutioOutboxRow.mockReturnValue(true);
    mockDispatchBookingPlutioOutboxRow.mockResolvedValue(receipt);
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await runReaper();
    expect(result).toMatchObject({ processed: 1, succeeded: 1 });
    expect(mockDispatchBookingPlutioOutboxRow).toHaveBeenCalledWith(row);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('receipt'), [
      77,
      JSON.stringify(receipt),
    ]);
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
