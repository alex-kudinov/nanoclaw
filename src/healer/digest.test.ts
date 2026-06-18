import { describe, it, expect, vi, beforeEach } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
const store = vi.hoisted(() => ({ getState: vi.fn(), setState: vi.fn() }));
const { postIncidents } = vi.hoisted(() => ({ postIncidents: vi.fn() }));
const { alert } = vi.hoisted(() => ({ alert: vi.fn() }));

vi.mock('../business-db.js', () => ({ query }));
vi.mock('./incident-store.js', () => store);
vi.mock('./slack.js', () => ({ postIncidents }));
vi.mock('./alert.js', () => ({ alert }));
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { formatDigest, runDigest, type DigestRow } from './digest.js';

const row = (over: Partial<DigestRow> = {}): DigestRow => ({
  source: 'job:digest',
  severity: 'error',
  occurrences: 1,
  last_seen: '2026-06-14T00:00:00Z',
  raw_context: { error: 'boom' },
  ...over,
});

describe('formatDigest', () => {
  it('emits a terse alive line on an empty day', () => {
    const out = formatDigest([], 'the last run');
    expect(out).toContain('no new incidents');
    expect(out).toContain('Healer alive');
  });

  it('lists incidents with source, severity, occurrences and detail', () => {
    const out = formatDigest(
      [row({ source: 'minion:sales', occurrences: 3, raw_context: { err_message: 'kaboom' } })],
      '2026-06-13',
    );
    expect(out).toContain('1 open since 2026-06-13');
    expect(out).toContain('*minion:sales* ×3');
    expect(out).toContain('kaboom');
  });

  it('caps the list and reports the overflow count', () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      row({ source: `job:j${i}` }),
    );
    const out = formatDigest(rows, 'x');
    expect(out).toContain('…and 5 more');
  });
});

describe('runDigest', () => {
  beforeEach(() => {
    query.mockReset();
    store.getState.mockReset().mockResolvedValue(null);
    store.setState.mockReset();
    postIncidents.mockReset().mockResolvedValue(true);
    alert.mockReset();
  });

  it('posts the digest and checkpoints last_digest_at', async () => {
    query.mockResolvedValue({ rows: [row()] });
    await runDigest();
    expect(postIncidents).toHaveBeenCalledOnce();
    expect(store.setState).toHaveBeenCalledWith(
      'last_digest_at',
      expect.any(String),
    );
  });

  it('falls back to alert.sh when the Slack post fails', async () => {
    query.mockResolvedValue({ rows: [row()] });
    postIncidents.mockResolvedValue(false);
    await runDigest();
    expect(alert).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('digest'),
      expect.any(String),
    );
  });
});
