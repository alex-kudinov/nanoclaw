import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  _initTestDatabase,
  getAutonomyTrust,
  getOpenAutonomyPendings,
  setRouterState,
  storeChatMetadata,
  storeMessage,
  upsertAutonomyTrust,
} from './db.js';
import {
  autonomyTick,
  handleVetoReaction,
  type AutonomyDeps,
} from './autonomy-hold.js';
import type { NewMessage } from './types.js';

const JID = 'slack:CSALES';
const THREAD = '1000.100';

function msg(over: Partial<NewMessage>): NewMessage {
  return {
    id: over.id ?? `m-${Math.random()}`,
    chat_jid: JID,
    sender: 'U1',
    sender_name: 'Alex',
    content: '',
    timestamp: '2026-07-06T15:00:00.000Z',
    is_from_me: false,
    is_bot_message: false,
    from_group: undefined,
    thread_ts: THREAD,
    ...over,
  } as NewMessage;
}

function draft(id: string, ts: string): NewMessage {
  return msg({
    id,
    timestamp: ts,
    is_from_me: true,
    from_group: 'sales',
    content:
      'Entry ID: 42\nCategory: enrollment\n\nDRAFT RESPONSE TO LEAD:\nHi there…',
  });
}

function l2Trust(): void {
  upsertAutonomyTrust({
    group_folder: 'sales',
    category: 'enrollment',
    level: 2,
    streak: 15,
    drafts: 15,
    approved_clean: 15,
    corrected: 0,
    vetoed: 0,
    auto_approved: 0,
    updated_at: null,
  });
}

function makeDeps(): AutonomyDeps & {
  sent: Array<{ jid: string; text: string }>;
  injected: NewMessage[];
} {
  const sent: Array<{ jid: string; text: string }> = [];
  const injected: NewMessage[] = [];
  return {
    sent,
    injected,
    sendMessage: vi.fn(async (jid: string, text: string) => {
      sent.push({ jid, text });
    }),
    injectMessage: (m: NewMessage) => {
      injected.push(m);
      storeMessage(m);
    },
    registeredGroups: () => ({ [JID]: { folder: 'sales' } }),
  };
}

beforeEach(() => {
  _initTestDatabase();
  storeChatMetadata(JID, '2026-07-06T00:00:00.000Z', '#gru-sales');
  setRouterState('autonomy_wm_sales', '2026-07-06T00:00:00.000Z');
});

describe('autonomy hold-and-send', () => {
  it('starts a hold + posts a notice for an L2-category draft', async () => {
    l2Trust();
    storeMessage(draft('d1', '2026-07-06T14:00:00.000Z'));
    const deps = makeDeps();
    await autonomyTick(deps, new Date('2026-07-06T15:00:00.000Z')); // 10:00 CDT
    const open = getOpenAutonomyPendings();
    expect(open).toHaveLength(1);
    expect(open[0].draft_id).toBe('d1');
    expect(deps.sent.some((s) => s.text.includes('Autonomy L2'))).toBe(true);
  });

  it('fires the auto-approval after expiry with no operator activity', async () => {
    l2Trust();
    storeMessage(draft('d1', '2026-07-06T14:00:00.000Z'));
    const deps = makeDeps();
    await autonomyTick(deps, new Date('2026-07-06T15:00:00.000Z'));
    // window is 120min → expires 17:00Z (12:00 CDT); tick at 17:30Z
    await autonomyTick(deps, new Date('2026-07-06T17:30:00.000Z'));
    expect(deps.injected).toHaveLength(1);
    expect(deps.injected[0].content).toContain('✅ Auto-approved');
    expect(deps.injected[0].thread_ts).toBe(THREAD);
    expect(getOpenAutonomyPendings()).toHaveLength(0);
    expect(getAutonomyTrust('sales', 'enrollment')!.auto_approved).toBe(1);
  });

  it('cancels the hold when an operator replies in-thread before expiry', async () => {
    l2Trust();
    storeMessage(draft('d1', '2026-07-06T14:00:00.000Z'));
    const deps = makeDeps();
    await autonomyTick(deps, new Date('2026-07-06T15:00:00.000Z'));
    storeMessage(
      msg({
        id: 'f1',
        timestamp: '2026-07-06T16:00:00.000Z',
        content: 'hold on — rework the second paragraph',
      }),
    );
    await autonomyTick(deps, new Date('2026-07-06T17:30:00.000Z'));
    expect(deps.injected).toHaveLength(0);
    expect(getOpenAutonomyPendings()).toHaveLength(0);
  });

  it('does not fire when a human already ✅-approved (no double approval)', async () => {
    l2Trust();
    storeMessage(draft('d1', '2026-07-06T14:00:00.000Z'));
    const deps = makeDeps();
    await autonomyTick(deps, new Date('2026-07-06T15:00:00.000Z'));
    storeMessage(
      msg({
        id: 'a1',
        timestamp: '2026-07-06T16:00:00.000Z',
        content: '✅ Approved by Alex.',
      }),
    );
    await autonomyTick(deps, new Date('2026-07-06T17:30:00.000Z'));
    expect(deps.injected).toHaveLength(0);
  });

  it('👎 veto cancels the hold and demotes the category to L1', async () => {
    l2Trust();
    storeMessage(draft('d1', '2026-07-06T14:00:00.000Z'));
    const deps = makeDeps();
    await autonomyTick(deps, new Date('2026-07-06T15:00:00.000Z'));
    const claimed = await handleVetoReaction(
      deps,
      'd1',
      'Alex',
      new Date('2026-07-06T16:00:00.000Z'),
    );
    expect(claimed).toBe(true);
    expect(getOpenAutonomyPendings()).toHaveLength(0);
    const t = getAutonomyTrust('sales', 'enrollment')!;
    expect(t.level).toBe(1);
    expect(t.vetoed).toBe(1);
    expect(t.streak).toBe(0);
    expect(deps.sent.some((s) => s.text.includes('vetoed'))).toBe(true);
  });

  it('👎 on an unrelated message is not claimed', async () => {
    const deps = makeDeps();
    expect(await handleVetoReaction(deps, 'unknown-ts', 'Alex')).toBe(false);
  });
});
