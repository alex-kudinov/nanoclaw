/**
 * Host-handled `status` command. Answered in the message loop WITHOUT
 * spawning a container, so a pipeline-latency report never pays the
 * container-spawn latency it is reporting on.
 *
 * Surfaces live queue state (concurrency, active containers, waiting
 * groups, circuit breakers, channel health) plus the static structural
 * waits built into the routing path. See the chief→sales latency model.
 */
import {
  IDLE_TIMEOUT,
  IPC_POLL_INTERVAL,
  POLL_INTERVAL,
  TIMEZONE,
} from './config.js';
import type { QueueStatus } from './group-queue.js';

// Display-only mirror of ipc.ts's MAILMAN_HOLD_MS. ipc.ts owns the runtime
// behavior and reads this from process.env at its own module load (see the
// note there); we recompute it here purely for the structural-latency report.
const MAILMAN_HOLD_MS =
  (parseInt(process.env.MAILMAN_HOLD_SECONDS || '30', 10) || 0) * 1000;

const STATUS_TRIGGERS = new Set([
  'status',
  '/status',
  '!status',
  '.status',
  'pipeline status',
  'pipeline-status',
]);

/** True when a message is the operator's host-handled status command. */
export function isStatusCommand(text: string, assistantName?: string): boolean {
  let t = (text || '').trim().toLowerCase();
  if (!t) return false;
  // Strip an optional leading @mention (e.g. "@gru status").
  if (assistantName) {
    const mention = `@${assistantName.toLowerCase()}`;
    if (t.startsWith(mention)) t = t.slice(mention.length).trim();
  }
  t = t.replace(/[?.!]+$/, '').trim();
  return STATUS_TRIGGERS.has(t);
}

export interface ChannelHealth {
  name: string;
  connected: boolean;
  lastActivitySec: number | null;
}

export interface PipelineStatusInput {
  queue: QueueStatus;
  circuitBreaker: Record<
    string,
    { failures: number; open: boolean; cooldownRemainingMs: number | null }
  >;
  channels: ChannelHealth[];
  lastMessageAt: string | null;
  registeredGroups: Record<string, { name: string; folder: string }>;
  nowMs: number;
}

function ageStr(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m${s}s` : `${m}m`;
}

function nameForKey(
  compositeKey: string,
  groups: Record<string, { name: string }>,
): string {
  const chatJid = compositeKey.split('||')[0];
  const threaded = compositeKey.endsWith('||root') ? '' : ' (thread)';
  return (groups[chatJid]?.name ?? chatJid) + threaded;
}

function concurrencySection(q: QueueStatus): string[] {
  const free = q.maxConcurrent - q.activeCount;
  const head = `CONCURRENCY  ${q.activeCount}/${q.maxConcurrent} containers busy`;
  const note =
    free > 0
      ? '  ✓ slots free — new work spawns immediately'
      : `  ⚠ AT CAPACITY — ${q.waitingGroups.length} group(s) waiting for a slot to free (idle containers linger up to ${IDLE_TIMEOUT / 1000}s)`;
  return [head, note];
}

function activeSection(
  q: QueueStatus,
  groups: Record<string, { name: string }>,
): string[] {
  const active = Object.entries(q.groupStates).filter(([, s]) => s.active);
  if (active.length === 0) return ['ACTIVE CONTAINERS  none'];
  const lines = [`ACTIVE CONTAINERS (${active.length})`];
  for (const [key, s] of active) {
    const tags = [
      s.isTaskContainer
        ? 'task'
        : s.idleWaiting
          ? 'idle-wait'
          : s.adopted
            ? `adopted (state unknown; quiet ${ageStr(s.lastOutputAgeSec)}; evictable at capacity)`
            : 'processing',
    ];
    if (s.pipedMessageCount > 0) tags.push(`piped:${s.pipedMessageCount}`);
    if (s.retryCount > 0) tags.push(`retry:${s.retryCount}`);
    const what = s.spawnSnippet ? `  — "${s.spawnSnippet}"` : '';
    lines.push(
      `  • ${nameForKey(key, groups).padEnd(14)} age ${ageStr(s.containerAgeSec)}  ${tags.join('  ')}${what}`,
    );
  }
  return lines;
}

function waitingSection(
  q: QueueStatus,
  groups: Record<string, { name: string }>,
): string[] {
  if (q.waitingGroups.length === 0) return ['WAITING FOR A SLOT  none'];
  const names = q.waitingGroups.map((k) => nameForKey(k, groups)).join(', ');
  return [`WAITING FOR A SLOT (${q.waitingGroups.length})  ${names}`];
}

function circuitSection(
  cb: PipelineStatusInput['circuitBreaker'],
  groups: Record<string, { name: string; folder: string }>,
): string[] {
  const folderToName: Record<string, string> = {};
  for (const g of Object.values(groups)) folderToName[g.folder] = g.name;
  const open = Object.entries(cb).filter(([, s]) => s.open);
  if (open.length === 0)
    return [
      'CIRCUIT BREAKERS  all closed',
      '  (an open breaker = that group is in cooldown and will NOT spawn)',
    ];
  const lines = ['CIRCUIT BREAKERS  ⚠ OPEN'];
  for (const [folder, s] of open) {
    const secs = Math.ceil((s.cooldownRemainingMs ?? 0) / 1000);
    lines.push(
      `  • ${folderToName[folder] ?? folder}: in cooldown ~${secs}s (${s.failures} failures) — messages deferred`,
    );
  }
  return lines;
}

function channelSection(
  channels: ChannelHealth[],
  lastMessageAt: string | null,
  nowMs: number,
): string[] {
  const lines = ['CHANNELS'];
  for (const c of channels) {
    const act =
      c.lastActivitySec != null
        ? `last activity ${ageStr(c.lastActivitySec)} ago`
        : '';
    lines.push(
      `  • ${c.name.padEnd(8)} ${c.connected ? 'connected' : '⚠ DISCONNECTED'}  ${act}`,
    );
  }
  if (lastMessageAt) {
    const agoSec = Math.max(
      0,
      Math.floor((nowMs - Date.parse(lastMessageAt)) / 1000),
    );
    lines.push(`Last message processed: ${ageStr(agoSec)} ago`);
  }
  return lines;
}

function structuralSection(): string[] {
  return [
    'STRUCTURAL LATENCY (built-in waits before an agent even starts)',
    `  host message poll      ≤ ${(POLL_INTERVAL / 1000).toFixed(1)}s`,
    `  IPC handoff scan       ≤ ${(IPC_POLL_INTERVAL / 1000).toFixed(1)}s`,
    '  cold container spawn    ~1–3s (per message, no warm pool)',
    `  mailman handoff hold     ${MAILMAN_HOLD_MS / 1000}s  (only [HANDOFF: *→mailman])`,
    '  ── cold chief→sales floor: ~4–6s idle; +slot wait when at capacity',
  ];
}

/** Build the full plain-text status report for posting back to a channel. */
export function formatPipelineStatus(input: PipelineStatusInput): string {
  const when = new Date(input.nowMs).toLocaleString('en-US', {
    timeZone: TIMEZONE,
  });
  const blocks: string[][] = [
    [`*NanoClaw pipeline status*  (${when})`],
    concurrencySection(input.queue),
    activeSection(input.queue, input.registeredGroups),
    waitingSection(input.queue, input.registeredGroups),
    circuitSection(input.circuitBreaker, input.registeredGroups),
    channelSection(input.channels, input.lastMessageAt, input.nowMs),
    structuralSection(),
  ];
  if (input.queue.error)
    blocks.push([`(queue snapshot error: ${input.queue.error})`]);
  return blocks.map((b) => b.join('\n')).join('\n\n');
}
