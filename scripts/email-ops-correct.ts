#!/usr/bin/env tsx
/**
 * email-ops correct — override a classification, re-route, or backfill.
 *
 *   MSG_ID --label LABEL       Override the classification label
 *   MSG_ID --route GROUP       Write IPC to route message to a group
 *   MSG_ID --backfill          Trigger classify-backfill for the sender
 *
 * Flags can be combined: --label MrGru/sales/lead --backfill
 */

import fs from 'fs';
import path from 'path';

import { query } from '../src/business-db.js';
import { DATA_DIR } from '../src/config.js';

const TIMEOUT_MS = 5_000;

interface Args {
  msgId: string | null;
  label?: string;
  route?: string;
  backfill: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { msgId: null, backfill: false };
  // First non-flag token is MSG_ID
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--label': out.label = next(); break;
      case '--route': out.route = next(); break;
      case '--backfill': out.backfill = true; break;
      case '--help': out.msgId = '--help'; break;
      default:
        if (a.startsWith('--')) {
          console.error(`email-ops correct: unknown flag "${a}"`);
          process.exit(1);
        }
        if (!out.msgId) out.msgId = a;
    }
  }
  return out;
}

function usage(): void {
  console.error(`email-ops correct MSG_ID [--label LABEL] [--route GROUP] [--backfill]

Override a classification, re-route a message, or trigger backfill.

Flags:
  --label LABEL    Set classification label
  --route GROUP    Write IPC to route message to the specified group
  --backfill       Insert a classification_rule for the sender and backfill`);
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('query timeout')), TIMEOUT_MS),
    ),
  ]);
}

async function overrideLabel(msgId: string, label: string): Promise<void> {
  const res = await withTimeout(query(
    `UPDATE email_classifications
        SET label = $1, corrected_at = NOW(), corrected_from_label = label
      WHERE gmail_message_id = $2`,
    [label, msgId],
  ));
  if (!res.rowCount) {
    console.error(`No classification row for ${msgId} — cannot relabel`);
    process.exit(1);
  }
  console.log(`Classification for ${msgId} → ${label}`);
}

function writeIpcRoute(msgId: string, group: string): void {
  const ipcDir = path.join(DATA_DIR, 'ipc', group, 'messages');
  fs.mkdirSync(ipcDir, { recursive: true });
  const payload = {
    type: 'route_correction',
    gmail_message_id: msgId,
    target_group: group,
    source: 'email-ops-correct',
    created_at: new Date().toISOString(),
  };
  const filename = `correct-${msgId}-${Date.now()}.json`;
  fs.writeFileSync(path.join(ipcDir, filename), JSON.stringify(payload, null, 2) + '\n');
  console.log(`IPC route message written → ${group}/messages/${filename}`);
}

async function triggerBackfill(msgId: string): Promise<void> {
  const res = await withTimeout(query<{
    sender_email: string; label: string;
  }>(
    'SELECT sender_email, label FROM email_classifications WHERE gmail_message_id = $1',
    [msgId],
  ));
  if (!res.rowCount || !res.rows[0].sender_email) {
    console.error(`Cannot backfill: no classification or sender for ${msgId}`);
    process.exit(1);
  }
  const { sender_email, label } = res.rows[0];
  const ins = await withTimeout(query<{ id: number }>(
    `INSERT INTO classification_rules (pattern_type, pattern_value, target_label, source)
     VALUES ('sender_exact', $1, $2, 'correction')
     ON CONFLICT (pattern_type, pattern_value) DO UPDATE SET target_label = EXCLUDED.target_label, enabled = TRUE
     RETURNING id`,
    [sender_email.toLowerCase(), label],
  ));
  const ruleId = ins.rows[0]?.id;
  console.log(`Backfill rule #${ruleId}: sender_exact "${sender_email}" → ${label}`);

  const backfilled = await withTimeout(query(
    `UPDATE email_classifications
        SET label = $1, corrected_at = NOW(), corrected_from_label = label
      WHERE LOWER(sender_email) = $2 AND label <> $1`,
    [label, sender_email.toLowerCase()],
  ));
  console.log(`Backfilled ${backfilled.rowCount || 0} rows for ${sender_email}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(3));
  if (!args.msgId || args.msgId === '--help') { usage(); process.exit(args.msgId ? 0 : 1); }
  if (!args.label && !args.route && !args.backfill) {
    console.error('email-ops correct: at least one of --label, --route, --backfill required');
    process.exit(1);
  }
  if (args.label) await overrideLabel(args.msgId, args.label);
  if (args.route) writeIpcRoute(args.msgId, args.route);
  if (args.backfill) await triggerBackfill(args.msgId);
  process.exit(0);
}

main().catch((err) => { console.error('email-ops correct failed:', err.message); process.exit(1); });
