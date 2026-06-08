#!/usr/bin/env node
/**
 * add-refund-event.cjs — add `charge.refunded` to the two LIVE n8n Stripe
 * webhook endpoints, IN PLACE (no n8n re-registration, no URL change, no gap).
 *
 * Sends the FULL enabled_events list (Stripe replaces it), so the existing
 * payment events are preserved — dropping them would break payment capture.
 * Dry-run by default; --apply to write.
 */
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APPLY = process.argv.includes('--apply');

function envv(k) {
  for (const f of [path.join(os.homedir(), 'dev', '.env.shared'), path.join(process.cwd(), '.env')]) {
    try {
      for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
        const t = l.trim();
        if (t.startsWith(k + '=')) {
          let v = t.slice(k.length + 1).trim();
          if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
          return v;
        }
      }
    } catch {
      /* skip */
    }
  }
  return null;
}

// The two live n8n-managed endpoints (from stripe-hooks-diag.cjs).
const TARGETS = [
  {
    account: 'heartbeat (acct_1PakRk…)',
    keyName: 'STRIPE_RESTRICTED_KEY',
    endpoint: 'we_1Tb5YqRnZI4gH1uAD2weAX8K',
  },
  {
    account: 'tandem (acct_1G1wKz…)',
    keyName: 'STRIPE_SECRET_KEY_ALT',
    endpoint: 'we_1Tb5YpA7hTBWpVVqaJzLVdcw',
  },
];
const DESIRED = ['payment_intent.succeeded', 'checkout.session.completed', 'charge.refunded'];

function stripe(method, key, p, body) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${key}:`).toString('base64');
    const data = body || null;
    const req = https.request(
      {
        hostname: 'api.stripe.com',
        path: p,
        method,
        headers: {
          Authorization: `Basic ${auth}`,
          ...(data
            ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) }
            : {}),
        },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(d);
            if (j.error) reject(new Error(j.error.message));
            else resolve(j);
          } catch (e) {
            reject(new Error(d.slice(0, 200)));
          }
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  for (const t of TARGETS) {
    const key = envv(t.keyName);
    if (!key) {
      console.log(`[${t.account}] SKIP — ${t.keyName} not set`);
      continue;
    }
    let cur;
    try {
      cur = await stripe('GET', key, `/v1/webhook_endpoints/${t.endpoint}`);
    } catch (e) {
      console.log(`[${t.account}] READ FAILED: ${e.message}`);
      continue;
    }
    const have = cur.enabled_events || [];
    const hasRefund = have.includes('charge.refunded');
    // Preserve every existing event; just ensure charge.refunded is present.
    const next = Array.from(new Set([...have, ...DESIRED]));
    console.log(`[${t.account}] ${t.endpoint} status=${cur.status} hasRefund=${hasRefund}`);
    console.log(`   current: ${have.join(', ')}`);
    console.log(`   next   : ${next.join(', ')}`);
    if (hasRefund) {
      console.log('   → already has charge.refunded, no change');
      continue;
    }
    if (!APPLY) {
      console.log('   (dry-run) would update enabled_events');
      continue;
    }
    const body = next.map((e) => `enabled_events[]=${encodeURIComponent(e)}`).join('&');
    try {
      const upd = await stripe('POST', key, `/v1/webhook_endpoints/${t.endpoint}`, body);
      console.log(`   ✓ UPDATED — now: ${(upd.enabled_events || []).join(', ')}`);
    } catch (e) {
      console.log(`   ✗ UPDATE FAILED (likely no write perm): ${e.message}`);
    }
  }
})().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
