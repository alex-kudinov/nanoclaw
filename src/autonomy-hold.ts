/**
 * autonomy-hold — L2 hold-and-send orchestrator.
 *
 * For a draft whose (group, category) has earned L2, the host schedules an
 * auto-approval instead of waiting for a human: a threaded notice announces
 * the veto window; if no operator objects before expiry, the host injects the
 * same "✅ Approved" message a reaction would have produced and the existing
 * approval machinery does the rest (agent resumes → [HANDOFF: →mailman] →
 * recipient + content guards → send). No second send path exists.
 *
 * Cancel paths: operator feedback in-thread (ledger resolves 'corrected'),
 * an explicit ✅ (resolves 'approved_clean'), a 👎 veto (hard demote), or a
 * newer draft (superseded). Pending rows persist in SQLite so holds survive
 * daemon restarts.
 */
import {
  createAutonomyPending,
  findAutonomyPendingByTs,
  getAutonomyThreadMessagesAfter,
  getOpenAutonomyPendings,
  resolveAutonomyDraftEvent,
  setAutonomyPendingStatus,
  type AutonomyPendingRow,
} from './db.js';
import type { NewMessage } from './types.js';
import { logger } from './logger.js';
import {
  autonomyGroups,
  computeVetoExpiry,
  isApprovalMessage,
  VETO_WINDOW_MINUTES,
} from './autonomy-policy.js';
import {
  ingest,
  recordAutoApproved,
  recordVeto,
  type GroupChannel,
  type NewL2Draft,
} from './autonomy-ledger.js';

export interface AutonomyDeps {
  /** Post a message to a channel (threaded when threadTs given). */
  sendMessage: (
    jid: string,
    text: string,
    opts?: { threadTs?: string },
  ) => Promise<void>;
  /** Inject a message into the normal inbound pipeline (= storeMessage). */
  injectMessage: (msg: NewMessage) => void;
  /** jid → group registration (folder names). */
  registeredGroups: () => Record<string, { folder: string }>;
  intervalMs?: number;
}

const DEFAULT_INTERVAL_MS = 60_000;
let sweepTimer: NodeJS.Timeout | undefined;

function enabledChannels(deps: AutonomyDeps): GroupChannel[] {
  const wanted = new Set(autonomyGroups());
  const out: GroupChannel[] = [];
  for (const [jid, g] of Object.entries(deps.registeredGroups())) {
    if (wanted.has(g.folder)) out.push({ folder: g.folder, jid });
  }
  return out;
}

function fmtCentral(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

async function holdNewL2Draft(
  deps: AutonomyDeps,
  d: NewL2Draft,
  now: Date,
): Promise<void> {
  const expiry = computeVetoExpiry(now);
  createAutonomyPending({
    draft_id: d.draft_id,
    chat_jid: d.chat_jid,
    group_folder: d.group_folder,
    category: d.category,
    thread_ts: d.thread_ts,
    draft_ts: d.draft_ts,
    notice_ts: null,
    expires_at: expiry.toISOString(),
    status: 'pending',
    created_at: now.toISOString(),
  });
  await deps.sendMessage(
    d.chat_jid,
    `⏳ *Autonomy L2* (\`${d.category}\`): this draft auto-approves at ` +
      `*${fmtCentral(expiry)} CT* unless you 👎 the draft message or reply with changes.`,
    { threadTs: d.thread_ts ?? undefined },
  );
  logger.info(
    { draft: d.draft_id, category: d.category, expiry: expiry.toISOString() },
    'autonomy: L2 hold started',
  );
}

/** Operator activity since the draft = the hold must not fire. */
function threadHasOperatorActivity(p: AutonomyPendingRow): boolean {
  const msgs = getAutonomyThreadMessagesAfter(
    p.chat_jid,
    p.thread_ts,
    p.draft_ts,
  );
  return msgs.some((m) => {
    const text = (m.content || '').trim();
    if (!text || m.is_from_me) return false;
    return isApprovalMessage(text) || !m.is_bot_message;
  });
}

function buildAutoApproval(p: AutonomyPendingRow, now: Date): NewMessage {
  return {
    id: `auto-approve-${p.draft_id}`,
    chat_jid: p.chat_jid,
    sender: 'autonomy-l2',
    sender_name: 'Autonomy (L2)',
    content:
      `✅ Auto-approved (autonomy L2, category ${p.category}) — no operator ` +
      `objection within the veto window. Proceed with your standard approval ` +
      `flow for the pending draft in this thread. If that draft was already ` +
      `sent or superseded, do NOT send again — reply [ALREADY-HANDLED] instead.`,
    timestamp: now.toISOString(),
    is_from_me: false,
    is_bot_message: false,
    from_group: undefined,
    thread_ts: p.thread_ts ?? undefined,
  } as NewMessage;
}

async function fireDuePendings(deps: AutonomyDeps, now: Date): Promise<void> {
  const nowIso = now.toISOString();
  for (const p of getOpenAutonomyPendings()) {
    if (p.expires_at > nowIso) continue;
    if (threadHasOperatorActivity(p)) {
      setAutonomyPendingStatus(p.draft_id, 'cancelled');
      logger.info(
        { draft: p.draft_id },
        'autonomy: hold cancelled — operator activity in thread',
      );
      continue;
    }
    setAutonomyPendingStatus(p.draft_id, 'fired');
    // Resolve the draft event NOW — otherwise the next ledger pass would see
    // the injected "✅ Auto-approved" row and count it a second time.
    resolveAutonomyDraftEvent(p.draft_id, 'auto_approved', nowIso);
    recordAutoApproved(p.group_folder, p.category, nowIso);
    deps.injectMessage(buildAutoApproval(p, now));
    logger.info(
      { draft: p.draft_id, category: p.category },
      'autonomy: L2 auto-approval injected',
    );
  }
}

/** One sweep: ledger ingest → new holds → promotions → fire due holds. */
export async function autonomyTick(
  deps: AutonomyDeps,
  now = new Date(),
): Promise<void> {
  const channels = enabledChannels(deps);
  if (channels.length === 0) return;
  const res = ingest(channels, now);
  for (const d of res.newL2Drafts) await holdNewL2Draft(deps, d, now);
  for (const promo of res.promotions) {
    await deps.sendMessage(
      promo.jid,
      `🎓 *Autonomy*: \`${promo.category}\` promoted to *L2* after ` +
        `${promo.streak} consecutive clean approvals. New drafts in this ` +
        `category auto-approve after a ${VETO_WINDOW_MINUTES}-minute veto ` +
        `window (👎 a held draft to veto and demote).`,
    );
  }
  await fireDuePendings(deps, now);
}

/**
 * 👎 listener body — wire into SlackChannel.addRejectListener. Returns true
 * (claims the reaction) when the reacted message is a held L2 draft.
 */
export async function handleVetoReaction(
  deps: AutonomyDeps,
  reactedTs: string,
  reactor: string,
  now = new Date(),
): Promise<boolean> {
  const p = findAutonomyPendingByTs(reactedTs);
  if (!p) return false;
  const nowIso = now.toISOString();
  setAutonomyPendingStatus(p.draft_id, 'vetoed');
  resolveAutonomyDraftEvent(p.draft_id, 'vetoed', nowIso);
  recordVeto(p.group_folder, p.category, nowIso);
  await deps.sendMessage(
    p.chat_jid,
    `❌ Auto-send vetoed by ${reactor}. \`${p.category}\` demoted to L1 — ` +
      `every draft needs explicit approval again.`,
    { threadTs: p.thread_ts ?? undefined },
  );
  logger.info(
    { draft: p.draft_id, category: p.category, reactor },
    'autonomy: L2 hold vetoed',
  );
  return true;
}

export function startAutonomySweep(deps: AutonomyDeps): void {
  if (sweepTimer) return;
  const interval = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
  sweepTimer = setInterval(() => {
    autonomyTick(deps).catch((err) =>
      logger.error({ err }, 'autonomy: sweep tick failed'),
    );
  }, interval);
  sweepTimer.unref?.();
  logger.info({ intervalMs: interval }, 'autonomy: sweep started');
}

export function stopAutonomySweep(): void {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = undefined;
}
