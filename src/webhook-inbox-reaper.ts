/**
 * Phase 3 — webhook_inbox reaper.
 *
 * Polls business_v2.webhook_inbox for rows that need a retry:
 *   - status='received'  : archive happened but receiver crashed before dispatch
 *   - status='failed'    : runAgent rejected (markWebhookFailed was called)
 *   - status='dispatched' AND last_attempted_at < now() - STALE_MINUTES :
 *                          agent never resolved AND never rejected (container
 *                          died, daemon restarted mid-run, etc.)
 *
 * For each, re-renders the prompt from raw_body using webhook config and
 * re-dispatches via runAgent. After MAX_ATTEMPTS failures the row is
 * dead-lettered and chief is alerted.
 *
 * Runs in-process inside the daemon (needs runAgent + registered group state).
 */

import fs from 'fs';
import path from 'path';

import { DATA_DIR } from './config.js';
import { query, withAgentContext } from './business-db.js';
import { logger } from './logger.js';
import type { ContainerOutput } from './container-runner.js';
import type { RegisteredGroup, WebhookDefinition } from './types.js';
import { markFailed, markHandled } from './webhook-inbox.js';
import { handleChaosActivity } from './chaos-activity.js';
import { handleStripePayment } from './stripe-payment-host.js';
import {
  CNPC_INTAKE_WEBHOOK_ID,
  parseCnpcIntakePayload,
  prepareCnpcIntake,
  type CnpcPreparedIntake,
} from './cnpc-intake.js';
import {
  parseAndValidateCnpcMatchResult,
  recordCnpcMatchResult,
} from './cnpc-match-result.js';
import type { BookingPlutioEnqueueResult } from './booking-plutio-host.js';

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;
const STALE_DISPATCH_MINUTES = 30;

interface InboxRow {
  id: number;
  source: string;
  event_type: string | null;
  raw_body: Record<string, unknown>;
  attempts: number;
}

interface ReaperDeps {
  webhooksFile: string;
  getRegisteredGroups: () => Record<string, RegisteredGroup>;
  runAgent: (
    group: RegisteredGroup,
    input: {
      prompt: string;
      groupFolder: string;
      chatJid: string;
      isMain: boolean;
      isScheduledTask?: boolean;
    },
    onProcess: () => void,
    onOutput?: (output: ContainerOutput) => Promise<void>,
  ) => Promise<ContainerOutput>;
  enqueueBookingPlutioActivity: (
    webhookInboxId: number,
  ) => Promise<BookingPlutioEnqueueResult>;
}

export interface ReaperResult {
  processed: number;
  succeeded: number;
  retried: number;
  deadLettered: number;
  deadLetterDetails: Array<{ id: number; source: string; error: string }>;
}

function chiefJid(deps: ReaperDeps): string | null {
  const groups = deps.getRegisteredGroups();
  const chief = Object.entries(groups).find(([, g]) => g.folder === 'chief');
  return chief?.[0] ?? null;
}

function alertChief(deps: ReaperDeps, text: string): void {
  const jid = chiefJid(deps);
  if (!jid) {
    logger.warn(
      { text },
      'webhook-inbox-reaper: chief group not registered; alert dropped',
    );
    return;
  }
  const dir = path.join(DATA_DIR, 'ipc', 'chief', 'messages');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(
    dir,
    `webhook-inbox-reaper-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 6)}.json`,
  );
  // IPC handler requires chatJid + text to route a 'message' type to Slack.
  // The plutio + hive reapers omit chatJid and silently lose alerts — fix
  // tracked in docs/WEBHOOK-RELIABILITY.md §6.
  fs.writeFileSync(
    file,
    JSON.stringify({ type: 'message', chatJid: jid, text }, null, 2),
    'utf-8',
  );
}

function loadWebhooks(filePath: string): WebhookDefinition[] {
  try {
    return JSON.parse(
      fs.readFileSync(filePath, 'utf-8'),
    ) as WebhookDefinition[];
  } catch {
    return [];
  }
}

function renderPrompt(template: string, payload: unknown): string {
  const json = JSON.stringify(payload, null, 2);
  return template
    .replace(/\{\{payload\}\}/g, json)
    .replace(/\{\{payload\.([^}]+)\}\}/g, (_, dotPath: string) => {
      const value = dotPath.split('.').reduce((obj: unknown, key: string) => {
        if (obj !== null && typeof obj === 'object') {
          return (obj as Record<string, unknown>)[key];
        }
        return undefined;
      }, payload);
      return value !== undefined ? String(value) : '';
    });
}

async function markDeadLettered(id: number, error: string): Promise<void> {
  await query(
    `UPDATE business_v2.webhook_inbox
        SET status = 'dead_lettered',
            last_error = $2,
            last_attempted_at = NOW()
      WHERE id = $1`,
    [id, error.slice(0, 4000)],
  );
}

async function claimRows(): Promise<InboxRow[]> {
  return await withAgentContext('webhook-inbox-reaper', async (client) => {
    const sql = `
      SELECT id, source, event_type, raw_body, attempts
        FROM business_v2.webhook_inbox
       WHERE status IN ('received', 'failed')
          OR (status = 'dispatched'
              AND last_attempted_at < now() - ($1 || ' minutes')::interval)
       ORDER BY received_at ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED
    `;
    const res = await client.query<InboxRow>(sql, [
      String(STALE_DISPATCH_MINUTES),
      BATCH_SIZE,
    ]);
    for (const row of res.rows) {
      await client.query(
        `UPDATE business_v2.webhook_inbox
            SET status = 'dispatched',
                attempts = attempts + 1,
                last_attempted_at = NOW(),
                last_error = NULL
          WHERE id = $1`,
        [row.id],
      );
    }
    return res.rows;
  });
}

async function dispatchRow(row: InboxRow, deps: ReaperDeps): Promise<void> {
  const webhooks = loadWebhooks(deps.webhooksFile);
  const webhook = webhooks.find((w) => w.id === row.source);
  if (!webhook) {
    throw new Error(
      `webhook config '${row.source}' not found; cannot redispatch inbox #${row.id}`,
    );
  }
  // Chaos is a mechanical host handler, never an agent — re-run it directly.
  // A retry is idempotent (returning-visitor path) and spends zero tokens.
  // This also covers the chaos-reconciler's synthesized sweep rows.
  if (row.source === 'chaos') {
    await handleChaosActivity(row.raw_body);
    await markHandled(row.id, { handled_by: 'chaos:reaper' });
    return;
  }
  // Stripe payments are mechanical too — re-run process-payment.cjs directly.
  // Idempotent (Sheets upsert + Postgres ON CONFLICT), zero LLM.
  if (row.source === 'stripe-payment') {
    await handleStripePayment(row.raw_body);
    await markHandled(row.id, { handled_by: 'stripe:reaper' });
    return;
  }
  const groups = deps.getRegisteredGroups();
  const group = Object.values(groups).find((g) => g.folder === webhook.group);
  if (!group) {
    throw new Error(
      `group '${webhook.group}' not registered; cannot redispatch inbox #${row.id}`,
    );
  }
  let promptPayload: unknown = row.raw_body;
  let cnpcIntakeId: number | null = null;
  let cnpcPrepared: CnpcPreparedIntake | null = null;
  if (row.source === CNPC_INTAKE_WEBHOOK_ID) {
    const prepared = await prepareCnpcIntake(
      parseCnpcIntakePayload(row.raw_body),
      row.id,
    );
    promptPayload = prepared;
    cnpcIntakeId = prepared.intake.id;
    cnpcPrepared = prepared;
  }
  const prompt = renderPrompt(webhook.prompt_template, promptPayload);
  const isMain = group.isMain === true;

  const output = await deps.runAgent(
    group,
    {
      prompt,
      groupFolder: webhook.group,
      chatJid: webhook.chat_jid,
      isMain,
      isScheduledTask: true,
    },
    () => {},
  );

  if (output.status === 'error') {
    throw new Error(
      `webhook agent returned error: ${output.error || 'unknown error'}`,
    );
  }

  if (
    cnpcPrepared?.eligibility.status === 'eligible' &&
    cnpcPrepared.match_pool.candidate_count > 0
  ) {
    if (!output.result) {
      throw new Error('CNPC reaper run returned no match result');
    }
    const raw =
      typeof output.result === 'string'
        ? output.result
        : JSON.stringify(output.result);
    await recordCnpcMatchResult(
      parseAndValidateCnpcMatchResult(raw, cnpcPrepared),
      cnpcPrepared,
    );
  }

  let bookingPlutio: BookingPlutioEnqueueResult | undefined;
  if (
    row.source === 'trafft' &&
    (row.event_type === 'canceled' || row.event_type === 'rescheduled')
  ) {
    bookingPlutio = await deps.enqueueBookingPlutioActivity(row.id);
  }

  await markHandled(row.id, {
    handled_by: `${webhook.group}:reaper`,
    party_id: bookingPlutio?.partyId,
    related_entity: bookingPlutio
      ? {
          kind: 'booking_plutio_outbox',
          id: bookingPlutio.outboxId,
          interaction_id: bookingPlutio.interactionId,
        }
      : cnpcIntakeId !== null
        ? { kind: 'cnpc_intake', id: cnpcIntakeId }
        : undefined,
  });
}

export async function runReaper(deps: ReaperDeps): Promise<ReaperResult> {
  const result: ReaperResult = {
    processed: 0,
    succeeded: 0,
    retried: 0,
    deadLettered: 0,
    deadLetterDetails: [],
  };

  const rows = await claimRows();
  result.processed = rows.length;
  if (rows.length === 0) return result;

  for (const row of rows) {
    try {
      await dispatchRow(row, deps);
      result.succeeded++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(
        { inboxId: row.id, source: row.source, err: errMsg },
        'webhook-inbox-reaper: dispatch failed',
      );
      // attempts has already been incremented by claimRows()
      if (row.attempts + 1 >= MAX_ATTEMPTS) {
        await markDeadLettered(row.id, errMsg);
        result.deadLettered++;
        result.deadLetterDetails.push({
          id: row.id,
          source: row.source,
          error: errMsg,
        });
      } else {
        await markFailed(row.id, errMsg);
        result.retried++;
      }
    }
  }

  for (const dl of result.deadLetterDetails) {
    alertChief(
      deps,
      `[WEBHOOK-INBOX-DEAD-LETTER] ${dl.source} #${dl.id} dead-lettered after ${MAX_ATTEMPTS} attempts: ${dl.error}`,
    );
  }

  logger.info(
    {
      processed: result.processed,
      succeeded: result.succeeded,
      retried: result.retried,
      deadLettered: result.deadLettered,
    },
    'webhook-inbox-reaper: run complete',
  );

  return result;
}
