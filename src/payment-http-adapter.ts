import type { IncomingMessage, ServerResponse } from 'node:http';

import type {
  PaymentApiController,
  PaymentApiResponse,
} from './payment-api-controller.js';
import { PaymentDomainError } from './payment-domain.js';

const CONTROLLER_MAX_BYTES = 100000;
const ignoreRequestError = () => undefined;

class PaymentHttpBodyError extends Error {
  constructor(readonly status: 400 | 408 | 413) {
    super(
      status === 413
        ? 'request_too_large'
        : status === 408
          ? 'request_timeout'
          : 'invalid_request',
    );
  }
}

function readBounded(
  request: IncomingMessage,
  maxBytes: number,
  timeoutMs: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('error', onError);
      request.off('aborted', onAborted);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(Buffer.concat(chunks, size));
    };
    const onData = (value: Buffer | string) => {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      size += chunk.length;
      if (size > maxBytes) {
        finish(new PaymentHttpBodyError(413));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => finish();
    const onError = () => finish(new PaymentHttpBodyError(400));
    const onAborted = () => finish(new PaymentHttpBodyError(400));
    request.on('data', onData);
    request.on('end', onEnd);
    request.on('error', onError);
    request.on('aborted', onAborted);
    timer = setTimeout(() => {
      finish(new PaymentHttpBodyError(408));
    }, timeoutMs);
    timer.unref();
  });
}

type Controller = Pick<PaymentApiController, 'handle'>;

/**
 * Injectable Node HTTP boundary only. It creates no listener, pool or provider
 * connection and must be mounted behind the private authenticated TEST route.
 */
export class PaymentHttpAdapter {
  constructor(
    private readonly controller: Controller,
    private readonly maxRequestBytes: number = CONTROLLER_MAX_BYTES,
    private readonly bodyReadTimeoutMs: number = 5000,
  ) {
    if (
      !Number.isSafeInteger(maxRequestBytes) ||
      maxRequestBytes < 1 ||
      maxRequestBytes > CONTROLLER_MAX_BYTES ||
      !Number.isSafeInteger(bodyReadTimeoutMs) ||
      bodyReadTimeoutMs < 1 ||
      bodyReadTimeoutMs > 60000
    )
      throw new PaymentDomainError('invalid_payment_http_configuration');
  }

  readonly handle = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    // One bounded guard remains with this request object for its lifetime. The
    // bounded reader adds/removes its own rejecting listener, but a client can
    // emit another error after abort/rejection cleanup has completed.
    request.on('error', ignoreRequestError);
    try {
      const method = request.method ?? '';
      const path = request.url ?? '';
      if (method !== 'POST') {
        this.closeRejectedRequest(request, response);
        this.write(response, {
          status: 405,
          headers: { 'Cache-Control': 'no-store', Connection: 'close' },
          body: { error: 'method_not_allowed' },
        });
        return;
      }
      let raw: Buffer = Buffer.alloc(0);
      const contentType = request.headers['content-type'];
      if (
        typeof contentType !== 'string' ||
        !/^application\/json(?:\s*;|$)/i.test(contentType)
      ) {
        this.closeRejectedRequest(request, response);
        this.write(response, {
          status: 415,
          headers: { 'Cache-Control': 'no-store', Connection: 'close' },
          body: { error: 'unsupported_media_type' },
        });
        return;
      }
      const declared = request.headers['content-length'];
      if (declared !== undefined) {
        if (!/^(?:0|[1-9][0-9]*)$/.test(declared))
          throw new PaymentHttpBodyError(400);
        if (Number(declared) > this.maxRequestBytes)
          throw new PaymentHttpBodyError(413);
      }
      raw = await readBounded(
        request,
        this.maxRequestBytes,
        this.bodyReadTimeoutMs,
      );
      this.write(response, await this.controller.handle(method, path, raw));
    } catch (error) {
      const status = error instanceof PaymentHttpBodyError ? error.status : 503;
      if (error instanceof PaymentHttpBodyError) {
        if (request.destroyed || response.destroyed) return;
        this.closeRejectedRequest(request, response);
      }
      this.write(response, {
        status,
        headers: {
          'Cache-Control': 'no-store',
          ...(error instanceof PaymentHttpBodyError
            ? { Connection: 'close' }
            : {}),
        },
        body: {
          error:
            status === 413
              ? 'request_too_large'
              : status === 408
                ? 'request_timeout'
                : status === 400
                  ? 'invalid_request'
                  : 'payment_service_unavailable',
        },
      });
    }
  };

  private closeRejectedRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): void {
    response.shouldKeepAlive = false;
    request.pause();
    response.once('finish', () => {
      if (!request.destroyed) request.destroy();
    });
  }

  private write(response: ServerResponse, result: PaymentApiResponse): void {
    if (response.headersSent || response.writableEnded) return;
    let body: Buffer;
    try {
      body = Buffer.from(JSON.stringify(result.body));
    } catch {
      body = Buffer.from(
        JSON.stringify({ error: 'payment_service_unavailable' }),
      );
      result = {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
        body: {},
      };
    }
    response.writeHead(result.status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
      ...result.headers,
      'Content-Length': String(body.length),
    });
    response.end(body);
  }
}
