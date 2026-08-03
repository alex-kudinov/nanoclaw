import { describe, it, expect, beforeEach, vi } from 'vitest';

import { _initTestDatabase, getAllChats, storeChatMetadata } from './db.js';
import {
  getAvailableGroups,
  _setRegisteredGroups,
  threadKeyFor,
  usesThreadPerMessage,
  withSalesThreadPerMessage,
  migrateSalesThreadPerMessageConfig,
  seedSalesThreadWorkUnitCursors,
} from './index.js';
import type { RegisteredGroup } from './types.js';

beforeEach(() => {
  _initTestDatabase();
  _setRegisteredGroups({});
});

// --- JID ownership patterns ---

describe('JID ownership patterns', () => {
  // These test the patterns that will become ownsJid() on the Channel interface

  it('WhatsApp group JID: ends with @g.us', () => {
    const jid = '12345678@g.us';
    expect(jid.endsWith('@g.us')).toBe(true);
  });

  it('WhatsApp DM JID: ends with @s.whatsapp.net', () => {
    const jid = '12345678@s.whatsapp.net';
    expect(jid.endsWith('@s.whatsapp.net')).toBe(true);
  });

  it('Slack channel JID: starts with slack:', () => {
    const jid = 'slack:C0123456789';
    expect(jid.startsWith('slack:')).toBe(true);
  });

  it('Slack DM JID: starts with slack:D', () => {
    const jid = 'slack:D0123456789';
    expect(jid.startsWith('slack:')).toBe(true);
  });
});

describe('Sales work-unit routing', () => {
  const rootMessage = {
    id: '1785763378.077589',
    chat_jid: 'slack:SALES',
    sender: 'bot',
    sender_name: 'Mr Gru',
    content: '[HANDOFF: mailman→sales]\nEmail: lead@example.com',
    timestamp: '2026-08-03T13:42:18.077Z',
    is_bot_message: true,
    from_group: 'mailman',
  };

  it('makes every Sales root a first-class per-message work unit', () => {
    const sales = {
      name: 'Sales',
      folder: 'sales',
      trigger: '@Gru',
      added_at: '2026-08-03T00:00:00Z',
    };
    const migrated = withSalesThreadPerMessage(sales);
    expect(usesThreadPerMessage(migrated)).toBe(true);
    expect(threadKeyFor(rootMessage, migrated)).toBe(rootMessage.id);
  });

  it('fails closed when the persisted Sales config does not retain thread isolation', () => {
    const sales: RegisteredGroup = {
      name: 'Sales',
      folder: 'sales',
      trigger: '@Gru',
      added_at: '2026-08-03T00:00:00Z',
    };
    const persist = vi.fn();
    expect(() =>
      migrateSalesThreadPerMessageConfig(
        { 'slack:SALES': sales },
        persist,
        () => ({ 'slack:SALES': sales }),
      ),
    ).toThrow(/missing required threadPerMessage isolation/);
    expect(persist).toHaveBeenCalledWith(
      'slack:SALES',
      expect.objectContaining({
        containerConfig: expect.objectContaining({ threadPerMessage: true }),
      }),
    );
  });

  it('maps a later human reply to the same Sales work-unit key', () => {
    const sales = {
      name: 'Sales',
      folder: 'sales',
      trigger: '@Gru',
      added_at: '2026-08-03T00:00:00Z',
      containerConfig: { threadPerMessage: true },
    };
    expect(
      threadKeyFor(
        {
          ...rootMessage,
          id: '1785765657.454000',
          thread_ts: rootMessage.id,
          from_group: undefined,
          is_bot_message: false,
        },
        sales,
      ),
    ).toBe(rootMessage.id);
  });

  it('seeds legacy Sales roots without rolling back an existing newer cursor', () => {
    const cursors: Record<string, string> = {
      'slack:SALES||root-a': '2026-08-03T13:00:05.000Z',
    };
    const changed = seedSalesThreadWorkUnitCursors(
      'slack:SALES',
      '2026-08-03T13:00:10.000Z',
      [
        {
          ...rootMessage,
          id: 'root-a',
          timestamp: '2026-08-03T13:00:00.000Z',
        },
        {
          ...rootMessage,
          id: 'root-b',
          timestamp: '2026-08-03T13:00:09.000Z',
        },
        {
          ...rootMessage,
          id: 'root-new',
          timestamp: '2026-08-03T13:00:11.000Z',
        },
      ],
      cursors,
    );
    expect(changed).toBe(1);
    expect(cursors).toEqual({
      'slack:SALES||root-a': '2026-08-03T13:00:05.000Z',
      'slack:SALES||root-b': '2026-08-03T13:00:09.000Z',
    });
  });

  it('does not change an ordinary root-bucket group', () => {
    const chief = {
      name: 'Chief',
      folder: 'chief',
      trigger: '@Gru',
      added_at: '2026-08-03T00:00:00Z',
    };
    expect(usesThreadPerMessage(chief)).toBe(false);
    expect(threadKeyFor(rootMessage, chief)).toBe('root');
  });
});

// --- getAvailableGroups ---

describe('getAvailableGroups', () => {
  it('returns only groups, excludes DMs', () => {
    storeChatMetadata(
      'group1@g.us',
      '2024-01-01T00:00:01.000Z',
      'Group 1',
      'whatsapp',
      true,
    );
    storeChatMetadata(
      'user@s.whatsapp.net',
      '2024-01-01T00:00:02.000Z',
      'User DM',
      'whatsapp',
      false,
    );
    storeChatMetadata(
      'group2@g.us',
      '2024-01-01T00:00:03.000Z',
      'Group 2',
      'whatsapp',
      true,
    );

    const groups = getAvailableGroups();
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.jid)).toContain('group1@g.us');
    expect(groups.map((g) => g.jid)).toContain('group2@g.us');
    expect(groups.map((g) => g.jid)).not.toContain('user@s.whatsapp.net');
  });

  it('excludes __group_sync__ sentinel', () => {
    storeChatMetadata('__group_sync__', '2024-01-01T00:00:00.000Z');
    storeChatMetadata(
      'group@g.us',
      '2024-01-01T00:00:01.000Z',
      'Group',
      'whatsapp',
      true,
    );

    const groups = getAvailableGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].jid).toBe('group@g.us');
  });

  it('marks registered groups correctly', () => {
    storeChatMetadata(
      'reg@g.us',
      '2024-01-01T00:00:01.000Z',
      'Registered',
      'whatsapp',
      true,
    );
    storeChatMetadata(
      'unreg@g.us',
      '2024-01-01T00:00:02.000Z',
      'Unregistered',
      'whatsapp',
      true,
    );

    _setRegisteredGroups({
      'reg@g.us': {
        name: 'Registered',
        folder: 'registered',
        trigger: '@Gru',
        added_at: '2024-01-01T00:00:00.000Z',
      },
    });

    const groups = getAvailableGroups();
    const reg = groups.find((g) => g.jid === 'reg@g.us');
    const unreg = groups.find((g) => g.jid === 'unreg@g.us');

    expect(reg?.isRegistered).toBe(true);
    expect(unreg?.isRegistered).toBe(false);
  });

  it('returns groups ordered by most recent activity', () => {
    storeChatMetadata(
      'old@g.us',
      '2024-01-01T00:00:01.000Z',
      'Old',
      'whatsapp',
      true,
    );
    storeChatMetadata(
      'new@g.us',
      '2024-01-01T00:00:05.000Z',
      'New',
      'whatsapp',
      true,
    );
    storeChatMetadata(
      'mid@g.us',
      '2024-01-01T00:00:03.000Z',
      'Mid',
      'whatsapp',
      true,
    );

    const groups = getAvailableGroups();
    expect(groups[0].jid).toBe('new@g.us');
    expect(groups[1].jid).toBe('mid@g.us');
    expect(groups[2].jid).toBe('old@g.us');
  });

  it('excludes non-group chats regardless of JID format', () => {
    // Unknown JID format stored without is_group should not appear
    storeChatMetadata(
      'unknown-format-123',
      '2024-01-01T00:00:01.000Z',
      'Unknown',
    );
    // Explicitly non-group with unusual JID
    storeChatMetadata(
      'custom:abc',
      '2024-01-01T00:00:02.000Z',
      'Custom DM',
      'custom',
      false,
    );
    // A real group for contrast
    storeChatMetadata(
      'group@g.us',
      '2024-01-01T00:00:03.000Z',
      'Group',
      'whatsapp',
      true,
    );

    const groups = getAvailableGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].jid).toBe('group@g.us');
  });

  it('returns empty array when no chats exist', () => {
    const groups = getAvailableGroups();
    expect(groups).toHaveLength(0);
  });

  it('includes Slack channel JIDs', () => {
    storeChatMetadata(
      'slack:C0123456789',
      '2024-01-01T00:00:01.000Z',
      'Slack Channel',
      'slack',
      true,
    );
    storeChatMetadata(
      'user@s.whatsapp.net',
      '2024-01-01T00:00:02.000Z',
      'User DM',
      'whatsapp',
      false,
    );

    const groups = getAvailableGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].jid).toBe('slack:C0123456789');
  });

  it('returns Slack DM JIDs as groups when is_group is true', () => {
    storeChatMetadata(
      'slack:D0123456789',
      '2024-01-01T00:00:01.000Z',
      'Slack DM',
      'slack',
      true,
    );

    const groups = getAvailableGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].jid).toBe('slack:D0123456789');
    expect(groups[0].name).toBe('Slack DM');
  });

  it('marks registered Slack channels correctly', () => {
    storeChatMetadata(
      'slack:C0123456789',
      '2024-01-01T00:00:01.000Z',
      'Slack Registered',
      'slack',
      true,
    );
    storeChatMetadata(
      'slack:C9999999999',
      '2024-01-01T00:00:02.000Z',
      'Slack Unregistered',
      'slack',
      true,
    );

    _setRegisteredGroups({
      'slack:C0123456789': {
        name: 'Slack Registered',
        folder: 'slack-registered',
        trigger: '@Gru',
        added_at: '2024-01-01T00:00:00.000Z',
      },
    });

    const groups = getAvailableGroups();
    const slackReg = groups.find((g) => g.jid === 'slack:C0123456789');
    const slackUnreg = groups.find((g) => g.jid === 'slack:C9999999999');

    expect(slackReg?.isRegistered).toBe(true);
    expect(slackUnreg?.isRegistered).toBe(false);
  });

  it('mixes WhatsApp and Slack chats ordered by activity', () => {
    storeChatMetadata(
      'wa@g.us',
      '2024-01-01T00:00:01.000Z',
      'WhatsApp',
      'whatsapp',
      true,
    );
    storeChatMetadata(
      'slack:C100',
      '2024-01-01T00:00:03.000Z',
      'Slack',
      'slack',
      true,
    );
    storeChatMetadata(
      'wa2@g.us',
      '2024-01-01T00:00:02.000Z',
      'WhatsApp 2',
      'whatsapp',
      true,
    );

    const groups = getAvailableGroups();
    expect(groups).toHaveLength(3);
    expect(groups[0].jid).toBe('slack:C100');
    expect(groups[1].jid).toBe('wa2@g.us');
    expect(groups[2].jid).toBe('wa@g.us');
  });
});
