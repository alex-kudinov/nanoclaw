#!/usr/bin/env tsx
/**
 * Backfill the last N days of email through the rules runner + host-router.
 * Matched → classification + Gmail label + Gate 3 routing.
 * Unmatched → prints reprocess commands (or routes live with --with-llm).
 *
 * Usage:
 *   npx tsx scripts/backfill-week.ts                # 7 days, rules only
 *   npx tsx scripts/backfill-week.ts --days 14      # 14 days
 *   npx tsx scripts/backfill-week.ts --dry-run      # report only, no writes
 *   npx tsx scripts/backfill-week.ts --seed         # seed rules from history after
 *   npx tsx scripts/backfill-week.ts --with-llm     # route unmatched to LLM pipeline
 */

import { getGmailClient } from '../src/gmail-auth.js';
import { parseEmailHeaders, parseEmailBody } from '../src/gmail-parser.js';
import {
  matchRule,
  extractSenderEmail,
  recordRuleHit,
  resetRulesCache,
} from '../src/classify-rules-runner.js';
import { handleClassifyLabelWrite, isAutoArchiveLabel } from '../src/classify-ipc-handlers.js';
import { routeClassifiedEmail, type RouteParams } from '../src/host-router.js';
import { query } from '../src/business-db.js';

interface Args {
  days: number;
  dryRun: boolean;
  seed: boolean;
  withLlm: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { days: 7, dryRun: false, seed: false, withLlm: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--days':
        out.days = parseInt(argv[++i] || '7', 10);
        break;
      case '--dry-run':
        out.dryRun = true;
        break;
      case '--seed':
        out.seed = true;
        break;
      case '--with-llm':
        out.withLlm = true;
        break;
    }
  }
  return out;
}

type GmailClient = ReturnType<typeof getGmailClient>;

async function getClassifiedIds(): Promise<Set<string>> {
  const res = await query<{ gmail_message_id: string }>('SELECT gmail_message_id FROM email_classifications');
  return new Set(res.rows.map((r) => r.gmail_message_id));
}

async function listRecentMessages(gmail: GmailClient, days: number): Promise<string[]> {
  const after = Math.floor(Date.now() / 1000) - days * 86400;
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 50; page++) {
    const res = await gmail.users.messages.list({
      userId: 'me', q: `after:${after} -in:sent -in:draft -in:spam -in:trash`, maxResults: 500, pageToken,
    });
    for (const m of res.data.messages || []) if (m.id) ids.push(m.id);
    pageToken = res.data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }
  return ids;
}

async function routeIfNeeded(label: string, input: Omit<RouteParams, 'label'>): Promise<void> {
  if (await isAutoArchiveLabel(label)) return;
  const result = await routeClassifiedEmail({ label, ...input });
  if (result.action === 'unhandled') return; // no fallback to mailman during backfill
  if (result.action === 'error') {
    console.error(`  route error for ${input.messageId}: ${result.reason}`);
  }
}

async function seedFromHistory(): Promise<void> {
  const sql = `
    WITH lc AS (
      SELECT LOWER(sender_email) AS se, label, COUNT(*) AS n
        FROM email_classifications WHERE sender_email IS NOT NULL AND sender_email<>''
       GROUP BY LOWER(sender_email), label
    ), uniq AS (SELECT se FROM lc GROUP BY se HAVING COUNT(DISTINCT label)=1)
    SELECT lc.se AS sender_email, lc.label FROM lc JOIN uniq ON lc.se=uniq.se`;
  const seedRes = await query<{ sender_email: string; label: string }>(sql);
  let seeded = 0;
  for (const row of seedRes.rows) {
    const ins = await query(
      `INSERT INTO classification_rules (pattern_type,pattern_value,target_label,source)
       VALUES ('sender_exact',$1,$2,'seed') ON CONFLICT (pattern_type,pattern_value) DO NOTHING RETURNING id`,
      [row.sender_email, row.label],
    );
    if ((ins.rowCount ?? 0) > 0) seeded++;
  }
  console.log(`Seeded ${seeded} new rules from classification history`);
  resetRulesCache();
}

async function processOneMessage(gmail: GmailClient, msgId: string, dryRun: boolean): Promise<'matched' | 'unmatched' | 'error'> {
  try {
    const res = await gmail.users.messages.get({ userId: 'me', id: msgId, format: 'full' });
    const msg = res.data;
    if (!msg.payload || !msg.id) return 'error';

    const rawHeaders = msg.payload.headers || [];
    const headers = parseEmailHeaders(rawHeaders);
    const senderEmail = extractSenderEmail(headers.from);
    const headerMap: Record<string, string> = {};
    for (const h of rawHeaders) if (h.name && h.value) headerMap[h.name.toLowerCase()] = h.value;

    const rule = await matchRule({ sender_email: senderEmail, subject: headers.subject || null, headers: headerMap });
    if (!rule) return 'unmatched';
    if (dryRun) return 'matched';

    const threadId = msg.threadId || msg.id;
    await handleClassifyLabelWrite({
      type: 'classify_label_write', gmail_message_id: msg.id, gmail_thread_id: threadId,
      sender_email: senderEmail, subject: headers.subject || null, label: rule.target_label,
      confidence: 0.95, classifier_version: 'rules-runner-v1',
      reasoning: `Backfill: matched rule #${rule.rule_id} (${rule.pattern_type}: ${rule.pattern_value})`,
    });
    await recordRuleHit(rule.rule_id);
    await routeIfNeeded(rule.target_label, {
      senderEmail, senderName: headers.fromName || '', subject: headers.subject || '',
      body: parseEmailBody(msg.payload), threadId, messageId: msg.id,
    });
    return 'matched';
  } catch (err) {
    console.error(`  error on ${msgId}: ${err}`);
    return 'error';
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const gmail = getGmailClient();

  console.log(`Backfill: fetching messages from last ${args.days} days...`);
  const messageIds = await listRecentMessages(gmail, args.days);
  console.log(`Backfill: ${messageIds.length} messages found`);

  const classified = await getClassifiedIds();
  const unclassified = messageIds.filter((id) => !classified.has(id));
  console.log(
    `Backfill: ${classified.size} already classified, ${unclassified.length} to process`,
  );

  const stats = { ruleMatched: 0, needsLlm: 0, errors: 0 };
  const needsLlmList: string[] = [];

  for (let i = 0; i < unclassified.length; i++) {
    const result = await processOneMessage(gmail, unclassified[i], args.dryRun);
    if (result === 'matched') {
      stats.ruleMatched++;
      if ((i + 1) % 25 === 0) console.log(`  progress: ${i + 1}/${unclassified.length}`);
    } else if (result === 'unmatched') {
      stats.needsLlm++;
      needsLlmList.push(unclassified[i]);
    } else {
      stats.errors++;
    }
  }

  console.log('\n--- Backfill Results ---');
  console.log(`Rule-classified: ${stats.ruleMatched}`);
  console.log(`Needs LLM:       ${stats.needsLlm}`);
  console.log(`Errors:          ${stats.errors}`);
  console.log(`Dry run:         ${args.dryRun}`);

  if (needsLlmList.length > 0 && !args.withLlm) {
    console.log('\n--- Reprocess commands (pass --with-llm to route live) ---');
    for (const id of needsLlmList) console.log(`  npx tsx scripts/reprocess-email.ts ${id}`);
  }

  if (args.seed && !args.dryRun) {
    console.log('\n--- Running seed-from-history (min-count 1) ---');
    await seedFromHistory();
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('backfill-week failed:', err);
  process.exit(1);
});
