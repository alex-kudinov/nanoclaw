import { describe, it, expect, beforeEach } from 'vitest';

import {
  _initTestDatabase,
  getAutonomyTrust,
  setRouterState,
  storeChatMetadata,
  storeMessage,
  upsertAutonomyTrust,
} from './db.js';
import { ingest } from './autonomy-ledger.js';
import { PROMOTE_STREAK } from './autonomy-policy.js';
import type { NewMessage } from './types.js';

const JID = 'slack:CSALES';
const GROUPS = [{ folder: 'sales', jid: JID }];
const THREAD = '1000.100';

function msg(over: Partial<NewMessage>): NewMessage {
  return {
    id: over.id ?? `m-${Math.random()}`,
    chat_jid: JID,
    sender: 'U1',
    sender_name: 'Alex',
    content: '',
    timestamp: '2026-07-02T12:00:00.000Z',
    is_from_me: false,
    is_bot_message: false,
    from_group: undefined,
    thread_ts: THREAD,
    ...over,
  } as NewMessage;
}

function draft(id: string, ts: string, category = 'enrollment'): NewMessage {
  return msg({
    id,
    timestamp: ts,
    is_from_me: true,
    from_group: 'sales',
    content: `Entry ID: 42\nCategory: ${category}\n\nDRAFT RESPONSE TO LEAD:\nHi there…`,
  });
}

beforeEach(() => {
  _initTestDatabase();
  storeChatMetadata(JID, '2026-07-01T00:00:00.000Z', '#gru-sales');
  // Skip first-run watermark seeding; scan from a fixed past instant.
  setRouterState('autonomy_wm_sales', '2026-07-01T00:00:00.000Z');
});

describe('autonomy ledger', () => {
  it('records a new draft as pending and counts it', () => {
    storeMessage(draft('d1', '2026-07-02T10:00:00.000Z'));
    const res = ingest(GROUPS, new Date('2026-07-02T10:05:00.000Z'));
    expect(res.newL2Drafts).toEqual([]); // L1 by default
    const t = getAutonomyTrust('sales', 'enrollment')!;
    expect(t.drafts).toBe(1);
    expect(t.streak).toBe(0);
  });

  it('resolves approved_clean and builds streak', () => {
    storeMessage(draft('d1', '2026-07-02T10:00:00.000Z'));
    storeMessage(
      msg({
        id: 'a1',
        timestamp: '2026-07-02T10:30:00.000Z',
        content: '✅ Approved by Alex.',
      }),
    );
    ingest(GROUPS, new Date('2026-07-02T11:00:00.000Z'));
    const t = getAutonomyTrust('sales', 'enrollment')!;
    expect(t.approved_clean).toBe(1);
    expect(t.streak).toBe(1);
    expect(t.level).toBe(1);
  });

  it('resolves corrected when operator feedback precedes approval, and demotes', () => {
    upsertAutonomyTrust({
      group_folder: 'sales',
      category: 'enrollment',
      level: 2,
      streak: 20,
      drafts: 20,
      approved_clean: 20,
      corrected: 0,
      vetoed: 0,
      auto_approved: 0,
      updated_at: null,
    });
    storeMessage(draft('d1', '2026-07-02T10:00:00.000Z'));
    storeMessage(
      msg({
        id: 'f1',
        timestamp: '2026-07-02T10:10:00.000Z',
        content: 'shorten this and drop the second paragraph',
      }),
    );
    storeMessage(
      msg({
        id: 'a1',
        timestamp: '2026-07-02T10:30:00.000Z',
        content: '✅ Approved by Alex.',
      }),
    );
    ingest(GROUPS, new Date('2026-07-02T11:00:00.000Z'));
    const t = getAutonomyTrust('sales', 'enrollment')!;
    expect(t.corrected).toBe(1);
    expect(t.streak).toBe(0);
    expect(t.level).toBe(1); // demoted from L2
  });

  it('promotes to L2 at the streak threshold', () => {
    upsertAutonomyTrust({
      group_folder: 'sales',
      category: 'enrollment',
      level: 1,
      streak: PROMOTE_STREAK - 1,
      drafts: PROMOTE_STREAK - 1,
      approved_clean: PROMOTE_STREAK - 1,
      corrected: 0,
      vetoed: 0,
      auto_approved: 0,
      updated_at: null,
    });
    storeMessage(draft('d1', '2026-07-02T10:00:00.000Z'));
    storeMessage(
      msg({
        id: 'a1',
        timestamp: '2026-07-02T10:30:00.000Z',
        content: '✅ Approved by Alex.',
      }),
    );
    const res = ingest(GROUPS, new Date('2026-07-02T11:00:00.000Z'));
    expect(res.promotions).toHaveLength(1);
    expect(res.promotions[0].category).toBe('enrollment');
    expect(getAutonomyTrust('sales', 'enrollment')!.level).toBe(2);
  });

  it('never promotes a guarded category', () => {
    upsertAutonomyTrust({
      group_folder: 'sales',
      category: 'pricing',
      level: 1,
      streak: PROMOTE_STREAK + 5,
      drafts: 30,
      approved_clean: 30,
      corrected: 0,
      vetoed: 0,
      auto_approved: 0,
      updated_at: null,
    });
    storeMessage(draft('d1', '2026-07-02T10:00:00.000Z', 'pricing'));
    storeMessage(
      msg({
        id: 'a1',
        timestamp: '2026-07-02T10:30:00.000Z',
        content: '✅ Approved by Alex.',
      }),
    );
    const res = ingest(GROUPS, new Date('2026-07-02T11:00:00.000Z'));
    expect(res.promotions).toEqual([]);
    expect(getAutonomyTrust('sales', 'pricing')!.level).toBe(1);
  });

  it('returns newL2Drafts for a category already at L2 (unguarded only)', () => {
    for (const [cat, level] of [
      ['enrollment', 2],
      ['pricing', 2], // guarded — must NOT hold even if somehow L2
    ] as const) {
      upsertAutonomyTrust({
        group_folder: 'sales',
        category: cat,
        level,
        streak: 0,
        drafts: 0,
        approved_clean: 0,
        corrected: 0,
        vetoed: 0,
        auto_approved: 0,
        updated_at: null,
      });
    }
    storeMessage(draft('d1', '2026-07-02T10:00:00.000Z', 'enrollment'));
    storeMessage(draft('d2', '2026-07-02T10:01:00.000Z', 'pricing'));
    const res = ingest(GROUPS, new Date('2026-07-02T10:05:00.000Z'));
    expect(res.newL2Drafts.map((d) => d.draft_id)).toEqual(['d1']);
  });

  it('marks a draft superseded by a newer draft without penalty', () => {
    storeMessage(draft('d1', '2026-07-02T10:00:00.000Z'));
    storeMessage(draft('d2', '2026-07-02T10:20:00.000Z'));
    ingest(GROUPS, new Date('2026-07-02T11:00:00.000Z'));
    const t = getAutonomyTrust('sales', 'enrollment')!;
    expect(t.drafts).toBe(2);
    expect(t.corrected).toBe(0);
    expect(t.streak).toBe(0);
  });

  it('ignores bot noise (handoff echoes) when classifying', () => {
    storeMessage(draft('d1', '2026-07-02T10:00:00.000Z'));
    storeMessage(
      msg({
        id: 'echo1',
        timestamp: '2026-07-02T10:05:00.000Z',
        is_bot_message: true,
        content: '[HANDOFF: mailman→sales] some echo',
      }),
    );
    storeMessage(
      msg({
        id: 'a1',
        timestamp: '2026-07-02T10:30:00.000Z',
        content: '✅ Approved by Alex.',
      }),
    );
    ingest(GROUPS, new Date('2026-07-02T11:00:00.000Z'));
    const t = getAutonomyTrust('sales', 'enrollment')!;
    expect(t.approved_clean).toBe(1);
    expect(t.corrected).toBe(0);
  });

  it('expires an unanswered draft after 72h without penalty', () => {
    storeMessage(draft('d1', '2026-07-02T10:00:00.000Z'));
    ingest(GROUPS, new Date('2026-07-06T11:00:00.000Z'));
    const t = getAutonomyTrust('sales', 'enrollment')!;
    expect(t.streak).toBe(0);
    expect(t.corrected).toBe(0);
    expect(t.approved_clean).toBe(0);
  });
});
