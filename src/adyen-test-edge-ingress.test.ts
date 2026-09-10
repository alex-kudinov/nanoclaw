import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createServer, request as httpRequest, type Server } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { ADYEN_TEST_REFERENCE_PREFIX } from './adyen-payment-identifiers.js';
import { createAdyenTestEdgeIngress } from './adyen-test-edge-ingress.js';
import {
  admitAdyenTestWebhook,
  standardWebhookSigningPayload,
} from './adyen-webhook.js';

const servers: Server[] = [];
const key = randomBytes(32).toString('hex');
const merchant = 'fixture-merchant';
const store = 'fixture-store';

function item(reference: string, validKey = key) {
  const notification = {
    pspReference: randomUUID().replaceAll('-', '').slice(0, 16),
    originalReference: '',
    merchantAccountCode: merchant,
    merchantReference: reference,
    eventCode: 'AUTHORISATION',
    eventDate: new Date().toISOString(),
    success: 'true',
    amount: { value: 29900, currency: 'USD' },
    paymentMethod: 'must-not-forward',
    reason: 'must-not-forward',
    additionalData: {
      store,
      shopperEmail: 'must-not-forward@example.test',
    },
  };
  const signature = createHmac('sha256', Buffer.from(validKey, 'hex'))
    .update(standardWebhookSigningPayload(notification as never))
    .digest('base64');
  return {
    NotificationRequestItem: {
      ...notification,
      additionalData: {
        ...notification.additionalData,
        hmacSignature: signature,
      },
    },
  };
}

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no address');
  return `http://127.0.0.1:${address.port}`;
}

function config(upstreamUrl: string, changes: Record<string, unknown> = {}) {
  return {
    route: '/hook/adyen-test-payments' as const,
    upstreamUrl,
    allowedUpstreamUrls: [upstreamUrl],
    webhook: {
      hmacKeys: [key],
      merchantAccount: merchant,
      storeReference: store,
      referencePrefix: ADYEN_TEST_REFERENCE_PREFIX,
      allowedEventCodes: ['AUTHORISATION'],
      discardVerifiedForeignReferences: true,
    },
    maxBodyBytes: 262144,
    maxHeaderBytes: 8192,
    readTimeoutMs: 1000,
    forwardTimeoutMs: 1000,
    maxActive: 4,
    ...changes,
  };
}

async function post(base: string, notificationItems: unknown[]) {
  return fetch(`${base}/hook/adyen-test-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ live: false, notificationItems }),
  });
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => {
      server.closeAllConnections();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    }),
  );
});

describe('bounded Adyen TEST pre-workflow edge ingress', () => {
  it('accepts foreign-only batches with zero forward and identifier-free counters', async () => {
    let forwards = 0;
    const upstream = await listen(
      createServer((_request, response) => {
        forwards++;
        response.writeHead(202).end('[accepted]');
      }),
    );
    const edge = createAdyenTestEdgeIngress(config(`${upstream}/owned`));
    const base = await listen(createServer(edge.handle));
    const response = await post(base, [item('foreign-reference')]);
    expect(response.status).toBe(202);
    expect(await response.text()).toBe('[accepted]');
    expect(forwards).toBe(0);
    expect(edge.counters()).toEqual({
      requests: 1,
      foreignOnly: 1,
      ownedBatchesForwarded: 0,
      ownedEventsForwarded: 0,
      rejected: 0,
      upstreamFailures: 0,
      busy: 0,
    });
    expect(JSON.stringify(edge.counters())).not.toContain('foreign-reference');
  });

  it('forwards only owned minimized events from a mixed verified batch', async () => {
    const bodies: string[] = [];
    const upstream = await listen(
      createServer((request, response) => {
        request.on('data', (chunk) => bodies.push(chunk.toString()));
        request.on('end', () => response.writeHead(202).end('[accepted]'));
      }),
    );
    const edge = createAdyenTestEdgeIngress(config(`${upstream}/owned`));
    const base = await listen(createServer(edge.handle));
    const owned = `${ADYEN_TEST_REFERENCE_PREFIX}${randomUUID()}`;
    expect((await post(base, [item('foreign'), item(owned)])).status).toBe(202);
    expect(bodies).toHaveLength(1);
    const forwarded = JSON.parse(bodies[0]);
    expect(forwarded.notificationItems).toHaveLength(1);
    expect(
      forwarded.notificationItems[0].NotificationRequestItem.merchantReference,
    ).toBe(owned);
    expect(bodies[0]).not.toContain('must-not-forward');
    const hostConfig = {
      ...config(`${upstream}/owned`).webhook,
      discardVerifiedForeignReferences: false,
    };
    expect(admitAdyenTestWebhook(forwarded, hostConfig)).toHaveLength(1);
    const tampered = JSON.parse(bodies[0]);
    tampered.notificationItems[0].NotificationRequestItem.amount.value = 1;
    expect(() => admitAdyenTestWebhook(tampered, hostConfig)).toThrow(
      'Invalid HMAC signature',
    );
    expect(edge.counters().ownedEventsForwarded).toBe(1);
  });

  it('rejects an invalid item in a mixed batch before any downstream effect', async () => {
    let forwards = 0;
    const upstream = await listen(
      createServer((_request, response) => {
        forwards++;
        response.writeHead(202).end('[accepted]');
      }),
    );
    const edge = createAdyenTestEdgeIngress(config(`${upstream}/owned`));
    const base = await listen(createServer(edge.handle));
    const owned = `${ADYEN_TEST_REFERENCE_PREFIX}${randomUUID()}`;
    const response = await post(base, [
      item(owned),
      item('foreign', randomBytes(32).toString('hex')),
    ]);
    expect(response.status).toBe(401);
    expect(forwards).toBe(0);
    expect(edge.counters().rejected).toBe(1);
  });

  it('withholds provider acknowledgement when the fixed upstream fails or times out', async () => {
    const upstream = await listen(
      createServer((_request, response) => {
        setTimeout(() => response.writeHead(503).end(), 100).unref();
      }),
    );
    const edge = createAdyenTestEdgeIngress(
      config(`${upstream}/owned`, { forwardTimeoutMs: 20 }),
    );
    const base = await listen(createServer(edge.handle));
    const response = await post(base, [
      item(`${ADYEN_TEST_REFERENCE_PREFIX}${randomUUID()}`),
    ]);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'edge_rejected' });
    expect(edge.counters().upstreamFailures).toBe(1);

    const wrongAckUpstream = await listen(
      createServer((_request, response) =>
        response.writeHead(200).end('[accepted]'),
      ),
    );
    const exactAckEdge = createAdyenTestEdgeIngress(
      config(`${wrongAckUpstream}/owned`),
    );
    const exactAckBase = await listen(createServer(exactAckEdge.handle));
    expect(
      (
        await post(exactAckBase, [
          item(`${ADYEN_TEST_REFERENCE_PREFIX}${randomUUID()}`),
        ])
      ).status,
    ).toBe(503);
  });

  it('bounds headers, bytes, stalled reads and aborted clients without forwarding', async () => {
    let forwards = 0;
    const upstream = await listen(
      createServer((_request, response) => {
        forwards++;
        response.writeHead(202).end('[accepted]');
      }),
    );
    const edge = createAdyenTestEdgeIngress(
      config(`${upstream}/owned`, {
        maxBodyBytes: 64,
        maxHeaderBytes: 128,
        readTimeoutMs: 20,
      }),
    );
    const base = await listen(createServer(edge.handle));
    expect(
      (
        await fetch(`${base}/hook/adyen-test-payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'x'.repeat(65),
        })
      ).status,
    ).toBe(413);
    expect(
      (
        await fetch(`${base}/hook/adyen-test-payments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Fill': 'x'.repeat(200),
          },
          body: '{}',
        })
      ).status,
    ).toBe(413);
    await new Promise<void>((resolve, reject) => {
      const request = httpRequest(
        `${base}/hook/adyen-test-payments`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
        (response) => {
          expect(response.statusCode).toBe(408);
          response.resume();
          response.on('end', resolve);
        },
      );
      request.on('error', reject);
      request.write('{');
    });
    await new Promise<void>((resolve) => {
      const request = httpRequest(`${base}/hook/adyen-test-payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      request.on('error', () => resolve());
      request.write('{');
      request.destroy();
      setTimeout(resolve, 50).unref();
    });
    expect(forwards).toBe(0);
  });

  it('applies bounded no-queue backpressure and rejects unsafe upstream targets', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const upstream = await listen(
      createServer(async (_request, response) => {
        await gate;
        response.writeHead(202).end('[accepted]');
      }),
    );
    const edge = createAdyenTestEdgeIngress(
      config(`${upstream}/owned`, { maxActive: 1 }),
    );
    const base = await listen(createServer(edge.handle));
    const first = post(base, [
      item(`${ADYEN_TEST_REFERENCE_PREFIX}${randomUUID()}`),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(
      (
        await post(base, [
          item(`${ADYEN_TEST_REFERENCE_PREFIX}${randomUUID()}`),
        ])
      ).status,
    ).toBe(503);
    release();
    expect((await first).status).toBe(202);
    expect(edge.counters().busy).toBe(1);
    expect(() =>
      createAdyenTestEdgeIngress({
        ...config('http://169.254.169.254/private'),
        upstreamUrl: 'http://169.254.169.254/private',
      }),
    ).toThrow('invalid Adyen TEST edge configuration');
    expect(() =>
      createAdyenTestEdgeIngress(config('https://public.example.test/owned')),
    ).toThrow('invalid Adyen TEST edge configuration');
  });
});
