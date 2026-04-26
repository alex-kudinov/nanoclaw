/**
 * IPC Protocol — single source of truth for host ↔ container communication.
 * Referenced by both agent-runner (container-side) and container-supervisor (host-side).
 */

// ── Sentinel filenames ────────────────────────────────────────────────────────

/** Host → Container: close current conversation (idle timeout) */
export const SENTINEL_CLOSE_CONVERSATION = '_close_conversation';

/** Host → Container: shutdown daemon entirely */
export const SENTINEL_CLOSE = '_close';

/** Host → Container: health check ping */
export const SENTINEL_PING = '_ping';

/** Host → Container: restart daemon after current conversation */
export const SENTINEL_RESTART = '_restart';

// ── Stdout markers ────────────────────────────────────────────────────────────

/** Container → Host: output result wrapper */
export const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
export const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

/** Container → Host: conversation done, daemon ready for next */
export const CONVERSATION_END_MARKER = '---NANOCLAW_CONVERSATION_END---';

/** Container → Host: health ping response */
export const PONG_MARKER = '---NANOCLAW_PONG---';

/** Container → Host: agent is alive, long-running work in progress */
export const HEARTBEAT_MARKER = '---NANOCLAW_HEARTBEAT---';

// ── IPC file schemas ──────────────────────────────────────────────────────────

/** Host → Container: start new conversation (conv-{ts}.json) */
export interface ConversationStartMessage {
  type: 'new_conversation';
  prompt: string;
  sessionId?: string;
  isScheduledTask?: boolean;
}

/** Host → Container: follow-up during active conversation ({ts}-{rand}.json) */
export interface FollowUpMessage {
  type: 'message';
  text: string;
}

export type IpcInputMessage = ConversationStartMessage | FollowUpMessage;

// ── Conversation file naming ──────────────────────────────────────────────────

export const CONV_FILE_PREFIX = 'conv-';
export const CONV_FILE_PATTERN = /^conv-\d+\.json$/;

// ── Daemon limits ─────────────────────────────────────────────────────────────

export const MAX_CONVERSATIONS_PER_DAEMON = 50;
export const MAX_HEAP_BYTES = 512 * 1024 * 1024; // 512MB
export const MAX_DAEMON_UPTIME_MS = 6 * 60 * 60 * 1000; // 6 hours
export const CONVERSATION_HARD_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const IPC_POLL_MS = 500;
