/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
const mockWithAgentContext = vi.fn();
vi.mock('./business-db.js', () => ({
  query: (...args: any[]) => mockQuery(...args),
  withAgentContext: (...args: any[]) => mockWithAgentContext(...args),
}));
vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  buildDisplayName,
  resolveOrCreateParty,
  resolveTrafftCustomer,
} from './identity-join.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildDisplayName', () => {
  it('prefers "first last" when both are present', () => {
    expect(
      buildDisplayName({
        customerEmail: 'x@example.com',
        customerFirstName: 'Jamie',
        customerLastName: 'Maak',
      }),
    ).toBe('Jamie Maak');
  });

  it('falls back to fullName when first/last missing', () => {
    expect(
      buildDisplayName({
        customerEmail: 'x@example.com',
        customerFullName: 'Jamie Maak',
      }),
    ).toBe('Jamie Maak');
  });

  it('falls back to email when no name fields are present', () => {
    expect(buildDisplayName({ customerEmail: 'jamie@finvari.com' })).toBe(
      'jamie@finvari.com',
    );
  });

  it('handles whitespace-only name fields gracefully', () => {
    expect(
      buildDisplayName({
        customerEmail: 'x@example.com',
        customerFirstName: '   ',
        customerLastName: '',
        customerFullName: 'Fallback',
      }),
    ).toBe('Fallback');
  });
});

describe('resolveOrCreateParty', () => {
  it('returns party_id from fn_create_party', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '10046' }] });
    const id = await resolveOrCreateParty({
      email: 'jamie.maak@finvari.com',
      display_name: 'Jamie Maak',
      source_hint: 'trafft',
    });
    expect(id).toBe(10046);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toContain('fn_create_party');
    expect(mockQuery.mock.calls[0][1]).toEqual([
      'person',
      'Jamie Maak',
      'jamie.maak@finvari.com',
      'trafft',
      '{}',
    ]);
  });

  it('uses default source_hint=manual when not provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '1' }] });
    await resolveOrCreateParty({
      email: 'a@b.com',
      display_name: 'A B',
    });
    expect(mockQuery.mock.calls[0][1][3]).toBe('manual');
  });

  it('passes metadata as jsonb', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '5' }] });
    await resolveOrCreateParty({
      email: 'a@b.com',
      display_name: 'A B',
      metadata: { trafft_customer_id: '28' },
    });
    expect(mockQuery.mock.calls[0][1][4]).toBe(
      JSON.stringify({ trafft_customer_id: '28' }),
    );
  });

  it('wraps in withAgentContext when agent is set', async () => {
    mockWithAgentContext.mockImplementation(async (_role, fn) => {
      const client = { query: vi.fn(async () => ({ rows: [{ id: '11' }] })) };
      return fn(client);
    });
    const id = await resolveOrCreateParty({
      email: 'a@b.com',
      display_name: 'A B',
      agent: 'trafft-sweeper',
    });
    expect(id).toBe(11);
    expect(mockWithAgentContext).toHaveBeenCalledWith(
      'trafft-sweeper',
      expect.any(Function),
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects empty email', async () => {
    await expect(
      resolveOrCreateParty({ email: '', display_name: 'X' }),
    ).rejects.toThrow(/email required/);
    await expect(
      resolveOrCreateParty({ email: '   ', display_name: 'X' }),
    ).rejects.toThrow(/email required/);
  });

  it('rejects empty display_name', async () => {
    await expect(
      resolveOrCreateParty({ email: 'a@b.com', display_name: '' }),
    ).rejects.toThrow(/display_name required/);
  });
});

describe('resolveTrafftCustomer', () => {
  it('builds display_name from first+last and tags source=trafft', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: '10046' }] });
    const id = await resolveTrafftCustomer({
      customerId: 28,
      customerEmail: 'jamie.maak@finvari.com',
      customerFirstName: 'Jamie',
      customerLastName: 'Maak',
    });
    expect(id).toBe(10046);
    expect(mockQuery.mock.calls[0][0]).toContain('party_external_refs');
    expect(mockQuery.mock.calls[1][1]).toEqual([
      'person',
      'Jamie Maak',
      'jamie.maak@finvari.com',
      'trafft',
      JSON.stringify({ trafft_customer_id: '28' }),
    ]);
  });

  it('uses an exact Trafft customer reference before email resolution', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '10088' }] });
    const id = await resolveTrafftCustomer({
      customerId: 88,
      customerEmail: 'changed@example.com',
    });
    expect(id).toBe(10088);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toContain('party_external_refs');
    expect(mockQuery.mock.calls[0][0]).not.toContain('fn_create_party');
    expect(mockQuery.mock.calls[0][1]).toEqual(['88']);
  });

  it('includes trafft_customer_id only when provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '7' }] });
    await resolveTrafftCustomer({
      customerEmail: 'walkin@example.com',
    });
    expect(mockQuery.mock.calls[0][1][4]).toBe('{}');
  });

  it('rejects missing customerEmail', async () => {
    await expect(
      resolveTrafftCustomer({ customerEmail: '' } as any),
    ).rejects.toThrow(/customerEmail required/);
  });
});
