import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  admitAdyenTestWebhook,
  AdyenWebhookAdmissionError,
  type AdyenTestWebhookConfig,
} from './adyen-webhook.js';

const ignoreRequestError = () => undefined;
class EdgeRequestError extends Error {
  constructor(readonly status: 400 | 408 | 413 | 415 | 429 | 503) {
    super(String(status));
  }
}

export interface AdyenTestEdgeConfig {
  route: '/hook/adyen-test-payments';
  upstreamUrl: string;
  allowedUpstreamUrls: readonly string[];
  webhook: AdyenTestWebhookConfig;
  maxBodyBytes: number;
  maxHeaderBytes: number;
  readTimeoutMs: number;
  forwardTimeoutMs: number;
  maxActive: number;
}

export interface AdyenTestEdgeCounters {
  requests: number;
  foreignOnly: number;
  ownedBatchesForwarded: number;
  ownedEventsForwarded: number;
  rejected: number;
  upstreamFailures: number;
  busy: number;
}

function withDeadline<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new EdgeRequestError(503));
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(new EdgeRequestError(503));
    };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    work.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function readBody(
  request: IncomingMessage,
  maxBytes: number,
  timeoutMs: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let done = false;
    const timer = setTimeout(
      () => finish(new EdgeRequestError(408)),
      timeoutMs,
    );
    timer.unref();
    const cleanup = () => {
      clearTimeout(timer);
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('aborted', onAbort);
      request.off('error', onError);
    };
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      cleanup();
      if (error) reject(error);
      else resolve(Buffer.concat(chunks, total));
    };
    const onData = (value: Buffer | string) => {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      total += chunk.length;
      if (total > maxBytes) finish(new EdgeRequestError(413));
      else chunks.push(chunk);
    };
    const onEnd = () => finish();
    const onAbort = () => finish(new EdgeRequestError(400));
    const onError = () => finish(new EdgeRequestError(400));
    request.on('data', onData);
    request.on('end', onEnd);
    request.on('aborted', onAbort);
    request.on('error', onError);
  });
}

function validatedUpstream(config: AdyenTestEdgeConfig): URL {
  let upstream: URL;
  try {
    upstream = new URL(config.upstreamUrl);
  } catch {
    throw new Error('invalid Adyen TEST edge configuration');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(
    upstream.hostname,
  );
  const privateHost =
    loopback ||
    upstream.hostname.endsWith('.local') ||
    upstream.hostname.endsWith('.internal') ||
    /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|100\.(?:6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.)/.test(
      upstream.hostname,
    );
  if (
    !config.allowedUpstreamUrls.includes(upstream.href) ||
    upstream.username ||
    upstream.password ||
    upstream.hash ||
    !privateHost ||
    !(
      upstream.protocol === 'https:' ||
      (upstream.protocol === 'http:' && loopback)
    )
  )
    throw new Error('invalid Adyen TEST edge configuration');
  return upstream;
}

function minimizedNativeEnvelope(payload: unknown, prefix: string) {
  const envelope = payload as {
    notificationItems: Array<{
      NotificationRequestItem: Record<string, unknown> & {
        additionalData: Record<string, unknown>;
      };
    }>;
  };
  return {
    live: false,
    notificationItems: envelope.notificationItems
      .filter(({ NotificationRequestItem: item }) =>
        String(item.merchantReference).startsWith(prefix),
      )
      .map(({ NotificationRequestItem: item }) => ({
        NotificationRequestItem: {
          pspReference: item.pspReference,
          originalReference: item.originalReference,
          merchantAccountCode: item.merchantAccountCode,
          merchantReference: item.merchantReference,
          eventCode: item.eventCode,
          eventDate: item.eventDate,
          success: item.success,
          amount: {
            value: (item.amount as Record<string, unknown>).value,
            currency: (item.amount as Record<string, unknown>).currency,
          },
          additionalData: {
            store: item.additionalData.store,
            hmacSignature: item.additionalData.hmacSignature,
          },
        },
      })),
  };
}

async function readExactAck(response: Response, signal: AbortSignal) {
  if (response.status !== 202 || !response.body)
    throw new EdgeRequestError(503);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await withDeadline(reader.read(), signal);
      if (done) break;
      total += value.length;
      if (total > 64) throw new EdgeRequestError(503);
      chunks.push(value);
    }
  } finally {
    await withDeadline(reader.cancel(), signal).catch(() => undefined);
  }
  if (Buffer.concat(chunks).toString('utf8') !== '[accepted]')
    throw new EdgeRequestError(503);
}

/** Factory only: no listener, environment, database, logger or default target. */
export function createAdyenTestEdgeIngress(
  config: AdyenTestEdgeConfig,
  transport: typeof fetch = fetch,
) {
  const upstream = validatedUpstream(config);
  if (
    config.route !== '/hook/adyen-test-payments' ||
    config.webhook.discardVerifiedForeignReferences !== true ||
    ![
      config.maxBodyBytes,
      config.maxHeaderBytes,
      config.readTimeoutMs,
      config.forwardTimeoutMs,
      config.maxActive,
    ].every((value) => Number.isSafeInteger(value) && value > 0) ||
    config.maxBodyBytes > 262144 ||
    config.maxHeaderBytes > 16384 ||
    config.readTimeoutMs > 60000 ||
    config.forwardTimeoutMs > 60000 ||
    config.maxActive > 100
  )
    throw new Error('invalid Adyen TEST edge configuration');
  const counters: AdyenTestEdgeCounters = {
    requests: 0,
    foreignOnly: 0,
    ownedBatchesForwarded: 0,
    ownedEventsForwarded: 0,
    rejected: 0,
    upstreamFailures: 0,
    busy: 0,
  };
  let active = 0;

  const respond = (
    response: ServerResponse,
    status: number,
    body: string,
    contentType = 'application/json; charset=utf-8',
  ) => {
    if (response.headersSent || response.writableEnded) return;
    const bytes = Buffer.from(body);
    response.writeHead(status, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
      'Content-Length': String(bytes.length),
    });
    response.end(bytes);
  };
  const closeRejected = (
    request: IncomingMessage,
    response: ServerResponse,
  ) => {
    response.shouldKeepAlive = false;
    request.pause();
    response.once('finish', () => {
      if (!request.destroyed) request.destroy();
    });
  };

  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    request.on('error', ignoreRequestError);
    if (request.url !== config.route) {
      closeRejected(request, response);
      respond(response, 404, '{"error":"not_found"}');
      return;
    }
    if (request.method !== 'POST') {
      closeRejected(request, response);
      respond(response, 405, '{"error":"method_not_allowed"}');
      return;
    }
    counters.requests++;
    if (active >= config.maxActive) {
      counters.busy++;
      closeRejected(request, response);
      respond(response, 503, '{"error":"edge_busy"}');
      return;
    }
    active++;
    try {
      const headerBytes = request.rawHeaders.reduce(
        (sum, value) => sum + Buffer.byteLength(value),
        0,
      );
      if (headerBytes > config.maxHeaderBytes) throw new EdgeRequestError(413);
      if (
        typeof request.headers['content-type'] !== 'string' ||
        !/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'])
      )
        throw new EdgeRequestError(415);
      const raw = await readBody(
        request,
        config.maxBodyBytes,
        config.readTimeoutMs,
      );
      let payload: unknown;
      try {
        payload = JSON.parse(raw.toString('utf8'));
      } catch {
        throw new EdgeRequestError(400);
      }
      const admitted = admitAdyenTestWebhook(payload, config.webhook);
      if (admitted.length === 0) {
        counters.foreignOnly++;
        respond(response, 202, '[accepted]', 'text/plain; charset=utf-8');
        return;
      }
      const body = JSON.stringify(
        minimizedNativeEnvelope(payload, config.webhook.referencePrefix),
      );
      const signal = AbortSignal.timeout(config.forwardTimeoutMs);
      const forwarded = await withDeadline(
        transport(upstream, {
          method: 'POST',
          redirect: 'error',
          signal,
          headers: { 'Content-Type': 'application/json' },
          body,
        }),
        signal,
      );
      await readExactAck(forwarded, signal);
      counters.ownedBatchesForwarded++;
      counters.ownedEventsForwarded += admitted.length;
      respond(response, 202, '[accepted]', 'text/plain; charset=utf-8');
    } catch (error) {
      counters.rejected++;
      const status =
        error instanceof AdyenWebhookAdmissionError
          ? error.status
          : error instanceof EdgeRequestError
            ? error.status
            : 503;
      if (status === 503) counters.upstreamFailures++;
      if (!request.complete) closeRejected(request, response);
      respond(response, status, '{"error":"edge_rejected"}');
    } finally {
      active--;
    }
  };

  return Object.freeze({
    handle,
    counters: (): Readonly<AdyenTestEdgeCounters> =>
      Object.freeze({ ...counters }),
  });
}
