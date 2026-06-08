import { describe, it, expect } from 'vitest';
import { excludeOwnGroupMessages, isUntaggedBotNoise } from './router.js';
import type { NewMessage } from './types.js';

function msg(overrides: Partial<NewMessage>): NewMessage {
  return {
    id: 'm1',
    chat_jid: 'slack:C1',
    sender: 'someone',
    sender_name: 'Someone',
    content: 'hello',
    timestamp: new Date().toISOString(),
    is_from_me: false,
    is_bot_message: false,
    ...overrides,
  } as NewMessage;
}

describe('excludeOwnGroupMessages (live-pipe leak guard)', () => {
  it('drops own-group host-tagged rows from the threadMessages fallback', () => {
    const batch: NewMessage[] = [
      msg({
        id: 'genuine',
        content: 'real user message',
        from_group: undefined,
      }),
      msg({
        id: 'own-echo',
        content: '→ Routed to sales',
        from_group: 'sales',
      }),
    ];
    const out = excludeOwnGroupMessages(batch, 'sales');
    expect(out.map((m) => m.id)).toEqual(['genuine']);
    expect(out.some((m) => m.from_group === 'sales')).toBe(false);
  });

  it('keeps messages tagged with a different group (cross-group context)', () => {
    const batch: NewMessage[] = [
      msg({ id: 'from-chief', from_group: 'chief' }),
      msg({ id: 'from-sales', from_group: 'sales' }),
    ];
    const out = excludeOwnGroupMessages(batch, 'sales');
    expect(out.map((m) => m.id)).toEqual(['from-chief']);
  });

  it('keeps untagged user messages', () => {
    const batch: NewMessage[] = [msg({ id: 'u1' }), msg({ id: 'u2' })];
    expect(excludeOwnGroupMessages(batch, 'sales')).toHaveLength(2);
  });
});

describe('isUntaggedBotNoise (spawn guard)', () => {
  const ASSISTANT = 'Mr Gru';

  it('treats a self-echo with no from_group as noise', () => {
    const m = msg({ sender_name: ASSISTANT, from_group: undefined });
    expect(isUntaggedBotNoise(m, ASSISTANT)).toBe(true);
  });

  it('does NOT treat a bot-delivered cross-group handoff as noise', () => {
    // [HANDOFF: inbox→sales] lands in the sales channel posted by the bot
    // (sender_name=ASSISTANT) but tagged from_group=inbox — it must spawn.
    const handoff = msg({
      content: '[HANDOFF: inbox→sales]\nParty ID: 10126',
      sender_name: ASSISTANT,
      from_group: 'inbox',
    });
    expect(isUntaggedBotNoise(handoff, ASSISTANT)).toBe(false);
  });

  it('does NOT treat a human message as noise', () => {
    const human = msg({ sender_name: 'Alex', from_group: undefined });
    expect(isUntaggedBotNoise(human, ASSISTANT)).toBe(false);
  });

  it('a handoff batch is not all-noise, so the spawn guard lets it through', () => {
    const batch: NewMessage[] = [
      msg({
        content: '[HANDOFF: inbox→sales]',
        sender_name: ASSISTANT,
        from_group: 'inbox',
      }),
    ];
    expect(batch.every((m) => isUntaggedBotNoise(m, ASSISTANT))).toBe(false);
  });
});
