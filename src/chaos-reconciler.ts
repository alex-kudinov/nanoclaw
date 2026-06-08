/**
 * Daily Chaos reconciler — the convergence backstop for the leads pipeline.
 *
 * Polls Chaos /lead/recently-verified (via the chaos toolbox tool), diffs each
 * verified visitor against business_v2 parties, and synthesizes a sweep
 * webhook_inbox row for any visitor with no party. The watermark advances only
 * on full convergence; a truncated page or a non-terminal synthesized row
 * freezes it (next run re-covers the same window). Mirrors trafft-sweeper.
 */

import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

import { DATA_DIR } from './config.js';
import { query, withAgentContext } from './business-db.js';
import { logger } from './logger.js';
import { archiveWebhook } from './webhook-inbox.js';
import { chaosVisitorEventId } from './webhook-extractors.js';
import type { RegisteredGroup } from './types.js';

const execFileAsync = promisify(execFile);

const TOOLBOX_DIR =
  process.env.TOOLBOX_DIR || path.join(process.env.HOME || '', 'dev/toolbox');
const CHAOS_TOOL = path.join(
  TOOLBOX_DIR,
  'shared/chaos/tools/chaos/list-recently-verified.sh',
);
const CONVERGENCE_DEADLINE_MS = 30 * 60 * 1000;
const CONVERGENCE_POLL_MS = 30 * 1000;
const ROW_CAP = 500; // matches the Chaos route's recently-verified cap
const TERMINAL = new Set(['handled', 'duplicate', 'dead_lettered']);

export interface ChaosReconcilerDeps {
  getRegisteredGroups: () => Record<string, RegisteredGroup>;
}

export interface ReconcileResult {
  status: 'success' | 'frozen' | 'error';
  fetched_count: number;
  missing_party_count: number;
  synthesized_inbox_count: number;
  watermark_action: 'advanced' | 'frozen' | 'unchanged';
  since_iso: string;
}

interface ChaosVisitor {
  visitor_id: number;
  email: string;
  display_name: string | null;
  identity_status: string;
  email_validated_at: string;
  form_event_type: string | null;
  intent_summary: string | null;
}

function toIsoZ(d: Date): string {
  return d.toISOString().replace(/\.\d+Z$/, 'Z');
}

function result(
  status: ReconcileResult['status'],
  since_iso: string,
  fetched: number,
  missing: number,
  synthesized: number,
  action: ReconcileResult['watermark_action'],
): ReconcileResult {
  return {
    status,
    since_iso,
    fetched_count: fetched,
    missing_party_count: missing,
    synthesized_inbox_count: synthesized,
    watermark_action: action,
  };
}

/** Read the chaos watermark; seed the row on first run. */
async function readWatermark(): Promise<{
  last_seen_at: Date | null;
  prior_status: string | null;
}> {
  const r = await query<{
    last_seen_at: string | null;
    last_run_status: string | null;
  }>(
    `SELECT last_seen_at::text, last_run_status
       FROM business_v2.sweeper_watermarks WHERE source='chaos'`,
  );
  if (r.rows.length === 0) {
    await query(
      `INSERT INTO business_v2.sweeper_watermarks (source, last_seen_at, last_run_status)
       VALUES ('chaos', NULL, 'success') ON CONFLICT (source) DO NOTHING`,
    );
    return { last_seen_at: null, prior_status: null };
  }
  const row = r.rows[0];
  return {
    last_seen_at: row.last_seen_at ? new Date(row.last_seen_at) : null,
    prior_status: row.last_run_status,
  };
}

async function advanceWatermark(at: Date): Promise<void> {
  await query(
    `UPDATE business_v2.sweeper_watermarks
        SET last_seen_at=$1, updated_at=NOW(), last_run_at=NOW(),
            last_run_status='success', last_run_error=NULL
      WHERE source='chaos'`,
    [at],
  );
}

async function freezeWatermark(
  status: 'frozen' | 'error',
  error: string,
): Promise<void> {
  await query(
    `UPDATE business_v2.sweeper_watermarks
        SET updated_at=NOW(), last_run_at=NOW(), last_run_status=$1, last_run_error=$2
      WHERE source='chaos'`,
    [status, error],
  );
}

/** Invoke the chaos toolbox tool; parse the JSON array (or degraded object). */
async function fetchVisitors(sinceIso: string): Promise<ChaosVisitor[]> {
  const env = { ...process.env, TOOLBOX_LIB: path.join(TOOLBOX_DIR, 'lib') };
  const { stdout } = await execFileAsync(CHAOS_TOOL, ['--since', sinceIso], {
    env,
    timeout: 60_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  const trimmed = stdout.trim();
  if (trimmed.startsWith('ERR ')) throw new Error(`chaos tool: ${trimmed}`);
  const start = trimmed.search(/[[{]/);
  if (start < 0) throw new Error('chaos tool: no JSON in response');
  const parsed = JSON.parse(trimmed.slice(start));
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const o = parsed as Record<string, unknown>;
    throw new Error(`chaos degraded: ${String(o.error ?? 'unknown')}`);
  }
  if (!Array.isArray(parsed)) throw new Error('chaos: response not an array');
  return parsed as ChaosVisitor[];
}

async function hasParty(email: string): Promise<boolean> {
  const r = await query<{ party_id: string | null }>(
    `SELECT business_v2.best_party_by_email($1::citext) AS party_id`,
    [email],
  );
  return r.rows.length > 0 && r.rows[0].party_id != null;
}

function displayName(v: ChaosVisitor): string {
  const n = (v.display_name ?? '').trim();
  if (n) return n;
  const at = v.email.indexOf('@');
  return at > 0 ? v.email.slice(0, at) : v.email;
}

/** Synthesized contract object — same shape as the Chaos→n8n push payload. */
function buildContract(v: ChaosVisitor): Record<string, unknown> {
  return {
    source: 'chaos',
    visitor_id: v.visitor_id,
    email: v.email,
    display_name: displayName(v),
    identity_status: 'verified',
    email_validated_at: v.email_validated_at,
    form_event_type: v.form_event_type ?? null,
    intent_summary: v.intent_summary ?? null,
  };
}

function maxValidatedAt(visitors: ChaosVisitor[], since: Date): Date {
  let max = since;
  for (const v of visitors) {
    const d = new Date(v.email_validated_at);
    if (!Number.isNaN(d.getTime()) && d.getTime() > max.getTime()) max = d;
  }
  return max;
}

async function fetchInboxStates(
  ids: number[],
): Promise<Array<{ id: number; status: string }>> {
  if (ids.length === 0) return [];
  const r = await query<{ id: number; status: string }>(
    `SELECT id::int AS id, status FROM business_v2.webhook_inbox
      WHERE id = ANY($1::bigint[])`,
    [ids],
  );
  return r.rows;
}

async function waitForConvergence(
  ids: number[],
): Promise<{ failed: number; failed_ids: number[] }> {
  if (ids.length === 0) return { failed: 0, failed_ids: [] };
  const deadline = Date.now() + CONVERGENCE_DEADLINE_MS;
  while (Date.now() < deadline) {
    const states = await fetchInboxStates(ids);
    if (states.every((s) => TERMINAL.has(s.status))) {
      const failed_ids = states
        .filter((s) => s.status === 'dead_lettered')
        .map((s) => s.id);
      return { failed: failed_ids.length, failed_ids };
    }
    await new Promise((r) => setTimeout(r, CONVERGENCE_POLL_MS));
  }
  const states = await fetchInboxStates(ids);
  const failed_ids = states
    .filter((s) => !TERMINAL.has(s.status) || s.status === 'dead_lettered')
    .map((s) => s.id);
  return { failed: failed_ids.length, failed_ids };
}

function alertChief(deps: ChaosReconcilerDeps, text: string): void {
  const groups = deps.getRegisteredGroups();
  const jid = Object.entries(groups).find(([, g]) => g.folder === 'chief')?.[0];
  if (!jid) {
    logger.warn(
      { text },
      'chaos-reconciler: chief not registered; alert dropped',
    );
    return;
  }
  const dir = path.join(DATA_DIR, 'ipc', 'chief', 'messages');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(
    dir,
    `chaos-reconciler-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`,
  );
  fs.writeFileSync(
    file,
    JSON.stringify({ type: 'message', chatJid: jid, text }, null, 2),
    'utf-8',
  );
}

/** Diff Chaos verified visitors against business_v2 and re-inject any missing. */
export async function runChaosReconcile(
  deps: ChaosReconcilerDeps,
): Promise<ReconcileResult> {
  return withAgentContext('chaos-reconciler', async () => {
    const wm = await readWatermark();
    const since = wm.last_seen_at ?? new Date(Date.now() - 48 * 3600_000);
    const sinceIso = toIsoZ(since);
    logger.info({ since: sinceIso }, 'chaos-reconciler start');

    let visitors: ChaosVisitor[];
    try {
      visitors = await fetchVisitors(sinceIso);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await freezeWatermark('error', msg);
      if (wm.prior_status !== 'error') {
        alertChief(deps, `[CHAOS-RECONCILER-ERROR] Chaos fetch failed: ${msg}`);
      }
      logger.error({ err }, 'chaos-reconciler end error');
      return result('error', sinceIso, 0, 0, 0, 'unchanged');
    }
    if (wm.prior_status === 'error') {
      logger.info('[CHAOS-RECONCILER-RECOVERED] Chaos API reachable again');
    }

    const truncated = visitors.length >= ROW_CAP;
    const missing: ChaosVisitor[] = [];
    for (const v of visitors) {
      if (!(await hasParty(v.email))) missing.push(v);
    }
    const inboxIds: number[] = [];
    for (const v of missing) {
      const eid = chaosVisitorEventId(v.visitor_id);
      if (!eid) {
        logger.warn(
          { visitor_id: v.visitor_id },
          'chaos-reconciler: bad visitor_id',
        );
        continue;
      }
      const r = await archiveWebhook({
        source: 'chaos',
        event_id: eid,
        event_type: v.form_event_type ?? 'verified',
        delivery_path: 'sweep',
        raw_headers: {},
        raw_body: buildContract(v),
      });
      if (!r.isDuplicate) inboxIds.push(r.id);
    }

    const conv = await waitForConvergence(inboxIds);

    if (truncated) {
      await freezeWatermark(
        'frozen',
        `recently-verified returned ${visitors.length} rows (>=cap)`,
      );
      alertChief(
        deps,
        '[CHAOS-RECONCILER-FROZEN] Chaos recently-verified returned a truncated/500-row page — watermark frozen, window not fully covered. Investigate Chaos verified-visitor volume.',
      );
      logger.warn('chaos-reconciler end frozen (truncated)');
      return result(
        'frozen',
        sinceIso,
        visitors.length,
        missing.length,
        inboxIds.length,
        'frozen',
      );
    }
    if (conv.failed > 0) {
      await freezeWatermark(
        'frozen',
        `${conv.failed} of ${inboxIds.length} synthesized rows did not converge`,
      );
      alertChief(
        deps,
        `[CHAOS-RECONCILER-FROZEN] ${conv.failed} synthesized rows did not converge — watermark frozen. Inbox ids: ${conv.failed_ids.join(', ')}`,
      );
      logger.warn(
        { failed_ids: conv.failed_ids },
        'chaos-reconciler end frozen',
      );
      return result(
        'frozen',
        sinceIso,
        visitors.length,
        missing.length,
        inboxIds.length,
        'frozen',
      );
    }

    await advanceWatermark(maxValidatedAt(visitors, since));
    logger.info(
      { fetched: visitors.length, synthesized: inboxIds.length },
      'chaos-reconciler end success',
    );
    return result(
      'success',
      sinceIso,
      visitors.length,
      missing.length,
      inboxIds.length,
      'advanced',
    );
  });
}
