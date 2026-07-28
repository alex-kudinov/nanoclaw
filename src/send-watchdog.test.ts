import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isTrackableCard,
  observeOutbound,
  recordApproval,
  sweepPendingSends,
  SEND_GRACE_MS,
  type PendingSend,
  type SendWatchdogStore,
} from './send-watchdog.js';

const CARD = `[SALES REVIEW] Lead #938 — REVISED
Category: program-info

Email: Oana.Tue.Coach@gmail.com

DRAFT RESPONSE TO LEAD:
---
Hi Oana,
---`;

function makeStore(): SendWatchdogStore & { rows: PendingSend[] } {
  const rows: PendingSend[] = [];
  return {
    rows,
    recordPendingSend: (row) => {
      if (!rows.some((r) => r.draftTs === row.draftTs)) rows.push(row);
    },
    clearPendingSends: (group, recipient) => {
      const before = rows.length;
      const keep = rows.filter((r) =>
        recipient
          ? !(r.groupFolder === group && r.recipient === recipient)
          : r.groupFolder !== group,
      );
      rows.length = 0;
      rows.push(...keep);
      return before - rows.length;
    },
    listOverdueSends: (cutoff) => rows.filter((r) => r.approvedAt <= cutoff),
    markAlerted: (draftTs) => {
      const i = rows.findIndex((r) => r.draftTs === draftTs);
      if (i >= 0) rows.splice(i, 1);
    },
  };
}

const NOW = new Date('2026-07-28T10:45:47.000Z');
const base = {
  draftTs: '1785235523.568119',
  groupFolder: 'sales',
  chatJid: 'slack:C0AHV1SGT6W',
  threadTs: '1785230834.912489',
  cardText: CARD,
  now: NOW,
};

describe('isTrackableCard', () => {
  it('tracks a sales review card', () => {
    expect(isTrackableCard(CARD)).toBe(true);
  });

  it('ignores ordinary chatter', () => {
    expect(isTrackableCard('sounds good, thanks')).toBe(false);
  });
});

describe('recordApproval', () => {
  it('records recipient and lead reference from the card', () => {
    const store = makeStore();
    const row = recordApproval(base, store);
    expect(row).toMatchObject({
      groupFolder: 'sales',
      recipient: 'oana.tue.coach@gmail.com',
      leadRef: 'Lead #938',
      approvedAt: NOW.toISOString(),
    });
    expect(store.rows).toHaveLength(1);
  });

  it('records nothing for a non-card approval', () => {
    const store = makeStore();
    expect(recordApproval({ ...base, cardText: 'ok' }, store)).toBeNull();
    expect(store.rows).toHaveLength(0);
  });

  it('is idempotent on a repeated approval of the same draft', () => {
    const store = makeStore();
    recordApproval(base, store);
    recordApproval(base, store);
    expect(store.rows).toHaveLength(1);
  });
});

describe('observeOutbound', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
    recordApproval(base, store);
  });

  it('clears the expectation when the matching handoff is emitted', () => {
    observeOutbound(
      'sales',
      '[HANDOFF: sales→mailman]\nTo: oana.tue.coach@gmail.com\nSubject: Re: x',
      store,
    );
    expect(store.rows).toHaveLength(0);
  });

  it('accepts the ASCII arrow form', () => {
    observeOutbound(
      'sales',
      '[HANDOFF: sales->mailman]\nTo: oana.tue.coach@gmail.com',
      store,
    );
    expect(store.rows).toHaveLength(0);
  });

  it('does NOT clear when the handoff is for a different lead', () => {
    // The bug this guards: a send for lead B marking lead A fulfilled would
    // hide a real drop behind unrelated traffic.
    observeOutbound(
      'sales',
      '[HANDOFF: sales→mailman]\nTo: someone.else@example.com',
      store,
    );
    expect(store.rows).toHaveLength(1);
  });

  it('ignores non-handoff messages', () => {
    observeOutbound('sales', '[SALES REVIEW] Lead #939\nTo: x@y.com', store);
    expect(store.rows).toHaveLength(1);
  });

  it('ignores a handoff from a different group', () => {
    observeOutbound(
      'booking',
      '[HANDOFF: booking→mailman]\nTo: oana.tue.coach@gmail.com',
      store,
    );
    expect(store.rows).toHaveLength(1);
  });
});

describe('sweepPendingSends', () => {
  it('stays quiet inside the grace period', async () => {
    const store = makeStore();
    recordApproval(base, store);
    const postThread = vi.fn().mockResolvedValue(undefined);
    const sent = await sweepPendingSends(
      new Date(NOW.getTime() + SEND_GRACE_MS - 1000),
      { store, postThread },
    );
    expect(sent).toBe(0);
    expect(postThread).not.toHaveBeenCalled();
  });

  it('alerts in the draft thread once the grace period lapses', async () => {
    const store = makeStore();
    recordApproval(base, store);
    const postThread = vi.fn().mockResolvedValue(undefined);
    const sent = await sweepPendingSends(
      new Date(NOW.getTime() + SEND_GRACE_MS + 1000),
      { store, postThread },
    );
    expect(sent).toBe(1);
    const [jid, text, threadTs] = postThread.mock.calls[0];
    expect(jid).toBe('slack:C0AHV1SGT6W');
    expect(threadTs).toBe('1785230834.912489');
    expect(text).toContain('[SEND NOT OBSERVED]');
    expect(text).toContain('Lead #938');
    expect(text).toContain('oana.tue.coach@gmail.com');
    // The approved text is the operator's — never re-derive it.
    expect(text).toContain('do not');
  });

  it('alerts only once per approval', async () => {
    const store = makeStore();
    recordApproval(base, store);
    const postThread = vi.fn().mockResolvedValue(undefined);
    const later = new Date(NOW.getTime() + SEND_GRACE_MS + 1000);
    await sweepPendingSends(later, { store, postThread });
    await sweepPendingSends(later, { store, postThread });
    expect(postThread).toHaveBeenCalledTimes(1);
  });

  it('retries on the next sweep when posting the alert fails', async () => {
    const store = makeStore();
    recordApproval(base, store);
    const postThread = vi
      .fn()
      .mockRejectedValueOnce(new Error('slack down'))
      .mockResolvedValueOnce(undefined);
    const later = new Date(NOW.getTime() + SEND_GRACE_MS + 1000);
    expect(await sweepPendingSends(later, { store, postThread })).toBe(0);
    expect(store.rows).toHaveLength(1);
    expect(await sweepPendingSends(later, { store, postThread })).toBe(1);
  });

  it('never alerts for an approval whose handoff arrived', async () => {
    const store = makeStore();
    recordApproval(base, store);
    observeOutbound(
      'sales',
      '[HANDOFF: sales→mailman]\nTo: oana.tue.coach@gmail.com',
      store,
    );
    const postThread = vi.fn().mockResolvedValue(undefined);
    await sweepPendingSends(new Date(NOW.getTime() + SEND_GRACE_MS + 1000), {
      store,
      postThread,
    });
    expect(postThread).not.toHaveBeenCalled();
  });
});
