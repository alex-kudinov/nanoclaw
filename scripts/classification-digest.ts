#!/usr/bin/env tsx
/**
 * Daily classification digest — summarizes rule-classified emails from the
 * last 24h and posts to the chief Slack channel. Replaces per-email LLM
 * processing for known senders with a single batch summary.
 *
 * Usage:
 *   npx tsx scripts/classification-digest.ts
 *   npx tsx scripts/classification-digest.ts --hours 48   # custom window
 *   npx tsx scripts/classification-digest.ts --dry-run    # print, don't post
 *
 * Registered as a host job in data/jobs.json (daily at 7:15am CT).
 */

import { query } from '../src/business-db.js';

interface DigestRow {
  label: string;
  sender_email: string;
  subject: string;
  classifier_version: string;
  classified_at: string;
  auto_archive: boolean;
}

interface ProbationRow {
  id: number;
  pattern_value: string;
  target_label: string;
  hit_count: number;
  probation_until: string;
  created_at: string;
}

interface Args {
  hours: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { hours: 24, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--hours':
        out.hours = parseInt(argv[++i] || '24', 10);
        break;
      case '--dry-run':
        out.dryRun = true;
        break;
    }
  }
  return out;
}

function formatDigest(rows: DigestRow[], hours: number): string {
  if (rows.length === 0) {
    return `[CLASSIFICATION DIGEST] No emails classified in the last ${hours}h.`;
  }

  // Group by label
  const byLabel = new Map<string, DigestRow[]>();
  for (const r of rows) {
    const list = byLabel.get(r.label) || [];
    list.push(r);
    byLabel.set(r.label, list);
  }

  const ruleCount = rows.filter(
    (r) => r.classifier_version === 'rules-runner-v1',
  ).length;
  const llmCount = rows.length - ruleCount;

  const lines: string[] = [
    `[CLASSIFICATION DIGEST] ${rows.length} emails classified in the last ${hours}h (${ruleCount} by rules, ${llmCount} by LLM)`,
    '',
  ];

  // Sort labels by count descending
  const sorted = [...byLabel.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );

  for (const [label, items] of sorted) {
    const archived = items[0].auto_archive ? ' [auto-archived]' : '';
    lines.push(`${label} (${items.length})${archived}`);

    // Group by sender within label
    const bySender = new Map<string, DigestRow[]>();
    for (const item of items) {
      const sender = item.sender_email || 'unknown';
      const list = bySender.get(sender) || [];
      list.push(item);
      bySender.set(sender, list);
    }

    for (const [sender, senderItems] of bySender) {
      if (senderItems.length === 1) {
        lines.push(`  ${sender}: ${senderItems[0].subject || '(no subject)'}`);
      } else {
        lines.push(`  ${sender}: ${senderItems.length} emails`);
        // Show first 3 subjects
        for (const item of senderItems.slice(0, 3)) {
          lines.push(`    - ${item.subject || '(no subject)'}`);
        }
        if (senderItems.length > 3) {
          lines.push(`    ... and ${senderItems.length - 3} more`);
        }
      }
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function formatProbation(rows: ProbationRow[]): string {
  if (rows.length === 0) return '';

  const now = Date.now();
  const lines: string[] = ['', '[PROBATIONARY RULES]'];

  for (const r of rows) {
    const daysLeft = Math.ceil(
      (new Date(r.probation_until).getTime() - now) / 86_400_000,
    );
    lines.push(
      `  #${r.id}  ${r.pattern_value} → ${r.target_label}  (${r.hit_count} hits, ${daysLeft}d remaining)`,
    );
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const res = await query<DigestRow>(
    `SELECT ec.label, ec.sender_email, ec.subject,
            ec.classifier_version, ec.classified_at::text,
            COALESCE(ct.auto_archive, false) AS auto_archive
       FROM email_classifications ec
       LEFT JOIN classification_taxonomy ct ON ct.label = ec.label
      WHERE ec.classified_at > NOW() - INTERVAL '${args.hours} hours'
      ORDER BY ec.label, ec.sender_email, ec.classified_at`,
  );

  const probRes = await query<ProbationRow>(
    `SELECT id, pattern_value, target_label, hit_count,
            probation_until::text, created_at::text
       FROM classification_rules
      WHERE probation_until > NOW()
      ORDER BY probation_until`,
  );

  const digest = formatDigest(res.rows, args.hours) +
    formatProbation(probRes.rows);

  if (args.dryRun) {
    console.log(digest);
  } else {
    // Write to stdout — the job runner captures output and the job reporter
    // posts it to the configured report channel (chief).
    console.log(digest);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('classification-digest failed:', err);
  process.exit(1);
});
