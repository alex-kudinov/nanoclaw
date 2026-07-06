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
  RECOVERY_LOOKBACK_MS,
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
  getLatestGroupResponse,
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
import { isIncidentProposal } from './healer/remediation.js';
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
import {
  listOpenProposals,
  resolveRecipient,
  setProposalStatus,
} from './plutio-proposals.js';
import { generateFollowupEmail } from './proposal-followup-email.js';
import { classifyReply, handleInboundReply } from './proposal-reply.js';
import {
  handleDeclineApproval,
  handleDeclineDismissal,
} from './proposal-reply-actions.js';
import {
  findReplyCandidates,
  getActionByTs,
  hasOpenAction,
  markActionDismissed,
  markActionDone,
  recordDeclineAction,
  stopFollowups,
} from './proposal-reply-store.js';
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
import {
  isSeoCommand,
  seoCommandReply,
  SEO_COMMAND_FOLDER,
} from './seo-stats.js';
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

// Thread key for grouping a message into a run. Threaded posts keep their
// thread_ts; for threadPerMessage groups a root post becomes its own thread
// (keyed by its own ts) so concurrent submissions never share a container and
// each reply threads under the post that triggered it; everyone else shares the
// 'root' bucket (unchanged behaviour).
function threadKeyFor(
  msg: NewMessage,
  group: RegisteredGroup | undefined,
): string {
  if (msg.thread_ts) return msg.thread_ts;
  return group?.containerConfig?.threadPerMessage ? msg.id : 'root';
}
let lastAgentTimestamp: Record<string, string> = {};

// Composite keys whose "[PROCESSING]" ack was already posted at dispatch time,
// so a submission waiting for a container slot across loop ticks only acks once.
// Cleared when the container finally spawns (processGroupMessages).
const ackedSpawns = new Set<string>();
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

  // Consume the dispatch-ack marker up front — every spawn-check consumes it,
  // including ones that find nothing to do. Consuming only on the spawn path
  // (as before) leaked the key on early returns, permanently suppressing the
  // next legitimate ack for root-bucket groups.
  const dispatchAcked = ackedSpawns.delete(compositeKey);

  const sinceTimestamp = lastAgentTimestamp[compositeKey] || '';
  let missedMessages = getMessagesSince(
    chatJid,
    sinceTimestamp,
    ASSISTANT_NAME,
    group.folder,
    threadTs,
  );

  // threadPerMessage root rescue: a first-time submission posted as a root message
  // has thread_ts=NULL, so the thread-filtered query above never returns it. Without
  // a follow-up reply (whose thread_ts DOES match) such a submission is never graded
  // — the early-return below fires and getThreadParent is never reached. (This is the
  // Susan M1P2 incident: a pasted-text submission sat stuck ~19min until a manual
  // "rerun this" reply triggered it; attachment submissions were masked by their
  // re-processing path.) If nothing matched but the thread's own root is newer than
  // our cursor and isn't our own echo, treat the root as the pending message.
  // Idempotent: once graded the cursor advances to the root's timestamp, so the
  // `root.timestamp > sinceTimestamp` guard prevents any re-processing.
  if (missedMessages.length === 0 && threadTs) {
    const root = getThreadParent(chatJid, threadTs);
    if (
      root &&
      root.timestamp > sinceTimestamp &&
      root.from_group !== group.folder &&
      !isUntaggedBotNoise(root, ASSISTANT_NAME)
    ) {
      missedMessages = [root];
    }
  }

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

  // Strip this group's own host-posted echoes (the "[PROCESSING]" ack carries
  // from_group=<folder>) from the container's INPUT context. Since the ack is now
  // posted at dispatch, it lands in the thread before the container reads context;
  // without this filter it leaks into the agent's <messages> and derails it
  // (e.g. the grader reacting to "[PROCESSING]" instead of grading the submission).
  const prompt = formatMessages(
    excludeOwnGroupMessages(messagesToFormat, group.folder),
  );

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
    }, group.containerConfig?.idleTimeout ?? IDLE_TIMEOUT);
  };

  // Expose the closure-local resetIdleTimer to GroupQueue.sendMessage so
  // piped follow-up messages reset the idle countdown (T05).
  queue.setResetIdleTimer(compositeKey, resetIdleTimer);

  await channel.setTyping?.(chatJid, true);

  // Mechanical processing message — opt-in per group. Normally posted at DISPATCH
  // time (in the message loop) so it's instant even when all container slots are
  // busy; `dispatchAcked` (consumed at function entry) is true when that already
  // happened. Only spawns that did NOT dispatch-ack (recovery/scheduled paths)
  // post it here as a fallback. Tagged fromGroup so the spawn guard drops the echo.
  const processingMessage = group.containerConfig?.processingMessage;
  if (processingMessage && !dispatchAcked) {
    channel
      .sendMessage(chatJid, `[PROCESSING] ${processingMessage}`, {
        fromGroup: group.folder,
        threadTs,
      })
      .catch((err) =>
        logger.error(
          { err, group: group.folder },
          '[ERROR] processing-message post failed',
        ),
      );
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

        // Group by (chat_jid, thread) for thread-aware dispatch. threadPerMessage
        // groups split each root post into its own thread (see threadKeyFor).
        const messagesByThread = new Map<string, NewMessage[]>();
        for (const msg of messages) {
          const key = `${msg.chat_jid}||${threadKeyFor(msg, registeredGroups[msg.chat_jid])}`;
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

          // Host-handled SEO stats for #gru-seo — zero-LLM, no container spawn
          // (mirrors the `status` command above). Answers `gsc` / `scoreboard`
          // / `seo` from the SEO data files the rescue/drain jobs maintain.
          if (group.folder === SEO_COMMAND_FOLDER) {
            const cmd = relevantMessages.find((m) =>
              isSeoCommand(m.content, ASSISTANT_NAME),
            );
            if (cmd) {
              try {
                const reply = seoCommandReply(cmd.content, ASSISTANT_NAME);
                if (reply)
                  await channel.sendMessage(chatJid, reply, {
                    threadTs,
                    fromGroup: group.folder,
                  });
              } catch (err) {
                logger.error({ err, chatJid }, 'seo command failed');
              }
              lastAgentTimestamp[compositeKey] =
                relevantMessages[relevantMessages.length - 1].timestamp;
              saveState();
              continue;
            }
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
          // group's own live container. Untagged bot noise (host-posted
          // status reports, echoes that lost their tag) is also dropped —
          // piping a "*NanoClaw pipeline status*" into a container mid-grade
          // derails the agent. A noise-only batch is consumed (cursor
          // advance) without piping, spawning, or acking.
          const rawToSend =
            allPending.length > 0 ? allPending : relevantMessages;
          const messagesToSend = rawToSend.filter(
            (m) => !isUntaggedBotNoise(m, ASSISTANT_NAME),
          );
          if (messagesToSend.length === 0) {
            lastAgentTimestamp[compositeKey] =
              rawToSend[rawToSend.length - 1].timestamp;
            saveState();
            continue;
          }
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

          // Post the "[PROCESSING]" ack HERE, at dispatch — not from the spawn
          // path — so it lands instantly even when every container slot is busy
          // (posting a Slack message needs no slot). Guarded by ackedSpawns so a
          // submission that waits across loop ticks for a slot only acks once;
          // cleared when the container spawns. Fire-and-forget to keep the loop fast.
          const pm = group.containerConfig?.processingMessage;
          if (pm && !ackedSpawns.has(compositeKey)) {
            ackedSpawns.add(compositeKey);
            channel
              .sendMessage(chatJid, `[PROCESSING] ${pm}`, {
                fromGroup: group.folder,
                threadTs,
              })
              .catch((err) =>
                logger.error(
                  { err, group: group.folder },
                  'dispatch processing-ack failed',
                ),
              );
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
    // Check root (non-threaded) messages. Cap the scan window: for
    // threadPerMessage groups every message maps to its own thread key, so the
    // root-bucket cursor never advances again after the switch — without a
    // floor, recovery re-scans the channel's entire history on every restart.
    // Anything older than the lookback that is genuinely unhandled needs a
    // human nudge anyway (grading is idempotent), so the floor is safe.
    const rootKey = `${chatJid}||root`;
    const sinceTimestamp = lastAgentTimestamp[rootKey] || '';
    const lookbackFloor = new Date(
      Date.now() - RECOVERY_LOOKBACK_MS,
    ).toISOString();
    const pending = getMessagesSince(
      chatJid,
      sinceTimestamp > lookbackFloor ? sinceTimestamp : lookbackFloor,
      ASSISTANT_NAME,
      group.folder,
    );
    if (pending.length === 0) continue;

    // Sub-group by thread for per-thread recovery (threadPerMessage groups split
    // each root post into its own thread, mirroring the live loop).
    const threadKeys = new Set<string>();
    for (const m of pending) threadKeys.add(threadKeyFor(m, group));
    for (const threadKey of threadKeys) {
      const threadTs = threadKey === 'root' ? undefined : threadKey;
      const key = `${chatJid}||${threadKey}`;
      const threadSince = lastAgentTimestamp[key] || '';
      const threadPending = pending.filter(
        (m) =>
          threadKeyFor(m, group) === threadKey && m.timestamp > threadSince,
      );
      if (threadPending.length === 0) continue;

      // Skip recovery only when every pending message is untagged bot noise
      // (a self-echo whose from_group was lost on restart, or a host-posted
      // status report). A human message, or a bot message carrying a
      // from_group (a cross-group handoff that arrived before the crash), is
      // actionable and must be recovered.
      const actionablePending = threadPending.filter(
        (m) => !isUntaggedBotNoise(m, ASSISTANT_NAME),
      );
      if (actionablePending.length === 0) continue;

      // Skip a thread the group has already answered. If its latest REAL response
      // (own output, not the "[PROCESSING]" ack) is newer than the newest actionable
      // inbound, the work is done — re-enqueuing here would spawn a noop container
      // that steals a slot + 768 MB from real work on every restart (the swarm that
      // buried chi-m3/Susan). Uses the minion's own reply as the completion signal,
      // so it covers the container path AND inline handlers whose work the per-thread
      // cursor never records (e.g. contador handling a webhook/handoff). A genuinely
      // unhandled thread — including an ungraded fresh root — has no real response
      // yet, so the root-rescue (processGroupMessages) still fires for it.
      // latestInbound is derived from ACTIONABLE messages only — an untagged
      // bot row (a host-posted status report landing in the thread after the
      // group's verdict) must not make an answered thread look pending again.
      const latestInbound =
        actionablePending[actionablePending.length - 1].timestamp;
      // Look up the group's response in the RIGHT scope. threadPerMessage groups
      // (grader) thread their replies under the ROOT post id — not the individual
      // message id that threadKeyFor produces — so resolve the thread root
      // (thread_ts of a reply, or id of the root itself). Non-threadPerMessage
      // groups (contador) post at channel root, so look channel-wide (undefined).
      const pm = actionablePending[0];
      const responseThreadTs = group.containerConfig?.threadPerMessage
        ? pm.thread_ts || pm.id
        : undefined;
      const lastResponse = getLatestGroupResponse(
        chatJid,
        group.folder,
        responseThreadTs,
      );
      // >= not >: the group's own latest response often shares the exact timestamp
      // of the newest thing recovery counts as "pending" (a self-referential ack like
      // "duplicate trigger - already handled"). At-or-after the newest actionable msg
      // means the thread is handled. A genuinely-new inbound always lands strictly
      // AFTER the last response, so this never skips real pending work.
      if (lastResponse && lastResponse >= latestInbound) {
        logger.info(
          { group: group.name, threadTs, lastResponse, latestInbound },
          'Recovery: skipping already-answered thread',
        );
        continue;
      }

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
    onInboundReply: PROPOSAL_FOLLOWUP_ENABLED
      ? async ({
          senderEmail,
          threadId,
          body,
        }: {
          senderEmail: string;
          threadId?: string;
          body: string;
        }) => {
          const slack = channels.find(
            (c): c is SlackChannel => c instanceof SlackChannel,
          );
          if (!slack) return;
          const jid = PROPOSAL_FOLLOWUP_CHANNEL_JID;
          const outcome = await handleInboundReply(
            { senderEmail, threadId, body },
            {
              findCandidates: findReplyCandidates,
              classify: (b, cands) => classifyReply(b, cands),
              hasOpenAction,
              recordDeclineAction,
              stopFollowups,
              postCard: (text) => slack.postTracked(jid, text),
              postNotice: async (text) => {
                await slack.sendMessage(jid, text);
              },
            },
          );
          if (outcome !== 'none') {
            logger.info({ senderEmail, outcome }, 'proposal-reply: processed');
          }
        }
      : undefined,
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

  // Healer incidents own their own approval polling (the healer's
  // runApprovals/runImplement read Slack reactions directly). Claim ✅/👍 on an
  // incident proposal so the daemon's generic agent-approval injection does NOT
  // also wake #gru-incidents' agent into a confused "noted — anything else?"
  // chit-chat. Returning true only suppresses that injection; the healer's
  // polling still performs the real approve/implement. See incident #561606.
  {
    const slackForIncidents = channels.find(
      (c): c is SlackChannel => c instanceof SlackChannel,
    );
    slackForIncidents?.registerApprovalListener((ts) => isIncidentProposal(ts));
  }

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
            const sent = await handleGmailSend({
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
            return {
              messageId: sent?.messageId ?? '',
              threadId: sent?.threadId ?? '',
            };
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

      // Inbound proposal replies: a decline card's ✅ sets Plutio = declined +
      // stops follow-ups; 👎 dismisses it.
      const declineDeps = {
        getActionByTs,
        setDeclined: (proposalId: string) =>
          setProposalStatus(proposalId, 'declined'),
        stopFollowups,
        markActionDone,
        markActionDismissed,
        postThread: async (slackTs: string, text: string) => {
          await slack.sendMessage(channelJid, text, { threadTs: slackTs });
        },
      };
      slack.registerApprovalListener((ts, reactor) =>
        handleDeclineApproval(ts, reactor, declineDeps),
      );
      slack.registerRejectListener((ts, reactor) =>
        handleDeclineDismissal(ts, reactor, declineDeps),
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
