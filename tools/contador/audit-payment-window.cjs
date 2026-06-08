#!/usr/bin/env node
/**
 * audit-payment-window.cjs — read-only fulfillment audit.
 *
 * Lists completed Stripe Checkout Sessions (+ succeeded PaymentIntents) on the
 * HEARTBEAT account (STRIPE_RESTRICTED_KEY) created within a date window and
 * flags which are MISSING from the Payment Log — i.e. whose webhook likely
 * never fired (provisioning gap during the May webhook outage).
 *
 * Usage: node tools/contador/audit-payment-window.cjs YYYY-MM-DD YYYY-MM-DD
 */
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const FROM = process.argv[2] || '2026-05-15';
const TO = process.argv[3] || '2026-05-28';
const gte = Math.floor(new Date(FROM + 'T00:00:00Z').getTime() / 1000);
const lt = Math.floor(new Date(TO + 'T23:59:59Z').getTime() / 1000);

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
const KEY = envv('STRIPE_RESTRICTED_KEY');
const SHEET = envv('SHEETS_PAYMENTS_ID');
const SA_PATH =
  envv('SHEETS_SA_JSON') || path.join(process.cwd(), 'data/service-accounts/sheets-service-account.json');

function sget(p) {
  return new Promise((resolve, reject) => {
    https
      .get({ hostname: 'api.stripe.com', path: p, headers: { Authorization: 'Basic ' + Buffer.from(KEY + ':').toString('base64') } }, (r) => {
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () => {
          try {
            const j = JSON.parse(d);
            j.error ? reject(new Error(j.error.message)) : resolve(j);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}
async function listAll(base) {
  const out = [];
  let after = null;
  for (let i = 0; i < 20; i++) {
    let p = `${base}&created[gte]=${gte}&created[lte]=${lt}&limit=100`;
    if (after) p += `&starting_after=${after}`;
    const r = await sget(p);
    out.push(...(r.data || []));
    if (!r.has_more || !r.data.length) break;
    after = r.data[r.data.length - 1].id;
  }
  return out;
}

async function sheetToken() {
  const sa = JSON.parse(fs.readFileSync(SA_PATH, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const h = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const c = Buffer.from(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now })).toString('base64url');
  const s = crypto.sign('RSA-SHA256', Buffer.from(`${h}.${c}`), sa.private_key).toString('base64url');
  const body = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${h}.${c}.${s}`;
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } }, (r) => {
      let d = '';
      r.on('data', (x) => (d += x));
      r.on('end', () => resolve(JSON.parse(d).access_token));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
async function sheetIds() {
  const tok = await sheetToken();
  return new Promise((resolve, reject) => {
    https
      .get({ hostname: 'sheets.googleapis.com', path: `/v4/spreadsheets/${SHEET}/values/${encodeURIComponent('Payment Log!J:J')}`, headers: { Authorization: 'Bearer ' + tok } }, (r) => {
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () => resolve(new Set((JSON.parse(d).values || []).flat().map((x) => (x || '').trim()))));
      })
      .on('error', reject);
  });
}

(async () => {
  const known = await sheetIds();
  const sessions = await listAll('/v1/checkout/sessions?status=complete&expand[]=data.line_items');
  console.log(`Heartbeat completed Checkout Sessions ${FROM}..${TO}: ${sessions.length}\n`);
  const missing = [];
  for (const s of sessions) {
    if (s.payment_status !== 'paid') continue;
    const inSheet = known.has(s.id) || (s.payment_intent && known.has(s.payment_intent));
    const prod = (s.line_items?.data || []).map((li) => li.description).join(' + ') || '?';
    const row = `${new Date(s.created * 1000).toISOString().slice(0, 10)} | ${s.customer_details?.email || '?'} | $${(s.amount_total / 100).toFixed(2)} | ${prod} | ${s.id}`;
    if (inSheet) console.log(`  [recorded]  ${row}`);
    else {
      console.log(`  [MISSING ]  ${row}`);
      missing.push(row);
    }
  }
  console.log(`\n${missing.length} session(s) MISSING from Payment Log.`);

  // PaymentIntent pass — many course buys are direct PIs, not Checkout Sessions.
  const pis = (await listAll('/v1/payment_intents?')).filter((p) => p.status === 'succeeded');
  console.log(`\nHeartbeat succeeded PaymentIntents ${FROM}..${TO}: ${pis.length}\n`);
  const piMissing = [];
  for (const p of pis) {
    const inSheet = known.has(p.id) || (p.invoice && known.has(p.invoice));
    const row = `${new Date(p.created * 1000).toISOString().slice(0, 10)} | ${p.receipt_email || '?'} | $${(p.amount / 100).toFixed(2)} | ${p.description || '?'} | ${p.id}`;
    if (inSheet) console.log(`  [recorded]  ${row}`);
    else {
      console.log(`  [MISSING ]  ${row}`);
      piMissing.push(row);
    }
  }
  console.log(`\n${piMissing.length} PaymentIntent(s) MISSING from Payment Log — audit for provisioning.`);
})().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
