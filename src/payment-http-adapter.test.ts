import { EventEmitter } from 'node:events';
import {
  createServer,
  request as createRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { PassThrough } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PaymentHttpAdapter } from './payment-http-adapter.js';

const servers: Server[] = [];

class ResponseDouble extends EventEmitter {
  headersSent = false;
  writableEnded = false;
  destroyed = false;
  shouldKeepAlive = true;
  status = 0;
  headers: Record<string, string> = {};
  body = '';
  writeHead(status: number, headers: Record<string, string>) {
    this.status = status;
    this.headers = headers;
    this.headersSent = true;
    return this;
  }
  end(body?: Buffer) {
    this.body = body?.toString() ?? '';
    this.writableEnded = true;
    this.emit('finish');
    return this;
  }
}

function requestDouble(
  method: string,
  headers: Record<string, string> = {},
): IncomingMessage {
  return Object.assign(new PassThrough(), {
    method,
    url: '/internal/payments/sessions',
    headers,
  }) as unknown as IncomingMessage;
}

async function start(adapter: PaymentHttpAdapter): Promise<string> {
  const server = createServer(adapter.handle);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no address');
  return `http://127.0.0.1:${address.port}`;
}

async function chunked(base: string, chunks: string[]) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = createRequest(
      `${base}/internal/payments/sessions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      (response) => {
        const output: Buffer[] = [];
        response.on('data', (value: Buffer) => output.push(value));
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(output).toString(),
          }),
        );
      },
    );
    request.on('error', reject);
    for (const chunk of chunks) request.write(chunk);
    request.end();
  });
}

async function stalled(base: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    let responseStarted = false;
    const request = createRequest(
      `${base}/internal/payments/sessions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      (response) => {
        responseStarted = true;
        const output: Buffer[] = [];
        response.on('data', (value: Buffer) => output.push(value));
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(output).toString(),
          }),
        );
      },
    );
    request.on('error', (error) => {
      // A server-enforced close after its response is expected.
      if (!responseStarted) reject(error);
    });
    request.write('{"partial":');
  });
}

async function abortRequest(base: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const request = createRequest(`${base}/internal/payments/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    request.on('error', () => resolve());
    request.write('{"partial":');
    request.destroy();
    setTimeout(resolve, 50).unref();
  });
}

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
});

describe('bounded injectable payment HTTP adapter', () => {
  it('passes exact method, URL and bytes to the controller over real HTTP', async () => {
    const controller = {
      handle: vi.fn(async (_method: string, _path: string, _raw: Buffer) => ({
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
        body: { state: 'checkout_ready' },
      })),
    };
    const base = await start(new PaymentHttpAdapter(controller));
    const body = '{"exact":"bytes"}';
    const response = await fetch(`${base}/internal/payments/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ state: 'checkout_ready' });
    expect(controller.handle).toHaveBeenCalledOnce();
    expect(controller.handle.mock.calls[0][0]).toBe('POST');
    expect(controller.handle.mock.calls[0][1]).toBe(
      '/internal/payments/sessions',
    );
    expect(controller.handle.mock.calls[0][2].toString()).toBe(body);
  });

  it('rejects declared and streamed excess before controller allocation', async () => {
    const controller = { handle: vi.fn() };
    const base = await start(new PaymentHttpAdapter(controller, 16));
    const response = await fetch(`${base}/internal/payments/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'x'.repeat(17),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'request_too_large' });
    const streamed = await chunked(base, ['x'.repeat(8), 'x'.repeat(9)]);
    expect(streamed.status).toBe(413);
    expect(JSON.parse(streamed.body)).toEqual({ error: 'request_too_large' });
    expect(controller.handle).not.toHaveBeenCalled();
  });

  it('requires JSON and sanitizes adapter/controller failures', async () => {
    const controller = {
      handle: vi.fn(async () => {
        throw new Error('private failure detail');
      }),
    };
    const base = await start(new PaymentHttpAdapter(controller));
    const unsupported = await fetch(`${base}/internal/payments/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}',
    });
    expect(unsupported.status).toBe(415);
    expect(controller.handle).not.toHaveBeenCalled();
    const failed = await fetch(`${base}/internal/payments/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: '{}',
    });
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({
      error: 'payment_service_unavailable',
    });
    expect(JSON.stringify(await failed.headers)).not.toContain(
      'private failure detail',
    );
  });

  it('bounds stalled and aborted body reads without dispatch or unhandled errors', async () => {
    const controller = { handle: vi.fn() };
    const base = await start(new PaymentHttpAdapter(controller, 100000, 20));
    const timedOut = await stalled(base);
    expect(timedOut.status).toBe(408);
    expect(JSON.parse(timedOut.body)).toEqual({ error: 'request_timeout' });
    await abortRequest(base);
    await delay(25);
    expect(controller.handle).not.toHaveBeenCalled();
  });

  it('closes every early rejection and retains one guard for late stream errors', async () => {
    const controller = { handle: vi.fn() };
    const adapter = new PaymentHttpAdapter(controller, 100, 20);
    const cases = [
      requestDouble('GET'),
      requestDouble('POST', { 'content-type': 'text/plain' }),
      requestDouble('POST', {
        'content-type': 'application/json',
        'content-length': '101',
      }),
      requestDouble('POST', {
        'content-type': 'application/json',
        'content-length': '01',
      }),
    ];
    for (const [index, request] of cases.entries()) {
      const response = new ResponseDouble();
      await adapter.handle(request, response as unknown as ServerResponse);
      expect(response.status).toBe([405, 415, 413, 400][index]);
      expect(response.headers.Connection).toBe('close');
      expect(response.shouldKeepAlive).toBe(false);
      expect(request.destroyed).toBe(true);
      expect(request.listenerCount('error')).toBe(1);
      expect(() => request.emit('error', new Error('late'))).not.toThrow();
    }

    const aborted = requestDouble('POST', {
      'content-type': 'application/json',
    });
    const response = new ResponseDouble();
    const handling = adapter.handle(
      aborted,
      response as unknown as ServerResponse,
    );
    aborted.emit('aborted');
    await handling;
    expect(aborted.listenerCount('error')).toBe(1);
    expect(() => aborted.emit('error', new Error('late-abort'))).not.toThrow();
    expect(controller.handle).not.toHaveBeenCalled();
  });
});
