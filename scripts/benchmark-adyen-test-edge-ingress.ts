import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';

import { createAdyenTestEdgeIngress } from '../src/adyen-test-edge-ingress.js';
import { standardWebhookSigningPayload } from '../src/adyen-webhook.js';

const REQUESTS = 500;
const CONCURRENCY = 25;
const HMAC_KEY = '11'.repeat(32);
const merchant = 'fixture-merchant';
const store = 'fixture-store';

function notification(index: number) {
  const item = {
    pspReference: String(index).padStart(16, '0'),
    originalReference: '',
    merchantAccountCode: merchant,
    merchantReference: `foreign-${index}`,
    eventCode: 'AUTHORISATION',
    eventDate: '2026-09-10T00:00:00Z',
    success: 'true',
    amount: { value: 29900, currency: 'USD' },
    additionalData: { store },
  };
  const hmacSignature = createHmac('sha256', Buffer.from(HMAC_KEY, 'hex'))
    .update(standardWebhookSigningPayload(item as never))
    .digest('base64');
  return {
    NotificationRequestItem: {
      ...item,
      additionalData: { ...item.additionalData, hmacSignature },
    },
  };
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no address');
  return `http://127.0.0.1:${address.port}`;
}

let upstreamCalls = 0;
const upstream = createServer((_request, response) => {
  upstreamCalls++;
  response.writeHead(500).end('must-not-forward');
});
const upstreamUrl = `${await listen(upstream)}/owned`;
const edge = createAdyenTestEdgeIngress({
  route: '/hook/adyen-test-payments',
  upstreamUrl,
  allowedUpstreamUrls: [upstreamUrl],
  webhook: {
    hmacKeys: [HMAC_KEY],
    merchantAccount: merchant,
    storeReference: store,
    referencePrefix: 'tandem-poc-tsv1-',
    allowedEventCodes: ['AUTHORISATION'],
    discardVerifiedForeignReferences: true,
  },
  maxBodyBytes: 262144,
  maxHeaderBytes: 8192,
  readTimeoutMs: 1000,
  forwardTimeoutMs: 1000,
  maxActive: 64,
});
const server = createServer(edge.handle);
const base = await listen(server);
const rssBefore = process.memoryUsage().rss;
const latencies: number[] = [];
let next = 0;
const started = performance.now();
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (true) {
      const index = next++;
      if (index >= REQUESTS) return;
      const requestStarted = performance.now();
      const response = await fetch(`${base}/hook/adyen-test-payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          live: false,
          notificationItems: [notification(index)],
        }),
      });
      if (response.status !== 202 || (await response.text()) !== '[accepted]')
        throw new Error(`unexpected edge response ${response.status}`);
      latencies.push(performance.now() - requestStarted);
    }
  }),
);
const durationMs = performance.now() - started;
const rssAfter = process.memoryUsage().rss;
latencies.sort((a, b) => a - b);
const percentile = (fraction: number) =>
  latencies[
    Math.min(latencies.length - 1, Math.floor(latencies.length * fraction))
  ];
const counters = edge.counters();
if (
  counters.foreignOnly !== REQUESTS ||
  counters.ownedBatchesForwarded !== 0 ||
  counters.ownedEventsForwarded !== 0 ||
  counters.rejected !== 0 ||
  upstreamCalls !== 0
)
  throw new Error('foreign-only invariant failed');

process.stdout.write(
  `${JSON.stringify(
    {
      requests: REQUESTS,
      concurrency: CONCURRENCY,
      durationMs: Number(durationMs.toFixed(2)),
      throughputPerSecond: Number(((REQUESTS * 1000) / durationMs).toFixed(2)),
      p50Ms: Number(percentile(0.5).toFixed(2)),
      p95Ms: Number(percentile(0.95).toFixed(2)),
      rssBeforeBytes: rssBefore,
      rssAfterBytes: rssAfter,
      rssDeltaBytes: rssAfter - rssBefore,
      upstreamCalls,
      counters,
    },
    null,
    2,
  )}\n`,
);

await new Promise<void>((resolve) => server.close(() => resolve()));
await new Promise<void>((resolve) => upstream.close(() => resolve()));
