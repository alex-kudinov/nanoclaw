#!/usr/bin/env tsx
/**
 * Back-apply auto_archive to historical email_classifications rows.
 *
 * For every row whose label has `auto_archive=true` in classification_taxonomy,
 * remove the `INBOX` label from the Gmail thread. Idempotent — threads that
 * have already been archived are a no-op (Gmail just reports success).
 *
 * Usage:
 *   npx tsx scripts/backfill-auto-archive.ts --dry-run   # preview counts per label
 *   npx tsx scripts/backfill-auto-archive.ts             # apply
 *
 * Must run on Mac Mini (Gmail creds + business DB access live there).
 */
import { query } from '../src/business-db.js';
import { removeLabelsFromThread } from '../src/gmail-labels.js';

const DRY_RUN = process.argv.includes('--dry-run');

interface Row {
  gmail_thread_id: string;
  label: string;
}

async function main(): Promise<void> {
  const res = await query<Row>(
    `SELECT DISTINCT ec.gmail_thread_id, ec.label
       FROM email_classifications ec
       JOIN classification_taxonomy t ON t.label = ec.label
      WHERE t.auto_archive = TRUE`,
  );
  const rows = res.rows;

  if (rows.length === 0) {
    console.log('backfill-auto-archive: no rows match — nothing to do');
    return;
  }

  // Group by label for the preview.
  const byLabel = new Map<string, number>();
  for (const r of rows) byLabel.set(r.label, (byLabel.get(r.label) ?? 0) + 1);

  console.log(
    `backfill-auto-archive: ${rows.length} thread${rows.length === 1 ? '' : 's'} across ${byLabel.size} label${byLabel.size === 1 ? '' : 's'}${DRY_RUN ? ' (DRY RUN)' : ''}:`,
  );
  for (const [label, count] of [...byLabel.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${count.toString().padStart(4)}  ${label}`);
  }

  if (DRY_RUN) {
    console.log('\nbackfill-auto-archive: dry run complete — no changes applied');
    return;
  }

  console.log('\nbackfill-auto-archive: removing INBOX label...');
  let ok = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      await removeLabelsFromThread(r.gmail_thread_id, ['INBOX']);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${r.gmail_thread_id} (${r.label}):`, err);
      failed++;
    }
  }
  console.log(`\nbackfill-auto-archive: done — ${ok} archived, ${failed} failed`);
}

main().catch((err) => {
  console.error('backfill-auto-archive failed:', err);
  process.exit(1);
});
