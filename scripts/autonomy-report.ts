#!/usr/bin/env npx tsx
/**
 * autonomy-report — historical approval-funnel analysis per inquiry category.
 *
 * Read-only over the messages DB (never touches the live trust ledger).
 * Answers the question the ladder needs answered before any promotion:
 * "what fraction of drafts in category X were approved unchanged?"
 *
 * Historical drafts carry no Category line, so classification is heuristic
 * (autonomy-policy.heuristicCategory) — coarse but consistent.
 *
 * Usage (on the Mini): npx tsx scripts/autonomy-report.ts [groupFolder]
 */
import {
  getAllRegisteredGroups,
  getAutonomyThreadMessagesAfter,
  getBotMessagesSince,
  initDatabase,
} from '../src/db.js';
import { classifyOutcome } from '../src/autonomy-ledger.js';
import {
  heuristicCategory,
  isDraftMessage,
  parseDraftCategory,
  PROMOTE_STREAK,
} from '../src/autonomy-policy.js';

interface Bucket {
  drafts: number;
  approved_clean: number;
  corrected: number;
  superseded: number;
  auto_approved: number;
  open: number;
  streak: number; // current consecutive approved_clean (chronological)
}

function bucket(): Bucket {
  return {
    drafts: 0,
    approved_clean: 0,
    corrected: 0,
    superseded: 0,
    auto_approved: 0,
    open: 0,
    streak: 0,
  };
}

function main(): void {
  initDatabase();
  const groupFolder = process.argv[2] || 'sales';
  const groups = getAllRegisteredGroups();
  const entry = Object.entries(groups).find(
    ([, g]) => (g as { folder: string }).folder === groupFolder,
  );
  if (!entry) {
    console.error(`group "${groupFolder}" not registered`);
    process.exit(1);
  }
  const jid = entry[0];

  const byCat = new Map<string, Bucket>();
  const drafts = getBotMessagesSince(jid, '1970-01-01T00:00:00.000Z').filter(
    (m) => m.content && isDraftMessage(m.content),
  );

  for (const d of drafts) {
    const cat =
      parseDraftCategory(d.content) ?? heuristicCategory(d.content);
    const b = byCat.get(cat) ?? bucket();
    byCat.set(cat, b);
    b.drafts += 1;

    const msgs = getAutonomyThreadMessagesAfter(
      jid,
      d.thread_ts ?? null,
      d.timestamp,
    );
    const res = classifyOutcome(
      {
        draft_id: d.id,
        chat_jid: jid,
        group_folder: groupFolder,
        category: cat,
        outcome: 'pending',
        draft_ts: d.timestamp,
        thread_ts: d.thread_ts ?? null,
        resolved_ts: null,
      },
      msgs,
      Date.now(),
    );
    const outcome = res?.outcome ?? 'open';
    if (outcome === 'approved_clean') {
      b.approved_clean += 1;
      b.streak += 1;
    } else if (outcome === 'corrected') {
      b.corrected += 1;
      b.streak = 0;
    } else if (outcome === 'superseded') b.superseded += 1;
    else if (outcome === 'auto_approved') b.auto_approved += 1;
    else if (outcome === 'open') b.open += 1;
    // 'expired' counted implicitly: drafts - others
  }

  const rows = [...byCat.entries()].sort((a, b) => b[1].drafts - a[1].drafts);
  const pad = (s: string | number, w: number) => String(s).padEnd(w);
  console.log(
    `\nAutonomy funnel — group "${groupFolder}" (${drafts.length} drafts, full history)\n`,
  );
  console.log(
    pad('category', 17) +
      pad('drafts', 8) +
      pad('clean', 7) +
      pad('corr', 6) +
      pad('super', 7) +
      pad('open', 6) +
      pad('rate', 7) +
      pad('streak', 8) +
      'L2-ready?',
  );
  for (const [cat, b] of rows) {
    const decided = b.approved_clean + b.corrected;
    const rate = decided ? Math.round((100 * b.approved_clean) / decided) : 0;
    const ready =
      b.streak >= PROMOTE_STREAK
        ? 'YES (streak)'
        : decided >= 10 && rate >= 90
          ? 'close'
          : '';
    console.log(
      pad(cat, 17) +
        pad(b.drafts, 8) +
        pad(b.approved_clean, 7) +
        pad(b.corrected, 6) +
        pad(b.superseded, 7) +
        pad(b.open, 6) +
        pad(decided ? `${rate}%` : '—', 7) +
        pad(b.streak, 8) +
        ready,
    );
  }
  console.log(
    `\nrate = approved-unchanged / (approved-unchanged + corrected). ` +
      `Promotion threshold: ${PROMOTE_STREAK} consecutive clean approvals ` +
      `(guarded categories pricing/payment-issue never promote).\n`,
  );
}

main();
