#!/usr/bin/env tsx
/**
 * email-ops rules — manage classification_rules (pre-LLM rule runner).
 *
 *   list                              All rules, sorted by hit_count DESC
 *   hits [--top N]                    Top N rules by hit_count
 *   probation                         Rules under probation
 *   for-sender EMAIL                  Rules matching a specific sender
 *   add --type TYPE --value VALUE --label LABEL
 *   disable ID
 *   enable ID
 *   retarget ID --label NEW_LABEL
 */

import { query } from '../src/business-db.js';

const TIMEOUT_MS = 5_000;

interface Args {
  action: string | null;
  type?: string;
  value?: string;
  label?: string;
  id?: number;
  email?: string;
  top?: number;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { action: argv[0] || null };
  // Positional after action: for-sender EMAIL, disable ID, enable ID, retarget ID
  if (out.action === 'for-sender') out.email = argv[1];
  if (out.action === 'disable' || out.action === 'enable' || out.action === 'retarget') {
    out.id = parseInt(argv[1] || '0', 10);
  }
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--type': out.type = next(); break;
      case '--value': out.value = next(); break;
      case '--label': out.label = next(); break;
      case '--top': out.top = parseInt(next() || '20', 10); break;
    }
  }
  return out;
}

function usage(): void {
  console.error(`email-ops rules <action>

Actions:
  list                                All rules (hit_count DESC)
  hits [--top N]                      Top N rules by hit_count (default 20)
  probation                           Rules currently under probation
  for-sender EMAIL                    Rules matching a specific sender
  add --type TYPE --value VALUE --label LABEL
  disable ID                          Disable a rule
  enable ID                           Enable a rule
  retarget ID --label NEW_LABEL       Change target label`);
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('query timeout')), TIMEOUT_MS),
    ),
  ]);
}

function printRuleTable(rows: RuleRow[]): void {
  if (!rows.length) { console.log('No rules found.'); return; }
  console.log('id    hits  en  type           pattern → label');
  for (const r of rows) {
    const id = r.id.toString().padStart(4);
    const hits = r.hit_count.toString().padStart(5);
    const en = r.enabled ? ' Y' : ' N';
    const type = r.pattern_type.padEnd(13);
    const pv = r.pattern_value.length > 35
      ? r.pattern_value.slice(0, 32) + '...'
      : r.pattern_value;
    console.log(`${id}  ${hits}  ${en}  ${type}  ${pv} → ${r.target_label}`);
  }
}

interface RuleRow {
  id: number; pattern_type: string; pattern_value: string;
  target_label: string; hit_count: number; enabled: boolean;
}

const RULE_COLS = 'id, pattern_type, pattern_value, target_label, hit_count, enabled';

async function cmdList(): Promise<void> {
  const res = await withTimeout(query<RuleRow>(
    `SELECT ${RULE_COLS} FROM classification_rules ORDER BY hit_count DESC, id ASC`,
  ));
  printRuleTable(res.rows);
}

async function cmdHits(top: number): Promise<void> {
  const res = await withTimeout(query<RuleRow>(
    `SELECT ${RULE_COLS} FROM classification_rules ORDER BY hit_count DESC LIMIT $1`,
    [top],
  ));
  printRuleTable(res.rows);
}

async function cmdProbation(): Promise<void> {
  const res = await withTimeout(query<RuleRow>(
    `SELECT ${RULE_COLS} FROM classification_rules WHERE probation_until > NOW() ORDER BY probation_until ASC`,
  ));
  printRuleTable(res.rows);
}

async function cmdForSender(email: string): Promise<void> {
  const res = await withTimeout(query<RuleRow>(
    `SELECT ${RULE_COLS} FROM classification_rules WHERE pattern_value = $1 ORDER BY id`,
    [email.toLowerCase()],
  ));
  printRuleTable(res.rows);
}

async function cmdAdd(args: Args): Promise<void> {
  if (!args.type || !args.value || !args.label) {
    console.error('email-ops rules add: --type, --value, and --label are all required');
    process.exit(1);
  }
  const res = await withTimeout(query<{ id: number }>(
    `INSERT INTO classification_rules (pattern_type, pattern_value, target_label, source)
     VALUES ($1, $2, $3, 'manual')
     ON CONFLICT (pattern_type, pattern_value) DO UPDATE SET target_label = EXCLUDED.target_label, enabled = TRUE
     RETURNING id`,
    [args.type, args.value.toLowerCase(), args.label],
  ));
  console.log(`Rule #${res.rows[0]?.id} created: ${args.type} "${args.value}" → ${args.label}`);
}

async function cmdToggle(id: number, enable: boolean): Promise<void> {
  if (!id) { console.error('email-ops rules: numeric ID required'); process.exit(1); }
  const res = await withTimeout(query(
    'UPDATE classification_rules SET enabled = $1 WHERE id = $2', [enable, id],
  ));
  if (!res.rowCount) { console.error(`No rule with id ${id}`); process.exit(1); }
  console.log(`Rule #${id} → ${enable ? 'enabled' : 'disabled'}`);
}

async function cmdRetarget(id: number, label: string | undefined): Promise<void> {
  if (!id || !label) {
    console.error('email-ops rules retarget: ID and --label required');
    process.exit(1);
  }
  const res = await withTimeout(query(
    'UPDATE classification_rules SET target_label = $1 WHERE id = $2', [label, id],
  ));
  if (!res.rowCount) { console.error(`No rule with id ${id}`); process.exit(1); }
  console.log(`Rule #${id} → relabeled to ${label}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(3));
  if (!args.action || args.action === '--help') { usage(); process.exit(args.action ? 0 : 1); }
  switch (args.action) {
    case 'list': await cmdList(); break;
    case 'hits': await cmdHits(args.top ?? 20); break;
    case 'probation': await cmdProbation(); break;
    case 'for-sender':
      if (!args.email) { console.error('email-ops rules for-sender: EMAIL required'); process.exit(1); }
      await cmdForSender(args.email);
      break;
    case 'add': await cmdAdd(args); break;
    case 'disable': await cmdToggle(args.id ?? 0, false); break;
    case 'enable': await cmdToggle(args.id ?? 0, true); break;
    case 'retarget': await cmdRetarget(args.id ?? 0, args.label); break;
    default:
      console.error(`email-ops rules: unknown action "${args.action}"`);
      usage();
      process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => { console.error('email-ops rules failed:', err.message); process.exit(1); });
