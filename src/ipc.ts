import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { CronExpressionParser } from 'cron-parser';

import {
  DATA_DIR,
  GMAIL_TEST_RECIPIENT,
  IPC_POLL_INTERVAL,
  TIMEZONE,
} from './config.js';
import { AvailableGroup } from './container-runner.js';
import {
  assertExternalWriteAllowed,
  isExternalWriteDeniedError,
} from './action-safety.js';
import {
  assertManifestHostOperation,
  manifestAllowsHostOperation,
} from './capability-manifest.js';
import {
  claimEmailActionExecution,
  clearPendingSendsByRecipient,
  confirmEmailAction,
  createTask,
  deleteTask,
  failEmailAction,
  findPendingSendAction,
  getMessageById,
  getPendingSendByActionId,
  getTaskById,
  getPendingSendByGmailThread,
  markEmailActionHandoff,
  markPendingSendHandoff,
  storeMessageDirect,
  updateTask,
} from './db.js';
import { observeConfirmedSend, observeOutbound } from './send-watchdog.js';
import { hashApprovedEmailContent, isEmailActionId } from './email-action.js';
import { buildHostApprovedEmailExecution } from './approved-email-execution.js';
import {
  dispatchGmailIpc,
  isGmailIpcType,
  GmailIpcPayload,
} from './gmail-ipc-handlers.js';
import {
  authorizeGmailIpcWithResolver,
  propagateGmailResources,
} from './gmail-ipc-policy.js';
import { resolveDurableGmailResource } from './gmail-ipc-business-scope.js';
import {
  handleLearnLesson,
  handleRouteLesson,
  isLearnIpcType,
  isRouteLessonType,
  LearnLessonPayload,
  RouteLessonPayload,
} from './learn-ipc-handler.js';
import {
  dispatchClassifyIpc,
  isClassifyIpcType,
  ClassifyIpcPayload,
} from './classify-ipc-handlers.js';
import {
  dispatchProcurementIpc,
  isProcurementIpcType,
  ProcurementIpcPayload,
} from './procurement-ipc-handlers.js';
import {
  dispatchGraderFileMessage,
  GraderFileMessagePayload,
  isGraderFileMessageType,
} from './grader-file-message.js';
import {
  GRADER_GROUP_FOLDER,
  type GraderDeliveryRequest,
  type GraderDeliveryResult,
} from './grader-delivery.js';
import { getGraderRunContext } from './grader-run-context.js';
import {
  handleClassificationLesson,
  isClassificationLesson,
} from './classify-backfill.js';
import { isValidGroupFolder } from './group-folder.js';
import { logger } from './logger.js';
import { RegisteredGroup, SendMessageFn, WebhookDefinition } from './types.js';
import {
  approvalCardRejectedText,
  buildApprovedHandoff,
  isApprovalCard,
  parseApprovalCardRecipient,
} from './approved-send-handoff.js';
import { checkContent } from './email-content-guard.js';
import { resolveHumanAuthorizedDiscountTerms } from './human-commercial-term-authorization.js';
import {
  isSlackMessageOverLimit,
  SLACK_MESSAGE_MAX_LENGTH,
} from './slack-limits.js';

export interface IpcDeps {
  sendMessage: SendMessageFn;
  registeredGroups: () => Record<string, RegisteredGroup>;
  registerGroup: (jid: string, group: RegisteredGroup) => void;
  syncGroups: (force: boolean) => Promise<void>;
  getAvailableGroups: () => AvailableGroup[];
  writeGroupsSnapshot: (
    groupFolder: string,
    isMain: boolean,
    availableGroups: AvailableGroup[],
    registeredJids: Set<string>,
  ) => void;
  // Webhook management — optional so existing callers don't need to change
  addWebhook?: (def: WebhookDefinition) => void;
  removeWebhook?: (id: string) => boolean;
  listWebhooks?: () => WebhookDefinition[];
  // Job management — optional so existing callers don't need to change
  runHostJob?: (name: string, triggeredBy: string) => Promise<void>;
  setJobEnabled?: (name: string, enabled: boolean) => void;
  // Container liveness wiring — optional so existing callers don't need to change
  acknowledgePipedMessage?: (groupFolder: string, messageId: string) => void;
  setLastOutputAt?: (groupFolder: string) => void;
  resolveSourceThread?: (
    groupFolder: string,
    containerName: string,
  ) => { chatJid: string; threadTs?: string } | undefined;
  /** Deliver a follow-up through GroupQueue so it is targeted and dead-lettered. */
  deliverSourceInput?: (
    groupFolder: string,
    containerName: string,
    text: string,
  ) => boolean;
  // Host-generated Procurement card transport — optional so non-Slack tests and
  // configurations remain read-only.
  postProcurementReviewCard?: (
    text: string,
    threadKey: string,
  ) => Promise<{ channelJid: string; messageTs: string } | null>;
  postProcurementReviewThread?: (
    channelJid: string,
    threadTs: string,
    text: string,
  ) => Promise<string | undefined>;
  // Fixed-destination Slack file delivery for grader submissions. Optional so
  // non-Slack runtimes and existing unit tests stay inert.
  postGraderFileMessage?: (
    targetJid: string,
    text: string,
    file: Buffer,
    filename: string,
    sourceGroup: string,
  ) => Promise<{ messageTs: string; fileIds?: string[] }>;
  // Required for grader-to-grader text. Absence fails closed.
  deliverGraderOutput?: (
    request: GraderDeliveryRequest,
  ) => Promise<GraderDeliveryResult>;
}

let ipcWatcherRunning = false;

// Handoff/cancel markers tolerate either arrow form. Agents emit the Unicode
// "→" or the ASCII "->" interchangeably; a "→"-only matcher silently misrouted
// ASCII handoffs (e.g. [HANDOFF: booking->sales]) to the source's own channel.
const HANDOFF_ARROW = '(?:→|->)';
const HANDOFF_RE = new RegExp(
  `\\[HANDOFF:\\s*\\w+\\s*${HANDOFF_ARROW}\\s*(\\w+)\\]`,
);
const CANCEL_RE = new RegExp(
  `\\[CANCEL:\\s*(\\w+)\\s*${HANDOFF_ARROW}\\s*mailman\\]`,
);

// A [SALES REVIEW] approval card is operator-facing content for the source's
// own channel (#gru-sales) — never a routing directive. Its "ACTION ON
// APPROVAL" footer literally contains "[HANDOFF: sales→mailman]", and the
// unanchored HANDOFF_RE above matches that embedded marker: honoring it
// misrouted the whole card to mailman, which silently no-op'd it as "a preview,
// not an instruction" and stranded the lead with no visible/approvable draft
// (Bernard Suman silent stall, 2026-07-22). We key on the marker, NOT on
// position: 57 legitimate sends in the corpus prefix "Lead #N approved. "
// before the handoff marker, so an anchored regex would drop real emails.
/**
 * True when text is an approval card (operator-facing, destined for the
 * source group's own channel for human approval) rather than a routing
 * directive. Used to suppress handoff routing on a card whose footer embeds a
 * mailman handoff marker. Shares its marker set with the approval watchdog.
 */
export function isSalesReviewCard(text: string): boolean {
  return isApprovalCard(text);
}

// Mailman send-hold buffer. Held [HANDOFF: *→mailman] messages sit here
// for MAILMAN_HOLD_MS so an in-flight [CANCEL: *→mailman] from the same
// source can intercept the send. See project-mailman-approval-delay
// memory + the Marius Braun case (2026-04-27) for the cancel-race
// motivation. Set MAILMAN_HOLD_SECONDS=0 to disable.
//
// NOTE: read at module-load time from process.env (NOT config.ts) on purpose —
// ipc-handoff-echo.test.ts re-imports this module with a fresh env per test to
// exercise hold/no-hold paths. Centralizing into config.ts breaks that contract
// because the test mocks config.js. pipeline-status.ts mirrors this expression
// for display only.
const MAILMAN_HOLD_MS =
  (parseInt(process.env.MAILMAN_HOLD_SECONDS || '30', 10) || 0) * 1000;
interface HeldMailmanHandoff {
  timer: NodeJS.Timeout;
  sourceGroup: string;
  dedupKey: string;
}
const heldMailmanHandoffs = new Map<string, HeldMailmanHandoff>();

// Content hashes of mailman handoffs currently held or in-flight. A burst of
// byte-identical [HANDOFF: *→mailman] messages — e.g. an upstream re-trigger
// loop emitting the same handoff repeatedly — must collapse to ONE delivery.
// Without this, each duplicate file gets its own hold timer and its own flush.
const inFlightMailmanHandoffs = new Set<string>();

function mailmanHandoffKey(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/** Preserve an unauthorized request for forensics instead of executing it. */
function quarantineIpcFile(
  filePath: string,
  sourceGroup: string,
  family: string,
): string {
  const quarantineDir = path.join(DATA_DIR, 'ipc', 'quarantine', sourceGroup);
  fs.mkdirSync(quarantineDir, { recursive: true });
  const destination = path.join(
    quarantineDir,
    `${family}-${Date.now()}-${path.basename(filePath)}`,
  );
  fs.renameSync(filePath, destination);
  return destination;
}

/** Tell the calling agent that an asynchronous Gmail request was denied. */
function writeDeniedGmailInput(
  sourceGroup: string,
  operation: string,
  reason: string | undefined,
  sourceContainer?: string,
  deliverSourceInput?: IpcDeps['deliverSourceInput'],
): void {
  try {
    const text =
      `[${operation} DENIED] ${reason || 'host authorization failed'}. ` +
      'Do not retry with a different ID or address; escalate.';
    if (sourceContainer && deliverSourceInput) {
      if (deliverSourceInput(sourceGroup, sourceContainer, text)) return;
      logger.error(
        { sourceGroup, operation, sourceContainer },
        'Gmail denial target container is no longer active; result was not delivered to a sibling session',
      );
      return;
    }
    const inputDir = path.join(DATA_DIR, 'ipc', sourceGroup, 'input');
    fs.mkdirSync(inputDir, { recursive: true });
    const filename = `gmail-denied-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.json`;
    fs.writeFileSync(
      path.join(inputDir, filename),
      JSON.stringify(
        {
          type: 'message',
          target_container: sourceContainer || undefined,
          text,
        },
        null,
        2,
      ),
      'utf-8',
    );
    if (!sourceContainer) {
      logger.warn(
        { sourceGroup, operation },
        'Gmail denial has no source container; using legacy untargeted delivery',
      );
    }
  } catch (err) {
    logger.error(
      { err, sourceGroup, operation },
      'Failed to deliver Gmail authorization denial to calling agent',
    );
  }
}

/** Tell the calling agent that an asynchronous grader-file request was denied. */
function writeDeniedGraderFileInput(
  sourceGroup: string,
  reason: string | undefined,
): void {
  try {
    const inputDir = path.join(DATA_DIR, 'ipc', sourceGroup, 'input');
    fs.mkdirSync(inputDir, { recursive: true });
    const filename = `grader-file-denied-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.json`;
    fs.writeFileSync(
      path.join(inputDir, filename),
      JSON.stringify(
        {
          type: 'message',
          text:
            `[GRADER FILE DENIED] ${reason || 'host validation failed'}. ` +
            'The file was not posted. Correct the request and retry with exactly two nonblank lines: student name, then exact assignment label.',
        },
        null,
        2,
      ),
      'utf-8',
    );
  } catch (err) {
    logger.error(
      { err, sourceGroup },
      'Failed to deliver grader-file denial to calling agent',
    );
  }
}

/** Tell Sales exactly how to repair a rejected review card. */
function writeRejectedApprovalCardInput(
  sourceGroup: string,
  sourceContainer: string | undefined,
  deliverSourceInput: IpcDeps['deliverSourceInput'],
  reason = 'The review card is missing one exact Email, fenced Subject, or body.',
): void {
  const text =
    `[approval_card REJECTED] ${reason} ` +
    'The card was not posted and is not awaiting approval. Correct the full card and repost it now; do not claim success or send it to Mailman.';
  if (
    sourceContainer &&
    deliverSourceInput?.(sourceGroup, sourceContainer, text)
  ) {
    return;
  }
  logger.error(
    { sourceGroup, sourceContainer },
    'Rejected approval card could not be returned to its originating container',
  );
}

/** Confirm that host validation posted the exact card for human approval. */
function writeAcceptedApprovalCardInput(
  sourceGroup: string,
  sourceContainer: string | undefined,
  deliverSourceInput: IpcDeps['deliverSourceInput'],
  cardText: string,
): void {
  const leadId = /\bLead #(\d+)\b/.exec(cardText)?.[1];
  const artifact = leadId ? `Lead #${leadId} exact card` : 'The exact card';
  const text =
    `[approval_card ACCEPTED] ${artifact} was posted for human approval. ` +
    'Count it as a visible artifact; do not send it to Mailman or claim the email was sent. Continue the batch and emit the final receipt after every selected artifact is accepted.';
  if (
    sourceContainer &&
    deliverSourceInput?.(sourceGroup, sourceContainer, text)
  ) {
    return;
  }
  logger.warn(
    { sourceGroup, sourceContainer },
    'Accepted approval card could not be acknowledged to its originating container',
  );
}

// A handoff whose text carries an escalation/emergency marker is itself an
// urgent alert — the tidy "→ Routed to X" echo would be inappropriate noise,
// so it is suppressed for those.
export function isEmergencyToken(text: string): boolean {
  return /\[(ESCALATION|EMERGENCY)\]/i.test(text);
}

/**
 * Spawn merge-lessons.sh as a detached background process.
 * Called after both handleLearnLesson and handleRouteLesson to
 * merge lessons into KNOWLEDGE.md. The script uses a lock file
 * to prevent concurrent runs.
 */
function spawnMergeLessons(): void {
  const scriptPath = path.resolve('tools/merge-lessons.sh');
  if (!fs.existsSync(scriptPath)) {
    logger.warn('merge-lessons.sh not found, skipping merge');
    return;
  }
  try {
    const logPath = path.resolve('knowledge/shared/merge.log');
    const logFd = fs.openSync(logPath, 'a');
    const child = spawn(scriptPath, [], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: {
        ...process.env,
        PATH: '/opt/homebrew/bin:' + (process.env.PATH || ''),
      },
      cwd: process.cwd(),
    });
    child.unref();
    fs.closeSync(logFd);
    logger.info({ pid: child.pid }, 'merge-lessons.sh spawned');
  } catch (err) {
    logger.error({ err }, 'Failed to spawn merge-lessons.sh');
  }
}

export function startIpcWatcher(deps: IpcDeps): void {
  if (ipcWatcherRunning) {
    logger.debug('IPC watcher already running, skipping duplicate start');
    return;
  }
  ipcWatcherRunning = true;

  const ipcBaseDir = path.join(DATA_DIR, 'ipc');
  fs.mkdirSync(ipcBaseDir, { recursive: true });

  const processIpcFiles = async () => {
    // Scan all group IPC directories (identity determined by directory)
    let groupFolders: string[];
    try {
      groupFolders = fs.readdirSync(ipcBaseDir).filter((f) => {
        const stat = fs.statSync(path.join(ipcBaseDir, f));
        return stat.isDirectory() && f !== 'errors' && f !== 'quarantine';
      });
    } catch (err) {
      logger.error({ err }, 'Error reading IPC base directory');
      setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
      return;
    }

    const registeredGroups = deps.registeredGroups();

    // Build folder→isMain lookup from registered groups
    const folderIsMain = new Map<string, boolean>();
    for (const group of Object.values(registeredGroups)) {
      if (group.isMain) folderIsMain.set(group.folder, true);
    }

    for (const sourceGroup of groupFolders) {
      const isMain = folderIsMain.get(sourceGroup) === true;
      const messagesDir = path.join(ipcBaseDir, sourceGroup, 'messages');
      const tasksDir = path.join(ipcBaseDir, sourceGroup, 'tasks');

      // Process messages from this group's IPC directory
      try {
        if (fs.existsSync(messagesDir)) {
          const messageFiles = fs
            .readdirSync(messagesDir)
            .filter((f) => f.endsWith('.json'));
          // Any output file from an active container is proof-of-life for
          // the frozen-container watchdog. See GroupQueue.setLastOutputAt.
          if (messageFiles.length > 0) {
            deps.setLastOutputAt?.(sourceGroup);
          }
          for (const file of messageFiles) {
            const filePath = path.join(messagesDir, file);
            // Skip files already in the mailman send-hold buffer. Without
            // this guard, every 1s poll re-reads the held file and starts
            // another setTimeout, leaking ~30 timers over the 30s hold and
            // causing 30 duplicate flushes when the hold expires.
            if (heldMailmanHandoffs.has(filePath)) continue;
            // Validation is by CONTENT, not filename: the parse + dispatch
            // below routes recognized data.type values and the final else
            // deletes unknown types, while the catch moves malformed files
            // to errors/. Sanctioned IPC producers legitimately use varied
            // filenames (classify-{ts}.json, lesson-*.json, trafft-sweeper-*),
            // so a filename allowlist here only quarantines real commands.
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              if (
                !manifestAllowsHostOperation(
                  sourceGroup,
                  isMain,
                  String(data.type ?? ''),
                )
              ) {
                const quarantinedAt = quarantineIpcFile(
                  filePath,
                  sourceGroup,
                  'capability-denied',
                );
                logger.warn(
                  { sourceGroup, type: data.type, quarantinedAt },
                  'IPC message denied by capability manifest',
                );
                continue;
              }
              if (data.type === 'message' && data.chatJid && data.text) {
                // Resolve targetGroupFolder → chatJid if present
                let targetJid = data.chatJid;
                if (data.targetGroupFolder) {
                  const resolved = Object.entries(registeredGroups).find(
                    ([, g]) => g.folder === data.targetGroupFolder,
                  );
                  if (resolved) {
                    targetJid = resolved[0];
                  } else {
                    logger.warn(
                      {
                        targetGroupFolder: data.targetGroupFolder,
                        sourceGroup,
                      },
                      'IPC message target group not found',
                    );
                    fs.unlinkSync(filePath);
                    continue;
                  }
                }
                // A Sales work unit is keyed by the Slack thread that woke its
                // container. Default replies to that host-owned context when
                // the model omits thread_ts. The directory-derived group and
                // queue-registered container must both match, and cross-group
                // handoffs never inherit the source channel's thread.
                const sourceContext = deps.resolveSourceThread?.(
                  sourceGroup,
                  String(data.source_container ?? ''),
                );
                const sourceJid = Object.entries(registeredGroups).find(
                  ([, group]) => group.folder === sourceGroup,
                )?.[0];
                const outboundThreadTsFor = (outboundJid: string) => {
                  // A timestamp from one channel is meaningless authority in a
                  // different channel. Keep explicit or inherited context only
                  // for the source work unit's own destination; a cross-group
                  // handoff starts/uses the target's independent workflow.
                  if (!sourceJid || sourceJid !== outboundJid) return undefined;
                  return (
                    data.thread_ts ||
                    (sourceGroup === 'sales' &&
                    sourceContext?.chatJid === outboundJid
                      ? sourceContext?.threadTs
                      : undefined)
                  );
                };
                const hostWorkUnitThreadTsFor = (outboundJid: string) =>
                  sourceGroup === 'sales' &&
                  sourceJid === outboundJid &&
                  sourceContext?.chatJid === outboundJid
                    ? sourceContext.threadTs
                    : undefined;
                // [CANCEL: source→mailman] intercepts a held mailman handoff
                // from the same source within the hold window. Drop the held
                // file without forwarding; the cancel marker itself still
                // routes through to mailman so it has an audit trail.
                const cancelMatch = data.text.match(CANCEL_RE);
                if (cancelMatch) {
                  const cancelSource = cancelMatch[1];
                  let cancelledCount = 0;
                  for (const [
                    heldPath,
                    held,
                  ] of heldMailmanHandoffs.entries()) {
                    if (held.sourceGroup === cancelSource) {
                      clearTimeout(held.timer);
                      heldMailmanHandoffs.delete(heldPath);
                      inFlightMailmanHandoffs.delete(held.dedupKey);
                      try {
                        if (fs.existsSync(heldPath)) fs.unlinkSync(heldPath);
                      } catch {
                        /* held file already gone, race-safe */
                      }
                      cancelledCount++;
                    }
                  }
                  if (cancelledCount > 0) {
                    logger.info(
                      { cancelSource, cancelledCount },
                      'IPC mailman handoff(s) cancelled within hold window',
                    );
                  } else {
                    logger.warn(
                      { cancelSource },
                      'IPC mailman cancel arrived but no held handoff to drop — send already left',
                    );
                  }
                  // fall through: deliver the cancel to mailman for audit
                }
                // Deterministic handoff: [HANDOFF: source→target] routes to
                // target group. Accept either arrow form — agents (LLMs) emit
                // the Unicode "→" OR the ASCII "->" interchangeably; matching
                // only "→" silently dropped ASCII handoffs to the source's own
                // channel (booking→sales never reached sales — they piled up in
                // #gru-booking instead). See HANDOFF_ARROW.
                const handoffMatch = data.text.match(HANDOFF_RE);
                // GUARD: every approvable email card must reach the source's
                // own channel for human approval — never mailman — even though
                // its "ACTION ON APPROVAL" footer embeds "[HANDOFF: →mailman]".
                // Honoring that embedded marker misrouted the card to mailman,
                // which silently dropped it, leaving the lead with no approvable
                // draft (Bernard Suman, 2026-07-22). Force it to #gru-sales
                // regardless of the target the agent addressed. A genuine send
                // ("Lead #7 approved. [HANDOFF: sales→mailman] To:… Body:…")
                // carries no [SALES REVIEW] marker and still routes below.
                if (isSalesReviewCard(data.text)) {
                  const sourceEntry = Object.entries(registeredGroups).find(
                    ([, g]) => g.folder === sourceGroup,
                  );
                  if (sourceEntry) {
                    const approvedHandoff = buildApprovedHandoff(data.text);
                    if (!approvedHandoff) {
                      writeRejectedApprovalCardInput(
                        sourceGroup,
                        data.source_container,
                        deps.deliverSourceInput,
                      );
                      const recipient = parseApprovalCardRecipient(data.text);
                      await deps.sendMessage(
                        sourceEntry[0],
                        approvalCardRejectedText(
                          sourceEntry[1].name,
                          'This draft was not posted for approval because it is missing one exact Email, fenced Subject, or body.',
                        ),
                        {
                          fromGroup: sourceGroup,
                          threadTs: outboundThreadTsFor(sourceEntry[0]),
                          hostWorkUnitThreadTs: hostWorkUnitThreadTsFor(
                            sourceEntry[0],
                          ),
                          ...(recipient
                            ? { threadKey: `lead:${recipient}` }
                            : {}),
                        },
                      );
                      const quarantinedAt = quarantineIpcFile(
                        filePath,
                        sourceGroup,
                        'approval-card-malformed',
                      );
                      logger.error(
                        { sourceGroup, quarantinedAt },
                        'IPC guard: malformed approval card rejected before approval',
                      );
                      continue;
                    }
                    if (isSlackMessageOverLimit(data.text, sourceGroup)) {
                      const rejectionReason =
                        `The complete exact card exceeds Slack's ` +
                        `${SLACK_MESSAGE_MAX_LENGTH}-character limit and would be split into unapprovable fragments.`;
                      writeRejectedApprovalCardInput(
                        sourceGroup,
                        data.source_container,
                        deps.deliverSourceInput,
                        rejectionReason,
                      );
                      const recipient = parseApprovalCardRecipient(data.text);
                      await deps.sendMessage(
                        sourceEntry[0],
                        approvalCardRejectedText(
                          sourceEntry[1].name,
                          `This draft was not posted for approval because ${rejectionReason.charAt(0).toLowerCase()}${rejectionReason.slice(1)}`,
                        ),
                        {
                          fromGroup: sourceGroup,
                          threadTs: outboundThreadTsFor(sourceEntry[0]),
                          hostWorkUnitThreadTs: hostWorkUnitThreadTsFor(
                            sourceEntry[0],
                          ),
                          ...(recipient
                            ? { threadKey: `lead:${recipient}` }
                            : {}),
                        },
                      );
                      const quarantinedAt = quarantineIpcFile(
                        filePath,
                        sourceGroup,
                        'approval-card-overlong',
                      );
                      logger.error(
                        {
                          sourceGroup,
                          sourceContainer: data.source_container,
                          length: data.text.length,
                          quarantinedAt,
                        },
                        'IPC guard: overlong approval card rejected and returned to author',
                      );
                      continue;
                    }
                    const approvalThreadTs = hostWorkUnitThreadTsFor(
                      sourceEntry[0],
                    );
                    const contentCheck = checkContent(
                      approvedHandoff.subject,
                      approvedHandoff.body,
                      {
                        authorizedDiscountTerms:
                          sourceGroup === 'sales'
                            ? resolveHumanAuthorizedDiscountTerms(
                                sourceEntry[0],
                                approvalThreadTs,
                              )
                            : [],
                      },
                    );
                    if (!contentCheck.ok) {
                      const rejectionReason =
                        `The exact subject/body fail the host content guard: ` +
                        `${contentCheck.violations.join('; ')}.`;
                      // Unlike Slack's downstream defense-in-depth replacement,
                      // this branch still has the directory-derived source
                      // container. Return the failure to that exact Sales turn
                      // so it corrects and reposts instead of trusting the
                      // earlier file-queue acknowledgement.
                      writeRejectedApprovalCardInput(
                        sourceGroup,
                        data.source_container,
                        deps.deliverSourceInput,
                        rejectionReason,
                      );
                      const recipient = parseApprovalCardRecipient(data.text);
                      await deps.sendMessage(
                        sourceEntry[0],
                        approvalCardRejectedText(
                          sourceEntry[1].name,
                          `This draft was not posted for approval because ${rejectionReason.charAt(0).toLowerCase()}${rejectionReason.slice(1)}`,
                        ),
                        {
                          fromGroup: sourceGroup,
                          threadTs: outboundThreadTsFor(sourceEntry[0]),
                          hostWorkUnitThreadTs: hostWorkUnitThreadTsFor(
                            sourceEntry[0],
                          ),
                          ...(recipient
                            ? { threadKey: `lead:${recipient}` }
                            : {}),
                        },
                      );
                      const quarantinedAt = quarantineIpcFile(
                        filePath,
                        sourceGroup,
                        'approval-card-content',
                      );
                      logger.error(
                        {
                          sourceGroup,
                          sourceContainer: data.source_container,
                          violations: contentCheck.violations,
                          quarantinedAt,
                        },
                        'IPC guard: content-invalid approval card rejected and returned to author',
                      );
                      continue;
                    }
                    await deps.sendMessage(sourceEntry[0], data.text, {
                      fromGroup: sourceGroup,
                      threadTs: outboundThreadTsFor(sourceEntry[0]),
                      hostWorkUnitThreadTs: hostWorkUnitThreadTsFor(
                        sourceEntry[0],
                      ),
                      threadKey: data.thread_key,
                    });
                    writeAcceptedApprovalCardInput(
                      sourceGroup,
                      data.source_container,
                      deps.deliverSourceInput,
                      data.text,
                    );
                    logger.warn(
                      {
                        sourceGroup,
                        handoffTarget: handoffMatch?.[1],
                      },
                      handoffMatch
                        ? 'IPC guard: [SALES REVIEW] card carried an embedded handoff marker — routing suppressed, delivered to source channel for approval'
                        : 'IPC guard: [SALES REVIEW] card validated and delivered to source channel for approval',
                    );
                  } else {
                    const quarantinedAt = quarantineIpcFile(
                      filePath,
                      sourceGroup,
                      'sales-review-unroutable',
                    );
                    logger.error(
                      { sourceGroup, quarantinedAt },
                      'IPC guard: [SALES REVIEW] card but source group not registered — quarantined',
                    );
                    continue;
                  }
                  fs.unlinkSync(filePath);
                  continue;
                }
                if (handoffMatch) {
                  const handoffTarget = handoffMatch[1];
                  const handoffEntry = Object.entries(registeredGroups).find(
                    ([, g]) => g.folder === handoffTarget,
                  );
                  if (handoffEntry) {
                    const flushHandoff = async (): Promise<void> => {
                      let storedHandoffId: string | undefined;
                      await deps.sendMessage(handoffEntry[0], data.text, {
                        fromGroup: sourceGroup,
                        threadTs: outboundThreadTsFor(handoffEntry[0]),
                        threadKey: data.thread_key,
                      });
                      // Model-authored handoffs may carry Gmail identifiers, but
                      // they can transfer only resources the source group
                      // already received from the host.
                      propagateGmailResources(
                        sourceGroup,
                        handoffTarget,
                        data.text,
                      );
                      // Slack persists its own outbound via storeOutbound — a
                      // second store here would duplicate the row. Only direct-
                      // store for non-Slack targets (e.g. mailman's gmail jid),
                      // whose channel does not self-persist.
                      //
                      // Host-authored, so it is a bot message like any other.
                      // What makes it wake the target is that `from_group`
                      // differs from the channel's owning group — getNewMessages
                      // treats that as a cross-group handoff. The rule lives
                      // there, at the single consumer; do not special-case the
                      // flag here, or the same gap reappears on the next
                      // channel. (Lead #962 2026-07-30, Entry #871 2026-07-31.)
                      if (!handoffEntry[0].startsWith('slack:')) {
                        storedHandoffId = `ipc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                        storeMessageDirect({
                          id: storedHandoffId,
                          chat_jid: handoffEntry[0],
                          sender: sourceGroup,
                          sender_name: sourceGroup,
                          content: data.text,
                          timestamp: new Date().toISOString(),
                          is_from_me: false,
                          is_bot_message: true,
                          from_group: sourceGroup,
                          thread_ts: data.thread_ts,
                        });
                      }
                      if (handoffTarget === 'mailman') {
                        // A routed handoff is durable progress, not proof of a
                        // send. Record it only after target delivery/storage
                        // succeeds so the early watchdog can distinguish
                        // "Sales never called the tool" from "Mailman never
                        // claimed the stored handoff".
                        observeOutbound(
                          sourceGroup,
                          data.text,
                          storedHandoffId,
                          new Date(),
                          {
                            markHandoff: markPendingSendHandoff,
                            findAction: findPendingSendAction,
                            markActionHandoff: markEmailActionHandoff,
                          },
                        );
                      }
                      logger.info(
                        {
                          handoffTarget,
                          handoffJid: handoffEntry[0],
                          sourceGroup,
                        },
                        'IPC handoff routed to target group',
                      );
                    };
                    if (handoffTarget === 'mailman' && MAILMAN_HOLD_MS > 0) {
                      // Collapse byte-identical mailman handoffs to a single
                      // delivery. An upstream re-trigger loop can emit the same
                      // [HANDOFF: *→mailman] dozens of times; without this each
                      // duplicate gets its own hold timer and its own flush.
                      const dedupKey = mailmanHandoffKey(data.text);
                      if (inFlightMailmanHandoffs.has(dedupKey)) {
                        logger.warn(
                          { sourceGroup },
                          'Duplicate mailman handoff dropped — identical handoff already in flight',
                        );
                        try {
                          fs.unlinkSync(filePath);
                        } catch {
                          /* race-safe: file already gone */
                        }
                        continue;
                      }
                      inFlightMailmanHandoffs.add(dedupKey);
                      // Hold the send so an in-flight cancel from the same
                      // source can drop it. The file stays on disk during
                      // the hold (so a daemon restart preserves the handoff
                      // — it'll be re-picked up and re-held).
                      const timer = setTimeout(() => {
                        heldMailmanHandoffs.delete(filePath);
                        flushHandoff()
                          .then(() => {
                            try {
                              if (fs.existsSync(filePath))
                                fs.unlinkSync(filePath);
                            } catch (err) {
                              logger.error(
                                { err, filePath },
                                'IPC held mailman handoff: unlink after flush failed',
                              );
                            }
                          })
                          .catch((err) => {
                            logger.error(
                              { err, filePath },
                              'IPC held mailman handoff: flush failed',
                            );
                          })
                          .finally(() => {
                            inFlightMailmanHandoffs.delete(dedupKey);
                          });
                      }, MAILMAN_HOLD_MS);
                      heldMailmanHandoffs.set(filePath, {
                        timer,
                        sourceGroup,
                        dedupKey,
                      });
                      logger.info(
                        {
                          sourceGroup,
                          holdMs: MAILMAN_HOLD_MS,
                        },
                        'IPC mailman handoff held for cancel window',
                      );
                      continue; // do NOT unlink yet — flush handles it
                    }
                    await flushHandoff();
                  } else {
                    logger.warn(
                      { handoffTarget, sourceGroup },
                      'IPC handoff target group not found',
                    );
                  }
                } else {
                  // Normal message: send to resolved target
                  const targetGroup = registeredGroups[targetJid];
                  if (
                    targetGroup &&
                    sourceGroup === GRADER_GROUP_FOLDER &&
                    targetGroup.folder === GRADER_GROUP_FOLDER
                  ) {
                    if (!deps.deliverGraderOutput) {
                      throw new Error(
                        'Grader output boundary is unavailable; message not sent',
                      );
                    }
                    const runContext = getGraderRunContext(
                      data.run_id,
                      targetJid,
                      data.thread_ts,
                    );
                    const result = await deps.deliverGraderOutput({
                      jid: targetJid,
                      threadTs: data.thread_ts,
                      text: data.text,
                      source: 'ipc',
                      submissionContext: runContext
                        ? { studentName: runContext.studentName }
                        : undefined,
                    });
                    logger.info(
                      {
                        targetJid,
                        sourceGroup,
                        outcome: result.outcome,
                        kind: result.kind,
                        violations: result.violations,
                      },
                      'IPC grader message routed through the host output boundary',
                    );
                  } else if (targetGroup) {
                    await deps.sendMessage(targetJid, data.text, {
                      fromGroup: sourceGroup,
                      threadTs: outboundThreadTsFor(targetJid),
                      hostWorkUnitThreadTs: hostWorkUnitThreadTsFor(targetJid),
                      threadKey: data.thread_key,
                    });
                    logger.info(
                      {
                        targetJid,
                        targetFolder: targetGroup.folder,
                        sourceGroup,
                      },
                      'IPC message sent',
                    );
                  } else {
                    logger.warn(
                      { targetJid, sourceGroup },
                      'Unauthorized IPC message — target not registered',
                    );
                  }
                }
                fs.unlinkSync(filePath);
              } else if (isGraderFileMessageType(data.type)) {
                try {
                  // File authority is derived from the IPC directory, never a
                  // claimed payload field. Only the registered main group and
                  // chief may send, and the target is fixed to grader.
                  if (!isMain && sourceGroup !== 'chief') {
                    const quarantinedAt = quarantineIpcFile(
                      filePath,
                      sourceGroup,
                      'grader-file',
                    );
                    logger.warn(
                      { sourceGroup, quarantinedAt },
                      'Unauthorized grader file IPC quarantined',
                    );
                    continue;
                  }
                  if (!deps.postGraderFileMessage) {
                    throw new Error(
                      'Slack grader file transport is unavailable',
                    );
                  }
                  const graderEntry = Object.entries(registeredGroups).find(
                    ([, group]) => group.folder === 'grader',
                  );
                  if (!graderEntry) {
                    throw new Error('Registered grader group was not found');
                  }
                  const result = await dispatchGraderFileMessage(
                    sourceGroup,
                    data as GraderFileMessagePayload,
                    {
                      dataDir: DATA_DIR,
                      targetJid: graderEntry[0],
                      postGraderFileMessage: deps.postGraderFileMessage,
                    },
                  );
                  fs.unlinkSync(filePath);
                  logger.info(
                    {
                      sourceGroup,
                      status: result.status,
                      messageTs: result.receipt.messageTs,
                      idempotencyKey: result.receipt.idempotencyKey,
                    },
                    'Grader file IPC processed',
                  );
                } catch (err) {
                  writeDeniedGraderFileInput(
                    sourceGroup,
                    err instanceof Error ? err.message : String(err),
                  );
                  throw err;
                }
              } else if (isGmailIpcType(data.type)) {
                // Gmail IPC: capability and resource authorization is enforced
                // from the directory-derived source identity before dispatch.
                const chiefEntry = Object.entries(registeredGroups).find(
                  ([, g]) => g.folder === 'chief',
                );
                const postToChief = chiefEntry
                  ? async (text: string, threadTs?: string): Promise<void> => {
                      await deps.sendMessage(chiefEntry[0], text, {
                        fromGroup: 'chief',
                        threadTs,
                      });
                    }
                  : undefined;
                const postBoundaryFailure = async (text: string) => {
                  if (!postToChief) return;
                  try {
                    await postToChief(text);
                  } catch (err) {
                    logger.error(
                      { err, sourceGroup, type: data.type },
                      'Gmail boundary failure alert could not be posted',
                    );
                  }
                };
                const explicitActionId =
                  typeof data.actionId === 'string' &&
                  isEmailActionId(data.actionId)
                    ? data.actionId
                    : undefined;
                if (data.actionId !== undefined && !explicitActionId) {
                  const quarantinedAt = quarantineIpcFile(
                    filePath,
                    sourceGroup,
                    'gmail-action',
                  );
                  logger.warn(
                    { sourceGroup, type: data.type, quarantinedAt },
                    'Gmail IPC carried an invalid approved action identity',
                  );
                  writeDeniedGmailInput(
                    sourceGroup,
                    data.type,
                    'invalid approved email Action-ID',
                    data.source_container,
                    deps.deliverSourceInput,
                  );
                  await postBoundaryFailure(
                    `🚫 [EMAIL ACTION HELD] Mailman supplied an invalid Action-ID. Nothing was sent; correct the approval handoff rather than retrying the Gmail tool.`,
                  );
                  continue;
                }

                const isMailmanSendAction =
                  sourceGroup === 'mailman' &&
                  (data.type === 'gmail_send' || data.type === 'gmail_reply');
                let requestedContentSha256: string | undefined;
                if (
                  isMailmanSendAction &&
                  typeof data.subject === 'string' &&
                  typeof data.body === 'string'
                ) {
                  requestedContentSha256 = hashApprovedEmailContent(
                    data.subject,
                    data.body,
                  );
                }

                const approvedReplyBinding =
                  !explicitActionId &&
                  sourceGroup === 'mailman' &&
                  data.type === 'gmail_reply' &&
                  typeof data.threadId === 'string'
                    ? getPendingSendByGmailThread(data.threadId)
                    : undefined;
                let approvedAction = explicitActionId
                  ? getPendingSendByActionId(explicitActionId)
                  : approvedReplyBinding?.action;

                // When more than one approval shares a Gmail thread, raw
                // request bytes may identify one exact action but never become
                // execution authority. If they do not identify exactly one,
                // hold rather than choosing the oldest or newest card.
                if (
                  !approvedAction &&
                  approvedReplyBinding?.ambiguous &&
                  typeof data.body === 'string'
                ) {
                  const exactCandidates =
                    approvedReplyBinding.candidates.filter((candidate) =>
                      Boolean(
                        candidate.approvedSubject &&
                        candidate.approvedContentSha256 &&
                        hashApprovedEmailContent(
                          candidate.approvedSubject,
                          data.body,
                        ) === candidate.approvedContentSha256,
                      ),
                    );
                  if (exactCandidates.length === 1) {
                    approvedAction = exactCandidates[0];
                  } else {
                    const quarantinedAt = quarantineIpcFile(
                      filePath,
                      sourceGroup,
                      'gmail-action-ambiguous',
                    );
                    logger.error(
                      { sourceGroup, type: data.type, quarantinedAt },
                      'Gmail reply matches multiple approved actions; held for operator',
                    );
                    writeDeniedGmailInput(
                      sourceGroup,
                      data.type,
                      'multiple approved email actions share this Gmail thread',
                      data.source_container,
                      deps.deliverSourceInput,
                    );
                    await postBoundaryFailure(
                      `🚫 [EMAIL ACTION HELD] More than one approval shares this Gmail thread and the request does not identify exactly one. Nothing was sent.`,
                    );
                    continue;
                  }
                }

                let approvedContentSha256: string | undefined;
                if (isMailmanSendAction && typeof data.body === 'string') {
                  if (!approvedAction && requestedContentSha256) {
                    const matched = findPendingSendAction({
                      groupFolder: undefined,
                      recipient:
                        data.type === 'gmail_send' &&
                        typeof data.to === 'string'
                          ? data.to
                          : undefined,
                      gmailThreadId:
                        typeof data.threadId === 'string'
                          ? data.threadId
                          : undefined,
                      approvedContentSha256: requestedContentSha256,
                      includeConfirmed: true,
                    });
                    if (matched.ambiguous) {
                      const quarantinedAt = quarantineIpcFile(
                        filePath,
                        sourceGroup,
                        'gmail-action-ambiguous',
                      );
                      logger.error(
                        { sourceGroup, type: data.type, quarantinedAt },
                        'Gmail IPC matches multiple approved actions; held for operator',
                      );
                      writeDeniedGmailInput(
                        sourceGroup,
                        data.type,
                        'multiple approved email actions match this content',
                        data.source_container,
                        deps.deliverSourceInput,
                      );
                      await postBoundaryFailure(
                        `🚫 [EMAIL ACTION HELD] More than one approval matches a Mailman request. Nothing was sent; reconcile the approval threads before any retry.`,
                      );
                      continue;
                    }
                    approvedAction = matched.action;
                  }
                  if (!approvedAction) {
                    const context = findPendingSendAction({
                      recipient:
                        data.type === 'gmail_send' &&
                        typeof data.to === 'string'
                          ? data.to
                          : undefined,
                      gmailThreadId:
                        typeof data.threadId === 'string'
                          ? data.threadId
                          : undefined,
                    });
                    if (!context.ambiguous) approvedAction = context.action;
                  }
                }
                if (explicitActionId && !approvedAction) {
                  const quarantinedAt = quarantineIpcFile(
                    filePath,
                    sourceGroup,
                    'gmail-action-unknown',
                  );
                  logger.error(
                    { sourceGroup, type: data.type, quarantinedAt },
                    'Gmail IPC references an unknown approved action',
                  );
                  writeDeniedGmailInput(
                    sourceGroup,
                    data.type,
                    'approved email action was not found',
                    data.source_container,
                    deps.deliverSourceInput,
                  );
                  await postBoundaryFailure(
                    `🚫 [EMAIL ACTION HELD] Mailman referenced an unknown host action. Nothing was sent; return to the originating approval thread.`,
                  );
                  continue;
                }
                if (isMailmanSendAction && !approvedAction?.actionId) {
                  const quarantinedAt = quarantineIpcFile(
                    filePath,
                    sourceGroup,
                    'gmail-action-unbound',
                  );
                  logger.error(
                    { sourceGroup, type: data.type, quarantinedAt },
                    'Mailman Gmail send is not bound to one exact host-approved action',
                  );
                  writeDeniedGmailInput(
                    sourceGroup,
                    data.type,
                    'no exact host-approved email action is available',
                    data.source_container,
                    deps.deliverSourceInput,
                  );
                  await postBoundaryFailure(
                    `🚫 [EMAIL ACTION HELD] A Mailman request was not bound to one exact host-approved action. Nothing was sent. Approve the exact draft in its Slack thread before retrying.`,
                  );
                  continue;
                }
                const postActionStatus = async (
                  text: string,
                ): Promise<void> => {
                  if (!approvedAction) return;
                  try {
                    await deps.sendMessage(approvedAction.chatJid, text, {
                      fromGroup: approvedAction.groupFolder,
                      threadTs: approvedAction.threadTs,
                    });
                  } catch (err) {
                    // Slack status delivery is deliberately downstream of the
                    // durable action transition. A temporary Slack failure
                    // must never relabel a Gmail-confirmed action as uncertain
                    // or make the deleted IPC file look unprocessed.
                    logger.error(
                      { err, actionId: approvedAction.actionId },
                      'Approved email action status post failed',
                    );
                  }
                };

                // Terminal action state outranks card availability. In
                // particular, a confirmed replay must never be relabeled "was
                // NOT sent" because the old Slack card is missing, and a
                // superseded action must never execute its stale card.
                if (isMailmanSendAction && approvedAction?.actionId) {
                  if (approvedAction.state === 'confirmed') {
                    fs.unlinkSync(filePath);
                    await postActionStatus(
                      `✅ [EMAIL ALREADY SENT] Action ${approvedAction.actionId} already has Gmail receipt ${approvedAction.gmailMessageId ?? '(recorded)'}. No duplicate was sent.`,
                    );
                    continue;
                  }
                  if (
                    approvedAction.state === 'executing' ||
                    approvedAction.state === 'uncertain'
                  ) {
                    fs.unlinkSync(filePath);
                    await postActionStatus(
                      `⚠️ [EMAIL HELD] Action ${approvedAction.actionId} has an uncertain prior Gmail attempt. Reconcile the Gmail receipt before any retry.`,
                    );
                    continue;
                  }
                  if (approvedAction.state === 'blocked') {
                    fs.unlinkSync(filePath);
                    await postActionStatus(
                      `🚫 [EMAIL BLOCKED] Action ${approvedAction.actionId} was NOT sent: ${approvedAction.lastErrorCode ?? 'the action is blocked'}. Gmail was not called.`,
                    );
                    continue;
                  }
                }

                let executableData = data as GmailIpcPayload;
                if (isMailmanSendAction && approvedAction?.actionId) {
                  const approvedCard = getMessageById(
                    approvedAction.draftTs,
                    approvedAction.chatJid,
                  );
                  const execution = approvedCard
                    ? buildHostApprovedEmailExecution(
                        approvedAction,
                        approvedCard.content,
                        executableData,
                      )
                    : {
                        ok: false as const,
                        code: 'approved_card_missing',
                        reason: 'the exact approved Slack card is unavailable',
                      };
                  if (!execution.ok) {
                    failEmailAction(
                      approvedAction.actionId,
                      'blocked',
                      execution.code,
                      new Date().toISOString(),
                    );
                    fs.unlinkSync(filePath);
                    await postActionStatus(
                      `🚫 [EMAIL BLOCKED] Action ${approvedAction.actionId} was NOT sent: ${execution.reason}. Gmail was not called.`,
                    );
                    continue;
                  }
                  executableData = execution.payload;
                  approvedContentSha256 = execution.approvedContentSha256;
                  if (execution.correctedFields.length > 0) {
                    logger.warn(
                      {
                        actionId: approvedAction.actionId,
                        correctedFields: execution.correctedFields,
                      },
                      'Mailman Gmail fields replaced with immutable host-approved values',
                    );
                  }
                }
                const authorization = await authorizeGmailIpcWithResolver(
                  sourceGroup,
                  executableData,
                  async (group, request) =>
                    Boolean(
                      group === 'mailman' &&
                      approvedAction?.gmailThreadId &&
                      request.threadId === approvedAction.gmailThreadId &&
                      (request.type === 'gmail_reply' ||
                        request.type === 'gmail_send'),
                    ) || resolveDurableGmailResource(group, request),
                );
                if (!authorization.ok) {
                  const quarantinedAt = quarantineIpcFile(
                    filePath,
                    sourceGroup,
                    'gmail',
                  );
                  logger.warn(
                    {
                      sourceGroup,
                      type: data.type,
                      reason: authorization.reason,
                      quarantinedAt,
                    },
                    'Unauthorized Gmail IPC quarantined',
                  );
                  writeDeniedGmailInput(
                    sourceGroup,
                    data.type,
                    authorization.reason,
                    data.source_container,
                    deps.deliverSourceInput,
                  );
                  if (approvedAction?.actionId) {
                    failEmailAction(
                      approvedAction.actionId,
                      'blocked',
                      'gmail_authorization_denied',
                      new Date().toISOString(),
                    );
                    await postActionStatus(
                      `🚫 [EMAIL BLOCKED] Action ${approvedAction.actionId} was NOT sent: Gmail authorization was denied. Gmail was not called.`,
                    );
                  } else {
                    await postBoundaryFailure(
                      `🚫 [GMAIL REQUEST HELD] ${data.type} was denied by the host boundary. Its result was not delivered to another Mailman session.`,
                    );
                  }
                  continue;
                }
                try {
                  // This must precede claimEmailActionExecution. An emergency
                  // brake is a pre-execution hold, not an uncertain Gmail
                  // attempt, and must not consume the one-time action claim.
                  assertExternalWriteAllowed({
                    system: 'gmail',
                    actionClass: 'c3_external_communication',
                    source: 'host:gmail-ipc',
                  });
                } catch (err) {
                  if (!isExternalWriteDeniedError(err)) throw err;
                  const quarantinedAt = quarantineIpcFile(
                    filePath,
                    sourceGroup,
                    'gmail',
                  );
                  logger.warn(
                    {
                      sourceGroup,
                      type: data.type,
                      code: err.code,
                      quarantinedAt,
                    },
                    'Gmail IPC held by action safety control before execution claim',
                  );
                  writeDeniedGmailInput(
                    sourceGroup,
                    data.type,
                    `action safety control: ${err.code}`,
                    data.source_container,
                    deps.deliverSourceInput,
                  );
                  if (approvedAction?.actionId) {
                    failEmailAction(
                      approvedAction.actionId,
                      'blocked',
                      `action_safety_${err.code}`,
                      new Date().toISOString(),
                    );
                    await postActionStatus(
                      `🚫 [EMAIL HELD] Action ${approvedAction.actionId} was NOT sent: the host external-write safety control is active (${err.code}). Gmail was not called and the execution claim was not consumed.`,
                    );
                  } else {
                    await postBoundaryFailure(
                      `🚫 [GMAIL REQUEST HELD] ${data.type} was stopped by the host external-write safety control (${err.code}). Gmail was not called.`,
                    );
                  }
                  continue;
                }
                if (!chiefEntry) {
                  logger.error(
                    '[ERROR] gmail [EMAIL SENT]: chief group not registered',
                  );
                }
                if (approvedAction?.actionId) {
                  if (GMAIL_TEST_RECIPIENT) {
                    failEmailAction(
                      approvedAction.actionId,
                      'blocked',
                      'global_test_routing_active',
                      new Date().toISOString(),
                    );
                    fs.unlinkSync(filePath);
                    await postActionStatus(
                      `🚫 [EMAIL BLOCKED] Action ${approvedAction.actionId} was NOT sent because global Gmail test routing is active. Use the dedicated host transport canary; never redirect a customer-approved action.`,
                    );
                    continue;
                  }
                  if (!approvedContentSha256) {
                    failEmailAction(
                      approvedAction.actionId,
                      'blocked',
                      'approved_content_unverifiable',
                      new Date().toISOString(),
                    );
                    fs.unlinkSync(filePath);
                    await postActionStatus(
                      `🚫 [EMAIL BLOCKED] Action ${approvedAction.actionId} could not be matched byte-for-byte to the approved subject and body. It was NOT sent.`,
                    );
                    continue;
                  }
                  const claim = claimEmailActionExecution(
                    approvedAction.actionId,
                    approvedContentSha256,
                    approvedAction.recipient,
                    new Date().toISOString(),
                  );
                  if (claim.status === 'confirmed') {
                    fs.unlinkSync(filePath);
                    await postActionStatus(
                      `✅ [EMAIL ALREADY SENT] Action ${approvedAction.actionId} already has Gmail receipt ${claim.action.gmailMessageId ?? '(recorded)'}. No duplicate was sent.`,
                    );
                    continue;
                  }
                  if (claim.status === 'held') {
                    fs.unlinkSync(filePath);
                    const priorGmailAttempt = Boolean(
                      claim.action?.state === 'executing' ||
                      claim.action?.state === 'uncertain' ||
                      claim.action?.gmailMessageId ||
                      claim.action?.gmailResultThreadId,
                    );
                    if (
                      !priorGmailAttempt &&
                      claim.action?.state !== 'blocked'
                    ) {
                      failEmailAction(
                        approvedAction.actionId,
                        'blocked',
                        'execution_claim_held_pre_gmail',
                        new Date().toISOString(),
                      );
                    }
                    await postActionStatus(
                      priorGmailAttempt
                        ? `⚠️ [EMAIL HELD] Action ${approvedAction.actionId} was not retried: ${claim.reason}. Reconcile the Gmail receipt before any retry.`
                        : `🚫 [EMAIL BLOCKED] Action ${approvedAction.actionId} was NOT sent: ${claim.reason}. Gmail was not called.`,
                    );
                    continue;
                  }
                }

                fs.unlinkSync(filePath);
                try {
                  const contentGuardContext = {
                    authorizedDiscountTerms:
                      approvedAction?.groupFolder === 'sales'
                        ? resolveHumanAuthorizedDiscountTerms(
                            approvedAction.chatJid,
                            approvedAction.threadTs,
                          )
                        : [],
                  };
                  await dispatchGmailIpc(
                    {
                      ...executableData,
                      actionId: approvedAction?.actionId,
                      groupFolder: sourceGroup,
                      approvedRecipient: approvedAction?.recipient,
                    } as GmailIpcPayload,
                    postToChief,
                    async (receipt) => {
                      const confirmedRecipient =
                        approvedAction?.recipient ?? receipt.recipient;
                      if (receipt.actionId && confirmedRecipient) {
                        const confirmed = confirmEmailAction(
                          receipt.actionId,
                          confirmedRecipient,
                          receipt.messageId,
                          receipt.threadId,
                          new Date().toISOString(),
                        );
                        if (confirmed !== 1) {
                          throw new Error(
                            'Gmail accepted the message but the exact action receipt could not be committed',
                          );
                        }
                        await postActionStatus(
                          `✅ [EMAIL SENT] Action ${receipt.actionId} was accepted by Gmail. Receipt ${receipt.messageId}.`,
                        );
                      } else {
                        observeConfirmedSend(receipt.recipient, {
                          clearPendingSendsByRecipient,
                        });
                      }
                    },
                    async (failure) => {
                      if (!failure.actionId) return;
                      failEmailAction(
                        failure.actionId,
                        'blocked',
                        failure.code,
                        new Date().toISOString(),
                      );
                      await postActionStatus(
                        `🚫 [EMAIL BLOCKED] Action ${failure.actionId} failed the host ${failure.code.replaceAll('_', ' ')} check. It was NOT sent.`,
                      );
                    },
                    deps.deliverSourceInput,
                    contentGuardContext,
                  );
                } catch (err) {
                  if (approvedAction?.actionId) {
                    const current = getPendingSendByActionId(
                      approvedAction.actionId,
                    );
                    if (current?.state === 'confirmed') {
                      await postActionStatus(
                        `⚠️ [EMAIL SENT — FOLLOW-UP FAILED] Action ${approvedAction.actionId} has a durable Gmail receipt, but a post-send host update failed. Do NOT resend; reconcile the business interaction record.`,
                      );
                    } else {
                      failEmailAction(
                        approvedAction.actionId,
                        'uncertain',
                        'gmail_dispatch_error',
                        new Date().toISOString(),
                      );
                      await postActionStatus(
                        `⚠️ [EMAIL DELIVERY UNCERTAIN] Action ${approvedAction.actionId} encountered an error at the Gmail boundary. Do not retry until Gmail is reconciled for a receipt.`,
                      );
                    }
                  }
                  logger.error(
                    { err, sourceGroup, type: data.type },
                    'Gmail IPC dispatch failed after authorization',
                  );
                }
              } else if (isProcurementIpcType(data.type)) {
                if (sourceGroup !== 'procurement') {
                  const quarantinedAt = quarantineIpcFile(
                    filePath,
                    sourceGroup,
                    'procurement',
                  );
                  logger.warn(
                    { sourceGroup, type: data.type, quarantinedAt },
                    'Unauthorized Procurement IPC quarantined',
                  );
                  continue;
                }
                await dispatchProcurementIpc(
                  sourceGroup,
                  data as ProcurementIpcPayload,
                  {
                    postReviewCard: deps.postProcurementReviewCard,
                    postReviewThread: deps.postProcurementReviewThread,
                  },
                );
                fs.unlinkSync(filePath);
              } else if (isLearnIpcType(data.type)) {
                // Learning loop: append lesson to LEARNED.md
                fs.unlinkSync(filePath);
                // Conflict notifier: post adjudication asks to the lesson
                // target's own channel (falls back to log-only when the
                // group has no registered channel).
                const notifyConflict = async (
                  agentFolder: string,
                  text: string,
                ): Promise<void> => {
                  const entry = Object.entries(registeredGroups).find(
                    ([, g]) => g.folder === agentFolder,
                  );
                  if (entry) await deps.sendMessage(entry[0], text);
                };
                await handleLearnLesson(
                  {
                    ...data,
                    groupFolder: sourceGroup,
                  } as LearnLessonPayload,
                  notifyConflict,
                );
                spawnMergeLessons();
              } else if (isRouteLessonType(data.type)) {
                // Knowledge management: chief routes lessons to target agents
                fs.unlinkSync(filePath);
                if (sourceGroup !== 'chief') {
                  logger.warn(
                    { sourceGroup },
                    'route_lesson rejected — only chief can route lessons',
                  );
                } else {
                  const routedPayload = {
                    ...data,
                    groupFolder: sourceGroup,
                  } as RouteLessonPayload;
                  const notifyRouteConflict = async (
                    agentFolder: string,
                    text: string,
                  ): Promise<void> => {
                    const entry = Object.entries(registeredGroups).find(
                      ([, g]) => g.folder === agentFolder,
                    );
                    if (entry) await deps.sendMessage(entry[0], text);
                  };
                  await handleRouteLesson(routedPayload, notifyRouteConflict);
                  // T12: if the lesson targets mailman and looks like a
                  // classification rule, backfill past email_classifications
                  // rows that match the pattern. Errors are swallowed — the
                  // route_lesson path stays non-fatal.
                  if (
                    routedPayload.target_agents?.includes('mailman') &&
                    isClassificationLesson(
                      routedPayload.title,
                      routedPayload.rule,
                    )
                  ) {
                    try {
                      await handleClassificationLesson(routedPayload);
                    } catch (err) {
                      logger.error(
                        { err, lesson: routedPayload.title },
                        'classification backfill failed',
                      );
                    }
                  }
                  spawnMergeLessons();
                }
              } else if (isClassifyIpcType(data.type)) {
                // T09: classify_* IPCs from mailman — host records the
                // classification + applies the Gmail label + syncs to Hive.
                if (sourceGroup !== 'mailman') {
                  // Quarantine rather than delete for forensics
                  const quarantineDir = path.join(
                    DATA_DIR,
                    'ipc',
                    'quarantine',
                    sourceGroup,
                  );
                  fs.mkdirSync(quarantineDir, { recursive: true });
                  fs.renameSync(
                    filePath,
                    path.join(quarantineDir, path.basename(filePath)),
                  );
                  logger.warn(
                    { sourceGroup, type: data.type },
                    'classify_*: rejected non-mailman source, quarantined',
                  );
                  continue;
                }
                try {
                  await dispatchClassifyIpc(data as ClassifyIpcPayload);
                  fs.unlinkSync(filePath);
                } catch (err) {
                  logger.error(
                    { err, filePath },
                    'classify dispatch failed, moving to failed/',
                  );
                  const failedDir = path.join(
                    DATA_DIR,
                    'ipc',
                    'failed',
                    sourceGroup,
                  );
                  fs.mkdirSync(failedDir, { recursive: true });
                  fs.renameSync(
                    filePath,
                    path.join(failedDir, path.basename(filePath)),
                  );
                }
              } else {
                // Unknown type — delete to prevent infinite reprocessing
                logger.warn(
                  { type: data.type, sourceGroup },
                  'Unknown IPC message type',
                );
                fs.unlinkSync(filePath);
              }
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC message',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error(
          { err, sourceGroup },
          'Error reading IPC messages directory',
        );
      }

      // Process tasks from this group's IPC directory
      try {
        if (fs.existsSync(tasksDir)) {
          const taskFiles = fs
            .readdirSync(tasksDir)
            .filter((f) => f.endsWith('.json'));
          if (taskFiles.length > 0) {
            deps.setLastOutputAt?.(sourceGroup);
          }
          for (const file of taskFiles) {
            const filePath = path.join(tasksDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              // Pass source group identity to processTaskIpc for authorization
              await processTaskIpc(data, sourceGroup, isMain, deps);
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC task',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error({ err, sourceGroup }, 'Error reading IPC tasks directory');
      }

      // Process job IPC files from this group's IPC directory
      const jobsDir = path.join(ipcBaseDir, sourceGroup, 'jobs');
      try {
        if (fs.existsSync(jobsDir)) {
          const jobFiles = fs
            .readdirSync(jobsDir)
            .filter((f) => f.endsWith('.json'));
          if (jobFiles.length > 0) {
            deps.setLastOutputAt?.(sourceGroup);
          }
          for (const file of jobFiles) {
            const filePath = path.join(jobsDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              await processJobIpc(data, sourceGroup, deps);
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC job',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error({ err, sourceGroup }, 'Error reading IPC jobs directory');
      }

      // Process piped-message ack files from this group's IPC directory.
      // The agent-runner writes an ack file after reading each piped input
      // message; ipc.ts deletes it and notifies the GroupQueue to remove
      // the message from its pipedMessages tracking Map.
      const ackDir = path.join(ipcBaseDir, sourceGroup, 'ack');
      try {
        if (fs.existsSync(ackDir)) {
          let ackFiles: string[];
          try {
            ackFiles = fs
              .readdirSync(ackDir)
              .filter((f) => f.endsWith('.json'));
          } catch (err) {
            logger.error(
              { err, sourceGroup },
              'Error reading IPC ack directory',
            );
            ackFiles = [];
          }
          // Seeing any ack file means the container recently produced output
          if (ackFiles.length > 0) {
            deps.setLastOutputAt?.(sourceGroup);
          }
          for (const file of ackFiles) {
            const filePath = path.join(ackDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              if (data.message_id && deps.acknowledgePipedMessage) {
                deps.acknowledgePipedMessage(sourceGroup, data.message_id);
              }
              try {
                fs.unlinkSync(filePath);
              } catch (unlinkErr: unknown) {
                const code = (unlinkErr as NodeJS.ErrnoException | undefined)
                  ?.code;
                if (code !== 'ENOENT') {
                  logger.warn(
                    { file, sourceGroup, err: unlinkErr },
                    'Failed to delete ack file',
                  );
                }
              }
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC ack',
              );
              try {
                fs.unlinkSync(filePath);
              } catch {
                /* ignore */
              }
            }
          }
        }
      } catch (err) {
        logger.error({ err, sourceGroup }, 'Error reading IPC ack directory');
      }
    }

    setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
  };

  processIpcFiles();
  logger.info('IPC watcher started (per-group namespaces)');
}

export async function processTaskIpc(
  data: {
    type: string;
    taskId?: string;
    prompt?: string;
    schedule_type?: string;
    schedule_value?: string;
    context_mode?: string;
    groupFolder?: string;
    chatJid?: string;
    targetJid?: string;
    // For register_group
    jid?: string;
    name?: string;
    folder?: string;
    trigger?: string;
    requiresTrigger?: boolean;
    containerConfig?: RegisteredGroup['containerConfig'];
    // For webhook management
    webhook?: WebhookDefinition;
    webhook_id?: string;
  },
  sourceGroup: string, // Verified identity from IPC directory
  isMain: boolean, // Verified from directory path
  deps: IpcDeps,
): Promise<void> {
  assertManifestHostOperation(sourceGroup, isMain, data.type);
  const registeredGroups = deps.registeredGroups();

  switch (data.type) {
    case 'schedule_task':
      if (
        data.prompt &&
        data.schedule_type &&
        data.schedule_value &&
        data.targetJid
      ) {
        // Resolve the target group from JID
        const targetJid = data.targetJid as string;
        const targetGroupEntry = registeredGroups[targetJid];

        if (!targetGroupEntry) {
          logger.warn(
            { targetJid },
            'Cannot schedule task: target group not registered',
          );
          break;
        }

        const targetFolder = targetGroupEntry.folder;

        // Authorization: non-main groups can only schedule for themselves
        if (!isMain && targetFolder !== sourceGroup) {
          logger.warn(
            { sourceGroup, targetFolder },
            'Unauthorized schedule_task attempt blocked',
          );
          break;
        }

        const scheduleType = data.schedule_type as 'cron' | 'interval' | 'once';

        let nextRun: string | null = null;
        if (scheduleType === 'cron') {
          try {
            const interval = CronExpressionParser.parse(data.schedule_value, {
              tz: TIMEZONE,
            });
            nextRun = interval.next().toISOString();
          } catch {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid cron expression',
            );
            break;
          }
        } else if (scheduleType === 'interval') {
          const ms = parseInt(data.schedule_value, 10);
          if (isNaN(ms) || ms <= 0) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid interval',
            );
            break;
          }
          nextRun = new Date(Date.now() + ms).toISOString();
        } else if (scheduleType === 'once') {
          const scheduled = new Date(data.schedule_value);
          if (isNaN(scheduled.getTime())) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid timestamp',
            );
            break;
          }
          nextRun = scheduled.toISOString();
        }

        const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const contextMode =
          data.context_mode === 'group' || data.context_mode === 'isolated'
            ? data.context_mode
            : 'isolated';
        createTask({
          id: taskId,
          group_folder: targetFolder,
          chat_jid: targetJid,
          prompt: data.prompt,
          schedule_type: scheduleType,
          schedule_value: data.schedule_value,
          context_mode: contextMode,
          next_run: nextRun,
          status: 'active',
          created_at: new Date().toISOString(),
        });
        logger.info(
          { taskId, sourceGroup, targetFolder, contextMode },
          'Task created via IPC',
        );
      }
      break;

    case 'pause_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          updateTask(data.taskId, { status: 'paused' });
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task paused via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task pause attempt',
          );
        }
      }
      break;

    case 'resume_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          updateTask(data.taskId, { status: 'active' });
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task resumed via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task resume attempt',
          );
        }
      }
      break;

    case 'cancel_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          deleteTask(data.taskId);
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task cancelled via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task cancel attempt',
          );
        }
      }
      break;

    case 'refresh_groups':
      // Only main group can request a refresh
      if (isMain) {
        logger.info(
          { sourceGroup },
          'Group metadata refresh requested via IPC',
        );
        await deps.syncGroups(true);
        // Write updated snapshot immediately
        const availableGroups = deps.getAvailableGroups();
        deps.writeGroupsSnapshot(
          sourceGroup,
          true,
          availableGroups,
          new Set(Object.keys(registeredGroups)),
        );
      } else {
        logger.warn(
          { sourceGroup },
          'Unauthorized refresh_groups attempt blocked',
        );
      }
      break;

    case 'register_group':
      // Only main group can register new groups
      if (!isMain) {
        logger.warn(
          { sourceGroup },
          'Unauthorized register_group attempt blocked',
        );
        break;
      }
      if (data.jid && data.name && data.folder && data.trigger) {
        if (!isValidGroupFolder(data.folder)) {
          logger.warn(
            { sourceGroup, folder: data.folder },
            'Invalid register_group request - unsafe folder name',
          );
          break;
        }
        // Defense in depth: agent cannot set isMain via IPC
        deps.registerGroup(data.jid, {
          name: data.name,
          folder: data.folder,
          trigger: data.trigger,
          added_at: new Date().toISOString(),
          containerConfig: data.containerConfig,
          requiresTrigger: data.requiresTrigger,
        });
      } else {
        logger.warn(
          { data },
          'Invalid register_group request - missing required fields',
        );
      }
      break;

    case 'register_webhook':
      // Only main group can manage webhooks
      if (!isMain) {
        logger.warn(
          { sourceGroup },
          'Unauthorized register_webhook attempt blocked',
        );
        break;
      }
      if (data.webhook && deps.addWebhook) {
        deps.addWebhook(data.webhook);
        logger.info(
          { id: data.webhook.id, sourceGroup },
          'Webhook registered via IPC',
        );
      } else {
        logger.warn(
          { data },
          'Invalid register_webhook request — missing webhook field or handler',
        );
      }
      break;

    case 'delete_webhook':
      // Only main group can manage webhooks
      if (!isMain) {
        logger.warn(
          { sourceGroup },
          'Unauthorized delete_webhook attempt blocked',
        );
        break;
      }
      if (data.webhook_id && deps.removeWebhook) {
        const removed = deps.removeWebhook(data.webhook_id);
        if (removed) {
          logger.info(
            { id: data.webhook_id, sourceGroup },
            'Webhook removed via IPC',
          );
        } else {
          logger.warn({ id: data.webhook_id }, 'delete_webhook: ID not found');
        }
      } else {
        logger.warn(
          { data },
          'Invalid delete_webhook request — missing webhook_id or handler',
        );
      }
      break;

    case 'list_webhooks':
      // Only main group can list webhooks
      if (!isMain) {
        logger.warn(
          { sourceGroup },
          'Unauthorized list_webhooks attempt blocked',
        );
        break;
      }
      if (deps.listWebhooks) {
        const list = deps.listWebhooks();
        logger.info(
          { count: list.length, sourceGroup },
          'Webhook list requested via IPC',
        );
      }
      break;

    default:
      logger.warn({ type: data.type }, 'Unknown IPC task type');
  }
}

export async function processJobIpc(
  data: {
    action: string;
    name?: string;
  },
  sourceGroup: string,
  deps: IpcDeps,
): Promise<void> {
  assertManifestHostOperation(sourceGroup, false, 'jobs_mutate');
  const { action, name } = data;

  if (!name) {
    logger.warn({ action, sourceGroup }, 'Job IPC missing name field');
    return;
  }

  switch (action) {
    case 'run':
      if (deps.runHostJob) {
        logger.info({ name, sourceGroup }, 'Job run triggered via IPC');
        await deps.runHostJob(name, sourceGroup);
      } else {
        logger.warn(
          { name, sourceGroup },
          'runHostJob not configured, ignoring run IPC',
        );
      }
      break;

    case 'pause':
      if (deps.setJobEnabled) {
        deps.setJobEnabled(name, false);
        logger.info({ name, sourceGroup }, 'Job paused via IPC');
      } else {
        logger.warn(
          { name, sourceGroup },
          'setJobEnabled not configured, ignoring pause IPC',
        );
      }
      break;

    case 'resume':
      if (deps.setJobEnabled) {
        deps.setJobEnabled(name, true);
        logger.info({ name, sourceGroup }, 'Job resumed via IPC');
      } else {
        logger.warn(
          { name, sourceGroup },
          'setJobEnabled not configured, ignoring resume IPC',
        );
      }
      break;

    default:
      logger.warn({ action, name, sourceGroup }, 'Unknown job IPC action');
  }
}
