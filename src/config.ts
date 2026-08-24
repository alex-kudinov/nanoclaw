import os from 'os';
import path from 'path';

import { readEnvFile } from './env.js';

// Read config values from .env (falls back to process.env).
// Secrets are NOT read here — they stay on disk and are loaded only
// where needed (container-runner.ts) to avoid leaking to child processes.
const envConfig = readEnvFile([
  'ASSISTANT_NAME',
  'ASSISTANT_HAS_OWN_NUMBER',
  'SLACK_ONLY',
]);

export const ASSISTANT_NAME =
  process.env.ASSISTANT_NAME || envConfig.ASSISTANT_NAME || 'Gru';
export const ASSISTANT_HAS_OWN_NUMBER =
  (process.env.ASSISTANT_HAS_OWN_NUMBER ||
    envConfig.ASSISTANT_HAS_OWN_NUMBER) === 'true';
export const POLL_INTERVAL = 2000;
export const SCHEDULER_POLL_INTERVAL = 60000;

// Absolute paths needed for container mounts
const PROJECT_ROOT = process.cwd();
const HOME_DIR = process.env.HOME || os.homedir();

// Mount security: allowlist stored OUTSIDE project root, never mounted into containers
export const MOUNT_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'nanoclaw',
  'mount-allowlist.json',
);
export const STORE_DIR = path.resolve(PROJECT_ROOT, 'store');
export const GROUPS_DIR = path.resolve(PROJECT_ROOT, 'groups');
export const DATA_DIR = path.resolve(PROJECT_ROOT, 'data');

// Minions that run complex skills / large jobs. Before falling back to the paid
// API key, these probe every account (incl. cooled-down ones — a free renewal
// check) so an expensive job never hits metered billing while prepaid credit
// quietly renewed. Everyone else trusts the 6h cooldown ('lazy'). Retune freely;
// per-group containerConfig.tokenPolicy overrides this list.
export const EAGER_TOKEN_PROBE_GROUPS = [
  'procurement',
  'chief',
  'newsroom',
  'archivarista',
  'courses',
];

export const CONTAINER_IMAGE =
  process.env.CONTAINER_IMAGE || 'nanoclaw-agent:latest';
export const CONTAINER_TIMEOUT = parseInt(
  process.env.CONTAINER_TIMEOUT || '1800000',
  10,
);
export const CONTAINER_MAX_OUTPUT_SIZE = parseInt(
  process.env.CONTAINER_MAX_OUTPUT_SIZE || '10485760',
  10,
); // 10MB default
export const IPC_POLL_INTERVAL = 1000;
// How long a finished container stays warm before the host closes it. Warm
// containers keep their Claude session hot (follow-ups skip the ~10s cold
// start) and no longer squat: the queue evicts the longest-idle warm container
// whenever a slot is needed (container.lifecycle.evict). Per-group override
// via containerConfig.idleTimeout (the grader sets 30s — one-shot threads).
export const IDLE_TIMEOUT = parseInt(process.env.IDLE_TIMEOUT || '1200000', 10); // 20min default
// Entity-keyed Slack threading: once a work-unit thread has been idle this long,
// a new post about it starts a FRESH root at the bottom of the channel instead
// of resurrecting the dormant (possibly days-old) thread. Measured from the
// anchor's last activity. 8h default keeps an active same-session flow threaded
// but rolls over a re-engagement after the conversation has gone quiet.
export const SLACK_THREAD_TTL_MS = parseInt(
  process.env.SLACK_THREAD_TTL_MS || '28800000',
  10,
); // 8h
export const MAX_CONCURRENT_CONTAINERS = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENT_CONTAINERS || '5', 10) || 5,
);
// Slots reserved for new incoming messages during startup recovery.
// Clamped to [0, MAX_CONCURRENT_CONTAINERS - 1] at runtime (see T08).
export const RECOVERY_RESERVED_SLOTS = parseInt(
  process.env.RECOVERY_RESERVED_SLOTS || '1',
  10,
);
// How far back startup recovery scans for unhandled messages. Needed because
// threadPerMessage groups never advance their root-bucket cursor, so without
// a floor the recovery window grows unboundedly with channel history.
export const RECOVERY_LOOKBACK_MS = parseInt(
  process.env.RECOVERY_LOOKBACK_MS || String(48 * 60 * 60 * 1000),
  10,
); // 48h
// Peak-memory sampling cadence for running containers (container exec +
// /proc/meminfo). Feeds the container.lifecycle.peak_memory log line used to
// right-size per-group containerConfig.memory. 0 disables sampling.
export const MEMORY_SAMPLE_INTERVAL_MS = parseInt(
  process.env.MEMORY_SAMPLE_INTERVAL_MS || '20000',
  10,
);
export const SPAWN_TIMEOUT = parseInt(process.env.SPAWN_TIMEOUT || '90000', 10); // 90s — fail fast if container produces no output markers
export const LIVENESS_CHECK_INTERVAL_MS = parseInt(
  process.env.LIVENESS_CHECK_INTERVAL_MS || '10000',
  10,
); // 10s — how often GroupQueue polls for dead/frozen containers
export const STALE_OUTPUT_THRESHOLD_MS = parseInt(
  process.env.STALE_OUTPUT_THRESHOLD_MS || '120000',
  10,
); // 2min — container is considered frozen if no IPC output in this window (XPC freeze catcher)

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const TRIGGER_PATTERN = new RegExp(
  `^@${escapeRegex(ASSISTANT_NAME)}\\b`,
  'i',
);

// Timezone for scheduled tasks (cron expressions, etc.)
// Uses system timezone by default
export const TIMEZONE =
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;

// Slack configuration
// SLACK_BOT_TOKEN and SLACK_APP_TOKEN are read directly by SlackChannel
// from .env via readEnvFile() to keep secrets off process.env.
export const SLACK_ONLY =
  (process.env.SLACK_ONLY || envConfig.SLACK_ONLY) === 'true';

// Heartbeat — periodic Slack status message for watchdog diagnostics
const heartbeatEnv = readEnvFile(['HEARTBEAT_JID', 'HEARTBEAT_INTERVAL_MS']);
export const HEARTBEAT_JID =
  process.env.HEARTBEAT_JID || heartbeatEnv.HEARTBEAT_JID || '';
export const HEARTBEAT_INTERVAL_MS = parseInt(
  process.env.HEARTBEAT_INTERVAL_MS ||
    heartbeatEnv.HEARTBEAT_INTERVAL_MS ||
    '600000',
  10,
);

// Webhook server — listens on all interfaces (including Tailscale) for
// inbound trigger events. WEBHOOK_SECRET is a global fallback; per-webhook
// secrets take precedence.
export const WEBHOOK_PORT = parseInt(process.env.WEBHOOK_PORT || '8088', 10);
export const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
export const WEBHOOKS_FILE = path.join(DATA_DIR, 'webhooks.json');
export const HARD_FILTERS_FILE = path.join(DATA_DIR, 'hard-filters.json');

const studentLifecycleEnv = readEnvFile([
  'STUDENT_LIFECYCLE_ENABLED',
  'STUDENT_LIFECYCLE_WEBHOOK_PATH',
  'STUDENT_LIFECYCLE_RELAY_SECRET',
  'STUDENT_LIFECYCLE_IDENTITY_SECRET',
]);
const studentLifecycleEnabledRaw =
  process.env.STUDENT_LIFECYCLE_ENABLED ||
  studentLifecycleEnv.STUDENT_LIFECYCLE_ENABLED ||
  'false';
if (!['false', 'true', '0', '1'].includes(studentLifecycleEnabledRaw)) {
  throw new Error('STUDENT_LIFECYCLE_ENABLED must be true, false, 1, or 0');
}
export const STUDENT_LIFECYCLE_ENABLED = ['true', '1'].includes(
  studentLifecycleEnabledRaw,
);
export const STUDENT_LIFECYCLE_WEBHOOK_PATH =
  process.env.STUDENT_LIFECYCLE_WEBHOOK_PATH ||
  studentLifecycleEnv.STUDENT_LIFECYCLE_WEBHOOK_PATH ||
  '';
export const STUDENT_LIFECYCLE_RELAY_SECRET =
  process.env.STUDENT_LIFECYCLE_RELAY_SECRET ||
  studentLifecycleEnv.STUDENT_LIFECYCLE_RELAY_SECRET ||
  '';
export const STUDENT_LIFECYCLE_IDENTITY_SECRET =
  process.env.STUDENT_LIFECYCLE_IDENTITY_SECRET ||
  studentLifecycleEnv.STUDENT_LIFECYCLE_IDENTITY_SECRET ||
  '';

if (STUDENT_LIFECYCLE_ENABLED) {
  if (
    !/^\/hook\/[A-Za-z0-9._-]{16,200}$/.test(STUDENT_LIFECYCLE_WEBHOOK_PATH) ||
    STUDENT_LIFECYCLE_WEBHOOK_PATH.toLowerCase().includes('circle')
  ) {
    throw new Error(
      'enabled student lifecycle requires a Community-only opaque webhook path',
    );
  }
  if (STUDENT_LIFECYCLE_RELAY_SECRET.length < 32) {
    throw new Error(
      'enabled student lifecycle requires a relay secret of at least 32 characters',
    );
  }
  if (
    STUDENT_LIFECYCLE_IDENTITY_SECRET.length < 32 ||
    STUDENT_LIFECYCLE_IDENTITY_SECRET === STUDENT_LIFECYCLE_RELAY_SECRET
  ) {
    throw new Error(
      'enabled student lifecycle requires a distinct identity secret of at least 32 characters',
    );
  }
}

const checkoutRecoveryEnv = readEnvFile([
  'CHECKOUT_RECOVERY_ENABLED',
  'CHECKOUT_RECOVERY_WEBHOOK_PATH',
  'CHECKOUT_RECOVERY_RELAY_SECRET',
  'CHECKOUT_RECOVERY_IDENTITY_SECRET',
  'CHECKOUT_RECOVERY_SEND_MODE',
  'CHECKOUT_RECOVERY_SEND_ACTIVATED_AT',
  'CHECKOUT_RECOVERY_PILOT_EMAIL_SHA256',
  'CHECKOUT_RECOVERY_PILOT_TOUCH2_DELAY_MINUTES',
  'ENCHARGE_WRITE_KEY',
]);
const checkoutRecoveryEnabledRaw =
  process.env.CHECKOUT_RECOVERY_ENABLED ||
  checkoutRecoveryEnv.CHECKOUT_RECOVERY_ENABLED ||
  'false';
if (!['false', 'true', '0', '1'].includes(checkoutRecoveryEnabledRaw)) {
  throw new Error('CHECKOUT_RECOVERY_ENABLED must be true, false, 1, or 0');
}
export const CHECKOUT_RECOVERY_ENABLED = ['true', '1'].includes(
  checkoutRecoveryEnabledRaw,
);
export const CHECKOUT_RECOVERY_WEBHOOK_PATH =
  process.env.CHECKOUT_RECOVERY_WEBHOOK_PATH ||
  checkoutRecoveryEnv.CHECKOUT_RECOVERY_WEBHOOK_PATH ||
  '';
export const CHECKOUT_RECOVERY_RELAY_SECRET =
  process.env.CHECKOUT_RECOVERY_RELAY_SECRET ||
  checkoutRecoveryEnv.CHECKOUT_RECOVERY_RELAY_SECRET ||
  '';
export const CHECKOUT_RECOVERY_IDENTITY_SECRET =
  process.env.CHECKOUT_RECOVERY_IDENTITY_SECRET ||
  checkoutRecoveryEnv.CHECKOUT_RECOVERY_IDENTITY_SECRET ||
  '';
const checkoutRecoverySendModeRaw =
  process.env.CHECKOUT_RECOVERY_SEND_MODE ||
  checkoutRecoveryEnv.CHECKOUT_RECOVERY_SEND_MODE ||
  'off';
if (!['off', 'pilot', 'production'].includes(checkoutRecoverySendModeRaw)) {
  throw new Error(
    'CHECKOUT_RECOVERY_SEND_MODE must be off, pilot, or production',
  );
}
export const CHECKOUT_RECOVERY_SEND_MODE = checkoutRecoverySendModeRaw as
  | 'off'
  | 'pilot'
  | 'production';
const checkoutRecoveryActivatedAtRaw =
  process.env.CHECKOUT_RECOVERY_SEND_ACTIVATED_AT ||
  checkoutRecoveryEnv.CHECKOUT_RECOVERY_SEND_ACTIVATED_AT ||
  '';
export const CHECKOUT_RECOVERY_SEND_ACTIVATED_AT =
  checkoutRecoveryActivatedAtRaw === ''
    ? null
    : new Date(checkoutRecoveryActivatedAtRaw);
export const CHECKOUT_RECOVERY_PILOT_EMAIL_SHA256 =
  process.env.CHECKOUT_RECOVERY_PILOT_EMAIL_SHA256 ||
  checkoutRecoveryEnv.CHECKOUT_RECOVERY_PILOT_EMAIL_SHA256 ||
  null;
const checkoutRecoveryPilotTouch2DelayRaw =
  process.env.CHECKOUT_RECOVERY_PILOT_TOUCH2_DELAY_MINUTES ||
  checkoutRecoveryEnv.CHECKOUT_RECOVERY_PILOT_TOUCH2_DELAY_MINUTES ||
  '';
export const CHECKOUT_RECOVERY_PILOT_TOUCH2_DELAY_MINUTES =
  checkoutRecoveryPilotTouch2DelayRaw === ''
    ? null
    : Number(checkoutRecoveryPilotTouch2DelayRaw);
export const ENCHARGE_WRITE_KEY =
  process.env.ENCHARGE_WRITE_KEY ||
  checkoutRecoveryEnv.ENCHARGE_WRITE_KEY ||
  '';

if (CHECKOUT_RECOVERY_ENABLED) {
  if (
    !/^\/hook\/[A-Za-z0-9._-]{16,200}$/.test(CHECKOUT_RECOVERY_WEBHOOK_PATH)
  ) {
    throw new Error(
      'enabled checkout recovery requires an opaque webhook path',
    );
  }
  if (CHECKOUT_RECOVERY_RELAY_SECRET.length < 32) {
    throw new Error(
      'enabled checkout recovery requires a relay secret of at least 32 characters',
    );
  }
  if (
    CHECKOUT_RECOVERY_IDENTITY_SECRET.length < 32 ||
    CHECKOUT_RECOVERY_IDENTITY_SECRET === CHECKOUT_RECOVERY_RELAY_SECRET
  ) {
    throw new Error(
      'enabled checkout recovery requires a distinct identity secret of at least 32 characters',
    );
  }
}
if (CHECKOUT_RECOVERY_SEND_MODE !== 'off') {
  if (!CHECKOUT_RECOVERY_ENABLED) {
    throw new Error(
      'checkout recovery sends require checkout recovery enabled',
    );
  }
  if (
    CHECKOUT_RECOVERY_SEND_ACTIVATED_AT === null ||
    !Number.isFinite(CHECKOUT_RECOVERY_SEND_ACTIVATED_AT.getTime())
  ) {
    throw new Error('checkout recovery sends require an ISO activation cutoff');
  }
  if (ENCHARGE_WRITE_KEY.length < 20) {
    throw new Error('checkout recovery sends require an Encharge write key');
  }
  if (
    CHECKOUT_RECOVERY_SEND_MODE === 'pilot' &&
    !/^[0-9a-f]{64}$/.test(CHECKOUT_RECOVERY_PILOT_EMAIL_SHA256 || '')
  ) {
    throw new Error('pilot checkout recovery sends require an email digest');
  }
  if (
    CHECKOUT_RECOVERY_SEND_MODE === 'pilot' &&
    (!Number.isInteger(CHECKOUT_RECOVERY_PILOT_TOUCH2_DELAY_MINUTES) ||
      CHECKOUT_RECOVERY_PILOT_TOUCH2_DELAY_MINUTES === null ||
      CHECKOUT_RECOVERY_PILOT_TOUCH2_DELAY_MINUTES < 1 ||
      CHECKOUT_RECOVERY_PILOT_TOUCH2_DELAY_MINUTES > 60)
  ) {
    throw new Error(
      'pilot checkout recovery sends require a touch-two delay from 1 to 60 minutes',
    );
  }
}

// Things bridge — HTTP service on the Mac Studio (the only machine with Things
// 3). A 📌 reaction on a Mr Gru decision-brief item POSTs the parsed item here
// to create a real Things to-do. See ~/.claude/hooks/things_bridge.py.
export const THINGS_BRIDGE_URL =
  process.env.THINGS_BRIDGE_URL || 'http://100.115.115.12:40961';
export const THINGS_BRIDGE_KEY = process.env.THINGS_BRIDGE_KEY || '';

// Secret guarding POST /api/post (the Studio's daily brief autopost). Loaded
// from the .env FILE via readEnvFile — env.ts intentionally keeps secrets out
// of process.env, so the process.env-based WEBHOOK_SECRET above is empty on
// this deployment. Falls back to the file's WEBHOOK_SECRET value.
const briefSecretEnv = readEnvFile(['BRIEF_POST_SECRET', 'WEBHOOK_SECRET']);
export const BRIEF_POST_SECRET =
  briefSecretEnv.BRIEF_POST_SECRET || briefSecretEnv.WEBHOOK_SECRET || '';

// Job scheduling
export const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
export const JOB_REPORT_CHANNEL =
  process.env.JOB_REPORT_CHANNEL || 'slack:C0APF8WMV18';

// Gmail configuration
const gmailEnv = readEnvFile([
  'GMAIL_MONITORED_EMAIL',
  'GMAIL_SEND_AS',
  'GMAIL_REPLY_TO',
  'GMAIL_LABEL',
  'GMAIL_POLL_INTERVAL',
  'GMAIL_TEST_RECIPIENT',
  'GMAIL_BCC',
  'GMAIL_PUSH_ENABLED',
  'GMAIL_PUSH_OWN_WATCH',
  'GMAIL_PUBSUB_TOPIC',
  'GMAIL_PUSH_WEBHOOK_SECRET',
  'GMAIL_PUSH_SAFETY_POLL_INTERVAL',
  'COMPANY_GMAIL_RUNTIME_WATERMARK_MODE',
]);

export const GMAIL_POLL_INTERVAL = parseInt(
  process.env.GMAIL_POLL_INTERVAL || gmailEnv.GMAIL_POLL_INTERVAL || '30000',
  10,
);
export const GMAIL_LABEL =
  process.env.GMAIL_LABEL || gmailEnv.GMAIL_LABEL || 'MrGru';
export const GMAIL_MONITORED_EMAIL =
  process.env.GMAIL_MONITORED_EMAIL || gmailEnv.GMAIL_MONITORED_EMAIL || '';
export const GMAIL_SEND_AS =
  process.env.GMAIL_SEND_AS ||
  gmailEnv.GMAIL_SEND_AS ||
  'Tandem Coaching <info@tandemcoach.co>';

// Test routing: when set, ALL gmail_send calls have their recipient rewritten.
// Host-enforced — agents cannot bypass this.
export const GMAIL_TEST_RECIPIENT =
  process.env.GMAIL_TEST_RECIPIENT || gmailEnv.GMAIL_TEST_RECIPIENT || '';

// Reply-To header on all outbound emails.
export const GMAIL_REPLY_TO =
  process.env.GMAIL_REPLY_TO ||
  gmailEnv.GMAIL_REPLY_TO ||
  'info@tandemcoach.co';

// BCC all outbound emails to this address (empty string = disabled).
export const GMAIL_BCC =
  process.env.GMAIL_BCC || gmailEnv.GMAIL_BCC || 'info@tandemcoach.co';

// Proposal follow-up — daily approval-gated nudges for open (pending) Plutio
// proposals. See docs/PROPOSAL-FOLLOWUP-DESIGN.md.
const proposalEnv = readEnvFile([
  'PROPOSAL_FOLLOWUP_ENABLED',
  'PROPOSAL_FOLLOWUP_CHANNEL_JID',
  'PROPOSAL_PUBLIC_URL_BASE',
  'PROPOSAL_FOLLOWUP_SENDER',
  'PROPOSAL_FOLLOWUP_MAX_PER_RUN',
  'PROPOSAL_FOLLOWUP_HOUR',
  'PROPOSAL_FOLLOWUP_EXPIRE_DAYS',
]);
export const PROPOSAL_FOLLOWUP_ENABLED =
  (process.env.PROPOSAL_FOLLOWUP_ENABLED ||
    proposalEnv.PROPOSAL_FOLLOWUP_ENABLED) !== 'false';
// Where draft nudges are posted for ✅ approval. Defaults to #gru-sales.
export const PROPOSAL_FOLLOWUP_CHANNEL_JID =
  process.env.PROPOSAL_FOLLOWUP_CHANNEL_JID ||
  proposalEnv.PROPOSAL_FOLLOWUP_CHANNEL_JID ||
  'slack:C0AHV1SGT6W';
// Client-facing proposal link base; the Plutio _id is appended.
export const PROPOSAL_PUBLIC_URL_BASE =
  process.env.PROPOSAL_PUBLIC_URL_BASE ||
  proposalEnv.PROPOSAL_PUBLIC_URL_BASE ||
  'https://business.tandemcoaching.academy/p/proposal';
// Name signed at the bottom of each follow-up email.
export const PROPOSAL_FOLLOWUP_SENDER =
  process.env.PROPOSAL_FOLLOWUP_SENDER ||
  proposalEnv.PROPOSAL_FOLLOWUP_SENDER ||
  'the Tandem Coaching team';
// Cap drafts per daily run so a large backlog drains gradually.
export const PROPOSAL_FOLLOWUP_MAX_PER_RUN = parseInt(
  process.env.PROPOSAL_FOLLOWUP_MAX_PER_RUN ||
    proposalEnv.PROPOSAL_FOLLOWUP_MAX_PER_RUN ||
    '8',
  10,
);
// Local hour (0-23) at/after which the daily pass runs, once per day.
export const PROPOSAL_FOLLOWUP_HOUR = parseInt(
  process.env.PROPOSAL_FOLLOWUP_HOUR ||
    proposalEnv.PROPOSAL_FOLLOWUP_HOUR ||
    '9',
  10,
);
// Days a drafted-but-unapproved nudge stays live before it is expired.
export const PROPOSAL_FOLLOWUP_EXPIRE_DAYS = parseInt(
  process.env.PROPOSAL_FOLLOWUP_EXPIRE_DAYS ||
    proposalEnv.PROPOSAL_FOLLOWUP_EXPIRE_DAYS ||
    '7',
  10,
);

// Tracking pixel domain for email open tracking.
export const TRACKING_DOMAIN =
  process.env.TRACKING_DOMAIN || 't.tandemcoach.co';

// Public unsubscribe URL base — routed through n8n on webhooks subdomain.
export const UNSUBSCRIBE_BASE_URL =
  process.env.UNSUBSCRIBE_BASE_URL ||
  'https://webhooks.tandemcoach.co/webhook/unsubscribe';

// Gmail Pub/Sub push notifications (replaces fast polling when enabled).
// When true: history.list fetches deltas on each push notification. Fast poll
// is replaced with a slow safety-net poll (GMAIL_PUSH_SAFETY_POLL_INTERVAL)
// to catch missed events.
export const GMAIL_PUSH_ENABLED =
  (process.env.GMAIL_PUSH_ENABLED || gmailEnv.GMAIL_PUSH_ENABLED) === 'true';

// Whether NanoClaw owns the users.watch() lifecycle. Default false — used in
// coexistence setups where another service (e.g. Hive) manages the watch and
// NanoClaw is a passive subscriber on the same topic. Set true only when
// NanoClaw is the sole consumer.
export const GMAIL_PUSH_OWN_WATCH =
  (process.env.GMAIL_PUSH_OWN_WATCH || gmailEnv.GMAIL_PUSH_OWN_WATCH) ===
  'true';

// Fully-qualified Pub/Sub topic, e.g. "projects/x/topics/hive-gmail-push".
// Only used when GMAIL_PUSH_OWN_WATCH=true (passed to users.watch()).
export const GMAIL_PUBSUB_TOPIC =
  process.env.GMAIL_PUBSUB_TOPIC || gmailEnv.GMAIL_PUBSUB_TOPIC || '';

// Secret required on POST /hook/gmail-push via X-Webhook-Secret header.
// Falls back to WEBHOOK_SECRET if unset.
export const GMAIL_PUSH_WEBHOOK_SECRET =
  process.env.GMAIL_PUSH_WEBHOOK_SECRET ||
  gmailEnv.GMAIL_PUSH_WEBHOOK_SECRET ||
  '';

// Safety-net poll interval when push is enabled (default 10 min). Catches
// any notifications Pub/Sub may have dropped and verifies watch is alive.
export const GMAIL_PUSH_SAFETY_POLL_INTERVAL = parseInt(
  process.env.GMAIL_PUSH_SAFETY_POLL_INTERVAL ||
    gmailEnv.GMAIL_PUSH_SAFETY_POLL_INTERVAL ||
    '600000',
  10,
);

// The Company OS watermark bridge is fail-safe by default. `freeze_only`
// preserves ordinary SQLite ingestion but never resets an expired cursor;
// `active` additionally requires exact PostgreSQL/SQLite cursor authority and
// mirrors every closed delta before SQLite advances.
export type CompanyGmailRuntimeWatermarkMode = 'freeze_only' | 'active';
const companyGmailRuntimeWatermarkMode =
  process.env.COMPANY_GMAIL_RUNTIME_WATERMARK_MODE ||
  gmailEnv.COMPANY_GMAIL_RUNTIME_WATERMARK_MODE;
export const COMPANY_GMAIL_RUNTIME_WATERMARK_MODE: CompanyGmailRuntimeWatermarkMode =
  companyGmailRuntimeWatermarkMode === 'active' ? 'active' : 'freeze_only';

// router_state key: epoch-ms of the last time inbound Gmail delivery was proven
// alive — written when the 5-min label-poll cron completes a full history walk
// (i.e. the Mini reached Gmail directly, independent of the n8n push relay). The
// healer reads this to page only when delivery is *sustained*-stalled, so a
// transient push-relay wedge (which the poll backstops) never alerts. See
// src/healer/gmail-liveness.ts.
export const GMAIL_DELIVERY_STATE_KEY = 'gmail_last_delivery_ms';
