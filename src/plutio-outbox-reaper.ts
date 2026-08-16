/**
 * Plutio outbox reaper — processes pending rows in business_v2.plutio_outbox.
 *
 * For each row: claims it (in_flight), dispatches to the appropriate Plutio
 * toolbox tool, writes the Plutio ID back to plutio_refs, marks processed.
 * Dead-letters rows after MAX_ATTEMPTS failures with chief IPC alert.
 *
 * Invoked by the `plutio-outbox-reaper` host job every 15 minutes.
 */

import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

import { assertExternalWriteAllowed } from './action-safety.js';
import { DATA_DIR } from './config.js';
import { query, withAgentContext } from './business-db.js';
import { getAllRegisteredGroups } from './db.js';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';
import { stripToJson } from './plutio-cli.js';
import {
  dispatchBookingPlutioOutboxRow,
  isBookingPlutioOutboxRow,
  type BookingPlutioReceipt,
} from './booking-plutio-host.js';

const execFileAsync = promisify(execFile);

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;
const TOOLBOX_DIR =
  process.env.TOOLBOX_DIR || path.join(process.env.HOME || '', 'dev/toolbox');
const PLUTIO_TOOL_DIR = path.join(TOOLBOX_DIR, 'shared/plutio/tools/plutio');

interface OutboxRow {
  id: number;
  operation: string;
  kind: string;
  party_id: number | null;
  document_id: number | null;
  payload: Record<string, unknown>;
  attempts: number;
}

export interface ReaperResult {
  processed: number;
  succeeded: number;
  retried: number;
  deadLettered: number;
  deadLetterDetails: Array<{ id: number; error: string }>;
}

async function markSuccess(
  id: number,
  receipt?: BookingPlutioReceipt,
): Promise<void> {
  await query(
    `UPDATE business_v2.plutio_outbox
        SET status = 'processed', last_attempted_at = NOW(),
            last_error = NULL, last_updated_by = 'plutio-reaper',
            payload = CASE WHEN $2::jsonb IS NULL THEN payload
                           ELSE payload || jsonb_build_object('receipt', $2::jsonb)
                      END
      WHERE id = $1`,
    [id, receipt ? JSON.stringify(receipt) : null],
  );
}

async function markFailure(row: OutboxRow, errMsg: string): Promise<boolean> {
  const nextAttempts = row.attempts + 1;
  const dead = nextAttempts >= MAX_ATTEMPTS;
  await query(
    `UPDATE business_v2.plutio_outbox
        SET status = $1, attempts = $2, last_attempted_at = NOW(),
            last_error = $3, last_updated_by = 'plutio-reaper'
      WHERE id = $4`,
    [dead ? 'dead' : 'failed', nextAttempts, errMsg.slice(0, 2000), row.id],
  );
  return dead;
}

function alertChief(text: string): void {
  // IPC handler at src/ipc.ts:152 requires chatJid + text to route a 'message'
  // type to Slack. Look up chief group's jid from the registered_groups
  // SQLite table; drop the alert with a warn if chief isn't registered.
  let chiefJid: string | null = null;
  try {
    const groups = getAllRegisteredGroups();
    const found = Object.entries(groups).find(([, g]) => g.folder === 'chief');
    chiefJid = found?.[0] ?? null;
  } catch (err) {
    logger.warn(
      { err, text },
      'plutio-outbox-reaper: failed to resolve chief jid; alert dropped',
    );
    return;
  }
  if (!chiefJid) {
    logger.warn(
      { text },
      'plutio-outbox-reaper: chief group not registered; alert dropped',
    );
    return;
  }
  const dir = path.join(DATA_DIR, 'ipc', 'chief', 'messages');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(
    dir,
    `plutio-reaper-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`,
  );
  fs.writeFileSync(
    file,
    JSON.stringify({ type: 'message', chatJid: chiefJid, text }, null, 2),
    'utf-8',
  );
}

async function callPlutioTool(script: string, args: string[]): Promise<string> {
  const toolPath = path.join(PLUTIO_TOOL_DIR, script);
  assertExternalWriteAllowed({
    system: 'plutio',
    actionClass: /(?:invoice|proposal|contract)/.test(script)
      ? 'c4_financial'
      : /delete-/.test(script)
        ? 'c5_destructive'
        : 'c2_external_write',
    source: 'host:plutio-outbox-reaper',
  });
  // env.ts deliberately keeps secrets off process.env. Inject Plutio creds
  // explicitly here so the bash script's plutio_load_env (which only sources
  // .env from cwd) finds them.
  const plutioCreds = readEnvFile([
    'PLUTIO_API_CLIENTID',
    'PLUTIO_API_CLIENTSECRET',
    'PLUTIO_SUBDOMAIN',
  ]);
  const env = {
    ...process.env,
    ...plutioCreds,
    TOOLBOX_LIB: path.join(TOOLBOX_DIR, 'lib'),
  };
  // plutio_load_env auto-sources `.env` from cwd, which would pick up the
  // daemon's NanoClaw/.env (unrelated to Plutio, contains bash-incompatible
  // unquoted values). Force cwd to the toolbox plutio dir so its own .env is
  // sourced instead.
  const { stdout } = await execFileAsync(toolPath, args, {
    env,
    cwd: TOOLBOX_DIR,
    timeout: 30_000,
  });
  return stdout.trim();
}

async function lookupPartyEmail(partyId: number): Promise<string | null> {
  const res = await query<{ primary_email: string }>(
    'SELECT primary_email FROM business_v2.parties WHERE id = $1',
    [partyId],
  );
  return res.rows[0]?.primary_email || null;
}

async function lookupPartyName(
  partyId: number,
): Promise<{ display_name: string }> {
  const res = await query<{ display_name: string }>(
    'SELECT display_name FROM business_v2.parties WHERE id = $1',
    [partyId],
  );
  return res.rows[0] || { display_name: 'Unknown' };
}

async function savePlutioRef(
  entityType: string,
  entityId: number,
  plutioId: string,
): Promise<void> {
  await query(
    `INSERT INTO business_v2.plutio_refs
       (entity_type, entity_id, plutio_entity_type, plutio_id, last_pushed_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (entity_type, entity_id) DO UPDATE
       SET plutio_id = EXCLUDED.plutio_id,
           last_pushed_at = NOW()`,
    [entityType, entityId, entityType, plutioId],
  );
}

async function lookupPlutioRef(
  entityType: string,
  entityId: number,
): Promise<string | null> {
  const res = await query<{ plutio_id: string }>(
    'SELECT plutio_id FROM business_v2.plutio_refs WHERE entity_type = $1 AND entity_id = $2',
    [entityType, entityId],
  );
  return res.rows[0]?.plutio_id || null;
}

function splitName(displayName: string): { first: string; last: string } {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length <= 1) return { first: parts[0] || 'Unknown', last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

async function dispatchRow(
  row: OutboxRow,
): Promise<BookingPlutioReceipt | undefined> {
  const { operation, kind, party_id, document_id, payload } = row;

  if (isBookingPlutioOutboxRow(row)) {
    return dispatchBookingPlutioOutboxRow(row);
  }

  if (operation === 'sync' && kind === 'party' && party_id) {
    const email = await lookupPartyEmail(party_id);
    if (!email) throw new Error(`Party ${party_id} has no email`);
    const party = await lookupPartyName(party_id);
    const { first, last } = splitName(party.display_name);
    const args = ['--email', email, '--first', first];
    if (last) args.push('--last', last);
    const output = callPlutioTool('upsert-person.sh', args);
    const result = JSON.parse(stripToJson(await output));
    if (result._id) {
      await savePlutioRef('party', party_id, result._id);
    }
    return;
  }

  if (operation === 'create' && party_id) {
    const email = await lookupPartyEmail(party_id);
    if (!email) throw new Error(`Party ${party_id} has no email`);

    // Ensure party exists in Plutio first
    let plutioPersonId = await lookupPlutioRef('party', party_id);
    if (!plutioPersonId) {
      const party = await lookupPartyName(party_id);
      const { first, last } = splitName(party.display_name);
      const personArgs = ['--email', email, '--first', first];
      if (last) personArgs.push('--last', last);
      const personOut = JSON.parse(
        stripToJson(await callPlutioTool('upsert-person.sh', personArgs)),
      );
      plutioPersonId = personOut._id;
      if (plutioPersonId) {
        await savePlutioRef('party', party_id, plutioPersonId);
      }
    }

    // Plutio create-* scripts accept a single `--data JSON` argument that
    // gets POSTed as the body. Build the document body here rather than
    // shelling per-flag — the scripts have no flag-based parser.
    if (kind === 'proposal' && document_id) {
      const amount = ((payload.amount_cents as number) || 0) / 100;
      const body: Record<string, unknown> = {
        title: `Proposal #${document_id}`,
      };
      if (plutioPersonId) body.to = plutioPersonId;
      if (amount > 0) {
        body.items = [{ description: `Proposal #${document_id}`, amount }];
      }
      const output = JSON.parse(
        stripToJson(
          await callPlutioTool('create-proposal.sh', [
            '--data',
            JSON.stringify(body),
          ]),
        ),
      );
      if (output._id) {
        await savePlutioRef('document', document_id, output._id);
      }
      return;
    }

    if (kind === 'invoice' && document_id) {
      const amount = ((payload.amount_cents as number) || 0) / 100;
      const body: Record<string, unknown> = {
        title: `Invoice #${document_id}`,
      };
      if (plutioPersonId) body.to = plutioPersonId;
      if (amount > 0) {
        body.items = [{ description: `Invoice #${document_id}`, amount }];
      }
      const output = JSON.parse(
        stripToJson(
          await callPlutioTool('create-invoice.sh', [
            '--data',
            JSON.stringify(body),
          ]),
        ),
      );
      if (output._id) {
        await savePlutioRef('document', document_id, output._id);
      }
      return;
    }

    if (kind === 'contract' && document_id) {
      const body: Record<string, unknown> = {
        title: `Contract #${document_id}`,
      };
      if (plutioPersonId) body.to = plutioPersonId;
      const output = JSON.parse(
        stripToJson(
          await callPlutioTool('create-contract.sh', [
            '--data',
            JSON.stringify(body),
          ]),
        ),
      );
      if (output._id) {
        await savePlutioRef('document', document_id, output._id);
      }
      return;
    }
  }

  if (operation === 'update' && party_id) {
    const plutioId = await lookupPlutioRef(kind, party_id);
    if (!plutioId) {
      throw new Error(`No plutio_ref for ${kind}:${party_id} — cannot update`);
    }
    const email = await lookupPartyEmail(party_id);
    if (kind === 'party' && email) {
      const party = await lookupPartyName(party_id);
      const { first, last } = splitName(party.display_name);
      await callPlutioTool('update-person.sh', [
        '--id',
        plutioId,
        '--first',
        first,
        '--last',
        last,
      ]);
      return;
    }
  }

  if (operation === 'delete' && party_id) {
    const plutioId = await lookupPlutioRef(kind, party_id);
    if (!plutioId) return; // nothing to delete
    if (kind === 'party') {
      await callPlutioTool('delete-person.sh', ['--id', plutioId]);
      return;
    }
  }

  throw new Error(
    `Unsupported outbox entry: operation=${operation} kind=${kind}`,
  );
}

export async function runReaper(): Promise<ReaperResult> {
  const result: ReaperResult = {
    processed: 0,
    succeeded: 0,
    retried: 0,
    deadLettered: 0,
    deadLetterDetails: [],
  };

  const rows = await withAgentContext('plutio-reaper', async (client) => {
    const res = await client.query<OutboxRow>(
      `SELECT id, operation, kind, party_id, document_id, payload, attempts
         FROM business_v2.plutio_outbox
        WHERE status IN ('pending', 'failed')
           OR (status = 'in_flight'
               AND operation = 'sync'
               AND kind LIKE 'booking_activity:%'
               AND last_attempted_at < NOW() - INTERVAL '30 minutes')
        ORDER BY attempts ASC, created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [BATCH_SIZE],
    );
    // Claim all fetched rows
    for (const row of res.rows) {
      await client.query(
        `UPDATE business_v2.plutio_outbox
            SET status = 'in_flight', last_attempted_at = NOW(),
                last_updated_by = 'plutio-reaper'
          WHERE id = $1`,
        [row.id],
      );
    }
    return res.rows;
  });

  result.processed = rows.length;

  for (const row of rows) {
    try {
      const receipt = await dispatchRow(row);
      await markSuccess(row.id, receipt);
      result.succeeded++;
    } catch (err) {
      // execFile errors carry the real failure reason in `stderr`. Without
      // appending it, the chief dead-letter alert says only "Command failed:
      // <cmd>" with no clue why — masking issues like CLI-flag mismatches
      // or Plutio API rejections.
      const baseMsg = err instanceof Error ? err.message : String(err);
      const stderr =
        err && typeof err === 'object' && 'stderr' in err
          ? String((err as { stderr?: unknown }).stderr || '').trim()
          : '';
      const errMsg = stderr ? `${baseMsg} :: ${stderr}` : baseMsg;
      logger.warn(
        { outboxId: row.id, operation: row.operation, kind: row.kind, err },
        'plutio-reaper: dispatch failed',
      );
      const dead = await markFailure(row, errMsg);
      if (dead) {
        result.deadLettered++;
        result.deadLetterDetails.push({ id: row.id, error: errMsg });
      } else {
        result.retried++;
      }
    }
  }

  if (result.deadLettered > 0) {
    for (const dl of result.deadLetterDetails) {
      alertChief(
        `[PLUTIO-REAPER-DEAD-LETTER] Outbox #${dl.id} dead-lettered after ${MAX_ATTEMPTS} attempts: ${dl.error}`,
      );
    }
  }

  logger.info(
    {
      processed: result.processed,
      succeeded: result.succeeded,
      retried: result.retried,
      deadLettered: result.deadLettered,
    },
    'plutio-outbox-reaper: run complete',
  );

  return result;
}
