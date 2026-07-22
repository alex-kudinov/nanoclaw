import { describe, it, expect, vi } from 'vitest';
import {
  parseFollowupLeadId,
  handleFollowupDrop,
  type FollowupCard,
} from './followup-drop.js';

describe('parseFollowupLeadId', () => {
  it('extracts the id from a FOLLOW-UP #1 card', () => {
    expect(
      parseFollowupLeadId('[FOLLOW-UP #1] Lead #243\nCategory: followup'),
    ).toBe(243);
  });

  it('extracts from FOLLOW-UP #2 too', () => {
    expect(parseFollowupLeadId('[FOLLOW-UP #2] Lead #354')).toBe(354);
  });

  it('ignores a SALES REVIEW card (a first-reply draft, not a follow-up)', () => {
    expect(parseFollowupLeadId('[SALES REVIEW] Lead #243')).toBeNull();
  });

  it('ignores a COLD card (already advanced to lost)', () => {
    expect(parseFollowupLeadId('[COLD] Lead #243 — no response')).toBeNull();
  });

  it('ignores unrelated bot text', () => {
    expect(parseFollowupLeadId('Certificate issued ✓ for Lead #5')).toBeNull();
  });

  it('rejects a zero / malformed id', () => {
    expect(parseFollowupLeadId('[FOLLOW-UP #1] Lead #0')).toBeNull();
  });
});

describe('handleFollowupDrop', () => {
  const cardText = '[FOLLOW-UP #1] Lead #243\nKimberley Young | k@example.com';

  function deps(card: FollowupCard | undefined) {
    return {
      getCard: vi.fn(() => card),
      moveToNurture: vi.fn(async () => undefined),
      postThread: vi.fn(async () => undefined),
    };
  }

  it('moves the entry to nurture and confirms in-thread', async () => {
    const d = deps({
      content: cardText,
      from_group: 'sales',
      chat_jid: 'slack:C0AKPNJ7MDW',
    });
    const acted = await handleFollowupDrop('171.1', 'Alex', d);
    expect(acted).toBe(true);
    expect(d.moveToNurture).toHaveBeenCalledWith(
      243,
      expect.stringContaining('Alex'),
    );
    expect(d.postThread).toHaveBeenCalledWith(
      'slack:C0AKPNJ7MDW',
      '171.1',
      expect.stringContaining('#243'),
    );
  });

  it('no-ops when the card is unknown (reaction on some other message)', async () => {
    const d = deps(undefined);
    expect(await handleFollowupDrop('x', 'Alex', d)).toBe(false);
    expect(d.moveToNurture).not.toHaveBeenCalled();
  });

  it('no-ops when the card is not from the sales group', async () => {
    const d = deps({
      content: cardText,
      from_group: 'certifier',
      chat_jid: 'slack:x',
    });
    expect(await handleFollowupDrop('x', 'Alex', d)).toBe(false);
    expect(d.moveToNurture).not.toHaveBeenCalled();
  });

  it('no-ops on a non-follow-up sales card (e.g. SALES REVIEW)', async () => {
    const d = deps({
      content: '[SALES REVIEW] Lead #243',
      from_group: 'sales',
      chat_jid: 'slack:x',
    });
    expect(await handleFollowupDrop('x', 'Alex', d)).toBe(false);
    expect(d.moveToNurture).not.toHaveBeenCalled();
  });
});
