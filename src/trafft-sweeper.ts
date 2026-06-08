/**
 * Phase 5 — Trafft reconciliation sweeper.
 *
 * Every 6h, paginates Trafft appointments + customers, diffs against
 * business_v2.webhook_inbox by Phase-2 event_id format, synthesizes
 * envelopes for missing events with delivery_path='sweep' and a resolved
 * party_id (via Phase 4 identity-join), and waits for the inbox-reaper to
 * drive each row to terminal state.
 *
 * Convergence-in-one-run contract (locked design decision):
 *   - watermark only advances when ALL synthesized envelopes for the run
 *     reach terminal state
 *   - any partial failure freezes the watermark and alerts chief
 *   - next run resumes from the same point — no silent backlog growth
 *
 * Phase-1 webhook_inbox is the diff target. webhook events that ran before
 * Phase 1 (when the table didn't exist) will appear missing on first run
 * and be re-synthesized; the booking agent's idempotency on
 * (source_provider, source_id) makes those re-runs safe (no duplicate
 * interactions, no duplicate Slack notifications per the booking CLAUDE.md).
 */

import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

import { DATA_DIR } from './config.js';
import { query, withAgentContext } from './business-db.js';
import { logger } from './logger.js';
import type { RegisteredGroup } from './types.js';
import { resolveTrafftCustomer } from './identity-join.js';

const execFileAsync = promisify(execFile);

const TOOLBOX_DIR =
  process.env.TOOLBOX_DIR || path.join(process.env.HOME || '', 'dev/toolbox');
const TRAFFT_TOOL_DIR = path.join(TOOLBOX_DIR, 'shared/trafft/tools/trafft');

const CONVERGENCE_DEADLINE_MS = 30 * 60 * 1000; // 30 min
const CONVERGENCE_POLL_MS = 30 * 1000; // 30 s
const PAGE_LIMIT = 50;

interface TrafftCustomer {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone_number?: string | null;
}

interface TrafftEmployee {
  id: number;
  first_name: string;
  last_name: string;
}

interface TrafftAppt {
  id: number;
  status: string;
  start_date_time: string;
  created_at: string;
  service?: { name?: string };
  employees?: TrafftEmployee[];
  bookings?: Array<{ customer?: TrafftCustomer }>;
}

export interface TrafftSweeperDeps {
  getRegisteredGroups: () => Record<string, RegisteredGroup>;
}

export interface SweepResult {
  source: 'trafft';
  synthesized: number;
  recovered: number;
  failed: number;
  watermark_advanced: boolean;
  failed_inbox_ids: number[];
}

async function callTrafft(script: string, args: string[]): Promise<unknown> {
  const env = { ...process.env, TOOLBOX_LIB: path.join(TOOLBOX_DIR, 'lib') };
  const { stdout } = await execFileAsync(
    path.join(TRAFFT_TOOL_DIR, script),
    args,
    { env, timeout: 60_000, maxBuffer: 10 * 1024 * 1024 },
  );
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

async function paginate<T>(script: string): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= 100; page++) {
    const data = (await callTrafft(script, [
      '--page',
      String(page),
      '--limit',
      String(PAGE_LIMIT),
    ])) as PagedResp<T>;
    all.push(...data.data);
    if (page >= data.pagination.pages) break;
  }
  return all;
}

interface InboxEventIdRow {
  event_id: string;
}

async function existingTrafftEventIds(): Promise<Set<string>> {
  const r = await query<InboxEventIdRow>(
    `SELECT event_id FROM business_v2.webhook_inbox
      WHERE source = 'trafft' AND event_id IS NOT NULL`,
  );
  return new Set(r.rows.map((row) => row.event_id));
}

/** Exported for unit tests. */
export function apptEventId(a: TrafftAppt): string {
  return `appt:${a.id}:booked`;
}

/** Exported for unit tests. */
export function custEventId(c: TrafftCustomer): string {
  return `cust:${c.id}:created`;
}

function fullName(first?: string, last?: string): string | undefined {
  const n = [first, last].filter(Boolean).join(' ').trim();
  return n || undefined;
}

/** Exported for unit tests. */
export function buildApptRawBody(
  a: TrafftAppt,
  customerPhone?: string | null,
): Record<string, unknown> {
  const cust = a.bookings?.[0]?.customer;
  const emp = a.employees?.[0];
  return {
    event_type: 'booked',
    appointmentId: String(a.id),
    appointmentStatus: a.status,
    appointmentStart: a.start_date_time,
    serviceName: a.service?.name,
    customerId: cust ? String(cust.id) : undefined,
    customerEmail: cust?.email,
    customerFirstName: cust?.first_name,
    customerLastName: cust?.last_name,
    customerFullName: fullName(cust?.first_name, cust?.last_name),
    customerPhone: customerPhone ?? undefined,
    employeeFirstName: emp?.first_name,
    employeeLastName: emp?.last_name,
    employeeFullName: fullName(emp?.first_name, emp?.last_name),
    _synthetic: true,
  };
}

/** Exported for unit tests. */
export function buildCustRawBody(c: TrafftCustomer): Record<string, unknown> {
  return {
    event_type: 'customer_created',
    customerId: String(c.id),
    customerEmail: c.email,
    customerFirstName: c.first_name,
    customerLastName: c.last_name,
    _synthetic: true,
  };
}

async function insertEnvelope(opts: {
  event_id: string;
  event_type: string;
  raw_body: Record<string, unknown>;
  party_id: number | null;
}): Promise<number> {
  const r = await query<{ id: string }>(
    `INSERT INTO business_v2.webhook_inbox
       (source, event_id, event_type, delivery_path, raw_headers, raw_body, party_id)
     VALUES ('trafft', $1, $2, 'sweep', '{}'::jsonb, $3::jsonb, $4)
     RETURNING id::text`,
    [
      opts.event_id,
      opts.event_type,
      JSON.stringify(opts.raw_body),
      opts.party_id,
    ],
  );
  return Number(r.rows[0].id);
}

async function readWatermark(): Promise<{
  last_seen_at: Date | null;
}> {
  const r = await query<{ last_seen_at: string | null }>(
    `SELECT last_seen_at::text FROM business_v2.sweeper_watermarks WHERE source='trafft'`,
  );
  if (r.rows.length === 0) return { last_seen_at: null };
  return {
    last_seen_at: r.rows[0].last_seen_at
      ? new Date(r.rows[0].last_seen_at)
      : null,
  };
}

async function writeWatermark(opts: {
  last_seen_at: Date;
  status: 'success' | 'frozen' | 'error';
  error?: string | null;
  recovered: number;
  failed: number;
}): Promise<void> {
  await query(
    `INSERT INTO business_v2.sweeper_watermarks
       (source, last_seen_at, updated_at, last_run_at, last_run_status,
        last_run_error, last_run_recovered, last_run_failed)
     VALUES ('trafft', $1, NOW(), NOW(), $2, $3, $4, $5)
     ON CONFLICT (source) DO UPDATE SET
       last_seen_at = EXCLUDED.last_seen_at,
       updated_at = EXCLUDED.updated_at,
       last_run_at = EXCLUDED.last_run_at,
       last_run_status = EXCLUDED.last_run_status,
       last_run_error = EXCLUDED.last_run_error,
       last_run_recovered = EXCLUDED.last_run_recovered,
       last_run_failed = EXCLUDED.last_run_failed`,
    [
      opts.last_seen_at,
      opts.status,
      opts.error ?? null,
      opts.recovered,
      opts.failed,
    ],
  );
}

async function freezeWatermark(opts: {
  status: 'frozen' | 'error';
  error: string;
  recovered: number;
  failed: number;
}): Promise<void> {
  await query(
    `UPDATE business_v2.sweeper_watermarks
        SET last_run_at = NOW(),
            last_run_status = $1,
            last_run_error = $2,
            last_run_recovered = $3,
            last_run_failed = $4,
            updated_at = NOW()
      WHERE source = 'trafft'`,
    [opts.status, opts.error, opts.recovered, opts.failed],
  );
}

interface RowState {
  id: number;
  status: string;
}

async function fetchInboxStates(ids: number[]): Promise<RowState[]> {
  if (ids.length === 0) return [];
  const r = await query<RowState>(
    `SELECT id::int AS id, status FROM business_v2.webhook_inbox WHERE id = ANY($1::bigint[])`,
    [ids],
  );
  return r.rows;
}

const TERMINAL = new Set(['handled', 'duplicate', 'dead_lettered']);

async function waitForConvergence(
  ids: number[],
): Promise<{ recovered: number; failed: number; failed_ids: number[] }> {
  if (ids.length === 0) return { recovered: 0, failed: 0, failed_ids: [] };
  const deadline = Date.now() + CONVERGENCE_DEADLINE_MS;
  while (Date.now() < deadline) {
    const states = await fetchInboxStates(ids);
    const allTerminal = states.every((s) => TERMINAL.has(s.status));
    if (allTerminal) {
      const recovered = states.filter((s) => s.status === 'handled').length;
      const failed = states.filter((s) => s.status === 'dead_lettered').length;
      const failed_ids = states
        .filter((s) => s.status === 'dead_lettered')
        .map((s) => s.id);
      return { recovered, failed, failed_ids };
    }
    await new Promise((r) => setTimeout(r, CONVERGENCE_POLL_MS));
  }
  // Deadline hit — count what we have, the rest are stuck (counted as failed).
  const states = await fetchInboxStates(ids);
  const recovered = states.filter((s) => s.status === 'handled').length;
  const failed_ids = states
    .filter((s) => !TERMINAL.has(s.status) || s.status === 'dead_lettered')
    .map((s) => s.id);
  return { recovered, failed: failed_ids.length, failed_ids };
}

function chiefJid(deps: TrafftSweeperDeps): string | null {
  const groups = deps.getRegisteredGroups();
  const chief = Object.entries(groups).find(([, g]) => g.folder === 'chief');
  return chief?.[0] ?? null;
}

function alertChief(deps: TrafftSweeperDeps, text: string): void {
  const jid = chiefJid(deps);
  if (!jid) {
    logger.warn(
      { text },
      'trafft-sweeper: chief group not registered; alert dropped',
    );
    return;
  }
  const dir = path.join(DATA_DIR, 'ipc', 'chief', 'messages');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(
    dir,
    `trafft-sweeper-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`,
  );
  fs.writeFileSync(
    file,
    JSON.stringify({ type: 'message', chatJid: jid, text }, null, 2),
    'utf-8',
  );
}

export async function runSweep(deps: TrafftSweeperDeps): Promise<SweepResult> {
  return withAgentContext('trafft-sweeper', async () => {
    const result: SweepResult = {
      source: 'trafft',
      synthesized: 0,
      recovered: 0,
      failed: 0,
      watermark_advanced: false,
      failed_inbox_ids: [],
    };

    const watermark = await readWatermark();
    logger.info(
      { source: 'trafft', last_seen_at: watermark.last_seen_at },
      'trafft-sweeper: starting',
    );

    let appts: TrafftAppt[];
    let customers: TrafftCustomer[];
    try {
      [appts, customers] = await Promise.all([
        paginate<TrafftAppt>('list-appointments.sh'),
        paginate<TrafftCustomer>('list-customers.sh'),
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'trafft-sweeper: API fetch failed');
      await freezeWatermark({
        status: 'error',
        error: msg,
        recovered: 0,
        failed: 0,
      });
      alertChief(deps, `[TRAFFT-SWEEPER-ERROR] API fetch failed: ${msg}`);
      throw err;
    }

    // Filter appointments to only those after the watermark (or all on first run)
    const wmTime = watermark.last_seen_at?.getTime() ?? 0;
    const recentAppts = appts.filter(
      (a) => new Date(a.created_at).getTime() > wmTime,
    );

    const seenIds = await existingTrafftEventIds();
    const synthesizedIds: number[] = [];
    let maxCreatedAt = wmTime;

    // NOTE: customer_created sweep is intentionally NOT synthesized.
    // Trafft's API does not expose customer created_at, so the sweeper has
    // no watermark for customers — every run would re-synthesize every
    // customer. Booked events carry full customer fields (id, email, name)
    // which is enough for identity-join to resolve/create the party. The
    // walk-in case (customer registered in Trafft without booking yet) is
    // captured by the live customer_created webhook only. The `customers`
    // pagination is used to enrich synthesized bookings with customer phone,
    // since the appointment's embedded customer object omits phone_number.
    const phoneById = new Map<number, string>();
    for (const c of customers) {
      if (c.phone_number) phoneById.set(c.id, c.phone_number);
    }

    // Synthesize missing booked events
    for (const a of recentAppts) {
      const event_id = apptEventId(a);
      if (seenIds.has(event_id)) continue;
      const cust = a.bookings?.[0]?.customer;
      if (!cust) {
        logger.warn(
          { appt_id: a.id },
          'trafft-sweeper: appt has no customer; skipping',
        );
        continue;
      }
      try {
        const partyId = await resolveTrafftCustomer(
          {
            customerId: cust.id,
            customerEmail: cust.email,
            customerFirstName: cust.first_name,
            customerLastName: cust.last_name,
          },
          { agent: 'trafft-sweeper' },
        );
        const inboxId = await insertEnvelope({
          event_id,
          event_type: 'booked',
          raw_body: buildApptRawBody(a, phoneById.get(cust.id)),
          party_id: partyId,
        });
        synthesizedIds.push(inboxId);
        const ts = new Date(a.created_at).getTime();
        if (ts > maxCreatedAt) maxCreatedAt = ts;
      } catch (err) {
        logger.warn(
          { appt_id: a.id, err },
          'trafft-sweeper: appt synthesis failed',
        );
      }
    }

    result.synthesized = synthesizedIds.length;
    logger.info(
      { synthesized: result.synthesized },
      'trafft-sweeper: envelopes synthesized; waiting for convergence',
    );

    if (synthesizedIds.length === 0) {
      // No new events — still update last_run timestamps + maybe advance watermark
      // to current Trafft latest if we want. Skip advance on empty for simplicity.
      logger.info('trafft-sweeper: no new events found');
      return result;
    }

    const conv = await waitForConvergence(synthesizedIds);
    result.recovered = conv.recovered;
    result.failed = conv.failed;
    result.failed_inbox_ids = conv.failed_ids;

    if (conv.failed === 0) {
      await writeWatermark({
        last_seen_at: new Date(maxCreatedAt),
        status: 'success',
        recovered: conv.recovered,
        failed: 0,
      });
      result.watermark_advanced = true;
      logger.info(
        { recovered: conv.recovered },
        'trafft-sweeper: full convergence; watermark advanced',
      );
    } else {
      await freezeWatermark({
        status: 'frozen',
        error: `${conv.failed} of ${synthesizedIds.length} synthesized events failed to reach terminal state`,
        recovered: conv.recovered,
        failed: conv.failed,
      });
      alertChief(
        deps,
        `[TRAFFT-SWEEPER-FROZEN] ${conv.failed} of ${synthesizedIds.length} synthesized events did not converge. Watermark frozen — investigate inbox ids: ${conv.failed_ids.join(', ')}`,
      );
      logger.warn(
        {
          recovered: conv.recovered,
          failed: conv.failed,
          failed_ids: conv.failed_ids,
        },
        'trafft-sweeper: partial failure; watermark frozen',
      );
    }

    return result;
  });
}
