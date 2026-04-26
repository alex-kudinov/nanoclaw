#!/usr/bin/env tsx
/**
 * Operator CLI for the email classification pipeline.
 *
 * Usage:
 *   email-ops classify list [--since DATE] [--label LABEL]
 *   email-ops classify show MSG_ID
 *   email-ops classify unclassified [--since DATE] [--limit N]
 *   email-ops rules list | hits | probation | for-sender | add | disable | enable | retarget
 *   email-ops filter list | add | disable | enable | stats
 *   email-ops correct MSG_ID [--label LABEL] [--route GROUP] [--backfill]
 */

const subcommand = process.argv[2];

function showUsage(): void {
  console.error(`email-ops — operator CLI for the email classification pipeline

Subcommands:
  classify   Query and inspect email classifications
  rules      Manage classification_rules (pre-LLM rule runner)
  filter     Manage hard-filters.json (host-level drop rules)
  correct    Override a classification, re-route, or trigger backfill

Usage:
  npx tsx scripts/email-ops.ts <subcommand> <action> [flags]
  npx tsx scripts/email-ops.ts classify list --since 2026-04-01
  npx tsx scripts/email-ops.ts rules hits --top 10
  npx tsx scripts/email-ops.ts filter add --type sender_exact --value spam@x.com --reason "spam"
  npx tsx scripts/email-ops.ts correct MSG_ID --label MrGru/sales/lead --backfill`);
}

if (!subcommand || subcommand === '--help' || subcommand === '-h') {
  showUsage();
  process.exit(subcommand ? 0 : 1);
}

switch (subcommand) {
  case 'classify':
    await import('./email-ops-classify.js');
    break;
  case 'rules':
    await import('./email-ops-rules.js');
    break;
  case 'filter':
    await import('./email-ops-filters.js');
    break;
  case 'correct':
    await import('./email-ops-correct.js');
    break;
  default:
    console.error(`email-ops: unknown subcommand "${subcommand}"`);
    showUsage();
    process.exit(1);
}
