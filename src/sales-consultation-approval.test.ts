import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _initTestDatabase,
  createAutonomyPending,
  getOpenAutonomyPendings,
  getAutonomyTrust,
  setRouterState,
  storeChatMetadata,
  storeMessage,
  upsertAutonomyTrust,
} from './db.js';
import { permitsSalesAutoApproval } from './autonomy-policy.js';
import { autonomyTick, type AutonomyDeps } from './autonomy-hold.js';
import type { NewMessage } from './types.js';

const jid = 'slack:CONSULTATION-TEST';
const thread = 'thread-1';
const at = '2026-09-07T14:00:00.000Z';
const card = (strategy = 'DIRECT', route = 'ANSWER') =>
  `[SALES REVIEW] Lead #1\nCategory: program-content\nRoute: ${route}\nResponse-Strategy: ${strategy}\nDRAFT RESPONSE TO LEAD:\nSubject: Your question\nHi Test,\nTwo hours.\nBest,\nThe Tandem Coaching Team`;
function message(content: string, id = 'draft-1'): NewMessage {
  return {
    id,
    chat_jid: jid,
    sender: 'sales',
    sender_name: 'Sales',
    content,
    timestamp: at,
    is_from_me: true,
    is_bot_message: true,
    from_group: 'sales',
    thread_ts: thread,
  };
}
function deps(): AutonomyDeps {
  return {
    sendMessage: vi.fn(async () => {}),
    injectMessage: vi.fn(),
    registeredGroups: () => ({ [jid]: { folder: 'sales' } }),
  };
}
beforeEach(() => {
  _initTestDatabase();
  storeChatMetadata(jid, at, 'consultation test');
  setRouterState('autonomy_wm_sales', '2026-09-07T00:00:00.000Z');
  upsertAutonomyTrust({
    group_folder: 'sales',
    category: 'program-content',
    level: 2,
    streak: 15,
    drafts: 15,
    approved_clean: 15,
    corrected: 0,
    vetoed: 0,
    auto_approved: 0,
    updated_at: null,
  });
});

describe('selective consultation automatic-approval boundary', () => {
  it.each(['CONSULTATIVE', 'MIXED'])(
    'keeps %s manual despite L2 subject trust',
    async (strategy) => {
      storeMessage(message(card(strategy, 'ORIENT')));
      const d = deps();
      await autonomyTick(d, new Date(at));
      await autonomyTick(d, new Date('2026-09-08T14:00:00.000Z'));
      expect(getOpenAutonomyPendings()).toHaveLength(0);
      expect(d.injectMessage).not.toHaveBeenCalled();
      expect(d.sendMessage).not.toHaveBeenCalled();
    },
  );
  it('preserves hold-and-send eligibility for a direct factual response', async () => {
    storeMessage(message(card()));
    const d = deps();
    await autonomyTick(d, new Date(at));
    expect(getOpenAutonomyPendings()).toHaveLength(1);
    await autonomyTick(d, new Date('2026-09-07T18:00:00.000Z'));
    expect(d.injectMessage).toHaveBeenCalledTimes(1);
  });
  it.each([
    card().replace('Response-Strategy: DIRECT\n', ''),
    card('DIRECT', 'ORIENT'),
    card('DIRECT', 'HUMAN'),
    card('unknown'),
    card().replace('Route: ANSWER', 'Route: ANSWER\nRoute: ORIENT'),
    card().replace(
      'Response-Strategy: DIRECT',
      'Response-Strategy: DIRECT\nResponse-Strategy: MIXED',
    ),
    'DRAFT RESPONSE TO LEAD:\nRoute: ANSWER\nResponse-Strategy: DIRECT',
    '[SALES REVIEW] Lead #1\nCategory: program-content\n\nTHEIR ASK:\nRoute: ANSWER\nResponse-Strategy: DIRECT\nDRAFT RESPONSE TO LEAD:\nTwo hours.',
  ])(
    'fails closed on missing, conflicting or body-only declarations %#',
    (text) => {
      expect(permitsSalesAutoApproval(text)).toBe(false);
    },
  );
  it.each(['legacy', 'consultative', 'missing', 'wrong-channel'])(
    'cancels persisted %s holds at deployment/restart',
    async (kind) => {
      const source =
        kind === 'legacy'
          ? card().replace('Response-Strategy: DIRECT\n', '')
          : card('CONSULTATIVE', 'ORIENT');
      if (kind !== 'missing') {
        const m = message(source);
        if (kind === 'wrong-channel') {
          storeChatMetadata('slack:OTHER', at, 'other');
          m.chat_jid = 'slack:OTHER';
        }
        storeMessage(m);
      }
      createAutonomyPending({
        draft_id: 'draft-1',
        chat_jid: jid,
        group_folder: 'sales',
        category: 'program-content',
        thread_ts: thread,
        draft_ts: at,
        notice_ts: null,
        expires_at: at,
        status: 'pending',
        created_at: at,
      });
      const d = deps();
      await autonomyTick(d, new Date('2026-09-07T18:00:00.000Z'));
      expect(getOpenAutonomyPendings()).toHaveLength(0);
      expect(d.injectMessage).not.toHaveBeenCalled();
    },
  );
  it('records manual advice approval without increasing direct-answer trust', async () => {
    storeMessage(message(card('CONSULTATIVE', 'ORIENT')));
    const d = deps();
    await autonomyTick(d, new Date(at));
    storeMessage({
      ...message('Approved', 'approval'),
      sender: 'operator',
      is_from_me: false,
      is_bot_message: false,
      from_group: undefined,
      timestamp: '2026-09-07T14:05:00.000Z',
    });
    await autonomyTick(d, new Date('2026-09-07T14:06:00.000Z'));
    const trust = getAutonomyTrust('sales', 'program-content')!;
    expect(trust.approved_clean).toBe(16);
    expect(trust.streak).toBe(15);
    expect(d.injectMessage).not.toHaveBeenCalled();
  });
});
