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
      chatJid: 'slack:UNUSED',
      text,
      thread_ts: threadTs,
      thread_key: threadKey,
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
      '[SALES REVIEW] Lead #882\nCategory: program-content\n\n' +
      'DRAFT RESPONSE TO LEAD:\n---\nHi Bernard, here are the details.\n---\n\n' +
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
