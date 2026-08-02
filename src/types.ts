export interface AdditionalMount {
  hostPath: string; // Absolute path on host (supports ~ for home)
  containerPath?: string; // Optional — defaults to basename of hostPath. Mounted at /workspace/extra/{value}
  readonly?: boolean; // Default: true for safety
}

/**
 * Mount Allowlist - Security configuration for additional mounts
 * This file should be stored at ~/.config/nanoclaw/mount-allowlist.json
 * and is NOT mounted into any container, making it tamper-proof from agents.
 */
export interface MountAllowlist {
  // Directories that can be mounted into containers
  allowedRoots: AllowedRoot[];
  // Glob patterns for paths that should never be mounted (e.g., ".ssh", ".gnupg")
  blockedPatterns: string[];
  // If true, non-main groups can only mount read-only regardless of config
  nonMainReadOnly: boolean;
}

export interface AllowedRoot {
  // Absolute path or ~ for home (e.g., "~/projects", "/var/repos")
  path: string;
  // Whether read-write mounts are allowed under this root
  allowReadWrite: boolean;
  // Optional description for documentation
  description?: string;
}

export interface ContainerConfig {
  additionalMounts?: AdditionalMount[];
  timeout?: number; // Default: 300000 (5 minutes)
  spawnTimeout?: number; // Default: 90000 (90 seconds) — time for first output marker
  // When set, the host posts "[PROCESSING] <msg>" to the channel before the
  // container cold-starts, so the agent need not emit a First-Response ack.
  processingMessage?: string;
  // When true, each root (non-threaded) post becomes its own thread, keyed by
  // its own ts: a dedicated container + reply thread per post. Keeps concurrent
  // submissions from sharing a run and threads every reply under the post that
  // triggered it (e.g. the grader — one thread per graded submission).
  threadPerMessage?: boolean;
  // Idle time (ms) a finished container stays warm holding a concurrency slot
  // before releasing it. Overrides the global IDLE_TIMEOUT. Set LOW for
  // per-submission workers (e.g. the grader) that expect no follow-ups, so slots
  // free promptly and the next job starts sooner; leave unset for conversational
  // groups that benefit from staying warm between turns. Warm containers do not
  // squat: the queue evicts the longest-idle one when a slot is needed.
  idleTimeout?: number;
  // Per-group VM resource caps (Apple Container `-m` / `-c`). Unset → the
  // CONTAINER_MEMORY / CONTAINER_CPUS env defaults (768M / 2). Size from the
  // peak_memory log lines the runner emits per run, plus margin — an OOM kill
  // mid-run corrupts the work unit, so round up.
  memory?: string;
  cpus?: number;
  // When true, the agent's final assistant text is NOT echoed to the channel;
  // only what it posts explicitly via send_message appears. Set for groups whose
  // output is a structured card (sales, inbox): the host echo arrived as a third
  // top-level recap of a card the agent had already posted, and it carries no
  // threadKey so it always landed at the channel root (Oana Tue, 2026-07-28).
  // Leave unset for conversational groups, where the final text IS the reply.
  suppressFinalText?: boolean;
  // Per-group claude model override (e.g. 'haiku'). Unset → agent-runner sonnet.
  model?: string;
  // Token-exhaustion probe policy. 'eager' tries every account (incl. cooled-down
  // ones, as a free renewal probe) before the paid API key; 'lazy' (default)
  // trusts the cooldown. Overrides config.EAGER_TOKEN_PROBE_GROUPS for this group.
  tokenPolicy?: 'eager' | 'lazy';
}

export interface RegisteredGroup {
  name: string;
  folder: string;
  trigger: string;
  added_at: string;
  containerConfig?: ContainerConfig;
  requiresTrigger?: boolean; // Default: true for groups, false for solo chats
  isMain?: boolean; // True for the main control group (no trigger, elevated privileges)
}

export interface NewMessage {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  is_from_me?: boolean;
  is_bot_message?: boolean;
  from_group?: string; // Which agent group sent this (null = human)
  thread_ts?: string; // Slack thread timestamp (null = root/channel message)
}

export interface SendMessageOpts {
  fromGroup?: string;
  threadTs?: string;
  // Entity anchor (Slack only). All posts to a channel sharing the same
  // threadKey collapse into one thread: the first post becomes the root, later
  // posts reply under it. An explicit threadTs normally wins; the Slack host
  // may override it with a validated lead-work anchor.
  threadKey?: string;
}

export type SendMessageFn = (
  jid: string,
  text: string,
  opts?: SendMessageOpts,
) => Promise<void>;

export interface WebhookDefinition {
  id: string; // URL slug — POST /hook/{id}
  name: string; // Human-readable name
  group: string; // Group folder (which agent handles this)
  chat_jid: string; // JID to deliver response to if no callback URL
  prompt_template: string; // May contain {{payload}} or {{payload.field}}
  secret?: string; // Per-webhook secret (falls back to global WEBHOOK_SECRET)
  callback_url?: string; // Optional fixed callback (overridden by X-Callback-URL header)
  context_mode?: 'group' | 'isolated'; // Session persistence (default: 'isolated')
  suppress_output?: boolean; // If true, agent's final output is NOT sent to chat_jid (agent uses send_message instead)
  created_at: string;
}

export interface ScheduledTask {
  id: string;
  group_folder: string;
  chat_jid: string;
  prompt: string;
  schedule_type: 'cron' | 'interval' | 'once';
  schedule_value: string;
  context_mode: 'group' | 'isolated';
  next_run: string | null;
  last_run: string | null;
  last_result: string | null;
  status: 'active' | 'paused' | 'completed';
  created_at: string;
}

export interface TaskRunLog {
  task_id: string;
  run_at: string;
  duration_ms: number;
  status: 'success' | 'error';
  result: string | null;
  error: string | null;
}

// --- Host Job Scheduling ---

export interface Job {
  name: string;
  description: string;
  project: string;
  project_root: string;
  script: string;
  args: string[];
  cron: string;
  timezone: string;
  retries: number;
  retry_delay_ms: number;
  alert_level: 'alert' | 'warn' | 'silent';
  timeout_ms: number;
  lockfile: string | null;
  run_interval_days?: number | null; // If set, skip run when last_run is less than N days ago (for biweekly etc.)
  enabled: boolean;
  next_run: string | null;
  last_run: string | null;
  last_result: string | null;
  last_duration_ms: number | null;
  last_output: string | null;
}

export interface JobDefinition {
  name: string;
  description: string;
  project: string;
  project_root: string;
  script: string;
  args: string[];
  cron: string;
  timezone: string;
  retries: number;
  retry_delay_ms: number;
  alert_level: 'alert' | 'warn' | 'silent';
  timeout_ms: number;
  lockfile: string | null;
  run_interval_days?: number | null;
  enabled: boolean;
}

export interface JobRunLog {
  id: string;
  job_name: string;
  triggered_by: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  exit_code: number | null;
  pid: number | null;
  status: 'ok' | 'fail' | 'timeout' | 'running' | 'dispatch_error';
  output: string | null;
  error: string | null;
  log_file: string | null;
  retry_attempt: number;
}

export type JobRunResult = {
  name: string;
  status:
    | 'ok'
    | 'fail'
    | 'timeout'
    | 'already_running'
    | 'dispatch_error'
    | 'path_error';
  duration_ms: number;
  output: string | null;
  error: string | null;
  exit_code: number | null;
  retry_attempts: number;
  run_id: string | null;
  log_file: string | null;
};

// --- Channel abstraction ---

export interface Channel {
  name: string;
  connect(): Promise<void>;
  sendMessage(jid: string, text: string, opts?: SendMessageOpts): Promise<void>;
  isConnected(): boolean;
  ownsJid(jid: string): boolean;
  disconnect(): Promise<void>;
  // Optional: typing indicator. Channels that support it implement it.
  setTyping?(jid: string, isTyping: boolean): Promise<void>;
  // Optional: sync group/chat names from the platform.
  syncGroups?(force: boolean): Promise<void>;
  // Optional: seconds since last inbound/outbound activity. Used by /health endpoint.
  getLastActivitySec?(): number;
  // Optional: bounded, non-sensitive counters for routing/degradation diagnosis.
  getDiagnostics?(): Record<string, string | number | boolean | null>;
}

// Callback type that channels use to deliver inbound messages
export type OnInboundMessage = (chatJid: string, message: NewMessage) => void;

// Callback fired when the bot itself joins a new channel/group.
// The channel implementation resolves the name before calling this.
// The orchestrator uses it to auto-register the group.
export type OnBotJoinedChannel = (chatJid: string, name: string) => void;

// Callback for chat metadata discovery.
// name is optional — channels that deliver names inline (Telegram) pass it here;
// channels that sync names separately (via syncGroups) omit it.
export type OnChatMetadata = (
  chatJid: string,
  timestamp: string,
  name?: string,
  channel?: string,
  isGroup?: boolean,
) => void;
