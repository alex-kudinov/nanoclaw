#!/usr/bin/env tsx
/**
 * email-ops classify — query and inspect email classifications.
 *
 *   list [--since DATE] [--label LABEL]
 *   show MSG_ID
 *   unclassified [--since DATE] [--limit N]
 */

import { query } from '../src/business-db.js';

const TIMEOUT_MS = 5_000;

interface Args {
  action: 'list' | 'show' | 'unclassified' | null;
  since?: string;
  label?: string;
  msgId?: string;
  limit?: number;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { action: null };
  const action = argv[0];
  if (action === 'list' || action === 'show' || action === 'unclassified' || action === '--help') {
    out.action = action === '--help' ? null : action;
  }
  if (action === 'show') out.msgId = argv[1];
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--since': out.since = next(); break;
      case '--label': out.label = next(); break;
      case '--limit': out.limit = parseInt(next() || '50', 10); break;
    }
  }
  return out;
}

function usage(): void {
  console.error(`email-ops classify <action>

Actions:
  list [--since DATE] [--label LABEL]   List classifications
  show MSG_ID                           Full details for one message
  unclassified [--since DATE] [--limit N]  Messages without classification`);
}

function validateDate(d: string): void {
  if (isNaN(Date.parse(d))) {
    console.error(`email-ops classify: invalid date "${d}"`);
    process.exit(1);
  }
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('query timeout')), TIMEOUT_MS),
    ),
  ]);
}

async function cmdList(args: Args): Promise<void> {
  if (args.since) validateDate(args.since);
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (args.since) { conditions.push(`classified_at >= $${idx++}`); params.push(args.since); }
  if (args.label) { conditions.push(`label = $${idx++}`); params.push(args.label); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await withTimeout(query<{
    gmail_message_id: string; sender_email: string; label: string;
    confidence: number; classified_at: string;
  }>(`SELECT gmail_message_id, sender_email, label, confidence, classified_at
      FROM email_classifications ${where}
      ORDER BY classified_at DESC LIMIT 100`, params));
  if (!res.rowCount) { console.log('No classifications found.'); return; }
  console.log('msg_id                sender                          label                          conf  classified_at');
  for (const r of res.rows) {
    const mid = r.gmail_message_id.slice(0, 20).padEnd(22);
    const sender = (r.sender_email || '').slice(0, 30).padEnd(32);
    const label = r.label.padEnd(30);
    const conf = Number(r.confidence ?? 0).toFixed(2).padStart(5);
    const at = r.classified_at ? String(r.classified_at).slice(0, 16) : '' || '';
    console.log(`${mid}${sender}${label} ${conf}  ${at}`);
  }
}

async function cmdShow(msgId: string): Promise<void> {
  const res = await withTimeout(query(
    'SELECT * FROM email_classifications WHERE gmail_message_id = $1', [msgId],
  ));
  if (!res.rowCount) { console.error(`No classification for ${msgId}`); process.exit(1); }
  console.log(JSON.stringify(res.rows[0], null, 2));
}

async function cmdUnclassified(args: Args): Promise<void> {
  if (args.since) validateDate(args.since);
  const limit = args.limit || 50;
  const sinceClause = args.since ? `AND gm.date >= '${new Date(args.since).toISOString()}'` : '';
  const res = await withTimeout(query<{
    gmail_message_id: string; sender_email: string; subject: string; date: string;
  }>(`SELECT gm.gmail_message_id, gm.sender_email, gm.subject, gm.date
      FROM gmail_messages gm
      LEFT JOIN email_classifications ec ON ec.gmail_message_id = gm.gmail_message_id
      WHERE ec.gmail_message_id IS NULL ${sinceClause}
      ORDER BY gm.date DESC LIMIT $1`, [limit]));
  if (!res.rowCount) { console.log('No unclassified messages found.'); return; }
  console.log('msg_id                sender                          subject');
  for (const r of res.rows) {
    const mid = r.gmail_message_id.slice(0, 20).padEnd(22);
    const sender = (r.sender_email || '').slice(0, 30).padEnd(32);
    const subj = (r.subject || '').slice(0, 50);
    console.log(`${mid}${sender}${subj}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(3));
  const rawAction = process.argv[3];
  if (!args.action) { usage(); process.exit(rawAction === '--help' ? 0 : 1); }
  switch (args.action) {
    case 'list': await cmdList(args); break;
    case 'show':
      if (!args.msgId) { console.error('email-ops classify show: MSG_ID required'); process.exit(1); }
      await cmdShow(args.msgId);
      break;
    case 'unclassified': await cmdUnclassified(args); break;
  }
  process.exit(0);
}

main().catch((err) => { console.error('email-ops classify failed:', err.message); process.exit(1); });
