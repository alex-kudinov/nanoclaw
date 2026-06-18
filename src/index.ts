import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import {
  ASSISTANT_NAME,
  DATA_DIR,
  GMAIL_PUSH_WEBHOOK_SECRET,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_JID,
  IDLE_TIMEOUT,
  JOB_REPORT_CHANNEL,
  JOBS_FILE,
  MAX_CONCURRENT_CONTAINERS,
  POLL_INTERVAL,
  PROPOSAL_FOLLOWUP_CHANNEL_JID,
  PROPOSAL_FOLLOWUP_ENABLED,
  PROPOSAL_FOLLOWUP_EXPIRE_DAYS,
  PROPOSAL_FOLLOWUP_HOUR,
  PROPOSAL_FOLLOWUP_MAX_PER_RUN,
  RECOVERY_RESERVED_SLOTS,
  SLACK_ONLY,
  TRIGGER_PATTERN,
  WEBHOOK_PORT,
  WEBHOOK_SECRET,
  WEBHOOKS_FILE,
} from './config.js';
import './channels/index.js';
import {
  getChannelFactory,
  getRegisteredChannelNames,
} from './channels/registry.js';
import {
  ContainerOutput,
  runContainerAgent,
  writeGroupsSnapshot,
  writeTasksSnapshot,
} from './container-runner.js';
import {
  cleanupOrphans,
  ensureContainerRuntimeRunning,
} from './container-runtime.js';
import {
  getAllChats,
  getAllRegisteredGroups,
  getAllSessions,
  getAllTasks,
  getJob,
  getMessagesSince,
  getNewMessages,
  getThreadParent,
  getRouterState,
  initDatabase,
  markStaleRunsAsFailed,
  setJobEnabled,
  setRegisteredGroup,
  setRouterState,
  setSession,
  storeChatMetadata,
  storeMessage,
  storeMessageDirect,
} from './db.js';
import { GroupQueue } from './group-queue.js';
import { startIpcWatcher } from './ipc.js';
import { loadJobRegistry, watchJobRegistry } from './job-registry.js';
import { handleEmailOpen as handleEmailOpenImpl } from './email-tracking.js';
import { handleUnsubscribe as handleUnsubscribeImpl } from './email-unsubscribe.js';
import { runJob } from './job-runner.js';
import { writeJobsSnapshot } from './job-snapshot.js';
import { WebhookServer } from './webhook-server.js';
import {
  archiveWebhook as archiveWebhookImpl,
  markDispatched as markDispatchedImpl,
  markFailed as markFailedImpl,
  markHandled as markHandledImpl,
} from './webhook-inbox.js';
import { runReaper as runWebhookInboxReaper } from './webhook-inbox-reaper.js';
import { runSweep as runTrafftSweep } from './trafft-sweeper.js';
import { startHeartbeat } from './heartbeat.js';
import { runNameReaper } from './contador-name-reaper.js';
import { runChaosReconcile } from './chaos-reconciler.js';
import type { ChaosReconcilerDeps } from './chaos-reconciler.js';
import { query } from './business-db.js';
import { SlackChannel } from './channels/slack.js';
import { handleGmailSend } from './gmail-ipc-handlers.js';
import { listOpenProposals, resolveRecipient } from './plutio-proposals.js';
import { generateFollowupEmail } from './proposal-followup-email.js';
import {
  getPendingByTs,
  markCancelled,
  markSent,
  pgFollowupStore,
} from './proposal-followup-store.js';
import {
  handleProposalApproval,
  handleProposalRejection,
  proposalFollowupTick,
  type ProposalFollowupDeps,
} from './proposal-followup.js';
import {
  findChannel,
  formatMessages,
  formatOutbound,
  excludeOwnGroupMessages,
  isUntaggedBotNoise,
} from './router.js';
import { isStatusCommand, formatPipelineStatus } from './pipeline-status.js';
import { startSchedulerLoop } from './task-scheduler.js';
import {
  Channel,
  NewMessage,
  RegisteredGroup,
  SendMessageOpts,
} from './types.js';
import { isValidGroupFolder } from './group-folder.js';
import { logger } from './logger.js';
import { readEnvFile } from './env.js';
import {
  isCircuitOpen,
  recordSuccess,
  recordFailure,
  setOnCooldownExpiry,
} from './circuit-breaker.js';
import { drainWatchdogKills, startWatchdogIpc } from './watchdog-ipc.js';

// Re-export for backwards compatibility during refactor
export { escapeXml, formatMessages } from './router.js';

let lastTimestamp = '';
let sessions: Record<string, string> = {};
let registeredGroups: Record<string, RegisteredGroup> = {};
let lastAgentTimestamp: Record<string, string> = {};
let messageLoopRunning = false;

const channels: Channel[] = [];
const queue = new GroupQueue();

function loadState(): void {
  lastTimestamp = getRouterState('last_timestamp') || '';
  const agentTs = getRouterState('last_agent_timestamp');
  try {
    lastAgentTimestamp = agentTs ? JSON.parse(agentTs) : {};
  } catch {
    logger.warn('Corrupted last_agent_timestamp in DB, resetting');
    lastAgentTimestamp = {};
  }

  // Migration: remap bare keys to composite keys (key → key||root)
  const migrated: Record<string, string> = {};
  let needsMigration = false;
  for (const [key, value] of Object.entries(lastAgentTimestamp)) {
    if (key.includes('||')) {
      migrated[key] = value;
    } else {
      migrated[`${key}||root`] = value;
      needsMigration = true;
    }
  }
  if (needsMigration) {
    lastAgentTimestamp = migrated;
    logger.info('Migrated lastAgentTimestamp to composite keys');
  }

  sessions = getAllSessions();
  registeredGroups = getAllRegisteredGroups();
  logger.info(
    { groupCount: Object.keys(registeredGroups).length },
    'State loaded',
  );
}

function saveState(): void {
  setRouterState('last_timestamp', lastTimestamp);
  setRouterState('last_agent_timestamp', JSON.stringify(lastAgentTimestamp));
}

function registerGroup(jid: string, group: RegisteredGroup): void {
  registeredGroups[jid] = group;
  setRegisteredGroup(jid, group);

  // Create group folder
  const groupDir = path.join(DATA_DIR, '..', 'groups', group.folder);
  fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });

  logger.info(
    { jid, name: group.name, folder: group.folder },
    'Group registered',
  );
}

/**
 * Get available groups list for the agent.
 * Returns groups ordered by most recent activity.
 */
export function getAvailableGroups(): import('./container-runner.js').AvailableGroup[] {
  const chats = getAllChats();
  const registeredJids = new Set(Object.keys(registeredGroups));

  return chats
    .filter((c) => c.jid !== '__group_sync__' && c.is_group)
    .map((c) => ({
      jid: c.jid,
      name: c.name,
      lastActivity: c.last_message_time,
      isRegistered: registeredJids.has(c.jid),
    }));
}

/** @internal - exported for testing */
export function _setRegisteredGroups(
  groups: Record<string, RegisteredGroup>,
): void {
  registeredGroups = groups;
}

/**
 * Process all pending messages for a (chatJid, threadTs) pair.
 * Called by the GroupQueue when it's this group/thread's turn.
 */
async function processGroupMessages(
  chatJid: string,
  threadTs?: string,
): Promise<boolean> {
  const group = registeredGroups[chatJid];
  if (!group) return true;

  const channel = findChannel(channels, chatJid);
  if (!channel) {
    console.log(`Warning: no channel owns JID ${chatJid}, skipping messages`);
    return true;
  }

  const isMainGroup = group.isMain === true;
  const compositeKey = `${chatJid}||${threadTs || 'root'}`;

  const sinceTimestamp = lastAgentTimestamp[compositeKey] || '';
  const missedMessages = getMessagesSince(
    chatJid,
    sinceTimestamp,
    ASSISTANT_NAME,
    group.folder,
    threadTs,
  );

  if (missedMessages.length === 0) return true;

  // Skip if all pending messages are untagged bot noise — prevents no-op
  // container spawns (e.g. after restart when from_group is lost). A bot
  // message carrying a from_group is a cross-group handoff and must spawn.
  if (missedMessages.every((m) => isUntaggedBotNoise(m, ASSISTANT_NAME)))
    return true;

  // For non-main groups, check if trigger is required and present.
  // Threaded replies (threadTs != null) skip the trigger requirement.
  if (!isMainGroup && group.requiresTrigger !== false && !threadTs) {
    const hasTrigger = missedMessages.some((m) =>
      TRIGGER_PATTERN.test(m.content.trim()),
    );
    if (!hasTrigger) return true;
  }

  // For threaded replies, prepend the parent message so the agent has full context.
  // The parent (root) message has thread_ts IS NULL and won't be in the thread-filtered query.
  let messagesToFormat = missedMessages;
  if (threadTs) {
    const parent = getThreadParent(chatJid, threadTs);
    if (parent && !missedMessages.some((m) => m.id === parent.id)) {
      messagesToFormat = [parent, ...missedMessages];
    }
  }

  const prompt = formatMessages(messagesToFormat);

  // Advance cursor so the piping path in startMessageLoop won't re-fetch
  // these messages. Save the old cursor so we can roll back on error.
  const previousCursor = lastAgentTimestamp[compositeKey] || '';
  lastAgentTimestamp[compositeKey] =
    missedMessages[missedMessages.length - 1].timestamp;
  saveState();

  logger.info(
    { group: group.name, threadTs, messageCount: missedMessages.length },
    'Processing messages',
  );

  // Track idle timer for closing stdin when agent is idle
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      logger.debug(
        { group: group.name },
        'Idle timeout, closing container stdin',
      );
      queue.closeStdin(compositeKey);
    }, IDLE_TIMEOUT);
  };

  // Expose the closure-local resetIdleTimer to GroupQueue.sendMessage so
  // piped follow-up messages reset the idle countdown (T05).
  queue.setResetIdleTimer(compositeKey, resetIdleTimer);

  await channel.setTyping?.(chatJid, true);

  // Mechanical processing message — opt-in per group. Replaces the agent's
  // First-Response ack. Tagged fromGroup so the spawn guard drops it.
  const processingMessage = group.containerConfig?.processingMessage;
  if (processingMessage) {
    try {
      await channel.sendMessage(chatJid, `[PROCESSING] ${processingMessage}`, {
        fromGroup: group.folder,
        threadTs,
      });
    } catch (err) {
      logger.error(
        { err, group: group.folder },
        '[ERROR] processing-message post failed',
      );
    }
  }

  let hadError = false;
  let outputSentToUser = false;

  const output = await runAgent(
    group,
    prompt,
    chatJid,
    async (result) => {
      // Streaming output callback — called for each agent result.
      // Any result (even a null one) is proof-of-life for the frozen-container
      // detector. See GroupQueue.checkLiveness STALE_OUTPUT_THRESHOLD_MS.
      queue.setLastOutputAt(compositeKey);
      if (result.result) {
        const raw =
          typeof result.result === 'string'
            ? result.result
            : JSON.stringify(result.result);
        // Strip <internal>...</internal> blocks — agent uses these for internal reasoning
        const text = raw.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
        logger.info(
          { group: group.name },
          `Agent output: ${raw.slice(0, 200)}`,
        );
        if (text) {
          await channel.sendMessage(chatJid, text, {
            fromGroup: group.folder,
            threadTs,
          });
          outputSentToUser = true;
        }
        // Only reset idle timer on actual results, not session-update markers (result: null)
        resetIdleTimer();
      } else {
        // Null result = agent finished query, now idle.
        // Notify queue so pending tasks can preempt immediately
        // instead of waiting for the full idle timeout.
        queue.notifyIdle(compositeKey);
      }

      if (result.status === 'error') {
        hadError = true;
      }
    },
    threadTs,
  );

  await channel.setTyping?.(chatJid, false);
  if (idleTimer) clearTimeout(idleTimer);

  if (output === 'error' || hadError) {
    recordFailure(group.folder);
    if (outputSentToUser) {
      logger.warn(
        { group: group.name },
        'Agent error after output was sent, skipping cursor rollback to prevent duplicates',
      );
      return true;
    }
    lastAgentTimestamp[compositeKey] = previousCursor;
    saveState();
    logger.warn(
      { group: group.name },
      'Agent error, rolled back message cursor for retry',
    );
    return false;
  }

  recordSuccess(group.folder);
  return true;
}

async function runAgent(
  group: RegisteredGroup,
  prompt: string,
  chatJid: string,
  onOutput?: (output: ContainerOutput) => Promise<void>,
  threadTs?: string,
): Promise<'success' | 'error'> {
  const isMain = group.isMain === true;
  const sessionKey = `${group.folder}||${threadTs || 'root'}`;
  const sessionId = sessions[sessionKey];

  // Update tasks snapshot for container to read (filtered by group)
  const tasks = getAllTasks();
  writeTasksSnapshot(
    group.folder,
    isMain,
    tasks.map((t) => ({
      id: t.id,
      groupFolder: t.group_folder,
      prompt: t.prompt,
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
    })),
  );

  // Update jobs snapshot for container to read
  const ipcDir = path.join(DATA_DIR, 'ipc', group.folder);
  writeJobsSnapshot(ipcDir);

  // Update available groups snapshot (main group only can see all groups)
  const availableGroups = getAvailableGroups();
  writeGroupsSnapshot(
    group.folder,
    isMain,
    availableGroups,
    new Set(Object.keys(registeredGroups)),
  );

  // Wrap onOutput to track session ID from streamed results
  const wrappedOnOutput = onOutput
    ? async (output: ContainerOutput) => {
        if (output.newSessionId) {
          sessions[sessionKey] = output.newSessionId;
          setSession(sessionKey, output.newSessionId);
        }
        await onOutput(output);
      }
    : undefined;

  try {
    const output = await runContainerAgent(
      group,
      {
        prompt,
        sessionId,
        groupFolder: group.folder,
        chatJid,
        isMain,
      },
      (proc, containerName) => {
        const compositeKey = `${chatJid}||${threadTs || 'root'}`;
        queue.registerProcess(compositeKey, proc, containerName, group.folder);
      },
      wrappedOnOutput,
      () => {
        // Proof-of-life: any stdout chunk (incl. agent-runner heartbeat
        // every 30s) keeps lastOutputAt fresh so the freeze detector
        // doesn't kill agents that are busy waiting on a Claude call.
        const compositeKey = `${chatJid}||${threadTs || 'root'}`;
        queue.setLastOutputAt(compositeKey);
      },
    );

    if (output.newSessionId) {
      sessions[sessionKey] = output.newSessionId;
      setSession(sessionKey, output.newSessionId);
    }

    if (output.status === 'error') {
      logger.error(
        { group: group.name, error: output.error },
        'Container agent error',
      );
      return 'error';
    }

    return 'success';
  } catch (err) {
    logger.error({ group: group.name, err }, 'Agent error');
    return 'error';
  }
}

async function startMessageLoop(): Promise<void> {
  if (messageLoopRunning) {
    logger.debug('Message loop already running, skipping duplicate start');
    return;
  }
  messageLoopRunning = true;

  logger.info(`NanoClaw running (trigger: @${ASSISTANT_NAME})`);

  while (true) {
    try {
      const jids = Object.keys(registeredGroups);
      const { messages, newTimestamp } = getNewMessages(
        jids,
        lastTimestamp,
        ASSISTANT_NAME,
      );

      if (messages.length > 0) {
        logger.info({ count: messages.length }, 'New messages');

        // Advance the "seen" cursor for all messages immediately
        lastTimestamp = newTimestamp;
        saveState();

        // Group by (chat_jid, thread_ts) for thread-aware dispatch
        const messagesByThread = new Map<string, NewMessage[]>();
        for (const msg of messages) {
          const key = `${msg.chat_jid}||${msg.thread_ts || 'root'}`;
          const existing = messagesByThread.get(key);
          if (existing) {
            existing.push(msg);
          } else {
            messagesByThread.set(key, [msg]);
          }
        }

        for (const [compositeKey, threadMessages] of messagesByThread) {
          const [chatJid, rawThreadTs] = compositeKey.split('||');
          const threadTs = rawThreadTs === 'root' ? undefined : rawThreadTs;

          const group = registeredGroups[chatJid];
          if (!group) continue;

          // Filter out messages from this group's own agent
          const relevantMessages = excludeOwnGroupMessages(
            threadMessages,
            group.folder,
          );
          if (relevantMessages.length === 0) continue;

          const channel = findChannel(channels, chatJid);
          if (!channel) {
            console.log(
              `Warning: no channel owns JID ${chatJid}, skipping messages`,
            );
            continue;
          }

          // Host-handled introspection — answer `status` without spawning a
          // container so a latency report never pays the spawn cost it reports.
          const statusMsg = relevantMessages.find((m) =>
            isStatusCommand(m.content, ASSISTANT_NAME),
          );
          if (statusMsg) {
            try {
              const report = formatPipelineStatus({
                queue: queue.getStatus(),
                circuitBreaker: queue.getCircuitBreakerStatus(),
                channels: channels.map((ch) => ({
                  name: ch.name,
                  connected: ch.isConnected(),
                  lastActivitySec: ch.getLastActivitySec?.() ?? null,
                })),
                lastMessageAt: getRouterState('last_timestamp') ?? null,
                registeredGroups,
                nowMs: Date.now(),
              });
              await channel.sendMessage(chatJid, report, { threadTs });
            } catch (err) {
              logger.error({ err, chatJid }, 'status command failed');
            }
            lastAgentTimestamp[compositeKey] =
              relevantMessages[relevantMessages.length - 1].timestamp;
            saveState();
            continue;
          }

          const isMainGroup = group.isMain === true;
          const needsTrigger =
            !isMainGroup && group.requiresTrigger !== false && !threadTs;

          // Pull all messages since lastAgentTimestamp so non-trigger
          // context that accumulated between triggers is included.
          const allPending = getMessagesSince(
            chatJid,
            lastAgentTimestamp[compositeKey] || '',
            ASSISTANT_NAME,
            group.folder,
            threadTs,
          );
          // The threadMessages fallback is unfiltered by from_group; reuse
          // relevantMessages (already own-group-filtered above) so a host
          // echo tagged from_group=group.folder is never piped into the
          // group's own live container.
          const messagesToSend =
            allPending.length > 0 ? allPending : relevantMessages;
          const formatted = formatMessages(messagesToSend);

          // Try piping to an active container first — follow-up messages
          // in an ongoing conversation don't require a trigger.
          // sendMessage returns a PipedWriteResult — branch on .wrote, not
          // on the object itself (any object is truthy).
          const pipeResult = queue.sendMessage(compositeKey, formatted);
          if (pipeResult.wrote) {
            logger.info(
              {
                event: 'container.lifecycle.pipe.dispatch',
                chatJid,
                threadTs,
                count: messagesToSend.length,
                messageId: pipeResult.messageId,
              },
              'Piped messages to active container',
            );
            lastAgentTimestamp[compositeKey] =
              messagesToSend[messagesToSend.length - 1].timestamp;
            saveState();
            // Show typing indicator while the container processes the piped message
            channel
              .setTyping?.(chatJid, true)
              ?.catch((err) => logger.warn({ err }, 'setTyping failed'));
            continue;
          }

          // No active container — check trigger before spawning a new one.
          // Non-trigger messages accumulate in DB and get pulled as
          // context when a trigger eventually arrives.
          if (needsTrigger) {
            const hasTrigger = relevantMessages.some((m) =>
              TRIGGER_PATTERN.test(m.content.trim()),
            );
            if (!hasTrigger) continue;
          }

          // Circuit breaker: skip spawn if group is in cooldown after repeated failures
          if (isCircuitOpen(group.folder)) {
            logger.warn(
              { group: group.name, chatJid },
              'Circuit open, deferring messages until cooldown expires',
            );
            continue;
          }

          // Enqueue for a new container (thread-aware)
          queue.enqueueMessageCheck(chatJid, threadTs);
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error in message loop');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

interface RecoveryCandidate {
  chatJid: string;
  threadTs: string | undefined;
  group: RegisteredGroup;
  pendingCount: number;
  latestTimestamp: string;
  priority: number;
}

/**
 * Startup recovery: check for unprocessed messages in registered groups.
 * Handles crash between advancing lastTimestamp and processing messages.
 *
 * Sorted by priority so high-value groups (always-on minions, recently
 * active threads) spawn first. Limits the initial batch to leave at least
 * RECOVERY_RESERVED_SLOTS free for new incoming messages.
 */
function recoverPendingMessages(): void {
  const candidates: RecoveryCandidate[] = [];
  for (const [chatJid, group] of Object.entries(registeredGroups)) {
    // Check root (non-threaded) messages
    const rootKey = `${chatJid}||root`;
    const sinceTimestamp = lastAgentTimestamp[rootKey] || '';
    const pending = getMessagesSince(
      chatJid,
      sinceTimestamp,
      ASSISTANT_NAME,
      group.folder,
    );
    if (pending.length === 0) continue;

    // Sub-group by thread for per-thread recovery
    const threads = new Set<string | undefined>();
    for (const m of pending) threads.add(m.thread_ts || undefined);
    for (const threadTs of threads) {
      const key = `${chatJid}||${threadTs || 'root'}`;
      const threadSince = lastAgentTimestamp[key] || '';
      const threadPending = pending.filter(
        (m) =>
          (m.thread_ts || undefined) === threadTs && m.timestamp > threadSince,
      );
      if (threadPending.length === 0) continue;

      // Skip recovery only when every pending message is untagged bot noise
      // (a self-echo whose from_group was lost on restart). A human message,
      // or a bot message carrying a from_group (a cross-group handoff that
      // arrived before the crash), is actionable and must be recovered.
      const hasActionableMessage = threadPending.some(
        (m) => !isUntaggedBotNoise(m, ASSISTANT_NAME),
      );
      if (!hasActionableMessage) continue;

      // Priority 1: always-on agents (no trigger required) — keep these alive
      // Priority 2: anyone else with pending messages, sorted by recency
      // Priority 3: never (we filter out empty above)
      const priority = group.requiresTrigger === false ? 1 : 2;
      const latestTimestamp = threadPending[threadPending.length - 1].timestamp;
      candidates.push({
        chatJid,
        threadTs,
        group,
        pendingCount: threadPending.length,
        latestTimestamp,
        priority,
      });
    }
  }

  if (candidates.length === 0) return;

  // Sort: priority asc (1 first), then most recent timestamp desc
  try {
    candidates.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.latestTimestamp < b.latestTimestamp ? 1 : -1;
    });
  } catch (err) {
    logger.error(
      { err, candidateCount: candidates.length },
      'Recovery sort failed, falling back to unsorted order',
    );
  }

  // Clamp reserved slots to a sensible range. If misconfigured higher than
  // MAX_CONCURRENT_CONTAINERS, we'd never spawn anything during recovery.
  let reservedSlots = RECOVERY_RESERVED_SLOTS;
  if (reservedSlots < 0) {
    logger.error(
      { configured: RECOVERY_RESERVED_SLOTS },
      'RECOVERY_RESERVED_SLOTS < 0, clamping to 0',
    );
    reservedSlots = 0;
  } else if (reservedSlots >= MAX_CONCURRENT_CONTAINERS) {
    logger.warn(
      { configured: RECOVERY_RESERVED_SLOTS, max: MAX_CONCURRENT_CONTAINERS },
      'RECOVERY_RESERVED_SLOTS >= MAX_CONCURRENT_CONTAINERS, clamping',
    );
    reservedSlots = Math.max(0, MAX_CONCURRENT_CONTAINERS - 1);
  }
  const initialBatch = Math.max(0, MAX_CONCURRENT_CONTAINERS - reservedSlots);

  let spawned = 0;
  let deferred = 0;
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    try {
      const willSpawn = i < initialBatch;
      logger.info(
        {
          group: candidate.group.name,
          threadTs: candidate.threadTs,
          pendingCount: candidate.pendingCount,
          priority: candidate.priority,
          batchPosition: i,
          deferred: !willSpawn,
        },
        'Recovery: enqueuing unprocessed messages',
      );
      if (willSpawn) {
        queue.enqueueMessageCheck(candidate.chatJid, candidate.threadTs);
        spawned++;
      } else {
        // Park in waitingGroups so a slot stays reserved for new traffic;
        // drainWaiting() picks them up as containers finish.
        queue.deferMessageCheck(candidate.chatJid, candidate.threadTs);
        deferred++;
      }
    } catch (err) {
      logger.error(
        { err, group: candidate.group.name },
        'Recovery enqueue failed for candidate',
      );
    }
  }

  logger.info(
    {
      event: 'container.lifecycle.recovery_batch',
      spawned,
      deferred,
      reservedSlots,
      totalCandidates: candidates.length,
    },
    'Recovery batch enqueued',
  );
}

function startWatchdog(): void {
  const heartbeatPath = path.join(DATA_DIR, 'heartbeat.json');
  setInterval(() => {
    const heapUsed = process.memoryUsage().heapUsed;
    const data = JSON.stringify({
      pid: process.pid,
      ts: Date.now(),
      uptime: process.uptime(),
      heapUsed,
    });
    fs.writeFileSync(heartbeatPath, data);

    const heapUsedMB = Math.round(heapUsed / 1024 / 1024);
    if (heapUsed > 400 * 1024 * 1024) {
      logger.warn({ heapUsedMB }, 'High memory usage detected');
    }
  }, 30_000);
  logger.info('Watchdog heartbeat started');
}

function ensureContainerSystemRunning(): void {
  ensureContainerRuntimeRunning();
  cleanupOrphans();
}

/**
 * One chaos-reconciler invocation. Exported so the daemon-wireup test can
 * exercise the interval/startup callback without booting the daemon.
 */
export async function chaosReconcilerTick(
  deps: ChaosReconcilerDeps,
): Promise<void> {
  logger.debug('chaos-reconciler: tick');
  const res = await runChaosReconcile(deps);
  logger.info(
    { result: res },
    `chaos-reconciler end ${JSON.stringify(res.status)}`,
  );
}

async function main(): Promise<void> {
  ensureContainerSystemRunning();

  // Initialize DB before any handlers that use it (webhook server, IPC, etc.)
  initDatabase();
  logger.info('Database initialized');

  // Start webhook server — listens on all interfaces (including Tailscale)
  // for inbound trigger events from Tailscale-connected machines.
  const heartbeatPath = path.join(DATA_DIR, 'heartbeat.json');
  const webhookServer = new WebhookServer({
    port: WEBHOOK_PORT,
    webhooksFile: WEBHOOKS_FILE,
    globalSecret: WEBHOOK_SECRET,
    heartbeatPath,
    getRegisteredGroups: () => registeredGroups,
    getHealth: () => {
      const channelHealth: Record<
        string,
        { connected: boolean; lastActivitySec: number | null }
      > = {};
      for (const ch of channels) {
        channelHealth[ch.name] = {
          connected: ch.isConnected(),
          lastActivitySec: ch.getLastActivitySec?.() ?? null,
        };
      }
      let activeContainers = 0;
      try {
        const out = execSync('container ls --format json', {
          timeout: 5000,
          encoding: 'utf8',
        });
        const list = JSON.parse(out);
        activeContainers = list.filter((c: any) =>
          c.configuration?.id?.startsWith('nanoclaw-'),
        ).length;
      } catch {
        /* container CLI unavailable */
      }
      // T06: surface GroupQueue internals + circuit breaker so the watchdog
      // can detect zombie containers, queue/runtime mismatches, and starvation.
      let queueStatus;
      try {
        queueStatus = queue.getStatus();
      } catch (err) {
        logger.error({ err }, 'queue.getStatus threw');
        queueStatus = { error: 'getStatus_failed' };
      }
      let circuitBreakerStatus;
      try {
        circuitBreakerStatus = queue.getCircuitBreakerStatus();
      } catch (err) {
        logger.error({ err }, 'getCircuitBreakerStatus threw');
        circuitBreakerStatus = {};
      }
      return {
        channels: channelHealth,
        activeContainers,
        lastMessageAt: getRouterState('last_timestamp') ?? null,
        queue: queueStatus,
        circuitBreaker: circuitBreakerStatus,
      };
    },
    runAgent: runContainerAgent,
    enqueueAgentTask: (groupJid, taskId, fn) =>
      queue.enqueueTask(groupJid, taskId, fn),
    registerProcess: (groupJid, proc, containerName, groupFolder) =>
      queue.registerProcess(groupJid, proc, containerName, groupFolder),
    sendMessage: async (jid, rawText, opts) => {
      const channel = findChannel(channels, jid);
      if (!channel) {
        logger.warn(
          { jid },
          'Webhook: no channel for JID, cannot send response',
        );
        return;
      }
      const text = formatOutbound(rawText);
      if (text) await channel.sendMessage(jid, text, opts);
    },
    ...(JOB_REPORT_CHANNEL
      ? {
          getHostJob: (name: string) => getJob(name),
          runHostJob: async (name: string, triggeredBy: string) => {
            const job = getJob(name);
            if (!job) {
              throw new Error(`Job not found: ${name}`);
            }
            return runJob(job, triggeredBy, {
              sendMessage: async (jid: string, text: string) => {
                const ch = findChannel(channels, jid);
                if (!ch) return;
                const formatted = formatOutbound(text);
                if (formatted) await ch.sendMessage(jid, formatted);
              },
              reportChannel: JOB_REPORT_CHANNEL,
              writeJobsSnapshot: () => {
                for (const [, group] of Object.entries(registeredGroups)) {
                  const ipcDir = path.join(DATA_DIR, 'ipc', group.folder);
                  writeJobsSnapshot(ipcDir);
                }
              },
            });
          },
        }
      : {}),
    handleEmailOpen: async (token: string, ua: string) => {
      // TODO: handleEmailOpenImpl no longer routes to the inbox agent (T04);
      // this sendToInbox closure is now unused and can be removed once the
      // 2-arg WebhookServerDeps.handleEmailOpen signature is confirmed stable.
      const sendToInbox = async (msg: string) => {
        const inboxEntry = Object.entries(registeredGroups).find(
          ([, g]) => g.folder === 'inbox',
        );
        if (!inboxEntry) {
          logger.warn('No inbox group registered, cannot route email open');
          return;
        }
        const ch = findChannel(channels, inboxEntry[0]);
        if (!ch) return;
        await ch.sendMessage(inboxEntry[0], msg);
      };
      await handleEmailOpenImpl(token, ua, sendToInbox);
    },
    handleUnsubscribe: handleUnsubscribeImpl,
    archiveWebhook: archiveWebhookImpl,
    markWebhookDispatched: markDispatchedImpl,
    markWebhookFailed: markFailedImpl,
    markWebhookHandled: markHandledImpl,
    gmailPushSecret: GMAIL_PUSH_WEBHOOK_SECRET,
    handleGmailPush: async (emailAddress: string, historyId: string) => {
      // Late-bound lookup: channels array is populated after webhook server
      // is constructed, so we resolve the gmail channel at call time.
      const gmailChannel = channels.find((c) => c.name === 'gmail') as
        | (Channel & {
            handlePushNotification?: (
              emailAddress: string,
              historyId: string,
            ) => Promise<void>;
          })
        | undefined;
      if (!gmailChannel?.handlePushNotification) {
        logger.warn(
          { emailAddress, historyId },
          'Gmail push received but channel is unavailable',
        );
        return;
      }
      await gmailChannel.handlePushNotification(emailAddress, historyId);
    },
  });
  await webhookServer.start();

  // Clean up orphaned job runs from a previous crash
  const staleRuns = markStaleRunsAsFailed(60);
  for (const stale of staleRuns) {
    if (stale.pid) {
      try {
        process.kill(stale.pid, 0); // check if alive
        process.kill(-stale.pid, 'SIGTERM'); // kill process group
        logger.info(
          { pid: stale.pid, job: stale.job_name },
          'Killed orphaned job process',
        );
      } catch {
        /* process already dead */
      }
    }
    if (stale.lockfile) {
      try {
        fs.unlinkSync(stale.lockfile);
        logger.info(
          { lockfile: stale.lockfile, job: stale.job_name },
          'Cleaned orphaned lockfile',
        );
      } catch {
        /* lockfile may not exist */
      }
    }
  }

  loadState();

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    await queue.shutdown(10000);
    cleanupOrphans();
    for (const ch of channels) await ch.disconnect();
    await webhookServer.stop().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Channel callbacks (shared by all channels)
  const channelOpts = {
    onMessage: (_chatJid: string, msg: NewMessage) => storeMessage(msg),
    onChatMetadata: (
      chatJid: string,
      timestamp: string,
      name?: string,
      channel?: string,
      isGroup?: boolean,
    ) => storeChatMetadata(chatJid, timestamp, name, channel, isGroup),
    onBotJoinedChannel: (jid: string, name: string) => {
      if (registeredGroups[jid]) return; // already registered

      // Derive folder from channel name; Slack names are already lowercase alnum+hyphens
      let folder = name
        .replace(/[^A-Za-z0-9_-]/g, '-')
        .replace(/^-+/, '')
        .slice(0, 63);

      if (!isValidGroupFolder(folder)) {
        logger.warn(
          { jid, name },
          'Auto-register: cannot derive valid folder from channel name',
        );
        return;
      }

      // Handle collision: same folder name, different JID
      const folderTaken = Object.values(registeredGroups).some(
        (g) => g.folder === folder,
      );
      if (folderTaken) {
        folder = `${folder}-${jid.replace('slack:', '').toLowerCase()}`.slice(
          0,
          63,
        );
        if (!isValidGroupFolder(folder)) {
          logger.warn(
            { jid, name, folder },
            'Auto-register: folder with suffix is invalid',
          );
          return;
        }
      }

      registerGroup(jid, {
        name,
        folder,
        trigger: TRIGGER_PATTERN.source,
        added_at: new Date().toISOString(),
      });
    },
    registerGroup,
    registeredGroups: () => registeredGroups,
  };

  // Create and connect all registered channels.
  // Each channel self-registers via the barrel import above.
  // Factories return null when credentials are missing, so unconfigured channels are skipped.
  for (const channelName of getRegisteredChannelNames()) {
    const factory = getChannelFactory(channelName)!;
    const channel = factory(channelOpts);
    if (!channel) {
      logger.warn(
        { channel: channelName },
        'Channel installed but credentials missing — skipping. Check .env or re-run the channel skill.',
      );
      continue;
    }
    channels.push(channel);
    await channel.connect();
  }
  if (channels.length === 0) {
    logger.fatal('No channels connected');
    process.exit(1);
  }

  // Daemon liveness beacon — upserts business_v2.daemon_heartbeat every 30s so
  // the self-healing healer (separate process) can detect a crashed daemon.
  // See docs/SELF-HEALING-DESIGN.md §4.2.
  startHeartbeat();

  // Webhook-inbox reaper — every 5 min, retries received/failed/stale-dispatched
  // rows, dead-letters to #gru-chief after MAX_ATTEMPTS=5. See
  // docs/WEBHOOK-RELIABILITY.md §3.4.
  const WEBHOOK_INBOX_REAPER_INTERVAL_MS = 5 * 60 * 1000;
  setInterval(() => {
    logger.debug('webhook-inbox-reaper: tick');
    runWebhookInboxReaper({
      webhooksFile: WEBHOOKS_FILE,
      getRegisteredGroups: () => registeredGroups,
      runAgent: runContainerAgent,
    }).catch((err) => {
      logger.error({ err }, 'webhook-inbox-reaper: unhandled error');
    });
  }, WEBHOOK_INBOX_REAPER_INTERVAL_MS);

  // Trafft sweeper — every 6h. Reconciles Trafft API state against
  // webhook_inbox; synthesizes missing events; advances watermark only on
  // full convergence. See docs/WEBHOOK-RELIABILITY.md §3.5.
  const TRAFFT_SWEEPER_INTERVAL_MS = 6 * 60 * 60 * 1000;
  setInterval(() => {
    logger.debug('trafft-sweeper: tick');
    runTrafftSweep({
      getRegisteredGroups: () => registeredGroups,
    }).catch((err) => {
      logger.error({ err }, 'trafft-sweeper: unhandled error');
    });
  }, TRAFFT_SWEEPER_INTERVAL_MS);

  // Contador name reaper — every 30 min + one-shot 90s after startup. Repairs
  // student names that lost the Heartbeat subscription-creation race (Stripe
  // populates customer.name AFTER firing payment_intent.succeeded). Idempotent;
  // patches the payments table + Student Roster. See
  // tools/contador/backfill-names.cjs.
  const NAME_REAPER_INTERVAL_MS = 30 * 60 * 1000;
  setInterval(() => {
    logger.debug('contador-name-reaper: tick');
    runNameReaper().catch((err) => {
      logger.error({ err }, 'contador-name-reaper: unhandled error');
    });
  }, NAME_REAPER_INTERVAL_MS);
  setTimeout(() => {
    runNameReaper().catch((err) => {
      logger.error({ err }, 'contador-name-reaper: startup invocation failed');
    });
  }, 90 * 1000);

  // Chaos reconciler — every 24h. Reconciles Chaos verified-visitor state
  // against business_v2; synthesizes sweep webhook_inbox rows for any visitor
  // missing a party; advances watermark only on full convergence. Backstop for
  // the push path (Chaos forward queue → n8n → /hook/chaos).
  const CHAOS_RECONCILER_INTERVAL_MS = 24 * 60 * 60 * 1000;
  const chaosReconcilerDeps: ChaosReconcilerDeps = {
    getRegisteredGroups: () => registeredGroups,
  };
  setInterval(() => {
    chaosReconcilerTick(chaosReconcilerDeps).catch((err) => {
      logger.error({ err }, 'chaos-reconciler: unhandled error');
    });
  }, CHAOS_RECONCILER_INTERVAL_MS);
  // Required one-shot 60s after startup. Its own .catch swallows a startup-time
  // failure (toolbox .env missing, TOOLBOX_DIR unresolvable, Chaos unreachable)
  // so it can never crash or abort daemon boot — the 24h tick retries.
  setTimeout(() => {
    chaosReconcilerTick(chaosReconcilerDeps).catch((err) => {
      logger.error({ err }, 'chaos-reconciler: startup invocation failed');
    });
  }, 60 * 1000);

  // Proposal follow-up — daily approval-gated nudges for open (pending) Plutio
  // proposals that have gone unsigned. Drafts post to #gru-sales; a ✅ reaction
  // sends via the Gmail path. A cold proposal is auto-cancelled in our records a
  // week after the breakup email. See docs/PROPOSAL-FOLLOWUP-DESIGN.md.
  if (PROPOSAL_FOLLOWUP_ENABLED) {
    const slack = channels.find(
      (c): c is SlackChannel => c instanceof SlackChannel,
    );
    if (!slack) {
      logger.warn('proposal-followup: no Slack channel; feature disabled');
    } else {
      const channelJid = PROPOSAL_FOLLOWUP_CHANNEL_JID;
      const proposalDeps: ProposalFollowupDeps = {
        listOpenProposals,
        resolveRecipient,
        generateEmail: (ctx) => generateFollowupEmail(ctx),
        resolvePartyId: async (email) => {
          try {
            const res = await query<{ id: number | null }>(
              'SELECT business_v2.best_party_by_email($1::citext) AS id',
              [email],
            );
            return res.rows[0]?.id ?? null;
          } catch (err) {
            logger.warn({ err }, 'proposal-followup: party lookup failed');
            return null;
          }
        },
        postDraft: (text) => slack.postTracked(channelJid, text),
        postNotice: async (text) => {
          await slack.sendMessage(channelJid, text);
        },
        store: pgFollowupStore,
        maxPerRun: PROPOSAL_FOLLOWUP_MAX_PER_RUN,
        expireDays: PROPOSAL_FOLLOWUP_EXPIRE_DAYS,
      };

      // ✅ on a proposal draft → send the email via the Gmail path (which logs
      // the outbound interaction + tracking pixel), then mark it sent.
      slack.registerApprovalListener((ts, reactor) =>
        handleProposalApproval(ts, reactor, {
          getPendingByTs,
          sendEmail: async (d) => {
            await handleGmailSend({
              type: 'gmail_send',
              groupFolder: 'sales',
              timestamp: new Date().toISOString(),
              to: d.recipientEmail,
              subject: d.subject,
              body: d.body,
              markdown: true,
              emailType: 'follow-up',
              leadId: d.partyId ?? undefined,
            });
            return { messageId: '', threadId: '' };
          },
          markSent,
          postThread: async (slackTs, text) => {
            await slack.sendMessage(channelJid, text, { threadTs: slackTs });
          },
        }),
      );

      // 👎 on a proposal draft → skip it (stop follow-ups for that proposal).
      slack.registerRejectListener((ts, reactor) =>
        handleProposalRejection(ts, reactor, {
          getPendingByTs,
          markCancelled,
          postThread: async (slackTs, text) => {
            await slack.sendMessage(channelJid, text, { threadTs: slackTs });
          },
        }),
      );

      // Hourly tick; the pass itself runs once per day at/after the target hour.
      const PROPOSAL_FOLLOWUP_TICK_MS = 60 * 60 * 1000;
      setInterval(() => {
        proposalFollowupTick(proposalDeps, PROPOSAL_FOLLOWUP_HOUR).catch(
          (err) => {
            logger.error({ err }, 'proposal-followup: tick error');
          },
        );
      }, PROPOSAL_FOLLOWUP_TICK_MS);
      // First pass ~60s after startup (still gated to once/day at/after the
      // target hour by proposalFollowupTick), so a deploy is validated promptly
      // instead of waiting up to an hour for the first interval.
      setTimeout(() => {
        proposalFollowupTick(proposalDeps, PROPOSAL_FOLLOWUP_HOUR).catch(
          (err) => {
            logger.error(
              { err },
              'proposal-followup: startup invocation failed',
            );
          },
        );
      }, 60 * 1000);
      logger.info(
        { channelJid, hour: PROPOSAL_FOLLOWUP_HOUR },
        'proposal-followup: scheduled',
      );
    }
  }

  // Slack heartbeat — diagnostic signal for external watchdog.
  // Posts a status line every HEARTBEAT_INTERVAL_MS. Explicitly stored in DB
  // because Slack Socket Mode doesn't deliver bot self-messages as events.
  if (HEARTBEAT_JID) {
    setInterval(async () => {
      const ch = findChannel(channels, HEARTBEAT_JID);
      if (!ch) return;
      const uptimeSec = Math.round(process.uptime());
      const heapMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      const time = new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      });
      const msg = `🫀 ${time} | up ${uptimeSec}s | heap ${heapMB}MB | slack ${ch.isConnected() ? '✓' : '✗'}`;
      try {
        await ch.sendMessage(HEARTBEAT_JID, msg);
        storeMessageDirect({
          id: `heartbeat-${Date.now()}`,
          chat_jid: HEARTBEAT_JID,
          sender: ASSISTANT_NAME,
          sender_name: ASSISTANT_NAME,
          content: msg,
          timestamp: new Date().toISOString(),
          is_from_me: true,
          is_bot_message: true,
        });
      } catch {
        // Failure to send IS the signal — watchdog detects stale heartbeat in DB
      }
    }, HEARTBEAT_INTERVAL_MS);
    logger.info(
      { jid: HEARTBEAT_JID, intervalMs: HEARTBEAT_INTERVAL_MS },
      'Slack heartbeat started',
    );
  }

  // Shared helpers for job system — closed over channels/registeredGroups by reference
  const sendJobMessage = async (jid: string, text: string): Promise<void> => {
    const ch = findChannel(channels, jid);
    if (!ch) return;
    const formatted = formatOutbound(text);
    if (formatted) await ch.sendMessage(jid, formatted);
  };

  const doWriteJobsSnapshot = (): void => {
    for (const [, group] of Object.entries(registeredGroups)) {
      const ipcDir = path.join(DATA_DIR, 'ipc', group.folder);
      writeJobsSnapshot(ipcDir);
    }
  };

  const hostJobDeps = JOB_REPORT_CHANNEL
    ? {
        sendMessage: sendJobMessage,
        reportChannel: JOB_REPORT_CHANNEL,
        writeJobsSnapshot: doWriteJobsSnapshot,
      }
    : undefined;

  // Load job registry (if jobs.json exists)
  if (fs.existsSync(JOBS_FILE)) {
    const onJobDisabled = (jobName: string) => {
      if (JOB_REPORT_CHANNEL) {
        sendJobMessage(
          JOB_REPORT_CHANNEL,
          `:no_entry_sign: Job *${jobName}* disabled - removed from registry`,
        ).catch(() => {});
      }
    };
    loadJobRegistry(JOBS_FILE, onJobDisabled);
    watchJobRegistry(JOBS_FILE, onJobDisabled);
    logger.info({ path: JOBS_FILE }, 'Job registry loaded and watched');
  }

  // Start subsystems (independently of connection handler)
  startSchedulerLoop(
    {
      registeredGroups: () => registeredGroups,
      getSessions: () => sessions,
      queue,
      onProcess: (groupJid, proc, containerName, groupFolder) =>
        queue.registerProcess(groupJid, proc, containerName, groupFolder),
      sendMessage: async (jid, rawText, opts) => {
        const channel = findChannel(channels, jid);
        if (!channel) {
          console.log(
            `Warning: no channel owns JID ${jid}, cannot send message`,
          );
          return;
        }
        const text = formatOutbound(rawText);
        if (text) await channel.sendMessage(jid, text, opts);
      },
    },
    hostJobDeps,
  );
  startIpcWatcher({
    sendMessage: (jid, text, opts) => {
      const channel = findChannel(channels, jid);
      if (!channel) throw new Error(`No channel for JID: ${jid}`);
      return channel.sendMessage(jid, text, opts);
    },
    registeredGroups: () => registeredGroups,
    registerGroup,
    syncGroups: async (force: boolean) => {
      await Promise.all(
        channels
          .filter((ch) => ch.syncGroups)
          .map((ch) => ch.syncGroups!(force)),
      );
    },
    getAvailableGroups,
    writeGroupsSnapshot: (gf, im, ag, rj) =>
      writeGroupsSnapshot(gf, im, ag, rj),
    addWebhook: (def) => webhookServer.addWebhook(def),
    removeWebhook: (id) => webhookServer.removeWebhook(id),
    listWebhooks: () => webhookServer.listWebhooks(),
    acknowledgePipedMessage: (groupFolder, messageId) =>
      queue.acknowledgePipedMessage(groupFolder, messageId),
    setLastOutputAt: (groupFolder) =>
      queue.setLastOutputAtByFolder(groupFolder),
    ...(JOB_REPORT_CHANNEL
      ? {
          runHostJob: async (
            name: string,
            triggeredBy: string,
          ): Promise<void> => {
            const job = getJob(name);
            if (!job) return;
            runJob(job, triggeredBy, {
              sendMessage: sendJobMessage,
              reportChannel: JOB_REPORT_CHANNEL,
              writeJobsSnapshot: doWriteJobsSnapshot,
            }).catch((err) => {
              logger.error({ err, job: name }, 'IPC job run failed');
            });
          },
          setJobEnabled: (name: string, enabled: boolean) =>
            setJobEnabled(name, enabled),
        }
      : {}),
  });

  // Startup sequence (order matters — see plan T01/T04 startup verification):
  // 1. setProcessMessagesFn — drainGroup needs this
  // 2. setRollbackTimestampFn — dead-letter recovery uses this
  // 3. setOnCooldownExpiry — circuit breaker auto-recheck (T10)
  // 4. startLivenessChecker — must run AFTER all callbacks registered
  // 5. drainWatchdogKills — clear stale kill signals BEFORE recovery
  // 6. startWatchdogIpc — begin polling kill signal directory
  // 7. recoverPendingMessages — re-enqueue groups with pending messages
  // 8. startWatchdog — heartbeat writer
  // 9. startMessageLoop — main message poll
  queue.setProcessMessagesFn(processGroupMessages);
  queue.setRollbackTimestampFn((groupJid: string, isoTimestamp: string) => {
    const previous = lastAgentTimestamp[groupJid] || '';
    if (!previous || isoTimestamp < previous) {
      lastAgentTimestamp[groupJid] = isoTimestamp;
      saveState();
      logger.info(
        { groupJid, from: previous, to: isoTimestamp },
        'Dead-letter rollback: lastAgentTimestamp moved back',
      );
    } else {
      logger.debug(
        { groupJid, current: previous, requested: isoTimestamp },
        'Dead-letter rollback skipped — current cursor already earlier',
      );
    }
  });
  setOnCooldownExpiry((groupFolder: string) => {
    // After circuit cooldown expires, re-check pending messages for any
    // JID whose group folder matches. New incoming messages would already
    // trigger this naturally; we cover the case where messages arrived
    // during the open window and need a nudge to be processed.
    try {
      for (const [jid, group] of Object.entries(registeredGroups)) {
        if (group.folder === groupFolder) {
          queue.enqueueMessageCheck(jid);
        }
      }
    } catch (err) {
      logger.error({ err, groupFolder }, 'Cooldown expiry callback failed');
      // Re-record the failure so the circuit reopens rather than getting
      // stuck in half-open with a broken callback.
      try {
        recordFailure(groupFolder);
      } catch {
        /* ignore */
      }
    }
  });
  queue.startLivenessChecker();
  drainWatchdogKills(queue);
  startWatchdogIpc(queue);
  recoverPendingMessages();
  startWatchdog();
  startMessageLoop().catch((err) => {
    logger.fatal({ err }, 'startMessageLoop crashed');
    process.exit(1);
  });
}

// Guard: only run when executed directly, not when imported by tests
const isDirectRun =
  process.argv[1] &&
  new URL(import.meta.url).pathname ===
    new URL(`file://${process.argv[1]}`).pathname;

if (isDirectRun) {
  main().catch((err) => {
    logger.error({ err }, 'Failed to start NanoClaw');
    process.exit(1);
  });
}
