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

import { MAIN_GROUP_FOLDER } from './config.js';
import { ContainerOutput } from './container-runner.js';
import { logger } from './logger.js';
import { RegisteredGroup, SendMessageFn, WebhookDefinition } from './types.js';

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

export interface WebhookServerDeps {
  port: number;
  webhooksFile: string;
  globalSecret: string;
  getRegisteredGroups: () => Record<string, RegisteredGroup>;
  runAgent: RunAgentFn;
  sendMessage: SendMessageFn;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

    // Respond 202 immediately — agent runs async
    const requestId = crypto.randomUUID();
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ request_id: requestId }));

    const prompt = renderPrompt(webhook.prompt_template, payload);
    const isMain = webhook.group === MAIN_GROUP_FOLDER;

    logger.info(
      { hookId, requestId, group: webhook.group },
      'Webhook triggered',
    );

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
        logger.info({ hookId, requestId }, 'Webhook agent completed');
      })
      .catch((err) => {
        logger.error({ hookId, requestId, err }, 'Webhook agent error');
      });
  }
}
