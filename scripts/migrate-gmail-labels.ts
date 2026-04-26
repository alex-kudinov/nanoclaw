#!/usr/bin/env tsx
/**
 * Gmail label migration — rename `class/*` → `MrGru/*` and flip
 * `labelListVisibility` to `labelShowIfUnread` so the labels appear in the
 * sidebar when they have unread mail (and collapse when idle).
 *
 * Idempotent: running twice is a no-op after the first successful run.
 *
 * Usage:
 *   npx tsx scripts/migrate-gmail-labels.ts --dry-run   # preview
 *   npx tsx scripts/migrate-gmail-labels.ts             # apply
 *
 * Must run on Mac Mini (Gmail creds live in NanoClaw/.env there).
 */
import { getGmailClient } from '../src/gmail-auth.js';
import { resetLabelCache } from '../src/gmail-labels.js';

const DRY_RUN = process.argv.includes('--dry-run');

interface PatchPlan {
  id: string;
  oldName: string;
  newName: string;
  needsRename: boolean;
  needsVisibilityFlip: boolean;
  currentVisibility: string | null;
}

function computeNewName(oldName: string): string {
  if (oldName.startsWith('class/')) return 'MrGru/' + oldName.slice(6);
  return oldName;
}

async function main(): Promise<void> {
  const gmail = getGmailClient();
  const res = await gmail.users.labels.list({ userId: 'me' });
  const labels = res.data.labels || [];

  const plans: PatchPlan[] = [];
  for (const l of labels) {
    if (!l.id || !l.name) continue;
    const isClass = l.name.startsWith('class/');
    const isMrGru = l.name.startsWith('MrGru/');
    if (!isClass && !isMrGru) continue;

    // Need the full label object to see current visibility.
    const detail = await gmail.users.labels.get({ userId: 'me', id: l.id });
    const currentVisibility = detail.data.labelListVisibility ?? null;

    const newName = computeNewName(l.name);
    const needsRename = newName !== l.name;
    const needsVisibilityFlip = currentVisibility !== 'labelShowIfUnread';

    if (needsRename || needsVisibilityFlip) {
      plans.push({
        id: l.id,
        oldName: l.name,
        newName,
        needsRename,
        needsVisibilityFlip,
        currentVisibility,
      });
    }
  }

  if (plans.length === 0) {
    console.log('gmail-labels: no changes needed — all labels already migrated');
    return;
  }

  console.log(
    `gmail-labels: ${plans.length} label${plans.length === 1 ? '' : 's'} need${plans.length === 1 ? 's' : ''} migration${DRY_RUN ? ' (DRY RUN)' : ''}:`,
  );
  for (const p of plans) {
    const actions: string[] = [];
    if (p.needsRename) actions.push(`rename → ${p.newName}`);
    if (p.needsVisibilityFlip)
      actions.push(
        `visibility ${p.currentVisibility ?? 'unset'} → labelShowIfUnread`,
      );
    console.log(`  - ${p.oldName}: ${actions.join(', ')}`);
  }

  if (DRY_RUN) {
    console.log('\ngmail-labels: dry run complete — no changes applied');
    return;
  }

  console.log('\ngmail-labels: applying...');
  let renamed = 0;
  let flipped = 0;
  for (const p of plans) {
    const requestBody: { name?: string; labelListVisibility?: string } = {};
    if (p.needsRename) requestBody.name = p.newName;
    if (p.needsVisibilityFlip)
      requestBody.labelListVisibility = 'labelShowIfUnread';
    await gmail.users.labels.patch({
      userId: 'me',
      id: p.id,
      requestBody,
    });
    if (p.needsRename) renamed++;
    if (p.needsVisibilityFlip) flipped++;
    console.log(`  ✓ ${p.oldName}`);
  }
  resetLabelCache();
  console.log(
    `\ngmail-labels: done — ${renamed} renamed, ${flipped} visibility flipped`,
  );
}

main().catch((err) => {
  console.error('gmail-labels migration failed:', err);
  process.exit(1);
});
