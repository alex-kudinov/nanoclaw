/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./business-db.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(async (fn: any) => {
    const client = { query: vi.fn().mockResolvedValue({ rowCount: 1 }) };
    return fn(client);
  }),
}));

vi.mock('./gmail-labels.js', () => ({
  replaceClassLabelsOnThread: vi.fn().mockResolvedValue({
    removed: [],
    applied: 'MrGru/financial/receipt',
  }),
}));

vi.mock('./db.js', () => ({
  setRouterState: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { query, withTransaction } from './business-db.js';
import { replaceClassLabelsOnThread } from './gmail-labels.js';
import { setRouterState } from './db.js';
import {
  parseClassificationLesson,
  isClassificationLesson,
  dryRunClassificationLesson,
  handleClassificationLesson,
  sweepExpiredBackfills,
  DEFAULT_BACKFILL_CAP,
} from './classify-backfill.js';

const mockQuery = query as unknown as ReturnType<typeof vi.fn>;
const mockWithTx = withTransaction as unknown as ReturnType<typeof vi.fn>;
const mockReplace = replaceClassLabelsOnThread as unknown as ReturnType<
  typeof vi.fn
>;
const mockSetRouter = setRouterState as unknown as ReturnType<typeof vi.fn>;

function lesson(overrides: Partial<Record<string, any>> = {}) {
  return {
    type: 'route_lesson' as const,
    groupFolder: 'chief',
    target_agents: ['mailman'],
    title: 'Spark receipts',
    problem: 'Previous classification was wrong',
    rule: 'When sender is receipts@spark.app, classify as MrGru/financial/receipt',
    ...overrides,
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockWithTx.mockClear();
  mockReplace.mockReset();
  mockSetRouter.mockReset();
});

describe('parseClassificationLesson', () => {
  it('parses sender_exact pattern', () => {
    const p = parseClassificationLesson(
      'Spark receipts',
      'When sender is receipts@spark.app, classify as MrGru/financial/receipt',
    );
    expect(p).toEqual({
      pattern_type: 'sender_exact',
      pattern_value: 'receipts@spark.app',
      target_label: 'MrGru/financial/receipt',
    });
  });

  it('parses sender_regex pattern', () => {
    const p = parseClassificationLesson(
      'Stripe family',
      'When sender matches /@stripe\\.com$/ classify as MrGru/financial/receipt',
    );
    expect(p?.pattern_type).toBe('sender_regex');
    expect(p?.pattern_value).toBe('@stripe\\.com$');
  });

  it('parses subject_regex pattern', () => {
    const p = parseClassificationLesson(
      'Calendar invites',
      'When subject matches /Invite:/ classify as MrGru/notification/calendar',
    );
    expect(p?.pattern_type).toBe('subject_regex');
    expect(p?.target_label).toBe('MrGru/notification/calendar');
  });

  it('returns null for unparseable text', () => {
    expect(
      parseClassificationLesson('x', 'random text about nothing'),
    ).toBeNull();
    expect(parseClassificationLesson('x', '')).toBeNull();
  });
});

describe('isClassificationLesson', () => {
  it('returns true for parseable rules and false otherwise', () => {
    expect(
      isClassificationLesson(
        'x',
        'When sender is a@b.co, classify as MrGru/financial/receipt',
      ),
    ).toBe(true);
    expect(isClassificationLesson('x', 'nope')).toBe(false);
  });
});

describe('handleClassificationLesson', () => {
  it('warns + returns on unparseable rule', async () => {
    await handleClassificationLesson(lesson({ rule: 'no pattern here' }));
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns when target_label is not in taxonomy', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // taxonomy check
    await handleClassificationLesson(lesson());
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('inserts rule and returns when 0 matches', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ label: 'MrGru/financial/receipt' }],
      }) // taxonomy
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // insert rule
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // dry-run
    await handleClassificationLesson(lesson());
    expect(mockWithTx).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('applies batch under the cap and replaces labels per thread', async () => {
    const matches = [
      {
        gmail_message_id: 'm1',
        gmail_thread_id: 't1',
        label: 'MrGru/newsletter/general',
      },
      {
        gmail_message_id: 'm2',
        gmail_thread_id: 't1',
        label: 'MrGru/newsletter/general',
      },
      {
        gmail_message_id: 'm3',
        gmail_thread_id: 't2',
        label: 'MrGru/newsletter/general',
      },
    ];
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ label: 'MrGru/financial/receipt' }],
      }) // taxonomy
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // insert rule
      .mockResolvedValueOnce({
        rowCount: 3,
        rows: matches.map((m) => ({ gmail_message_id: m.gmail_message_id })),
      }) // dry-run count
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '100' }] }) // total
      .mockResolvedValueOnce({ rowCount: 3, rows: matches }); // fetchMatches
    await handleClassificationLesson(lesson());
    expect(mockWithTx).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledTimes(2); // 2 unique threads
    expect(mockSetRouter).toHaveBeenCalledTimes(3); // write marker per message
  });

  it('inserts pending backfill row when over cap', async () => {
    const count = DEFAULT_BACKFILL_CAP + 10;
    const fakeMatches = Array.from({ length: count }, (_, i) => ({
      gmail_message_id: `m${i}`,
    }));
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ label: 'MrGru/financial/receipt' }],
      }) // taxonomy
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // insert rule
      .mockResolvedValueOnce({ rowCount: count, rows: fakeMatches.slice(0, 5) }) // dry-run
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '1000' }] }) // total (count/total < 20%)
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 99 }] }); // insert pending
    await handleClassificationLesson(lesson());
    const lastCall = mockQuery.mock.calls.at(-1)![0] as string;
    expect(lastCall).toMatch(/INSERT INTO classification_backfill_pending/);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('trips the >20% guard and skips without pending row', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ label: 'MrGru/financial/receipt' }],
      }) // taxonomy
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // insert rule
      .mockResolvedValueOnce({ rowCount: 30, rows: [] }) // dry-run
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '100' }] }); // total (30/100 = 30% > 20%)
    await handleClassificationLesson(lesson());
    expect(mockReplace).not.toHaveBeenCalled();
    // No pending-row insert either
    const allSql = mockQuery.mock.calls.map((c) => c[0] as string).join('\n');
    expect(allSql).not.toMatch(/INSERT INTO classification_backfill_pending/);
  });

  it('override flag bypasses the >20% guard', async () => {
    const matches = [
      {
        gmail_message_id: 'm1',
        gmail_thread_id: 't1',
        label: 'MrGru/newsletter/general',
      },
    ];
    mockQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ label: 'MrGru/financial/receipt' }],
      }) // taxonomy
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // insert rule
      .mockResolvedValueOnce({ rowCount: 1, rows: matches }) // dry-run
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '2' }] }) // total (1/2 = 50%)
      .mockResolvedValueOnce({ rowCount: 1, rows: matches }); // fetchMatches
    await handleClassificationLesson(
      lesson({ context: JSON.stringify({ override: true }) }),
    );
    expect(mockWithTx).toHaveBeenCalledTimes(1);
  });
});

describe('dryRunClassificationLesson', () => {
  it('returns projected_matches and up to 5 sample ids', async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 7,
      rows: Array.from({ length: 7 }, (_, i) => ({
        gmail_message_id: `m${i}`,
      })),
    });
    const res = await dryRunClassificationLesson({
      pattern_type: 'sender_exact',
      pattern_value: 'a@b.co',
      target_label: 'MrGru/financial/receipt',
    });
    expect(res.projected_matches).toBe(7);
    expect(res.sample_ids.length).toBe(5);
  });
});

describe('sweepExpiredBackfills', () => {
  it('returns the number of rows marked expired', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 4, rows: [] });
    const n = await sweepExpiredBackfills();
    expect(n).toBe(4);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toMatch(/UPDATE classification_backfill_pending/);
    expect(sql).toMatch(/status = 'expired'/);
  });

  it('returns 0 when nothing expired', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    expect(await sweepExpiredBackfills()).toBe(0);
  });
});
