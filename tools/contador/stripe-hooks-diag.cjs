#!/usr/bin/env node
/**
 * stripe-hooks-diag.cjs — read-only: list Stripe webhook endpoints for both
 * accounts (url, status, api_version, enabled_events). Diagnostic only.
 */
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');

function loadEnv(keys) {
  const wanted = new Set(keys);
  const out = {};
  for (const file of [
    path.join(os.homedir(), 'dev', '.env.shared'),
    path.join(process.cwd(), '.env'),
  ]) {
    let c;
    try {
      c = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    for (const line of c.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      if (!wanted.has(k)) continue;
      let v = t.slice(eq + 1).trim();
      if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
      if (v) out[k] = v;
    }
  }
  return out;
}

const ENV = loadEnv(['STRIPE_RESTRICTED_KEY', 'STRIPE_SECRET_KEY_ALT']);
const ACCTS = [
  { label: 'STRIPE_RESTRICTED_KEY', key: ENV.STRIPE_RESTRICTED_KEY },
  { label: 'STRIPE_SECRET_KEY_ALT', key: ENV.STRIPE_SECRET_KEY_ALT },
].filter((a) => a.key);

function get(key, p) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${key}:`).toString('base64');
    https
      .get({ hostname: 'api.stripe.com', path: p, headers: { Authorization: `Basic ${auth}` } }, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(new Error(d.slice(0, 200)));
          }
        });
      })
      .on('error', reject);
  });
}

(async () => {
  for (const a of ACCTS) {
    console.log(`\n===== ${a.label} =====`);
    let acct;
    try {
      acct = await get(a.key, '/v1/account');
      console.log(`account: ${acct.id} (${acct.settings?.dashboard?.display_name || acct.business_profile?.name || '?'})`);
    } catch (e) {
      console.log(`account: (no read perm) ${e.message}`);
    }
    let res;
    try {
      res = await get(a.key, '/v1/webhook_endpoints?limit=100');
    } catch (e) {
      console.log(`webhook_endpoints: ERROR ${e.message}`);
      continue;
    }
    if (res.error) {
      console.log(`webhook_endpoints: ERROR ${res.error.message}`);
      continue;
    }
    for (const w of res.data || []) {
      const refundEv =
        w.enabled_events.includes('charge.refunded') ||
        w.enabled_events.includes('*') ||
        w.enabled_events.some((e) => e.startsWith('refund.'));
      console.log(
        `  ${w.id} | ${w.status} | refund_evt=${refundEv}\n    url: ${w.url}\n    events: ${w.enabled_events.join(', ')}`,
      );
    }
    if ((res.data || []).length === 0) console.log('  (no webhook endpoints)');
  }
})().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
