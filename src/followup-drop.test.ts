import { describe, it, expect, vi } from 'vitest';
import {
  parseFollowupLeadId,
  handleFollowupDrop,
  handleTypedDrop,
  type FollowupCard,
  type QueuedLead,
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

/** The live queue used by the typed-path tests, modelled on real data. */
const QUEUE: QueuedLead[] = [
  { pipeline_entry_id: 213, party_id: 10247, display_name: 'Namrata' },
  { pipeline_entry_id: 239, party_id: 10281, display_name: 'Renee' },
  { pipeline_entry_id: 283, party_id: 10300, display_name: 'Kate Fullbrook' },
  { pipeline_entry_id: 349, party_id: 10360, display_name: 'Marni Chaikin' },
];

function deps(opts: {
  card?: FollowupCard;
  queue?: QueuedLead[];
  entry?: QueuedLead;
  moved?: number[];
}) {
  return {
    getCard: vi.fn((_ts: string) => opts.card),
    queue: vi.fn(async () => opts.queue ?? QUEUE),
    lookupEntry: vi.fn(async (id: number) =>
      opts.entry !== undefined
        ? opts.entry
        : (opts.queue ?? QUEUE).find((l) => l.pipeline_entry_id === id),
    ),
    dropParty: vi.fn(async (_partyId: number, _reason: string) => ({
      entryIds: opts.moved ?? [],
    })),
    postThread: vi.fn(
      async (_jid: string, _ts: string, _text: string) => undefined,
    ),
  };
}

describe('handleFollowupDrop (👎 reaction)', () => {
  const cardText = '[FOLLOW-UP #1] Lead #283\nKate Fullbrook | k@example.com';
  const card = {
    content: cardText,
    from_group: 'sales',
    chat_jid: 'slack:C0AKPNJ7MDW',
  };

  it('drops the whole PARTY, not just the entry on the card', async () => {
    const d = deps({ card, moved: [283, 291] });
    expect(await handleFollowupDrop('171.1', 'Alex', d)).toBe(true);
    expect(d.dropParty).toHaveBeenCalledWith(
      10300,
      expect.stringContaining('Alex'),
    );
  });

  it('confirms using the entries the database actually parked', async () => {
    const d = deps({ card, moved: [283, 291] });
    await handleFollowupDrop('171.1', 'Alex', d);
    const [, , text] = d.postThread.mock.calls[0];
    expect(text).toContain('#283');
    expect(text).toContain('#291');
  });

  it('says so rather than claiming success when nothing was parked', async () => {
    const d = deps({ card, moved: [] });
    await handleFollowupDrop('171.1', 'Alex', d);
    expect(d.postThread.mock.calls[0][2]).toContain('no open entries');
  });

  it('reports honestly when the entry does not exist', async () => {
    const d = {
      ...deps({ card }),
      lookupEntry: vi.fn(async (_id: number) => undefined),
    };
    expect(await handleFollowupDrop('171.1', 'Alex', d)).toBe(true);
    expect(d.postThread.mock.calls[0][2]).toContain('Nothing changed');
  });

  it('no-ops when the card is unknown (reaction on some other message)', async () => {
    const d = deps({});
    expect(await handleFollowupDrop('x', 'Alex', d)).toBe(false);
    expect(d.dropParty).not.toHaveBeenCalled();
  });

  it('no-ops when the card is not from the sales group', async () => {
    const d = deps({
      card: { content: cardText, from_group: 'certifier', chat_jid: 'slack:x' },
    });
    expect(await handleFollowupDrop('x', 'Alex', d)).toBe(false);
    expect(d.dropParty).not.toHaveBeenCalled();
  });

  it('no-ops on a non-follow-up sales card (e.g. SALES REVIEW)', async () => {
    const d = deps({
      card: {
        content: '[SALES REVIEW] Lead #283',
        from_group: 'sales',
        chat_jid: 'slack:x',
      },
    });
    expect(await handleFollowupDrop('x', 'Alex', d)).toBe(false);
    expect(d.dropParty).not.toHaveBeenCalled();
  });
});

describe('handleTypedDrop', () => {
  const msg = (text: string, threadTs?: string) => ({
    chat_jid: 'slack:C0AHV1SGT6W',
    ts: '1785.1',
    text,
    threadTs: threadTs ?? null,
  });

  it('drops by name — the instruction that kept evaporating', async () => {
    const d = deps({ moved: [239] });
    expect(
      await handleTypedDrop(
        msg('drop renee carr - cherie is responding directly.'),
        'Alex',
        d,
      ),
    ).toBe(true);
    expect(d.dropParty).toHaveBeenCalledWith(10281, expect.any(String));
  });

  it('drops several names from one sentence', async () => {
    const d = deps({ moved: [1] });
    await handleTypedDrop(
      msg('do not bring it up again to that namrata and renee'),
      'Alex',
      d,
    );
    const parties = d.dropParty.mock.calls.map((c) => c[0]);
    expect(parties).toContain(10247);
    expect(parties).toContain(10281);
  });

  it('drops the numbers attached to a drop verb in a batch line', async () => {
    const d = deps({ moved: [1] });
    await handleTypedDrop(msg('#54 - done drop #283, 349 drop'), 'Alex', d);
    const parties = d.dropParty.mock.calls.map((c) => c[0]);
    expect(parties).toEqual(expect.arrayContaining([10300, 10360]));
  });

  it('does not drop ids that belong to an approval, not the drop', async () => {
    const d = deps({ moved: [1] });
    await handleTypedDrop(msg('drop 213 ok 239'), 'Alex', d);
    const parties = d.dropParty.mock.calls.map((c) => c[0]);
    expect(parties).toEqual([10247]);
  });

  // These all begin with "drop" but are edits to a draft, not lead drops. The
  // host must stay completely silent so the sales agent still handles them.
  const draftEdits = [
    'drop pricing from the response - the rest is approved',
    "drop cherie's booking link. the rest is approved",
    'drop the price form here, but check why new price is not updated',
    'drop accredication pending - she is targeting sep',
    'drop to answer directly - that is an ai-ism',
    'drop those 2 - responded separately',
  ];

  for (const text of draftEdits) {
    it(`stays silent on a draft edit: "${text.slice(0, 36)}…"`, async () => {
      const d = deps({});
      expect(await handleTypedDrop(msg(text), 'Alex', d)).toBe(false);
      expect(d.dropParty).not.toHaveBeenCalled();
      expect(d.postThread).not.toHaveBeenCalled();
    });
  }

  it('ignores messages with no drop instruction at all', async () => {
    const d = deps({});
    expect(await handleTypedDrop(msg('approved, send it'), 'Alex', d)).toBe(
      false,
    );
  });

  it('refuses to guess when a name matches more than one queued lead', async () => {
    const d = deps({
      queue: [
        { pipeline_entry_id: 1, party_id: 11, display_name: 'Renee Carr' },
        { pipeline_entry_id: 2, party_id: 22, display_name: 'Renee Fisher' },
      ],
    });
    await handleTypedDrop(msg('drop renee'), 'Alex', d);
    expect(d.dropParty).not.toHaveBeenCalled();
    expect(d.postThread.mock.calls[0][2]).toContain('Ambiguous');
  });

  it('reports a miss instead of silently doing nothing', async () => {
    const d = deps({});
    expect(await handleTypedDrop(msg('drop #9999'), 'Alex', d)).toBe(true);
    expect(d.postThread.mock.calls[0][2]).toContain('matched no lead');
    expect(d.dropParty).not.toHaveBeenCalled();
  });

  it('a bare "drop" under a follow-up card targets that card, no parsing', async () => {
    const d = deps({
      card: {
        content: '[FOLLOW-UP #1] Lead #213\nNamrata | namu.kohli@gmail.com',
        from_group: 'sales',
        chat_jid: 'slack:C0AHV1SGT6W',
      },
      moved: [213, 374],
    });
    expect(
      await handleTypedDrop(
        msg('this keeps coming up every day even after i say drop', '1784.9'),
        'Alex',
        d,
      ),
    ).toBe(true);
    expect(d.dropParty).toHaveBeenCalledWith(10247, expect.any(String));
  });
});
