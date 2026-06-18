import { describe, it, expect, vi, beforeEach } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../business-db.js', () => ({ query }));

import {
  normalize,
  fingerprint,
  redact,
  redactContext,
  upsertIncident,
  getState,
  setState,
} from './incident-store.js';

describe('normalize', () => {
  it('strips ids/timestamps/numbers so repeats collapse', () => {
    const a = normalize(
      'Booking 12345 failed at 2026-06-14T10:00:00Z uuid 1a2b3c4d-1234-5678-9abc-1234567890ab',
    );
    const b = normalize(
      'Booking 99999 failed at 2026-01-01T00:00:00Z uuid ffffffff-0000-0000-0000-000000000000',
    );
    expect(a).toBe(b);
  });
});

describe('fingerprint', () => {
  it('is stable across volatile detail, distinct across sources', () => {
    expect(fingerprint('job:x', 'err 1', 'E')).toBe(
      fingerprint('job:x', 'err 2', 'E'),
    );
    expect(fingerprint('job:x', 'err', 'E')).not.toBe(
      fingerprint('job:y', 'err', 'E'),
    );
  });
});

describe('redact', () => {
  it('removes api keys, bearer tokens, jwts, and key=value secrets', () => {
    expect(redact('use sk-abcd1234efgh5678')).toContain('<redacted>');
    expect(redact('Authorization: Bearer abcdef123456ghij')).toMatch(
      /bearer <redacted>/i,
    );
    expect(redact('password=hunter2supersecret')).toContain('<redacted>');
    expect(redact('slack xoxb-123456789-abcdefghij')).toContain('<redacted>');
  });

  it('redactContext preserves non-secret fields', () => {
    const out = redactContext({ note: 'token=abcdef123456', count: 3 });
    expect(out.count).toBe(3);
    expect(JSON.stringify(out)).toContain('<redacted>');
  });
});

describe('upsertIncident', () => {
  beforeEach(() => query.mockReset());

  it('upserts on the partial-unique fingerprint index and reports inserted', async () => {
    query.mockResolvedValue({ rows: [{ inserted: true }] });
    const res = await upsertIncident({
      source: 'job:x',
      severity: 'error',
      fingerprint: 'fp',
      raw_context: {},
    });
    expect(res).toBe('inserted');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("ON CONFLICT (fingerprint) WHERE status NOT IN ('resolved', 'wont_fix')");
    expect(params[0]).toBe('job:x');
  });

  it('reports updated when the row already existed', async () => {
    query.mockResolvedValue({ rows: [{ inserted: false }] });
    expect(
      await upsertIncident({
        source: 's',
        severity: 'warn',
        fingerprint: 'f',
        raw_context: {},
      }),
    ).toBe('updated');
  });
});

describe('collector_state', () => {
  beforeEach(() => query.mockReset());

  it('getState returns the default when absent', async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await getState('k', 7)).toBe(7);
  });

  it('getState returns the stored value', async () => {
    query.mockResolvedValue({ rows: [{ value: 42 }] });
    expect(await getState('k', 0)).toBe(42);
  });

  it('setState upserts into collector_state', async () => {
    query.mockResolvedValue({ rows: [] });
    await setState('k', { a: 1 });
    expect(query.mock.calls[0][0]).toContain('business_v2.collector_state');
  });
});
