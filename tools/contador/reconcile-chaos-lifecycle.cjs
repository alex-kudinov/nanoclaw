#!/usr/bin/env node
/**
 * Aggregate-only 7/30/90 Stripe -> NanoClaw outbox -> Chaos reconciliation.
 * No customer objects, emails, names, or provider IDs are printed or stored.
 */

const https = require('https');
const { execFileSync } = require('child_process');

const WINDOWS = [7, 30, 90];
const ACCOUNTS = [
  { label: 'heartbeat', key: process.env.STRIPE_RESTRICTED_KEY },
  { label: 'tandem', key: process.env.STRIPE_SECRET_KEY_ALT },
].filter((account) => account.key);
const CHAOS_COHORT_URL = process.env.CHAOS_COHORT_URL;
const CHAOS_EXPORT_API_TOKEN = process.env.CHAOS_EXPORT_API_TOKEN;
const COVERAGE_START = process.env.CHAOS_LIFECYCLE_COVERAGE_START;

if (ACCOUNTS.length !== 2) {
  throw new Error('both Stripe account keys are required for reconciliation');
}
if (!CHAOS_COHORT_URL || !CHAOS_EXPORT_API_TOKEN) {
  throw new Error('CHAOS_COHORT_URL and CHAOS_EXPORT_API_TOKEN are required');
}
const coverageStartSeconds = Math.floor(new Date(COVERAGE_START || '').getTime() / 1000);
if (!Number.isFinite(coverageStartSeconds)) {
  throw new Error('CHAOS_LIFECYCLE_COVERAGE_START must be a valid timestamp');
}

function getJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers }, (response) => {
      let data = '';
      response.on('data', (chunk) => (data += chunk));
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('response was not valid JSON'));
        }
      });
    });
    request.setTimeout(20_000, () => request.destroy(new Error('request timed out')));
    request.on('error', reject);
  });
}

async function stripeListAll(key, resource, cutoff) {
  const items = [];
  let startingAfter = '';
  for (let page = 0; page < 100; page++) {
    const suffix = startingAfter ? `&starting_after=${encodeURIComponent(startingAfter)}` : '';
    const url =
      `https://api.stripe.com/v1/${resource}?limit=100&created[gte]=${cutoff}` + suffix;
    const auth = Buffer.from(`${key}:`).toString('base64');
    const response = await getJson(url, { Authorization: `Basic ${auth}` });
    const batch = Array.isArray(response.data) ? response.data : [];
    items.push(...batch);
    if (!response.has_more || batch.length === 0) break;
    startingAfter = batch[batch.length - 1].id;
  }
  return items;
}

function readOutbox(windowDays) {
  const sql = `
    SELECT source_system, event_name, status, count(*)::int
      FROM business_v2.chaos_lifecycle_outbox
     WHERE occurred_at >= now() - interval '${windowDays} days'
     GROUP BY source_system, event_name, status
     ORDER BY source_system, event_name, status`;
  const output = execFileSync('psql', ['-At', '-F', '|', '-c', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const rows = [];
  for (const line of output ? output.split('\n') : []) {
    const [source_system, event_name, status, count] = line.split('|');
    rows.push({ source_system, event_name, status, count: Number(count) });
  }
  return rows;
}

function chaosCount(cohort, source, eventName) {
  const row = (cohort.source_totals || []).find((item) => item.source_system === source);
  return Number((row && row.events && row.events[eventName]) || 0);
}

function outboxCount(rows, source, eventName, statuses = null) {
  return rows
    .filter(
      (row) =>
        row.source_system === source &&
        row.event_name === eventName &&
        (!statuses || statuses.includes(row.status)),
    )
    .reduce((sum, row) => sum + row.count, 0);
}

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const cutoff90 = Math.max(now - 90 * 86400, coverageStartSeconds);
  const provider = {};
  for (const account of ACCOUNTS) {
    const [payments, refunds] = await Promise.all([
      stripeListAll(account.key, 'payment_intents', cutoff90),
      stripeListAll(account.key, 'refunds', cutoff90),
    ]);
    provider[account.label] = {
      payments: payments.filter((payment) => payment.status === 'succeeded'),
      refunds: refunds.filter((refund) => refund.status === 'succeeded'),
    };
  }

  const windows = [];
  for (const days of WINDOWS) {
    const cutoff = Math.max(now - days * 86400, coverageStartSeconds);
    const [chaos, outbox] = await Promise.all([
      getJson(`${CHAOS_COHORT_URL}?days=${days}`, {
        'X-Chaos-Token': CHAOS_EXPORT_API_TOKEN,
      }),
      Promise.resolve(readOutbox(days)),
    ]);
    const accounts = [];
    for (const account of ACCOUNTS) {
      const source = `stripe-${account.label}`;
      const stripePurchases = provider[account.label].payments.filter(
        (payment) => payment.created >= cutoff,
      ).length;
      const stripeRefunds = provider[account.label].refunds.filter(
        (refund) => refund.created >= cutoff,
      ).length;
      const queuedPurchases = outboxCount(outbox, source, 'purchase_completed');
      const sentPurchases = outboxCount(outbox, source, 'purchase_completed', ['sent']);
      const chaosPurchases = chaosCount(chaos, source, 'purchase_completed');
      const queuedRefunds = outboxCount(outbox, source, 'purchase_refunded');
      const sentRefunds = outboxCount(outbox, source, 'purchase_refunded', ['sent']);
      const chaosRefunds = chaosCount(chaos, source, 'purchase_refunded');
      accounts.push({
        account: account.label,
        purchases: {
          stripe: stripePurchases,
          outbox: queuedPurchases,
          sent: sentPurchases,
          chaos: chaosPurchases,
          stripe_minus_chaos: stripePurchases - chaosPurchases,
        },
        refunds: {
          stripe: stripeRefunds,
          outbox: queuedRefunds,
          sent: sentRefunds,
          chaos: chaosRefunds,
          stripe_minus_chaos: stripeRefunds - chaosRefunds,
        },
      });
    }
    windows.push({
      requested_days: days,
      coverage_start: new Date(cutoff * 1000).toISOString(),
      accounts,
    });
  }

  console.log(
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        producer_coverage_start: new Date(coverageStartSeconds * 1000).toISOString(),
        privacy: 'aggregate_only_no_customer_or_provider_ids',
        windows,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(`RECONCILIATION ERROR: ${error.message}`);
  process.exit(1);
});
