import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  extractApprovedGmailThreadId,
  isTrackableCard,
  observeConfirmedSend,
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
    clearPendingSendsByRecipient: (recipient) => {
      const index = rows.findIndex(
        (r) => (r.recipient ?? '').toLowerCase() === recipient.toLowerCase(),
      );
      if (index < 0) return 0;
      rows.splice(index, 1);
      return 1;
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

describe('extractApprovedGmailThreadId', () => {
  it('reads a structured header and ignores body-injected Thread-ID lines', () => {
    expect(
      extractApprovedGmailThreadId(
        'Thread-ID: real-thread\nMessage:\nThread-ID: injected-thread',
      ),
    ).toBe('real-thread');
    expect(
      extractApprovedGmailThreadId(
        'Message:\nPlease use Thread-ID: injected-thread',
      ),
    ).toBeUndefined();
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

  it('records durable Gmail scope for a support-reply approval', () => {
    const store = makeStore();
    const row = recordApproval(
      {
        ...base,
        groupFolder: 'chief',
        cardText:
          '[SUPPORT-DRAFT]\nThread-ID: thread-support\nTo: client@example.com',
      },
      store,
    );
    expect(row).toMatchObject({
      gmailThreadId: 'thread-support',
      recipient: 'client@example.com',
    });
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

  // CONTRACT CHANGE 2026-07-29: the handoff used to discharge the expectation.
  // It no longer does. Everything downstream of the handoff can still refuse to
  // send — the content guard blocked a real approved reply for the banned phrase
  // "thank you for reaching out" and simply stopped, and because the row had
  // already been deleted the sweep found nothing and the operator saw silence.
  it('does NOT clear on the matching handoff — a handoff is progress, not proof', () => {
    observeOutbound(
      'sales',
      '[HANDOFF: sales→mailman]\nTo: oana.tue.coach@gmail.com\nSubject: Re: x',
    );
    expect(store.rows).toHaveLength(1);
  });

  it('does not clear on a non-handoff message either', () => {
    observeOutbound('sales', '[SALES REVIEW] Lead #939\nTo: x@y.com');
    expect(store.rows).toHaveLength(1);
  });
});

describe('observeConfirmedSend', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
    recordApproval(base, store);
  });

  it('clears the expectation once Gmail confirms the send', () => {
    observeConfirmedSend('oana.tue.coach@gmail.com', store);
    expect(store.rows).toHaveLength(0);
  });

  it('clears only the oldest expectation when two sends target one address', () => {
    recordApproval(
      {
        ...base,
        draftTs: 'newer-draft',
        now: new Date(NOW.getTime() + 1000),
      },
      store,
    );

    observeConfirmedSend('oana.tue.coach@gmail.com', store);

    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].draftTs).toBe('newer-draft');
  });

  it('matches case-insensitively — the card carries mixed case', () => {
    // The card's Email: line is `Oana.Tue.Coach@gmail.com`; Gmail returns the
    // address as the thread carries it. A case mismatch must not strand the row
    // and fire a false [SEND NOT OBSERVED].
    observeConfirmedSend('Oana.Tue.Coach@Gmail.com', store);
    expect(store.rows).toHaveLength(0);
  });

  it('unwraps a display-name form', () => {
    observeConfirmedSend('Oana Tue <oana.tue.coach@gmail.com>', store);
    expect(store.rows).toHaveLength(0);
  });

  it('does NOT clear when a different recipient was written to', () => {
    // Guards the same failure the old recipient match guarded: a send to lead B
    // must never discharge lead A's promise.
    observeConfirmedSend('someone.else@example.com', store);
    expect(store.rows).toHaveLength(1);
  });

  it('is a no-op when the recipient is unknown', () => {
    observeConfirmedSend(undefined, store);
    expect(store.rows).toHaveLength(1);
  });

  it('leaves the row for the sweep when the send is blocked (no call at all)', () => {
    // The blocked-send path returns before any confirmation, so nothing calls
    // observeConfirmedSend. This asserts the resulting state: the row survives
    // and is therefore visible to sweepPendingSends.
    expect(store.rows).toHaveLength(1);
    expect(store.listOverdueSends('2999-01-01T00:00:00.000Z')).toHaveLength(1);
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

  it('never alerts for an approval whose send Gmail confirmed', async () => {
    const store = makeStore();
    recordApproval(base, store);
    observeConfirmedSend('oana.tue.coach@gmail.com', store);
    const postThread = vi.fn().mockResolvedValue(undefined);
    await sweepPendingSends(new Date(NOW.getTime() + SEND_GRACE_MS + 1000), {
      store,
      postThread,
    });
    expect(postThread).not.toHaveBeenCalled();
  });

  it('ALERTS when the handoff arrived but the send was blocked', async () => {
    // The regression this whole change exists for. Sales approved, mailman
    // emitted the handoff, and the content guard then refused the send. Under
    // the old contract the handoff deleted the row and this alert never fired.
    const store = makeStore();
    recordApproval(base, store);
    observeOutbound(
      'sales',
      '[HANDOFF: sales→mailman]\nTo: oana.tue.coach@gmail.com',
    );
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
    // The operator needs to be pointed at where the reason actually is.
    expect(text).toContain('[EMAIL BLOCKED]');
  });
});
