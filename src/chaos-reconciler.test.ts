import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ stdout: 'OK []' }));
const dbh = vi.hoisted(() => ({
  queryImpl: (_sql: string, _params?: unknown[]): { rows: unknown[] } => ({
    rows: [],
  }),
}));
const wh = vi.hoisted(() => ({
  archive: (_i: unknown): { id: number; isDuplicate: boolean } => ({
    id: 1,
    isDuplicate: false,
  }),
}));

vi.mock('child_process', () => ({
  execFile: (
    _f: string,
    _a: string[],
    _o: unknown,
    cb: (e: unknown, v: unknown) => void,
  ) => cb(null, { stdout: h.stdout, stderr: '' }),
}));
vi.mock('./business-db.js', () => ({
  query: (sql: string, params?: unknown[]) =>
    Promise.resolve(dbh.queryImpl(sql, params)),
  withAgentContext: (_n: string, fn: (c: unknown) => unknown) => fn(null),
}));
vi.mock('./webhook-inbox.js', () => ({
  archiveWebhook: (i: unknown) => Promise.resolve(wh.archive(i)),
}));
vi.mock('./logger.js', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

import { runChaosReconcile } from './chaos-reconciler.js';

const deps = { getRegisteredGroups: () => ({}) };

interface RouterOpts {
  watermark?: unknown[];
  partyByEmail?: (email: string) => string | null;
  inboxStatus?: string;
}

function router(opts: RouterOpts) {
  return (sql: string, params?: unknown[]): { rows: unknown[] } => {
    if (sql.includes('last_seen_at') && sql.includes('sweeper_watermarks')) {
      return { rows: opts.watermark ?? [] };
    }
    if (sql.includes('best_party_by_email')) {
      const email = String((params ?? [])[0] ?? '');
      return {
        rows: [
          { party_id: opts.partyByEmail ? opts.partyByEmail(email) : null },
        ],
      };
    }
    if (sql.includes('webhook_inbox') && sql.includes('ANY')) {
      const ids = ((params ?? [])[0] as number[]) ?? [];
      return {
        rows: ids.map((id) => ({ id, status: opts.inboxStatus ?? 'handled' })),
      };
    }
    return { rows: [] };
  };
}

const WM_ROW = [
  { last_seen_at: '2026-05-10T00:00:00Z', last_run_status: 'success' },
];

function visitor(id: number, when = '2026-05-15T12:00:00Z') {
  return {
    visitor_id: id,
    email: `v${id}@example.com`,
    display_name: `Visitor ${id}`,
    identity_status: 'verified',
    email_validated_at: when,
    form_event_type: 'form_contact',
    intent_summary: null,
  };
}

beforeEach(() => {
  h.stdout = 'OK []';
  dbh.queryImpl = router({ watermark: WM_ROW });
  wh.archive = (_i: unknown) => ({ id: 1, isDuplicate: false });
});

describe('runChaosReconcile', () => {
  it('dry-run returns counts', async () => {
    const r = await runChaosReconcile(deps);
    expect(r.status).toBe('success');
    expect(r.fetched_count).toBeGreaterThanOrEqual(0);
    expect(r.missing_party_count).toBeGreaterThanOrEqual(0);
    expect(r.synthesized_inbox_count).toBeGreaterThanOrEqual(0);
    expect(['advanced', 'frozen']).toContain(r.watermark_action);
    expect(r.watermark_action).toBe('advanced'); // empty page ⇒ advanced
  });

  it('synthesizes a sweep row for a visitor with no party', async () => {
    h.stdout = `OK ${JSON.stringify([visitor(412)])}`;
    dbh.queryImpl = router({
      watermark: WM_ROW,
      partyByEmail: () => null,
      inboxStatus: 'handled',
    });
    let archived: Record<string, unknown> | null = null;
    wh.archive = (i: unknown) => {
      archived = i as Record<string, unknown>;
      return { id: 77, isDuplicate: false };
    };
    const r = await runChaosReconcile(deps);
    expect(r.status).toBe('success');
    expect(r.missing_party_count).toBe(1);
    expect(r.synthesized_inbox_count).toBe(1);
    expect(r.watermark_action).toBe('advanced');
    expect(archived).not.toBeNull();
    expect(archived!.event_id).toBe('chaos:visitor:412:verified');
    expect(archived!.delivery_path).toBe('sweep');
  });

  it('skips synthesis when every visitor already has a party', async () => {
    h.stdout = `OK ${JSON.stringify([visitor(1), visitor(2)])}`;
    dbh.queryImpl = router({ watermark: WM_ROW, partyByEmail: () => 'p99' });
    const r = await runChaosReconcile(deps);
    expect(r.status).toBe('success');
    expect(r.fetched_count).toBe(2);
    expect(r.missing_party_count).toBe(0);
    expect(r.synthesized_inbox_count).toBe(0);
    expect(r.watermark_action).toBe('advanced');
  });

  it('freezes the watermark on a truncated 500-row page', async () => {
    const page = Array.from({ length: 500 }, (_, i) => visitor(i + 1));
    h.stdout = `OK ${JSON.stringify(page)}`;
    dbh.queryImpl = router({ watermark: WM_ROW, partyByEmail: () => 'p1' });
    const r = await runChaosReconcile(deps);
    expect(r.status).toBe('frozen');
    expect(r.fetched_count).toBe(500);
    expect(r.watermark_action).toBe('frozen');
  });

  it('errors and leaves the watermark unchanged on a degraded tool response', async () => {
    h.stdout = 'OK {"degraded":true,"error":"curl exit 7","data":[]}';
    const r = await runChaosReconcile(deps);
    expect(r.status).toBe('error');
    expect(r.watermark_action).toBe('unchanged');
  });

  it('seeds the watermark row on first run (no existing row)', async () => {
    dbh.queryImpl = router({ watermark: [] });
    const r = await runChaosReconcile(deps);
    expect(r.status).toBe('success');
    expect(r.since_iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});
