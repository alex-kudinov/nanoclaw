import { createServer, type Server } from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PaymentTestWebhookHttpAdapter } from './payment-test-webhook-http-adapter.js';

let server: Server | null = null;

afterEach(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server!.close((error) => (error ? reject(error) : resolve())),
    );
  server = null;
});

async function listen(adapter: PaymentTestWebhookHttpAdapter): Promise<string> {
  server = createServer(adapter.handle);
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no listener');
  return `http://127.0.0.1:${address.port}`;
}

describe('Adyen TEST webhook HTTP boundary', () => {
  it('fails closed before reading or recording when no real HMAC is configured', async () => {
    const record = vi.fn(async () => []);
    const base = await listen(
      new PaymentTestWebhookHttpAdapter(false, record, 100000, 1000),
    );
    const response = await fetch(`${base}/hook/adyen-test-payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'payment_webhook_unconfigured',
    });
    expect(record).not.toHaveBeenCalled();
  });

  it('returns the exact Adyen acknowledgement only after durable admission', async () => {
    const record = vi.fn(async () => [{ result: 'recorded' }]);
    const base = await listen(
      new PaymentTestWebhookHttpAdapter(true, record, 100000, 1000),
    );
    const payload = { live: false, notificationItems: [] };
    const response = await fetch(`${base}/hook/adyen-test-payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(response.status).toBe(202);
    expect(response.headers.get('content-type')).toBe(
      'text/plain; charset=utf-8',
    );
    expect(await response.text()).toBe('[accepted]');
    expect(record).toHaveBeenCalledWith(payload);
  });
});
