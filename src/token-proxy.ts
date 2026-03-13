/**
 * Token Proxy — keeps auth tokens out of agent containers.
 *
 * Containers receive ANTHROPIC_BASE_URL pointing here and a placeholder
 * API key. The proxy strips the placeholder, injects the real token from
 * .env, and forwards the request to api.anthropic.com.
 *
 * Single key: set ANTHROPIC_API_KEY (or CLAUDE_CODE_OAUTH_TOKEN) in .env.
 *
 * Key pool: set ANTHROPIC_API_KEY_1 … _5 (and/or CLAUDE_CODE_OAUTH_TOKEN_1 … _5)
 * to enable automatic rotation. On 429 (rate limit) or 401 (invalid/expired key)
 * the proxy cycles to the next slot and retries transparently. Tokens are never
 * auto-removed from .env — a 401 may be transient (network outage, API blip).
 * Keys are read from .env on every request so adding a key takes effect immediately.
 */

import http from 'http';
import https from 'https';

import { readEnvFile } from './env.js';
import { logger } from './logger.js';

const ANTHROPIC_API_HOST = 'api.anthropic.com';
const ANTHROPIC_API_PORT = 443;
const MAX_POOL_SIZE = 5;

interface PoolToken {
  headerName: 'authorization' | 'x-api-key';
  headerValue: string;
  label: string; // e.g. "oauth-1", "apikey-2" — used only in log messages
  envKey: string; // e.g. "CLAUDE_CODE_OAUTH_TOKEN_1" — used to remove from .env on 401
}

function loadPool(): PoolToken[] {
  const keys = [
    'CLAUDE_CODE_OAUTH_TOKEN',
    'ANTHROPIC_API_KEY',
    ...Array.from(
      { length: MAX_POOL_SIZE },
      (_, i) => `CLAUDE_CODE_OAUTH_TOKEN_${i + 1}`,
    ),
    ...Array.from(
      { length: MAX_POOL_SIZE },
      (_, i) => `ANTHROPIC_API_KEY_${i + 1}`,
    ),
  ];
  const env = readEnvFile(keys);

  // Numbered slots — pool mode
  const numbered: PoolToken[] = [];
  for (let i = 1; i <= MAX_POOL_SIZE; i++) {
    const oauthKey = `CLAUDE_CODE_OAUTH_TOKEN_${i}`;
    const oauth = env[oauthKey];
    if (oauth)
      numbered.push({
        headerName: 'authorization',
        headerValue: `Bearer ${oauth}`,
        label: `oauth-${i}`,
        envKey: oauthKey,
      });
    const apiKeyName = `ANTHROPIC_API_KEY_${i}`;
    const apiKey = env[apiKeyName];
    if (apiKey)
      numbered.push({
        headerName: 'x-api-key',
        headerValue: apiKey,
        label: `apikey-${i}`,
        envKey: apiKeyName,
      });
  }
  if (numbered.length > 0) return numbered;

  // Single-token fallback
  if (env.CLAUDE_CODE_OAUTH_TOKEN) {
    return [
      {
        headerName: 'authorization',
        headerValue: `Bearer ${env.CLAUDE_CODE_OAUTH_TOKEN}`,
        label: 'oauth',
        envKey: 'CLAUDE_CODE_OAUTH_TOKEN',
      },
    ];
  }
  if (env.ANTHROPIC_API_KEY) {
    return [
      {
        headerName: 'x-api-key',
        headerValue: env.ANTHROPIC_API_KEY,
        label: 'apikey',
        envKey: 'ANTHROPIC_API_KEY',
      },
    ];
  }
  return [];
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export class TokenProxy {
  private server: http.Server;
  private port: number;
  private currentIndex = 0;

  constructor(port: number) {
    this.port = port;
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((err) => {
        logger.error({ err }, 'Token proxy: unhandled request error');
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({ error: { message: 'Internal proxy error' } }),
          );
        }
      });
    });
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const pool = loadPool();

    if (pool.length === 0) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: { message: 'No API token configured on host' },
        }),
      );
      return;
    }

    // Clamp in case pool shrank since last request
    if (this.currentIndex >= pool.length) this.currentIndex = 0;

    // Buffer body so we can replay it if rotation is needed
    const body = await readBody(req);

    for (let attempt = 0; attempt < pool.length; attempt++) {
      const idx = (this.currentIndex + attempt) % pool.length;
      const token = pool[idx];

      const statusCode = await this.proxyRequest(req, res, body, token);

      if (statusCode !== 429 && statusCode !== 401) {
        if (attempt > 0) {
          logger.info(
            { slot: token.label, attempts: attempt + 1 },
            'Token proxy: rotated to working token',
          );
        }
        this.currentIndex = idx;
        return;
      }

      if (statusCode === 401) {
        logger.warn(
          { slot: token.label, envKey: token.envKey },
          'Token proxy: 401 from upstream, rotating (token NOT removed — may be transient)',
        );
      } else {
        const nextLabel = pool[(idx + 1) % pool.length].label;
        logger.warn(
          {
            slot: token.label,
            next: attempt + 1 < pool.length ? nextLabel : 'none',
          },
          'Token proxy: 429 rate-limited, rotating',
        );
      }
    }

    // All tokens exhausted
    logger.error(
      { poolSize: pool.length },
      'Token proxy: all tokens exhausted (rate-limited or invalid)',
    );
    if (!res.headersSent) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: { message: `All ${pool.length} token(s) exhausted` },
        }),
      );
    }
  }

  /**
   * Attempt to proxy a request with a specific token.
   * Returns the upstream HTTP status code.
   * On 429: drains the response without writing to res (caller rotates).
   * On any other status: writes response to res and resolves when done.
   */
  private proxyRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    body: Buffer,
    token: PoolToken,
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const outHeaders: Record<string, string | string[]> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        const lower = k.toLowerCase();
        // Strip hop-by-hop and auth headers; we'll set them explicitly
        if (
          [
            'host',
            'authorization',
            'x-api-key',
            'connection',
            'transfer-encoding',
          ].includes(lower)
        )
          continue;
        if (v !== undefined) outHeaders[lower] = v as string | string[];
      }
      outHeaders['host'] = ANTHROPIC_API_HOST;
      outHeaders[token.headerName] = token.headerValue;
      outHeaders['content-length'] = String(body.length);

      const options: https.RequestOptions = {
        hostname: ANTHROPIC_API_HOST,
        port: ANTHROPIC_API_PORT,
        path: req.url,
        method: req.method,
        headers: outHeaders,
      };

      const proxyReq = https.request(options, (proxyRes) => {
        if (proxyRes.statusCode === 429 || proxyRes.statusCode === 401) {
          proxyRes.resume(); // drain without forwarding — caller will retry with next token
          resolve(proxyRes.statusCode);
          return;
        }

        // Forward non-429 response to client
        res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
        proxyRes.on('end', () => resolve(proxyRes.statusCode ?? 200));
        proxyRes.on('error', (err) => {
          logger.error({ err }, 'Token proxy: upstream response stream error');
          resolve(proxyRes.statusCode ?? 500);
        });
      });

      proxyReq.on('error', (err) => {
        logger.error({ err }, 'Token proxy: upstream request failed');
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: { message: `Proxy upstream error: ${err.message}` },
            }),
          );
        }
        reject(err);
      });

      proxyReq.write(body);
      proxyReq.end();
    });
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, '0.0.0.0', () => {
        logger.info({ port: this.port }, 'Token proxy started');
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  getPort(): number {
    return this.port;
  }
}
