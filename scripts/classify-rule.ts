#!/usr/bin/env tsx
/**
 * CLI for managing classification_rules — the pre-LLM rule runner's
 * lookup table. Rules match inbound Gmail messages by sender/subject/header
 * and apply a canonical label without invoking mailman.
 *
 * Usage:
 *
 *   List and inspect:
 *     classify-rule --list
 *     classify-rule --top 20            # sort by hit_count DESC
 *
 *   Add a rule:
 *     classify-rule --add --sender noreply@linkedin.com --label MrGru/notification/system
 *     classify-rule --add --sender-regex '@stripe\.com$' --label MrGru/financial/receipt
 *     classify-rule --add --subject-regex '^Invitation: ' --label MrGru/notification/calendar
 *
 *   Toggle a rule:
 *     classify-rule --disable 17
 *     classify-rule --enable  17
 *
 *   Seed from history (idempotent — ON CONFLICT DO NOTHING):
 *     classify-rule --seed-from-history                  # min 3 repeats per sender/label pair
 *     classify-rule --seed-from-history --min-count 2
 *
 * Rules are cached in-process for 60s, so new rules become active on the
 * next cache refresh (at most 60s after insert).
 */

import { query } from '../src/business-db.js';
import { resetRulesCache } from '../src/classify-rules-runner.js';

interface Args {
  mode: 'add' | 'list' | 'top' | 'disable' | 'enable' | 'seed' | null;
  sender?: string;
  senderRegex?: string;
  subjectRegex?: string;
  label?: string;
  id?: number;
  topN?: number;
  minCount?: number;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { mode: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--add':
        out.mode = 'add';
        break;
      case '--list':
        out.mode = 'list';
        break;
      case '--top':
        out.mode = 'top';
        out.topN = parseInt(next() || '20', 10);
        break;
      case '--disable':
        out.mode = 'disable';
        out.id = parseInt(next() || '0', 10);
        break;
      case '--enable':
        out.mode = 'enable';
        out.id = parseInt(next() || '0', 10);
        break;
      case '--seed-from-history':
        out.mode = 'seed';
        break;
      case '--min-count':
        out.minCount = parseInt(next() || '3', 10);
        break;
      case '--sender':
        out.sender = next();
        break;
      case '--sender-regex':
        out.senderRegex = next();
        break;
      case '--subject-regex':
        out.subjectRegex = next();
        break;
      case '--label':
        out.label = next();
        break;
      default:
        if (a.startsWith('--')) {
          console.error(`classify-rule: unknown flag ${a}`);
          process.exit(2);
        }
    }
  }
  return out;
}

function usage(): void {
  console.error(
    'Usage: classify-rule (--add | --list | --top [N] | --disable ID | --enable ID | --seed-from-history [--min-count N])',
  );
  console.error('Add:  --add (--sender X | --sender-regex X | --subject-regex X) --label MrGru/...');
}

async function validateLabel(label: string): Promise<void> {
  const res = await query<{ label: string }>(
    'SELECT label FROM classification_taxonomy WHERE label = $1 AND enabled = TRUE',
    [label],
  );
  if (res.rowCount === 0) {
    console.error(
      `classify-rule: label "${label}" is not an enabled taxonomy entry`,
    );
    process.exit(2);
  }
}

async function cmdAdd(args: Args): Promise<void> {
  if (!args.label) {
    console.error('classify-rule: --add requires --label');
    process.exit(2);
  }
  await validateLabel(args.label);

  let pattern_type: string;
  let pattern_value: string;
  if (args.sender) {
    pattern_type = 'sender_exact';
    pattern_value = args.sender.toLowerCase();
  } else if (args.senderRegex) {
    pattern_type = 'sender_regex';
    pattern_value = args.senderRegex;
  } else if (args.subjectRegex) {
    pattern_type = 'subject_regex';
    pattern_value = args.subjectRegex;
  } else {
    console.error(
      'classify-rule: --add requires --sender, --sender-regex, or --subject-regex',
    );
    process.exit(2);
    return;
  }

  const res = await query<{ id: number }>(
    `INSERT INTO classification_rules
       (pattern_type, pattern_value, target_label, source)
     VALUES ($1, $2, $3, 'manual')
     ON CONFLICT (pattern_type, pattern_value) DO UPDATE SET
       target_label = EXCLUDED.target_label,
       enabled = TRUE
     RETURNING id`,
    [pattern_type, pattern_value, args.label],
  );
  const id = res.rows[0]?.id;
  console.log(`classify-rule: rule #${id} (${pattern_type}) → ${args.label}`);
  resetRulesCache();
}

async function cmdList(topN: number | null = null): Promise<void> {
  const limitClause = topN ? `LIMIT ${topN}` : '';
  const res = await query<{
    id: number;
    pattern_type: string;
    pattern_value: string;
    target_label: string;
    source: string;
    hit_count: number;
    enabled: boolean;
    last_hit_at: string | null;
  }>(
    `SELECT id, pattern_type, pattern_value, target_label, source,
            hit_count, enabled, last_hit_at
       FROM classification_rules
      ORDER BY hit_count DESC, id ASC
      ${limitClause}`,
  );
  if (res.rowCount === 0) {
    console.log('classify-rule: no rules');
    return;
  }
  console.log(
    `id    hits  en  type           source   pattern → label`,
  );
  for (const r of res.rows) {
    const id = r.id.toString().padStart(4);
    const hits = r.hit_count.toString().padStart(5);
    const en = r.enabled ? ' Y' : ' N';
    const type = r.pattern_type.padEnd(13);
    const source = r.source.padEnd(7);
    const pattern =
      r.pattern_value.length > 40
        ? r.pattern_value.slice(0, 37) + '...'
        : r.pattern_value;
    console.log(
      `${id}  ${hits}  ${en}  ${type}  ${source}  ${pattern} → ${r.target_label}`,
    );
  }
}

async function cmdToggle(id: number, enable: boolean): Promise<void> {
  if (!id) {
    console.error('classify-rule: --disable/--enable requires a numeric ID');
    process.exit(2);
  }
  const res = await query(
    'UPDATE classification_rules SET enabled = $1 WHERE id = $2',
    [enable, id],
  );
  if (res.rowCount === 0) {
    console.error(`classify-rule: no rule with id ${id}`);
    process.exit(1);
  }
  console.log(`classify-rule: rule #${id} → ${enable ? 'enabled' : 'disabled'}`);
  resetRulesCache();
}

async function cmdSeedFromHistory(minCount: number): Promise<void> {
  // Pull sender/label pairs that repeat ≥ minCount times in the history.
  // Only seed senders that land in a SINGLE label (no ambiguity).
  const res = await query<{
    sender_email: string;
    label: string;
    hits: number;
  }>(
    `WITH sender_label_counts AS (
       SELECT LOWER(sender_email) AS sender_email, label, COUNT(*) AS hits
         FROM email_classifications
        WHERE sender_email IS NOT NULL
          AND sender_email <> ''
        GROUP BY LOWER(sender_email), label
     ),
     unambiguous AS (
       SELECT sender_email
         FROM sender_label_counts
        GROUP BY sender_email
       HAVING COUNT(DISTINCT label) = 1
     )
     SELECT c.sender_email, c.label, c.hits::int AS hits
       FROM sender_label_counts c
       JOIN unambiguous u USING (sender_email)
      WHERE c.hits >= $1
      ORDER BY c.hits DESC`,
    [minCount],
  );

  if (res.rowCount === 0) {
    console.log(
      `classify-rule: no sender/label pairs with ≥${minCount} repeats`,
    );
    return;
  }

  console.log(
    `classify-rule: seeding ${res.rowCount} rule${res.rowCount === 1 ? '' : 's'} (min ${minCount} repeats, unambiguous):`,
  );
  let inserted = 0;
  let skipped = 0;
  for (const row of res.rows) {
    // Guard: only insert if taxonomy entry is enabled.
    const labelOk = await query(
      'SELECT 1 FROM classification_taxonomy WHERE label = $1 AND enabled = TRUE',
      [row.label],
    );
    if (labelOk.rowCount === 0) {
      console.log(`  [skip stale label] ${row.sender_email} → ${row.label}`);
      skipped++;
      continue;
    }
    const ins = await query(
      `INSERT INTO classification_rules
         (pattern_type, pattern_value, target_label, source)
       VALUES ('sender_exact', $1, $2, 'seed')
       ON CONFLICT (pattern_type, pattern_value) DO NOTHING
       RETURNING id`,
      [row.sender_email, row.label],
    );
    if ((ins.rowCount ?? 0) > 0) {
      console.log(`  [new] ${row.sender_email} → ${row.label} (${row.hits} historical hits)`);
      inserted++;
    } else {
      console.log(`  [dup] ${row.sender_email} → ${row.label} (already exists)`);
      skipped++;
    }
  }
  console.log(
    `classify-rule: seed done — ${inserted} inserted, ${skipped} skipped`,
  );
  resetRulesCache();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.mode) {
    usage();
    process.exit(2);
  }
  switch (args.mode) {
    case 'add':
      await cmdAdd(args);
      break;
    case 'list':
      await cmdList(null);
      break;
    case 'top':
      await cmdList(args.topN ?? 20);
      break;
    case 'disable':
      await cmdToggle(args.id ?? 0, false);
      break;
    case 'enable':
      await cmdToggle(args.id ?? 0, true);
      break;
    case 'seed':
      await cmdSeedFromHistory(args.minCount ?? 3);
      break;
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('classify-rule failed:', err);
  process.exit(1);
});
