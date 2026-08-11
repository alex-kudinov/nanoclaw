import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const { tmpRoot } = vi.hoisted(() => {
  const o = require('os') as typeof import('os');
  const f = require('fs') as typeof import('fs');
  const p = require('path') as typeof import('path');
  return { tmpRoot: f.mkdtempSync(p.join(o.tmpdir(), 'nanoclaw-ipc-')) };
});

vi.mock('./config.js', () => ({
  DATA_DIR: tmpRoot,
  IPC_POLL_INTERVAL: 1000,
  TIMEZONE: 'America/Los_Angeles',
}));
vi.mock('./logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const storeMessageDirect = vi.fn();
type HumanThreadMessage = {
  id: string;
  content: string;
  timestamp: string;
  sender: string;
  sender_name: string;
};
const getHumanMessagesInThread = vi.fn(
  (_chatJid: string, _threadTs: string): HumanThreadMessage[] => [],
);
// The IPC watcher now discharges approved-send expectations by recipient, on a
// confirmed send, rather than by group on the mailman handoff. See
// send-watchdog.ts.
const clearPendingSendsByRecipient = vi.fn((_recipient: string) => 0);
const markPendingSendHandoff = vi.fn(
  (
    _groupFolder: string,
    _recipient: string,
    _messageId: string | undefined,
    _observedAt: string,
  ) => 0,
);
vi.mock('./db.js', () => ({
  storeMessageDirect: (...args: unknown[]) => storeMessageDirect(...args),
  getHumanMessagesInThread: (chatJid: string, threadTs: string) =>
    getHumanMessagesInThread(chatJid, threadTs),
  // Deferred like storeMessageDirect above: the factory is hoisted above these
  // consts, so a bare reference would dereference before initialization.
  clearPendingSendsByRecipient: (recipient: string) =>
    clearPendingSendsByRecipient(recipient),
  markPendingSendHandoff: (
    groupFolder: string,
    recipient: string,
    messageId: string | undefined,
    observedAt: string,
  ) => markPendingSendHandoff(groupFolder, recipient, messageId, observedAt),
  findPendingSendAction: vi.fn(() => ({ ambiguous: false })),
  markEmailActionHandoff: vi.fn(() => 0),
  claimEmailActionExecution: vi.fn(),
  confirmEmailAction: vi.fn(),
  failEmailAction: vi.fn(),
  getPendingSendByActionId: vi.fn(),
  getPendingSendByGmailThread: vi.fn(),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  getTaskById: vi.fn(),
  updateTask: vi.fn(),
}));
vi.mock('./gmail-ipc-handlers.js', () => ({
  dispatchGmailIpc: vi.fn(),
  isGmailIpcType: () => false,
}));
vi.mock('./learn-ipc-handler.js', () => ({
  handleLearnLesson: vi.fn(),
  handleRouteLesson: vi.fn(),
  isLearnIpcType: () => false,
  isRouteLessonType: () => false,
}));
vi.mock('./classify-ipc-handlers.js', () => ({
  dispatchClassifyIpc: vi.fn(),
  isClassifyIpcType: () => false,
}));
vi.mock('./classify-backfill.js', () => ({
  handleClassificationLesson: vi.fn(),
  isClassificationLesson: () => false,
}));

import { isEmergencyToken } from './ipc.js';
import type { IpcDeps } from './ipc.js';
import type { RegisteredGroup } from './types.js';

const chiefGroup: RegisteredGroup = {
  name: 'Chief',
  folder: 'chief',
  trigger: '@Gru',
  added_at: new Date().toISOString(),
};
const salesGroup: RegisteredGroup = {
  name: 'Sales',
  folder: 'sales',
  trigger: '@Gru',
  added_at: new Date().toISOString(),
};
const mailmanGroup: RegisteredGroup = {
  name: 'Mailman',
  folder: 'mailman',
  trigger: '@Gru',
  added_at: new Date().toISOString(),
};

const registeredGroups: Record<string, RegisteredGroup> = {
  'slack:CHIEF': chiefGroup,
  'slack:SALES': salesGroup,
  'slack:MAILMAN': mailmanGroup,
};

function writeHandoffFile(
  sourceGroup: string,
  text: string,
  threadTs?: string,
  threadKey?: string,
  sourceContainer?: string,
  chatJid = 'slack:UNUSED',
) {
  const dir = path.join(tmpRoot, 'ipc', sourceGroup, 'messages');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(
    dir,
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
  );
  fs.writeFileSync(
    file,
    JSON.stringify({
      type: 'message',
      chatJid,
      text,
      thread_ts: threadTs,
      thread_key: threadKey,
      source_container: sourceContainer,
    }),
  );
  return file;
}

describe('isEmergencyToken', () => {
  it('matches escalation/emergency markers', () => {
    expect(isEmergencyToken('[ESCALATION] booking failed')).toBe(true);
    expect(isEmergencyToken('[EMERGENCY] server down')).toBe(true);
  });
  it('does not match ordinary handoff text', () => {
    expect(isEmergencyToken('[HANDOFF: chief→sales] new lead')).toBe(false);
  });
});

describe('IPC handoff routing', () => {
  let sendMessage: ReturnType<typeof vi.fn>;
  let deps: IpcDeps;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    storeMessageDirect.mockClear();
    getHumanMessagesInThread.mockReset();
    getHumanMessagesInThread.mockReturnValue([]);
    clearPendingSendsByRecipient.mockClear();
    markPendingSendHandoff.mockClear();
    sendMessage = vi.fn(async () => {});
    deps = {
      sendMessage,
      registeredGroups: () => registeredGroups,
      registerGroup: vi.fn(),
      syncGroups: vi.fn(async () => {}),
      getAvailableGroups: () => [],
      writeGroupsSnapshot: vi.fn(),
    } as unknown as IpcDeps;
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(path.join(tmpRoot, 'ipc'), { recursive: true, force: true });
  });

  function echoCalls() {
    return sendMessage.mock.calls.filter(
      (c) => typeof c[1] === 'string' && c[1].startsWith('→ Routed to'),
    );
  }

  it('delivers the handoff to the target and posts no echo (immediate path)', async () => {
    process.env.MAILMAN_HOLD_SECONDS = '0';
    const { startIpcWatcher } = await import('./ipc.js');
    writeHandoffFile('chief', '[HANDOFF: chief→sales] new lead', 'thr-9');

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    // handoff delivered to the target (sales)
    expect(sendMessage).toHaveBeenCalledWith(
      'slack:SALES',
      '[HANDOFF: chief→sales] new lead',
      expect.objectContaining({ fromGroup: 'chief' }),
    );
    // no mechanical confirmation echo back to the source
    expect(echoCalls()).toHaveLength(0);
    // Slack target self-persists via storeOutbound — no duplicate direct store
    expect(storeMessageDirect).not.toHaveBeenCalled();
  });

  // The wake rule now lives at the single consumer (getNewMessages in db.ts):
  // a bot row whose `from_group` differs from the channel's owning group is a
  // cross-group handoff and wakes the target. The producer therefore stores an
  // ordinary bot row and only has to tag `from_group` correctly. Asserting
  // `is_bot_message: false` here would re-encode the rule in a second place and
  // still leave the Slack delivery path (Entry #871) broken, since Slack
  // self-persists via storeOutbound and never reaches storeMessageDirect.
  it('stores a cross-group-tagged wake row when Mailman is registered on Gmail', async () => {
    process.env.MAILMAN_HOLD_SECONDS = '0';
    delete registeredGroups['slack:MAILMAN'];
    registeredGroups['gmail:info@tandemcoach.co'] = mailmanGroup;
    try {
      const { startIpcWatcher } = await import('./ipc.js');
      writeHandoffFile(
        'sales',
        '[HANDOFF: sales→mailman]\nTo: lead@example.com\nBody: approved',
        'thr-mailman',
      );

      startIpcWatcher(deps);
      await vi.advanceTimersByTimeAsync(50);

      expect(storeMessageDirect).toHaveBeenCalledWith(
        expect.objectContaining({
          chat_jid: 'gmail:info@tandemcoach.co',
          from_group: 'sales',
        }),
      );
      expect(markPendingSendHandoff).toHaveBeenCalledWith(
        'sales',
        'lead@example.com',
        expect.stringMatching(/^ipc-/),
        expect.any(String),
      );
    } finally {
      delete registeredGroups['gmail:info@tandemcoach.co'];
      registeredGroups['slack:MAILMAN'] = mailmanGroup;
    }
  });

  it('plumbs thread_key through to the target sendMessage (entity threading)', async () => {
    process.env.MAILMAN_HOLD_SECONDS = '0';
    const { startIpcWatcher } = await import('./ipc.js');
    writeHandoffFile(
      'chief',
      '[HANDOFF: chief→sales] new lead',
      undefined,
      'sales:entry:42',
    );

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(sendMessage).toHaveBeenCalledWith(
      'slack:SALES',
      '[HANDOFF: chief→sales] new lead',
      expect.objectContaining({ threadKey: 'sales:entry:42' }),
    );
  });

  it('routes an ASCII-arrow handoff (->) to the target, not the source channel', async () => {
    // Regression: agents emit [HANDOFF: booking->sales] with an ASCII arrow.
    // A "→"-only matcher dropped these to the source's own channel — booking
    // handoffs piled up in #gru-booking and sales never received them.
    process.env.MAILMAN_HOLD_SECONDS = '0';
    const { startIpcWatcher } = await import('./ipc.js');
    writeHandoffFile('chief', '[HANDOFF: chief->sales] new lead', 'thr-ascii');

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(sendMessage).toHaveBeenCalledWith(
      'slack:SALES',
      '[HANDOFF: chief->sales] new lead',
      expect.objectContaining({ fromGroup: 'chief' }),
    );
    // Never echoed to the source channel ('slack:UNUSED' from writeHandoffFile).
    expect(sendMessage.mock.calls.some((c) => c[0] === 'slack:UNUSED')).toBe(
      false,
    );
  });

  it('holds then delivers a mailman handoff on the deferred path', async () => {
    process.env.MAILMAN_HOLD_SECONDS = '30';
    const { startIpcWatcher } = await import('./ipc.js');
    writeHandoffFile('sales', '[HANDOFF: sales→mailman] reply draft', 'thr-3');

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);
    // Held — not yet flushed
    expect(sendMessage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(sendMessage).toHaveBeenCalledWith(
      'slack:MAILMAN',
      expect.stringContaining('[HANDOFF: sales→mailman]'),
      expect.objectContaining({ fromGroup: 'sales' }),
    );
    expect(echoCalls()).toHaveLength(0);
  });

  it('REPRO: one held mailman handoff flushes exactly once across the hold window', async () => {
    process.env.MAILMAN_HOLD_SECONDS = '30';
    const { startIpcWatcher } = await import('./ipc.js');
    writeHandoffFile('sales', '[HANDOFF: sales→mailman] reply draft', 'thr-r');

    startIpcWatcher(deps);
    // Advance through the entire 30s hold — ~35 poll ticks + the hold timer.
    await vi.advanceTimersByTimeAsync(35_000);

    const handoffDeliveries = sendMessage.mock.calls.filter(
      (c) =>
        c[0] === 'slack:MAILMAN' &&
        typeof c[1] === 'string' &&
        c[1].includes('[HANDOFF: sales→mailman]'),
    );
    expect(handoffDeliveries).toHaveLength(1);
  });

  it('collapses a burst of byte-identical mailman handoffs to one delivery', async () => {
    process.env.MAILMAN_HOLD_SECONDS = '30';
    const { startIpcWatcher } = await import('./ipc.js');
    startIpcWatcher(deps);

    // Simulate an upstream re-trigger loop: 12 byte-identical handoff files,
    // one per poll tick, all within the 30s hold window.
    const dupText = '[HANDOFF: sales→mailman]\nEntry ID: 54\nBody: reply draft';
    for (let i = 0; i < 12; i++) {
      writeHandoffFile('sales', dupText, 'thr-dup');
      await vi.advanceTimersByTimeAsync(1000);
    }
    // Flush the hold window.
    await vi.advanceTimersByTimeAsync(30_000);

    const deliveries = sendMessage.mock.calls.filter(
      (c) =>
        c[0] === 'slack:MAILMAN' &&
        typeof c[1] === 'string' &&
        c[1].includes('[HANDOFF: sales→mailman]'),
    );
    expect(deliveries).toHaveLength(1);
  });

  it('discards an IPC file whose type is not a recognized command', async () => {
    process.env.MAILMAN_HOLD_SECONDS = '0';
    const { startIpcWatcher } = await import('./ipc.js');
    // IPC files are validated by content (data.type), not by filename —
    // sanctioned producers legitimately use varied names (classify-{ts}.json,
    // lesson-*.json). A file whose type matches no handler must never drive
    // the control plane; it is discarded without effect.
    const dir = path.join(tmpRoot, 'ipc', 'sales', 'messages');
    fs.mkdirSync(dir, { recursive: true });
    const injected = path.join(dir, 'lesson_entry54_deborah_practicum.json');
    fs.writeFileSync(
      injected,
      JSON.stringify({ type: 'totally_bogus_command', text: 'injected' }),
    );

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    // Unrecognized type — not executed, and removed so it cannot reprocess.
    expect(sendMessage).not.toHaveBeenCalled();
    expect(fs.existsSync(injected)).toBe(false);
  });

  it('GUARD: a [SALES REVIEW] card with an embedded mailman handoff marker goes to #gru-sales, never mailman (Bernard Suman, 2026-07-22)', async () => {
    process.env.MAILMAN_HOLD_SECONDS = '30';
    const { startIpcWatcher } = await import('./ipc.js');
    // The agent posts the approval card; its ACTION-ON-APPROVAL footer embeds
    // "[HANDOFF: sales→mailman]". The unanchored matcher hijacked the whole
    // card to mailman, which silently dropped it — the lead got no approvable
    // draft. The guard forces the card to the source's own channel instead.
    const card =
      '[SALES REVIEW] Lead #882\nCategory: program-content\nEmail: lead@example.com\n\n' +
      'DRAFT RESPONSE TO LEAD:\n---\nSubject: Program details\n\nHi Bernard, here are the details.\n---\n\n' +
      'ACTION ON APPROVAL:\n→ [HANDOFF: sales→mailman] Entry 882 | Reply: false';
    writeHandoffFile('sales', card, 'thr-882', 'sales:entry:882');

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(35_000);

    // Delivered to the source's own channel for approval...
    expect(sendMessage).toHaveBeenCalledWith(
      'slack:SALES',
      expect.stringContaining('[SALES REVIEW] Lead #882'),
      expect.objectContaining({
        fromGroup: 'sales',
        threadKey: 'sales:entry:882',
      }),
    );
    // ...and NEVER routed to mailman (the silent-stall bug).
    expect(sendMessage.mock.calls.some((c) => c[0] === 'slack:MAILMAN')).toBe(
      false,
    );
  });

  it('acknowledges a host-accepted approval card to its exact originating container', async () => {
    process.env.MAILMAN_HOLD_SECONDS = '0';
    const { startIpcWatcher } = await import('./ipc.js');
    deps.deliverSourceInput = vi.fn(() => true);
    const card =
      '[SALES REVIEW] Lead #472\nCategory: followup\nEmail: lead@example.com\n\n' +
      'DRAFT RESPONSE TO LEAD:\n---\nSubject: Re: Program details\n\nHi Sierra, checking back in.\n---';
    writeHandoffFile(
      'sales',
      card,
      undefined,
      'sales:entry:472',
      'nanoclaw-sales-followup-472',
    );

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(sendMessage).toHaveBeenCalledWith(
      'slack:SALES',
      card,
      expect.objectContaining({
        fromGroup: 'sales',
        threadKey: 'sales:entry:472',
      }),
    );
    expect(deps.deliverSourceInput).toHaveBeenCalledWith(
      'sales',
      'nanoclaw-sales-followup-472',
      expect.stringMatching(
        /\[approval_card ACCEPTED\] Lead #472 exact card.*posted for human approval.*final receipt/i,
      ),
    );
  });

  it('rejects a malformed Sales card before it can be approved and targets the originating container', async () => {
    process.env.MAILMAN_HOLD_SECONDS = '0';
    const { startIpcWatcher } = await import('./ipc.js');
    deps.resolveSourceThread = vi.fn(() => ({
      chatJid: 'slack:SALES',
      threadTs: '1785765234.784429',
    }));
    deps.deliverSourceInput = vi.fn(() => true);
    const malformed =
      '[SALES REVIEW] Lead #600\nCategory: account-access\nEmail: lead@example.com\n\n' +
      'DRAFT RESPONSE TO LEAD:\n---\nHi Justin, please send a screenshot.\n---';
    writeHandoffFile(
      'sales',
      malformed,
      undefined,
      undefined,
      'nanoclaw-sales-justin',
    );

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(sendMessage).not.toHaveBeenCalledWith(
      'slack:SALES',
      malformed,
      expect.anything(),
    );
    expect(sendMessage).toHaveBeenCalledWith(
      'slack:SALES',
      expect.stringContaining('[APPROVAL CARD REJECTED]'),
      expect.objectContaining({
        threadTs: '1785765234.784429',
        hostWorkUnitThreadTs: '1785765234.784429',
      }),
    );
    expect(deps.deliverSourceInput).toHaveBeenCalledWith(
      'sales',
      'nanoclaw-sales-justin',
      expect.stringContaining('[approval_card REJECTED]'),
    );
    const quarantineDir = path.join(tmpRoot, 'ipc', 'quarantine', 'sales');
    expect(fs.readdirSync(quarantineDir)).toHaveLength(1);
  });

  it('returns a content-guard rejection to the exact Sales container before posting', async () => {
    process.env.MAILMAN_HOLD_SECONDS = '0';
    const { startIpcWatcher } = await import('./ipc.js');
    deps.resolveSourceThread = vi.fn(() => ({
      chatJid: 'slack:SALES',
      threadTs: '1786050675.234019',
    }));
    deps.deliverSourceInput = vi.fn(() => true);
    const blocked =
      '[SALES REVIEW] Lead #1047\nCategory: program-content\n' +
      'Email: marina@example.com\n\n' +
      'DRAFT RESPONSE TO LEAD:\n---\n' +
      'Subject: Team Coaching Certification\n\n' +
      'I am happy to help map out the right path.\n---';
    writeHandoffFile(
      'sales',
      blocked,
      undefined,
      undefined,
      'nanoclaw-sales-marina',
    );

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(sendMessage).not.toHaveBeenCalledWith(
      'slack:SALES',
      blocked,
      expect.anything(),
    );
    expect(sendMessage).toHaveBeenCalledWith(
      'slack:SALES',
      expect.stringMatching(
        /\[APPROVAL CARD REJECTED\].*happy to help.*Sales must repost/,
      ),
      expect.objectContaining({
        threadTs: '1786050675.234019',
        hostWorkUnitThreadTs: '1786050675.234019',
        threadKey: 'lead:marina@example.com',
      }),
    );
    expect(deps.deliverSourceInput).toHaveBeenCalledWith(
      'sales',
      'nanoclaw-sales-marina',
      expect.stringMatching(
        /\[approval_card REJECTED\].*happy to help.*not posted.*Correct the full card.*do not claim success/i,
      ),
    );
    expect(
      fs.readdirSync(path.join(tmpRoot, 'ipc', 'quarantine', 'sales')),
    ).toEqual([expect.stringMatching(/^approval-card-content-/)]);
  });

  it('accepts an exact human-authorized discount from the host work thread', async () => {
    process.env.MAILMAN_HOLD_SECONDS = '0';
    const { startIpcWatcher } = await import('./ipc.js');
    deps.resolveSourceThread = vi.fn(() => ({
      chatJid: 'slack:SALES',
      threadTs: '1786475865.628699',
    }));
    getHumanMessagesInThread.mockReturnValue([
      {
        id: '1786476845.000100',
        content: "pick Kayla's or 5% company discount",
        timestamp: '2026-08-11T19:34:00.000Z',
        sender: 'U_ALEX',
        sender_name: 'Alex Kudinov',
      },
    ]);
    const card =
      '[SALES REVIEW] Lead #1098\nCategory: pricing\n' +
      'Email: Tom.Olney@velera.com\n\n' +
      'DRAFT RESPONSE TO LEAD:\n---\n' +
      'Subject: Re: ACC Enrollment for Velera - Group Pricing\n\n' +
      'Use the 5% company discount.\n---';
    writeHandoffFile('sales', card, undefined, undefined, 'nanoclaw-sales-tom');

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(getHumanMessagesInThread).toHaveBeenCalledWith(
      'slack:SALES',
      '1786475865.628699',
    );
    expect(sendMessage).toHaveBeenCalledWith(
      'slack:SALES',
      card,
      expect.objectContaining({
        threadTs: '1786475865.628699',
        hostWorkUnitThreadTs: '1786475865.628699',
      }),
    );
  });

  it('keeps a rejected card visible and quarantined when its source container has exited', async () => {
    process.env.MAILMAN_HOLD_SECONDS = '0';
    const { startIpcWatcher } = await import('./ipc.js');
    deps.deliverSourceInput = vi.fn(() => false);
    const blocked =
      '[SALES REVIEW] Lead #1048\nCategory: program-content\n' +
      'Email: exited@example.com\n\n' +
      'DRAFT RESPONSE TO LEAD:\n---\nSubject: Program details\n\n' +
      'I am happy to help with the program.\n---';
    writeHandoffFile(
      'sales',
      blocked,
      undefined,
      undefined,
      'nanoclaw-sales-exited',
    );

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(deps.deliverSourceInput).toHaveBeenCalledWith(
      'sales',
      'nanoclaw-sales-exited',
      expect.stringContaining('[approval_card REJECTED]'),
    );
    expect(sendMessage).toHaveBeenCalledWith(
      'slack:SALES',
      expect.stringMatching(/\[APPROVAL CARD REJECTED\].*happy to help/),
      expect.objectContaining({ threadKey: 'lead:exited@example.com' }),
    );
    expect(sendMessage).not.toHaveBeenCalledWith(
      'slack:SALES',
      blocked,
      expect.anything(),
    );
    expect(
      fs.readdirSync(path.join(tmpRoot, 'ipc', 'quarantine', 'sales')),
    ).toEqual([expect.stringMatching(/^approval-card-content-/)]);
    expect(fs.existsSync(path.join(tmpRoot, 'ipc', 'sales', 'input'))).toBe(
      false,
    );
  });

  it('returns an overlong-card rejection to the exact Sales container before Slack', async () => {
    process.env.MAILMAN_HOLD_SECONDS = '0';
    const { startIpcWatcher } = await import('./ipc.js');
    deps.deliverSourceInput = vi.fn(() => true);
    const overlong =
      '[SALES REVIEW] Lead #1049\nCategory: program-content\n' +
      'Email: long@example.com\n\n' +
      'DRAFT RESPONSE TO LEAD:\n---\nSubject: Program details\n\n' +
      `Program information: ${'A'.repeat(4100)}\n---`;
    writeHandoffFile(
      'sales',
      overlong,
      undefined,
      undefined,
      'nanoclaw-sales-overlong',
    );

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(sendMessage).not.toHaveBeenCalledWith(
      'slack:SALES',
      overlong,
      expect.anything(),
    );
    expect(sendMessage).toHaveBeenCalledWith(
      'slack:SALES',
      expect.stringMatching(
        /\[APPROVAL CARD REJECTED\].*4000-character limit.*Sales must repost/,
      ),
      expect.objectContaining({ threadKey: 'lead:long@example.com' }),
    );
    expect(deps.deliverSourceInput).toHaveBeenCalledWith(
      'sales',
      'nanoclaw-sales-overlong',
      expect.stringMatching(/\[approval_card REJECTED\].*4000-character limit/),
    );
    expect(
      fs.readdirSync(path.join(tmpRoot, 'ipc', 'quarantine', 'sales')),
    ).toEqual([expect.stringMatching(/^approval-card-overlong-/)]);
  });

  it('includes the Slack group prefix in the exact-session overlong preflight', async () => {
    process.env.MAILMAN_HOLD_SECONDS = '0';
    const { startIpcWatcher } = await import('./ipc.js');
    deps.deliverSourceInput = vi.fn(() => true);
    const cardStart =
      '\n[SALES REVIEW] Lead #1050\nCategory: program-content\n' +
      'Email: prefixed@example.com\n\n' +
      'DRAFT RESPONSE TO LEAD:\n---\nSubject: Program details\n\n' +
      'Program information: ';
    const cardEnd = '\n---';
    const prefixedOverlong =
      cardStart +
      'A'.repeat(3995 - cardStart.length - cardEnd.length) +
      cardEnd;
    expect(prefixedOverlong).toHaveLength(3995);
    writeHandoffFile(
      'sales',
      prefixedOverlong,
      undefined,
      undefined,
      'nanoclaw-sales-prefixed-overlong',
    );

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(sendMessage).not.toHaveBeenCalledWith(
      'slack:SALES',
      prefixedOverlong,
      expect.anything(),
    );
    expect(sendMessage).toHaveBeenCalledWith(
      'slack:SALES',
      expect.stringMatching(
        /\[APPROVAL CARD REJECTED\].*4000-character limit.*Sales must repost/,
      ),
      expect.objectContaining({ threadKey: 'lead:prefixed@example.com' }),
    );
    expect(deps.deliverSourceInput).toHaveBeenCalledWith(
      'sales',
      'nanoclaw-sales-prefixed-overlong',
      expect.stringMatching(/\[approval_card REJECTED\].*4000-character limit/),
    );
    expect(
      fs.readdirSync(path.join(tmpRoot, 'ipc', 'quarantine', 'sales')),
    ).toEqual([expect.stringMatching(/^approval-card-overlong-/)]);
  });

  it('also rejects a malformed Sales card whose footer embeds a mailman handoff', async () => {
    process.env.MAILMAN_HOLD_SECONDS = '0';
    const { startIpcWatcher } = await import('./ipc.js');
    deps.deliverSourceInput = vi.fn(() => true);
    const malformed =
      '[SALES REVIEW] Lead #601\nEmail: lead2@example.com\n' +
      'DRAFT RESPONSE TO LEAD:\n---\nBody without a subject.\n---\n' +
      'ACTION ON APPROVAL: [HANDOFF: sales→mailman]';
    writeHandoffFile(
      'sales',
      malformed,
      undefined,
      undefined,
      'nanoclaw-sales-lead2',
    );

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(sendMessage).not.toHaveBeenCalledWith(
      'slack:SALES',
      malformed,
      expect.anything(),
    );
    expect(sendMessage).toHaveBeenCalledWith(
      'slack:SALES',
      expect.stringContaining('[APPROVAL CARD REJECTED]'),
      expect.objectContaining({ threadKey: 'lead:lead2@example.com' }),
    );
    expect(
      fs.readdirSync(path.join(tmpRoot, 'ipc', 'quarantine', 'sales')),
    ).toEqual([expect.stringMatching(/^approval-card-malformed-/)]);
  });

  it.each(['CLIENT SUPPORT REVIEW', 'SUPPORT-DRAFT'])(
    'rejects a malformed [%s] card before it can reach approval',
    async (marker) => {
      process.env.MAILMAN_HOLD_SECONDS = '0';
      const { startIpcWatcher } = await import('./ipc.js');
      deps.deliverSourceInput = vi.fn(() => true);
      const malformed =
        `[${marker}] Account access\nEmail: support@example.com\n` +
        'DRAFT RESPONSE:\n---\nBody without a subject.\n---';
      writeHandoffFile(
        'sales',
        malformed,
        undefined,
        undefined,
        `nanoclaw-sales-${marker.toLowerCase().replace(/[^a-z]+/g, '-')}`,
      );

      startIpcWatcher(deps);
      await vi.advanceTimersByTimeAsync(50);

      expect(sendMessage).not.toHaveBeenCalledWith(
        'slack:SALES',
        malformed,
        expect.anything(),
      );
      expect(sendMessage).toHaveBeenCalledWith(
        'slack:SALES',
        expect.stringContaining('[APPROVAL CARD REJECTED]'),
        expect.objectContaining({ threadKey: 'lead:support@example.com' }),
      );
      expect(
        fs.readdirSync(path.join(tmpRoot, 'ipc', 'quarantine', 'sales')),
      ).toHaveLength(1);
    },
  );

  it('uses the authoring group in a non-Sales rejection', async () => {
    process.env.MAILMAN_HOLD_SECONDS = '0';
    const { startIpcWatcher } = await import('./ipc.js');
    deps.deliverSourceInput = vi.fn(() => true);
    const malformed =
      '[SUPPORT-DRAFT]\nTo: support@example.com\n' +
      'DRAFT RESPONSE:\n---\nBody without a subject.\n---';
    writeHandoffFile(
      'chief',
      malformed,
      undefined,
      undefined,
      'nanoclaw-chief-support',
    );

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(sendMessage).not.toHaveBeenCalledWith(
      'slack:CHIEF',
      malformed,
      expect.anything(),
    );
    expect(sendMessage).toHaveBeenCalledWith(
      'slack:CHIEF',
      expect.stringMatching(/\[APPROVAL CARD REJECTED\].*Chief must repost/),
      expect.objectContaining({ threadKey: 'lead:support@example.com' }),
    );
    expect(
      sendMessage.mock.calls.some(
        (call) =>
          call[0] === 'slack:CHIEF' &&
          typeof call[1] === 'string' &&
          call[1].includes('Sales must repost'),
      ),
    ).toBe(false);
    expect(
      fs.readdirSync(path.join(tmpRoot, 'ipc', 'quarantine', 'chief')),
    ).toEqual([expect.stringMatching(/^approval-card-malformed-/)]);
  });

  it('defaults a Sales reply to its host-registered work-unit thread', async () => {
    process.env.MAILMAN_HOLD_SECONDS = '0';
    const { startIpcWatcher } = await import('./ipc.js');
    deps.resolveSourceThread = vi.fn(() => ({
      chatJid: 'slack:SALES',
      threadTs: '1785230544.590929',
    }));
    const card =
      '[SALES REVIEW] Lead #882\nEmail: lead@example.com\n' +
      'DRAFT RESPONSE TO LEAD:\n---\nSubject: Details\n\nApproved body.\n---\n' +
      'ACTION ON APPROVAL: [HANDOFF: sales→mailman]';
    writeHandoffFile(
      'sales',
      card,
      undefined,
      undefined,
      'nanoclaw-sales-thread-1',
    );

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(deps.resolveSourceThread).toHaveBeenCalledWith(
      'sales',
      'nanoclaw-sales-thread-1',
    );
    expect(sendMessage).toHaveBeenCalledWith(
      'slack:SALES',
      card,
      expect.objectContaining({
        fromGroup: 'sales',
        threadTs: '1785230544.590929',
      }),
    );
  });

  it('keeps non-lead Sales status inside its active host work-unit thread', async () => {
    process.env.MAILMAN_HOLD_SECONDS = '0';
    const { startIpcWatcher } = await import('./ipc.js');
    deps.resolveSourceThread = vi.fn(() => ({
      chatJid: 'slack:SALES',
      threadTs: '1785230544.590929',
    }));
    writeHandoffFile(
      'sales',
      'Draft revised from the operator feedback.',
      undefined,
      undefined,
      'nanoclaw-sales-thread-1',
      'slack:SALES',
    );

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(sendMessage).toHaveBeenCalledWith(
      'slack:SALES',
      'Draft revised from the operator feedback.',
      expect.objectContaining({
        fromGroup: 'sales',
        threadTs: '1785230544.590929',
      }),
    );
  });

  it('never carries a Sales source timestamp into a cross-group channel', async () => {
    process.env.MAILMAN_HOLD_SECONDS = '0';
    const { startIpcWatcher } = await import('./ipc.js');
    deps.resolveSourceThread = vi.fn(() => ({
      chatJid: 'slack:SALES',
      threadTs: '1785230544.590929',
    }));
    writeHandoffFile(
      'sales',
      '[HANDOFF: sales→mailman]\nTo: lead@example.com\nBody: approved',
      '1785230544.590929',
      undefined,
      'nanoclaw-sales-thread-1',
    );

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    expect(sendMessage).toHaveBeenCalledWith(
      'slack:MAILMAN',
      expect.stringContaining('[HANDOFF: sales→mailman]'),
      expect.not.objectContaining({ threadTs: '1785230544.590929' }),
    );
  });

  it('strips a source timestamp when the source group is not registered', async () => {
    process.env.MAILMAN_HOLD_SECONDS = '0';
    delete registeredGroups['slack:SALES'];
    try {
      const { startIpcWatcher } = await import('./ipc.js');
      writeHandoffFile(
        'sales',
        '[HANDOFF: sales→mailman]\nTo: lead@example.com\nBody: approved',
        '1785230544.590929',
      );

      startIpcWatcher(deps);
      await vi.advanceTimersByTimeAsync(50);

      expect(sendMessage).toHaveBeenCalledWith(
        'slack:MAILMAN',
        expect.stringContaining('[HANDOFF: sales→mailman]'),
        expect.not.objectContaining({ threadTs: '1785230544.590929' }),
      );
    } finally {
      registeredGroups['slack:SALES'] = salesGroup;
    }
  });

  it('a genuine "Lead #N approved. [HANDOFF: sales→mailman]" send (no review marker) still routes to mailman', async () => {
    process.env.MAILMAN_HOLD_SECONDS = '30';
    const { startIpcWatcher } = await import('./ipc.js');
    // Regression guard: 57 real sends in the corpus prefix "Lead #N approved. "
    // before the marker. The guard must key on the [SALES REVIEW] marker, not
    // on marker position — an anchored regex would drop these real emails.
    writeHandoffFile(
      'sales',
      'Lead #7 approved.  [HANDOFF: sales→mailman]\nTo: a@b.com\nBody: reply',
      'thr-7legit',
    );

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(35_000);

    expect(sendMessage).toHaveBeenCalledWith(
      'slack:MAILMAN',
      expect.stringContaining('[HANDOFF: sales→mailman]'),
      expect.objectContaining({ fromGroup: 'sales' }),
    );
  });

  it('drops a held handoff when a cancel arrives in the window', async () => {
    process.env.MAILMAN_HOLD_SECONDS = '30';
    const { startIpcWatcher } = await import('./ipc.js');
    writeHandoffFile('sales', '[HANDOFF: sales→mailman] reply draft', 'thr-7');

    startIpcWatcher(deps);
    await vi.advanceTimersByTimeAsync(50);

    writeHandoffFile('sales', '[CANCEL: sales→mailman] stop', 'thr-7');
    await vi.advanceTimersByTimeAsync(1100);

    await vi.advanceTimersByTimeAsync(30_000);
    // The held handoff was cancelled — it must never be delivered to mailman.
    const handoffDeliveries = sendMessage.mock.calls.filter(
      (c) =>
        c[0] === 'slack:MAILMAN' &&
        typeof c[1] === 'string' &&
        c[1].includes('[HANDOFF: sales→mailman]'),
    );
    expect(handoffDeliveries).toHaveLength(0);
  });
});
