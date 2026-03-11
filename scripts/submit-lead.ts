#!/usr/bin/env tsx
/**
 * Submit a lead from data/contact-us-form-data.csv to the contact-form webhook.
 *
 * Usage:
 *   npx tsx scripts/submit-lead.ts           # random row
 *   npx tsx scripts/submit-lead.ts 3         # row index (1-based, skipping header)
 *   npx tsx scripts/submit-lead.ts latest    # most recent entry (first data row)
 */

import fs from 'fs';
import http from 'http';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');

// ---------------------------------------------------------------------------
// Config — loaded from data/webhooks.json, no hardcoding
// ---------------------------------------------------------------------------

interface WebhookDef {
  id: string;
  secret?: string;
  [k: string]: unknown;
}

function loadWebhook(id: string): WebhookDef {
  const file = path.join(ROOT, 'data', 'webhooks.json');
  const defs: WebhookDef[] = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const def = defs.find((d) => d.id === id);
  if (!def) throw new Error(`Webhook '${id}' not found in data/webhooks.json`);
  return def;
}

// ---------------------------------------------------------------------------
// CSV parsing — no deps
// ---------------------------------------------------------------------------

interface Lead {
  firstName: string;
  lastName: string;
  email: string;
  submittedAt: string;
  message: string;
}

function parseCSV(raw: string): Lead[] {
  const lines = raw.trim().split('\n');
  // header: "Name (First Name)","Name (Last Name)",Email,"Entry Date","What Would You Like Help With?"
  return lines.slice(1).map((line) => {
    // Simple quoted-CSV parser — handles double-quoted fields with embedded commas/quotes
    const fields: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; } // escaped quote
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        fields.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    fields.push(cur);
    return {
      firstName:   fields[0] ?? '',
      lastName:    fields[1] ?? '',
      email:       fields[2] ?? '',
      submittedAt: fields[3] ?? '',
      message:     fields[4] ?? '',
    };
  });
}

// ---------------------------------------------------------------------------
// HTTP POST
// ---------------------------------------------------------------------------

function post(url: string, secret: string, body: object): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body));
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: Number(u.port) || 80,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length,
          'X-Webhook-Secret': secret,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString()}`));
          } else {
            resolve(Buffer.concat(chunks).toString());
          }
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const WEBHOOK_URL = 'http://192.168.1.50:8088/hook/contact-form';
const CSV_FILE = path.join(ROOT, 'data', 'contact-us-form-data.csv');

const arg = process.argv[2];
const webhook = loadWebhook('contact-form');
const secret = webhook.secret ?? '';

const leads = parseCSV(fs.readFileSync(CSV_FILE, 'utf-8'));
if (!leads.length) throw new Error('No leads found in CSV');

let lead: Lead;
if (!arg || arg === 'random') {
  lead = leads[Math.floor(Math.random() * leads.length)];
} else if (arg === 'latest') {
  lead = leads[0]; // CSV is newest-first
} else {
  const idx = parseInt(arg, 10);
  if (isNaN(idx) || idx < 1 || idx > leads.length) {
    throw new Error(`Row index must be 1–${leads.length}`);
  }
  lead = leads[idx - 1];
}

const payload = {
  name: `${lead.firstName} ${lead.lastName}`.trim(),
  email: lead.email,
  message: lead.message,
  submitted_at: lead.submittedAt,
};

console.log(`Submitting lead: ${payload.name} <${payload.email}>`);
console.log(`Message: ${payload.message.slice(0, 80)}${payload.message.length > 80 ? '…' : ''}`);

const response = await post(WEBHOOK_URL, secret, payload);
const { request_id } = JSON.parse(response) as { request_id: string };
console.log(`\n✓ Accepted — request_id: ${request_id}`);
console.log('Watch #gru-inbox in Slack for intake receipt + qualification.');
