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
const HOME_DIR = process.env.HOME || '/Users/user';

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
export const IDLE_TIMEOUT = parseInt(process.env.IDLE_TIMEOUT || '1800000', 10); // 30min default — how long to keep container alive after last result
export const MAX_CONCURRENT_CONTAINERS = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENT_CONTAINERS || '5', 10) || 5,
);

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

// Token proxy — keeps auth tokens out of agent containers.
// Containers receive ANTHROPIC_BASE_URL pointing to the proxy instead of
// the real token. CONTAINER_HOST_IP is the host's IP as seen from containers
// (192.168.64.1 for Apple Container, host.docker.internal for Docker Desktop).
export const PROXY_PORT = parseInt(process.env.PROXY_PORT || '40960', 10);
export const CONTAINER_HOST_IP =
  process.env.CONTAINER_HOST_IP || '192.168.64.1';

// Webhook server — listens on all interfaces (including Tailscale) for
// inbound trigger events. WEBHOOK_SECRET is a global fallback; per-webhook
// secrets take precedence.
export const WEBHOOK_PORT = parseInt(process.env.WEBHOOK_PORT || '8088', 10);
export const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
export const WEBHOOKS_FILE = path.join(DATA_DIR, 'webhooks.json');

// Gmail configuration
const gmailEnv = readEnvFile([
  'GMAIL_MONITORED_EMAIL',
  'GMAIL_SEND_AS',
  'GMAIL_REPLY_TO',
  'GMAIL_LABEL',
  'GMAIL_POLL_INTERVAL',
  'GMAIL_TEST_RECIPIENT',
  'GMAIL_BCC',
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
