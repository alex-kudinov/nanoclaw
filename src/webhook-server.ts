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
import { ContainerOutput } from './container-runner.js';
import { logger } from './logger.js';
import { RegisteredGroup, SendMessageFn, WebhookDefinition } from './types.js';
import { extractEventKey } from './webhook-extractors.js';

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
  onProcess: (proc: ChildProcess, containerName: string) => void,
  onOutput?: (output: ContainerOutput) => Promise<void>,
) => Promise<ContainerOutput>;

export interface HealthPayload {
  channels: Record<
    string,
    { connected: boolean; lastActivitySec: number | null }
  >;
  activeContainers: number;
  lastMessageAt: string | null;
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
      this.server.listen(this.deps.port, '0.0.0.0', () => resolve());
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

    const prompt = renderPrompt(webhook.prompt_template, payload);
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

    this.deps
      .runAgent(
        group,
        {
          prompt,
          groupFolder: webhook.group,
          chatJid: webhook.chat_jid,
          isMain,
          isScheduledTask: true,
        },
        () => {}, // no queue registration for one-shot webhook agents
        async (streamedOutput: ContainerOutput) => {
          if (!streamedOutput.result) return;
          if (webhook.suppress_output) return;
          const raw =
            typeof streamedOutput.result === 'string'
              ? streamedOutput.result
              : JSON.stringify(streamedOutput.result);
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
      )
      .then(() => {
        logger.info({ hookId, requestId, inboxId }, 'Webhook agent completed');
        if (inboxId !== null && this.deps.markWebhookHandled) {
          this.deps
            .markWebhookHandled(inboxId, { handled_by: webhook.group })
            .catch((err) =>
              logger.error(
                { hookId, inboxId, err },
                'markWebhookHandled failed',
              ),
            );
        }
      })
      .catch((err) => {
        logger.error(
          { hookId, requestId, inboxId, err },
          'Webhook agent error',
        );
        if (inboxId !== null && this.deps.markWebhookFailed) {
          const msg = err instanceof Error ? err.message : String(err);
          this.deps.markWebhookFailed(inboxId, msg).catch((e) => {
            logger.error(
              { hookId, inboxId, err: e },
              'markWebhookFailed itself failed',
            );
          });
        }
      });
  }
}
