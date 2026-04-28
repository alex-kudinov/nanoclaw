#!/usr/bin/env npx tsx
/**
 * Phase 0 — Webhook reconciliation forensics report.
 *
 * Read-only. No DB writes. No agent dispatch. No external mutations.
 *
 * Compares external source-of-truth APIs against business_v2.interactions
 * to surface webhook events that never reached NanoClaw.
 *
 * Sources surveyed:
 *   - Trafft (appointments + customers via toolbox)
 *   - Stripe (survey-only — no toolbox tool yet; reconciliation deferred)
 *   - Plutio link gaps (parties without plutio_refs)
 *
 * Output: markdown report to stdout.
 * Run:   npx tsx scripts/webhook-reconciliation-report.ts > /tmp/recon.md
 */

import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';

import { query } from '../src/business-db.js';

const execFileAsync = promisify(execFile);

const LOOKBACK_DAYS = 30;
const TOOLBOX_DIR =
  process.env.TOOLBOX_DIR || path.join(process.env.HOME || '', 'dev/toolbox');
const TRAFFT_TOOL_DIR = path.join(TOOLBOX_DIR, 'shared/trafft/tools/trafft');

interface TrafftCustomer {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
}

interface TrafftAppt {
  id: number;
  status: string;
  start_date_time: string;
  created_at: string;
  service: { name: string };
  employees: Array<{ first_name: string; last_name: string }>;
  bookings: Array<{ customer: TrafftCustomer }>;
}

async function callTrafft(script: string, args: string[]): Promise<unknown> {
  const env = { ...process.env, TOOLBOX_LIB: path.join(TOOLBOX_DIR, 'lib') };
  const { stdout } = await execFileAsync(
    path.join(TRAFFT_TOOL_DIR, script),
    args,
    { env, timeout: 60_000, maxBuffer: 10 * 1024 * 1024 },
  );
  // Toolbox response format: "OK <json>" on success, "ERR <code>: <msg>" on failure.
  const trimmed = stdout.trim();
  if (trimmed.startsWith('ERR ')) {
    throw new Error(`trafft ${script} failed: ${trimmed}`);
  }
  const jsonStart = trimmed.indexOf('{');
  if (jsonStart < 0) throw new Error(`trafft ${script}: no JSON in response`);
  return JSON.parse(trimmed.slice(jsonStart));
}

interface PagedResp<T> {
  data: T[];
  pagination: { pages: number };
}

async function paginate<T>(script: string, limit: number): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= 50; page++) {
    const data = (await callTrafft(script, [
      '--page',
      String(page),
      '--limit',
      String(limit),
    ])) as PagedResp<T>;
    all.push(...data.data);
    if (page >= data.pagination.pages) break;
  }
  return all;
}

interface BookingInteraction {
  appt_id: string | null;
  cust_email: string | null;
  event_type: string | null;
  occurred_at: string;
}

async function fetchBookingInteractions(): Promise<BookingInteraction[]> {
  const r = await query<BookingInteraction>(
    `SELECT
       metadata->'raw_payload'->>'appointmentId' AS appt_id,
       metadata->'raw_payload'->>'customerEmail' AS cust_email,
       metadata->>'event_type' AS event_type,
       occurred_at::text AS occurred_at
     FROM business_v2.interactions
     WHERE channel='booking'
       AND occurred_at > now() - ($1 || ' days')::interval`,
    [String(LOOKBACK_DAYS)],
  );
  return r.rows;
}

async function lookupPartyByEmail(
  email: string,
): Promise<{ id: string; display_name: string } | null> {
  const r = await query<{ id: string; display_name: string }>(
    `SELECT id::text, display_name
       FROM business_v2.parties
      WHERE lower(primary_email) = lower($1) AND merged_into IS NULL
      LIMIT 1`,
    [email],
  );
  return r.rows[0] || null;
}

async function partyHasPlutioRef(partyId: string): Promise<boolean> {
  const r = await query(
    `SELECT 1 FROM business_v2.plutio_refs
      WHERE entity_type='party' AND entity_id=$1::bigint LIMIT 1`,
    [partyId],
  );
  return r.rows.length > 0;
}

interface ApptGap {
  appt_id: number;
  status: string;
  created_at: string;
  start: string;
  service: string;
  employee: string;
  cust_email: string;
  cust_name: string;
  party: { id: string; display_name: string; has_plutio_ref: boolean } | null;
}

function inWindow(iso: string): boolean {
  return new Date(iso).getTime() > Date.now() - LOOKBACK_DAYS * 86_400_000;
}

function fmt16(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}

async function buildTrafftSection(
  lines: string[],
): Promise<{ apptGaps: ApptGap[]; custGapCount: number }> {
  const [allAppts, allCustomers, interactions] = await Promise.all([
    paginate<TrafftAppt>('list-appointments.sh', 50),
    paginate<TrafftCustomer>('list-customers.sh', 100),
    fetchBookingInteractions(),
  ]);
  const recentAppts = allAppts.filter((a) => inWindow(a.created_at));
  const handled = new Set(
    interactions
      .filter((i) => i.event_type === 'booked' || i.event_type === 'rescheduled')
      .map((i) => i.appt_id)
      .filter((x): x is string => Boolean(x)),
  );
  const apptGaps: ApptGap[] = [];
  for (const a of recentAppts) {
    if (handled.has(String(a.id))) continue;
    const cust = a.bookings[0]?.customer;
    if (!cust) continue;
    const party = await lookupPartyByEmail(cust.email);
    const has_plutio_ref = party ? await partyHasPlutioRef(party.id) : false;
    apptGaps.push({
      appt_id: a.id,
      status: a.status,
      created_at: a.created_at,
      start: a.start_date_time,
      service: a.service.name,
      employee: a.employees
        .map((e) => `${e.first_name} ${e.last_name}`)
        .join(', '),
      cust_email: cust.email,
      cust_name: `${cust.first_name} ${cust.last_name}`,
      party: party ? { ...party, has_plutio_ref } : null,
    });
  }

  lines.push('## Trafft');
  lines.push(`- Appointments created in window: **${recentAppts.length}**`);
  lines.push(
    `- Booking interactions (booked + rescheduled) in window: **${handled.size}**`,
  );
  const ccCount = interactions.filter((i) => i.event_type === 'customer_created')
    .length;
  lines.push(`- customer_created interactions in window: **${ccCount}**`);
  lines.push(`- **Missing booked events: ${apptGaps.length}**\n`);

  if (apptGaps.length > 0) {
    lines.push(
      '| Appt | Status | Created (UTC) | Start | Service / Employee | Customer | Party | Plutio link |',
    );
    lines.push(
      '|------|--------|---------------|-------|--------------------|----------|-------|-------------|',
    );
    for (const g of apptGaps) {
      const partyCell = g.party
        ? `${g.party.id} (${g.party.display_name})`
        : '—';
      const plutioCell = g.party ? (g.party.has_plutio_ref ? 'yes' : 'no') : '—';
      lines.push(
        `| ${g.appt_id} | ${g.status} | ${fmt16(g.created_at)} | ${fmt16(g.start)} | ${g.service} / ${g.employee} | ${g.cust_email} | ${partyCell} | ${plutioCell} |`,
      );
    }
    lines.push('');
  }

  // Trafft customers without a customer_created interaction (Trafft API doesn't
  // expose customer created_at, so this surveys the full active customer list).
  const custEmailsHandled = new Set(
    interactions
      .filter((i) => i.event_type === 'customer_created')
      .map((i) => (i.cust_email || '').toLowerCase())
      .filter(Boolean),
  );
  const custGaps = allCustomers.filter(
    (c) => !custEmailsHandled.has(c.email.toLowerCase()),
  );
  lines.push(
    `### Trafft customers with no customer_created interaction: ${custGaps.length} of ${allCustomers.length}\n`,
  );
  if (custGaps.length > 0 && custGaps.length <= 30) {
    lines.push('| Trafft id | Email | Name | NC party? |');
    lines.push('|-----------|-------|------|-----------|');
    for (const c of custGaps) {
      const party = await lookupPartyByEmail(c.email);
      lines.push(
        `| ${c.id} | ${c.email} | ${c.first_name} ${c.last_name} | ${party ? party.id : '—'} |`,
      );
    }
    lines.push('');
  }

  return { apptGaps, custGapCount: custGaps.length };
}

async function buildPlutioSection(lines: string[]): Promise<number> {
  lines.push('## Plutio link survey');
  const r = await query<{
    id: string;
    display_name: string;
    primary_email: string;
    source_provider: string;
    created_at: string;
  }>(
    `SELECT p.id::text, p.display_name, p.primary_email, p.source_provider,
            p.created_at::text
       FROM business_v2.parties p
       LEFT JOIN business_v2.plutio_refs r
              ON r.entity_type='party' AND r.entity_id = p.id
      WHERE r.entity_id IS NULL
        AND p.created_at > now() - ($1 || ' days')::interval
        AND p.merged_into IS NULL
      ORDER BY p.created_at DESC`,
    [String(LOOKBACK_DAYS)],
  );
  lines.push(
    `- Parties created in window without a plutio_refs entry: **${r.rows.length}**\n`,
  );
  if (r.rows.length > 0 && r.rows.length <= 50) {
    lines.push('| Party | Email | Source | Created (UTC) |');
    lines.push('|-------|-------|--------|---------------|');
    for (const p of r.rows) {
      lines.push(
        `| ${p.id} | ${p.primary_email} | ${p.source_provider} | ${fmt16(p.created_at)} |`,
      );
    }
    lines.push('');
  }
  return r.rows.length;
}

async function buildStripeSection(lines: string[]): Promise<void> {
  lines.push('## Stripe');
  lines.push(
    'No Stripe toolbox tool exists yet — full reconciliation deferred to a Phase-5 prerequisite (`stripe/list-events`).',
  );
  const p = await query<{ count: string; min_at: string; max_at: string }>(
    `SELECT count(*)::text AS count,
            min(created_at)::text AS min_at,
            max(created_at)::text AS max_at
       FROM payments
      WHERE created_at > now() - ($1 || ' days')::interval`,
    [String(LOOKBACK_DAYS)],
  );
  const row = p.rows[0];
  lines.push(
    `- payments table rows in window: **${row.count}** (${row.min_at ? fmt16(row.min_at) : 'n/a'} → ${row.max_at ? fmt16(row.max_at) : 'n/a'})`,
  );
  lines.push(
    '- Action: scaffold `stripe/list-events` toolbox tool before Phase 5 sweeper for Stripe.\n',
  );
}

function buildRemediation(
  lines: string[],
  apptGaps: ApptGap[],
  custGapCount: number,
  plutioGapCount: number,
): void {
  lines.push('## Recommended remediation');
  if (apptGaps.length > 0) {
    const liveBookings = apptGaps.filter(
      (g) => g.status !== 'canceled' && g.status !== 'rejected',
    ).length;
    lines.push(
      `- Synthesize ${apptGaps.length} \`booked\` interactions; sales handoff for ${liveBookings} non-canceled.`,
    );
  }
  const partyMissing = apptGaps.filter((g) => !g.party).length;
  if (partyMissing > 0) {
    lines.push(
      `- Create ${partyMissing} new parties (Trafft-first contact: no email match in NC).`,
    );
  }
  const partyNoPlutio =
    apptGaps.filter((g) => g.party && !g.party.has_plutio_ref).length +
    plutioGapCount;
  if (partyNoPlutio > 0) {
    lines.push(
      `- Enqueue Plutio create-person for ~${partyNoPlutio} unlinked parties (dedup before enqueue).`,
    );
  }
  if (custGapCount > 0) {
    lines.push(
      `- Synthesize ${custGapCount} \`customer_created\` interactions for Trafft customers without one.`,
    );
  }
  if (apptGaps.length === 0 && custGapCount === 0 && plutioGapCount === 0) {
    lines.push('- No remediation required for sources surveyed.');
  }
}

async function main(): Promise<void> {
  const lines: string[] = [];
  lines.push(
    `# Webhook Reconciliation Report — ${new Date().toISOString().slice(0, 10)}`,
  );
  lines.push(
    `Lookback window: last ${LOOKBACK_DAYS} days. Read-only forensics — no DB writes.\n`,
  );

  const { apptGaps, custGapCount } = await buildTrafftSection(lines);
  const plutioGapCount = await buildPlutioSection(lines);
  await buildStripeSection(lines);
  buildRemediation(lines, apptGaps, custGapCount, plutioGapCount);

  process.stdout.write(lines.join('\n') + '\n');
}

main().catch((err) => {
  console.error('reconciliation report failed:', err);
  process.exit(1);
});
