/**
 * Webhook Server — lightweight local alternative to Zapier/n8n over Tailscale.
 *
 * Listens on 0.0.0.0:WEBHOOK_PORT so Tailscale-connected machines can POST
 * events that trigger agent runs. Each webhook definition maps an ID + secret
 * to a group folder + prompt template.
 *
 * Webhook definitions are loaded from data/webhooks.json and watched for
 * live changes. Agents can manage webhooks via IPC.
 *
 * Request flow:
 *   POST /hook/:id  →  validate secret  →  render prompt  →  202 immediately
 *   →  agent runs async  →  result POSTed to X-Callback-URL or sent to channel
 */

import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { ChildProcess } from 'child_process';

// MAIN_GROUP_FOLDER was removed from config; use group.isMain instead
import { BRIEF_POST_SECRET } from './config.js';
import { ContainerOutput } from './container-runner.js';
import { logger } from './logger.js';
import { RegisteredGroup, SendMessageFn, WebhookDefinition } from './types.js';
import { extractEventKey } from './webhook-extractors.js';
import {
  isCircuitOpen,
  recordFailure,
  recordSuccess,
} from './circuit-breaker.js';
import {
  parseBookedPayload,
  bookingHostWrite,
  BookedPayloadError,
} from './booking-host-write.js';
import { handleChaosActivity } from './chaos-activity.js';
import { recordChaosBooking } from './chaos-booking.js';
import { handleStripePayment } from './stripe-payment-host.js';
import { formatBookedNotice } from './host-router.js';
import type { ReleaseIdentity } from './release-integrity.js';
import {
  CNPC_INTAKE_WEBHOOK_ID,
  CnpcIntakePayloadError,
  parseCnpcIntakePayload,
  type CnpcIntakeInput,
  type CnpcPreparedIntake,
} from './cnpc-intake.js';
import {
  parseAndValidateCnpcMatchResult,
  stripCnpcMatchResult,
  type CnpcMatchResult,
} from './cnpc-match-result.js';
import type { BookingPlutioEnqueueResult } from './booking-plutio-host.js';

// Minimal compatible slice of the runContainerAgent signature
type RunAgentFn = (
  group: RegisteredGroup,
  input: {
    prompt: string;
    groupFolder: string;
    chatJid: string;
    isMain: boolean;
    isScheduledTask?: boolean;
  },
  onProcess: (
    proc: ChildProcess,
    containerName: string,
    capabilityFingerprint?: string,
  ) => void,
  onOutput?: (output: ContainerOutput) => Promise<void>,
) => Promise<ContainerOutput>;

export interface HealthPayload {
  release: ReleaseIdentity;
  channels: Record<
    string,
    {
      connected: boolean;
      lastActivitySec: number | null;
      diagnostics?: Record<string, string | number | boolean | null>;
    }
  >;
  activeContainers: number;
  lastMessageAt: string | null;
  actionSafety?: ReturnType<
    typeof import('./action-safety.js').getActionSafetyStatus
  >;
  capabilityManifests?: ReturnType<
    typeof import('./capability-manifest.js').getCapabilityManifestStatus
  >;
}

export interface WebhookServerDeps {
  port: number;
  webhooksFile: string;
  globalSecret: string;
  heartbeatPath: string;
  getRegisteredGroups: () => Record<string, RegisteredGroup>;
  runAgent: RunAgentFn;
  sendMessage: SendMessageFn;
  getHealth: () => HealthPayload;
  runHostJob?: (
    name: string,
    triggeredBy: string,
  ) => Promise<import('./types.js').JobRunResult>;
  getHostJob?: (name: string) => import('./types.js').Job | undefined;
  handleEmailOpen?: (token: string, userAgent: string) => Promise<void>;
  /** Process an unsubscribe click — looks up tracking token, sets party DND. */
  handleUnsubscribe?: (
    token: string,
  ) => Promise<{ ok: boolean; name?: string }>;
  // Gmail Pub/Sub push receiver — called by POST /hook/gmail-push.
  // Payload is decoded from message.data (base64 JSON).
  handleGmailPush?: (emailAddress: string, historyId: string) => Promise<void>;
  // Secret required on POST /hook/gmail-push. Falls back to globalSecret.
  gmailPushSecret?: string;
  // Phase 1 webhook reliability — envelope archive + dispatch tracking.
  // When provided, every accepted /hook/:id request is recorded in
  // business_v2.webhook_inbox before agent dispatch. See docs/WEBHOOK-RELIABILITY.md.
  archiveWebhook?: (
    input: import('./webhook-inbox.js').ArchiveInput,
  ) => Promise<import('./webhook-inbox.js').ArchiveResult>;
  markWebhookDispatched?: (id: number) => Promise<void>;
  markWebhookFailed?: (id: number, error: string) => Promise<void>;
  markWebhookHandled?: (
    id: number,
    opts: {
      handled_by: string;
      party_id?: number | null;
      related_entity?: unknown;
    },
  ) => Promise<void>;
  enqueueBookingPlutioActivity: (
    webhookInboxId: number,
  ) => Promise<BookingPlutioEnqueueResult>;
  // CNPC intake is validated and written by the host before the minion sees a
  // bounded match pool. The minion never receives database or Plutio writes.
  handleCnpcIntake?: (
    input: CnpcIntakeInput,
    webhookInboxId: number | null,
  ) => Promise<CnpcPreparedIntake>;
  recordCnpcMatchResult?: (
    result: CnpcMatchResult,
    prepared: CnpcPreparedIntake,
  ) => Promise<number>;
  // Per-group serialization. Webhook agent runs go through the GroupQueue
  // (like the message loop and scheduled tasks) so concurrent webhooks to one
  // group reuse a warm container instead of spawning rival ones that contend
  // over data/sessions/{group}/.
  enqueueAgentTask: (
    groupJid: string,
    taskId: string,
    fn: () => Promise<void>,
  ) => void;
  // Registers the spawned container with the queue for liveness/cleanup.
  registerProcess?: (
    groupJid: string,
    proc: ChildProcess,
    containerName: string,
    groupFolder: string,
    capabilityFingerprint?: string,
  ) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPrompt(template: string, payload: unknown): string {
  if (!template) return '';
  const json = JSON.stringify(payload, null, 2);
  return template
    .replace(/\{\{payload\}\}/g, json)
    .replace(/\{\{payload\.([^}]+)\}\}/g, (_, dotPath: string) => {
      const value = dotPath.split('.').reduce((obj: unknown, key: string) => {
        if (obj !== null && typeof obj === 'object') {
          return (obj as Record<string, unknown>)[key];
        }
        return undefined;
      }, payload);
      return value !== undefined ? String(value) : '';
    });
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function postCallback(url: string, data: unknown): Promise<void> {
  const body = Buffer.from(JSON.stringify(data));
  const urlObj = new URL(url);
  const isHttps = urlObj.protocol === 'https:';
  const options: http.RequestOptions = {
    hostname: urlObj.hostname,
    port: urlObj.port || (isHttps ? 443 : 80),
    path: urlObj.pathname + urlObj.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': body.length,
    },
  };
  const lib = isHttps ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(options, (res) => {
      res.resume(); // drain response
      resolve();
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function loadWebhooks(filePath: string): WebhookDefinition[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as WebhookDefinition[];
  } catch (err) {
    logger.error(
      { err, filePath },
      'Webhook server: failed to load webhooks file',
    );
    return [];
  }
}

function saveWebhooks(filePath: string, webhooks: WebhookDefinition[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(webhooks, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// WebhookServer
// ---------------------------------------------------------------------------

export class WebhookServer {
  private server: http.Server;
  private deps: WebhookServerDeps;
  private webhooks: WebhookDefinition[] = [];
  private watcher: fs.StatWatcher | null = null;

  constructor(deps: WebhookServerDeps) {
    this.deps = deps;
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((err) => {
        logger.error({ err }, 'Webhook server: unhandled request error');
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      });
    });
  }

  start(): Promise<void> {
    this.webhooks = loadWebhooks(this.deps.webhooksFile);
    logger.info(
      { port: this.deps.port, webhookCount: this.webhooks.length },
      'Webhook server started',
    );

    // Watch for live changes to webhooks.json
    try {
      this.watcher = fs.watchFile(
        this.deps.webhooksFile,
        { interval: 2000 },
        () => {
          this.webhooks = loadWebhooks(this.deps.webhooksFile);
          logger.info(
            { webhookCount: this.webhooks.length },
            'Webhook server: reloaded webhooks',
          );
        },
      );
    } catch {
      // File may not exist yet — watcher set up when it's created
    }

    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.deps.port, '0.0.0.0', () => {
        // Port 0 is useful for isolated tests and local tooling: retain the
        // kernel-assigned port so callers using the dependency object can
        // connect without racing a guessed fixed range.
        this.deps.port = this.getPort();
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    if (this.watcher) {
      fs.unwatchFile(this.deps.webhooksFile);
      this.watcher = null;
    }
    return new Promise((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  getPort(): number {
    const address = this.server.address();
    if (address && typeof address === 'object') return address.port;
    return this.deps.port;
  }

  // IPC-callable management methods

  addWebhook(def: WebhookDefinition): void {
    this.webhooks = this.webhooks.filter((w) => w.id !== def.id);
    this.webhooks.push(def);
    saveWebhooks(this.deps.webhooksFile, this.webhooks);
    logger.info({ id: def.id, name: def.name }, 'Webhook registered');
  }

  removeWebhook(id: string): boolean {
    const before = this.webhooks.length;
    this.webhooks = this.webhooks.filter((w) => w.id !== id);
    if (this.webhooks.length < before) {
      saveWebhooks(this.deps.webhooksFile, this.webhooks);
      logger.info({ id }, 'Webhook removed');
      return true;
    }
    return false;
  }

  listWebhooks(): WebhookDefinition[] {
    return this.webhooks.map(
      ({ secret: _, ...rest }) => rest as WebhookDefinition,
    );
  }

  // ---------------------------------------------------------------------------
  // Request handler
  // ---------------------------------------------------------------------------

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    // GET /health — raw metrics for external watchdog (no auth — Tailscale only)
    if (req.method === 'GET' && req.url === '/health') {
      let heartbeat: Record<string, unknown> = {};
      try {
        heartbeat = JSON.parse(
          fs.readFileSync(this.deps.heartbeatPath, 'utf8'),
        );
      } catch {
        /* heartbeat file may not exist yet during startup */
      }
      const health = this.deps.getHealth();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...heartbeat, ...health }));
      return;
    }

    // GET /t/:token — tracking pixel for email opens
    const trackMatch =
      req.method === 'GET' && req.url?.match(/^\/t\/([a-zA-Z0-9_-]+)$/);
    if (trackMatch) {
      const token = trackMatch[1];
      const pixel = Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64',
      );
      res.writeHead(200, {
        'Content-Type': 'image/gif',
        'Content-Length': String(pixel.length),
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      });
      res.end(pixel);
      if (this.deps.handleEmailOpen) {
        const ua = (
          (req.headers['user-agent'] as string) || 'unknown'
        ).substring(0, 500);
        this.deps
          .handleEmailOpen(token, ua)
          .catch((err) =>
            logger.warn({ err, token }, 'Email open handler failed'),
          );
      }
      return;
    }

    // GET /unsubscribe/:token — lead opts out of follow-up emails
    const unsubMatch =
      req.method === 'GET' &&
      req.url?.match(/^\/unsubscribe\/([a-zA-Z0-9_-]+)$/);
    if (unsubMatch) {
      const token = unsubMatch[1];
      if (!this.deps.handleUnsubscribe) {
        res.writeHead(503, { 'Content-Type': 'text/html' });
        res.end('<p>Unsubscribe is not configured.</p>');
        return;
      }
      try {
        const result = await this.deps.handleUnsubscribe(token);
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        if (result.ok) {
          res.end(
            `<!DOCTYPE html><html><head><title>Unsubscribed</title></head><body style="font-family:system-ui,sans-serif;max-width:480px;margin:60px auto;text-align:center;"><h2>You've been unsubscribed</h2><p>${result.name ? `<strong>${escapeHtml(result.name)}</strong>, you` : 'You'} will no longer receive follow-up emails from Tandem Coaching.</p><p style="color:#666;margin-top:24px;">If this was a mistake, reply to any previous email from us and we'll re-enable communications.</p></body></html>`,
          );
        } else {
          res.end(
            '<!DOCTYPE html><html><head><title>Unsubscribe</title></head><body style="font-family:system-ui,sans-serif;max-width:480px;margin:60px auto;text-align:center;"><h2>Link not recognized</h2><p>This unsubscribe link is not valid. If you want to stop receiving emails, reply to any email from us with "unsubscribe".</p></body></html>',
          );
        }
      } catch (err) {
        logger.error({ err, token }, 'Unsubscribe handler failed');
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(
          '<p>Something went wrong. Please try again or reply "unsubscribe" to any email from us.</p>',
        );
      }
      return;
    }

    // GET /hooks — list all webhooks (admin, guarded by global secret)
    if (req.method === 'GET' && req.url === '/hooks') {
      if (this.deps.globalSecret) {
        if (req.headers['x-webhook-secret'] !== this.deps.globalSecret) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid secret' }));
          return;
        }
      }
      const redacted = this.webhooks.map(({ secret: _, ...rest }) => rest);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(redacted));
      return;
    }

    // Job trigger endpoint: POST /api/job/:name
    const jobMatch =
      req.method === 'POST' && req.url?.match(/^\/api\/job\/([^/?]+)/);
    if (jobMatch) {
      // Auth check - same pattern as existing webhook auth
      const secret = req.headers['x-webhook-secret'] as string;
      if (!secret || secret !== this.deps.globalSecret) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      const jobName = decodeURIComponent(jobMatch[1]);

      if (!this.deps.getHostJob || !this.deps.runHostJob) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Job system not initialized' }));
        return;
      }

      const job = this.deps.getHostJob(jobName);
      if (!job) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Job not found: ${jobName}` }));
        return;
      }

      if (!job.enabled) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Job is disabled: ${jobName}` }));
        return;
      }

      // Fire-and-forget with error handling
      this.deps
        .runHostJob(
          jobName,
          `webhook:${req.headers['x-forwarded-for'] || 'unknown'}`,
        )
        .catch((err) => {
          logger.error({ err, job: jobName }, 'Webhook job dispatch failed');
        });

      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'started', job: jobName }));
      return;
    }

    // POST /api/post — post literal text to a channel (used by the Studio's
    // daily decision-brief poster). Auth: BRIEF_POST_SECRET (file-loaded; the
    // process.env-based globalSecret is empty on this deployment). No agent.
    if (req.method === 'POST' && req.url?.split('?')[0] === '/api/post') {
      const secret = req.headers['x-webhook-secret'] as string;
      if (!BRIEF_POST_SECRET || !secret || secret !== BRIEF_POST_SECRET) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      let body: Buffer;
      try {
        body = await readBody(req);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to read body' }));
        return;
      }
      let p: { channel?: string; text?: string; thread_ts?: string };
      try {
        p = JSON.parse(body.toString('utf-8'));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }
      if (!p.channel || !p.text) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing channel or text' }));
        return;
      }
      try {
        await this.deps.sendMessage(
          p.channel,
          p.text,
          p.thread_ts ? { threadTs: p.thread_ts } : undefined,
        );
      } catch (err) {
        logger.error(
          { err, channel: p.channel },
          '/api/post sendMessage failed',
        );
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'send failed' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // POST /hook/gmail-push — Gmail Pub/Sub push receiver (via n8n forward).
    // Body: { message: { data: base64(JSON({emailAddress, historyId})) } }
    const gmailPushUrl = req.url?.split('?')[0];
    if (req.method === 'POST' && gmailPushUrl === '/hook/gmail-push') {
      const expectedSecret =
        this.deps.gmailPushSecret || this.deps.globalSecret;
      if (expectedSecret) {
        if (req.headers['x-webhook-secret'] !== expectedSecret) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid secret' }));
          return;
        }
      }

      if (!this.deps.handleGmailPush) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Gmail push handler not configured' }));
        return;
      }

      let body: Buffer;
      try {
        body = await readBody(req);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to read body' }));
        return;
      }

      let envelope: { message?: { data?: string } };
      try {
        envelope = JSON.parse(body.toString('utf-8'));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      const dataB64 = envelope?.message?.data;
      if (!dataB64 || typeof dataB64 !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing message.data' }));
        return;
      }

      let payload: { emailAddress?: string; historyId?: string | number };
      try {
        payload = JSON.parse(Buffer.from(dataB64, 'base64').toString('utf-8'));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid message.data payload' }));
        return;
      }

      const emailAddress = payload.emailAddress;
      const historyId =
        payload.historyId != null ? String(payload.historyId) : '';
      if (!emailAddress || !historyId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing emailAddress or historyId' }));
        return;
      }

      // Ack immediately — handler runs async. Pub/Sub retries on non-2xx.
      res.writeHead(204);
      res.end();

      this.deps
        .handleGmailPush(emailAddress, historyId)
        .catch((err) =>
          logger.error(
            { err, emailAddress, historyId },
            'Gmail push handler threw',
          ),
        );
      return;
    }

    // POST /hook/:id — trigger webhook
    const match = req.method === 'POST' && req.url?.match(/^\/hook\/([^/?]+)/);
    if (!match) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    const hookId = match[1];
    const webhook = this.webhooks.find((w) => w.id === hookId);
    if (!webhook) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Webhook not found: ${hookId}` }));
      return;
    }

    // Validate secret: per-webhook secret takes precedence over global
    const expectedSecret = webhook.secret || this.deps.globalSecret;
    if (expectedSecret) {
      if (req.headers['x-webhook-secret'] !== expectedSecret) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid secret' }));
        return;
      }
    }

    // Parse body
    let payload: unknown;
    try {
      const body = await readBody(req);
      payload = body.length > 0 ? JSON.parse(body.toString('utf-8')) : {};
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }

    // CNPC's public-form contract is validated before archive/ack. This keeps
    // malformed n8n mappings out of the async agent lane and gives n8n a 422
    // it can route to its error workflow.
    let parsedCnpcIntake: CnpcIntakeInput | null = null;
    if (hookId === CNPC_INTAKE_WEBHOOK_ID) {
      try {
        parsedCnpcIntake = parseCnpcIntakePayload(payload);
      } catch (err) {
        if (err instanceof CnpcIntakePayloadError) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
          return;
        }
        throw err;
      }
    }

    // Resolve registered group
    const groups = this.deps.getRegisteredGroups();
    const group = Object.values(groups).find((g) => g.folder === webhook.group);
    if (!group) {
      res.writeHead(422, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ error: `Group not configured: ${webhook.group}` }),
      );
      return;
    }

    // Per-request X-Callback-URL overrides webhook's fixed callback_url
    const callbackUrl =
      (req.headers['x-callback-url'] as string | undefined) ||
      webhook.callback_url;

    // Phase 1 — archive envelope before dispatch. Hard-fails the request if
    // archive write errors so n8n / upstream sees the failure and we never
    // dispatch an agent without a corresponding inbox row.
    let inboxId: number | null = null;
    if (this.deps.archiveWebhook) {
      const { event_id, event_type } = extractEventKey(hookId, payload);
      try {
        const archived = await this.deps.archiveWebhook({
          source: hookId,
          event_id,
          event_type,
          raw_headers: req.headers,
          raw_body: payload,
          delivery_path: 'n8n',
        });
        inboxId = archived.id;
        if (archived.isDuplicate) {
          logger.info(
            { hookId, inboxId },
            'Webhook envelope is duplicate; skipping dispatch',
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({ webhook_inbox_id: inboxId, duplicate: true }),
          );
          return;
        }
      } catch (err) {
        logger.error(
          { hookId, err },
          'Webhook envelope archive failed; refusing dispatch',
        );
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'archive failed' }));
        return;
      }
    }

    // Respond 202 immediately — agent runs async
    const requestId = crypto.randomUUID();
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        request_id: requestId,
        webhook_inbox_id: inboxId,
      }),
    );

    let promptPayload = payload;
    let cnpcIntakeId: number | null = null;
    let cnpcPreparedIntake: CnpcPreparedIntake | null = null;
    const isMain = group.isMain === true;

    logger.info(
      { hookId, requestId, inboxId, group: webhook.group },
      'Webhook triggered',
    );

    if (inboxId !== null && this.deps.markWebhookDispatched) {
      await this.deps.markWebhookDispatched(inboxId).catch((err) => {
        logger.error({ hookId, inboxId, err }, 'markWebhookDispatched failed');
      });
    }

    if (hookId === CNPC_INTAKE_WEBHOOK_ID) {
      if (!parsedCnpcIntake || !this.deps.handleCnpcIntake) {
        const reason = 'CNPC intake host handler is not configured';
        logger.error({ hookId, inboxId }, reason);
        if (inboxId !== null && this.deps.markWebhookFailed) {
          await this.deps
            .markWebhookFailed(inboxId, reason)
            .catch((err) =>
              logger.error(
                { hookId, inboxId, err },
                'markWebhookFailed failed',
              ),
            );
        }
        return;
      }
      try {
        const prepared = await this.deps.handleCnpcIntake(
          parsedCnpcIntake,
          inboxId,
        );
        promptPayload = prepared;
        cnpcIntakeId = prepared.intake.id;
        cnpcPreparedIntake = prepared;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        logger.error({ hookId, inboxId, err }, 'CNPC intake host write failed');
        if (inboxId !== null && this.deps.markWebhookFailed) {
          await this.deps
            .markWebhookFailed(inboxId, reason)
            .catch((markErr) =>
              logger.error(
                { hookId, inboxId, err: markErr },
                'markWebhookFailed failed',
              ),
            );
        }
        return;
      }
    }

    // Chaos verified visitor — an ACTIVITY signal, never an inquiry. Recorded
    // mechanically (party + optional lead + interaction row) with NO agent
    // spawn and zero tokens. Mirrors the booking host-write block below.
    if (hookId === 'chaos') {
      try {
        const r = await handleChaosActivity(payload);
        const cp = payload as Record<string, unknown>;
        const name =
          (typeof cp.display_name === 'string' && cp.display_name.trim()) ||
          (typeof cp.email === 'string' ? cp.email : 'unknown');
        const formPage =
          typeof cp.form_page === 'string' && cp.form_page.trim()
            ? cp.form_page.trim()
            : null;
        const formEvent =
          typeof cp.form_event_type === 'string' && cp.form_event_type.trim()
            ? cp.form_event_type.trim()
            : null;
        // Mobile-friendly preview: lead with source, name, action so the first
        // ~40 chars are meaningful before the reader opens the notification.
        const pageSlug = formPage
          ? formPage.replace(/^\/+|\/+$/g, '').replace(/\//g, '-')
          : null;
        const eventSlug = formEvent ? formEvent.replace(/^form_/, '') : null;
        const action = pageSlug || eventSlug;
        const actionPart = action ? ` - ${action}` : '';
        await this.deps.sendMessage(
          webhook.chat_jid,
          `[chaos] ${name}${actionPart} - ${r.disposition} (party ${r.partyId})`,
          { fromGroup: group.folder },
        );
        if (inboxId !== null && this.deps.markWebhookHandled) {
          await this.deps
            .markWebhookHandled(inboxId, {
              handled_by: 'chaos:host-handler',
              party_id: r.partyId,
            })
            .catch((err) =>
              logger.error(
                { hookId, inboxId, err },
                'markWebhookHandled failed',
              ),
            );
        }
        logger.info(
          { hookId, inboxId, party_id: r.partyId, disposition: r.disposition },
          'Chaos activity recorded (no agent spawn)',
        );
        return;
      } catch (err) {
        logger.error({ hookId, err }, '[ERROR] chaos host-handler failed');
        if (inboxId !== null && this.deps.markWebhookFailed) {
          await this.deps
            .markWebhookFailed(
              inboxId,
              err instanceof Error ? err.message : String(err),
            )
            .catch((e) =>
              logger.error(
                { hookId, inboxId, err: e },
                'markWebhookFailed failed',
              ),
            );
        }
        const chiefEntry = Object.entries(this.deps.getRegisteredGroups()).find(
          ([, g]) => g.folder === 'chief',
        );
        if (chiefEntry) {
          await this.deps
            .sendMessage(
              chiefEntry[0],
              `[ESCALATION] chaos host-handler failed — manual review needed: ${
                err instanceof Error ? err.message : String(err)
              }`,
              { fromGroup: 'chief' },
            )
            .catch((e) =>
              logger.error({ hookId, err: e }, 'chief escalation post failed'),
            );
        }
        return;
      }
    }

    // Generic form submission — chaos-tracker's "any form on tandemcoach.co was
    // submitted" pipe, independent of identity verification state. Mobile-
    // friendly one-liner to #gru-inbox, no agent spawn, zero tokens. Spec:
    // caos-ext/chaos-tracker/handoffs/2026-05-24-spec-generic-form-submission-
    // forward.md.
    if (hookId === 'form-submitted') {
      try {
        const fp = payload as Record<string, unknown>;
        const displayName =
          typeof fp.display_name === 'string' && fp.display_name.trim()
            ? fp.display_name.trim()
            : null;
        const email =
          typeof fp.email === 'string' && fp.email.trim()
            ? fp.email.trim()
            : null;
        const subtype =
          typeof fp.form_event_subtype === 'string' &&
          fp.form_event_subtype.trim()
            ? fp.form_event_subtype.trim()
            : null;
        const formPage =
          typeof fp.form_page === 'string' && fp.form_page.trim()
            ? fp.form_page.trim()
            : null;
        const identity =
          typeof fp.identity_status === 'string' && fp.identity_status.trim()
            ? fp.identity_status.trim()
            : 'unknown';
        const fields =
          fp.fields &&
          typeof fp.fields === 'object' &&
          !Array.isArray(fp.fields)
            ? (fp.fields as Record<string, unknown>)
            : {};

        const name =
          displayName || (email ? email.split('@')[0] : null) || 'Anonymous';
        const action =
          subtype ||
          (formPage
            ? formPage.replace(/^\/+|\/+$/g, '').replace(/\//g, '-')
            : 'unknown-form');

        const IDENTITY_KEYS = new Set([
          'first_name',
          'last_name',
          'email',
          'name',
          'website',
        ]);
        const extras: string[] = [];
        for (const [k, v] of Object.entries(fields)) {
          if (IDENTITY_KEYS.has(k)) continue;
          if (v == null || v === '' || v === false) continue;
          const s = Array.isArray(v) ? v.join('+') : String(v);
          if (s.length === 0 || s.length > 40) continue;
          extras.push(s);
          if (extras.length >= 2) break;
        }
        const extrasPart = extras.length ? ` - ${extras.join('/')}` : '';
        const emailPart = email ? ` (${email})` : '';

        // 'observed' = an anonymous page/form view with no identity captured —
        // the highest-volume, lowest-signal Chaos event, and the same person
        // re-fires it on every page view. Suppress the Slack post (pure noise;
        // 'verified' hits and the [chaos] dispositions still surface) but still
        // mark the event handled so it reaches a terminal state and the inbox
        // reaper does not retry it. Operator decision 2026-06-17.
        if (identity === 'observed') {
          if (inboxId !== null && this.deps.markWebhookHandled) {
            await this.deps
              .markWebhookHandled(inboxId, {
                handled_by: 'form-submitted:observed-suppressed',
              })
              .catch((err) =>
                logger.error(
                  { hookId, inboxId, err },
                  'markWebhookHandled failed',
                ),
              );
          }
          logger.info(
            { hookId, inboxId, identity, subtype: action },
            'Form submission observed-only — suppressed (no Slack post)',
          );
          return;
        }

        const message = `[form] ${name} - ${action}${extrasPart} - ${identity}${emailPart}`;

        await this.deps.sendMessage(webhook.chat_jid, message, {
          fromGroup: group.folder,
        });
        if (inboxId !== null && this.deps.markWebhookHandled) {
          await this.deps
            .markWebhookHandled(inboxId, {
              handled_by: 'form-submitted:host-handler',
            })
            .catch((err) =>
              logger.error(
                { hookId, inboxId, err },
                'markWebhookHandled failed',
              ),
            );
        }
        logger.info(
          {
            hookId,
            inboxId,
            subtype: action,
            identity,
            submission_id: fp.submission_id,
          },
          'Form submission ping posted (no agent spawn)',
        );
        return;
      } catch (err) {
        logger.error(
          { hookId, err },
          '[ERROR] form-submitted host-handler failed',
        );
        if (inboxId !== null && this.deps.markWebhookFailed) {
          await this.deps
            .markWebhookFailed(
              inboxId,
              err instanceof Error ? err.message : String(err),
            )
            .catch((e) =>
              logger.error(
                { hookId, inboxId, err: e },
                'markWebhookFailed failed',
              ),
            );
        }
        return;
      }
    }

    // Stripe payment — runs the deterministic process-payment.cjs pipeline on
    // the host (Stripe fetch + Sheets + DB), NO agent container, NO LLM.
    if (hookId === 'stripe-payment') {
      try {
        const r = await handleStripePayment(payload);
        // process-payment.cjs has already durably recorded the payment
        // (Stripe → Sheets → Postgres). Mark the inbox row handled BEFORE the
        // Slack post so a dead socket can't strand a processed payment as
        // 'dispatched' and trigger a needless reaper re-run.
        if (inboxId !== null && this.deps.markWebhookHandled) {
          await this.deps
            .markWebhookHandled(inboxId, { handled_by: 'stripe:host-handler' })
            .catch((err) =>
              logger.error(
                { hookId, inboxId, err },
                'markWebhookHandled failed',
              ),
            );
        }
        logger.info(
          { hookId, inboxId, stripeId: r.stripeId },
          'Stripe payment recorded (no agent spawn)',
        );
        await this.deps
          .sendMessage(webhook.chat_jid, r.summary, {
            fromGroup: group.folder,
          })
          .catch((err) =>
            logger.error(
              { hookId, inboxId, err },
              'stripe summary post failed',
            ),
          );
        return;
      } catch (err) {
        logger.error({ hookId, err }, '[ERROR] stripe host-handler failed');
        if (inboxId !== null && this.deps.markWebhookFailed) {
          await this.deps
            .markWebhookFailed(
              inboxId,
              err instanceof Error ? err.message : String(err),
            )
            .catch((e) =>
              logger.error(
                { hookId, inboxId, err: e },
                'markWebhookFailed failed',
              ),
            );
        }
        const chiefEntry = Object.entries(this.deps.getRegisteredGroups()).find(
          ([, g]) => g.folder === 'chief',
        );
        if (chiefEntry) {
          await this.deps
            .sendMessage(
              chiefEntry[0],
              `[ESCALATION] stripe host-handler failed — manual review needed: ${
                err instanceof Error ? err.message : String(err)
              }`,
              { fromGroup: 'chief' },
            )
            .catch((e) =>
              logger.error({ hookId, err: e }, 'chief escalation post failed'),
            );
        }
        return;
      }
    }

    // T03b — host-side booking write. A valid Trafft `booked` event is
    // handled mechanically (party resolution + interaction row) with NO
    // agent spawn. Placed BEFORE the T02 [PROCESSING] block so a host-written
    // booked event returns before any [PROCESSING] line is posted.
    const { event_type: bookingEventType } = extractEventKey(hookId, payload);
    if (bookingEventType === 'booked') {
      let parsedBooking;
      try {
        parsedBooking = parseBookedPayload(payload);
      } catch (err) {
        if (err instanceof BookedPayloadError) {
          logger.warn(
            { hookId, err },
            '[WARN] booking: malformed booked payload, falling back to agent',
          );
          // fall through to the normal runAgent dispatch below
        } else {
          throw err;
        }
      }
      if (parsedBooking) {
        try {
          const r = await bookingHostWrite(parsedBooking);

          // Attach this booking to its Chaos visitor when the booking link
          // carried a cid (Chaos fingerprint). Non-fatal: a Chaos outage or an
          // un-tracked visitor must never break booking persistence.
          void recordChaosBooking(parsedBooking, r.party_id)
            .then((cr) => {
              if (cr.status === 'degraded') {
                logger.warn(
                  {
                    hookId,
                    event_id: parsedBooking?.event_id,
                    reason: cr.reason,
                  },
                  'chaos booking record degraded (non-fatal)',
                );
              } else if (cr.status !== 'skipped') {
                logger.info(
                  {
                    hookId,
                    event_id: parsedBooking?.event_id,
                    chaos_status: cr.status,
                    visitor_id: cr.visitor_id,
                  },
                  'chaos booking record',
                );
              }
            })
            .catch((err) =>
              logger.warn(
                { hookId, err },
                'chaos booking record threw (non-fatal)',
              ),
            );

          const fullName = [
            parsedBooking.customerFirstName,
            parsedBooking.customerLastName,
          ]
            .filter(Boolean)
            .join(' ');
          const customerName =
            parsedBooking.customerFullName ||
            fullName ||
            parsedBooking.customerEmail;
          await this.deps.sendMessage(
            webhook.chat_jid,
            formatBookedNotice({
              customer_name: customerName,
              customer_email: parsedBooking.customerEmail,
              customer_phone: parsedBooking.customerPhone,
              service: parsedBooking.serviceName,
              start_time: parsedBooking.startDateTime,
              employee: parsedBooking.employeeName,
              status: parsedBooking.status,
              party_id: r.party_id,
              booking_row_id: r.booking_row_id,
              customFields: parsedBooking.customFields,
            }),
            { fromGroup: group.folder },
          );
          if (inboxId !== null && this.deps.markWebhookHandled) {
            await this.deps
              .markWebhookHandled(inboxId, {
                handled_by: 'booking:host-write',
                party_id: r.party_id,
              })
              .catch((err) =>
                logger.error(
                  { hookId, inboxId, err },
                  'markWebhookHandled failed',
                ),
              );
          }
          logger.info(
            {
              hookId,
              inboxId,
              event_id: parsedBooking.event_id,
              party_id: r.party_id,
              interaction_id: r.interaction_id,
            },
            'Booking host-write completed (no agent spawn)',
          );
          return;
        } catch (err) {
          logger.error(
            { hookId, event_id: parsedBooking.event_id, err },
            '[ERROR] booking host-write failed',
          );
          if (inboxId !== null && this.deps.markWebhookFailed) {
            await this.deps
              .markWebhookFailed(
                inboxId,
                err instanceof Error ? err.message : String(err),
              )
              .catch((e) =>
                logger.error(
                  { hookId, inboxId, err: e },
                  'markWebhookFailed failed',
                ),
              );
          }
          const groups = this.deps.getRegisteredGroups();
          const chiefEntry = Object.entries(groups).find(
            ([, g]) => g.folder === 'chief',
          );
          if (chiefEntry) {
            await this.deps
              .sendMessage(
                chiefEntry[0],
                `[ESCALATION] booking host-write failed event_id=${parsedBooking.event_id} — manual review needed`,
                { fromGroup: 'chief' },
              )
              .catch((e) =>
                logger.error(
                  { hookId, err: e },
                  'chief escalation post failed',
                ),
              );
          } else {
            logger.error(
              { hookId },
              '[ERROR] booking host-write: chief group not registered for escalation',
            );
          }
          return;
        }
      }
    }

    const prompt = renderPrompt(webhook.prompt_template, promptPayload);

    // Circuit breaker — this dispatch path spawns an agent container directly,
    // bypassing the GroupQueue (and its per-group serialization + breaker). A
    // group whose containers keep failing (e.g. a frozen container runtime)
    // would otherwise get a storm of concurrent doomed spawns from back-to-back
    // webhook deliveries, starving the container pool. Skip the spawn while the
    // circuit is open; the inbox row is left failed so the webhook-inbox-reaper
    // retries it after the cooldown.
    if (isCircuitOpen(webhook.group)) {
      logger.warn(
        { hookId, requestId, inboxId, group: webhook.group },
        'Webhook agent dispatch skipped — circuit open for group',
      );
      if (inboxId !== null && this.deps.markWebhookFailed) {
        await this.deps
          .markWebhookFailed(
            inboxId,
            'circuit open — group agent failing repeatedly',
          )
          .catch((err) =>
            logger.error({ hookId, inboxId, err }, 'markWebhookFailed failed'),
          );
      }
      return;
    }

    // Route the agent run through the GroupQueue — the same per-group
    // serialization the message loop and scheduled tasks use. Dispatching
    // runAgent directly let two webhooks to one group spawn rival containers
    // that contended over the shared data/sessions/{group}/ directory.
    // ||root keys it to the group's non-threaded slot so it also serializes
    // against the message loop's root-thread processing for the channel.
    const groupQueueKey = `${webhook.chat_jid}||root`;
    this.deps.enqueueAgentTask(
      groupQueueKey,
      `webhook:${requestId}`,
      async () => {
        // Mechanical processing message — opt-in per group (T02). Posted when
        // the task actually starts, not at enqueue time, so a queued webhook's
        // [PROCESSING] line lands with its work rather than ahead of a wait.
        const wsProcessingMessage = group.containerConfig?.processingMessage;
        if (wsProcessingMessage) {
          try {
            await this.deps.sendMessage(
              webhook.chat_jid,
              `[PROCESSING] ${wsProcessingMessage}`,
              { fromGroup: group.folder },
            );
          } catch (err) {
            logger.error(
              { hookId, group: group.folder, err },
              '[ERROR] processing-message post failed',
            );
          }
        }

        try {
          const output = await this.deps.runAgent(
            group,
            {
              prompt,
              groupFolder: webhook.group,
              chatJid: webhook.chat_jid,
              isMain,
              isScheduledTask: true,
            },
            (proc, containerName, capabilityFingerprint) =>
              this.deps.registerProcess?.(
                groupQueueKey,
                proc,
                containerName,
                group.folder,
                capabilityFingerprint,
              ),
            async (streamedOutput: ContainerOutput) => {
              if (!streamedOutput.result) return;
              let raw =
                typeof streamedOutput.result === 'string'
                  ? streamedOutput.result
                  : JSON.stringify(streamedOutput.result);
              const cnpcRequiresMatchResult =
                cnpcPreparedIntake?.eligibility.status === 'eligible' &&
                cnpcPreparedIntake.match_pool.candidate_count > 0;
              if (
                hookId === CNPC_INTAKE_WEBHOOK_ID &&
                cnpcRequiresMatchResult
              ) {
                if (!cnpcPreparedIntake || !this.deps.recordCnpcMatchResult) {
                  throw new Error(
                    'CNPC match-result recorder is not configured',
                  );
                }
                const matchResult = parseAndValidateCnpcMatchResult(
                  raw,
                  cnpcPreparedIntake,
                );
                await this.deps.recordCnpcMatchResult(
                  matchResult,
                  cnpcPreparedIntake,
                );
                raw = stripCnpcMatchResult(raw);
              }
              if (webhook.suppress_output) return;
              const text = raw
                .replace(/<internal>[\s\S]*?<\/internal>/g, '')
                .trim();
              if (!text) return;

              if (callbackUrl) {
                try {
                  await postCallback(callbackUrl, {
                    request_id: requestId,
                    result: text,
                  });
                  logger.info(
                    { hookId, requestId, callbackUrl },
                    'Webhook callback delivered',
                  );
                } catch (err) {
                  logger.error(
                    { hookId, requestId, callbackUrl, err },
                    'Webhook callback delivery failed',
                  );
                }
              } else {
                try {
                  await this.deps.sendMessage(webhook.chat_jid, text, {
                    fromGroup: webhook.group,
                  });
                } catch (err) {
                  logger.error(
                    { hookId, requestId, err },
                    'Webhook sendMessage failed',
                  );
                }
              }
            },
          );
          // A resolved promise can still carry an errored container result.
          // Treat it as a failed webhook so it remains retryable and never
          // authorizes a downstream host action.
          if (output.status === 'error') {
            throw new Error(
              `webhook agent returned error: ${output.error || 'unknown error'}`,
            );
          }
          let bookingPlutio: BookingPlutioEnqueueResult | undefined;
          if (
            hookId === 'trafft' &&
            (bookingEventType === 'canceled' ||
              bookingEventType === 'rescheduled')
          ) {
            if (inboxId === null) {
              throw new Error(
                'Booking Plutio enqueue requires an archived webhook row',
              );
            }
            bookingPlutio =
              await this.deps.enqueueBookingPlutioActivity(inboxId);
          }
          recordSuccess(webhook.group);
          logger.info(
            {
              hookId,
              requestId,
              inboxId,
              bookingPlutioOutboxId: bookingPlutio?.outboxId,
              bookingPlutioDuplicate: bookingPlutio?.duplicate,
            },
            'Webhook agent completed',
          );
          if (inboxId !== null && this.deps.markWebhookHandled) {
            await this.deps
              .markWebhookHandled(inboxId, {
                handled_by: webhook.group,
                party_id: bookingPlutio?.partyId,
                related_entity: bookingPlutio
                  ? {
                      kind: 'booking_plutio_outbox',
                      id: bookingPlutio.outboxId,
                      interaction_id: bookingPlutio.interactionId,
                    }
                  : cnpcIntakeId !== null
                    ? { kind: 'cnpc_intake', id: cnpcIntakeId }
                    : undefined,
              })
              .catch((err) =>
                logger.error(
                  { hookId, inboxId, err },
                  'markWebhookHandled failed',
                ),
              );
          }
        } catch (err) {
          // A thrown rejection is also a failure for breaker accounting.
          recordFailure(webhook.group);
          logger.error(
            { hookId, requestId, inboxId, err },
            'Webhook agent or completion-gate error',
          );
          if (inboxId !== null && this.deps.markWebhookFailed) {
            const msg = err instanceof Error ? err.message : String(err);
            await this.deps.markWebhookFailed(inboxId, msg).catch((e) => {
              logger.error(
                { hookId, inboxId, err: e },
                'markWebhookFailed itself failed',
              );
            });
          }
        }
      },
    );
  }
}
