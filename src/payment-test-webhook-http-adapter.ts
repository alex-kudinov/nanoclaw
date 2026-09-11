import type { IncomingMessage, ServerResponse } from 'node:http';

import { AdyenWebhookAdmissionError } from './adyen-webhook.js';

export const ADYEN_TEST_WEBHOOK_PATH = '/hook/adyen-test-payments';
export const ADYEN_LIVE_WEBHOOK_PATH = '/hook/adyen-live-payments';
const ignoreRequestError = () => undefined;

class WebhookHttpError extends Error {
  constructor(readonly status: 400 | 408 | 413 | 415) {
    super(String(status));
  }
}

function readBody(
  request: IncomingMessage,
  maxBytes: number,
  timeoutMs: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    const timer = setTimeout(
      () => finish(new WebhookHttpError(408)),
      timeoutMs,
    );
    timer.unref();
    const cleanup = () => {
      clearTimeout(timer);
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('aborted', onAborted);
      request.off('error', onError);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(Buffer.concat(chunks, total));
    };
    const onData = (value: Buffer | string) => {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      total += chunk.length;
      if (total > maxBytes) finish(new WebhookHttpError(413));
      else chunks.push(chunk);
    };
    const onEnd = () => finish();
    const onAborted = () => finish(new WebhookHttpError(400));
    const onError = () => finish(new WebhookHttpError(400));
    request.on('data', onData);
    request.on('end', onEnd);
    request.on('aborted', onAborted);
    request.on('error', onError);
  });
}

/** Environment-routed native Adyen webhook boundary. */
export class PaymentWebhookHttpAdapter {
  constructor(
    private readonly route:
      | typeof ADYEN_TEST_WEBHOOK_PATH
      | typeof ADYEN_LIVE_WEBHOOK_PATH,
    private readonly configured: boolean,
    private readonly recordWebhook: (payload: unknown) => Promise<unknown>,
    private readonly maxBodyBytes: number,
    private readonly bodyReadTimeoutMs: number,
  ) {}

  readonly handle = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    request.on('error', ignoreRequestError);
    if (request.url !== this.route)
      return this.write(response, 404, 'not_found');
    if (request.method !== 'POST') {
      this.close(request, response);
      return this.write(response, 405, 'method_not_allowed');
    }
    if (!this.configured) {
      this.close(request, response);
      return this.write(response, 503, 'payment_webhook_unconfigured');
    }
    try {
      const contentType = request.headers['content-type'];
      if (
        typeof contentType !== 'string' ||
        !/^application\/json(?:\s*;|$)/i.test(contentType)
      )
        throw new WebhookHttpError(415);
      const declared = request.headers['content-length'];
      if (declared !== undefined) {
        if (!/^(?:0|[1-9][0-9]*)$/.test(declared))
          throw new WebhookHttpError(400);
        if (Number(declared) > this.maxBodyBytes)
          throw new WebhookHttpError(413);
      }
      const raw = await readBody(
        request,
        this.maxBodyBytes,
        this.bodyReadTimeoutMs,
      );
      let payload: unknown;
      try {
        payload = JSON.parse(raw.toString('utf8'));
      } catch {
        throw new WebhookHttpError(400);
      }
      await this.recordWebhook(payload);
      this.write(response, 202, '[accepted]', true);
    } catch (error) {
      const status =
        error instanceof WebhookHttpError
          ? error.status
          : error instanceof AdyenWebhookAdmissionError
            ? error.status
            : 503;
      if (!request.complete) this.close(request, response);
      this.write(response, status, 'webhook_rejected');
    }
  };

  private close(request: IncomingMessage, response: ServerResponse): void {
    response.shouldKeepAlive = false;
    request.pause();
    response.once('finish', () => {
      if (!request.destroyed) request.destroy();
    });
  }

  private write(
    response: ServerResponse,
    status: number,
    body: string,
    ack = false,
  ): void {
    if (response.headersSent || response.writableEnded) return;
    const bytes = Buffer.from(ack ? body : JSON.stringify({ error: body }));
    response.writeHead(status, {
      'Content-Type': ack
        ? 'text/plain; charset=utf-8'
        : 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
      'Content-Length': String(bytes.length),
    });
    response.end(bytes);
  }
}

/** Compatibility wrapper preserving the established TEST route and API. */
export class PaymentTestWebhookHttpAdapter extends PaymentWebhookHttpAdapter {
  constructor(
    configured: boolean,
    recordWebhook: (payload: unknown) => Promise<unknown>,
    maxBodyBytes: number,
    bodyReadTimeoutMs: number,
  ) {
    super(
      ADYEN_TEST_WEBHOOK_PATH,
      configured,
      recordWebhook,
      maxBodyBytes,
      bodyReadTimeoutMs,
    );
  }
}
